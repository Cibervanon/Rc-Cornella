/* ============================================================================
   Almacén y reglas de negocio
   ----------------------------------------------------------------------------
   NO hay datos precargados. La base arranca vacía y se llena cuando alguien
   funda el club y el resto se registra.

   Control de acceso por códigos con alcance:
     - Código de FAMILIA:    público, lo reparte el club. Alta libre.
     - Código de ENTRENADOR: de un solo uso, lo genera la junta para una
       persona concreta. Caduca. Nadie se hace entrenador por su cuenta.
     - Código de JUNTA:      solo lo genera otro miembro de la junta.
   El rol nunca lo elige el usuario libremente: lo determina el código.
   ============================================================================ */

const DB_KEY  = 'rccornella.db.v1';
const SES_KEY = 'rccornella.session.v1';

/* ---------- utilidades ---------- */
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const today = () => new Date().toISOString().slice(0,10);
function makeCode(len = 6){
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I,O,0,1
  let s = ''; for(let i=0;i<len;i++) s += A[Math.floor(Math.random()*A.length)];
  return s;
}
/* Hash sencillo. En producción lo hace Supabase Auth con bcrypt. */
function hash(pw){
  let h = 5381;
  for(let i=0;i<pw.length;i++) h = ((h<<5)+h+pw.charCodeAt(i))>>>0;
  return 'h' + h.toString(36);
}

const EMPTY = () => ({
  club: null,            // se crea al fundar
  season: null,
  users: [],             // {id,nombre,email,hash,tel}
  members: [],           // {club_id,user_id,rol}
  invites: [],           // {code,rol,usos,max,caduca,creado_por,nota,team_id}
  categories: [], teams: [], staff: [],
  players: [], guardians: [], links: [], enrollments: [],
  events: [], rsvp: [], callups: [], attendance: [],
  drills: [], sessions: [], sessionDrills: [],
  evaluations: [], notes: [], injuries: [], goals: [],
  posts: [], reads: [], tasks: [], notifs: [],
  invoices: [], mandates: [], docs: [], signatures: [], certs: [],
  audit: []
});

/* ---------- acceso opcional al servidor ----------
   Si js/backend.js no está cargado, o no hay configuración, o el arranque
   falló, NUBE() devuelve null y todo el fichero se comporta exactamente igual
   que antes: localStorage y nada más. Esa es la garantía de que publicar esta
   versión no rompe la app que ya funciona. */
const NUBE = () => (typeof Backend !== 'undefined' && Backend.activo) ? Backend : null;

/* ¿Hay un servidor utilizable? Si js/backend.js no está cargado —porque esta
   versión se usa sin configurar nada, o porque falla el arranque— la respuesta
   es no y todo sigue con localStorage. Vive aquí y no en backend.js para que
   exista siempre: el resto de ficheros lo usan sin comprobar nada. */
const backendListo = () => !!(typeof Backend !== 'undefined' && Backend.activo);

const DB = {
  d: null,
  load(){
    if(this.d) return this.d;
    const raw = localStorage.getItem(DB_KEY);
    if(raw){ try{ this.d = JSON.parse(raw); return this.d; }catch(e){} }
    this.d = EMPTY(); this.guardar(); return this.d;
  },
  /** Solo al disco. Para cuando el contenido ya viene del servidor y no hay
      nada que sincronizar. */
  guardar(){ localStorage.setItem(DB_KEY, JSON.stringify(this.d)); },
  /** Guarda en disco y avisa al servidor de que algo ha cambiado. */
  save(){ this.guardar(); const b = NUBE(); if(b) b.marcar(); },
  /** Vacía la copia local sin recargar (al cerrar sesión en modo servidor). */
  vaciar(){ localStorage.removeItem(DB_KEY); this.d = null; },
  wipe(){ this.vaciar(); localStorage.removeItem(SES_KEY);
    this.d = null; location.reload(); }
};

/* ---------- catálogo de roles ---------- */
const ROLES = {
  junta:      { t:'Junta directiva', ic:'shield',
                d:'Gestiona el club, las cuotas y el cumplimiento' },
  entrenador: { t:'Entrenador',      ic:'whistle',
                d:'Convoca, pasa lista y sigue a sus jugadores' },
  familia:    { t:'Familia',         ic:'users',
                d:'Confirma asistencia y sigue a tus hijos' },
  jugador:    { t:'Jugador',         ic:'ball',
                d:'Tu calendario, tus confirmaciones y tu progreso' }
};

/* Categorías por defecto que propone el asistente de creación de club. */
const CAT_PRESET = [
  { n:'Sub-8',  cuota:30 }, { n:'Sub-10', cuota:32 }, { n:'Sub-12', cuota:35 },
  { n:'Sub-14', cuota:38 }, { n:'Sub-16', cuota:42 }, { n:'Sub-18', cuota:45 },
  { n:'Sénior', cuota:52 }
];

/* Biblioteca inicial de ejercicios de rugby (contenido del club, no "datos
   de demo": son ejercicios reales que el entrenador puede usar o borrar). */
const DRILL_PRESET = [
  { nombre:'Calentamiento dinámico', tipo:'Físico', min:10,
    objetivo:'Activación muscular y prevención de lesiones',
    desc:'Carrera suave, movilidad de cadera y tobillo, y tres progresiones de velocidad.',
    material:'Conos' },
  { nombre:'Pase en línea', tipo:'Técnica', min:15,
    objetivo:'Precisión y sincronización del pase hacia atrás',
    desc:'Grupos de cinco avanzando en línea. El balón no puede tocar el suelo y no se frena la carrera.',
    material:'Balones' },
  { nombre:'Placaje seguro 1 contra 1', tipo:'Técnica', min:20,
    objetivo:'Técnica de placaje con hombro y cabeza fuera',
    desc:'Progresión desde rodillas, luego de pie sin desplazamiento y por último en movimiento. La seguridad manda sobre la intensidad.',
    material:'Escudos, conos' },
  { nombre:'Ruck y limpieza', tipo:'Táctica', min:15,
    objetivo:'Velocidad de llegada y legalidad sobre el balón',
    desc:'Secuencias de tres rucks consecutivos con oposición pasiva y luego activa.',
    material:'Escudos, balones' },
  { nombre:'Touch rugby 7 contra 7', tipo:'Juego', min:20,
    objetivo:'Toma de decisiones y apoyo al portador',
    desc:'Partido reducido sin contacto. Tres toques y cambio de posesión.',
    material:'Balón, petos' },
  { nombre:'Melé formada', tipo:'Táctica', min:15,
    objetivo:'Posición corporal y empuje coordinado',
    desc:'Trabajo de primera línea con máquina o escudos. Atención a la posición de la espalda.',
    material:'Máquina de melé' },
  { nombre:'Vuelta a la calma', tipo:'Físico', min:8,
    objetivo:'Recuperación y cierre de sesión',
    desc:'Estiramientos suaves y repaso en grupo de los objetivos trabajados.',
    material:'—' }
];

const DOC_PRESET = [
  { nombre:'Autorización de uso de imagen', tipo:'imagen', v:'1.0' },
  { nombre:'Protección de datos (RGPD)',    tipo:'rgpd',   v:'1.0' },
  { nombre:'Ficha médica y autorización sanitaria', tipo:'medico', v:'1.0' }
];

/* ============================================================================
   POSICIONES DE RUGBY
   ----------------------------------------------------------------------------
   Numeración oficial: 1-8 delanteros (pack), 9-15 tres cuartos (línea).
   En sevens son 3 delanteros (2 pilares + talonador) y 4 tres cuartos
   (medio melé, apertura, centro y ala); los dorsales no van ligados al puesto.
   El campo se dibuja en vertical con la línea de ensayo rival arriba.
   ============================================================================ */

const GRUPOS = {
  delantera:   { t:'Delantera', abbr:'Pack',  color:'#121212' },
  trescuartos: { t:'Tres cuartos', abbr:'Línea', color:'#E8590C' }
};

/* Catálogo canónico: sirve para etiquetar jugadores y para el campo. */
const POS_CAT = [
  { id:'pilar_i',  n:1,  t:'Pilar izquierdo', corto:'Pilar izq.', g:'delantera',
    linea:'Primera línea', desc:'Ancla del lado abierto de la melé' },
  { id:'talon',    n:2,  t:'Talonador',       corto:'Talonador',  g:'delantera',
    linea:'Primera línea', desc:'Talona en melé y lanza en touche' },
  { id:'pilar_d',  n:3,  t:'Pilar derecho',   corto:'Pilar der.', g:'delantera',
    linea:'Primera línea', desc:'Ancla del lado cerrado de la melé' },
  { id:'segunda_i',n:4,  t:'Segunda línea',   corto:'2ª línea',   g:'delantera',
    linea:'Segunda línea', desc:'Saltador principal en touche' },
  { id:'segunda_d',n:5,  t:'Segunda línea',   corto:'2ª línea',   g:'delantera',
    linea:'Segunda línea', desc:'Empuje en melé y conquista aérea' },
  { id:'ala_ciego',n:6,  t:'Ala ciego',       corto:'Ala ciego',  g:'delantera',
    linea:'Tercera línea', desc:'Tercera del lado cerrado, placaje y continuidad' },
  { id:'ala_abier',n:7,  t:'Ala abierto',     corto:'Ala abierto',g:'delantera',
    linea:'Tercera línea', desc:'Primero al ruck, especialista en robo' },
  { id:'octavo',   n:8,  t:'Número 8',        corto:'Nº 8',       g:'delantera',
    linea:'Tercera línea', desc:'Enlace entre delantera y línea' },
  { id:'medio',    n:9,  t:'Medio melé',      corto:'Medio melé', g:'trescuartos',
    linea:'Bisagra', desc:'Distribuye desde el ruck y marca el ritmo' },
  { id:'apertura', n:10, t:'Apertura',        corto:'Apertura',   g:'trescuartos',
    linea:'Bisagra', desc:'Estratega y pateador principal' },
  { id:'ala_izq',  n:11, t:'Ala izquierdo',   corto:'Ala izq.',   g:'trescuartos',
    linea:'Alas', desc:'Velocidad y finalización por el exterior' },
  { id:'centro_1', n:12, t:'Primer centro',   corto:'1er centro', g:'trescuartos',
    linea:'Centros', desc:'Centro físico, rompe la primera cortina' },
  { id:'centro_2', n:13, t:'Segundo centro',  corto:'2º centro',  g:'trescuartos',
    linea:'Centros', desc:'Velocidad y visión para abrir espacios' },
  { id:'ala_der',  n:14, t:'Ala derecho',     corto:'Ala der.',   g:'trescuartos',
    linea:'Alas', desc:'Velocidad y finalización por el exterior' },
  { id:'zaguero',  n:15, t:'Zaguero',         corto:'Zaguero',    g:'trescuartos',
    linea:'Zaguero', desc:'Último defensor y contraataque' }
];
const POS = id => POS_CAT.find(p=>p.id===id);
const POS_POR_GRUPO = g => POS_CAT.filter(p=>p.g===g);

