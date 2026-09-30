/* ============================================================================
   Backend: Supabase, Google y correo
   ----------------------------------------------------------------------------
   La app no cambia de teoría: sigue siendo la misma capa de datos en memoria
   con las mismas llamadas. Lo único que cambia es quién guarda y de dónde se
   lee.

     ANTES                       AHORA
     -------------------------    ------------------------------------------
     DB.load() -> localStorage   DB.load() -> memoria
     DB.save() -> localStorage   DB.save() -> memoria + localStorage
                                   + sincronización con Supabase

   La sincronización es DIFERENCIAL: en cada guardado se compara lo que hay en
   memoria con lo que el servidor da por bueno y solo se sube lo que ha
   cambiado. Por eso cuesta lo mismo pasar lista de asistencia que abrir la
   aplicación.

   Si js/config.js no existe, Backend.activo es false y todo sigue igual que
   antes: localStorage y punto. Eso es lo que permite publicar esta versión sin
   haber configurado todavía el servidor.

   El paquete de Supabase se carga solo cuando hace falta, para que la versión
   sin servidor no dependa de la red en ningún momento.
   ============================================================================ */

/* Versión fijada a propósito. Con `@2` la app se descargaría una versión
   distinta cada día, y un cambio upstream rompería la app ya desplegada sin
   que nadie haya tocado nada. Se cambia aquí y con pruebas, no por sorpresa. */
const SUPABASE_VERSION = '2.117.2';
const SUPABASE_CDN =
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@' + SUPABASE_VERSION +
  '/dist/umd/supabase.js';

