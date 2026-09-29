/* ============================================================================
   Entrenador
   ----------------------------------------------------------------------------
   Cada empty state guía hacia la acción siguiente en vez de dejar un hueco.
   Convocar y pasar lista están a tres toques: si cuesta más, el entrenador
   vuelve al grupo de WhatsApp y se pierde el dato.
   ============================================================================ */

const Coach = {
  nav:[
    { k:'hoy',    i:'home',      t:'Hoy' },
    { k:'agenda', i:'calendar',  t:'Agenda' },
    { k:'equipo', i:'squad',     t:'Equipo' },
    { k:'sesion', i:'clipboard', t:'Sesiones' },
    { k:'mas',    i:'dots',      t:'Más' }
  ],

  team(){
    const ts = Data.myTeams();
    if(!ts.length) return null;
    if(!S.teamId || !ts.some(t=>t.id===S.teamId)) S.teamId = ts[0].id;
    return ts.find(t=>t.id===S.teamId);
  },
  switcher(){
    const ts = Data.myTeams();
    if(ts.length<2) return '';
    return `<div class="tabs">${ts.map(t=>`
      <button class="${t.id===S.teamId?'on':''}"
        onclick="S.teamId='${t.id}';Shell.render()">${esc(t.nombre)}</button>`).join('')}</div>`;
  },

  /* ---------- sin equipo asignado ---------- */
  sinEquipo(){
    return `<h1 class="t-page">Hola, ${esc(Data.me().nombre.split(' ')[0])}</h1>
      <p class="t-sub">Cuenta de entrenador</p>
      ${blank(I.whistle(24), 'Aún no tienes equipo asignado',
        'La junta directiva debe asignarte una categoría. En cuanto lo haga, '+
        'verás aquí tu plantilla y podrás convocar.',
        `<button class="btn btn-2" onclick="Coach.avisarJunta()">Avisar a la junta</button>`)}`;
  },
  avisarJunta(){
    sheet('Avisar a la junta', `
      ${hint('Se enviará un aviso a la junta directiva para que te asigne un equipo.')}
      <button class="btn" onclick="Coach.avisarOk()">Enviar aviso</button>`);
  },
  avisarOk(){
    DB.load().members.filter(m=>m.rol==='junta').forEach(m=>
      Data.notify(m.user_id,'Entrenador sin equipo',
        Data.me().nombre+' está esperando que le asignes una categoría'));
    DB.save(); closeSheet(); toast('Aviso enviado a la junta');
  },

  /* ==================== HOY ==================== */
  hoy(){
    const t = this.team();
    if(!t) return this.sinEquipo();
    const ps = Data.teamPlayers(t.id);
    const evs = Data.events(t.id);
    const ev = evs[0];
    const lesion = Data.activeInjuries(t.id);
    const tareas = Data.tasks(t.id).filter(x=>!x.hecho);
    const media = Data.teamAttAvg(t.id);

    let head;
    if(!ps.length){
      head = blank(I.users(24), 'Tu plantilla está vacía',
        'Los jugadores aparecen aquí cuando sus familias los inscriben con el '+
        'código del club. Pide a la junta que lo reparta.',
        `<button class="btn btn-2" onclick="Coach.verCodigo()">Ver el código de familias</button>`);
    } else if(!ev){
      head = blank(I.calendar(24), 'No hay nada convocado',
        'Crea el próximo entrenamiento o partido y se pedirá confirmación '+
        'automáticamente a los '+ps.length+' jugadores.',
        `<button class="btn btn-accent" onclick="Coach.nuevoEvento()">
          ${I.plus(17)} Convocar entrenamiento</button>`);
    } else {
      const ta = Data.tally(ev.id);
      const resp = ta.total ? Math.round((ta.total-ta.sin)/ta.total*100) : 0;
      head = `
      <button class="panel lead" style="display:block;width:100%;text-align:left;border-width:1px"
        onclick="Shell.go('evento',{eventId:'${ev.id}',evTab:'rsvp',sel:null})">
        <div class="panel-hd" style="margin-bottom:13px">
          <div style="display:flex;gap:11px;align-items:center;min-width:0">
            <div class="ava sq">${I[EV_ICON[ev.tipo]](19)}</div>
            <div style="min-width:0">
              <b style="font-size:16px;display:block">${evTitulo(ev)}</b>
              <span class="tiny">${fechaCorta(ev.inicio)}${ev.lugar?' · '+esc(ev.lugar):''}</span>
            </div>
          </div>
          <span style="color:var(--t3)">${I.chevron(18)}</span>
        </div>
        <div class="tally">
          <div class="y"><b>${ta.si}</b><span>Van</span></div>
          <div class="n"><b>${ta.no}</b><span>No van</span></div>
          <div class="m"><b>${ta.duda}</b><span>Duda</span></div>
          <div class="p"><b>${ta.sin}</b><span>Sin resp.</span></div>
        </div>
        ${meter(resp, resp===100?'ok':'')}
        <div class="tiny" style="margin-top:7px">Ha respondido el ${resp}% de la plantilla</div>
      </button>
      ${ta.sin ? `<button class="btn btn-accent" onclick="Coach.recordar('${ev.id}')">
        ${I.bell(17)} Recordar a ${ta.sin} que faltan por responder</button>
        <div style="height:12px"></div>` : ''}`;
    }

    return `
    <h1 class="t-page">Hola, ${esc(Data.me().nombre.split(' ')[0])}</h1>
    <p class="t-sub">${esc(t.nombre)} · ${ps.length} ${ps.length===1?'jugador':'jugadores'}</p>
    ${this.switcher()}
    ${head}

    ${ps.length ? `<div class="metrics">
      <div class="metric"><div class="mv">${media===null?'—':media+'%'}</div>
        <div class="ml">Asistencia media</div></div>
      <div class="metric ${lesion.length?'warn':''}"><div class="mv">${lesion.length}</div>
        <div class="ml">${lesion.length===1?'Lesionado':'Lesionados'}</div></div>
      <div class="metric"><div class="mv">${evs.length}</div>
        <div class="ml">Eventos próximos</div></div>
    </div>`:''}

    ${lesion.length ? `<div class="t-sec">Parte médico</div>
    <div class="rows">${lesion.map(i=>{
      const p = Data.player(i.player_id);
      return `<button class="row" onclick="Shell.go('ficha',{playerId:'${i.player_id}'})">
        ${ava(p?p.nombre:'—','warn')}
        <div class="row-b"><b>${esc(p?p.nombre:'—')}</b>
          <span>${esc(i.tipo||'Lesión')}${i.zona?' · '+esc(i.zona):''}</span></div>
        <div class="row-e">${tag(i.estado==='activa'?'Baja':'Recuperando',
          i.estado==='activa'?'t-bad':'t-warn')}</div>
      </button>`;
    }).join('')}</div>`:''}

    ${tareas.length ? `<div class="t-sec">Tareas pendientes</div>
    <div class="rows">${tareas.map(x=>`
      <button class="row" onclick="Coach.tarea('${x.id}')">
        <span class="box"></span>
        <div class="row-b"><b style="font-weight:500">${esc(x.titulo)}</b></div>
      </button>`).join('')}</div>`:''}

    ${evs.length>1 ? `<div class="t-sec">Después</div>
    <div class="rows">${evs.slice(1,5).map(e=>this.fila(e)).join('')}</div>`:''}`;
  },

  fila(e){
    const ta = Data.tally(e.id);
    const mt = ['partido','torneo'].includes(e.tipo) ? Data.match(e.id) : null;
    if(mt && (mt.estado==='final' || mt.acciones.length))
      return `<button class="row" onclick="Shell.go('partido',{eventId:'${e.id}',mTab:null})">
        ${daymark(e.inicio)}
        <div class="row-b"><b>${evTitulo(e)}</b>
          <span>${fechaCorta(e.inicio)} · ${mt.estado==='final'?'finalizado':'en juego'}</span></div>
        <div class="row-e"><span class="amt">${mt.puntos_favor}–${mt.puntos_contra}</span>
          ${mt.estado==='final'
            ? tag(mt.puntos_favor>mt.puntos_contra?'Victoria'
                : mt.puntos_favor<mt.puntos_contra?'Derrota':'Empate',
                mt.puntos_favor>mt.puntos_contra?'t-ok'
                : mt.puntos_favor<mt.puntos_contra?'t-bad':'t-mute')
            : tag('En juego','t-info')}</div>
      </button>`;
    return `<button class="row" onclick="Shell.go('evento',{eventId:'${e.id}',evTab:'rsvp',sel:null})">
      ${daymark(e.inicio)}
      <div class="row-b"><b>${evTitulo(e)}</b>
        <span>${fechaCorta(e.inicio)}${e.lugar?' · '+esc(e.lugar):''}</span></div>
      <div class="row-e">${ta.sin ? tag(ta.sin+' sin resp.','t-mute')
        : tag(ta.si+' van','t-ok')}</div>
    </button>`;
  },

  verCodigo(){
    sheet('Código de familias', `
      <div class="codebox"><div class="cl">Código del club</div>
        <div class="cv">${esc(Data.familyCode())}</div>
        <div class="cd">Las familias lo introducen al registrarse</div></div>
      ${hint('Este código solo da acceso como familia. Nunca da permisos de '+
        'entrenador ni de junta.')}
      <button class="btn btn-2" onclick="closeSheet()">Cerrar</button>`);
  },
  recordar(id){
    const n = Data.remind(id);
    toast(n ? 'Recordatorio enviado a '+n+' jugadores' : 'Ya han respondido todos');
    Shell.render();
  },
  tarea(id){ Data.toggleTask(id); Shell.render(); },

  /* ==================== AGENDA ==================== */
  agenda(){
    const t = this.team();
    if(!t) return this.sinEquipo();
    const pas = S.cal==='hist';
    const evs = Data.events(t.id,{ pasados:pas });
    return `
    <h1 class="t-page">Agenda</h1>
    <p class="t-sub">${esc(t.nombre)}</p>
    ${this.switcher()}
    <div class="tabs">
      <button class="${!pas?'on':''}" onclick="S.cal='prox';Shell.render()">Próximos</button>
      <button class="${pas?'on':''}" onclick="S.cal='hist';Shell.render()">Historial</button>
    </div>
    ${!pas ? `<button class="btn btn-accent" onclick="Coach.nuevoEvento()">
      ${I.plus(17)} Nuevo evento</button><div style="height:12px"></div>`:''}
    ${evs.length ? `<div class="rows">${evs.map(e=>this.fila(e)).join('')}</div>`
      : blank(I.calendar(24), pas?'Sin historial':'Sin eventos programados',
        pas ? 'Aquí verás los entrenamientos y partidos ya celebrados.'
            : 'Crea el primero y se pedirá confirmación a toda la plantilla.')}`;
  },

  nuevoEvento(){
    const t = this.team();
    const ps = Data.teamPlayers(t.id);
    if(!ps.length){
      sheet('Plantilla vacía', `
        ${hint('Todavía no hay jugadores en '+esc(t.nombre)+'. Puedes crear el '+
          'evento igualmente, pero nadie recibirá la convocatoria.','warn')}
        <button class="btn btn-2" onclick="closeSheet()">Entendido</button>`);
      return;
    }
    const m = new Date(); m.setDate(m.getDate()+1);
    sheet('Nuevo evento', `
      <div class="f"><label for="eT">Tipo</label>
        <select class="in" id="eT" onchange="Coach.tipoCambia()">
          <option value="entrenamiento">Entrenamiento</option>
          <option value="partido">Partido</option>
          <option value="torneo">Torneo</option>
          <option value="reunion">Reunión</option>
        </select></div>
      <div id="rivalWrap" class="hidden">
        <div class="f"><label for="eR">Rival</label>
          <input class="in" id="eR" placeholder="UE Santboiana"></div>
        <label class="check"><input type="checkbox" id="eL" checked>
          <span>Se juega en casa</span></label>
      </div>
      <div class="f2">
        <div class="f"><label for="eF">Fecha</label>
          <input class="in" id="eF" type="date" value="${m.toISOString().slice(0,10)}"></div>
        <div class="f"><label for="eH">Hora</label>
          <input class="in" id="eH" type="time" value="18:30"></div>
      </div>
      <div class="f"><label for="eC">Hora de citación <span class="muted">(opcional)</span></label>
        <input class="in" id="eC" type="time"></div>
      <div class="f"><label for="eP">Lugar</label>
        <input class="in" id="eP" value="Estadi Municipal Pilar Pons"></div>
      <div class="f"><label for="eN">Notas para las familias</label>
        <textarea class="in" id="eN" rows="2"
          placeholder="Traer protector bucal y botella de agua"></textarea></div>
      ${hint('Se pedirá confirmación a los '+ps.length+' jugadores del equipo.')}
      <button class="btn btn-accent" onclick="Coach.guardarEvento()">
        Crear y pedir confirmación</button>`);
  },
  tipoCambia(){
    const v = val('eT');
    $('#rivalWrap').classList.toggle('hidden', v!=='partido' && v!=='torneo');
  },
  guardarEvento(){
    const f = val('eF'), h = val('eH');
    if(!f || !h){ toast('Indica la fecha y la hora'); return; }
    const tipo = val('eT');
    const cit = val('eC');
    try{
      Data.createEvent({ team_id:S.teamId, tipo,
        inicio:new Date(f+'T'+h).toISOString(),
        convocatoria: cit ? new Date(f+'T'+cit).toISOString() : null,
        titulo: EV_NOM[tipo], rival: val('eR')||null, local: chk('eL'),
        lugar: val('eP'), notas: val('eN') });
      closeSheet(); toast('Evento creado. Confirmación solicitada'); Shell.render();
    }catch(e){ toast(e.message); }
  },

  /* ==================== EVENTO ==================== */
  evento(id){
    const e = Data.event(id);
    if(!e) return blank(I.question(24),'Evento no encontrado','Puede que se haya eliminado.');
    const ta = Data.tally(id);
    const pasado = new Date(e.inicio) < new Date();
    const tab = S.evTab || 'rsvp';
    const lista = Data.rsvpList(id);

    const grupo = st => {
      const g = lista.filter(r=>r.estado===st)
        .map(r=>({ r, p:Data.player(r.player_id) })).filter(x=>x.p)
        .sort((a,b)=>a.p.nombre.localeCompare(b.p.nombre,'es'));
      if(!g.length) return '';
      return `<div class="t-sec">${RSVP_T[st].t} · ${g.length}</div>
      <div class="rows">${g.map(({r,p})=>`
        <button class="row" onclick="Shell.go('ficha',{playerId:'${p.id}'})">
          ${ava(p.nombre)}
          <div class="row-b"><b>${esc(p.nombre)}</b>
            ${r.motivo?`<span>${esc(r.motivo)}</span>`:''}</div>
          <div class="row-e">${tagRsvp(r.estado)}</div>
        </button>`).join('')}</div>`;
    };

    return `
    <button class="back" onclick="Shell.back()">${I.chevL(16)} Volver</button>
    <h1 class="t-page">${evTitulo(e)}</h1>
    <p class="t-sub">${fechaCorta(e.inicio)}${e.lugar?' · '+esc(e.lugar):''}</p>

    ${['partido','torneo'].includes(e.tipo) ? `
      <button class="btn btn-accent" onclick="Shell.go('partido',{eventId:'${id}',mTab:null})">
        ${I.ball(18)} Día de partido · alineación y acta</button>
      <div style="height:14px"></div>`:''}

    <div class="panel">
      <div class="kv"><span>Tipo</span><span>${EV_NOM[e.tipo]}</span></div>
      ${e.convocatoria?`<div class="kv"><span>Citación</span>
        <span>${hhmm(e.convocatoria)}</span></div>`:''}
      ${e.notas?`<div class="kv"><span>Notas</span>
        <span style="max-width:62%">${esc(e.notas)}</span></div>`:''}
    </div>

    <div class="tally" style="margin-bottom:14px">
      <div class="y"><b>${ta.si}</b><span>Van</span></div>
      <div class="n"><b>${ta.no}</b><span>No van</span></div>
      <div class="m"><b>${ta.duda}</b><span>Duda</span></div>
      <div class="p"><b>${ta.sin}</b><span>Sin resp.</span></div>
    </div>

    ${ta.sin && !pasado ? `<button class="btn btn-accent"
      onclick="Coach.recordar('${id}')">${I.bell(17)} Recordar a ${ta.sin} que faltan</button>
      <div style="height:14px"></div>`:''}

    <div class="tabs">
      <button class="${tab==='rsvp'?'on':''}" onclick="S.evTab='rsvp';Shell.render()">Confirmaciones</button>
      <button class="${tab==='conv'?'on':''}" onclick="S.evTab='conv';S.sel=null;Shell.render()">Convocatoria</button>
      <button class="${tab==='lista'?'on':''}" onclick="S.evTab='lista';Shell.render()">Pasar lista</button>
    </div>

    ${tab==='rsvp' ? (ta.total
      ? grupo('sin_responder')+grupo('si')+grupo('duda')+grupo('no')
      : blank(I.users(24),'Sin jugadores','Este equipo aún no tiene plantilla.')) : ''}
    ${tab==='conv'  ? this.convocatoria(e) : ''}
    ${tab==='lista' ? this.lista(e) : ''}

    <div style="height:20px"></div>
    <div class="stack">
      <button class="btn btn-2" onclick="Coach.editarEvento('${id}')">
        ${I.settings(17)} Editar o reprogramar</button>
      <button class="btn btn-text" onclick="Coach.borrarEvento('${id}')">
        ${I.trash(16)} Eliminar evento</button>
    </div>`;
  },

  convocatoria(e){
    const ps = Data.teamPlayers(e.team_id);
    if(!ps.length) return blank(I.users(24),'Sin plantilla','No hay a quién convocar.');
    if(!S.sel){
      const prev = Data.callups(e.id).map(c=>c.player_id);
      const si = Data.rsvpList(e.id).filter(r=>r.estado==='si').map(r=>r.player_id);
      S.sel = new Set(prev.length ? prev : si);
    }
    const les = Data.activeInjuries(e.team_id).map(i=>i.player_id);
    return `
    ${hint('Vienen preseleccionados los que han confirmado. Ajusta y envía.')}
    <div class="rows">${ps.map(p=>{
      const r = Data.rsvpOf(e.id,p.id);
      const on = S.sel.has(p.id);
      return `<button class="sel ${on?'on':''}" onclick="Coach.marcar('${p.id}')">
        <span class="box">${on?I.check(15):''}</span>
        ${ava(p.nombre, les.includes(p.id)?'warn':'')}
        <div class="row-b"><b>${esc(p.nombre)}</b>
          <span>${esc(p.posicion||'')}${les.includes(p.id)?
            (p.posicion?' · ':'')+'lesionado':''}</span></div>
        <div class="row-e">${r?tagRsvp(r.estado):''}</div>
      </button>`;
    }).join('')}</div>
    <button class="btn btn-accent" style="margin-top:12px"
      onclick="Coach.enviarConv('${e.id}')">
      ${I.megaphone(17)} Enviar convocatoria (${S.sel.size})</button>`;
  },
  marcar(pid){ S.sel.has(pid) ? S.sel.delete(pid) : S.sel.add(pid); Shell.render(); },
  enviarConv(eid){
    const n = S.sel.size;
    if(!n){ toast('No has seleccionado a nadie'); return; }
    Data.setCallups(eid,[...S.sel]);
    S.sel = null;
    toast('Convocatoria enviada a '+n+' jugadores');
    Shell.render();
  },

  lista(e){
    const ps = Data.teamPlayers(e.team_id);
    if(!ps.length) return blank(I.users(24),'Sin plantilla','No hay a quién pasar lista.');
    const att = Data.attendance(e.id);
    const get = pid => (att.find(a=>a.player_id===pid)||{}).estado;
    const opts = [['presente',I.check(16)],['tarde',I.clock(16)],
                  ['justificado',I.doc(16)],['ausente',I.cross(16)]];
    return `
    ${hint(att.length ? 'Registrados '+att.length+' de '+ps.length+'.'
      : 'Marca a cada jugador. Puedes hacerlo durante o después de la sesión.')}
    <div class="rows">${ps.map(p=>{
      const st = get(p.id);
      return `<div class="row">
        ${ava(p.nombre)}
        <div class="row-b"><b>${esc(p.nombre)}</b></div>
        <div class="att">${opts.map(([k,ic])=>
          `<button class="${st===k?'on '+k:''}" title="${ATT_T[k].t}"
            onclick="Coach.att('${e.id}','${p.id}','${k}')">${ic}</button>`).join('')}</div>
      </div>`;
    }).join('')}</div>
    <button class="btn btn-2" style="margin-top:12px"
      onclick="Coach.todosPresentes('${e.id}')">Marcar a todos como presentes</button>`;
  },
  att(eid,pid,st){ Data.setAttendance(eid,pid,st); Shell.render(); },
  todosPresentes(eid){
    const e = Data.event(eid);
    Data.teamPlayers(e.team_id).forEach(p=>Data.setAttendance(eid,p.id,'presente'));
    toast('Lista completada'); Shell.render();
  },
  editarEvento(id){
    const e = Data.event(id);
    const d = new Date(e.inicio);
    const iso = x => new Date(x.getTime()-x.getTimezoneOffset()*60000)
      .toISOString();
    sheet('Editar evento', `
      ${hint('Si cambias la fecha o la hora se avisa a las familias, pero las '+
        'confirmaciones ya recibidas se mantienen.')}
      ${['partido','torneo'].includes(e.tipo)?`
        <div class="f"><label for="edR">Rival</label>
          <input class="in" id="edR" value="${esc(e.rival||'')}"></div>
        <label class="check"><input type="checkbox" id="edL" ${e.local?'checked':''}>
          <span>Se juega en casa</span></label>`:`
        <div class="f"><label for="edT">Título</label>
          <input class="in" id="edT" value="${esc(e.titulo||'')}"></div>`}
      <div class="f2">
        <div class="f"><label for="edF">Fecha</label>
          <input class="in" id="edF" type="date" value="${iso(d).slice(0,10)}"></div>
        <div class="f"><label for="edH">Hora</label>
          <input class="in" id="edH" type="time" value="${iso(d).slice(11,16)}"></div>
      </div>
      <div class="f"><label for="edC">Hora de citación</label>
        <input class="in" id="edC" type="time"
          value="${e.convocatoria?iso(new Date(e.convocatoria)).slice(11,16):''}"></div>
      <div class="f"><label for="edP">Lugar</label>
        <input class="in" id="edP" value="${esc(e.lugar||'')}"></div>
      <div class="f"><label for="edN">Notas</label>
        <textarea class="in" id="edN" rows="2">${esc(e.notas||'')}</textarea></div>
      <label class="check"><input type="checkbox" id="edA" ${e.rsvp_abierto?'checked':''}>
        <span>Admitir confirmaciones</span></label>
      <button class="btn btn-accent" style="margin-top:10px"
        onclick="Coach.guardarEdicion('${id}')">Guardar cambios</button>`);
  },
  guardarEdicion(id){
    const e = Data.event(id);
    const f = val('edF'), h = val('edH');
    if(!f||!h){ toast('Indica fecha y hora'); return; }
    const nuevo = new Date(f+'T'+h).toISOString();
    const cambio = nuevo !== e.inicio;
    const cit = val('edC');
    Data.updateEvent(id, {
      inicio:nuevo,
      convocatoria: cit ? new Date(f+'T'+cit).toISOString() : null,
      rival: document.getElementById('edR') ? val('edR') : e.rival,
      local: document.getElementById('edL') ? chk('edL') : e.local,
      titulo: document.getElementById('edT') ? val('edT') : e.titulo,
      lugar: val('edP'), notas: val('edN'), rsvp_abierto: chk('edA') });
    if(cambio) Data.avisarCambioEvento(id);
    closeSheet(); toast(cambio?'Evento reprogramado y familias avisadas':'Cambios guardados');
    Shell.render();
  },
  borrarEvento(id){
    confirmSheet('Eliminar evento',
      'Se perderán las confirmaciones y la asistencia registrada. No se puede deshacer.',
      'Eliminar', ()=>{ Data.deleteEvent(id); Shell.back(); toast('Evento eliminado'); });
  },

  /* ==================== EQUIPO ==================== */
  equipo(){
    const t = this.team();
    if(!t) return this.sinEquipo();
    const sub = S.eqTab || 'plantilla';
    return `
    <h1 class="t-page">Equipo</h1>
    <p class="t-sub">${esc(t.nombre)} · ${Data.teamPlayers(t.id).length} jugadores</p>
    ${this.switcher()}
    <div class="tabs">
      <button class="${sub==='plantilla'?'on':''}" onclick="S.eqTab='plantilla';Shell.render()">Plantilla</button>
      <button class="${sub==='rank'?'on':''}" onclick="S.eqTab='rank';Shell.render()">Clasificaciones</button>
      <button class="${sub==='stats'?'on':''}" onclick="S.eqTab='stats';Shell.render()">Estadísticas</button>
    </div>
    ${sub==='plantilla' ? this.plantilla(t) : sub==='rank' ? this.rankings(t) : this.stats(t)}`;
  },

  plantilla(t){
    const todos = Data.teamPlayers(t.id);
    if(!todos.length) return blank(I.users(24),'Todavía no hay jugadores',
      'Las familias inscriben a sus hijos con el código del club y aparecen '+
      'aquí automáticamente en la categoría que elijan.',
      `<button class="btn btn-2" onclick="Coach.verCodigo()">Ver el código</button>`);

    const q = (S.q||'').toLowerCase();
    const fg = S.pGrupo || 'todos';
    let ps = todos.filter(p=>p.nombre.toLowerCase().includes(q));
    if(fg!=='todos') ps = ps.filter(p=>{
      const g = Data.grupoDe(p.id);
      return fg==='sin' ? !Data.posicionesDe(p.id).length : (g===fg||g==='mixto');
    });
    if(S.orden==='asist')
      ps = ps.slice().sort((a,b)=>(Data.attStats(a.id).pct??101)-(Data.attStats(b.id).pct??101));
    if(S.orden==='min'){
      const rt = Data.resumenTemporada(t.id);
      ps = ps.slice().sort((a,b)=>((rt.jugadores[b.id]?.minutos)||0)-((rt.jugadores[a.id]?.minutos)||0));
    }
    const les = Data.activeInjuries(t.id).map(i=>i.player_id);
    const rt = Data.resumenTemporada(t.id);
    const sinEt = todos.filter(p=>!Data.posicionesDe(p.id).length).length;
    const herm = Data.hermanos(t.id);

    return `
    ${sinEt ? hint('<strong>'+sinEt+' jugador'+(sinEt>1?'es':'')+' sin puesto '+
      'asignado.</strong> Etiquétalos para que la alineación automática y los '+
      'recambios funcionen bien.','warn') : ''}
    ${herm.length ? hint('Esta categoría tiene '+(herm.length+1)+' grupos. Puedes '+
      'subir o bajar jugadores entre ellos desde su ficha.') : ''}
    <div class="f">
      <input class="in" placeholder="Buscar jugador" value="${esc(S.q||'')}"
             oninput="S.q=this.value;Shell.render()">
    </div>
    <div class="tabs">
      <button class="${fg==='todos'?'on':''}" onclick="S.pGrupo='todos';Shell.render()">Todos</button>
      <button class="${fg==='delantera'?'on':''}" onclick="S.pGrupo='delantera';Shell.render()">Delantera</button>
      <button class="${fg==='trescuartos'?'on':''}" onclick="S.pGrupo='trescuartos';Shell.render()">Tres cuartos</button>
      ${sinEt?`<button class="${fg==='sin'?'on':''}" onclick="S.pGrupo='sin';Shell.render()">Sin puesto</button>`:''}
    </div>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip ${S.orden!=='asist'&&S.orden!=='min'?'sel-on':''}"
        onclick="S.orden='az';Shell.render()">A-Z</button>
      <button class="chip ${S.orden==='asist'?'sel-on':''}"
        onclick="S.orden='asist';Shell.render()">Menor asistencia</button>
      <button class="chip ${S.orden==='min'?'sel-on':''}"
        onclick="S.orden='min';Shell.render()">Más minutos</button>
    </div>
    ${ps.length ? `<div class="rows">${ps.map(p=>{
      const st = Data.attStats(p.id);
      const x = rt.jugadores[p.id];
      const baja = st.pct!==null && st.pct<70;
      const pos = Data.posicionesDe(p.id);
      return `<button class="row" onclick="Shell.go('ficha',{playerId:'${p.id}'})">
        ${ava(p.nombre, les.includes(p.id)?'warn':'')}
        <div class="row-b"><b>${esc(p.nombre)}</b>
          <span>${pos.length ? pos.map(id=>POS(id)?.n+' '+POS(id)?.corto).join(' · ')
            : 'Sin puesto asignado'}</span></div>
        <div class="row-e">
          ${st.pct===null ? `<span class="tiny">Sin datos</span>`
            : tag(st.pct+'%', baja?'t-bad':'t-ok')}
          ${x&&x.minutos?`<span class="tiny">${x.minutos}' jugados</span>`:''}
        </div>
      </button>`;
    }).join('')}</div>` : blank(I.search(24),'Sin resultados','Prueba con otro filtro.')}`;
  },

  rankings(t){
    const cl = Data.clasificaciones(t.id);
    const marcas = Data.pruebas().map(e=>({ e, lista:Data.rankingMarca(t.id, e.id) }))
      .filter(x=>x.lista.length);
    if(!cl.length && !marcas.length)
      return blank(I.trophy(24),'Todavía sin datos',
        'Las clasificaciones aparecen cuando empieces a pasar lista, jugar '+
        'partidos o registrar marcas de fuerza.');
    const podio = i => i===0?'t-accent':i<3?'t-mute':'t-mute';
    return `
    ${cl.map(c=>`
      <div class="t-sec">${esc(c.t)}</div>
      <p class="tiny" style="margin:-6px 0 8px">${esc(c.d)}</p>
      <div class="rows">${c.lista.map((x,i)=>`
        <button class="row" onclick="Shell.go('ficha',{playerId:'${x.player.id}'})">
          <span class="pos-n ${i===0?'gold':''}">${i+1}</span>
          ${ava(x.player.nombre)}
          <div class="row-b"><b>${esc(x.player.nombre)}</b>
            <span>${c.id==='asistencia'?x.sesiones+' de '+x.convocables+' sesiones'
              : c.id==='minutos'?x.partidos+' partidos'
              : c.id==='ensayos'?x.puntos+' puntos en total'
              : c.id==='puntos'?x.ensayos+' ensayos'
              : x.minutos+"' jugados"}</span></div>
          <div class="row-e"><span class="amt">${x[c.id]}${c.u}</span></div>
        </button>`).join('')}</div>`).join('')}

    ${marcas.length?`<div class="t-sec">Marcas de fuerza y físico</div>
    ${marcas.map(({e,lista})=>`
      <div class="panel">
        <div class="panel-hd" style="margin-bottom:10px">
          <b>${esc(e.t)}</b><span class="tiny">${
            e.menorMejor?'menos es mejor':'más es mejor'}</span></div>
        ${lista.slice(0,5).map((x,i)=>`
          <div class="kv"><span>${i+1}. ${esc(x.p.nombre)}</span>
            <span>${x.m.valor} ${esc(e.u)}</span></div>`).join('')}
        ${lista.length<Data.teamPlayers(t.id).length?`<div class="tiny"
          style="margin-top:8px">${lista.length} de ${Data.teamPlayers(t.id).length}
          jugadores tienen marca</div>`:''}
      </div>`).join('')}`:''}`;
  },

  stats(t){
    const st = Data.statsEquipo(t.id);
    const cob = Data.coberturaPuestos(t.id);
    const huecos = cob.filter(c=>c.exactos===0);
    return `
    ${st.partidos ? `
      <div class="metrics">
        <div class="metric good"><div class="mv">${st.ganados}</div>
          <div class="ml">Ganados</div></div>
        <div class="metric"><div class="mv">${st.empatados}</div>
          <div class="ml">Empatados</div></div>
        <div class="metric warn"><div class="mv">${st.perdidos}</div>
          <div class="ml">Perdidos</div></div>
      </div>
      <div class="t-sec">Ataque y defensa</div>
      <div class="panel">
        <div class="kv"><span>Puntos a favor</span><span>${st.pf}</span></div>
        <div class="kv"><span>Puntos en contra</span><span>${st.pc}</span></div>
        <div class="kv"><span>Diferencia</span>
          <span style="color:${st.dif>=0?'var(--ok)':'var(--bad)'}">${
            st.dif>0?'+':''}${st.dif}</span></div>
        <div class="kv"><span>Media por partido</span>
          <span>${st.mediaFavor} – ${st.mediaContra}</span></div>
        <div class="kv"><span>Ensayos marcados</span><span>${st.ensayos}</span></div>
        ${st.conversion!==null?`<div class="kv"><span>Transformaciones logradas</span>
          <span>${st.conversion}%</span></div>`:''}
        <div class="kv"><span>Tarjetas</span><span>${st.tarjetas}</span></div>
      </div>`
    : hint('Todavía no hay partidos finalizados. Cuando cierres el acta de uno, '+
        'aquí aparecerán las estadísticas del equipo.')}

    <div class="t-sec">Plantilla</div>
    <div class="panel">
      <div class="kv"><span>Jugadores</span><span>${st.plantilla}</span></div>
      <div class="kv"><span>Delantera</span><span>${st.delanteros}</span></div>
      <div class="kv"><span>Tres cuartos</span><span>${st.linea}</span></div>
      ${st.sinEtiquetar?`<div class="kv"><span>Sin puesto asignado</span>
        <span style="color:var(--warn)">${st.sinEtiquetar}</span></div>`:''}
      ${st.asistenciaMedia!==null?`<div class="kv"><span>Asistencia media</span>
        <span>${st.asistenciaMedia}%</span></div>`:''}
      ${st.partidos?`<div class="kv"><span>Reparto de minutos</span>
        <span>${st.hanJugado} de ${st.plantilla} han jugado</span></div>`:''}
    </div>
    ${st.partidos && st.reparto<70 ? hint('Solo ha jugado el '+st.reparto+'% de la '+
      'plantilla. En categorías de formación conviene repartir más minutos.','warn'):''}

    <div class="t-sec">Cobertura de puestos</div>
    ${huecos.length ? hint('<strong>'+huecos.length+' puestos sin ningún '+
      'especialista.</strong> Etiqueta a más jugadores o forma a alguien.','warn')
      : hint('Todos los puestos tienen al menos un especialista.','ok')}
    <div class="rows">${cob.map(c=>`
      <div class="row">
        <span class="dorsal">${c.hueco.n}</span>
        <div class="row-b"><b>${esc(c.hueco.t)}</b>
          <span>${esc(c.hueco.linea)}</span></div>
        <div class="row-e">${c.exactos
          ? tag(c.exactos+' especialista'+(c.exactos>1?'s':''),'t-ok')
          : c.aptos ? tag(c.aptos+' podrían','t-warn') : tag('Sin nadie','t-bad')}</div>
      </div>`).join('')}</div>

    ${st.partidosLista.length?`<div class="t-sec">Partidos jugados</div>
    <div class="rows">${st.partidosLista.map(m=>{
      const ev = Data.event(m.event_id);
      if(!ev) return '';
      const r = m.puntos_favor>m.puntos_contra?'t-ok'
        : m.puntos_favor<m.puntos_contra?'t-bad':'t-mute';
      return `<button class="row" onclick="Shell.go('partido',{eventId:'${m.event_id}',mTab:'resumen'})">
        ${daymark(ev.inicio)}
        <div class="row-b"><b>${evTitulo(ev)}</b>
          <span>${fechaCorta(ev.inicio,false)}</span></div>
        <div class="row-e"><span class="amt">${m.puntos_favor}–${m.puntos_contra}</span>
          ${tag(m.puntos_favor>m.puntos_contra?'Victoria'
            :m.puntos_favor<m.puntos_contra?'Derrota':'Empate', r)}</div>
      </button>`;
    }).join('')}</div>`:''}`;
  },

  /* ---------- ficha ---------- */
  ficha(id){
    const p = Data.player(id);
    if(!p) return blank(I.question(24),'Jugador no encontrado','');
    const st = Data.attStats(id);
    const evs = Data.evaluations(id);
    const ult = evs[0];
    const les = Data.injuries(id).filter(i=>i.estado!=='alta');
    const obj = Data.goals(id);
    const nts = Data.notes(id);
    const tab = S.fTab || 'resumen';
    const t = Data.playerTeam(id);
    const ed = edad(p.fecha_nac);

    return `
    <button class="back" onclick="Shell.back()">${I.chevL(16)} Volver</button>
    <div class="who">${ava(p.nombre,'xl')}
      <div><h1 class="t-page" style="margin:0">${esc(p.nombre)}</h1>
        <p class="t-sub" style="margin:3px 0 0">${esc(t?.nombre||'')}${
          ed?' · '+ed+' años':''}${p.posicion?' · '+esc(p.posicion):''}</p></div></div>

    <div class="metrics">
      <div class="metric ${st.pct!==null&&st.pct<70?'warn':''}">
        <div class="mv">${st.pct===null?'—':st.pct+'%'}</div>
        <div class="ml">Asistencia · ${st.ok}/${st.total}</div></div>
      <div class="metric"><div class="mv">${ult
        ? ((ult.tecnica+ult.fisico+ult.tactica+ult.actitud)/4).toFixed(1) : '—'}</div>
        <div class="ml">Última valoración</div></div>
    </div>

    ${les.length ? hint(`<strong>${esc(les[0].tipo||'Lesión')}${
      les[0].zona?' · '+esc(les[0].zona):''}</strong><br>${
      les[0].estado==='activa'?'De baja':'En recuperación'}${
      les[0].alta_prev?' · alta prevista '+les[0].alta_prev:''}`,'bad') : ''}

    ${p.alergias||p.notas_medicas ? hint(
      `<strong>Información médica</strong><br>${esc(p.alergias||'')}${
      p.alergias&&p.notas_medicas?'. ':''}${esc(p.notas_medicas||'')}`,'warn') : ''}

    <div class="tabs">
      <button class="${tab==='resumen'?'on':''}" onclick="S.fTab='resumen';Shell.render()">Resumen</button>
      <button class="${tab==='eval'?'on':''}" onclick="S.fTab='eval';Shell.render()">Valoración</button>
      <button class="${tab==='fisico'?'on':''}" onclick="S.fTab='fisico';Shell.render()">Físico</button>
      <button class="${tab==='notas'?'on':''}" onclick="S.fTab='notas';Shell.render()">Mis notas</button>
    </div>

    ${tab==='resumen'?`
      <div class="t-sec">Objetivos</div>
      ${obj.length ? `<div class="rows">${obj.map(g=>`
        <button class="row" onclick="Coach.objetivo('${g.id}')">
          <span class="box ${g.hecho?'on':''}">${g.hecho?I.check(15):''}</span>
          <div class="row-b"><b style="font-weight:500" class="${g.hecho?'strike':''}">
            ${esc(g.texto)}</b></div>
        </button>`).join('')}</div>`
      : blank(I.target(22),'Sin objetivos',
        'Fija uno o dos objetivos concretos. El jugador y su familia los verán.')}
      <button class="btn btn-2" onclick="Coach.nuevoObjetivo('${id}')">
        ${I.plus(17)} Añadir objetivo</button>

      ${(()=>{ const t2=Data.playerTeam(id); if(!t2) return '';
        const rt=Data.resumenTemporada(t2.id); const x=rt.jugadores[id];
        if(!x||!x.partidos) return '';
        return `<div class="t-sec">Partidos de la temporada</div>
        <div class="metrics">
          <div class="metric"><div class="mv">${x.partidos}</div>
            <div class="ml">Partidos</div></div>
          <div class="metric"><div class="mv">${x.minutos}'</div>
            <div class="ml">Minutos</div></div>
          <div class="metric"><div class="mv">${x.ensayos}</div>
            <div class="ml">Ensayos</div></div>
          <div class="metric ${x.tarjetas?'warn':''}"><div class="mv">${x.tarjetas}</div>
            <div class="ml">Tarjetas</div></div>
        </div>`; })()}

      <div class="t-sec">Puestos</div>
      ${(()=>{ const ids=Data.posicionesDe(id);
        if(!ids.length) return blank(I.target(22),'Sin puesto asignado',
          'Etiquétalo para que la alineación automática y los recambios lo '+
          'coloquen donde toca.',
          `<button class="btn btn-2" onclick="Coach.editarPuestos('${id}')">
            Asignar puesto</button>`);
        return `<div class="rows">${ids.map((pid,i)=>{ const c=POS(pid);
          return `<div class="row"><span class="dorsal">${c.n}</span>
            <div class="row-b"><b>${esc(c.t)}</b><span>${esc(c.linea)} · ${esc(c.desc)}</span></div>
            <div class="row-e">${i===0?tag('Principal','t-accent'):tag('Alternativo','t-mute')}</div>
          </div>`; }).join('')}</div>
        <button class="btn btn-2" onclick="Coach.editarPuestos('${id}')">
          ${I.settings(17)} Cambiar puestos</button>`; })()}

      <div class="t-sec">Datos deportivos</div>
      <div class="panel">
        <div class="kv"><span>Grupo</span><span>${
          Data.grupoDe(id)==='delantera'?'Delantera'
          :Data.grupoDe(id)==='trescuartos'?'Tres cuartos'
          :Data.grupoDe(id)==='mixto'?'Polivalente':'Sin definir'}</span></div>
        <div class="kv"><span>Dorsal</span><span>${p.dorsal||'—'}</span></div>
        <div class="kv"><span>Talla</span><span>${esc(p.talla||'—')}</span></div>
        <div class="kv"><span>Alta en el club</span><span>${esc(p.alta||'—')}</span></div>
      </div>
      ${hint('Como entrenador no ves los datos económicos ni el contacto de las familias.')}
      <div class="stack">
        <button class="btn btn-2" onclick="Coach.editarFicha('${id}')">
          ${I.settings(17)} Editar ficha</button>
        <button class="btn btn-2" onclick="Coach.nuevaLesion('${id}')">
          ${I.bandage(17)} Registrar lesión</button>
        ${les.length?`<button class="btn btn-2" onclick="Coach.altaLesion('${les[0].id}')">
          ${I.check(17)} Dar de alta médica</button>`:''}
        ${Data.hermanos(Data.playerTeam(id)?.id||'').length?`
          <button class="btn btn-2" onclick="Coach.moverGrupo('${id}')">
            ${I.arrow(17)} Subir o bajar de grupo</button>`:''}
        ${Data.is('junta','coordinador')?`
          <button class="btn btn-2" onclick="Coach.moverJugador('${id}')">
            ${I.swap(17)} Cambiar de categoría</button>
          <button class="btn btn-text" onclick="Coach.bajaJugador('${id}')">
            ${I.trash(16)} Dar de baja del club</button>`:''}
      </div>
    `:''}

    ${tab==='eval'?`
      ${evs.length ? evs.map(e=>`<div class="panel">
        <div class="panel-hd" style="margin-bottom:10px">
          <b>${esc(e.periodo||e.fecha)}</b>
          ${e.compartida?tag('Compartida','t-ok'):tag('Solo técnicos','t-mute')}</div>
        <div class="kv"><span>Técnica</span>${score(e.tecnica)}</div>
        <div class="kv"><span>Físico</span>${score(e.fisico)}</div>
        <div class="kv"><span>Táctica</span>${score(e.tactica)}</div>
        <div class="kv"><span>Actitud</span>${score(e.actitud)}</div>
        ${e.fuerte?`<div class="quote good"><b>Fortalezas</b>${esc(e.fuerte)}</div>`:''}
        ${e.mejora?`<div class="quote work"><b>A mejorar</b>${esc(e.mejora)}</div>`:''}
      </div>`).join('')
      : blank(I.star(22,false),'Sin valoraciones',
        'Una valoración por trimestre basta. Decide en cada una si la comparte '+
        'con la familia.')}
      <button class="btn btn-accent" onclick="Coach.nuevaEval('${id}')">
        ${I.plus(17)} Nueva valoración</button>
    `:''}

    ${tab==='fisico'?this.fisico(id,p):''}

    ${tab==='notas'?`
      ${hint('Estas notas son privadas: no las ve la familia, ni el jugador, '+
        'ni otros entrenadores.')}
      ${nts.length ? `<div class="rows">${nts.map(n=>`
        <div class="row"><div class="row-b">
          <b style="font-weight:400;white-space:normal">${esc(n.texto)}</b>
          <span>${fechaCorta(n.at,false)}</span></div></div>`).join('')}</div>`
      : blank(I.doc(22),'Sin notas','Anota lo que quieras recordar de este jugador.')}
      <div class="f"><textarea class="in" id="nota" rows="3"
        placeholder="Escribe una nota privada"></textarea></div>
      <button class="btn" onclick="Coach.guardarNota('${id}')">Guardar nota</button>
    `:''}`;
  },

  fisico(id, p){
    const t = Data.playerTeam(id);
    const marcas = Data.marcas(id);
    const ed = edad(p.fecha_nac);
    const imc = (p.peso && p.altura)
      ? (p.peso/Math.pow(p.altura/100,2)).toFixed(1) : null;
    return `
    <div class="t-sec">Datos físicos</div>
    <div class="panel">
      <div class="kv"><span>Edad</span><span>${ed?ed+' años':'—'}</span></div>
      <div class="kv"><span>Peso</span><span>${p.peso?p.peso+' kg':'—'}</span></div>
      <div class="kv"><span>Altura</span><span>${p.altura?p.altura+' cm':'—'}</span></div>
      ${imc?`<div class="kv"><span>Índice de masa corporal</span><span>${imc}</span></div>`:''}
      <div class="kv"><span>Pie dominante</span><span>${esc(p.pie||'—')}</span></div>
    </div>
    ${ed && ed<16 ? hint('En categorías de formación el peso y la altura son '+
      'orientativos. No conviene usarlos para comparar ni para seleccionar.','warn'):''}
    <button class="btn btn-2" onclick="Coach.editarFisico('${id}')">
      ${I.settings(17)} Editar datos físicos</button>

    ${this.bloqueMarcas(id, t)}

    <div class="t-sec">Asistencia</div>
    ${this.historialAsistencia(id)}`;
  },

  /** Solo se listan las pruebas con marca. El resto se añaden a demanda. */
  bloqueMarcas(id, t){
    const con = Data.marcasDe(id);
    const todas = Data.pruebas();
    const sin = todas.filter(pr=>!con.some(x=>x.prueba.id===pr.id));
    const icoU = u => u==='kg'?I.dumbbell(18):u==='s'?I.clock(18)
      :u==='rep'?I.check(18):I.chart(18);
    return `
    <div class="t-sec">Marcas registradas</div>
    ${con.length ? `<div class="rows">${con.map(({prueba:pr,marca:m})=>{
      const rank = t ? Data.rankingMarca(t.id, pr.id) : [];
      const pos = rank.findIndex(x=>x.p.id===id);
      const hist = Data.historicoMarca(id, pr.id);
      const antes = hist[1];
      const mejora = antes ? (pr.menorMejor ? antes.valor-m.valor : m.valor-antes.valor) : 0;
      return `<button class="row" onclick="Coach.editarMarca('${id}','${pr.id}')">
        <div class="ava sq">${icoU(pr.u)}</div>
        <div class="row-b"><b>${esc(pr.t)}</b>
          <span>${esc(m.fecha)}${mejora>0?' · mejoró '+(+mejora.toFixed(2))+' '+pr.u:''}</span></div>
        <div class="row-e">
          <span class="amt">${m.valor} ${esc(pr.u)}</span>
          ${pos>=0&&rank.length>1?`<span class="tiny">${pos+1}º de ${rank.length}</span>`:''}
        </div>
      </button>`;
    }).join('')}</div>`
    : blank(I.dumbbell(22),'Sin marcas registradas',
      'Registra solo las pruebas que hagáis. No hace falta rellenarlas todas.')}

    ${sin.length ? `<button class="btn btn-2" onclick="Coach.anotarNueva('${id}')">
      ${I.plus(17)} Anotar otra prueba</button>` : ''}
    <button class="btn btn-text" onclick="Coach.gestionarPruebas('${id}')">
      ${I.settings(16)} Configurar las pruebas del club</button>`;
  },

  anotarNueva(pid){
    const con = Data.marcasDe(pid).map(x=>x.prueba.id);
    const sin = Data.pruebas().filter(pr=>!con.includes(pr.id));
    sheet('Anotar una prueba', `
      ${hint('Elige la prueba que habéis hecho. Solo aparecen las que aún no '+
        'tiene registradas.')}
      <div class="rows">${sin.map(pr=>`
        <button class="sel" onclick="closeSheet();Coach.editarMarca('${pid}','${pr.id}')">
          <div class="ava sq">${pr.u==='s'?I.clock(18):I.dumbbell(18)}</div>
          <div class="row-b"><b>${esc(pr.t)}</b>
            <span>Se mide en ${esc(pr.u)}${pr.menorMejor?' · menos es mejor':''}</span></div>
          <span style="color:var(--t3)">${I.chevron(17)}</span>
        </button>`).join('')}</div>
      <button class="btn btn-2" style="margin-top:12px"
        onclick="closeSheet();Coach.nuevaPrueba('${pid}')">
        ${I.plus(17)} Crear una prueba nueva</button>`);
  },

  gestionarPruebas(volverA){
    const l = Data.pruebas();
    sheet('Pruebas físicas del club', `
      ${hint('Quita las que no hagáis y añade las vuestras. Al borrar una se '+
        'eliminan también las marcas registradas en ella.')}
      <div class="rows">${l.map((pr,i)=>{
        const uso = Data.usoPrueba(pr.id);
        return `<div class="row">
          <div class="ava sq">${pr.u==='s'?I.clock(18):I.dumbbell(18)}</div>
          <div class="row-b"><b>${esc(pr.t)}</b>
            <span>${esc(pr.u)}${pr.menorMejor?' · menos es mejor':''}${
              uso?' · '+uso+(uso===1?' jugador':' jugadores'):' · sin usar'}</span></div>
          <div class="row-e" style="flex-direction:row;gap:4px;align-items:center">
            ${i>0?`<button class="ibtn" title="Subir"
              onclick="Coach.ordenarPrueba('${pr.id}',-1,'${volverA||''}')">${I.chevL(15)}</button>`:''}
            <button class="ibtn" title="Editar"
              onclick="Coach.editarPrueba('${pr.id}','${volverA||''}')">${I.settings(16)}</button>
            <button class="ibtn" title="Borrar"
              onclick="Coach.borrarPrueba('${pr.id}','${volverA||''}')">${I.trash(16)}</button>
          </div>
        </div>`;
      }).join('')}</div>
      <button class="btn btn-accent" style="margin-top:12px"
        onclick="Coach.nuevaPrueba('${volverA||''}',true)">
        ${I.plus(17)} Añadir prueba propia</button>`);
  },
  ordenarPrueba(id, dir, volver){
    Data.moverPrueba(id, dir); this.gestionarPruebas(volver);
  },
  formPrueba(titulo, pr, accion, volver){
    sheet(titulo, `
      <div class="f"><label for="prT">Nombre de la prueba</label>
        <input class="in" id="prT" value="${esc(pr?pr.t:'')}"
          placeholder="Salto vertical"></div>
      <div class="f"><label for="prU">Unidad de medida</label>
        <select class="in" id="prU">${UNIDADES.map(u=>
          `<option ${pr&&pr.u===u?'selected':''}>${u}</option>`).join('')}</select>
        <div class="help">kg para fuerza, s para tiempos, m o cm para distancias,
          rep para repeticiones.</div></div>
      <label class="check"><input type="checkbox" id="prM" ${pr&&pr.menorMejor?'checked':''}>
        <span>Menos es mejor</span></label>
      <div class="help" style="margin-bottom:14px">Márcalo en pruebas de tiempo,
        como un sprint, donde la mejor marca es la más baja.</div>
      <button class="btn btn-accent" onclick="${accion}">Guardar</button>`);
  },
  nuevaPrueba(volver, desdeGestion){
    this.formPrueba('Nueva prueba', null,
      `Coach.guardarNuevaPrueba('${volver||''}',${!!desdeGestion})`, volver);
  },
  guardarNuevaPrueba(volver, desdeGestion){
    try{
      const pr = Data.addPrueba({ t:val('prT'), u:val('prU'), menorMejor:chk('prM') });
      closeSheet(); toast('Prueba creada');
      if(desdeGestion) this.gestionarPruebas(volver);
      else if(volver) this.editarMarca(volver, pr.id);
      Shell.render();
    }catch(e){ toast(e.message); }
  },
  editarPrueba(id, volver){
    const pr = Data.prueba(id);
    this.formPrueba('Editar prueba', pr,
      `Coach.guardarPrueba('${id}','${volver||''}')`, volver);
  },
  guardarPrueba(id, volver){
    try{
      Data.updatePrueba(id,{ t:val('prT'), u:val('prU'), menorMejor:chk('prM') });
      closeSheet(); toast('Prueba actualizada');
      this.gestionarPruebas(volver); Shell.render();
    }catch(e){ toast(e.message); }
  },
  borrarPrueba(id, volver){
    const pr = Data.prueba(id);
    const uso = Data.usoPrueba(id);
    confirmSheet('Borrar '+pr.t,
      uso ? 'Hay '+uso+(uso===1?' jugador':' jugadores')+' con marca en esta prueba. '+
            'Se borrarán también sus registros. No se puede deshacer.'
          : 'Nadie tiene marcas en esta prueba, así que no se pierde nada.',
      'Borrar prueba', ()=>{
        try{ Data.removePrueba(id); toast('Prueba borrada');
          this.gestionarPruebas(volver); Shell.render(); }
        catch(e){ toast(e.message); }
      });
  },

  historialAsistencia(pid){
    const t = Data.playerTeam(pid);
    if(!t) return '<p class="tiny">Sin equipo.</p>';
    const evs = Data.events(t.id,{ pasados:true });
    const regs = evs.map(e=>({ e, a:Data.attendance(e.id).find(x=>x.player_id===pid) }))
      .filter(x=>x.a);
    if(!regs.length) return blank(I.check(22),'Sin registros',
      'Aparecerán cuando el entrenador pase lista.');
    const st = Data.attStats(pid);
    const cuenta = {};
    regs.forEach(x=>{ cuenta[x.a.estado] = (cuenta[x.a.estado]||0)+1; });
    return `
    <div class="panel">
      <div class="panel-hd" style="margin-bottom:10px">
        <b>${st.pct}% de asistencia</b>
        <span class="tiny">${st.ok} de ${st.total}</span></div>
      ${meter(st.pct, st.pct>=85?'ok':'')}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
        ${Object.entries(cuenta).map(([k,v])=>
          `<span class="tag ${ATT_T[k].c}">${v} ${ATT_T[k].t.toLowerCase()}</span>`).join('')}
      </div>
    </div>
    <div class="rows">${regs.slice(0,12).map(x=>`
      <div class="row">${daymark(x.e.inicio)}
        <div class="row-b"><b>${evTitulo(x.e)}</b>
          <span>${fechaCorta(x.e.inicio,false)}</span></div>
        <div class="row-e">${tagAtt(x.a.estado)}</div>
      </div>`).join('')}</div>
    ${regs.length>12?`<p class="tiny" style="text-align:center">Mostrando las 12 últimas de ${regs.length}</p>`:''}`;
  },

  editarPuestos(pid){
    S.puestos = new Set(Data.posicionesDe(pid));
    this.pantallaPuestos(pid);
  },
  pantallaPuestos(pid){
    const sel = S.puestos;
    const grupo = g => `
      <div class="t-sec">${GRUPOS[g].t}</div>
      <div class="rows">${POS_POR_GRUPO(g).map(c=>{
        const on = sel.has(c.id);
        return `<button class="sel ${on?'on':''}" onclick="Coach.togPuesto('${pid}','${c.id}')">
          <span class="box">${on?I.check(15):''}</span>
          <span class="dorsal">${c.n}</span>
          <div class="row-b"><b>${esc(c.t)}</b><span>${esc(c.desc)}</span></div>
        </button>`;
      }).join('')}</div>`;
    sheet('Puestos del jugador', `
      ${hint('Marca hasta cuatro. El primero que elijas es el principal y se usa '+
        'para la alineación automática.')}
      <p class="tiny" style="margin-bottom:12px">Seleccionados: <strong>${
        sel.size?[...sel].map(id=>POS(id).corto).join(', '):'ninguno'}</strong></p>
      ${grupo('delantera')}${grupo('trescuartos')}
      <button class="btn btn-accent" style="margin-top:12px"
        onclick="Coach.guardarPuestos('${pid}')">Guardar puestos</button>`);
  },
  togPuesto(pid, id){
    const s2 = S.puestos;
    if(s2.has(id)) s2.delete(id);
    else { if(s2.size>=4){ toast('Máximo cuatro puestos'); return; } s2.add(id); }
    this.pantallaPuestos(pid);
  },
  guardarPuestos(pid){
    Data.setPosiciones(pid, [...S.puestos]);
    S.puestos=null; closeSheet(); toast('Puestos actualizados'); Shell.render();
  },

  editarFisico(pid){
    const p = Data.player(pid);
    sheet('Datos físicos', `
      <div class="f2">
        <div class="f"><label for="fzP">Peso (kg)</label>
          <input class="in" id="fzP" type="number" min="20" max="180" step="0.5"
            value="${p.peso||''}"></div>
        <div class="f"><label for="fzA">Altura (cm)</label>
          <input class="in" id="fzA" type="number" min="100" max="230"
            value="${p.altura||''}"></div>
      </div>
      <div class="f"><label for="fzD">Pie dominante</label>
        <select class="in" id="fzD">
          ${['','Derecho','Izquierdo','Ambidiestro'].map(x=>
            `<option ${p.pie===x?'selected':''}>${x}</option>`).join('')}
        </select></div>
      ${hint('Estos datos solo los ven el cuerpo técnico y la junta.')}
      <button class="btn" onclick="Coach.guardarFisico('${pid}')">Guardar</button>`);
  },
  guardarFisico(pid){
    Data.updatePlayer(pid,{ peso:+val('fzP')||null, altura:+val('fzA')||null,
      pie:val('fzD') });
    closeSheet(); toast('Datos guardados'); Shell.render();
  },
  editarMarca(pid, ejId){
    const pr = Data.prueba(ejId);
    if(!pr){ toast('Esa prueba ya no existe'); return; }
    const m = Data.marcas(pid)[ejId];
    const hist = Data.historicoMarca(pid, ejId);
    sheet(pr.t, `
      <div class="f"><label for="mkV">Marca en ${esc(pr.u)}</label>
        <input class="in" id="mkV" type="number" inputmode="decimal"
          step="${pr.u==='s'?'0.01':pr.u==='rep'?'1':'0.5'}"
          value="${m?m.valor:''}" placeholder="0">
        <div class="help">${pr.menorMejor
          ? 'En esta prueba la mejor marca es la más baja.'
          : 'Se guarda la última que anotes y se conserva el registro anterior.'}</div></div>
      <div class="f"><label for="mkF">Fecha</label>
        <input class="in" id="mkF" type="date"
          value="${m?m.fecha:new Date().toISOString().slice(0,10)}"></div>
      ${hist.length>1?`<div class="t-sec">Registros anteriores</div>
        <div class="rows">${hist.slice(1).map(h=>`
          <div class="row"><div class="ava sq">${I.chart(17)}</div>
            <div class="row-b"><b>${h.valor} ${esc(pr.u)}</b>
              <span>${esc(h.fecha)}</span></div></div>`).join('')}</div>`:''}
      <button class="btn btn-accent" onclick="Coach.guardarMarca('${pid}','${ejId}')">
        Guardar marca</button>
      ${m?`<div style="height:8px"></div>
        <button class="btn btn-text" onclick="Coach.borrarMarca('${pid}','${ejId}')">
          ${I.trash(16)} Quitar esta marca del jugador</button>`:''}`);
  },
  guardarMarca(pid, ejId){
    try{
      Data.setMarca(pid, ejId, val('mkV'), val('mkF'));
      closeSheet(); toast('Marca guardada'); Shell.render();
    }catch(e){ toast(e.message); }
  },
  borrarMarca(pid, ejId){
    const pr = Data.prueba(ejId);
    confirmSheet('Quitar la marca',
      'Se elimina el registro de '+pr.t+' de este jugador. La prueba sigue '+
      'existiendo para el resto del equipo.', 'Quitar', ()=>{
        Data.setMarca(pid, ejId, null); toast('Marca eliminada'); Shell.render();
      });
  },
  moverGrupo(pid){
    const actual = Data.playerTeam(pid);
    const herm = Data.hermanos(actual.id);
    sheet('Subir o bajar de grupo', `
      ${hint('El jugador pasa a la plantilla del otro grupo. Su historial, '+
        'asistencia y valoraciones se conservan.')}
      <div class="rows">${[actual,...herm].map(t=>`
        <button class="sel ${t.id===actual.id?'on':''}"
          onclick="Coach.confirmarGrupo('${pid}','${t.id}')">
          <span class="box">${t.id===actual.id?I.check(15):''}</span>
          <div class="row-b"><b>${esc(t.nombre)}</b>
            <span>${Data.teamPlayers(t.id).length} jugadores</span></div>
        </button>`).join('')}</div>`);
  },
  confirmarGrupo(pid, tid){
    try{ const t = Data.moverGrupo(pid, tid);
      closeSheet(); toast('Ahora está en '+t.nombre); Shell.render(); }
    catch(e){ toast(e.message); }
  },

  objetivo(id){ Data.toggleGoal(id); Shell.render(); },
  nuevoObjetivo(pid){
    sheet('Nuevo objetivo', `
      <div class="f"><label for="oT">Objetivo</label>
        <textarea class="in" id="oT" rows="3"
          placeholder="Mejorar la técnica de placaje con el hombro izquierdo"></textarea>
        <div class="help">Concreto y medible funciona mejor que general.
          El jugador y su familia lo verán en su perfil.</div></div>
      <button class="btn" onclick="Coach.guardarObjetivo('${pid}')">Añadir objetivo</button>`);
  },
  guardarObjetivo(pid){
    const t = val('oT');
    if(!t){ toast('Escribe el objetivo'); return; }
    Data.addGoal(pid,t); closeSheet(); toast('Objetivo añadido'); Shell.render();
  },
  guardarNota(pid){
    const t = val('nota');
    if(!t){ toast('Escribe algo primero'); return; }
    Data.addNote(pid,t); toast('Nota guardada'); Shell.render();
  },
  nuevaEval(pid){
    S.rate = { tecnica:3, fisico:3, tactica:3, actitud:3 };
    const fila = (k,l) => `<div class="f"><label>${l}</label>
      <div class="rating" id="rt_${k}">${[1,2,3,4,5].map(i=>
        `<button data-v="${i}" onclick="Coach.rate('${k}',${i})">${I.star(26,i<=3)}</button>`
      ).join('')}</div></div>`;
    sheet('Nueva valoración', `
      ${fila('tecnica','Técnica')}${fila('fisico','Físico')}
      ${fila('tactica','Táctica')}${fila('actitud','Actitud')}
      <div class="f"><label for="evF">Fortalezas</label>
        <textarea class="in" id="evF" rows="2"
          placeholder="Qué está haciendo bien"></textarea></div>
      <div class="f"><label for="evM">A mejorar</label>
        <textarea class="in" id="evM" rows="2"
          placeholder="En qué debe seguir trabajando"></textarea></div>
      <label class="check"><input type="checkbox" id="evS" checked>
        <span>Compartir con la familia y el jugador</span></label>
      <div class="help" style="margin-bottom:14px">Si la compartes, recibirán un aviso.
        Si no, la valoración queda solo para el cuerpo técnico.</div>
      <button class="btn btn-accent" onclick="Coach.guardarEval('${pid}')">
        Guardar valoración</button>`);
  },
  rate(k,v){
    S.rate[k]=v;
    const box = document.getElementById('rt_'+k);
    if(box) [...box.children].forEach(b=>{
      b.classList.toggle('on', +b.dataset.v<=v);
      b.innerHTML = I.star(26, +b.dataset.v<=v);
    });
  },
  guardarEval(pid){
    const r = S.rate;
    Data.saveEvaluation({ player_id:pid,
      periodo:'Valoración de '+MESL[new Date().getMonth()],
      tecnica:r.tecnica, fisico:r.fisico, tactica:r.tactica, actitud:r.actitud,
      fuerte:val('evF'), mejora:val('evM'), compartida:chk('evS') });
    closeSheet(); toast('Valoración guardada'); Shell.render();
  },
  nuevaLesion(pid){
    sheet('Registrar lesión', `
      <div class="f"><label for="liT">Tipo</label>
        <input class="in" id="liT" placeholder="Esguince, contractura..."></div>
      <div class="f"><label for="liZ">Zona</label>
        <input class="in" id="liZ" placeholder="Tobillo derecho"></div>
      <div class="f"><label for="liA">Alta prevista <span class="muted">(opcional)</span></label>
        <input class="in" id="liA" type="date"></div>
      <div class="f"><label for="liN">Notas</label>
        <textarea class="in" id="liN" rows="2"></textarea></div>
      ${hint('El jugador quedará marcado en la plantilla y en las convocatorias.','warn')}
      <button class="btn" onclick="Coach.guardarLesion('${pid}')">Registrar</button>`);
  },
  guardarLesion(pid){
    const t = val('liT');
    if(!t){ toast('Indica el tipo de lesión'); return; }
    Data.addInjury({ player_id:pid, tipo:t, zona:val('liZ'),
      alta_prev:val('liA')||null, notas:val('liN') });
    closeSheet(); toast('Lesión registrada'); Shell.render();
  },
  altaLesion(id){ Data.closeInjury(id); toast('Jugador disponible'); Shell.render(); },

  editarFicha(pid){
    const p = Data.player(pid);
    sheet('Editar ficha', `
      <div class="f"><label for="efN">Nombre y apellidos</label>
        <input class="in" id="efN" value="${esc(p.nombre)}"></div>
      <div class="f2">
        <div class="f"><label for="efF">Fecha de nacimiento</label>
          <input class="in" id="efF" type="date" value="${esc(p.fecha_nac||'')}"></div>
        <div class="f"><label for="efD">Dorsal</label>
          <input class="in" id="efD" type="number" min="1" max="99"
            value="${p.dorsal||''}"></div>
      </div>
      <div class="f2">
        <div class="f"><label for="efT">Talla</label>
          <select class="in" id="efT">${['','6','8','10','12','14','XS','S','M','L','XL']
            .map(t=>`<option ${p.talla===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="f"><label for="efPe">Peso (kg)</label>
          <input class="in" id="efPe" type="number" step="0.5" value="${p.peso||''}"></div>
      </div>
      ${hint('Los puestos se asignan desde el botón Puestos, en el resumen.')}
      <div class="f"><label for="efA">Alergias e información médica</label>
        <textarea class="in" id="efA" rows="2">${esc(p.alergias||'')}</textarea>
        <div class="help">Visible para el cuerpo técnico y la junta, para poder
          actuar en una urgencia.</div></div>
      <button class="btn btn-accent" onclick="Coach.guardarFicha('${pid}')">
        Guardar</button>`);
  },
  guardarFicha(pid){
    const n = val('efN');
    if(!n){ toast('El nombre no puede quedar vacío'); return; }
    Data.updatePlayer(pid,{ nombre:n, fecha_nac:val('efF')||null,
      dorsal:+val('efD')||null, talla:val('efT'), peso:+val('efPe')||null,
      alergias:val('efA') });
    closeSheet(); toast('Ficha actualizada'); Shell.render();
  },
  moverJugador(pid){
    const p = Data.player(pid);
    const actual = Data.playerTeam(pid);
    sheet('Cambiar de categoría', `
      ${hint('La cuota pasa a ser la de la nueva categoría. El historial de '+
        'asistencia y valoraciones se conserva.')}
      <div class="rows">${Data.teams().map(t=>`
        <button class="sel ${t.id===actual?.id?'on':''}"
          onclick="Coach.confirmarMover('${pid}','${t.id}')">
          <span class="box">${t.id===actual?.id?I.check(15):''}</span>
          <div class="row-b"><b>${esc(t.nombre)}</b>
            <span>${eur(t.cat?.cuota||0)} al mes · ${Data.teamPlayers(t.id).length} jugadores</span></div>
        </button>`).join('')}</div>`);
  },
  confirmarMover(pid, tid){
    Data.movePlayer(pid, tid);
    closeSheet(); toast('Cambiado a '+Data.team(tid).nombre); Shell.render();
  },
  bajaJugador(pid){
    const p = Data.player(pid);
    confirmSheet('Dar de baja a '+p.nombre.split(' ')[0],
      'Se eliminarán su ficha, su asistencia, sus valoraciones y sus recibos '+
      'pendientes. No se puede deshacer.', 'Dar de baja',
      ()=>{ Data.removePlayer(pid); Shell.back(); toast('Deportista dado de baja'); });
  },

  /* ==================== SESIONES ==================== */
  sesion(){
    const t = this.team();
    if(!t) return this.sinEquipo();
    const ss = Data.sessions(t.id);
    return `
    <h1 class="t-page">Sesiones</h1>
    <p class="t-sub">Planifica el entrenamiento y reutilízalo</p>
    ${this.switcher()}
    <button class="btn btn-accent" onclick="Coach.nuevaSesion()">
      ${I.plus(17)} Planificar sesión</button>
    <div style="height:12px"></div>
    ${ss.length ? `<div class="rows">${ss.map(s=>{
      const ds = Data.sessionDrills(s.id);
      const min = ds.reduce((a,b)=>a+(b.drill?.min||0),0);
      return `<button class="row" onclick="Coach.verSesion('${s.id}')">
        <div class="ava sq">${I.clipboard(18)}</div>
        <div class="row-b"><b>${esc(s.titulo)}</b>
          <span>${esc(s.fecha||'')} · ${ds.length} ejercicios · ${min} min</span></div>
        <span style="color:var(--t3)">${I.chevron(17)}</span>
      </button>`;
    }).join('')}</div>`
    : blank(I.clipboard(24),'Ninguna sesión planificada',
      'Monta una sesión con los ejercicios de la biblioteca y reutilízala '+
      'cuando quieras.')}

    <div class="t-sec">Biblioteca de ejercicios</div>
    <div class="rows">${Data.drills().map(d=>`
      <button class="row" onclick="Coach.verDrill('${d.id}')">
        <div class="ava sq">${d.tipo==='Físico'?I.dumbbell(18)
          :d.tipo==='Técnica'?I.target(18):d.tipo==='Táctica'?I.sparkle(18):I.ball(18)}</div>
        <div class="row-b"><b>${esc(d.nombre)}</b>
          <span>${esc(d.tipo)} · ${d.min} min</span></div>
        <span style="color:var(--t3)">${I.chevron(17)}</span>
      </button>`).join('')}</div>
    <button class="btn btn-2" onclick="Coach.nuevoDrill()">
      ${I.plus(17)} Añadir ejercicio propio</button>`;
  },
  verDrill(id){
    const d = Data.drills().find(x=>x.id===id);
    sheet(d.nombre, `
      <div class="kv"><span>Tipo</span><span>${esc(d.tipo)}</span></div>
      <div class="kv"><span>Duración</span><span>${d.min} min</span></div>
      <div class="kv"><span>Material</span><span>${esc(d.material||'—')}</span></div>
      <div class="t-sec">Objetivo</div><p style="margin:0 0 14px">${esc(d.objetivo||'')}</p>
      <div class="t-sec">Desarrollo</div><p style="margin:0">${esc(d.desc||'')}</p>`);
  },
  nuevoDrill(){
    sheet('Nuevo ejercicio', `
      <div class="f"><label for="dN">Nombre</label><input class="in" id="dN"></div>
      <div class="f2">
        <div class="f"><label for="dT">Tipo</label>
          <select class="in" id="dT"><option>Técnica</option><option>Físico</option>
            <option>Táctica</option><option>Juego</option></select></div>
        <div class="f"><label for="dM">Minutos</label>
          <input class="in" id="dM" type="number" min="1" value="15"></div>
      </div>
      <div class="f"><label for="dO">Objetivo</label><input class="in" id="dO"></div>
      <div class="f"><label for="dD">Desarrollo</label>
        <textarea class="in" id="dD" rows="3"></textarea></div>
      <div class="f"><label for="dMa">Material</label><input class="in" id="dMa"></div>
      <button class="btn" onclick="Coach.guardarDrill()">Añadir a la biblioteca</button>`);
  },
  guardarDrill(){
    const n = val('dN');
    if(!n){ toast('Ponle nombre al ejercicio'); return; }
    Data.addDrill({ nombre:n, tipo:val('dT'), min:+val('dM')||10,
      objetivo:val('dO'), desc:val('dD'), material:val('dMa') });
    closeSheet(); toast('Ejercicio añadido'); Shell.render();
  },
  nuevaSesion(){
    S.pick = new Set();
    sheet('Planificar sesión', `
      <div class="f"><label for="sT">Título</label>
        <input class="in" id="sT" placeholder="Sesión 3 · Placaje y continuidad"></div>
      <div class="f"><label for="sO">Objetivo de la sesión</label>
        <input class="in" id="sO" placeholder="Mejorar la llegada al ruck"></div>
      <div class="f"><label for="sF">Fecha</label>
        <input class="in" id="sF" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="t-sec">Ejercicios</div>
      <div class="rows">${Data.drills().map(d=>`
        <button class="sel" data-id="${d.id}" onclick="Coach.pick(this,'${d.id}')">
          <span class="box"></span>
          <div class="row-b"><b>${esc(d.nombre)}</b>
            <span>${esc(d.tipo)} · ${d.min} min</span></div>
        </button>`).join('')}</div>
      <button class="btn btn-accent" style="margin-top:12px"
        onclick="Coach.guardarSesion()">Guardar sesión</button>`);
  },
  pick(btn,id){
    if(S.pick.has(id)){ S.pick.delete(id); btn.classList.remove('on');
      btn.querySelector('.box').innerHTML=''; }
    else { S.pick.add(id); btn.classList.add('on');
      btn.querySelector('.box').innerHTML=I.check(15); }
  },
  guardarSesion(){
    const t = val('sT');
    if(!t){ toast('Ponle un título a la sesión'); return; }
    if(!S.pick.size){ toast('Elige al menos un ejercicio'); return; }
    Data.createSession({ team_id:S.teamId, titulo:t, objetivo:val('sO'),
      fecha:val('sF') }, [...S.pick]);
    closeSheet(); toast('Sesión guardada'); Shell.render();
  },
  verSesion(id){
    const s = DB.load().sessions.find(x=>x.id===id);
    const ds = Data.sessionDrills(id);
    const min = ds.reduce((a,b)=>a+(b.drill?.min||0),0);
    sheet(s.titulo, `
      <div class="kv"><span>Fecha</span><span>${esc(s.fecha||'—')}</span></div>
      <div class="kv"><span>Duración total</span><span>${min} min</span></div>
      ${s.objetivo?`<div class="t-sec">Objetivo</div>
        <p style="margin:0 0 14px">${esc(s.objetivo)}</p>`:''}
      <div class="t-sec">Desarrollo</div>
      <div class="rows">${ds.map((x,i)=>`
        <div class="row"><div class="ava sq">${i+1}</div>
          <div class="row-b"><b>${esc(x.drill?.nombre||'—')}</b>
            <span>${esc(x.drill?.objetivo||'')}</span></div>
          <div class="row-e"><span class="tiny">${x.drill?.min||0} min</span></div>
        </div>`).join('')}</div>`);
  },

  /* ==================== MÁS ==================== */
  mas(){
    const t = this.team();
    const posts = Data.posts(Data.myTeams().map(x=>x.id));
    const cert = Data.myCert();
    return `
    <h1 class="t-page">Más</h1>
    <p class="t-sub">Comunicación y cuenta</p>

    ${cert && cert.estado!=='vigente' ? hint(
      '<strong>Te falta el certificado de delitos sexuales.</strong> '+
      'Es obligatorio por la LOPIVI para tener contacto con menores. '+
      'Entrégalo a la junta directiva.','bad') : ''}

    <button class="btn btn-accent" onclick="Coach.nuevoAviso()">
      ${I.megaphone(17)} Publicar aviso al equipo</button>
    <div style="height:14px"></div>

    <div class="t-sec">Avisos publicados</div>
    ${posts.length ? `<div class="rows">${posts.slice(0,6).map(p=>`
      <div class="row"><div class="ava sq">${p.urgente?I.warn(18):I.megaphone(18)}</div>
        <div class="row-b"><b>${esc(p.titulo)}</b>
          <span>${fechaCorta(p.at,false)} · ${p.team_id?'su equipo':'todo el club'}</span></div>
      </div>`).join('')}</div>`
    : blank(I.megaphone(22),'Sin avisos',
      'Usa los avisos para cambios de horario o recordatorios puntuales.')}

    <div class="t-sec">Tareas del equipo</div>
    ${t ? `<div class="rows">${Data.tasks(t.id).map(x=>`
      <button class="row" onclick="Coach.tarea('${x.id}')">
        <span class="box ${x.hecho?'on':''}">${x.hecho?I.check(15):''}</span>
        <div class="row-b"><b style="font-weight:500" class="${x.hecho?'strike':''}">
          ${esc(x.titulo)}</b></div>
      </button>`).join('') || `<div class="row"><div class="row-b">
        <span>Sin tareas pendientes</span></div></div>`}</div>
      <button class="btn btn-2" onclick="Coach.nuevaTarea()">
        ${I.plus(17)} Añadir tarea</button>`:''}

    ${Shell.cuenta()}`;
  },
  nuevoAviso(){
    const ts = Data.myTeams();
    sheet('Publicar aviso', `
      <div class="f"><label for="pT">Para</label>
        <select class="in" id="pT">${ts.map(t=>
          `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></div>
      <div class="f"><label for="pTi">Título</label>
        <input class="in" id="pTi" placeholder="Cambio de horario del jueves"></div>
      <div class="f"><label for="pB">Mensaje</label>
        <textarea class="in" id="pB" rows="3"></textarea></div>
      <label class="check"><input type="checkbox" id="pU">
        <span>Marcar como urgente</span></label>
      <div class="help" style="margin-bottom:14px">Los urgentes se destacan en el aviso.</div>
      <button class="btn" onclick="Coach.guardarAviso()">Publicar</button>`);
  },
  guardarAviso(){
    const t = val('pTi');
    if(!t){ toast('Ponle un título'); return; }
    Data.addPost({ team_id:val('pT'), titulo:t, cuerpo:val('pB'), urgente:chk('pU') });
    closeSheet(); toast('Aviso publicado'); Shell.render();
  },
  nuevaTarea(){
    sheet('Nueva tarea', `
      <div class="f"><label for="tkT">Tarea</label>
        <input class="in" id="tkT" placeholder="Llevar el botiquín al partido"></div>
      <button class="btn" onclick="Coach.guardarTarea()">Añadir</button>`);
  },
  guardarTarea(){
    const t = val('tkT');
    if(!t){ toast('Escribe la tarea'); return; }
    Data.addTask({ team_id:S.teamId, titulo:t });
    closeSheet(); Shell.render();
  }
};
