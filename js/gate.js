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
  fundar: { n:1, club:{}, cats:[...CAT_PRESET] },

  reset(s){ this.step=s; this.err=null; Shell.render(); },

  render(){
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
    <div class="t-sec">Primera vez</div>
    <button class="choice" onclick="Gate.reset('codigo')">
      <span class="ci">${I.key(20)}</span>
      <span class="ct"><b>Tengo un código del club</b>
        <span>Para familias, jugadores y cuerpo técnico</span></span>
      <span class="cg">${I.chevron(18)}</span>
    </button>
    ${hint('¿No tienes código? Las familias lo reciben al inscribir a su hijo. '+
      'El cuerpo técnico lo recibe de la junta directiva.')}`;
  },

  /* ---------- paso 1: validar el código ANTES de pedir datos ---------- */
  codigo(){ return `
    <button class="back" onclick="Gate.reset('elegir')">${I.chevL(16)} Volver</button>
    <h2>Tu código de acceso</h2>
    <p class="lead">Son 6 letras y números. Te lo ha dado el club.</p>
    <div class="f">
      <input class="in code" id="gCode" maxlength="6" autocomplete="off"
             autocapitalize="characters" placeholder="ABC123"
             oninput="this.value=this.value.toUpperCase()"
             onkeydown="if(event.key==='Enter')Gate.checkCode()">
      <div class="help">El código determina tu perfil dentro de la aplicación.
        No se puede elegir a mano.</div>
    </div>
    <button class="btn" onclick="Gate.checkCode()">Comprobar código</button>
    <div class="links">
      <button class="link" onclick="Gate.reset('login')">Ya tengo cuenta</button>
    </div>`;
  },

  checkCode(){
    const c = val('gCode');
    const r = Data.peekCode(c);
    if(!r.ok){ this.err = r.error; Shell.render(); return; }
    this.rolDetectado = r.rol;
    this.invite = r.invite;
    this.err = null;
    this.step = 'datos';
    Shell.render();
  },

  /* ---------- paso 2: datos, ya sabiendo el rol ---------- */
  datos(){
    const R = ROLES[this.rolDetectado];
    return `
    <button class="back" onclick="Gate.reset('codigo')">${I.chevL(16)} Cambiar de código</button>
    <div class="alert alert-ok">${I.check(16)}
      <span>Código correcto. Vas a crear tu cuenta como
        <strong>${esc(R.t.toLowerCase())}</strong>.</span></div>
    <h2>Crea tu cuenta</h2>
    <p class="lead">${esc(R.d)}.</p>
    <div class="f">
      <label for="rN">Nombre y apellidos</label>
      <input class="in" id="rN" autocomplete="name" placeholder="Marta Soler Vidal">
    </div>
    <div class="f">
      <label for="rE">Email</label>
      <input class="in" id="rE" type="email" inputmode="email" autocomplete="email">
      <div class="help">Lo usarás para entrar y recibir los avisos del club.</div>
    </div>
    <div class="f">
      <label for="rT">Teléfono ${this.rolDetectado==='familia'?'':'<span class="muted">(opcional)</span>'}</label>
      <input class="in" id="rT" type="tel" inputmode="tel" autocomplete="tel">
    </div>
    <div class="f">
      <label for="rP">Contraseña</label>
      <input class="in" id="rP" type="password" autocomplete="new-password">
      <div class="help">Mínimo 8 caracteres.</div>
    </div>
    <label class="check">
      <input type="checkbox" id="rOk">
      <span>He leído y acepto la política de privacidad del club. Si inscribo a
        menores, confirmo que soy su tutor legal.</span>
    </label>
    <button class="btn btn-accent" style="margin-top:8px" onclick="Gate.doRegister()">
      Crear mi cuenta</button>`;
  },

  doRegister(){
    if(!chk('rOk')){ this.err='Debes aceptar la política de privacidad para continuar';
      return Shell.render(); }
    try{
      Data.register({ nombre:val('rN'), email:val('rE'), password:val('rP'),
        tel:val('rT'), code:this.invite.code });
      this.err=null; this.step=null;
      Shell.afterAuth(true);
    }catch(e){ this.err = e.message; Shell.render(); }
  },

  /* ---------- inicio de sesión ---------- */
  login(){ return `
    ${Data.clubExists() ? `<button class="back" onclick="Gate.reset('elegir')">
      ${I.chevL(16)} Volver</button>` : ''}
    <h2>Iniciar sesión</h2>
    <p class="lead">Entra con el email con el que te registraste.</p>
    <div class="f">
      <label for="lE">Email</label>
      <input class="in" id="lE" type="email" inputmode="email" autocomplete="email">
    </div>
    <div class="f">
      <label for="lP">Contraseña</label>
      <input class="in" id="lP" type="password" autocomplete="current-password"
             onkeydown="if(event.key==='Enter')Gate.doLogin()">
    </div>
    <button class="btn" onclick="Gate.doLogin()">Entrar</button>
    <div class="links">
      ${Data.clubExists() ? `<button class="link" onclick="Gate.reset('codigo')">
        Tengo un código y aún no tengo cuenta</button>` : ''}
      <button class="link" onclick="Gate.forgot()">He olvidado la contraseña</button>
    </div>`;
  },

  doLogin(){
    try{
      Data.login(val('lE'), val('lP'));
      this.err=null; this.step=null;
      Shell.afterAuth(false);
    }catch(e){ this.err=e.message; Shell.render(); }
  },

  forgot(){
    sheet('Recuperar el acceso', `
      ${hint('En esta versión la recuperación por email todavía no está activa. '+
        'Escribe a la junta directiva del club y te darán acceso de nuevo.')}
      <button class="btn btn-2" onclick="closeSheet()">Entendido</button>`);
  },

  /* ============================================================
     FUNDAR EL CLUB — asistente de 3 pasos
     ============================================================ */
  fundar(){
    const F = this.fundar;
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
      <button class="back" onclick="Gate.fundar.n=1;Shell.render()">${I.chevL(16)} Atrás</button>
      ${bar}
      <h2>Categorías</h2>
      <p class="lead">Ajusta las cuotas o quita las que no tenga el club.
        Podrás cambiarlas después.</p>
      <div class="rows">
        ${F.cats.map((c,i)=>`<div class="row">
          <div class="ava sq">${esc(c.n.replace('Sub-','S'))}</div>
          <div class="row-b"><b>${esc(c.n)}</b><span>Cuota mensual</span></div>
          <div class="row-e" style="flex-direction:row;align-items:center;gap:6px">
            <input class="in" style="width:78px;min-height:40px;padding:7px 9px;
              text-align:right" type="number" min="0" value="${c.cuota}"
              onchange="Gate.fundar.cats[${i}].cuota=+this.value">
            <button class="ibtn" title="Quitar" onclick="Gate.quitarCat(${i})">${I.trash(17)}</button>
          </div>
        </div>`).join('')}
      </div>
      <button class="btn btn-2" onclick="Gate.addCat()">${I.plus(17)} Añadir categoría</button>
      <div style="height:10px"></div>
      <button class="btn" onclick="Gate.fundar.n=3;Shell.render()">Continuar</button>`;

    return `
      <button class="back" onclick="Gate.fundar.n=2;Shell.render()">${I.chevL(16)} Atrás</button>
      ${bar}
      <h2>Tu cuenta de administrador</h2>
      <p class="lead">Quedas como junta directiva. Desde aquí invitarás al resto.</p>
      <div class="f"><label for="fN">Nombre y apellidos</label>
        <input class="in" id="fN" autocomplete="name"></div>
      <div class="f"><label for="fE">Email</label>
        <input class="in" id="fE" type="email" inputmode="email" autocomplete="email"></div>
      <div class="f"><label for="fP">Contraseña</label>
        <input class="in" id="fP" type="password" autocomplete="new-password">
        <div class="help">Mínimo 8 caracteres.</div></div>
      <button class="btn btn-accent" onclick="Gate.doFundar()">Crear el club</button>`;
  },

  fundarPaso1(){
    const n = val('cN');
    if(!n){ this.err='El club necesita un nombre'; return Shell.render(); }
    this.fundar.club = { nombre:n, ciudad:val('cC'), temporada:val('cT') };
    this.fundar.n = 2; this.err=null; Shell.render();
  },
  addCat(){
    sheet('Nueva categoría', `
      <div class="f"><label for="ncN">Nombre</label>
        <input class="in" id="ncN" placeholder="Sub-20"></div>
      <div class="f"><label for="ncC">Cuota mensual (€)</label>
        <input class="in" id="ncC" type="number" min="0" value="40"></div>
      <button class="btn" onclick="Gate.addCatOk()">Añadir</button>`);
  },
  addCatOk(){
    const n = val('ncN');
    if(!n){ toast('Ponle nombre a la categoría'); return; }
    this.fundar.cats.push({ n, cuota:+val('ncC')||0 });
    closeSheet(); Shell.render();
  },
  quitarCat(i){
    if(this.fundar.cats.length<=1){ toast('Debe quedar al menos una categoría'); return; }
    this.fundar.cats.splice(i,1); Shell.render();
  },
  doFundar(){
    try{
      Data.foundClub({ clubNombre:this.fundar.club.nombre, ciudad:this.fundar.club.ciudad,
        temporada:this.fundar.club.temporada, userNombre:val('fN'), email:val('fE'),
        password:val('fP'), categorias:this.fundar.cats });
      this.err=null; this.step=null;
      Shell.afterAuth(true);
    }catch(e){ this.err=e.message; Shell.render(); }
  }
};