/* ---- Formaciones: solo XV y VII ---- */
const FORMACIONES = {
  15:{ nombre:'XV', desc:'Rugby a quince', jugadores:15, partes:2, minutos:40,
    posiciones:[
    { pos:'pilar_i',  n:1,  x:30, y:88 },
    { pos:'talon',    n:2,  x:50, y:90 },
    { pos:'pilar_d',  n:3,  x:70, y:88 },
    { pos:'segunda_i',n:4,  x:40, y:77 },
    { pos:'segunda_d',n:5,  x:60, y:77 },
    { pos:'ala_ciego',n:6,  x:22, y:67 },
    { pos:'ala_abier',n:7,  x:78, y:67 },
    { pos:'octavo',   n:8,  x:50, y:66 },
    { pos:'medio',    n:9,  x:38, y:54 },
    { pos:'apertura', n:10, x:56, y:45 },
    { pos:'centro_1', n:12, x:44, y:35 },
    { pos:'centro_2', n:13, x:64, y:30 },
    { pos:'ala_izq',  n:11, x:15, y:26 },
    { pos:'ala_der',  n:14, x:85, y:26 },
    { pos:'zaguero',  n:15, x:50, y:13 }
  ]},
  7:{ nombre:'VII', desc:'Rugby a siete', jugadores:7, partes:2, minutos:7,
    posiciones:[
    { pos:'pilar_i',  n:1, x:34, y:84 },
    { pos:'talon',    n:2, x:50, y:87 },
    { pos:'pilar_d',  n:3, x:66, y:84 },
    { pos:'medio',    n:4, x:40, y:63 },
    { pos:'apertura', n:5, x:60, y:50 },
    { pos:'centro_1', n:6, x:38, y:34 },
    { pos:'ala_der',  n:7, x:64, y:17 }
  ]}
};
/** Huecos de una formación, resueltos con su posición canónica. */
const HUECOS = f => (FORMACIONES[f]||FORMACIONES[15]).posiciones.map(h=>{
  const c = POS(h.pos);
  return { id:h.pos, n:h.n, x:h.x, y:h.y, pos:h.pos,
           t:c.t, corto:c.corto, g:c.g, linea:c.linea, desc:c.desc };
});
/* compatibilidad con el nombre anterior */
const POSICIONES = HUECOS;

function FORMACION_POR_DEFECTO(nombreCat){
  const n = parseInt(String(nombreCat||'').replace(/\D/g,''),10);
  return (n && n<=12) ? 7 : 15;
}
function DURACION_POR_DEFECTO(nombreCat){
  const n = parseInt(String(nombreCat||'').replace(/\D/g,''),10);
  if(!n) return 40;
  if(n<=10) return 10;
  if(n<=14) return 25;
  return 35;
}

const PUNTOS = [
  { clase:'ensayo',     t:'Ensayo',            v:5, ic:'ball' },
  { clase:'conversion', t:'Transformación',    v:2, ic:'target' },
  { clase:'penal',      t:'Golpe de castigo',  v:3, ic:'target' },
  { clase:'drop',       t:'Drop',              v:3, ic:'target' },
  { clase:'castigo',    t:'Ensayo de castigo', v:7, ic:'ball' }
];

/* Pruebas físicas que propone el club al crearse. Después son editables:
   se pueden borrar, renombrar y añadir otras propias. */
const PRUEBAS_SEMILLA = [
  { id:'sentadilla', t:'Sentadilla',   u:'kg',  menorMejor:false },
  { id:'banca',      t:'Press banca',  u:'kg',  menorMejor:false },
  { id:'peso_muerto',t:'Peso muerto',  u:'kg',  menorMejor:false },
  { id:'dominadas',  t:'Dominadas',    u:'rep', menorMejor:false },
  { id:'sprint40',   t:'Sprint 40 m',  u:'s',   menorMejor:true  },
  { id:'yoyo',       t:'Test Yo-Yo',   u:'m',   menorMejor:false }
];
const UNIDADES = ['kg','rep','s','m','cm','min','pts'];

/* ============================================================================
   API
   ============================================================================ */
const App_ = {};   // referencia tardía al shell

