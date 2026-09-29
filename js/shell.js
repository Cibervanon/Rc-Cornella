/* ============================================================================
   Shell: sesión, navegación y render
   ============================================================================ */

let S = {};   // estado efímero de la vista

const Shell = {
  view:'gate',      // gate | main | evento | ficha
  tab:null,
  stack:[],

  mod(){
    const r = Data.rol();
    if(r==='entrenador') return Coach;
    if(r==='familia' || r==='jugador') return Family;
    return Board;
  },

  boot(){
    const s = Data.loadSession();
    if(!s){ this.view='gate'; Gate.step=null; return this.render(); }
    this.view='main';
    this.tab = this.mod().nav[0].k;
    this.render();
  },

  afterAuth(esNuevo){
    this.view='main'; S={}; this.stack=[];
    this.tab = this.mod().nav[0].k;
    this.render();
    if(esNuevo) setTimeout(()=>this.bienvenida(), 250);
  },

  /** Onboarding contextual: una sola pantalla, con lo que toca a cada rol. */
  bienvenida(){
    const r = Data.rol();
    const pasos = {
      junta:['Invita al cuerpo técnico con un código de un solo uso',
             'Asigna cada entrenador a su categoría',
             'Comparte el código general con las familias'],
      entrenador:['Revisa tu plantilla cuando las familias se inscriban',
             'Convoca el entrenamiento y se pedirá confirmación sola',
             'Recuerda solo a quien no ha respondido, con un botón'],
      familia:['Inscribe a tu hijo o hija en su categoría',
             'Confirma la asistencia desde la pantalla de inicio',
             'Firma la documentación y domicilia la cuota'],
      jugador:['Confirma si vas a los entrenamientos y partidos',
             'Consulta la hora de citación y el lugar',
             'Sigue tus objetivos y la valoración del entrenador']
    }[r] || [];
    sheet('Bienvenido a '+Data.club().nombre, `
      <p style="margin:0 0 16px;line-height:1.6">Entras como
        <strong>${esc(ROLES[r].t.toLowerCase())}</strong>. Así funciona:</p>
      <div class="panel">${pasos.map((p,i)=>`
        <div class="sk"><span class="skb" style="background:var(--accent);
          border-color:var(--accent);font-size:11px;font-weight:700">${i+1}</span>
          <span>${esc(p)}</span></div>`).join('')}</div>
      <button class="btn btn-accent" onclick="closeSheet()">Empezar</button>`);
  },

  go(v, st={}){
    this.stack.push({ view:this.view, tab:this.tab, S:{ ...S } });
    this.view=v; Object.assign(S, st); this.render();
  },
  back(){
    const p = this.stack.pop();
    if(p){ this.view=p.view; this.tab=p.tab; S=p.S; }
    else this.view='main';
    this.render();
  },
  goTab(t){
    this.view='main'; this.tab=t;
    S = { teamId:S.teamId, childId:S.childId };
    this.stack=[]; this.render();
  },

  logout(){
    closeSheet(); Data.endSession();
    this.view='gate'; Gate.step=null; Gate.err=null; S={}; this.stack=[];
    this.render();
  },

  cambiarRol(){
    const roles = Data.myRoles();
    if(roles.length<2){ toast('Tu cuenta solo tiene un perfil'); return; }
    sheet('Cambiar de perfil', `
      ${roles.map(r=>`<button class="choice" onclick="Shell.setRol('${r}')">
        <span class="ci">${I[ROLES[r].ic](20)}</span>
        <span class="ct"><b>${esc(ROLES[r].t)}</b><span>${esc(ROLES[r].d)}</span></span>
        <span class="cg">${I.chevron(18)}</span></button>`).join('')}`);
  },
  setRol(r){
    Data.setSession({ ...Data.ses, rol:r });
    closeSheet(); S={}; this.stack=[];
    this.tab = this.mod().nav[0].k;
    this.render();
  },

  /** Bloque de cuenta, compartido por los tres módulos. */
  cuenta(){
    const u = Data.me();
    const roles = Data.myRoles();
    return `
    <div class="t-sec">Tu cuenta</div>
    <div class="rows">
      <div class="row">${ava(u.nombre)}
        <div class="row-b"><b>${esc(u.nombre)}</b><span>${esc(u.email)}</span></div>
        <div class="row-e">${tag(ROLES[Data.rol()].t,'t-accent')}</div></div>
      ${roles.length>1?`<button class="row" onclick="Shell.cambiarRol()">
        <div class="ava sq">${I.swap(18)}</div>
        <div class="row-b"><b>Cambiar de perfil</b>
          <span>Tienes ${roles.length} perfiles en este club</span></div>
        <span style="color:var(--t3)">${I.chevron(17)}</span></button>`:''}
      <button class="row" onclick="Shell.cambiarPass()">
        <div class="ava sq">${I.lock(18)}</div>
        <div class="row-b"><b>Cambiar la contraseña</b></div>
        <span style="color:var(--t3)">${I.chevron(17)}</span></button>
      <button class="row" onclick="Shell.confirmSalir()">
        <div class="ava sq">${I.logout(18)}</div>
        <div class="row-b"><b>Cerrar sesión</b></div></button>
    </div>
    <button class="btn btn-text" onclick="Shell.confirmBorrar()">
      Borrar todos los datos de este dispositivo</button>`;
  },
  cambiarPass(){
    sheet('Cambiar la contraseña', `
      <div class="f"><label for="pA">Contraseña actual</label>
        <input class="in" id="pA" type="password" autocomplete="current-password"></div>
      <div class="f"><label for="pN2">Nueva contraseña</label>
        <input class="in" id="pN2" type="password" autocomplete="new-password">
        <div class="help">Mínimo 8 caracteres.</div></div>
      <button class="btn" onclick="Shell.guardarPass()">Guardar</button>`);
  },
  guardarPass(){
    try{ Data.changePassword(val('pA'), val('pN2'));
      closeSheet(); toast('Contraseña actualizada'); }
    catch(e){ toast(e.message); }
  },
  confirmSalir(){
    confirmSheet('Cerrar sesión','Tendrás que volver a entrar con tu email y contraseña.',
      'Cerrar sesión', ()=>Shell.logout(), false);
  },
  confirmBorrar(){
    confirmSheet('Borrar todos los datos',
      'Se eliminará el club, las cuentas y toda la información guardada en este '+
      'navegador. No se puede deshacer.', 'Borrar todo', ()=>DB.wipe());
  },

  offline: (typeof navigator!=='undefined' && navigator.onLine===false),
  conexion(online){
    this.offline = !online;
    toast(online ? 'Conexión recuperada' : 'Sin conexión · la app sigue funcionando');
    this.render();
  },

  notificaciones(){
    const ns = Data.notifs();
    sheet('Notificaciones', ns.length ? `
      <div class="rows">${ns.slice(0,20).map(n=>`
        <div class="row"><div class="ava sq">${n.leido?I.bell(18):I.bell(18)}</div>
          <div class="row-b"><b>${esc(n.titulo)}</b><span>${esc(n.cuerpo||'')}</span></div>
          <div class="row-e"><span class="tiny">${fechaCorta(n.at,false)}</span></div>
        </div>`).join('')}</div>
      <button class="btn btn-2" style="margin-top:12px"
        onclick="Data.readAll();closeSheet();Shell.render()">
        Marcar todas como leídas</button>`
    : blank(I.bell(22),'Sin notificaciones',
        'Aquí llegarán las convocatorias y los avisos del club.'));
  },

  render(){
    const root = $('#root');

    if(this.view==='gate'){ root.innerHTML = Gate.render(); return; }

    const M = this.mod();
    if(!this.tab || !M.nav.some(n=>n.k===this.tab)) this.tab = M.nav[0].k;

    let body;
    if(this.view==='evento'){
      body = Data.rol()==='entrenador'
        ? Coach.evento(S.eventId)
        : Family.evento(S.eventId, S.evPid);
    } else if(this.view==='ficha'){
      body = Coach.ficha(S.playerId);
    } else if(this.view==='partido'){
      body = Data.rol()==='entrenador' || Data.is('junta','coordinador')
        ? Match.pantalla(S.eventId)
        : Family.resumenPartido(S.eventId);
    } else {
      body = M[this.tab] ? M[this.tab]() : blank(I.question(24),'Vista no encontrada','');
    }

    const c = Data.club();
    const n = Data.unread();

    root.innerHTML = `
    <div class="app">
      <header class="bar">
        <div class="bar-crest">${crest(34)}</div>
        <div class="bar-tx">
          <b>${esc(c?.nombre||'Club')}</b>
          <span>${esc(ROLES[Data.rol()]?.t||'')}</span>
        </div>
        <button class="bar-btn" onclick="Shell.notificaciones()" aria-label="Notificaciones">
          ${I.bell(19)}${n?`<i class="pip">${n>9?'9+':n}</i>`:''}
        </button>
      </header>
      ${this.offline?`<div class="offbar">${I.info(15)}
        <span>Sin conexión. Todo lo que hagas se guarda en el dispositivo.</span>
      </div>`:''}
      <main class="main">${body}</main>
      <nav class="nav">${M.nav.map(x=>`
        <button class="${x.k===this.tab && this.view==='main'?'on':''}"
          onclick="Shell.goTab('${x.k}')" aria-label="${x.t}">
          ${I[x.i](21)}<span>${x.t}</span>
        </button>`).join('')}</nav>
    </div>`;
    window.scrollTo(0,0);
  }
};

if(typeof document !== 'undefined' && document.getElementById('root')) Shell.boot();
