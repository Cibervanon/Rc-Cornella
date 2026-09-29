/* ============================================================================
   Familia y jugador
   ----------------------------------------------------------------------------
   Lo primero que ve la familia es lo que falta por responder. Confirmar no
   requiere abrir el evento: tres botones grandes en la pantalla de inicio.
   ============================================================================ */

const Family = {
  nav:[
    { k:'inicio',  i:'home',     t:'Inicio' },
    { k:'agenda',  i:'calendar', t:'Agenda' },
    { k:'progreso',i:'star',     t:'Progreso' },
    { k:'plantel', i:'squad',    t:'Equipo' },
    { k:'mas',     i:'dots',     t:'Más' }
  ],

  esJugador(){ return Data.rol()==='jugador'; },
  mios(){ return Data.myPlayers(); },
  activo(){
    const l = this.mios();
    if(!l.length) return null;
    if(!S.childId || !l.some(p=>p.id===S.childId)) S.childId = l[0].id;
    return l.find(p=>p.id===S.childId);
  },
  selector(){
    const l = this.mios();
    if(l.length<2) return '';
    return `<div class="tabs">${l.map(p=>`
      <button class="${p.id===S.childId?'on':''}"
        onclick="S.childId='${p.id}';Shell.render()">
        ${esc(p.nombre.split(' ')[0])}</button>`).join('')}</div>`;
  },

  /* ---------- sin deportistas: el onboarding real de la familia ---------- */
  vacio(){
    return `
    <h1 class="t-page">Hola, ${esc(Data.me().nombre.split(' ')[0])}</h1>
    <p class="t-sub">${esc(Data.club().nombre)}</p>
    ${blank(I.users(24),'Inscribe a tu hijo o hija',
      'Solo se hace una vez. Después recibirás las convocatorias y podrás '+
      'confirmar su asistencia en un toque.',
      `<button class="btn btn-accent" onclick="Family.nuevoJugador()">
        ${I.plus(17)} Inscribir deportista</button>`)}
    <div class="t-sec">Qué pasa después</div>
    <div class="panel">
      <div class="sk"><span class="skb">${I.check(13)}</span>
        <span>Tu hijo aparece en la plantilla de su categoría</span></div>
      <div class="sk"><span class="skb">${I.check(13)}</span>
        <span>El entrenador le convoca a entrenamientos y partidos</span></div>
      <div class="sk"><span class="skb">${I.check(13)}</span>
        <span>Tú confirmas si va, desde la pantalla de inicio</span></div>
      <div class="sk"><span class="skb">${I.check(13)}</span>
        <span>Firmas la documentación y domicilias la cuota</span></div>
    </div>`;
  },

  /* ==================== INICIO ==================== */
  inicio(){
    const l = this.mios();
    if(!l.length) return this.esJugador()
      ? blank(I.user(24),'Tu ficha aún no está vinculada',
          'Pide al club que vincule tu cuenta con tu ficha de jugador.')
      : this.vacio();

    // pendientes de responder, de todos los hijos
    const pend = [];
    l.forEach(p=>{
      const t = Data.playerTeam(p.id); if(!t) return;
      Data.events(t.id).forEach(e=>{
        const r = Data.rsvpOf(e.id,p.id);
        if(e.rsvp_abierto && r && r.estado==='sin_responder') pend.push({ e,p });
      });
    });
    pend.sort((a,b)=>new Date(a.e.inicio)-new Date(b.e.inicio));

    const prox = [];
    l.forEach(p=>{
      const t = Data.playerTeam(p.id); if(!t) return;
      Data.events(t.id).forEach(e=>{
        const r = Data.rsvpOf(e.id,p.id);
        if(r && r.estado!=='sin_responder') prox.push({ e,p,r });
      });
    });
    prox.sort((a,b)=>new Date(a.e.inicio)-new Date(b.e.inicio));

    const posts = Data.posts(l.map(p=>Data.playerTeam(p.id)?.id).filter(Boolean));
    const docsPend = l.flatMap(p=>Data.pendingDocs(p.id).map(d=>({p,d})));
    const g = Data.myGuardian();
    const mand = g ? Data.mandate(g.id) : null;

    return `
    <h1 class="t-page">Hola, ${esc(Data.me().nombre.split(' ')[0])}</h1>
    <p class="t-sub">${this.esJugador() ? 'Tu semana'
      : l.length+(l.length===1?' deportista':' deportistas')+' en el club'}</p>

    ${pend.length ? `<div class="t-sec">Falta tu respuesta</div>
      ${pend.slice(0,3).map(({e,p})=>this.tarjeta(e,p)).join('')}`
    : hint('Todo confirmado. No tienes nada pendiente de responder.','ok')}

    ${!mand && !this.esJugador() ? `
      <div class="panel lead">
        <b style="display:block;margin-bottom:4px">Falta domiciliar la cuota</b>
        <span class="tiny">Sin domiciliación el club no puede pasar el recibo
          y tendrás que pagar en mano cada mes.</span>
        <button class="btn btn-2 btn-sm" style="width:100%;margin-top:11px"
          onclick="Family.firmarMandato()">Domiciliar ahora</button>
      </div>`:''}

    ${docsPend.length ? `
      <div class="panel lead">
        <b style="display:block;margin-bottom:4px">${docsPend.length}
          ${docsPend.length===1?'documento pendiente':'documentos pendientes'}</b>
        <span class="tiny">El club necesita la autorización firmada para que
          ${docsPend.length===1?'pueda':'puedan'} competir.</span>
        <button class="btn btn-2 btn-sm" style="width:100%;margin-top:11px"
          onclick="Shell.goTab('mas')">Ver documentación</button>
      </div>`:''}

    ${prox.length ? `<div class="t-sec">Próximos</div>
    <div class="rows">${prox.slice(0,5).map(({e,p,r})=>`
      <button class="row" onclick="Shell.go('evento',{eventId:'${e.id}',evPid:'${p.id}'})">
        ${daymark(e.inicio)}
        <div class="row-b"><b>${evTitulo(e)}</b>
          <span>${fechaCorta(e.inicio)}${l.length>1?' · '+esc(p.nombre.split(' ')[0]):''}</span></div>
        <div class="row-e">${tagRsvp(r.estado)}</div>
      </button>`).join('')}</div>`:''}

    ${posts.length ? `<div class="t-sec">Avisos del club</div>
    <div class="rows">${posts.slice(0,4).map(p=>`
      <button class="row" onclick="Family.verAviso('${p.id}')">
        <div class="ava sq">${p.urgente?I.warn(18):I.megaphone(18)}</div>
        <div class="row-b"><b>${esc(p.titulo)}</b>
          <span>${fechaCorta(p.at,false)}</span></div>
        <span style="color:var(--t3)">${I.chevron(17)}</span>
      </button>`).join('')}</div>`:''}

    ${!this.esJugador() ? `<button class="btn btn-2" onclick="Family.nuevoJugador()">
      ${I.plus(17)} Inscribir otro deportista</button>`:''}`;
  },

  /** Tarjeta de confirmación: el componente más usado de toda la app. */
  tarjeta(e,p){
    const d = diasA(e.inicio);
    const varios = this.mios().length>1;
    return `<div class="panel lead">
      <div style="display:flex;gap:11px;align-items:flex-start;margin-bottom:10px">
        <div class="ava sq">${I[EV_ICON[e.tipo]](19)}</div>
        <div style="min-width:0;flex:1">
          <b style="display:block;font-size:15.5px">${evTitulo(e)}</b>
          <span class="tiny">${fechaCorta(e.inicio)}${e.lugar?' · '+esc(e.lugar):''}</span>
          ${varios?`<div class="tiny" style="color:var(--accent-dk);font-weight:650;
            margin-top:2px">${esc(p.nombre.split(' ')[0])}</div>`:''}
        </div>
      </div>
      ${e.convocatoria?`<div class="tiny" style="margin-bottom:9px">
        Citación a las ${hhmm(e.convocatoria)}</div>`:''}
      ${d<=2?`<span class="tag t-warn" style="margin-bottom:10px">
        ${I.clock(13)} ${d<=0?'Es hoy':d===1?'Es mañana':'Quedan '+d+' días'}</span>`:''}
      <div class="rsvp">
        <button class="y" onclick="Family.responder('${e.id}','${p.id}','si')">
          ${I.check(17)} Va</button>
        <button class="m" onclick="Family.responder('${e.id}','${p.id}','duda')">
          ${I.question(17)} Duda</button>
        <button class="n" onclick="Family.motivo('${e.id}','${p.id}')">
          ${I.cross(17)} No va</button>
      </div>
    </div>`;
  },

  responder(eid,pid,estado,motivo=null){
    Data.setRsvp(eid,pid,estado,motivo);
    toast(estado==='si' ? 'Confirmado' : estado==='duda' ? 'Marcado como duda'
      : 'Avisado al entrenador');
    closeSheet(); Shell.render();
  },
  motivo(eid,pid){
    sheet('No puede ir', `
      <p class="tiny" style="margin:0 0 14px">Indicar el motivo ayuda al
        entrenador a preparar la convocatoria. Es opcional.</p>
      <div class="chips">${['Lesión','Enfermedad','Estudios','Viaje familiar','Otro motivo']
        .map(m=>`<button class="chip"
          onclick="Family.responder('${eid}','${pid}','no','${m}')">${m}</button>`).join('')}</div>
      <button class="btn btn-2" style="margin-top:16px"
        onclick="Family.responder('${eid}','${pid}','no')">No indicar motivo</button>`);
  },
  verAviso(id){
    const p = DB.load().posts.find(x=>x.id===id);
    sheet(p.titulo, `${p.urgente?hint('Aviso urgente','warn'):''}
      <p style="margin:0 0 14px;line-height:1.6">${esc(p.cuerpo||'')}</p>
      <div class="tiny">${fechaCorta(p.at)}</div>`);
  },

  /* ---------- alta de deportista ---------- */
  nuevoJugador(){
    const ts = Data.teams();
    if(!ts.length){ toast('El club aún no tiene categorías'); return; }
    sheet('Inscribir deportista', `
      <div class="f"><label for="pN">Nombre y apellidos</label>
        <input class="in" id="pN" placeholder="Nil Soler Vidal"></div>
      <div class="f2">
        <div class="f"><label for="pF">Fecha de nacimiento</label>
          <input class="in" id="pF" type="date"></div>
        <div class="f"><label for="pC">Categoría</label>
          <select class="in" id="pC">${ts.map(t=>
            `<option value="${t.id}">${esc(t.nombre)} · ${eur(t.cat?.cuota||0)}/mes</option>`
          ).join('')}</select></div>
      </div>
      <div class="f2">
        <div class="f"><label for="pT">Talla de equipación</label>
          <select class="in" id="pT">${['6','8','10','12','14','XS','S','M','L','XL']
            .map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div class="f"><label for="pP">Puesto habitual <span class="muted">(opcional)</span></label>
          <select class="in" id="pP">
            <option value="">Aún por decidir</option>
            <optgroup label="Delantera">${POS_POR_GRUPO('delantera').map(c=>
              `<option value="${c.id}">${c.n} · ${esc(c.t)}</option>`).join('')}</optgroup>
            <optgroup label="Tres cuartos">${POS_POR_GRUPO('trescuartos').map(c=>
              `<option value="${c.id}">${c.n} · ${esc(c.t)}</option>`).join('')}</optgroup>
          </select>
          <div class="help">El entrenador lo puede ajustar después.</div></div>
      </div>
      <div class="f"><label for="pA">Alergias o información médica</label>
        <textarea class="in" id="pA" rows="2"
          placeholder="Déjalo vacío si no hay nada relevante"></textarea>
        <div class="help">Solo la verán el entrenador y la junta, para poder
          actuar en caso de urgencia.</div></div>
      ${this.mios().length ? hint('Al segundo hermano se le aplica un 15% de '+
        'descuento en la cuota automáticamente.','ok') : ''}
      <button class="btn btn-accent" onclick="Family.guardarJugador()">
        Inscribir</button>`);
  },
  guardarJugador(){
    try{
      const puesto = val('pP');
      const p = Data.addPlayer({ nombre:val('pN'), fecha_nac:val('pF'),
        team_id:val('pC'), talla:val('pT'),
        posiciones: puesto?[puesto]:[],
        posicion: puesto?POS(puesto).corto:'',
        alergias:val('pA') });
      closeSheet(); S.childId = p.id;
      const pend = Data.pendingDocs(p.id);
      sheet('Inscripción completada', `
        ${hint('<strong>'+esc(p.nombre)+'</strong> ya forma parte de '+
          esc(Data.playerTeam(p.id)?.nombre||'')+'.','ok')}
        <div class="t-sec">Quedan dos cosas</div>
        <div class="panel">
          <div class="sk"><span class="skb">${I.check(13)}</span>
            <span>Firmar ${pend.length} documentos obligatorios</span></div>
          <div class="sk"><span class="skb">${I.check(13)}</span>
            <span>Domiciliar la cuota mensual</span></div>
        </div>
        <button class="btn btn-accent" onclick="closeSheet();Shell.goTab('mas')">
          Completar ahora</button>
        <div style="height:8px"></div>
        <button class="btn btn-text" onclick="closeSheet();Shell.render()">
          Lo hago más tarde</button>`);
    }catch(e){ toast(e.message); }
  },

  /* ==================== AGENDA ==================== */
  agenda(){
    const p = this.activo();
    if(!p) return this.vacio();
    const t = Data.playerTeam(p.id);
    const pas = S.cal==='hist';
    const evs = t ? Data.events(t.id,{ pasados:pas }) : [];
    return `
    <h1 class="t-page">Agenda</h1>
    <p class="t-sub">${esc(p.nombre)} · ${esc(t?.nombre||'')}</p>
    ${this.selector()}
    <div class="tabs">
      <button class="${!pas?'on':''}" onclick="S.cal='prox';Shell.render()">Próximos</button>
      <button class="${pas?'on':''}" onclick="S.cal='hist';Shell.render()">Anteriores</button>
    </div>
    ${evs.length ? `<div class="rows">${evs.map(e=>{
      const r = Data.rsvpOf(e.id,p.id);
      const a = Data.attendance(e.id).find(x=>x.player_id===p.id);
      return `<button class="row" onclick="Shell.go('evento',{eventId:'${e.id}',evPid:'${p.id}'})">
        ${daymark(e.inicio)}
        <div class="row-b"><b>${evTitulo(e)}</b>
          <span>${fechaCorta(e.inicio)}${e.lugar?' · '+esc(e.lugar):''}</span></div>
        <div class="row-e">${pas ? (a?tagAtt(a.estado):'')
          : (r?tagRsvp(r.estado):'')}</div>
      </button>`;
    }).join('')}</div>`
    : blank(I.calendar(24), pas?'Sin historial':'Nada programado',
      pas ? 'Aquí aparecerán los entrenamientos y partidos ya celebrados.'
          : 'El entrenador aún no ha convocado nada. Recibirás un aviso cuando lo haga.')}`;
  },

  evento(eid,pid){
    const e = Data.event(eid);
    const p = Data.player(pid) || this.activo();
    if(!e||!p) return blank(I.question(24),'Evento no encontrado','');
    const r = Data.rsvpOf(eid,p.id);
    const conv = Data.callups(eid).some(c=>c.player_id===p.id);
    const ta = Data.tally(eid);
    const van = Data.rsvpList(eid).filter(x=>x.estado==='si')
      .map(x=>Data.player(x.player_id)).filter(Boolean);

    return `
    <button class="back" onclick="Shell.back()">${I.chevL(16)} Volver</button>
    <h1 class="t-page">${evTitulo(e)}</h1>
    <p class="t-sub">${fechaCorta(e.inicio)}</p>

    ${conv ? hint('<strong>'+esc(p.nombre.split(' ')[0])+' está convocado</strong> '+
      'para este partido.','ok') : ''}

    <div class="panel">
      ${e.convocatoria?`<div class="kv"><span>Citación</span>
        <span>${hhmm(e.convocatoria)}</span></div>`:''}
      <div class="kv"><span>Empieza</span><span>${hhmm(e.inicio)}</span></div>
      <div class="kv"><span>Lugar</span><span>${esc(e.lugar||'—')}</span></div>
      ${e.tipo==='partido'?`<div class="kv"><span>Dónde se juega</span>
        <span>${e.local?'En casa':'Fuera'}</span></div>`:''}
    </div>

    ${e.notas ? hint('<strong>Del entrenador:</strong><br>'+esc(e.notas),'warn') : ''}

    ${e.rsvp_abierto ? `
      <div class="t-sec">Tu respuesta</div>
      <div class="rsvp lg">
        <button class="y ${r?.estado==='si'?'on':''}"
          onclick="Family.responder('${eid}','${p.id}','si')">${I.check(18)} Va</button>
        <button class="m ${r?.estado==='duda'?'on':''}"
          onclick="Family.responder('${eid}','${p.id}','duda')">${I.question(18)} Duda</button>
        <button class="n ${r?.estado==='no'?'on':''}"
          onclick="Family.motivo('${eid}','${p.id}')">${I.cross(18)} No va</button>
      </div>
      ${r?.motivo?`<div class="tiny" style="text-align:center;margin-top:9px">
        Motivo indicado: ${esc(r.motivo)}</div>`:''}
    ` : hint('Las confirmaciones están cerradas para este evento.')}

    ${(()=>{ const mt = Data.match(eid);
      return mt && (mt.estado!=='previo' || mt.acciones.length) ? `
      <button class="btn btn-2" style="margin:4px 0 8px"
        onclick="Shell.go('partido',{eventId:'${eid}',evPid:'${p.id}'})">
        ${I.chart(17)} ${mt.estado==='final'?'Ver el resultado':'Seguir el partido'}
      </button>`:''; })()}

    <div class="t-sec">Quién va · ${ta.si} de ${ta.total}</div>
    ${van.length ? `<div class="chips">${van.map(x=>
      `<span class="chip flat">${esc(x.nombre.split(' ')[0])}</span>`).join('')}</div>`
    : `<p class="tiny">Nadie ha confirmado todavía.</p>`}`;
  },

  /** Resumen del partido en versión familia: sin acta editable. */
  resumenPartido(eventId){
    const ev = Data.event(eventId);
    const m = Data.match(eventId);
    if(!ev || !m) return blank(I.question(24),'Partido no encontrado','');
    const mio = this.activo();
    const mins = Data.minutosJugados(eventId);
    const suyo = mio ? mins.find(x=>x.player_id===mio.id) : null;
    const pos = mio ? Data.posicionDe(eventId, mio.id) : null;
    const conv = mio && (Data.enCampo(eventId).includes(mio.id) ||
      m.banquillo.includes(mio.id) ||
      m.acciones.some(a=>a.tipo==='cambio' && (a.entra===mio.id||a.sale===mio.id)));
    const res = m.puntos_favor>m.puntos_contra ? 'Victoria'
      : m.puntos_favor<m.puntos_contra ? 'Derrota' : 'Empate';
    const cls = m.puntos_favor>m.puntos_contra ? 'ok'
      : m.puntos_favor<m.puntos_contra ? 'bad' : '';
    const suyosPuntos = mio ? m.acciones.filter(a=>a.tipo==='punto' &&
      a.player===mio.id && !a.contra) : [];

    return `
    <button class="back" onclick="Shell.back()">${I.chevL(16)} Volver</button>
    <h1 class="t-page">${evTitulo(ev)}</h1>
    <p class="t-sub">${fechaCorta(ev.inicio)}</p>
    ${Match.marcador(m, ev)}

    ${m.estado==='final'
      ? `<div class="box-res ${cls}"><b>${res}</b>
          <span>${m.puntos_favor} – ${m.puntos_contra} frente a ${esc(ev.rival||'rival')}</span></div>`
      : hint('Partido en curso. Los datos se actualizan a medida que el '+
          'entrenador los registra.')}

    ${conv && suyo ? `<div class="panel lead">
      <b style="display:block;margin-bottom:4px">${esc(mio.nombre.split(' ')[0])}
        jugó ${suyo.minutos} minutos</b>
      <span class="tiny">${suyo.titular?'Salió de titular':'Entró desde el banquillo'}${
        pos?' · '+esc(pos.t)+' (dorsal '+pos.n+')':''}${
        suyosPuntos.length?' · anotó '+suyosPuntos.reduce((a,b)=>a+b.valor,0)+' puntos':''}</span>
    </div>`: mio && m.estado==='final'
      ? hint(esc(mio.nombre.split(' ')[0])+' no participó en este partido.') : ''}

    <div class="t-sec">Cómo fue</div>
    ${Match.timeline(eventId, m, false).replace(/<button class="ibtn"[^]*?<\/button>/g,'')}

    ${Data.enCampo(eventId).length ? `<div class="t-sec">Alineación</div>
    <div class="rows">${POSICIONES(m.formacion).map(pz=>{
      const pid = m.titulares[pz.id]; if(!pid) return '';
      const pl = Data.player(pid);
      return `<div class="row"><span class="dorsal">${pz.n}</span>
        <div class="row-b"><b>${esc(pl?pl.nombre:'—')}</b>
          <span>${esc(pz.t)}</span></div>
        ${mio&&pid===mio.id?`<div class="row-e">${tag('Tú','t-accent')}</div>`:''}
      </div>`;
    }).join('')}</div>`:''}`;
  },

  /* ==================== PROGRESO ==================== */
  progreso(){
    const p = this.activo();
    if(!p) return this.vacio();
    const st = Data.attStats(p.id);
    const evs = Data.evaluations(p.id, true);   // SOLO compartidas
    const ult = evs[0];
    const obj = Data.goals(p.id);
    const les = Data.injuries(p.id).filter(i=>i.estado!=='alta');
    const t = Data.playerTeam(p.id);
    const ed = edad(p.fecha_nac);

    return `
    <h1 class="t-page">Progreso</h1>
    <p class="t-sub">${this.esJugador()?'Tu evolución en el club':esc(p.nombre)}</p>
    ${this.selector()}

    <div class="who">${ava(p.nombre,'xl')}
      <div><b style="font-size:16.5px">${esc(p.nombre)}</b>
        <div class="tiny">${esc(t?.nombre||'')}${ed?' · '+ed+' años':''}${
          p.posicion?' · '+esc(p.posicion):''}</div></div></div>

    <div class="metrics">
      <div class="metric ${st.pct!==null&&st.pct>=85?'good':''}">
        <div class="mv">${st.pct===null?'—':st.pct+'%'}</div>
        <div class="ml">Asistencia${st.total?' · '+st.ok+'/'+st.total:''}</div></div>
      <div class="metric"><div class="mv">${obj.filter(g=>g.hecho).length}/${obj.length||'—'}</div>
        <div class="ml">Objetivos logrados</div></div>
    </div>

    ${les.length ? hint(`<strong>${esc(les[0].tipo||'Lesión')}${
      les[0].zona?' · '+esc(les[0].zona):''}</strong><br>${
      les[0].estado==='activa'?'En reposo':'En recuperación'}${
      les[0].alta_prev?' · alta prevista '+les[0].alta_prev:''}`,'warn') : ''}

    <div class="t-sec">Objetivos</div>
    ${obj.length ? `<div class="rows">${obj.map(g=>`
      <div class="row"><span class="box ${g.hecho?'on':''}">${g.hecho?I.check(15):''}</span>
        <div class="row-b"><b style="font-weight:500;white-space:normal"
          class="${g.hecho?'strike':''}">${esc(g.texto)}</b></div></div>`).join('')}</div>`
    : blank(I.target(22),'Sin objetivos todavía',
      'El entrenador los fija cuando conoce mejor a'+(this.esJugador()?' ti':'l jugador')+'.')}

    ${(()=>{ const t2=Data.playerTeam(p.id); if(!t2) return '';
      const rt = Data.resumenTemporada(t2.id);
      const x = rt.jugadores[p.id];
      if(!x || !x.partidos) return '';
      return `<div class="t-sec">Partidos de la temporada</div>
      <div class="metrics">
        <div class="metric"><div class="mv">${x.partidos}</div>
          <div class="ml">Partidos jugados</div></div>
        <div class="metric"><div class="mv">${x.minutos}'</div>
          <div class="ml">Minutos totales</div></div>
        <div class="metric ${x.ensayos?'good':''}"><div class="mv">${x.ensayos}</div>
          <div class="ml">${x.ensayos===1?'Ensayo':'Ensayos'}</div></div>
      </div>
      ${x.partidos?`<div class="panel">
        <div class="kv"><span>Media de minutos por partido</span>
          <span>${Math.round(x.minutos/x.partidos)}'</span></div>
        <div class="kv"><span>Puntos aportados</span><span>${x.puntos}</span></div>
      </div>`:''}`; })()}

    ${(()=>{ const ms=Data.marcasDe(p.id); if(!ms.length) return '';
      return `<div class="t-sec">Marcas físicas</div>
      <div class="rows">${ms.map(({prueba:pr,marca:m})=>`
        <div class="row"><div class="ava sq">${pr.u==='s'?I.clock(18):I.dumbbell(18)}</div>
          <div class="row-b"><b>${esc(pr.t)}</b><span>${esc(m.fecha)}</span></div>
          <div class="row-e"><span class="amt">${m.valor} ${esc(pr.u)}</span></div>
        </div>`).join('')}</div>`; })()}

    <div class="t-sec">Valoración del entrenador</div>
    ${ult ? `<div class="panel">
      <b style="display:block;margin-bottom:11px">${esc(ult.periodo||ult.fecha)}</b>
      <div class="kv"><span>Técnica</span>${score(ult.tecnica)}</div>
      <div class="kv"><span>Físico</span>${score(ult.fisico)}</div>
      <div class="kv"><span>Táctica</span>${score(ult.tactica)}</div>
      <div class="kv"><span>Actitud</span>${score(ult.actitud)}</div>
      ${ult.fuerte?`<div class="quote good"><b>Lo que hace bien</b>${esc(ult.fuerte)}</div>`:''}
      ${ult.mejora?`<div class="quote work"><b>En qué seguir trabajando</b>${esc(ult.mejora)}</div>`:''}
    </div>
    ${evs.length>1?`<div class="t-sec">Valoraciones anteriores</div>
    <div class="rows">${evs.slice(1).map(e=>`
      <div class="row"><div class="ava sq">${I.chart(18)}</div>
        <div class="row-b"><b>${esc(e.periodo||e.fecha)}</b>
          <span>Media ${((e.tecnica+e.fisico+e.tactica+e.actitud)/4).toFixed(1)} sobre 5</span></div>
      </div>`).join('')}</div>`:''}`
    : blank(I.star(22,false),'Sin valoraciones compartidas',
      'El entrenador decide cuándo compartirlas. Suele hacerlo una vez por trimestre.')}`;
  },

  /* ==================== EQUIPO ==================== */
  plantel(){
    const p = this.activo();
    if(!p) return this.vacio();
    const t = Data.playerTeam(p.id);
    if(!t) return blank(I.squad(24),'Sin equipo','Todavía no tiene categoría asignada.');
    const ps = Data.teamPlayers(t.id);
    const ev = Data.events(t.id)[0];
    const ta = ev ? Data.tally(ev.id) : null;
    const tec = Data.teamStaff(t.id);

    return `
    <h1 class="t-page">${esc(t.nombre)}</h1>
    <p class="t-sub">${ps.length} ${ps.length===1?'jugador':'jugadores'}</p>
    ${this.selector()}

    ${ev ? `<div class="panel">
      <div class="tiny" style="letter-spacing:.06em;text-transform:uppercase;
        font-weight:650;margin-bottom:4px">Próximo</div>
      <b style="font-size:15.5px;display:block">${evTitulo(ev)}</b>
      <div class="tiny" style="margin:3px 0 12px">${fechaCorta(ev.inicio)}</div>
      <div class="tally">
        <div class="y"><b>${ta.si}</b><span>Van</span></div>
        <div class="n"><b>${ta.no}</b><span>No van</span></div>
        <div class="m"><b>${ta.duda}</b><span>Duda</span></div>
        <div class="p"><b>${ta.sin}</b><span>Sin resp.</span></div>
      </div>
    </div>`:''}

    ${tec.length ? `<div class="t-sec">Cuerpo técnico</div>
    <div class="rows">${tec.map(s=>`
      <div class="row">${ava(s.user?.nombre||'—')}
        <div class="row-b"><b>${esc(s.user?.nombre||'—')}</b>
          <span>${esc(s.cargo)}</span></div></div>`).join('')}</div>`:''}

    <div class="t-sec">Compañeros</div>
    <div class="rows">${ps.map(x=>`
      <div class="row">${ava(x.nombre, x.id===p.id?'me':'')}
        <div class="row-b"><b>${esc(x.nombre)}${x.id===p.id?
          (this.esJugador()?' · tú':''):''}</b>
          <span>${esc(x.posicion||'Sin posición')}</span></div></div>`).join('')}</div>
    ${hint('Por protección de datos de menores no se muestran los contactos '+
      'de otras familias.')}`;
  },

  /* ==================== MÁS ==================== */
  mas(){
    const l = this.mios();
    const g = Data.myGuardian();
    const mand = g ? Data.mandate(g.id) : null;
    const invs = Data.invoices({ playerIds:l.map(p=>p.id) });
    const total = invs.filter(i=>i.estado!=='pagado')
      .reduce((a,b)=>a+Number(b.importe),0);

    return `
    <h1 class="t-page">Más</h1>
    <p class="t-sub">Documentación, cuotas y cuenta</p>

    ${!this.esJugador() && l.length ? `
      <div class="t-sec">Documentación</div>
      <div class="rows">${l.map(p=>{
        const pend = Data.pendingDocs(p.id);
        return `<button class="row" onclick="Family.docs('${p.id}')">
          ${ava(p.nombre)}
          <div class="row-b"><b>${esc(p.nombre)}</b>
            <span>${pend.length ? pend.length+' por firmar' : 'Todo firmado'}</span></div>
          <div class="row-e">${pend.length?tag('Pendiente','t-warn'):tag('Completo','t-ok')}</div>
        </button>`;
      }).join('')}</div>

      <div class="t-sec">Cuota</div>
      ${mand ? `<div class="panel">
        <div class="kv"><span>Cuenta</span><span>${esc(mand.iban)}</span></div>
        <div class="kv"><span>Titular</span><span>${esc(mand.titular)}</span></div>
        <div class="kv"><span>Estado</span><span>${tag('Domiciliada','t-ok')}</span></div>
      </div>`
      : `<div class="panel lead">
        <b style="display:block;margin-bottom:4px">Sin domiciliar</b>
        <span class="tiny">Mientras no domicilies, el club no puede pasar el recibo.</span>
        <button class="btn btn-accent btn-sm" style="width:100%;margin-top:11px"
          onclick="Family.firmarMandato()">Domiciliar la cuota</button>
      </div>`}

      ${invs.length ? `<div class="rows">${invs.slice(0,6).map(i=>{
        const p = Data.player(i.player_id);
        return `<div class="row">
          <div class="ava sq">${I.euro(18)}</div>
          <div class="row-b"><b>${esc(i.concepto)}</b>
            <span>${esc(p?p.nombre.split(' ')[0]:'')}</span></div>
          <div class="row-e"><span class="amt">${eur(i.importe)}</span>
            ${tagPay(i.estado)}</div>
        </div>`;
      }).join('')}</div>
      ${invs.some(i=>i.estado==='en_proceso')
        ? hint('Los cargos por domiciliación tardan unos <strong>6 días hábiles</strong> '+
            'en confirmarse en el banco.')
        : ''}
      ${invs.some(i=>i.estado==='devuelto')
        ? hint('Un recibo ha sido devuelto. Contacta con el club para regularizarlo.','bad')
        : ''}`
      : `<p class="tiny">El club todavía no ha emitido ninguna cuota.</p>`}
    `:''}

    <div class="t-sec">Notificaciones</div>
    ${Data.notifs().length ? `<div class="rows">${Data.notifs().slice(0,5).map(n=>`
      <div class="row"><div class="ava sq">${I.bell(18)}</div>
        <div class="row-b"><b>${esc(n.titulo)}</b><span>${esc(n.cuerpo||'')}</span></div>
        <div class="row-e"><span class="tiny">${fechaCorta(n.at,false)}</span></div>
      </div>`).join('')}</div>`
    : `<p class="tiny">Sin notificaciones por ahora.</p>`}

    ${Shell.cuenta()}`;
  },

  docs(pid){
    const p = Data.player(pid);
    const todos = Data.docs();
    const firm = Data.signatures(pid).map(s=>s.doc_id);
    sheet('Documentación de '+p.nombre.split(' ')[0], `
      ${hint('Al firmar dejas constancia con fecha y hora. Puedes revocar el '+
        'consentimiento escribiendo al club.')}
      <div class="rows">${todos.map(d=>{
        const ok = firm.includes(d.id);
        return `<div class="row">
          <span class="box ${ok?'on':''}">${ok?I.check(15):''}</span>
          <div class="row-b"><b>${esc(d.nombre)}</b>
            <span>Versión ${esc(d.v)}</span></div>
          <div class="row-e">${ok ? tag('Firmado','t-ok')
            : `<button class="btn btn-2 btn-sm"
                onclick="Family.firmar('${pid}','${d.id}')">Firmar</button>`}</div>
        </div>`;
      }).join('')}</div>`);
  },
  firmar(pid,did){
    Data.sign(pid,did);
    toast('Documento firmado');
    this.docs(pid);
  },
  firmarMandato(){
    const g = Data.myGuardian();
    if(!g){ toast('Tu cuenta no está registrada como familia'); return; }
    sheet('Domiciliar la cuota', `
      ${hint('El club no guarda tu número de cuenta completo y no te cobra '+
        'ninguna comisión por domiciliar.')}
      <div class="f"><label for="mT">Titular de la cuenta</label>
        <input class="in" id="mT" value="${esc(Data.me().nombre)}"></div>
      <div class="f"><label for="mI">IBAN</label>
        <input class="in" id="mI" placeholder="ES00 0000 0000 0000 0000 0000"
          autocomplete="off">
        <div class="help">Autorizas a ${esc(Data.club().nombre)} a enviar órdenes
          de cargo a tu cuenta y a tu banco a cargarlas conforme a esas
          instrucciones. Puedes revocarlo cuando quieras.</div></div>
      ${hint('Cada cargo tarda unos 6 días hábiles en confirmarse.','warn')}
      <button class="btn btn-accent" onclick="Family.guardarMandato()">
        Firmar la domiciliación</button>`);
  },
  guardarMandato(){
    try{
      Data.signMandate(Data.myGuardian().id, val('mI'), val('mT'));
      closeSheet(); toast('Domiciliación firmada'); Shell.render();
    }catch(e){ toast(e.message); }
  }
};