const Backend = {
  cfg: (typeof window !== 'undefined' && window.RCC_CONFIG) || {},
  activo: false,
  sb: null,
  uid: null,
  clubId: null,
  estado: 'apagado',   // apagado | arrancando | listo | error
  ultimoError: null,
  pendientes: false,

  /* =======================================================================
     MAPA DE COLECCIONES
     =======================================================================
     Traduce cada colección de js/store.js a su tabla. Es lo único que hay
     que tocar para añadir una tabla nueva.

       tabla  nombre en PostgreSQL
       pk     columna que identifica la fila (por defecto, `id`)
       clave  inventa la clave primaria en las colecciones que en la app no
              la tienen (las tablas puente y el historial de temporadas)
       col    renombra campos cuyo nombre es palabra reservada en SQL
       quita  campos que solo existen en localStorage (el hash de contraseña,
              que ahora lo guarda Supabase Auth)
       num    columnas numéricas: aquí sí se convierte '' en null, porque
              PostgreSQL rechaza el lote entero si un solo número viene mal
       sinId  la colección es un único objeto, no una lista
     ======================================================================= */
  mapa: {
    club:         { tabla:'clubs',          sinId:true },
    season:       { tabla:'seasons' },
    users:        { tabla:'profiles',       quita:['hash'] },
    members:      { tabla:'club_members',
                    clave: r => [r.club_id, r.user_id, r.rol].join(':') },
    invites:      { tabla:'invites',        pk:'code' },
    categories:   { tabla:'categories',     num:['orden'] },
    teams:        { tabla:'teams' },
    staff:        { tabla:'staff' },
    players:      { tabla:'players',        num:['peso','altura'] },
    guardians:    { tabla:'guardians' },
    links:        { tabla:'guardian_links',
                    clave: r => r.player_id + ':' + r.guardian_id },
    enrollments:  { tabla:'enrollments' },
    certs:        { tabla:'certs' },
    events:       { tabla:'events' },
    rsvp:         { tabla:'rsvp',           num:['recordatorios'] },
    callups:      { tabla:'callups' },
    attendance:   { tabla:'attendance' },
    matches:      { tabla:'matches',
                    num:['formacion','parte','minuto','puntos_favor',
                         'puntos_contra','duracion_parte','arrancado'] },
    drills:       { tabla:'drills',         col:{ desc:'descripcion' },
                    num:['min'] },
    sessions:     { tabla:'sessions' },
    sessionDrills:{ tabla:'session_drills', num:['orden'] },
    pruebas:      { tabla:'pruebas',        num:['orden'] },
    evaluations:  { tabla:'evaluations',
                    num:['tecnica','fisico','tactica','actitud'] },
    notes:        { tabla:'notes' },
    injuries:     { tabla:'injuries' },
    goals:        { tabla:'goals' },
    posts:        { tabla:'posts' },
    reads:        { tabla:'post_reads',
                    clave: r => r.post_id + ':' + r.user_id },
    tasks:        { tabla:'tasks' },
    notifs:       { tabla:'notifications' },
    docs:         { tabla:'documents' },
    signatures:   { tabla:'signatures' },
    historico:    { tabla:'season_history',
                    clave: r => r.temporada + ':' + r.cerrada,
                    num:['jugadores','partidos'],
                    /* Sin esto el lote entero lo rechaza PostgREST con PGRST204
                       ("columna no encontrada") y `pendientes` se queda a true
                       para siempre: el cierre de temporada nunca llega al
                       servidor. La columna la crea la migracion 006.
                       OJO: aqui no se puede poner un nombre que sea igual en
                       los dos lados: aFila() hace `f[a]=f[de]; delete f[de]` y
                       con origen y destino iguales borraria el campo. */
                    col:{ porJugador:'por_jugador' } },
    audit:        { tabla:'audit_log',
                    /* La columna se llama user_id. Mandando `user` fallaba el
                       lote entero de bitacora con PGRST204. */
                    col:{ user:'user_id' } }
  },

  /* Tablas legibles sin iniciar sesión: son lo que se muestra en la pantalla
     de acceso antes de que nadie haya entrado (nombre del club y categorías).
     OJO: esto NO significa "sin filtro de club". `seasons`, `categories`,
     `teams` y `documents` todas tienen club_id, y leerlas sin filtrar traía
     los datos de todos los clubes del proyecto y hacía que d.season se quedara
     con la temporada activa de otro club. Lo único que no se puede filtrar por
     club es `clubs`, porque no tiene esa columna: ver `sinClub`. */
  publicas: ['clubs','seasons','categories','teams','documents'],
  sinClub: ['clubs'],

  base: {},          // última copia que el servidor ha confirmado
  pendientes: false,
  enSilencio: false,
  temporizador: null,
  oyentes: [],

  /* =======================================================================
     ARRANQUE
     ======================================================================= */

  configurado(){
    const c = this.cfg || {};
    return !!(c.supabaseUrl && c.supabaseAnonKey && c.syncEnabled !== false);
  },

  alCambiar(f){ this.oyentes.push(f); },
  aviso(){ this.oyentes.forEach(f => { try{ f(this); }catch(e){} }); },

  async iniciar(){
    if(!this.configurado()){ this.estado = 'apagado'; return false; }
    this.estado = 'arrancando';
    try{
      await this.cargarPaquete();
      this.sb = window.supabase.createClient(this.cfg.supabaseUrl, this.cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Tras el salto de Google la sesión vuelve en el fragmento de la URL.
          // Supabase la recoge y borra el rastro.
          detectSessionInUrl: true
        },
        global: { headers: { 'x-application-name': 'rccornella' } }
      });
      this.activo = true;

      const { data } = await this.sb.auth.getSession();
      this.uid = data?.session?.user?.id || null;

      await this.hidratar();
      this.estado = 'listo';
      this.aviso();
      return true;
    }catch(e){
      this.activo = false;
      this.estado = 'error';
      this.ultimoError = e && e.message;
      console.warn('[backend] no se pudo arrancar:', e && e.message);
      return false;
    }
  },

  cargarPaquete(){
    if(typeof window !== 'undefined' && window.supabase) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SUPABASE_CDN;
      s.async = true;
      s.onload = res;
      s.onerror = () => rej(new Error('No se pudo cargar supabase-js'));
      document.head.appendChild(s);
    });
  },

  /* =======================================================================
     HIDRATAR: bajar del servidor a la memoria
     ======================================================================= */

  async hidratar(){
    if(!this.activo || !DB) return;
    this.enSilencio = true;
    /* Si alguna lectura falla, no se fija la linea base: marcarla con una
       hidratacion a medias haria que el proximo volcar creyera que el servidor
       esta vacio y borrara filas que si existen. */
    let completo = true;
    try{
      const d = DB.d || (DB.d = Object.assign(EMPTY(), DB.d || {}));

      /* Hay cambios locales sin subir (se edito sin cobertura y se cerro la
         app). Primero se intenta subir: si funciona, el servidor ya tiene todo
         y despues si se puede sustituir la memoria por lo suyo. */
      if(d.__sucio && this.uid){
        this.enSilencio = false;
        await this.volcar();
        this.enSilencio = true;
      }
      const sucio = !!d.__sucio;

      /* Si sigue sin poder subir, NO se pisa lo que hay en el dispositivo: se
         fusiona lo del servidor con lo local. Pierde como mucho un borrado hecho
         sin cobertura (el servidor lo devuelve), pero nunca una edicion. */
      const fundir = sucio;
      const claveDe = (coll, obj) => {
        const f = this.aFila(coll, obj, d.club ? d.club.id : null);
        if(!f) return String(obj && obj.id);
        const cfg = this.mapa[coll] || {};
        return String(f[cfg.pk || 'id']);
      };
      const meter = (coll, filas) => {
        if(!fundir){ d[coll] = filas; return; }
        const previos = Array.isArray(d[coll]) ? d[coll] : [];
        const vistos = new Set();
        filas.forEach(o => { try{ vistos.add(claveDe(coll, o)); }catch(e){} });
        d[coll] = filas.concat(previos.filter(o => !vistos.has(claveDe(coll, o))));
      };

      // El club primero: sin él no se sabe a qué club preguntar.
      completo = await this.bajar('clubs', filas => {
        d.club = filas[0] ? this.desdeFila('club', filas[0]) : null;
      }) && completo;
      this.clubId = d.club ? d.club.id : null;

      completo = await this.bajar('seasons',    filas => { d.season = filas.find(f => f.activa) || null; }) && completo;
      completo = await this.bajar('categories', filas => meter('categories', filas)) && completo;
      completo = await this.bajar('teams',      filas => meter('teams', filas)) && completo;
      completo = await this.bajar('documents',  filas => meter('docs', filas)) && completo;

      if(this.uid && this.clubId){
        // Todo lo demás, ya con sesión. Las políticas RLS deciden qué llega,
        // así que cada persona recibe exactamente lo que le corresponde.
        const orden = ['users','members','staff','guardians','links','players',
                       'enrollments','certs','events','rsvp','callups',
                       'attendance','matches','drills','sessions','sessionDrills',
                       'pruebas','evaluations','notes','injuries','goals','posts',
                       'reads','tasks','notifs','signatures',
                       'historico','audit','invites'];
        for(const coll of orden){
          const ok = await this.bajar(this.mapa[coll].tabla, filas => meter(coll, filas));
          if(!ok) completo = false;
        }
      }

      this.clubId = d.club ? d.club.id : null;
      if(completo && !fundir){
        this.base = this.instantanea();
      }else{
        /* La base anterior se deja como estaba: es la ultima foto que se sabe
           correcta, y con `fundir` ademas contiene filas que aun NO estan en el
           servidor. Fijarla aqui haria que el proximo volcar las diera por
           buenas y no las subiera nunca. */
        this.hidratacionIncompleta = true;
      }
      DB.guardar();
    }finally{
      this.enSilencio = false;
    }
  },

  /* Devuelve true si la lectura fue completa. `aplicar([])` en caso de error no
     es cosmetico: si no, la coleccion se queda con los datos de la cuenta
     anterior y ademas se marcan como confirmados por el servidor. */
  async bajar(tabla, aplicar){
    let q = this.sb.from(tabla).select('*');
    /* El filtro va siempre que conozcamos el club, tambien para las tablas
       "publicas": ser legible sin sesion no puede significar traerse los datos
       de los demas clubes. */
    if(this.clubId && !this.sinClub.includes(tabla)) q = q.eq('club_id', this.clubId);
    const { data, error } = await q.limit(5000);
    if(error){
      console.warn('[backend] no se pudo leer ' + tabla + ': ' + error.message);
      aplicar([]);
      return false;
    }
    aplicar(this.desdeFilas(tabla, data || []));
    return true;
  },

  /* Fila de PostgreSQL -> objeto de la app. */
  desdeFila(coll, fila){
    const cfg = this.mapa[coll] || {};
    const o = { ...fila };
    delete o.club_id;
    delete o.updated_at;
    // El renombrado va al revés que en aFila: aquí la base de datos usa
    // `descripcion` y la app usa `desc`. Con el sentido equivocado el texto se
    // perdía al bajar y las notas de los ejercicios desaparecían.
    if(cfg.col) for(const [de, a] of Object.entries(cfg.col)){ o[de] = o[a]; delete o[a]; }
    return o;
  },

  desdeFilas(tabla, filas){
    const coll = Object.keys(this.mapa).find(k => this.mapa[k].tabla === tabla);
    return filas.map(f => this.desdeFila(coll, f));
  },

  /* =======================================================================
     VOLCAR: subir de la memoria al servidor
     ======================================================================= */

  marcar(){
    if(!this.activo || !this.sb || this.enSilencio) return;
    this.pendientes = true;
    /* Se apunta en los datos locales, no solo en memoria: si la persona
       edita sin cobertura y cierra la app, al volver a abrirla hay que saber
       que lo que hay en el dispositivo todavia no esta en el servidor. */
    if(DB && DB.d && !DB.d.__sucio){ DB.d.__sucio = true; DB.guardar(); }
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.volcar(), this.cfg.syncDebounceMs || 1500);
  },

  async volcar(){
    if(!this.activo) return;
    clearTimeout(this.temporizador);

    // Sin sesión no se sube nada: el trabajo se queda en el dispositivo y
    // subirá en cuanto haya sesión.
    const { data } = await this.sb.auth.getSession();
    if(!data?.session){ this.pendientes = true; return; }
    this.uid = data.session.user.id;

    const d = DB.d;
    if(!d) return;

    const clubId = d.club ? d.club.id : null;
    const nueva = this.instantanea();
    const problemas = [];

    for(const [coll, cfg] of Object.entries(this.mapa)){
      if(!clubId && !this.publicas.includes(cfg.tabla)) continue;

      const antes = this.base[coll] || {};
      const ahora = nueva[coll];

      const bajas    = Object.keys(antes).filter(k => !(k in ahora));
      const cambios  = Object.keys(ahora).filter(k => !(k in antes) || antes[k].firma !== ahora[k].firma);
      if(!bajas.length && !cambios.length) continue;

      try{
        if(bajas.length){
          const { error } = await this.sb.from(cfg.tabla).delete().in(cfg.pk || 'id', bajas);
          if(error) throw error;
        }
        if(cambios.length){
          const filas = cambios.map(k => ahora[k].fila).filter(Boolean);
          if(filas.length){
            const { error } = await this.sb.from(cfg.tabla).upsert(filas, { onConflict: cfg.pk || 'id' });
            if(error) throw error;
          }
        }
        // Solo se da por buena la colección si ha subido entera. Si falla,
        // se conserva la base anterior y se reintentará en el siguiente
        // guardado: no se pierde nada.
        this.base[coll] = ahora;
      }catch(e){
        problemas.push(coll + ': ' + (e.message || e));
      }
    }

this.pendientes = problemas.length > 0;
    /* El indicador local se baja solo cuando TODAS las colecciones han subido.
       Si queda alguna pendiente, se mantiene para que la proxima hidratacion
       sepa que no puede pisar la memoria con lo del servidor. */
    if(!this.pendientes && DB && DB.d && DB.d.__sucio){ DB.d.__sucio = false; DB.guardar(); }
    this.estado = problemas.length ? 'error' : 'listo';
    this.ultimoError = problemas ? problemas.join(' · ') : null;
    this.aviso();
  },

  /* Objeto de la app -> fila lista para enviar. */
  aFila(coll, obj, clubId){
    const cfg = this.mapa[coll];
    if(!cfg) return null;

    const f = { ...obj };
    delete f.updated_at;

    if(cfg.quita) cfg.quita.forEach(k => { delete f[k]; });
    if(cfg.col) for(const [de, a] of Object.entries(cfg.col)){ f[a] = f[de]; delete f[de]; }

    const pk = cfg.pk || 'id';
    // `invites` se identifica por `code` en las dos bases: el `id` que la app
    // no usa no puede viajar a una tabla que no lo tiene. Se borra DESPUÉS de
    // leer la clave, que en esas tablas no es `id`.
    const propia = f[pk];
    if(cfg.pk && cfg.pk !== 'id') delete f.id;

    f[pk] = cfg.clave ? cfg.clave(f) : (propia != null ? String(propia) : null);
    if(f[pk] == null) return null;

    if(!cfg.sinId) f.club_id = clubId;

    // Las columnas numéricas son el único punto donde ''rompe un lote entero:
    // PostgreSQL aborta el upsert completo, no solo la fila.
    if(cfg.num) cfg.num.forEach(k => {
      if(f[k] === '' || (typeof f[k] === 'number' && !isFinite(f[k]))) f[k] = null;
    });

    for(const k of Object.keys(f)) if(f[k] === undefined) delete f[k];
    return f;
  },

  /* Firma de una fila: si no cambia, no se manda. */
  firma(fila){
    const claves = Object.keys(fila).sort();
    return JSON.stringify(claves.map(k => [k, fila[k]]));
  },

  instantanea(){
    const d = DB.d || {};
    const clubId = d.club ? d.club.id : null;
    const out = {};
    for(const [coll, cfg] of Object.entries(this.mapa)){
      const fuente = cfg.sinId ? (d[coll] ? [d[coll]] : [])
                               : (Array.isArray(d[coll]) ? d[coll] : []);
      const mapa = {};
      for(const obj of fuente){
        const fila = this.aFila(coll, obj, clubId);
        if(!fila) continue;
        mapa[fila[cfg.pk || 'id']] = { firma: this.firma(fila), fila };
      }
      out[coll] = mapa;
    }
    return out;
  },

  /* =======================================================================
     IDENTIDAD
     ======================================================================= */

  async registrar({ email, password, nombre, tel }){
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: { data: { nombre, tel } }
    });
    if(error) throw this.traducir(error);
    if(!data.session){
      // Project configured to confirm the email address.
      return { uid: null, pendiente: true };
    }
    this.uid = data.user.id;
    return { uid: this.uid, pendiente: false };
  },

  async entrarConPassword(email, password){
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if(error) throw this.mensajeDeAcceso(error);
    this.uid = data.user.id;
    await this.hidratar();
    return { uid: this.uid, roles: this.rolesLocales() };
  },

  async entrarConGoogle(){
    if(!this.cfg.googleClientId)
      throw new Error('Falta googleClientId en js/config.js');
    const { error } = await this.sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname,
        scopes: 'email profile',
        queryParams: { prompt: 'select_account' }
      }
    });
    if(error) throw this.traducir(error);
    // signInWithOAuth redirige al proveedor: aquí no se sigue.
  },

  /* Cerrar sesion es solo cerrar sesion. No se toca la copia local del club:
     en modo nube obligaba a re-sincronizar todo y se perdia lo pendiente,
     y en modo local (sin nube a la que volver) era perdida de datos.
     Para borrar el club de verdad esta DB.wipe(). */
  async salir(){
    /* Se sube lo pendiente ANTES de tirar el estado. Si no, el debounce de 1,5 s
       se descarta con clearTimeout y el trabajo de los ultimos segundos se
       pierde sin avisar, justo lo que la UI promete al decir "Lo que tengas
       pendiente de subir, se subira antes de salir". */
    if(this.activo && this.sb && this.pendientes){
      clearTimeout(this.temporizador);
      try{
        await Promise.race([
          this.volcar(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
        ]);
      }catch(e){ /* sin red no hay nada que hacer: se queda en el dispositivo */ }
    }
    this.uid = null;
    this.clubId = null;
    this.base = {};
    this.pendientes = false;
    clearTimeout(this.temporizador);
    if(this.sb) { try{ await this.sb.auth.signOut(); }catch(e){} }
  },

  async recuperarPassword(email){
    if(!this.activo) return;
    await this.sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
  },

  async cambiarPassword(nueva){
    const { error } = await this.sb.auth.updateUser({ password: nueva });
    if(error) throw this.traducir(error);
  },

  async usuarioActual(){
    if(!this.activo) return null;
    const { data } = await this.sb.auth.getUser();
    return data?.user || null;
  },

  /* Los mensajes de Supabase están en inglés. Una familia no entiende
     "Invalid login credentials"; sí entiende "el email no es correcto". */
  mensajeDeAcceso(e){
    const m = (e && e.message) || '';
    if(/invalid login credentials/i.test(m))
      return new Error('El email o la contraseña no son correctos');
    return this.traducir(e);
  },
  traducir(e){
    const m = (e && e.message) || '';
    if(/already registered|already been registered|already exists/i.test(m))
      return new Error('Ya existe una cuenta con ese email. Prueba a iniciar sesión.');
    if(/password should be at least/i.test(m))
      return new Error('La contraseña debe tener al menos 8 caracteres');
    if(/email not confirmed/i.test(m))
      return new Error('Confirma tu correo antes de entrar. Revisa tu bandeja.');
    if(/rate limit|too many|security purposes/i.test(m))
      return new Error('Demasiados intentos. Espera un momento y vuelve a probar.');
    if(/unable to validate email/i.test(m))
      return new Error('El email no tiene un formato válido');
    return (e && e.message) ? e : new Error('No se ha podido completar la operación');
  },

  rolesLocales(){
    const d = DB.d;
    if(!d || !this.uid) return [];
    return d.members.filter(m => m.user_id === this.uid).map(m => m.rol);
  },

  /* =======================================================================
     CÓDIGOS DE ACCESO
     =======================================================================
     Se consultan por RPC y no leyendo la tabla: así un entrenador no puede
     ver los códigos que ha generado la junta.
     ======================================================================= */

async comprobarCodigo(codigo){
      const { data, error } = await this.sb.rpc('redeem_invite', { p_code: codigo });
      if(error) throw new Error(error.message);
      return data;
    },

    /* Identidad del club a partir de un codigo, para poder darse de alta en un
       dispositivo que aun no tiene el club descargado. Solo devuelve id,
       nombre, ciudad y temporada: nada de miembros ni correos. */
    async clubPorCodigo(codigo){
      const { data, error } = await this.sb.rpc('club_by_code', { p_code: codigo });
      if(error) throw new Error(error.message);
      return data;
    },

  async gastarCodigo(codigo){
    const { data, error } = await this.sb.rpc('consume_invite', { p_code: codigo });
    if(error) throw new Error(error.message);
    if(data && data.ok && data.club_id) this.clubId = data.club_id;
    return data;
  },

  async fundarClub(datos){
    const { data, error } = await this.sb.rpc('found_club', datos);
    if(error) throw new Error(error.message);
    if(data && !data.ok) throw new Error(data.error);
    this.clubId = datos.p_club_id;
    return data;
  }
};