const Data = {
  ses: null,

  /* ---------- sesión ---------- */
  loadSession(){
    const raw = localStorage.getItem(SES_KEY);
    if(!raw) return null;
    try{
      const s = JSON.parse(raw);
      const d = DB.load();
      if(!d.users.some(u=>u.id===s.userId)) return null; // base reiniciada
      this.ses = s; return s;
    }catch(e){ return null; }
  },
  setSession(s){ this.ses = s; localStorage.setItem(SES_KEY, JSON.stringify(s)); },
  endSession(){ this.ses = null; localStorage.removeItem(SES_KEY); },

  clubExists(){ return !!DB.load().club; },
  club(){ return DB.load().club; },
  season(){ return DB.load().season; },

  /* ---------- roles del usuario actual ---------- */
  myRoles(){
    const d = DB.load();
    if(!this.ses) return [];
    return d.members.filter(m=>m.user_id===this.ses.userId).map(m=>m.rol);
  },
  rol(){ return this.ses ? this.ses.rol : null; },
  me(){ const d=DB.load(); return d.users.find(u=>u.id===this.ses.userId); },
  is(...r){ return r.includes(this.rol()); },

  /* ============================================================
     ALTA Y ACCESO
     ============================================================ */

  /** Identificadores que el alta necesita devolver al servidor cuando hay
      nube: los mismos que se generarán aquí, para que ambas copias coincidan. */
  idsParaFundar(){ return { club_id:uid('club'), season_id:uid('sea') }; },

  /** Funda el club. Solo puede hacerlo la primera persona. */
  foundClub({ clubNombre, ciudad, temporada, userNombre, email, password, categorias,
              userId, ids, familyCode }){
    const d = DB.load();
    if(d.club) throw new Error('Este club ya está creado. Pide tu código de acceso a la junta.');
    if(!clubNombre?.trim()) throw new Error('Indica el nombre del club');
    if(!this.validEmail(email)) throw new Error('El email no tiene un formato válido');
    if(!userId && password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

    d.club = { id:ids?.club_id || uid('club'), nombre:clubNombre.trim(), deporte:'Rugby',
      ciudad:(ciudad||'').trim(), fundado:1931, creado:today() };
    d.season = { id:ids?.season_id || uid('sea'), nombre:temporada||'2026-27', activa:true };

    const u = { id:userId || uid('u'), nombre:userNombre.trim(),
      email:email.trim().toLowerCase(), creado:today() };
    // Sin nube la contraseña se guarda aquí. Con nube la custodian Supabase
    // Auth y aquí no se copia nada.
    if(!userId) u.hash = hash(password);
    d.users.push(u);
    d.members.push({ club_id:d.club.id, user_id:u.id, rol:'junta' });

    (categorias && categorias.length ? categorias : CAT_PRESET).forEach((c,i)=>{
      const cat = { id:uid('cat'), nombre:c.n, orden:i, cuota:c.cuota };
      d.categories.push(cat);
      d.teams.push({ id:uid('t'), cat_id:cat.id, nombre:c.n });
    });

    DRILL_PRESET.forEach(x=>d.drills.push({ id:uid('dr'), ...x, base:true }));
    d.pruebas = PRUEBAS_SEMILLA.map((x,i)=>({ ...x, orden:i }));
    DOC_PRESET.forEach(x=>d.docs.push({ id:uid('doc'), ...x, obligatorio:true }));

    // Código público de familias, permanente.
    d.invites.push({ code:familyCode || makeCode(), rol:'familia', usos:0, max:null,
      caduca:null, creado_por:u.id, nota:'Código general para familias' });

    DB.save();
    this.setSession({ userId:u.id, rol:'junta' });
    this.log('club.fundado', { nombre:d.club.nombre });
    return u;
  },

  validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e||'').trim()); },

  /** Comprueba un código sin consumirlo. Devuelve el rol al que da acceso. */
  peekCode(code){
    const d = DB.load();
    const c = (code||'').trim().toUpperCase();
    if(!c) return { ok:false, error:'Escribe el código que te ha dado el club' };
    const inv = d.invites.find(i=>i.code===c);
    if(!inv) return { ok:false, error:'Ese código no existe. Revísalo con el club.' };
    if(inv.caduca && inv.caduca < today())
      return { ok:false, error:'Ese código ha caducado. Pide uno nuevo a la junta.' };
    if(inv.max !== null && inv.usos >= inv.max)
      return { ok:false, error:'Ese código ya se ha utilizado. Pide uno nuevo a la junta.' };
    return { ok:true, rol:inv.rol, invite:inv };
  },

  /* Registro. El rol SIEMPRE viene del código, nunca lo elige el usuario.
     - `userId` lo inyecta Supabase Auth cuando hay nube; sin él la cuenta es
       solo local y aquí se guarda la contraseña.
     - `resuelto` es el resultado de la comprobación del código en el servidor.
       Cuando está, el consumo del código ya lo ha contabilizado la base de
       datos y no hay que tocar nada local: la tabla de códigos está cerrada a
       todo el mundo menos la junta. */
  register({ nombre, email, password, code, tel, userId, resuelto }){
    const d = DB.load();
    if(!d.club) throw new Error('Todavía no hay ningún club creado');
    if(!nombre?.trim()) throw new Error('Escribe tu nombre y apellidos');
    if(!this.validEmail(email)) throw new Error('El email no tiene un formato válido');
    if(!userId){
      if(!password) throw new Error('Falta la contraseña');
      if(password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    }
    if(d.users.some(u=>u.email===email.trim().toLowerCase()))
      throw new Error('Ya existe una cuenta con ese email. Prueba a iniciar sesión.');

    const chk = resuelto || this.peekCode(code);
    if(!chk.ok) throw new Error(chk.error);
    const inv = chk.invite || {};

    const u = { id:userId || uid('u'), nombre:nombre.trim(), email:email.trim().toLowerCase(),
      tel:(tel||'').trim(), creado:today() };
    if(!userId) u.hash = hash(password);
    d.users.push(u);
    d.members.push({ club_id:d.club.id, user_id:u.id, rol:chk.rol });

    if(inv.usos !== undefined) inv.usos++;

    // Si el código era nominal de entrenador, se le asigna su equipo.
    if(chk.rol==='entrenador' && inv.team_id){
      d.staff.push({ id:uid('st'), team_id:inv.team_id, user_id:u.id,
        cargo:'Entrenador' });
      d.certs.push({ id:uid('ce'), user_id:u.id, nombre:u.nombre,
        tipo:'CDNS', estado:'ausente', formacion:false });
    }
    // Si es familia, se crea su ficha de tutor.
    if(chk.rol==='familia'){
      d.guardians.push({ id:uid('g'), user_id:u.id, nombre:u.nombre,
        email:u.email, tel:u.tel });
    }

    DB.save();
    this.setSession({ userId:u.id, rol:chk.rol });
    this.log('usuario.alta', { rol:chk.rol });

    // Confirmación de que la cuenta ya existe. Sin nube no se manda nada, así
    // que el comportamiento local no cambia.
    const R = ROLES[chk.rol];
    this.correo('bienvenida', {
      destinatarioEmail:u.email, destinatario:u.nombre,
      club:this.clubNombre(), rol:R ? R.t.toLowerCase() : chk.rol,
      proximo:'Ve a tu perfil y revisa los datos de contacto.',
      appUrl:this.appUrl()
    });

    return u;
  },

  login(email, password){
    const d = DB.load();
    const u = d.users.find(x=>x.email===(email||'').trim().toLowerCase());
    if(!u) throw new Error('No hay ninguna cuenta con ese email');
    if(u.hash !== hash(password)) throw new Error('La contraseña no es correcta');
    const roles = d.members.filter(m=>m.user_id===u.id).map(m=>m.rol);
    if(!roles.length) throw new Error('Tu cuenta no tiene acceso a este club');
    this.setSession({ userId:u.id, rol:roles[0] });
    return { user:u, roles };
  },

  changePassword(actual, nueva){
    if(nueva.length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres');
    // Con nube no se puede comprobar la actual aquí: la contraseña no está en
    // este dispositivo. La revalida Supabase, que además cierra la sesión.
    const b = NUBE();
    if(b) return b.cambiarPassword(nueva);
    const u = this.me();
    if(u.hash !== hash(actual)) throw new Error('La contraseña actual no es correcta');
    u.hash = hash(nueva); DB.save();
  },

  /* ---------- correo ----------
     Todo pasa por la Edge Function: la clave de Resend está en el servidor y
     nunca llega al navegador. Sin nube, o sin dirección, no se hace nada y la
     app sigue igual. */
  correo(plantilla, datos, extra){
    const b = NUBE(); if(!b) return;
    b.correo(plantilla, datos, extra).catch(()=>{});
  },
  correoEnLote(plantilla, datos, destinatarios){
    const b = NUBE(); if(!b || !destinatarios.length) return;
    b.correoEnLote(plantilla, datos, destinatarios).catch(()=>{});
  },
  /** Direcciones de correo de los tutores de un deportista, sin repetir. */
  correosDe(pid){
    const vistos = new Set(), out = [];
    this.guardiansOf(pid).forEach(g=>{
      const m = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test((g.email||'').trim());
      if(m && !vistos.has(g.email)){ vistos.add(g.email);
        out.push({ email:g.email, destinatarioEmail:g.email, nombre:g.nombre }); }
    });
    return out;
  },
  clubNombre(){ return (this.club()||{}).nombre || 'Rugby Club Cornellà'; },
  appUrl(){ return (typeof location !== 'undefined' && location.origin) || ''; },
  fechaLarga(iso){
    try{ return new Date(iso).toLocaleString('es-ES',
      { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }); }
    catch(e){ return iso; }
  },

  /* ---------- invitaciones (solo junta) ---------- */
  createInvite({ rol, nota, team_id, max=1, dias=30, email, nombre }){
    if(!this.is('junta')) throw new Error('Solo la junta puede generar códigos de acceso');
    if(rol==='jugador') throw new Error('Los jugadores se dan de alta desde la ficha de su familia');
    const d = DB.load();
    const cad = new Date(); cad.setDate(cad.getDate()+dias);
    const inv = { code:makeCode(), rol, usos:0, max,
      caduca: rol==='familia' && max===null ? null : cad.toISOString().slice(0,10),
      creado_por:this.ses.userId, nota:nota||'', team_id:team_id||null,
      creado:today() };
    // El correo es opcional: el código sigue funcionando si no se indica.
    if(this.validEmail(email)) inv.email = email.trim().toLowerCase();
    d.invites.push(inv); DB.save();
    this.log('invite.creado', { rol });
    if(inv.email){
      this.correo('codigo', {
        destinatarioEmail: inv.email, destinatario: nombre || inv.email,
        codigo: inv.code, club:this.clubNombre(), nota:inv.nota,
        caduca:inv.caduca, appUrl:this.appUrl()
      });
    }
    return inv;
  },
  invites(){ return DB.load().invites; },
  revokeInvite(code){
    if(!this.is('junta')) throw new Error('Solo la junta puede anular códigos');
    const d = DB.load();
    const inv = d.invites.find(i=>i.code===code);
    if(inv && inv.rol==='familia' && inv.max===null)
      throw new Error('El código general de familias no se puede anular');
    d.invites = d.invites.filter(i=>i.code!==code); DB.save();
  },
  /** Regenera el código público de familias, invalidando el anterior. */
  regenerarCodigoFamilia(){
    if(!this.is('junta')) throw new Error('Solo la junta puede hacerlo');
    const d = DB.load();
    d.invites = d.invites.filter(i=>!(i.rol==='familia' && i.max===null));
    const inv = { code:makeCode(), rol:'familia', usos:0, max:null, caduca:null,
      creado_por:this.ses.userId, nota:'Código general para familias',
      creado:today() };
    d.invites.push(inv); DB.save(); return inv;
  },
  familyCode(){
    const d = DB.load();
    return (d.invites.find(i=>i.rol==='familia' && i.max===null) || {}).code || '—';
  },

  /* ============================================================
     ESTRUCTURA
     ============================================================ */
  categories(){ return DB.load().categories.sort((a,b)=>a.orden-b.orden); },
  teams(){
    const d = DB.load();
    return d.teams.map(t=>({ ...t, cat:d.categories.find(c=>c.id===t.cat_id) }))
      .sort((a,b)=>(a.cat?.orden||0)-(b.cat?.orden||0));
  },
  team(id){ return this.teams().find(t=>t.id===id); },

  addCategory(nombre, cuota){
    const d = DB.load();
    const cat = { id:uid('cat'), nombre, orden:d.categories.length, cuota:+cuota||0 };
    d.categories.push(cat);
    d.teams.push({ id:uid('t'), cat_id:cat.id, nombre, nivel:'' });
    DB.save(); return cat;
  },
  /** Añade un grupo (A, B, C...) dentro de una categoría existente. */
  addTeam(catId, nivel){
    const d = DB.load();
    const cat = d.categories.find(c=>c.id===catId);
    if(!cat) throw new Error('La categoría no existe');
    const n = (nivel||'').trim().toUpperCase();
    if(!n) throw new Error('Indica la letra del grupo');
    if(d.teams.some(t=>t.cat_id===catId && (t.nivel||'')===n))
      throw new Error('Ya existe el grupo '+n+' en '+cat.nombre);
    // si el equipo existente no tenía letra, se la ponemos
    const otros = d.teams.filter(t=>t.cat_id===catId);
    if(otros.length===1 && !otros[0].nivel){
      otros[0].nivel = n==='A' ? 'B' : 'A';
      otros[0].nombre = cat.nombre+' '+otros[0].nivel;
    }
    const t = { id:uid('t'), cat_id:catId, nivel:n, nombre:cat.nombre+' '+n };
    d.teams.push(t); DB.save(); return t;
  },
  /** Grupos hermanos: misma categoría, distinto equipo. */
  hermanos(teamId){
    const t = this.team(teamId);
    if(!t) return [];
    return this.teams().filter(x=>x.cat_id===t.cat_id && x.id!==teamId);
  },
  /** Plantel ampliado: los propios más los de los grupos hermanos. */
  plantelAmpliado(teamId){
    const propios = this.teamPlayers(teamId).map(p=>({ ...p, origen:null }));
    const otros = this.hermanos(teamId).flatMap(t=>
      this.teamPlayers(t.id).map(p=>({ ...p, origen:t })));
    return [...propios, ...otros];
  },
  /** Jugadores de hermanos ya comprometidos en otro partido ese mismo día. */
  comprometidos(eventId){
    const d = DB.load();
    const ev = this.event(eventId);
    if(!ev) return {};
    const dia = ev.inicio.slice(0,10);
    const res = {};
    (d.matches||[]).forEach(m=>{
      if(m.event_id===eventId) return;
      const e2 = this.event(m.event_id);
      if(!e2 || e2.inicio.slice(0,10)!==dia) return;
      const t2 = this.team(m.team_id);
      [...Object.values(m.titulares).filter(Boolean), ...m.banquillo]
        .forEach(pid=>{ res[pid] = t2; });
    });
    return res;
  },
  /** Sube o baja a un jugador entre grupos de la misma categoría. */
  moverGrupo(pid, teamId){
    const e = this.enrollment(pid);
    const destino = this.team(teamId);
    if(!e || !destino) throw new Error('No se ha podido mover');
    const origen = this.team(e.team_id);
    if(origen && origen.cat_id !== destino.cat_id)
      throw new Error('Usa cambiar de categoría para mover entre categorías');
    e.team_id = teamId; DB.save();
    const p = this.player(pid);
    this.guardiansOf(pid).forEach(g=>{
      if(g.user_id) this.notify(g.user_id,'Cambio de grupo',
        (p?p.nombre.split(' ')[0]:'')+' pasa a '+destino.nombre);
    });
    DB.save();
    return destino;
  },
  updateCategory(id, patch){
    const c = DB.load().categories.find(x=>x.id===id);
    if(c) Object.assign(c, patch); DB.save();
  },

  /* equipos donde soy técnico */
  myTeams(){
    const d = DB.load();
    const ids = d.staff.filter(s=>s.user_id===this.ses.userId).map(s=>s.team_id);
    return this.teams().filter(t=>ids.includes(t.id));
  },
  teamStaff(teamId){
    const d = DB.load();
    return d.staff.filter(s=>s.team_id===teamId)
      .map(s=>({ ...s, user:d.users.find(u=>u.id===s.user_id) }));
  },
  allStaff(){
    const d = DB.load();
    return d.staff.map(s=>({ ...s, user:d.users.find(u=>u.id===s.user_id),
      team:this.team(s.team_id) }));
  },
  assignStaff(userId, teamId){
    const d = DB.load();
    if(d.staff.some(s=>s.user_id===userId && s.team_id===teamId)) return;
    d.staff.push({ id:uid('st'), team_id:teamId, user_id:userId, cargo:'Entrenador' });
    DB.save();
  },
  unassignStaff(userId, teamId){
    const d = DB.load();
    d.staff = d.staff.filter(s=>!(s.user_id===userId && s.team_id===teamId));
    DB.save();
  },
  coachesWithoutTeam(){
    const d = DB.load();
    return d.members.filter(m=>m.rol==='entrenador')
      .filter(m=>!d.staff.some(s=>s.user_id===m.user_id))
      .map(m=>d.users.find(u=>u.id===m.user_id)).filter(Boolean);
  },

  /* ============================================================
     PERSONAS
     ============================================================ */
  players(){ return DB.load().players; },
  player(id){ return DB.load().players.find(p=>p.id===id); },

  teamPlayers(teamId){
    const d = DB.load();
    const ids = d.enrollments.filter(e=>e.team_id===teamId && !e.baja).map(e=>e.player_id);
    return d.players.filter(p=>ids.includes(p.id))
      .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  },
  enrollment(pid){ return DB.load().enrollments.find(e=>e.player_id===pid && !e.baja); },
  playerTeam(pid){ const e=this.enrollment(pid); return e ? this.team(e.team_id) : null; },

  /** Jugadores que gestiona el usuario actual (sus hijos, o él mismo). */
  myPlayers(){
    const d = DB.load();
    const g = d.guardians.find(x=>x.user_id===this.ses.userId);
    const ids = g ? d.links.filter(l=>l.guardian_id===g.id).map(l=>l.player_id) : [];
    return d.players.filter(p=>ids.includes(p.id) || p.user_id===this.ses.userId);
  },
  myGuardian(){ return DB.load().guardians.find(g=>g.user_id===this.ses.userId); },

  /** Alta de deportista por parte de su familia. */
  addPlayer({ nombre, fecha_nac, team_id, talla, posicion, posiciones, alergias,
              notas_medicas, peso, altura, pie }){
    const d = DB.load();
    const g = this.myGuardian();
    if(!g) throw new Error('Tu cuenta no está registrada como familia');
    if(!nombre?.trim()) throw new Error('Escribe el nombre del deportista');
    if(!team_id) throw new Error('Elige la categoría');

    const p = { id:uid('p'), nombre:nombre.trim(), fecha_nac:fecha_nac||null,
      talla:talla||'', posicion:posicion||'', posiciones:posiciones||[],
      alergias:alergias||'', notas_medicas:notas_medicas||'',
      peso:peso||null, altura:altura||null, pie:pie||'',
      marcas:{}, activo:true, alta:today() };
    d.players.push(p);
    d.links.push({ player_id:p.id, guardian_id:g.id, principal:true });

    const t = this.team(team_id);
    const yaTiene = d.links.filter(l=>l.guardian_id===g.id).length;
    const desc = yaTiene > 1 ? 0.15 : 0;   // 15% a partir del segundo hermano
    d.enrollments.push({ id:uid('en'), player_id:p.id, team_id,
      cuota: t?.cat?.cuota || 0, descuento:desc, alta:today(), baja:null });

    // RSVP para los eventos futuros que ya existan del equipo
    this.events(team_id).forEach(ev=>{
      d.rsvp.push({ id:uid('r'), event_id:ev.id, player_id:p.id,
        estado:'sin_responder', recordatorios:0 });
    });
    DB.save();
    this.log('jugador.alta', { nombre:p.nombre });
    return p;
  },
  updatePlayer(id, patch){
    const p = this.player(id); if(p) Object.assign(p, patch); DB.save();
  },
  /** Baja de deportista. Limpia todo lo que cuelga de él. */
  removePlayer(pid){
    const d = DB.load();
    d.players     = d.players.filter(p=>p.id!==pid);
    d.enrollments = d.enrollments.filter(e=>e.player_id!==pid);
    d.links       = d.links.filter(l=>l.player_id!==pid);
    d.rsvp        = d.rsvp.filter(r=>r.player_id!==pid);
    d.callups     = d.callups.filter(c=>c.player_id!==pid);
    d.attendance  = d.attendance.filter(a=>a.player_id!==pid);
    d.evaluations = d.evaluations.filter(e=>e.player_id!==pid);
    d.notes       = d.notes.filter(n=>n.player_id!==pid);
    d.injuries    = d.injuries.filter(i=>i.player_id!==pid);
    d.goals       = d.goals.filter(g=>g.player_id!==pid);
    d.signatures  = d.signatures.filter(s=>s.player_id!==pid);
    d.invoices    = d.invoices.filter(i=>i.player_id!==pid);
    DB.save();
  },
  movePlayer(pid, teamId){
    const e = this.enrollment(pid);
    const t = this.team(teamId);
    if(e){ e.team_id = teamId; e.cuota = t?.cat?.cuota || e.cuota; }
    DB.save();
  },
  /* ---------- etiquetas de posición ---------- */
  posicionesDe(pid){
    const p = this.player(pid);
    if(!p) return [];
    if(p.posiciones && p.posiciones.length) return p.posiciones;
    // compatibilidad: intenta deducir del texto libre antiguo
    if(p.posicion){
      const t = p.posicion.toLowerCase();
      const m = POS_CAT.find(c=>t.includes(c.t.toLowerCase()) ||
        t.includes(c.corto.toLowerCase().replace('.','')));
      if(m) return [m.id];
    }
    return [];
  },
  grupoDe(pid){
    const ps = this.posicionesDe(pid).map(id=>POS(id)).filter(Boolean);
    if(!ps.length) return null;
    const d = ps.filter(p=>p.g==='delantera').length;
    return d > ps.length/2 ? 'delantera' : d===ps.length-d ? 'mixto' : 'trescuartos';
  },
  setPosiciones(pid, lista){
    const p = this.player(pid);
    if(!p) return;
    p.posiciones = lista.slice(0,4);
    p.posicion = lista.map(id=>POS(id)?.corto).filter(Boolean).join(', ');
    DB.save();
  },
  /** Puede cubrir ese puesto: exacto, misma línea o mismo grupo. */
  encaje(pid, posId){
    const mias = this.posicionesDe(pid);
    if(!mias.length) return { nivel:0, t:'Sin etiquetar' };
    if(mias.includes(posId)) return { nivel:3, t:'Su puesto' };
    const objetivo = POS(posId);
    if(mias.some(id=>POS(id)?.linea===objetivo.linea))
      return { nivel:2, t:'Misma línea' };
    if(mias.some(id=>POS(id)?.g===objetivo.g))
      return { nivel:1, t:objetivo.g==='delantera'?'Delantera':'Tres cuartos' };
    return { nivel:0, t:'Fuera de puesto' };
  },
  /** Quién puede sustituir a un jugador, ordenado por encaje. */
  recambios(eventId, pid){
    const m = this.match(eventId);
    if(!m) return [];
    const posId = Object.keys(m.titulares).find(k=>m.titulares[k]===pid);
    return m.banquillo.map(id=>{
      const e = posId ? this.encaje(id, posId) : { nivel:0, t:'—' };
      const st = this.minutosJugados(eventId).find(x=>x.player_id===id);
      return { player:this.player(id), encaje:e, minutos:st?st.minutos:0 };
    }).filter(x=>x.player).sort((a,b)=>b.encaje.nivel-a.encaje.nivel);
  },

  /* ---------- catálogo de pruebas físicas (editable por el club) ---------- */
  pruebas(){
    const d = DB.load();
    if(!d.pruebas) d.pruebas = PRUEBAS_SEMILLA.map((x,i)=>({ ...x, orden:i }));
    return d.pruebas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0));
  },
  prueba(id){ return this.pruebas().find(p=>p.id===id); },

  addPrueba({ t, u, menorMejor }){
    if(!this.is('junta','coordinador','entrenador'))
      throw new Error('No tienes permiso para crear pruebas');
    const nombre = (t||'').trim();
    if(!nombre) throw new Error('Ponle nombre a la prueba');
    const d = DB.load();
    this.pruebas();
    if(d.pruebas.some(p=>p.t.toLowerCase()===nombre.toLowerCase()))
      throw new Error('Ya existe una prueba con ese nombre');
    const pr = { id:uid('pr'), t:nombre, u:u||'kg',
      menorMejor:!!menorMejor, orden:d.pruebas.length, propia:true };
    d.pruebas.push(pr); DB.save(); return pr;
  },
  updatePrueba(id, patch){
    const d = DB.load(); this.pruebas();
    const pr = d.pruebas.find(p=>p.id===id);
    if(!pr) throw new Error('La prueba no existe');
    if(patch.t !== undefined){
      const nombre = patch.t.trim();
      if(!nombre) throw new Error('El nombre no puede quedar vacío');
      if(d.pruebas.some(p=>p.id!==id && p.t.toLowerCase()===nombre.toLowerCase()))
        throw new Error('Ya existe una prueba con ese nombre');
      patch.t = nombre;
    }
    Object.assign(pr, patch); DB.save(); return pr;
  },
  /** Borra la prueba y todas las marcas registradas en ella. */
  removePrueba(id){
    const d = DB.load(); this.pruebas();
    if(d.pruebas.length<=1) throw new Error('Debe quedar al menos una prueba');
    d.pruebas = d.pruebas.filter(p=>p.id!==id);
    d.players.forEach(p=>{ if(p.marcas) delete p.marcas[id]; });
    DB.save();
  },
  /** Cuántos jugadores tienen marca en esa prueba. */
  usoPrueba(id){
    return DB.load().players.filter(p=>p.marcas && p.marcas[id]).length;
  },
  moverPrueba(id, dir){
    const l = this.pruebas();
    const i = l.findIndex(p=>p.id===id);
    const j = i + dir;
    if(i<0 || j<0 || j>=l.length) return;
    const a = l[i].orden ?? i, b = l[j].orden ?? j;
    l[i].orden = b; l[j].orden = a;
    DB.save();
  },

  /* ---------- marcas por jugador ---------- */
  marcas(pid){
    const p = this.player(pid);
    return (p && p.marcas) ? p.marcas : {};
  },
  setMarca(pid, ejId, valor, fecha){
    const p = this.player(pid);
    if(!p) return;
    if(!this.prueba(ejId)) throw new Error('Esa prueba ya no existe');
    if(!p.marcas) p.marcas = {};
    if(valor === null || valor === ''){ delete p.marcas[ejId]; DB.save(); return; }
    const v = +valor;
    if(!isFinite(v) || v<=0) throw new Error('Introduce un valor válido');
    const ant = p.marcas[ejId];
    const hist = (ant && ant.historico) ? ant.historico.slice() : [];
    if(ant) hist.unshift({ valor:ant.valor, fecha:ant.fecha });
    p.marcas[ejId] = { valor:v, fecha:fecha||today(), historico:hist.slice(0,10) };
    DB.save();
  },
  historicoMarca(pid, ejId){
    const m = this.marcas(pid)[ejId];
    if(!m) return [];
    return [{ valor:m.valor, fecha:m.fecha }, ...(m.historico||[])];
  },
  /** Pruebas con marca registrada de un jugador. */
  marcasDe(pid){
    const m = this.marcas(pid);
    return this.pruebas().filter(pr=>m[pr.id])
      .map(pr=>({ prueba:pr, marca:m[pr.id] }));
  },
  /** Ranking del equipo en un ejercicio. En sprint, menos es mejor. */
  rankingMarca(teamId, ejId){
    const pr = this.prueba(ejId);
    const menorMejor = pr ? !!pr.menorMejor : false;
    return this.teamPlayers(teamId)
      .map(p=>({ p, m:(p.marcas||{})[ejId] }))
      .filter(x=>x.m)
      .sort((a,b)=> menorMejor ? a.m.valor-b.m.valor : b.m.valor-a.m.valor);
  },

  guardiansOf(pid){
    const d = DB.load();
    const ids = d.links.filter(l=>l.player_id===pid).map(l=>l.guardian_id);
    return d.guardians.filter(g=>ids.includes(g.id));
  },
  siblings(pid){
    const d = DB.load();
    const gids = d.links.filter(l=>l.player_id===pid).map(l=>l.guardian_id);
    const ids = d.links.filter(l=>gids.includes(l.guardian_id) && l.player_id!==pid)
      .map(l=>l.player_id);
    return d.players.filter(p=>ids.includes(p.id));
  },

  /* ============================================================
     EVENTOS Y RSVP
     ============================================================ */
  /* ============================================================
     DÍA DE PARTIDO
     ------------------------------------------------------------
     Un "match" cuelga de un evento de tipo partido o torneo.
     Guarda alineación, banquillo, cambios con minuto y anotaciones.
     ============================================================ */

  match(eventId){
    const d = DB.load();
    if(!d.matches) d.matches = [];
    return d.matches.find(m=>m.event_id===eventId);
  },
  ensureMatch(eventId){
    const d = DB.load();
    if(!d.matches) d.matches = [];
    let m = d.matches.find(x=>x.event_id===eventId);
    if(!m){
      const ev = this.event(eventId);
      const t = this.team(ev.team_id);
      m = { id:uid('mt'), event_id:eventId, team_id:ev.team_id,
        formacion: FORMACION_POR_DEFECTO(t?.cat?.nombre || t?.nombre),
        titulares:{},           // { posId: playerId }
        banquillo:[],           // [playerId]
        acciones:[],            // cronología
        estado:'previo',        // previo | jugando | descanso | final
        parte:1, minuto:0, arrancado:null,
        puntos_favor:0, puntos_contra:0,
        duracion_parte: DURACION_POR_DEFECTO(t?.cat?.nombre || t?.nombre) };
      d.matches.push(m); DB.save();
    }
    return m;
  },
  saveMatch(){ DB.save(); },

  /** Disponibles: plantilla propia más los grupos hermanos que puedan subir. */
  disponibles(eventId, { ampliado=true } = {}){
    const ev = this.event(eventId);
    if(!ev) return [];
    const les = this.injuries().filter(i=>i.estado!=='alta').map(i=>i.player_id);
    const comp = this.comprometidos(eventId);
    const base = ampliado ? this.plantelAmpliado(ev.team_id)
                          : this.teamPlayers(ev.team_id).map(p=>({...p, origen:null}));
    return base.map(p=>{
      const r = this.rsvpOf(eventId,p.id);
      return { ...p,
        rsvp: r ? r.estado : 'sin_responder',
        lesionado: les.includes(p.id),
        ocupado: comp[p.id] || null,
        posiciones: this.posicionesDe(p.id),
        grupo: this.grupoDe(p.id) };
    }).sort((a,b)=>{
      if(!!a.origen !== !!b.origen) return a.origen ? 1 : -1;
      const ord = { si:0, sin_responder:1, duda:2, no:3 };
      return (ord[a.rsvp]-ord[b.rsvp]) || a.nombre.localeCompare(b.nombre,'es');
    });
  },
  enCampo(eventId){
    const m = this.match(eventId);
    return m ? Object.values(m.titulares).filter(Boolean) : [];
  },
  posicionDe(eventId, pid){
    const m = this.match(eventId);
    if(!m) return null;
    const k = Object.keys(m.titulares).find(k=>m.titulares[k]===pid);
    return k ? HUECOS(m.formacion).find(p=>p.id===k) : null;
  },
  /** Elimina a un jugador de cualquier hueco o del banquillo. */
  quitarDeAlineacion(m, pid){
    Object.keys(m.titulares).forEach(k=>{ if(m.titulares[k]===pid) delete m.titulares[k]; });
    m.banquillo = m.banquillo.filter(x=>x!==pid);
  },
  ponerTitular(eventId, posId, pid){
    const comp = this.comprometidos(eventId);
    if(comp[pid]) throw new Error('Ya está convocado con '+comp[pid].nombre+' ese día');
    const m = this.ensureMatch(eventId);
    this.quitarDeAlineacion(m, pid);
    m.titulares[posId] = pid;
    DB.save();
  },
  vaciarHueco(eventId, posId){
    const m = this.ensureMatch(eventId);
    delete m.titulares[posId]; DB.save();
  },
  aBanquillo(eventId, pid){
    const comp = this.comprometidos(eventId);
    if(comp[pid]) throw new Error('Ya está convocado con '+comp[pid].nombre+' ese día');
    const m = this.ensureMatch(eventId);
    this.quitarDeAlineacion(m, pid);
    m.banquillo.push(pid); DB.save();
  },
  sacarDeConvocatoria(eventId, pid){
    const m = this.ensureMatch(eventId);
    this.quitarDeAlineacion(m, pid); DB.save();
  },
  /** Rellena los huecos libres con los disponibles según su posición habitual. */
  autoAlinear(eventId){
    const m = this.ensureMatch(eventId);
    const poss = POSICIONES(m.formacion);
    const usados = new Set([...Object.values(m.titulares), ...m.banquillo]);
    const libres = this.disponibles(eventId)
      .filter(p=>!usados.has(p.id) && p.rsvp!=='no' && !p.lesionado && !p.ocupado);
    // se rellena por nivel de encaje: puesto exacto, luego línea, luego grupo
    [3,2,1].forEach(nivel=>{
      poss.forEach(pos=>{
        if(m.titulares[pos.id]) return;
        const i = libres.findIndex(p=>this.encaje(p.id,pos.pos).nivel===nivel);
        if(i>=0){ m.titulares[pos.id] = libres[i].id; libres.splice(i,1); }
      });
    });
    // y lo que quede, por orden, priorizando a los del propio grupo
    poss.forEach(pos=>{
      if(m.titulares[pos.id] || !libres.length) return;
      const i = libres.findIndex(p=>!p.origen);
      m.titulares[pos.id] = libres.splice(i>=0?i:0,1)[0].id;
    });
    libres.forEach(p=>{ if(!m.banquillo.includes(p.id)) m.banquillo.push(p.id); });
    DB.save();
    return m;
  },
  cambiarFormacion(eventId, f){
    const m = this.ensureMatch(eventId);
    const fuera = [];
    HUECOS(m.formacion).forEach(p=>{
      if(m.titulares[p.id] && !HUECOS(f).some(x=>x.id===p.id)){
        fuera.push(m.titulares[p.id]); delete m.titulares[p.id];
      }
    });
    fuera.forEach(pid=>{ if(!m.banquillo.includes(pid)) m.banquillo.push(pid); });
    m.formacion = f; DB.save();
  },

  /* ---------- reloj ---------- */
  minutoActual(m){
    if(m.estado!=='jugando' || !m.arrancado) return m.minuto;
    return m.minuto + Math.floor((Date.now()-m.arrancado)/60000);
  },
  arrancar(eventId){
    const m = this.ensureMatch(eventId);
    if(m.estado==='previo'){ m.minuto=0; m.parte=1; }
    if(m.estado==='descanso'){ m.parte=2; m.minuto=m.duracion_parte; }
    m.estado='jugando'; m.arrancado=Date.now(); DB.save(); return m;
  },
  pausar(eventId){
    const m = this.ensureMatch(eventId);
    m.minuto = this.minutoActual(m); m.arrancado=null;
    m.estado = m.parte===1 ? 'descanso' : 'final';
    DB.save(); return m;
  },
  reanudarPausa(eventId){
    const m = this.ensureMatch(eventId);
    m.minuto = this.minutoActual(m); m.arrancado=null; m.estado='pausa'; DB.save();
  },
  ajustarMinuto(eventId, min){
    const m = this.ensureMatch(eventId);
    m.minuto = Math.max(0, min); m.arrancado = m.estado==='jugando' ? Date.now() : null;
    DB.save();
  },
  reiniciarPartido(eventId){
    const m = this.ensureMatch(eventId);
    m.acciones=[]; m.estado='previo'; m.parte=1; m.minuto=0; m.arrancado=null;
    m.puntos_favor=0; m.puntos_contra=0; DB.save();
  },

  /* ---------- acciones ---------- */
  addAccion(eventId, a){
    const m = this.ensureMatch(eventId);
    const min = a.minuto !== undefined ? a.minuto : this.minutoActual(m);
    const ac = { id:uid('ac'), minuto:min, parte:m.parte, ...a };
    m.acciones.push(ac);
    m.acciones.sort((x,y)=>x.minuto-y.minuto);
    if(a.tipo==='punto'){
      if(a.contra) m.puntos_contra += a.valor; else m.puntos_favor += a.valor;
    }
    if(a.tipo==='cambio'){
      // el que sale va al banquillo, el que entra ocupa su hueco
      const k = Object.keys(m.titulares).find(k=>m.titulares[k]===a.sale);
      if(k) m.titulares[k] = a.entra;
      m.banquillo = m.banquillo.filter(x=>x!==a.entra);
      if(!m.banquillo.includes(a.sale)) m.banquillo.push(a.sale);
    }
    DB.save(); return ac;
  },
  borrarAccion(eventId, id){
    const m = this.ensureMatch(eventId);
    const a = m.acciones.find(x=>x.id===id);
    if(!a) return;
    if(a.tipo==='punto'){
      if(a.contra) m.puntos_contra -= a.valor; else m.puntos_favor -= a.valor;
    }
    if(a.tipo==='cambio'){
      const k = Object.keys(m.titulares).find(k=>m.titulares[k]===a.entra);
      if(k) m.titulares[k] = a.sale;
      m.banquillo = m.banquillo.filter(x=>x!==a.sale);
      if(!m.banquillo.includes(a.entra)) m.banquillo.push(a.entra);
    }
    m.acciones = m.acciones.filter(x=>x.id!==id);
    DB.save();
  },

  /** Minutos jugados por cada convocado, a partir de la cronología. */
  minutosJugados(eventId){
    const m = this.match(eventId);
    if(!m) return [];
    const fin = m.estado==='final' ? m.duracion_parte*2 : this.minutoActual(m);
    const cambios = m.acciones.filter(a=>a.tipo==='cambio');
    // reconstruimos la alineación inicial deshaciendo los cambios
    const inicial = { ...m.titulares };
    [...cambios].reverse().forEach(c=>{
      const k = Object.keys(inicial).find(k=>inicial[k]===c.entra);
      if(k) inicial[k] = c.sale;
    });
    const arranca = new Set(Object.values(inicial).filter(Boolean));
    const todos = new Set([...arranca, ...m.banquillo,
      ...cambios.map(c=>c.entra), ...cambios.map(c=>c.sale)]);
    const rojas = m.acciones.filter(a=>a.tipo==='tarjeta' && a.color==='roja');

    return [...todos].map(pid=>{
      let min = 0, desde = arranca.has(pid) ? 0 : null;
      cambios.filter(c=>c.entra===pid || c.sale===pid)
        .sort((a,b)=>a.minuto-b.minuto)
        .forEach(c=>{
          if(c.entra===pid && desde===null) desde = c.minuto;
          else if(c.sale===pid && desde!==null){ min += c.minuto-desde; desde=null; }
        });
      const roja = rojas.find(r=>r.player===pid);
      if(roja && desde!==null){ min += Math.max(0,roja.minuto-desde); desde=null; }
      if(desde!==null) min += Math.max(0, fin-desde);
      return { player_id:pid, minutos:min, titular:arranca.has(pid) };
    }).sort((a,b)=>b.minutos-a.minutos);
  },

  /** Resumen agregado de la temporada por jugador. */
  resumenTemporada(teamId){
    const d = DB.load();
    const ms = (d.matches||[]).filter(m=>m.team_id===teamId && m.estado==='final');
    const acc = {};
    const add = (pid,k,v=1)=>{
      if(!acc[pid]) acc[pid]={ partidos:0, minutos:0, ensayos:0, puntos:0, tarjetas:0 };
      acc[pid][k]+=v;
    };
    ms.forEach(m=>{
      this.minutosJugados(m.event_id).forEach(x=>{
        if(x.minutos>0){ add(x.player_id,'partidos'); add(x.player_id,'minutos',x.minutos); }
      });
      m.acciones.forEach(a=>{
        if(a.tipo==='punto' && a.player && !a.contra){
          add(a.player,'puntos',a.valor);
          if(a.clase==='ensayo') add(a.player,'ensayos');
        }
        if(a.tipo==='tarjeta' && a.player) add(a.player,'tarjetas');
      });
    });
    return { partidos:ms.length, jugadores:acc, lista:ms };
  },

  events(teamId, { pasados=false } = {}){
    const d = DB.load();
    const now = Date.now();
    return d.events
      .filter(e=>!teamId || e.team_id===teamId)
      .filter(e=> pasados ? new Date(e.inicio).getTime() < now
                          : new Date(e.inicio).getTime() >= now - 6*3600e3)
      .sort((a,b)=> pasados ? new Date(b.inicio)-new Date(a.inicio)
                            : new Date(a.inicio)-new Date(b.inicio));
  },
  event(id){ return DB.load().events.find(e=>e.id===id); },

  createEvent(ev){
    const d = DB.load();
    if(!ev.team_id) throw new Error('Falta el equipo');
    if(!ev.inicio) throw new Error('Falta la fecha y la hora');
    const e = { id:uid('ev'), rsvp_abierto:true, creado_por:this.ses.userId, ...ev };
    d.events.push(e);
    // se genera el RSVP de toda la plantilla
    this.teamPlayers(e.team_id).forEach(p=>{
      d.rsvp.push({ id:uid('r'), event_id:e.id, player_id:p.id,
        estado:'sin_responder', recordatorios:0 });
    });
    // aviso a las familias
    this.teamPlayers(e.team_id).forEach(p=>{
      this.guardiansOf(p.id).forEach(g=>{
        if(g.user_id) this.notify(g.user_id, 'Nuevo '+(e.tipo==='partido'?'partido':'entrenamiento'),
          'Confirma la asistencia de '+p.nombre.split(' ')[0]);
      });
    });
    DB.save(); return e;
  },
  updateEvent(id, patch){
    const e = this.event(id); if(e) Object.assign(e, patch); DB.save();
  },
  /** Avisa a las familias de que un evento ha cambiado de fecha u hora. */
  avisarCambioEvento(id){
    const e = this.event(id);
    const esPartido = e.tipo==='partido';
    this.teamPlayers(e.team_id).forEach(p=>{
      const txt = (esPartido?'El partido':'El entrenamiento')+
        ' pasa al '+new Date(e.inicio).toLocaleString('es-ES',
          { weekday:'long', day:'numeric', month:'long',
            hour:'2-digit', minute:'2-digit' });
      this.guardiansOf(p.id).forEach(g=>{
        if(g.user_id) this.notify(g.user_id,'Cambio de horario', txt);
      });
      if(p.user_id) this.notify(p.user_id,'Cambio de horario', txt);

      this.correosDe(p.id).forEach(c=>this.correo('cambioHorario', {
        destinatarioEmail:c.email, destinatario:c.nombre || c.email,
        club:this.clubNombre(), tipoEvento:esPartido?'partido':'entrenamiento',
        nombreEvento:e.titulo || (esPartido?'Partido':'Entrenamiento'),
        cuando:this.fechaLarga(e.inicio),
        lugar:e.lugar || e.local || '', enlace:this.appUrl()
      }));
    });
    DB.save();
  },
  deleteEvent(id){
    const d = DB.load();
    d.events = d.events.filter(e=>e.id!==id);
    d.rsvp = d.rsvp.filter(r=>r.event_id!==id);
    d.callups = d.callups.filter(c=>c.event_id!==id);
    d.attendance = d.attendance.filter(a=>a.event_id!==id);
    DB.save();
  },

  rsvpOf(eid, pid){ return DB.load().rsvp.find(r=>r.event_id===eid && r.player_id===pid); },
  rsvpList(eid){ return DB.load().rsvp.filter(r=>r.event_id===eid); },
  tally(eid){
    const l = this.rsvpList(eid);
    return { si:l.filter(r=>r.estado==='si').length,
             no:l.filter(r=>r.estado==='no').length,
             duda:l.filter(r=>r.estado==='duda').length,
             sin:l.filter(r=>r.estado==='sin_responder').length,
             total:l.length };
  },
  setRsvp(eid, pid, estado, motivo=null){
    const d = DB.load();
    let r = d.rsvp.find(x=>x.event_id===eid && x.player_id===pid);
    if(!r){ r = { id:uid('r'), event_id:eid, player_id:pid, recordatorios:0 };
      d.rsvp.push(r); }
    r.estado = estado; r.motivo = motivo;
    r.at = new Date().toISOString(); r.by = this.ses.userId;
    DB.save(); return r;
  },
  /** Recuerda SOLO a quien no ha respondido. */
  remind(eid){
    const d = DB.load();
    const pend = d.rsvp.filter(r=>r.event_id===eid && r.estado==='sin_responder');
    const ev = this.event(eid);
    const esPartido = ev && ev.tipo==='partido';

    // Para el correo se agrupa por tutor: si tiene dos hijos sin responder en
    // el mismo evento, recibe un correo, no dos.
    const porTutor = new Map();
    pend.forEach(r=>{
      const p = this.player(r.player_id);
      const nombre = p ? p.nombre.split(' ')[0] : '';
      this.correosDe(r.player_id).forEach(c=>{
        const prev = porTutor.get(c.email);
        if(prev) prev.nombres.push(nombre);
        else porTutor.set(c.email, { ...c, nombres:[nombre] });
      });
    });

    pend.forEach(r=>{
      r.recordatorios = (r.recordatorios||0)+1;
      const p = this.player(r.player_id);
      this.guardiansOf(r.player_id).forEach(g=>{
        if(g.user_id) this.notify(g.user_id, 'Falta tu confirmación',
          (p?p.nombre.split(' ')[0]+': ':'')+'confirma si vas al '+
          (esPartido?'partido':'entrenamiento'));
      });
      const self = this.player(r.player_id);
      if(self?.user_id) this.notify(self.user_id,'Falta tu confirmación','Responde cuando puedas');
    });

    if(ev && porTutor.size){
      const cuando = this.fechaLarga(ev.inicio);
      porTutor.forEach(c=>{
        this.correo('recordatorio', {
          destinatarioEmail:c.email, destinatario:c.nombre || c.email,
          club:this.clubNombre(), tipoEvento:esPartido?'partido':'entrenamiento',
          cuando, lugar:ev.lugar || ev.local || '',
          nombres:c.nombres.join(', '), nombresPlural:c.nombres.length > 1,
          enlace:this.appUrl()
        });
      });
    }

    DB.save(); return pend.length;
  },

  callups(eid){ return DB.load().callups.filter(c=>c.event_id===eid); },
  setCallups(eid, ids){
    const d = DB.load();
    d.callups = d.callups.filter(c=>c.event_id!==eid);
    const ev = this.event(eid);
    const esPartido = ev && ev.tipo==='partido';
    ids.forEach(pid=>{
      d.callups.push({ id:uid('cu'), event_id:eid, player_id:pid });
      const p = this.player(pid);
      this.guardiansOf(pid).forEach(g=>{
        if(g.user_id) this.notify(g.user_id,'Convocatoria',
          (p?p.nombre.split(' ')[0]:'')+' está convocado');
      });
      if(p?.user_id) this.notify(p.user_id,'Estás convocado','Revisa la hora de citación');

      this.correosDe(pid).forEach(c=>this.correo('convocatoria', {
        destinatarioEmail:c.email, destinatario:c.nombre || c.email,
        club:this.clubNombre(),
        nombres:p ? p.nombre.split(' ')[0] : '',
        textoConvocatoria: esPartido ? 'está convocado al partido'
                                : 'está convocado al entrenamiento',
        cuando:ev ? this.fechaLarga(ev.inicio) : '',
        lugar:ev ? (ev.lugar || ev.local || '') : '',
        enlace:this.appUrl()
      }));
    });
    DB.save();
  },

  attendance(eid){ return DB.load().attendance.filter(a=>a.event_id===eid); },
  setAttendance(eid, pid, estado){
    const d = DB.load();
    let a = d.attendance.find(x=>x.event_id===eid && x.player_id===pid);
    if(!a){ a = { id:uid('at'), event_id:eid, player_id:pid }; d.attendance.push(a); }
    a.estado = estado; a.by = this.ses.userId; a.at = new Date().toISOString();
    DB.save();
  },
  attStats(pid){
    const all = DB.load().attendance.filter(a=>a.player_id===pid);
    const ok = all.filter(a=>['presente','tarde'].includes(a.estado)).length;
    return { total:all.length, ok, pct: all.length ? Math.round(ok/all.length*100) : null };
  },
  teamAttAvg(teamId){
    const v = this.teamPlayers(teamId).map(p=>this.attStats(p.id).pct).filter(x=>x!==null);
    return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length) : null;
  },

  /* ============================================================
     ENTRENAMIENTO
     ============================================================ */
  drills(){ return DB.load().drills; },
  addDrill(x){ const d=DB.load(); const dr={ id:uid('dr'), ...x }; d.drills.push(dr);
    DB.save(); return dr; },
  sessions(teamId){
    return DB.load().sessions.filter(s=>!teamId||s.team_id===teamId)
      .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  },
  sessionDrills(sid){
    const d = DB.load();
    return d.sessionDrills.filter(x=>x.session_id===sid).sort((a,b)=>a.orden-b.orden)
      .map(x=>({ ...x, drill:d.drills.find(dr=>dr.id===x.drill_id) }));
  },
  createSession(s, drillIds){
    const d = DB.load();
    const ses = { id:uid('se'), creado_por:this.ses.userId, ...s };
    d.sessions.push(ses);
    drillIds.forEach((id,i)=>d.sessionDrills.push({
      id:uid('sd'), session_id:ses.id, drill_id:id, orden:i }));
    DB.save(); return ses;
  },

  evaluations(pid, soloCompartidas=false){
    let l = DB.load().evaluations.filter(e=>e.player_id===pid);
    if(soloCompartidas) l = l.filter(e=>e.compartida);
    return l.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  },
  saveEvaluation(ev){
    const d = DB.load();
    d.evaluations.push({ id:uid('ev'), fecha:today(), autor:this.ses.userId, ...ev });
    if(ev.compartida){
      const p = this.player(ev.player_id);
      const nombre = p ? p.nombre.split(' ')[0] : '';
      this.guardiansOf(ev.player_id).forEach(g=>{
        if(g.user_id) this.notify(g.user_id,'Nueva valoración',
          'El entrenador ha compartido la valoración de '+(nombre||''));
      });
      if(p?.user_id) this.notify(p.user_id,'Nueva valoración','Tu entrenador ha valorado tu progreso');

      // Por correo, solo a las familias: la valoración es el dato más delicado
      // que sale del club, y el jugador no siempre tiene cuenta.
      const lasEvals = d.evaluations.filter(x=>x.player_id===ev.player_id && x.compartida);
      const ultima = lasEvals[lasEvals.length-1];
      const nota = ultima ? Math.round(((ultima.tecnica||0)+(ultima.fisico||0)
        +(ultima.tactica||0)+(ultima.actitud||0))/4*10)/10 : null;
      this.correosDe(ev.player_id).forEach(c=>this.correo('valoracion', {
        destinatarioEmail:c.email, destinatario:c.nombre || c.email,
        club:this.clubNombre(), nombre:nombre,
        resumen: nota !== null ? `${nota} sobre 5` : 'disponible en la aplicación',
        enlace:this.appUrl()
      }));
    }
    DB.save();
  },
  /** Notas privadas: SOLO las ve su autor. */
  notes(pid){
    return DB.load().notes.filter(n=>n.player_id===pid && n.autor===this.ses.userId)
      .sort((a,b)=>new Date(b.at)-new Date(a.at));
  },
  addNote(pid, texto){
    DB.load().notes.push({ id:uid('n'), player_id:pid, autor:this.ses.userId,
      texto, at:new Date().toISOString() });
    DB.save();
  },
  injuries(pid){
    const l = DB.load().injuries;
    return pid ? l.filter(i=>i.player_id===pid) : l;
  },
  activeInjuries(teamId){
    const ids = this.teamPlayers(teamId).map(p=>p.id);
    return this.injuries().filter(i=>ids.includes(i.player_id) && i.estado!=='alta');
  },
  addInjury(x){
    DB.load().injuries.push({ id:uid('in'), desde:today(), estado:'activa', ...x });
    DB.save();
  },
  closeInjury(id){
    const i = DB.load().injuries.find(x=>x.id===id);
    if(i){ i.estado='alta'; i.hasta=today(); } DB.save();
  },
  goals(pid){ return DB.load().goals.filter(g=>g.player_id===pid); },
  addGoal(pid, texto){
    DB.load().goals.push({ id:uid('g'), player_id:pid, texto, hecho:false,
      por:this.ses.userId, at:today() });
    const p = this.player(pid);
    this.guardiansOf(pid).forEach(g=>{
      if(g.user_id) this.notify(g.user_id,'Nuevo objetivo',
        'para '+(p?p.nombre.split(' ')[0]:''));
    });
    DB.save();
  },
  toggleGoal(id){
    const g = DB.load().goals.find(x=>x.id===id);
    if(g) g.hecho = !g.hecho; DB.save();
  },

  /* ============================================================
     COMUNICACIÓN
     ============================================================ */
  posts(teamIds){
    return DB.load().posts
      .filter(p=>!p.team_id || (teamIds||[]).includes(p.team_id))
      .sort((a,b)=>new Date(b.at)-new Date(a.at));
  },
  addPost(x){
    const d = DB.load();
    const p = { id:uid('po'), autor:this.ses.userId, at:new Date().toISOString(), ...x };
    d.posts.push(p);
    const dest = p.team_id ? this.teamPlayers(p.team_id) : this.players();
    const yaAvisados = new Set();
    dest.forEach(pl=>{
      this.guardiansOf(pl.id).forEach(g=>{
        if(g.user_id) this.notify(g.user_id, p.titulo, p.cuerpo||'');
      });
      if(pl.user_id) this.notify(pl.user_id, p.titulo, p.cuerpo||'');
      // Por correo, una vez por tutor y solo si el aviso es para todo el club
      // o para su categoría: si es de otra categoría no le incumple.
      this.correosDe(pl.id).forEach(c=>{
        if(yaAvisados.has(c.email)) return;
        yaAvisados.add(c.email);
        this.correo('anuncio', {
          destinatarioEmail:c.email, destinatario:c.nombre || c.email,
          club:this.clubNombre(), titulo:p.titulo, cuerpo:p.cuerpo||'',
          urgente:!!p.urgente, enlace:this.appUrl()
        });
      });
    });
    DB.save(); return p;
  },
  tasks(teamId){ return DB.load().tasks.filter(t=>!teamId||t.team_id===teamId); },
  addTask(x){ DB.load().tasks.push({ id:uid('tk'), hecho:false, ...x }); DB.save(); },
  toggleTask(id){
    const t = DB.load().tasks.find(x=>x.id===id);
    if(t) t.hecho = !t.hecho; DB.save();
  },

  notify(userId, titulo, cuerpo){
    DB.load().notifs.push({ id:uid('nt'), user_id:userId, titulo, cuerpo,
      leido:false, at:new Date().toISOString() });
    DB.save();
    // La misma noticia sale también como push. Va aquí y no en cada sitio que
    // avisa (convocatorias, cambios de hora, anuncios, valoraciones) para que
    // añadir una notificación nueva no obligue a acordarse de las dos cosas.
    if(typeof FCM !== 'undefined') FCM.enviar(userId, { titulo, cuerpo });
  },
  notifs(){
    if(!this.ses) return [];
    return DB.load().notifs.filter(n=>n.user_id===this.ses.userId)
      .sort((a,b)=>new Date(b.at)-new Date(a.at));
  },
  unread(){ return this.notifs().filter(n=>!n.leido).length; },
  readAll(){ this.notifs().forEach(n=>n.leido=true); DB.save(); },

  /* ============================================================
     ECONÓMICO
     ============================================================ */
  invoices(filter={}){
    let l = DB.load().invoices;
    if(filter.playerIds) l = l.filter(i=>filter.playerIds.includes(i.player_id));
    if(filter.estados)   l = l.filter(i=>filter.estados.includes(i.estado));
    return l;
  },
  /** Emite las cuotas del mes para todos los inscritos. Solo junta. */
  issueInvoices(periodo){
    if(!this.is('junta')) throw new Error('Solo la tesorería puede emitir cuotas');
    const d = DB.load();
    let n = 0;
    const nuevas = [];
    d.enrollments.filter(e=>!e.baja).forEach(e=>{
      if(d.invoices.some(i=>i.player_id===e.player_id && i.periodo===periodo)) return;
      const g = this.guardiansOf(e.player_id)[0];
      const mand = g ? d.mandates.find(m=>m.guardian_id===g.id && m.firmado) : null;
      const desc = +(e.cuota*e.descuento).toFixed(2);
      const iv = { id:uid('iv'), player_id:e.player_id,
        guardian_id:g?g.id:null, periodo,
        concepto:'Cuota '+periodo, base:e.cuota, descuento:desc,
        importe:+(e.cuota-desc).toFixed(2),
        estado: mand ? 'en_proceso' : 'sin_mandato',
        emitido:today(), metodo:'SEPA', avisos:0 };
      d.invoices.push(iv);
      nuevas.push(iv);
      n++;
    });
    DB.save();

    // Aviso al tutor de cada recibo. Solo si ha firmado el mandato: si no lo ha
    // firmado todavía no hay nada que cobrar y el correo solo le frightens.
    nuevas.filter(iv => iv.estado === 'en_proceso').forEach(iv=>{
      const p = this.player(iv.player_id);
      this.correosDe(iv.player_id).forEach(c=>this.correo('cuota', {
        destinatarioEmail:c.email, destinatario:c.nombre || c.email,
        club:this.clubNombre(), periodo:iv.periodo, concepto:iv.concepto,
        importe:iv.importe.toFixed(2),
        nombres:p ? p.nombre.split(' ')[0] : '', enlace:this.appUrl()
      }));
    });

    return n;
  },
  updateInvoice(id, patch){
    const i = DB.load().invoices.find(x=>x.id===id);
    if(i) Object.assign(i, patch); DB.save();
  },
  mandate(gid){ return DB.load().mandates.find(m=>m.guardian_id===gid); },
  signMandate(gid, iban, titular){
    const d = DB.load();
    const clean = (iban||'').replace(/\s/g,'').toUpperCase();
    if(clean.length < 20 || !/^ES\d{2}/.test(clean))
      throw new Error('El IBAN no parece correcto. Debe empezar por ES y tener 24 caracteres.');
    let m = d.mandates.find(x=>x.guardian_id===gid);
    const masked = clean.slice(0,6)+' •••• •••• '+clean.slice(-4);
    if(!m){ m = { id:uid('md'), guardian_id:gid }; d.mandates.push(m); }
    Object.assign(m, { iban:masked, titular, firmado:true, at:new Date().toISOString() });
    // los recibos sin mandato pasan a proceso
    this.myPlayers().forEach(p=>{
      d.invoices.filter(i=>i.player_id===p.id && i.estado==='sin_mandato')
        .forEach(i=>i.estado='en_proceso');
    });
    DB.save(); return m;
  },

  /* ---------- documentos y cumplimiento ---------- */
  docs(){ return DB.load().docs; },
  signatures(pid){ return DB.load().signatures.filter(s=>s.player_id===pid); },
  sign(pid, docId){
    const d = DB.load();
    if(d.signatures.some(s=>s.player_id===pid && s.doc_id===docId)) return;
    d.signatures.push({ id:uid('sg'), player_id:pid, doc_id:docId,
      at:new Date().toISOString(), by:this.ses.userId });
    DB.save();
  },
  pendingDocs(pid){
    const firm = this.signatures(pid).map(s=>s.doc_id);
    return this.docs().filter(d=>d.obligatorio && !firm.includes(d.id));
  },
  certs(){
    const d = DB.load();
    return d.certs.map(c=>({ ...c, user:d.users.find(u=>u.id===c.user_id),
      teams:d.staff.filter(s=>s.user_id===c.user_id).map(s=>this.team(s.team_id)) }));
  },
  myCert(){ return DB.load().certs.find(c=>c.user_id===this.ses.userId); },
  updateCert(id, patch){
    const c = DB.load().certs.find(x=>x.id===id);
    if(c) Object.assign(c, patch); DB.save();
  },

  /* ============================================================
     CLASIFICACIONES Y ESTADÍSTICA AVANZADA
     ============================================================ */

  /** Tabla completa por jugador de un equipo. */
  tablaEquipo(teamId){
    const rt = this.resumenTemporada(teamId);
    return this.teamPlayers(teamId).map(p=>{
      const at = this.attStats(p.id);
      const x = rt.jugadores[p.id] || { partidos:0, minutos:0, ensayos:0,
                                        puntos:0, tarjetas:0 };
      const ev = this.evaluations(p.id);
      const media = ev.length
        ? (ev[0].tecnica+ev[0].fisico+ev[0].tactica+ev[0].actitud)/4 : null;
      return { player:p, asistencia:at.pct, sesiones:at.ok, convocables:at.total,
        partidos:x.partidos, minutos:x.minutos, ensayos:x.ensayos,
        puntos:x.puntos, tarjetas:x.tarjetas,
        minPorPartido: x.partidos ? Math.round(x.minutos/x.partidos) : 0,
        valoracion: media, grupo:this.grupoDe(p.id) };
    });
  },

  /** Clasificaciones del equipo. Devuelve varias listas listas para pintar. */
  clasificaciones(teamId){
    const t = this.tablaEquipo(teamId);
    const top = (campo, min=1, menorMejor=false) => t
      .filter(x=>x[campo]!==null && x[campo]!==undefined && x[campo]>=min)
      .sort((a,b)=> menorMejor ? a[campo]-b[campo] : b[campo]-a[campo])
      .slice(0,10);
    return [
      { id:'asistencia', t:'Más asistencia', u:'%', ic:'check',
        d:'Porcentaje de sesiones a las que ha acudido', lista:top('asistencia') },
      { id:'minutos', t:'Más minutos', u:"'", ic:'clock',
        d:'Minutos acumulados en partido', lista:top('minutos') },
      { id:'ensayos', t:'Más ensayos', u:'', ic:'ball',
        d:'Ensayos anotados esta temporada', lista:top('ensayos') },
      { id:'puntos', t:'Más puntos', u:'', ic:'target',
        d:'Puntos totales aportados', lista:top('puntos') },
      { id:'partidos', t:'Más partidos', u:'', ic:'trophy',
        d:'Partidos en los que ha participado', lista:top('partidos') }
    ].filter(c=>c.lista.length);
  },

  /** Estadística agregada del equipo. */
  statsEquipo(teamId){
    const d = DB.load();
    const ms = (d.matches||[]).filter(m=>m.team_id===teamId && m.estado==='final');
    const ps = this.teamPlayers(teamId);
    const g = ms.filter(m=>m.puntos_favor>m.puntos_contra).length;
    const e = ms.filter(m=>m.puntos_favor===m.puntos_contra).length;
    const pf = ms.reduce((a,m)=>a+m.puntos_favor,0);
    const pc = ms.reduce((a,m)=>a+m.puntos_contra,0);
    const ens = ms.reduce((a,m)=>a+m.acciones.filter(x=>
      x.tipo==='punto'&&x.clase==='ensayo'&&!x.contra).length,0);
    const tar = ms.reduce((a,m)=>a+m.acciones.filter(x=>x.tipo==='tarjeta').length,0);
    // transformaciones convertidas sobre ensayos
    const conv = ms.reduce((a,m)=>a+m.acciones.filter(x=>
      x.tipo==='punto'&&x.clase==='conversion'&&!x.contra).length,0);
    const att = ps.map(p=>this.attStats(p.id).pct).filter(x=>x!==null);
    // reparto de minutos: cuántos jugadores han jugado algo
    const rt = this.resumenTemporada(teamId);
    const conMin = Object.values(rt.jugadores).filter(x=>x.minutos>0).length;
    return {
      partidos:ms.length, ganados:g, empatados:e, perdidos:ms.length-g-e,
      pf, pc, dif:pf-pc,
      mediaFavor: ms.length?Math.round(pf/ms.length):0,
      mediaContra: ms.length?Math.round(pc/ms.length):0,
      ensayos:ens, tarjetas:tar,
      conversion: ens?Math.round(conv/ens*100):null,
      asistenciaMedia: att.length?Math.round(att.reduce((a,b)=>a+b,0)/att.length):null,
      plantilla:ps.length, hanJugado:conMin,
      reparto: ps.length?Math.round(conMin/ps.length*100):0,
      delanteros: ps.filter(p=>this.grupoDe(p.id)==='delantera').length,
      linea: ps.filter(p=>this.grupoDe(p.id)==='trescuartos').length,
      sinEtiquetar: ps.filter(p=>!this.posicionesDe(p.id).length).length,
      partidosLista: ms
    };
  },

  /** Huecos de la plantilla: puestos sin nadie etiquetado. */
  coberturaPuestos(teamId, formacion){
    const ps = this.teamPlayers(teamId);
    return HUECOS(formacion || FORMACION_POR_DEFECTO(this.team(teamId)?.cat?.nombre))
      .map(h=>{
        const aptos = ps.filter(p=>this.encaje(p.id,h.pos).nivel>=2);
        const exactos = ps.filter(p=>this.posicionesDe(p.id).includes(h.pos));
        return { hueco:h, exactos:exactos.length, aptos:aptos.length };
      });
  },

  /* ============================================================
     EXPORTACIÓN Y CIERRE DE TEMPORADA
     ============================================================ */
  exportarCSV(){
    const prs = this.pruebas();
    const filas = [['Nombre','Fecha nacimiento','Categoria','Grupo','Dorsal',
      'Puestos','Talla','Peso','Altura','Alergias','Tutor','Email','Telefono',
      'Cuota','Descuento','Asistencia %',
      ...prs.map(pr=>pr.t+' ('+pr.u+')')]];
    this.players().forEach(p=>{
      const t = this.playerTeam(p.id), e = this.enrollment(p.id);
      const g = this.guardiansOf(p.id)[0] || {};
      const st = this.attStats(p.id);
      const m = p.marcas || {};
      filas.push([p.nombre, p.fecha_nac||'', t?(t.cat?t.cat.nombre:t.nombre):'',
        t?(t.nivel||''):'', p.dorsal||'',
        this.posicionesDe(p.id).map(id=>POS(id)?.t).filter(Boolean).join(' / '),
        p.talla||'', p.peso||'', p.altura||'', p.alergias||'',
        g.nombre||'', g.email||'', g.tel||'',
        e?e.cuota:'', e?Math.round(e.descuento*100)+'%':'',
        st.pct===null?'':st.pct,
        ...prs.map(pr=>m[pr.id]?m[pr.id].valor:'')]);
    });
    return filas.map(f=>f.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n');
  },
  exportarJSON(){
    return JSON.stringify({ exportado:new Date().toISOString(),
      version:1, datos:DB.load() }, null, 2);
  },
  importarJSON(txt){
    if(!this.is('junta')) throw new Error('Solo la junta puede restaurar una copia');
    let j;
    try{ j = JSON.parse(txt); }catch(e){ throw new Error('El archivo no es válido'); }
    if(!j.datos || !j.datos.club) throw new Error('El archivo no contiene un club');
    DB.d = j.datos; DB.save();
    return true;
  },

  /** Cierra la temporada y promociona a los jugadores a la categoría siguiente. */
  previsualizarCierre(){
    const cats = this.categories();
    return this.players().map(p=>{
      const t = this.playerTeam(p.id);
      const i = cats.findIndex(c=>c.id===t?.cat_id);
      const sig = (i>=0 && i<cats.length-1) ? cats[i+1] : null;
      return { player:p, de:t, a:sig ? this.teams().find(x=>x.cat_id===sig.id) : null };
    });
  },
  cerrarTemporada(nombreNueva, movimientos){
    if(!this.is('junta')) throw new Error('Solo la junta puede cerrar la temporada');
    const d = DB.load();
    if(!d.historico) d.historico = [];
    d.historico.push({ temporada:d.season.nombre, cerrada:today(),
      jugadores:d.players.length, partidos:(d.matches||[]).length });
    d.season = { id:uid('sea'), nombre:nombreNueva, activa:true };
    let subidos=0, bajas=0;
    movimientos.forEach(m=>{
      if(m.accion==='baja'){ this.removePlayer(m.player_id); bajas++; }
      else if(m.accion==='sube' && m.team_id){
        const e = this.enrollment(m.player_id);
        const t = this.team(m.team_id);
        if(e){ e.team_id=m.team_id; e.cuota=t?.cat?.cuota||e.cuota; subidos++; }
      }
    });
    // la nueva temporada arranca sin eventos ni recibos, pero conserva fichas
    d.events=[]; d.rsvp=[]; d.callups=[]; d.attendance=[]; d.matches=[];
    d.invoices=[]; d.tasks=[];
    DB.save();
    return { subidos, bajas };
  },

  log(accion, meta){
    DB.load().audit.push({ id:uid('a'), user:this.ses?.userId, accion, meta,
      at:new Date().toISOString() });
  },

  /* ---------- progreso de puesta en marcha (checklist de la junta) ---------- */
  setupSteps(){
    const d = DB.load();
    return [
      { k:'club',  t:'Crear el club y las categorías', done: !!d.club },
      { k:'coach', t:'Invitar al cuerpo técnico',      done: d.members.some(m=>m.rol==='entrenador') },
      { k:'assign',t:'Asignar cada entrenador a su equipo', done: d.staff.length>0 },
      { k:'fam',   t:'Compartir el código con las familias', done: d.members.some(m=>m.rol==='familia') },
      { k:'play',  t:'Primeros deportistas inscritos',  done: d.players.length>0 },
      { k:'ev',    t:'Primer entrenamiento convocado',  done: d.events.length>0 }
    ];
  }
};
