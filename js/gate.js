/* ============================================================================
   Acceso: fundación del club, registro con código, inicio de sesión
   ----------------------------------------------------------------------------
   Patrón de onboarding aplicado:
   - Self-selection al inicio: "¿qué eres?" antes de pedir nada.
   - Dos pantallas obligatorias como máximo antes del primer valor.
   - El código se valida ANTES de pedir datos personales, para que nadie
     rellene un formulario entero y descubra al final que no puede entrar.
   - El rol no se elige: lo determina el código. Así nadie se registra
     como entrenador por su cuenta.
   ============================================================================ */

const Gate = {
  step: null,     // null | 'elegir' | 'codigo' | 'datos' | 'login' | 'fundar'
  rolDetectado: null,
  invite: null,
  err: null,
  busy: false,
  pendienteGoogle: null,   // {nombre, email} cuando se ha entrado con Google
  googlePid: false,        // evita pedir los datos de Google en cada repintado
  /* El estado del asistente va en `asistente`, no en `fundar`: en un literal de
     objeto, si una clave se repite gana la ultima, y aqui `fundar` esta tambien
     como metodo que pinta la pantalla. Con el estado en `fundar` lo machacaba el
     metodo, `this.asistente.cats` era undefined y el alta del club reventaba. */
  asistente: { n:1, club:{}, cats:[...CAT_PRESET] },

  reset(s){ this.step=s; this.err=null; Shell.render(); },

  /* Repintar rehace el DOM entero, asi que los inputs se quedan vacios. Con
     Enter se notaba mucho: al darle a Intro la casilla de la contrasena se
     vaciaba sola. Esto vuelve a poner el valor DESPUES de repintar, de modo
     que la contrasena no llega a meterse en el HTML. */
  repintar(id, valor, extra){
    Shell.render();
    if(id && valor){ const e = document.getElementById(id); if(e) e.value = valor; }
    if(extra && extra.id){
      const e2 = document.getElementById(extra.id); if(e2) e2.value = extra.valor||'';
    }
  },

  /** Muestra u oculta la contrasena. El boton cambia de icono y de etiqueta
      para los lectores de pantalla, no solo de aspecto. */
  verPass(id, btn){
    const e = document.getElementById(id); if(!e) return;
    const ver = e.type === 'password';
    e.type = ver ? 'text' : 'password';
    btn.innerHTML = ver ? I.eyeOff(20) : I.eye(20);
    btn.classList.toggle('on', ver);
    btn.setAttribute('aria-label', ver ? 'Ocultar la contrasena' : 'Ver la contrasena');
    btn.setAttribute('aria-pressed', ver ? 'true' : 'false');
    e.focus();
  },

  /** Campo de contrasena con su boton de "verla". `onenter` es lo que pasa
      al pulsar Intro, para no repetir el atributo en cada pantalla. */
  campoPass({ id, etiqueta, autocomplete, onenter, ayuda, placeholder }){
    return `
    <div class="f pw">
      <label for="${id}">${etiqueta}</label>
      <div class="pw-box">
        <input class="in" id="${id}" type="password"${placeholder?` placeholder="${placeholder}"`:''}
          autocomplete="${autocomplete}"${onenter?` onkeydown="${onenter}"`:''}>
        <button type="button" class="pw-btn" aria-label="Ver la contrasena"
          aria-pressed="false" onclick="Gate.verPass('${id}', this)">${I.eye(20)}</button>
      </div>
      ${ayuda ? `<div class="help">${ayuda}</div>` : ''}
    </div>`;
  },

  /** Crea la cuenta o, si ya existe, entra con ella. Hace falta para el
      reintento: al fundar, la cuenta de Supabase se crea ANTES que el club, y
      si el club falla la cuenta se queda a medias. Al reintentar, Volver a
      crear la cuenta da error de "ya existe"; con esto se reutiliza. */
  async registrarOCrear(email, password, nombre){
    try{
      return await Backend.registrar({ email, password, nombre });
    }catch(e){
      try{
        const r = await Backend.entrarConPassword(email, password);
        return { uid: r.uid, pendiente: false, yaExistia: true };
      }catch(e2){
        throw e;   // Se enseña el error que explica de verdad el problema.
      }
    }
  },

  /** Olvida la cuenta de Google pendiente. Al volver al inicio, quien entre
      otra vez con Google tiene que poder leer de nuevo su nombre y email. */
  resetearGoogle(){ this.pendienteGoogle=null; this.googlePid=false; },

  /** Botón de Google. Solo aparece si hay servidor y hay cliente OAuth. */
  conGoogle(){
    return backendListo() && !!(Backend.cfg||{}).googleClientId;
  },

  /** Cuando hay sesión abierta pero ningún permiso en el club (por ejemplo
      alguien que acaba de entrar con Google), el único camino posible es un
      código. Se fuerza esa pantalla.

      Antes se salía con `if(!Data.clubExists()) return;`, y ese era justo el
      caso roto: al fallar la fundación no queda club en local, asi que nunca
      saltaba la pantalla de código y el usuario se quedaba sin salida. Ahora
      se muestra siempre. Sin club en local no hay riesgo: validar el código
      pide la identidad del club al servidor y la anota. */
  revisarSesion(){
    if(!backendListo() || !Backend.uid) return;
    if(Data.myRoles().length) return;
    /* Solo se fuerza al LLEGAR a la puerta (step null). Re-forzarlo en cada
       repintado rompia el boton de Volver: dabas a Volver, la pantalla
       volvia a aparecer y parecia que el boton no funcionaba. */
    if(this.step !== null) return;
    /* Sin club delante no hay codigos que escribir: los crea la junta, y sin
       junta no hay codigos. Quien tiene cuenta pero ningun rol y ningun club
       es el FUNDADOR: la pantalla de bienvenida le deja fundar. Antes se le
       forzaba aqui la pantalla de codigo y quedaba atrapado pidiendo un
       codigo que nadie podia darle. Cuando el club SI existe (alguien lo
       creo) y a esta cuenta le falta el rol, si toca la pantalla de codigo. */
    if(!Data.clubExists()) return;
    this.step = 'codigo';
    this.cargarCuentaGoogle();
  },

  /* El nombre y el email de la cuenta de Google no están en el dispositivo:
     hay que preguntarlos al servidor. Se piden una sola vez y, cuando llegan,
     se repinta la pantalla. Guardar la Promise aquí era un error: `pendiente-
     Google` quedaba siendo un Promise, no un objeto, y al pintarlo aparecía
     "Has entrado con undefined". */
  cargarCuentaGoogle(){
    if(this.googlePid || this.pendienteGoogle) return;
    this.googlePid = true;
    this.cuentaGoogle().then(c => {
      this.googlePid = false;
      if(c) this.pendienteGoogle = c;
      if(this.step === 'codigo') Shell.render();
    }).catch(()=>{ this.googlePid = false; });
  },

  async cuentaGoogle(){
    const u = await Backend.usuarioActual();
    if(!u) return null;
    const md = u.user_metadata || {};
    return { nombre: md.nombre || md.full_name || md.name || u.email || '',
             email: u.email || '' };
  },

  render(){
    this.revisarSesion();
    const hayClub = Data.clubExists();
    if(this.step === null) this.step = hayClub ? 'elegir' : 'bienvenida';

    return `<div class="gate">
      <div class="gate-hero">
        <div class="gate-crest">${crest(72)}</div>
        <h1>${hayClub ? esc(Data.club().nombre) : 'Rugby Club Cornellà'}</h1>
        <div class="gate-est">Des de 1931</div>
      </div>
      <div class="gate-body"><div class="gate-inner">
        ${this.err ? `<div class="alert alert-bad">${I.warn(16)}<span>${esc(this.err)}</span></div>` : ''}
        ${this[this.step] ? this[this.step]() : ''}
      </div></div>
    </div>`;
  },

  /* ---------- primer arranque: no hay club ---------- */
  bienvenida(){ return `
    <h2>Pon en marcha el club</h2>
    <p class="lead">Todavía no hay ningún club creado en esta aplicación.
      Si eres de la junta directiva, empieza tú.</p>
    ${hint('Quien crea el club queda como administrador y es quien reparte '+
      'los códigos de acceso al resto: cuerpo técnico y familias.')}
    <button class="btn btn-accent" onclick="Gate.reset('fundar')">
      ${I.plus(18)} Crear el club</button>
    <div class="t-sec">Ya me han dado un código</div>
    <button class="choice" onclick="Gate.reset('codigo')">
      <span class="ci">${I.key(20)}</span>
      <span class="ct"><b>Tengo un código del club</b>
        <span>Para familias, jugadores y cuerpo técnico</span></span>
      <span class="cg">${I.chevron(18)}</span>
    </button>
    ${hint('Si ya te registraste antes, entra con tu cuenta: es más rápido que '+
      'volver a escribir el código.')}
    <div class="links">
      <button class="link" onclick="Gate.reset('login')">Ya tengo cuenta</button>
    </div>`;
  },

  /* ---------- self-selection ---------- */
  elegir(){ return `
    <h2>Entra en el club</h2>
    <p class="lead">Elige cómo participas para llevarte al sitio correcto.</p>
    <button class="choice" onclick="Gate.reset('login')">
      <span class="ci">${I.lock(20)}</span>
      <span class="ct"><b>Ya tengo cuenta</b><span>Entrar con mi email</span></span>
      <span class="cg">${I.chevron(18)}</span>
    </button>
    ${this.botonGoogle()}
    <div class="t-sec">Primera vez</div>
    <button class="choice" onclick="Gate.reset('codigo')">
      <span class="ci">${I.key(20)}</span>
      <span class="ct"><b>Tengo un código del club</b>
        <span>Para familias, jugadores y cuerpo técnico</span></span>
      <span class="cg">${I.chevron(18)}</span>
    </button>
    ${hint('¿No tienes código? Las familias lo reciben alcribir a su hijo. '+
      'El cuerpo técnico lo recibe de la junta directiva.')}`;
  },

  botonGoogle(){
    if(!this.conGoogle()) return '';
    return `<button class="choice" onclick="Gate.google()" style="margin-top:8px">
      <span class="ci" style="font-weight:800;font-size:16px;color:var(--t2)">G</span>
      <span class="ct"><b>Continuar con Google</b>
        <span>Sin contraseña, con tu cuenta de Gmail</span></span>
      <span class="cg">${I.chevron(18)}</span>
    </button>`;
  },

  async google(){
    if(this.busy) return;
    this.busy = true; this.err = null; Shell.render();
    try{
      await Backend.entrarConGoogle();
    }catch(e){
      this.err = e.message || 'No se ha podido conectar con Google';
      this.busy = false; Shell.render();
    }
    // Si todo va bien, el navegador se va y no se vuelve aquí.
  },

  /* ---------- paso 1: validar el código ANTES de pedir datos ---------- */
  codigo(){ return `
    <button class="back" onclick="Gate.reset('elegir')">${I.chevL(16)} Volver</button>
    <h2>Tu código de acceso</h2>
    <p class="lead">Son 6 letras y números. Te lo ha dado el club.</p>
    ${this.pendienteGoogle ? `<div class="alert alert-ok">${I.check(16)}
      <span>Has entrado con <strong>${esc(this.pendienteGoogle.email)}</strong>.
        Escribe el código que te ha dado el club para activarlo.</span></div>` : ''}
    <div class="f">
      <input class="in code" id="gCode" maxlength="6" autocomplete="off"
             autocapitalize="characters" placeholder="ABC123"
             oninput="this.value=this.value.toUpperCase()"
             onkeydown="if(event.key==='Enter')Gate.checkCode()">
      <div class="help">El código determina tu perfil dentro de la aplicación.
        No se puede elegir a mano.</div>
    </div>
    <button class="btn" onclick="Gate.checkCode()" ${this.busy?'disabled':''}>
      ${this.busy?'Comprobando…':'Comprobar código'}</button>
    <div class="links">
      <button class="link" onclick="Gate.reset('login')">Ya tengo cuenta</button>
    </div>`;
  },

  async checkCode(){
    if(this.busy) return;
    const c = val('gCode');
    if(!c){ this.err='Escribe el código que te ha dado el club'; return Shell.render(); }
    this.busy = true; this.err = null; Shell.render();
    try{
      /* Movil nuevo: no hay sesion todavia (la cuenta se crea en el paso
         siguiente). redeem_invite() es una funcion de seguridad y pide sesion,
         asi que aqui daria "Inicia sesion para comprobar el codigo" y un
         invitado nuevo no tendria forma de pasar: ni puede registrarse ni tiene
         cuenta con la que entrar. Cuando no hay sesion se pregunta con
         club_by_code(), que si acepta anon: comprueba el codigo, dice de que rol
         va el alta y deja el club copiado del servidor con sus ids, que si no al
         subir los datos escribiria sobre un club inexistente.

         Lo que decide el camino es la SESION, no que haya club en el movil. Al
         arrancar, la nube descarga igualmente el club (la tabla es publica), de
         modo que un movil recien estrenado ya lo tiene guardado y mirando solo
         `Data.clubExists()` cualquier invitado caia en redeem_invite, que le
         decia que inicie sesion: es decir, justo a quien no puede. */
      if(backendListo() && (!Backend.uid || !Data.clubExists())){
        const club = await Backend.clubPorCodigo(c);
        if(!club || !club.ok){
          this.err = (club && club.error) || 'Ese código no existe';
          this.busy = false; return Shell.render();
        }
        Data.seedClubDesdeServidor(club);
        this.rolDetectado = club.rol;
        this.invite = { code:c, rol:club.rol, team_id:club.team_id };
      } else {
        const r = backendListo() ? await Backend.comprobarCodigo(c) : Data.peekCode(c);
        if(!r.ok){ this.err = r.error; this.busy=false; return Shell.render(); }
        this.rolDetectado = r.rol;
        // En la nube solo hace falta el equipo: el contador de usos lo lleva el
        // servidor, y la tabla de códigos no es editable fuera de la junta.
        this.invite = backendListo() ? { code:c, rol:r.rol, team_id:r.team_id }
                                     : r.invite;
      }
      this.err = null;
      this.step = 'datos';
    }catch(e){
      this.err = this.msgDeCodigo(e);
    }
    this.busy = false;
    Shell.render();
  },

  /* El RPC contesta con su propio texto; se traduce solo si parece un fallo
     técnico, para no tapar el mensaje de "código caducado" o "ya usado". */
  msgDeCodigo(e){
    const m = (e && e.message) || '';
    if(/function .* does not exist/i.test(m))
      return 'El servidor todavía no tiene instaladas las funciones del club. '+
             'Avisa a la persona que lo administra.';
    return m || 'No se ha podido comprobar el código';
  },

  /* ---------- paso 2: datos, ya sabiendo el rol ---------- */
  datos(){
    const R = ROLES[this.rolDetectado];
    const g = this.pendienteGoogle;
    /* Si vienes de Google mandan sus datos; si no, se recuperan de lo que
       habia escrito, porque un error al validar repinta el formulario entero
       y sin esto perderia todo lo tecleado. */
    const nombre = g ? g.nombre : (this.vNombre || '');
    const email  = g ? g.email  : (this.vEmail  || '');
    return `
    <button class="back" onclick="Gate.reset('codigo')">${I.chevL(16)} Cambiar de código</button>
    <div class="alert alert-ok">${I.check(16)}
      <span>Código correcto. Vas a crear tu cuenta como
        <strong>${esc(R.t.toLowerCase())}</strong>.</span></div>
    <h2>${g?'Completa tu perfil':'Crea tu cuenta'}</h2>
    <p class="lead">${esc(R.d)}.</p>
    <div class="f">
      <label for="rN">Nombre y apellidos</label>
      <input class="in" id="rN" autocomplete="name" placeholder="Marta Soler Vidal"
        value="${esc(nombre)}">
    </div>
    <div class="f">
      <label for="rE">Email</label>
      <input class="in" id="rE" type="email" inputmode="email" autocomplete="email"
        value="${esc(email)}" ${g?'readonly':''}>
      <div class="help">Lo usarás para entrar y recibir los avisos del club.</div>
    </div>
    <div class="f">
      <label for="rT">Teléfono ${this.rolDetectado==='familia'?'':'<span class="muted">(opcional)</span>'}</label>
      <input class="in" id="rT" type="tel" inputmode="tel" autocomplete="tel">
    </div>
    ${g ? '' : this.campoPass({ id:'rP', etiqueta:'Contraseña',
      autocomplete:'new-password', ayuda:'Mínimo 8 caracteres.',
      onenter:"if(event.key==='Enter')Gate.doRegister()" })}
    <label class="check">
      <input type="checkbox" id="rOk">
      <span>He leído y acepto la política de privacidad del club. Si inscribo a
        menores, confirmo que soy su tutor legal.</span>
    </label>
    <button class="btn btn-accent" style="margin-top:8px" onclick="Gate.doRegister()"
      ${this.busy?'disabled':''}>${this.busy?'Un momento…':'Crear mi cuenta'}</button>`;
  },

  async doRegister(){
    if(this.busy) return;
    /* Se guardan los campos antes de validar: si algo falla, el formulario se
       repinta y sin esto se perderia lo escrito. La contraseña se conserva solo
       en memoria (nunca se vuelve a pintar en el HTML) y no se pisa con el
       campo vacio que deja el repintado. */
    const passActual = valp('rP');
    if(passActual) this.vPass = passActual;
    this.vNombre = val('rN'); this.vEmail = val('rE'); this.vTel = val('rT');
    if(!chk('rOk')){ this.err='Debes aceptar la política de privacidad para continuar';
      return Shell.render(); }
    const nombre = this.vNombre, email = this.vEmail, tel = this.vTel;
    if(!this.pendienteGoogle && (this.vPass||'').length < 8){
      this.err='La contraseña debe tener al menos 8 caracteres';
      return this.repintar('rP', this.vPass); }

    this.busy = true; this.err = null; this.repintar('rP', this.vPass);
    try{
      let userId = null, resuelto = null;

      if(backendListo()){
        // 1. Cuenta en Supabase Auth (si aún no la tenía, p. ej. con Google).
        // 2. Consumo del código en el servidor: es el paso que concede el rol.
        //
        // El código ya se validó en el paso anterior (con club_by_code(), que
        // acepta anónimo). Aquí NO se vuelve a pasar por redeem_invite(): esa
        // función exige sesión y en este punto todavía no la hay, así que el
        // alta se quedaba atascada en el primer uso — que es justamente cuando
        // no hay cuenta — con un "Inicia sesión para comprobar el código". Por
        // eso consume_invite() va DESPUÉS de registrar: ya hay sesión y además
        // vuelve a validar caducidad y usos, que es lo que concede el rol.
        if(!this.pendienteGoogle){
          /* De `this.vPass`, no de val('rP'): el repintado de arriba ya ha
             vuelto a crear el campo y val('rP') vendria vacio. */
          const alta = await Backend.registrar({ email, password:this.vPass, nombre, tel });
          if(alta.pendiente) throw new Error(
            'Te hemos enviado un correo para confirmar la dirección. '+
            'Confírmala y vuelve a intentarlo.');
          userId = alta.uid;
        }else{
          userId = Backend.uid;
        }

        const uso = await Backend.gastarCodigo(this.invite.code);
        if(!uso || !uso.ok) throw new Error((uso && uso.error) || 'Ese código ya no está disponible');
        resuelto = { ok:true, rol:uso.rol, invite:{ team_id:uso.team_id } };
      }

      /* La contraseña tambien se pasa. Sin nube no hay Supabase Auth que la
         guarde por su cuenta, asi que si no viaja aqui el alta falla siempre
         con "Falta la contraseña". Con Google no hace falta: ya hay cuenta. */
      Data.register({ nombre, email, tel,
        password: this.pendienteGoogle ? null : this.vPass,
        code:this.invite.code, userId, resuelto });
      this.err=null; this.step=null; this.pendienteGoogle=null; this.vPass=null;
      await Shell.afterAuth(true);
    }catch(e){
      this.err = e.message || 'No se ha podido crear la cuenta';
    }
    this.busy = false;
    this.repintar('rP', this.vPass);
  },

  /* ---------- inicio de sesión ---------- */
  login(){ return `
    <button class="back" onclick="Gate.reset('${Data.clubExists()?'elegir':'bienvenida'}')">
      ${I.chevL(16)} Volver</button>
    <h2>Iniciar sesión</h2>
    <p class="lead">Entra con el email con el que te registraste.</p>
    <div class="f">
      <label for="lE">Email</label>
      <input class="in" id="lE" type="email" inputmode="email" autocomplete="email"
        value="${esc(this.vEmail||'')}">
    </div>
    ${this.campoPass({ id:'lP', etiqueta:'Contraseña',
      autocomplete:'current-password',
      onenter:"if(event.key==='Enter')Gate.doLogin()" })}
    <button class="btn" onclick="Gate.doLogin()" ${this.busy?'disabled':''}>
      ${this.busy?'Entrando…':'Entrar'}</button>
    ${this.conGoogle() ? `<div class="or"><span>o</span></div>${this.botonGoogle()}` : ''}
    <div class="links">
      ${Data.clubExists() ? `<button class="link" onclick="Gate.reset('codigo')">
        Tengo un código y aún no tengo cuenta</button>` : ''}
      <button class="link" onclick="Gate.forgot()">He olvidado la contraseña</button>
    </div>`;
  },

  async doLogin(){
    if(this.busy) return;
    const email = val('lE'), password = valp('lP');
    /* Se conservan email y contrasena entre repintados. La contrasena vive solo
       en memoria y se vuelve a poner en el campo con JS, nunca en el HTML: asi
       al pulsar Intro no desaparece de la pantalla. */
    this.vEmail = email; this.vPass = password;
    if(!email || !password){ this.err='Escribe tu email y tu contraseña';
      return this.repintar('lP', password); }
    this.busy = true; this.err = null; this.repintar('lP', password);
    try{
      if(backendListo()){
        const r = await Backend.entrarConPassword(email, password);
        if(!r.roles.length)
          throw new Error('Tu cuenta existe pero todavía no tiene acceso a este club. '+
            'Si eres quien lo creó, vuelve a intentar fundarlo: se reparará solo. '+
            'Si no, necesitas un código de la junta directiva.');
        Data.setSession({ userId:r.uid, rol:r.roles[0] });
      }else{
        Data.login(email, password);
      }
      this.err=null; this.step=null; this.vPass=null;
      await Shell.afterAuth(false);
    }catch(e){
      this.err = e.message || 'No se ha podido iniciar sesión';
    }
    this.busy = false;
    this.repintar('lP', password);
  },

  forgot(){
    if(backendListo()){
      const email = val('lE');
      sheet('Recuperar el acceso', `
        <div class="f"><label for="fE">Email con el que te registraste</label>
          <input class="in" id="fE" type="email" inputmode="email"
                 value="${esc(email)}" placeholder="nombre@correo.com"></div>
        <div class="help">Te enviaremos un enlace para poner una contraseña nueva.
          Puede tardar un par de minutos: mira también la carpeta de spam.</div>
        <button class="btn" onclick="Gate.enviarRecuperacion()">Enviar enlace</button>
        <button class="btn btn-2" onclick="closeSheet()">Cancelar</button>`);
      return;
    }
    sheet('Recuperar el acceso', `
      ${hint('En esta versión la recuperación por email todavía no está activa. '+
        'Escribe a la junta directiva del club y te darán acceso de nuevo.')}
      <button class="btn btn-2" onclick="closeSheet()">Entendido</button>`);
  },

  async enviarRecuperacion(){
    const email = val('fE');
    if(!Data.validEmail(email)){ toast('Escribe un email válido'); return; }
    try{
      await Backend.recuperarPassword(email);
      closeSheet();
      toast('Si esa cuenta existe, recibirás el enlace en unos minutos');
    }catch(e){
      toast('No se ha podido enviar: ' + (e.message || 'revisa tu conexión'));
    }
  },

  /* ============================================================
     FUNDAR EL CLUB — asistente de 3 pasos
     ============================================================ */
  fundar(){
    const F = this.asistente;
    const bar = `<div class="steps">${[1,2,3].map(i=>
      `<i class="${i<=F.n?'on':''}"></i>`).join('')}</div>
      <div class="stepn">Paso ${F.n} de 3</div>`;

    if(F.n===1) return `
      <button class="back" onclick="Gate.reset('bienvenida')">${I.chevL(16)} Volver</button>
      ${bar}
      <h2>El club</h2>
      <p class="lead">Estos datos aparecerán en la cabecera de la aplicación.</p>
      <div class="f"><label for="cN">Nombre del club</label>
        <input class="in" id="cN" value="${esc(F.club.nombre||'Rugby Club Cornellà')}"></div>
      <div class="f"><label for="cC">Ciudad</label>
        <input class="in" id="cC" value="${esc(F.club.ciudad||'Cornellà de Llobregat')}"></div>
      <div class="f"><label for="cT">Temporada</label>
        <input class="in" id="cT" value="${esc(F.club.temporada||'2026-27')}"></div>
      <button class="btn" onclick="Gate.fundarPaso1()">Continuar</button>`;

    if(F.n===2) return `
      <button class="back" onclick="Gate.asistente.n=1;Shell.render()">${I.chevL(16)} Atrás</button>
      ${bar}
      <h2>Categorías</h2>
      <p class="lead">Deja las que tenga el club. Podrás cambiarlas después.</p>
      <div class="rows">
        ${F.cats.map((c,i)=>`<div class="row">
          <div class="ava sq">${esc(c.n.replace('Sub-','S'))}</div>
          <div class="row-b"><b>${esc(c.n)}</b><span>Categoría</span></div>
          <div class="row-e">
            <button class="ibtn" title="Quitar" onclick="Gate.quitarCat(${i})">${I.trash(17)}</button>
          </div>
        </div>`).join('')}
      </div>
      <button class="btn btn-2" onclick="Gate.addCat()">${I.plus(17)} Añadir categoría</button>
      <div style="height:10px"></div>
      <button class="btn" onclick="Gate.asistente.n=3;Shell.render()">Continuar</button>`;

    return `
      <button class="back" onclick="Gate.asistente.n=2;Shell.render()">${I.chevL(16)} Atrás</button>
      ${bar}
      <h2>Tu cuenta de administrador</h2>
      <p class="lead">Quedas como junta directiva. Desde aquí invitarás al resto.</p>
      <div class="f"><label for="fN">Nombre y apellidos</label>
        <input class="in" id="fN" autocomplete="name" value="${esc(this.vNombre||'')}"></div>
      <div class="f"><label for="fE">Email</label>
        <input class="in" id="fE" type="email" inputmode="email" autocomplete="email"
          value="${esc(this.vEmail||'')}"></div>
      ${this.campoPass({ id:'fP', etiqueta:'Contraseña', autocomplete:'new-password',
      ayuda:'Mínimo 8 caracteres.',
      onenter:"if(event.key==='Enter')Gate.doFundar()" })}
      ${this.campoPass({ id:'fA', etiqueta:'Código de administración del club',
      autocomplete:'off',
      ayuda:'Permiso para poder crear el club. Lo acuerda la junta directiva en persona. No es el código de familias ni el de invitation de jugadores.',
      onenter:"if(event.key==='Enter')Gate.doFundar()" })}
      <button class="btn btn-accent" onclick="Gate.doFundar()" ${this.busy?'disabled':''}>
        ${this.busy?'Un momento…':'Crear el club'}</button>`;
  },

  fundarPaso1(){
    const n = val('cN');
    if(!n){ this.err='El club necesita un nombre'; return Shell.render(); }
    this.asistente.club = { nombre:n, ciudad:val('cC'), temporada:val('cT') };
    this.asistente.n = 2; this.err=null; Shell.render();
  },
  addCat(){
    sheet('Nueva categoría', `
      <div class="f"><label for="ncN">Nombre</label>
        <input class="in" id="ncN" placeholder="Sub-20"></div>
      <button class="btn" onclick="Gate.addCatOk()">Añadir</button>`);
  },
  addCatOk(){
    const n = val('ncN');
    if(!n){ toast('Ponle nombre a la categoría'); return; }
    this.asistente.cats.push({ n });
    closeSheet(); Shell.render();
  },
  quitarCat(i){
    if(this.asistente.cats.length<=1){ toast('Debe quedar al menos una categoría'); return; }
    this.asistente.cats.splice(i,1); Shell.render();
  },
  doFundar(){
    if(this.busy) return;
    /* Los campos se leen ANTES de repintar. Shell.render() rehace el formulario
       entero, asi que leerlos despues devuelve cadena vacia y el alta fallaba
       siempre con "el email no tiene un formato valido". La contrasena tambien
       se guarda, para poder reintentar sin teclearla otra vez. */
    const nombre = val('fN'), email = val('fE'), password = valp('fP');
    this.vNombre = nombre; this.vEmail = email; this.vPass = password;
    /* El codigo de administracion se lee igual que los demas campos, ANTES de
       repintar, y se guarda para poder reintentar sin teclearlo otra vez. */
    const codigo = val('fA');
    this.vCodigo = codigo;
    const fA = { id:'fA', valor:codigo };
    if(!this.vPass || password.length < 8){
      this.err = 'La contraseña debe tener al menos 8 caracteres';
      return this.repintar('fP', password, fA);
    }
    /* Sin codigo no se llega ni al servidor: fundar el club es lo unico que
       protege este paso, y el fallo se explica aqui, no con un error generico. */
    if(!codigo){
      this.err = 'Falta el código de administración del club. Lo acuerda la '+
        'junta directiva en persona; no es el código de familias.';
      return this.repintar('fP', password, fA);
    }
    this.busy = true; this.err = null; this.repintar('fP', password, fA);
    (async () => {
      try{
        let userId = null, ids = null, familyCode = null;

        if(backendListo()){
          // Los identificadores se generan aquí y se pasan a ambos lados, para
          // que la copia del servidor y la del dispositivo sean la misma.
          ids = Data.idsParaFundar();
          familyCode = makeCode();
          /* Crear la cuenta o entrar si ya estaba. Al fallar el club, la cuenta
             queda creada y el reintento topa con "ya existe": con esto se
             reutiliza y el fundador recupera el acceso de junta sin codigo. */
          const alta = await this.registrarOCrear(email, password, nombre);
          if(alta.pendiente) throw new Error(
            'Te hemos enviado un correo para confirmar la dirección. '+
            'Confírmala y vuelve a abrir la aplicación para fundar el club.');
          userId = alta.uid;
          await Backend.fundarClub({
            p_club_id: ids.club_id, p_season_id: ids.season_id,
            p_nombre: this.asistente.club.nombre, p_ciudad: this.asistente.club.ciudad,
            p_temporada: this.asistente.club.temporada, p_user_id: userId,
            p_nombre_usuario: nombre, p_email: email,
            p_categorias: this.asistente.cats.map(c => ({ n:c.n })),
            p_family_code: familyCode,
            p_codigo_admin: codigo
          });
        }

        Data.foundClub({ clubNombre:this.asistente.club.nombre, ciudad:this.asistente.club.ciudad,
          temporada:this.asistente.club.temporada, userNombre:nombre, email, password,
          categorias:this.asistente.cats, userId, ids, familyCode });
        this.err=null; this.step=null; this.vPass=null;
        await Shell.afterAuth(true);
      }catch(e){
        /* No se pierde lo escrito: el asistente sigue en la pantalla 3 con los
           datos puestos, para poder darle otra vez a "Crear el club". */
        this.err = e.message || 'No se ha podido crear el club';
      }
      this.busy = false;
      this.repintar('fP', password, { id:'fA', valor:codigo });
    })();
  }
};
