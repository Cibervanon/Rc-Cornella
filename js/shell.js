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

  /** Arranque. Primero se intenta levantar el servidor; si no hay servidor
      configurado se sigue con localStorage y no se nota la diferencia. */
  async boot(){
    if(typeof Backend !== 'undefined'){
      await Backend.iniciar();
      Backend.alCambiar(()=>this.pintarEstado());
      // El enlace de recuperación se recoge DESPUÉS de levantar el servidor:
      // mirar en el hash es rápido, pero fijar la sesión necesita la librería
      // ya cargada. Preguntarlo antes devolvía siempre "sin recuperación".
      this.recuperando = await this.detectarRecuperacion();
    }
    if(this.recuperando){ this.pantallaRecuperacion(); return; }
    const s = Data.loadSession();
    if(!s || !Data.me()){ this.volver(); return; }
    this.view='main';
    this.tab = this.mod().nav[0].k;
    this.render();
  },

  async detectarRecuperacion(){
    if(!backendListo()) return false;
    try{
      // Supabase añade #access_token...&type=recovery al volver del correo.
      if(!/[#&]type=recovery/.test(location.hash || '')) return false;
      await Backend.sb.auth.getSession();     // fija la sesión
      location.hash = '';                      // y quita el rastro de la URL
      return true;
    }catch(e){ return false; }
  },

  pantallaRecuperacion(){
    const root = $('#root');
    if(!root) return;
    root.innerHTML = `<div class="gate"><div class="gate-hero">
        <div class="gate-crest">${crest(72)}</div>
        <h1>Pon tu nueva contraseña</h1>
        <div class="gate-est">${esc(Data.club().nombre||'Rugby Club Cornellà')}</div>
      </div><div class="gate-body"><div class="gate-inner">
        <div class="f"><label for="rE1">Nueva contraseña</label>
          <input class="in" id="rE1" type="password" autocomplete="new-password">
          <div class="help">Mínimo 8 caracteres.</div></div>
        <button class="btn btn-accent" onclick="Shell.guardarPassRecuperacion()">
          Guardar contraseña</button>
        <div class="links">
          <button class="link" onclick="Shell.volver()">Volver al inicio</button></div>
      </div></div></div>`;
  },

  async guardarPassRecuperacion(){
    const nueva = val('rE1');
    if(nueva.length < 8){ toast('Mínimo 8 caracteres'); return; }
    try{
      await Backend.cambiarPassword(nueva);
      toast('Contraseña actualizada. Ya puedes entrar.');
      await Backend.salir();
      this.volver();
    }catch(e){ toast(e.message || 'No se ha podido cambiar'); }
  },

  /** Cierra sesión en el servidor y en el dispositivo, y vuelve al acceso.
      La copia local del club se conserva: el club no desaparece al salir. */
  logout(){
    closeSheet();
    Data.endSession();
    if(typeof Backend !== 'undefined' && Backend.activo){
      Backend.salir().catch(()=>{});
    }
    this.volver();
  },

  /** Vuelve a la pantalla de acceso sin tocar el servidor. */
  volver(){
    this.view='gate'; Gate.step=null; Gate.err=null;
    Gate.resetearGoogle(); Gate.busy=false;
    S={}; this.stack=[];
    this.render();
  },

  /** Texto del estado de sincronización, cuando hay servidor. */
  estadoSync(){
    if(!backendListo()) return '';
    if(Backend.estado==='arrancando') return 'Conectando…';
    if(Backend.pendientes) return 'Guardando cambios…';
    if(Backend.estado==='error') return 'Sin guardar en el servidor: se reintentará';
    return '';
  },
  pintarEstado(){ this.render(); },

  async afterAuth(esNuevo){
    // Con servidor, el alta o el acceso se acaba de hacer: se sube todo antes
    // de entrar, para que nadie más vea una lista de asistencia a medias.
    if(backendListo()){ try{ await Backend.volcar(); }catch(e){} }
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
             'Firma la documentación'],
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
      ${this.botonAvisos()}
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
    const conNube = backendListo();
    sheet('Cambiar la contraseña', `
      ${conNube ? '' : `<div class="f"><label for="pA">Contraseña actual</label>
        <input class="in" id="pA" type="password" autocomplete="current-password"></div>`}
      <div class="f"><label for="pN2">Nueva contraseña</label>
        <input class="in" id="pN2" type="password" autocomplete="new-password">
        <div class="help">Mínimo 8 caracteres.</div></div>
      ${conNube ? `<div class="f"><label for="pN3">Repite la nueva contraseña</label>
        <input class="in" id="pN3" type="password" autocomplete="new-password"></div>` : ''}
      <button class="btn" onclick="Shell.guardarPass()">Guardar</button>`);
  },
  async guardarPass(){
    const nueva = val('pN2');
    const conNube = backendListo();
    if(conNube && nueva !== val('pN3')){ toast('Las dos contraseñas no coinciden'); return; }
    try{
      await Data.changePassword(conNube ? '' : val('pA'), nueva);
      closeSheet();
      toast(conNube
        ? 'Contraseña actualizada. Vuelve a entrar con la nueva.'
        : 'Contraseña actualizada');
      if(conNube){ this.logout(); }
    }
    catch(e){ toast(e.message); }
  },
  confirmSalir(){
    confirmSheet('Cerrar sesión',
      'Volverás a la pantalla de acceso. Lo que tengas pendiente de subir, '+
      'se subirá antes de salir.', 'Cerrar sesión', ()=>this.logout(), false);
  },
  confirmBorrar(){
    if(backendListo()) return confirmSheet('Borrar los datos de este dispositivo',
      'El club y todo lo que habéis creado están en el servidor y no se tocan. '+
      'Aquí solo se borra la copia guardada en este navegador.',
      'Borrar la copia local', ()=>DB.wipe(), false);
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

  /** Interruptor de avisos. Solo se ofrece si las notificaciones push están
      configuradas: un botón que no puede activarse es peor que no dibujarlo. */
  botonAvisos(){
    if(typeof FCM === 'undefined' || !FCM.configurado() || !FCM.soportado())
      return '';
    const activo = FCM.activo();
    return `<button class="row" onclick="Shell.alternarAvisos()">
      <div class="ava sq">${I.bell(18)}</div>
      <div class="row-b"><b>${activo?'Recibir avisos':'Activar los avisos'}</b>
        <span>${activo?'Llegarán también con la app cerrada'
          :'Avisos en el móvil aunque tengas la app cerrada'}</span></div>
      <div class="row-e"><span class="sw ${activo?'on':''}"
        aria-hidden="true"></span></div></button>`;
  },
  async alternarAvisos(){
    if(typeof FCM === 'undefined') return;
    if(FCM.activo()){ await FCM.desactivar(); toast('Has apagado los avisos en este dispositivo'); }
    else{
      const r = await FCM.activar();
      if(r && r.error){ toast(r.error); return; }
      toast('Recibirás los avisos del club en este dispositivo');
    }
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
    const sync = this.estadoSync();

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
      ${sync?`<div class="offbar">${I.info(15)}<span>${esc(sync)}</span></div>`:''}
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