/* -----------------------------------------------------------------------
   CORREO
   No va a Resend desde el navegador: la clave está en el servidor, dentro de
   la Edge Function. Aquí solo se invoca.
   ----------------------------------------------------------------------- */

Backend.correo = async function(plantilla, datos, extra){
  if(!this.activo || !this.sb) return { error: 'sin servidor' };
  try{
    const { data, error } = await this.sb.functions.invoke('send-mail', {
      body: { plantilla, datos, clubId: this.clubId, ...(extra || {}) }
    });
    if(error) return { error: this.traducir(error).message };
    return data || {};
  }catch(e){ return { error: this.traducir(e).message }; }
};

Backend.correoEnLote = async function(plantilla, datos, destinatarios){
  if(!this.activo || !this.sb) return { error: 'sin servidor' };
  try{
    const { data, error } = await this.sb.functions.invoke('send-mail', {
      body: { plantilla, datos, destinatarios, clubId: this.clubId }
    });
    if(error) return { error: this.traducir(error).message };
    return data || {};
  }catch(e){ return { error: this.traducir(e).message }; }
};

/* `backendListo()` vive en js/store.js, que se carga siempre. Aquí solo se
   deja constancia de que este fichero no lo necesita. */

/* ---------------------------------------------------------------------------
   VACIADO AL CERRAR Y AL RECUPERAR LA CONEXION
   El debounce de 1,5 s es una ventana real de perdida de datos: si se edita y
   la app se cierra antes de que salte, ese cambio no llego al servidor y la
   siguiente hidratacion lo pisaba. Se intenta subir al ocultar la app, al
   cerrarla y al volver la conexion. `visibilitychange` es el evento fiable:
   `pagehide` no garantiza tiempo para una peticion asincrona.
   --------------------------------------------------------------------------- */
(function vigilarCiclo(){
  if(typeof window === 'undefined' || window.__rccVigila) return;
  /* En Node (las pruebas) no hay DOM: se sale en lugar de reventar al cargar. */
  if(typeof window.addEventListener !== 'function') return;
  if(typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  window.__rccVigila = true;
  const subir = () => {
    try{ if(Backend.activo && window.DB && window.DB.d && window.DB.d.__sucio) Backend.volcar(); }
    catch(e){ /* al cerrar la app no hay donde avisar */ }
  };
  window.addEventListener('online', subir);
  window.addEventListener('pagehide', subir);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') subir();
  });
})();
