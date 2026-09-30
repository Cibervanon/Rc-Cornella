/* ============================================================================
   Junta directiva
   ----------------------------------------------------------------------------
   Es la única que puede crear códigos de entrenador y de junta. Ese es el
   mecanismo que impide que alguien se registre como entrenador por su cuenta.
   ============================================================================ */

const Board = {
  nav:[
    { k:'panel',  i:'chart',    t:'Panel' },
    { k:'gente',  i:'squad',    t:'Personas' },
    { k:'cuotas', i:'euro',     t:'Cuotas' },
    { k:'lopivi', i:'shield',   t:'LOPIVI' },
    { k:'club',   i:'settings', t:'Club' }
  ],

  /* ==================== PANEL ==================== */
  panel(){
    const pasos = Data.setupSteps();
    const hechos = pasos.filter(p=>p.done).length;
    const d = DB.load();
    const ps = Data.players();
    const inv = Data.invoices();
    const cert = Data.certs();
    const sinCert = cert.filter(c=>c.estado!=='vigente').length;
    const sinEquipo = Data.coachesWithoutTeam();

    // Puesta en marcha: se muestra mientras no esté todo listo.
    if(hechos < pasos.length){
      return `
      <h1 class="t-page">Puesta en marcha</h1>
      <p class="t-sub">${hechos} de ${pasos.length} pasos completados</p>
      ${meter(Math.round(hechos/pasos.length*100))}
      <div style="height:18px"></div>
      <div class="panel">
        ${pasos.map(p=>`<div class="sk ${p.done?'done':''}">
          <span class="skb">${p.done?I.check(13):''}</span>
          <span>${esc(p.t)}</span></div>`).join('')}
      </div>
      ${this.siguienteAccion(pasos)}
      ${ps.length?this.resumen(ps,inv,cert):''}`;
    }

    return `
    <h1 class="t-page">${esc(Data.club().nombre)}</h1>
    <p class="t-sub">Temporada ${esc(Data.season().nombre)} · ${ps.length} deportistas</p>
    ${sinEquipo.length ? hint('<strong>'+sinEquipo.length+' entrenador'+
      (sinEquipo.length>1?'es':'')+' sin equipo asignado.</strong> '+
      'No pueden convocar hasta que les asignes una categoría.','warn'):''}
    ${sinCert ? hint('<strong>'+sinCert+' técnico'+(sinCert>1?'s':'')+
      ' sin certificado en regla.</strong> Es obligatorio por la LOPIVI.','bad'):''}
    ${this.resumen(ps,inv,cert)}

    <div class="t-sec">Equipos</div>
    <div class="rows">${Data.teams().map(t=>{
      const n = Data.teamPlayers(t.id).length;
      const tec = Data.teamStaff(t.id);
      const media = Data.teamAttAvg(t.id);
      return `<div class="row">
        <div class="ava sq">${esc(t.nombre.replace('Sub-','S'))}</div>
        <div class="row-b"><b>${esc(t.nombre)}</b>
          <span>${n} ${n===1?'jugador':'jugadores'} · ${
            tec.length?esc(tec[0].user?.nombre.split(' ')[0]||''):'sin entrenador'}</span></div>
        <div class="row-e">${media===null ? (tec.length?'':tag('Sin técnico','t-warn'))
          : tag(media+'%', media<70?'t-bad':'t-ok')}</div>
      </div>`;
    }).join('')}</div>`;
  },

  siguienteAccion(pasos){
    const p = pasos.find(x=>!x.done);
    if(!p) return '';
    const A = {
      coach: { t:'Invitar al cuerpo técnico',
        d:'Genera un código para cada entrenador. Es de un solo uso y caduca, '+
          'así nadie puede darse permisos por su cuenta.',
        b:'Generar código de entrenador', f:"Board.nuevoCodigo('entrenador')" },
      assign:{ t:'Asignar entrenadores a equipos',
        d:'Hasta que no tengan categoría no pueden convocar ni pasar lista.',
        b:'Ir a personas', f:"Shell.goTab('gente')" },
      fam:   { t:'Compartir el código con las familias',
        d:'Con ese código las familias crean su cuenta e inscriben a sus hijos.',
        b:'Ver el código de familias', f:'Board.verCodigoFamilia()' },
      play:  { t:'Esperando las primeras inscripciones',
        d:'Cuando una familia inscriba a su hijo aparecerá en la categoría elegida.',
        b:'Ver el código de familias', f:'Board.verCodigoFamilia()' },
      ev:    { t:'Primer entrenamiento',
        d:'Lo convoca el entrenador desde su cuenta. Avísale de que ya puede empezar.',
        b:'Ver cuerpo técnico', f:"Shell.goTab('gente')" }
    }[p.k];
    if(!A) return '';
    return `<div class="panel lead">
      <b style="display:block;margin-bottom:4px">Siguiente: ${esc(A.t)}</b>
      <span class="tiny">${esc(A.d)}</span>
      <button class="btn btn-accent btn-sm" style="width:100%;margin-top:12px"
        onclick="${A.f}">${esc(A.b)}</button>
    </div>`;
  },

  resumen(ps,inv,cert){
    const total = inv.reduce((a,b)=>a+Number(b.importe),0);
    const cobr  = inv.filter(i=>['pagado','cobro_manual'].includes(i.estado))
                     .reduce((a,b)=>a+Number(b.importe),0);
    const dev = inv.filter(i=>i.estado==='devuelto').length;
    const ok = cert.filter(c=>c.estado==='vigente').length;
    return `<div class="metrics">
      <div class="metric"><div class="mv">${ps.length}</div>
        <div class="ml">Deportistas</div></div>
      <div class="metric ${dev?'warn':''}"><div class="mv">${
        inv.length?Math.round(cobr/total*100)+'%':'—'}</div>
        <div class="ml">Cuotas cobradas</div></div>
      <div class="metric ${cert.length&&ok<cert.length?'warn':''}">
        <div class="mv">${ok}/${cert.length||'—'}</div>
        <div class="ml">LOPIVI en regla</div></div>
    </div>`;
  },

  /* ==================== PERSONAS ==================== */
  gente(){
    const d = DB.load();
    const tab = S.gTab || 'tecnicos';
    const tec = d.members.filter(m=>m.rol==='entrenador')
      .map(m=>({ u:d.users.find(u=>u.id===m.user_id),
        teams:d.staff.filter(s=>s.user_id===m.user_id).map(s=>Data.team(s.team_id)) }))
      .filter(x=>x.u);
    const fams = d.members.filter(m=>m.rol==='familia')
      .map(m=>({ u:d.users.find(u=>u.id===m.user_id),
        g:d.guardians.find(g=>g.user_id===m.user_id) })).filter(x=>x.u);
    const junta = d.members.filter(m=>m.rol==='junta')
      .map(m=>d.users.find(u=>u.id===m.user_id)).filter(Boolean);

    return `
    <h1 class="t-page">Personas</h1>
    <p class="t-sub">Quién tiene acceso y con qué permisos</p>
    <div class="tabs">
      <button class="${tab==='tecnicos'?'on':''}" onclick="S.gTab='tecnicos';Shell.render()">Técnicos</button>
      <button class="${tab==='familias'?'on':''}" onclick="S.gTab='familias';Shell.render()">Familias</button>
      <button class="${tab==='depor'?'on':''}" onclick="S.gTab='depor';Shell.render()">Deportistas</button>
      <button class="${tab==='codigos'?'on':''}" onclick="S.gTab='codigos';Shell.render()">Códigos</button>
    </div>

    ${tab==='tecnicos'?`
      ${tec.length ? `<div class="rows">${tec.map(x=>`
        <button class="row" onclick="Board.tecnico('${x.u.id}')">
          ${ava(x.u.nombre)}
          <div class="row-b"><b>${esc(x.u.nombre)}</b>
            <span>${x.teams.length ? x.teams.map(t=>esc(t?.nombre||'')).join(', ')
              : 'Sin equipo asignado'}</span></div>
          <div class="row-e">${x.teams.length?'':tag('Asignar','t-warn')}</div>
        </button>`).join('')}</div>`
      : blank(I.whistle(24),'Sin cuerpo técnico',
        'Genera un código de entrenador y dáselo a la persona. Es de un solo '+
        'uso, así nadie más puede usarlo.')}
      <button class="btn btn-accent" onclick="Board.nuevoCodigo('entrenador')">
        ${I.plus(17)} Invitar a un entrenador</button>

      <div class="t-sec">Junta directiva</div>
      <div class="rows">${junta.map(u=>`
        <div class="row">${ava(u.nombre)}
          <div class="row-b"><b>${esc(u.nombre)}</b><span>${esc(u.email)}</span></div>
          <div class="row-e">${u.id===Data.ses.userId?tag('Tú','t-accent'):''}</div>
        </div>`).join('')}</div>
      <button class="btn btn-2" onclick="Board.nuevoCodigo('junta')">
        ${I.plus(17)} Invitar a la junta</button>
    `:''}

    ${tab==='familias'?`
      ${fams.length ? `<div class="rows">${fams.map(x=>{
        const hijos = x.g ? d.links.filter(l=>l.guardian_id===x.g.id).length : 0;
        return `<div class="row">${ava(x.u.nombre)}
          <div class="row-b"><b>${esc(x.u.nombre)}</b>
            <span>${hijos} ${hijos===1?'deportista':'deportistas'} · ${esc(x.u.email)}</span></div>
          <div class="row-e">${hijos?'':tag('Sin inscribir','t-mute')}</div>
        </div>`;
      }).join('')}</div>`
      : blank(I.users(24),'Ninguna familia registrada',
        'Comparte el código general del club por el canal habitual y las '+
        'familias se registrarán solas.')}
      <button class="btn btn-2" onclick="Board.verCodigoFamilia()">
        ${I.key(17)} Ver el código de familias</button>
    `:''}

    ${tab==='depor'?this.deportistas():''}
    ${tab==='codigos'?this.codigos():''}`;
  },

  /** La junta puede consultar cualquier ficha, por ejemplo ante una urgencia. */
  deportistas(){
    const q = (S.dq||'').toLowerCase();
    const ps = Data.players().filter(p=>p.nombre.toLowerCase().includes(q));
    if(!Data.players().length)
      return blank(I.users(24),'Sin deportistas inscritos',
        'Aparecerán aquí cuando las familias los inscriban con el código del club.');
    return `
    <div class="f">
      <input class="in" placeholder="Buscar deportista" value="${esc(S.dq||'')}"
             oninput="S.dq=this.value;Shell.render()">
    </div>
    ${hint('Como junta puedes consultar cualquier ficha, incluida la información '+
      'médica, para poder actuar en una urgencia.')}
    ${ps.length ? `<div class="rows">${ps.map(p=>{
      const t = Data.playerTeam(p.id);
      const tut = Data.guardiansOf(p.id)[0];
      return `<button class="row" onclick="Shell.go('ficha',{playerId:'${p.id}'})">
        ${ava(p.nombre, p.alergias?'warn':'')}
        <div class="row-b"><b>${esc(p.nombre)}</b>
          <span>${esc(t?.nombre||'Sin categoría')}${tut?' · '+esc(tut.nombre):''}</span></div>
        <div class="row-e">${p.alergias?tag('Médico','t-warn'):''}
          <span style="color:var(--t3)">${I.chevron(17)}</span></div>
      </button>`;
    }).join('')}</div>` : blank(I.search(24),'Sin resultados','Prueba con otro nombre.')}`;
  },

  codigos(){
    const inv = Data.invites();
    const act = inv.filter(i=>i.max===null || i.usos < i.max);
    const usa = inv.filter(i=>i.max!==null && i.usos >= i.max);
    return `
    ${hint('El código determina el perfil con el que entra cada persona. '+
      'Los de entrenador y junta son de un solo uso y caducan a los 30 días.')}
    <div class="t-sec">Activos</div>
    ${act.length ? `<div class="rows">${act.map(i=>`
      <div class="row">
        <div class="ava sq">${I[ROLES[i.rol].ic](18)}</div>
        <div class="row-b">
          <b style="font-family:ui-monospace,monospace;letter-spacing:.12em">${esc(i.code)}</b>
          <span>${esc(ROLES[i.rol].t)}${i.nota?' · '+esc(i.nota):''}${
            i.max===null?' · uso ilimitado':' · '+i.usos+'/'+i.max}</span></div>
        <div class="row-e" style="flex-direction:row;gap:6px;align-items:center">
          <button class="btn btn-2 btn-sm" onclick="Board.copiar('${i.code}')"
            title="Copiar">${I.copy(15)}</button>
          ${!(i.rol==='familia'&&i.max===null)?`
            <button class="btn btn-2 btn-sm" onclick="Board.anular('${i.code}')"
              title="Anular">${I.trash(15)}</button>`:''}
        </div>
      </div>`).join('')}</div>`:`<p class="tiny">No hay códigos activos.</p>`}
    ${usa.length ? `<div class="t-sec">Ya utilizados</div>
    <div class="rows">${usa.map(i=>`
      <div class="row"><div class="ava sq">${I.check(18)}</div>
        <div class="row-b"><b style="font-family:ui-monospace,monospace;
          letter-spacing:.12em;color:var(--t3)">${esc(i.code)}</b>
          <span>${esc(ROLES[i.rol].t)}${i.nota?' · '+esc(i.nota):''}</span></div>
        <div class="row-e">${tag('Usado','t-mute')}</div>
      </div>`).join('')}</div>`:''}
    <div class="btns" style="margin-top:12px">
      <button class="btn btn-2" onclick="Board.nuevoCodigo('entrenador')">Entrenador</button>
      <button class="btn btn-2" onclick="Board.nuevoCodigo('junta')">Junta</button>
    </div>`;
  },

  nuevoCodigo(rol){
    const ts = Data.teams();
    sheet('Invitar como '+ROLES[rol].t.toLowerCase(), `
      ${hint(rol==='entrenador'
        ? 'Código de un solo uso. Cuando esa persona lo utilice, queda inservible.'
        : 'Dará permisos completos sobre el club, incluidos los datos económicos.',
        rol==='junta'?'warn':'')}
      <div class="f"><label for="icN">Para quién es</label>
        <input class="in" id="icN" placeholder="Nombre de la persona">
        <div class="help">Solo para que sepas a quién se lo diste.</div></div>
      ${rol==='entrenador'&&ts.length?`
        <div class="f"><label for="icT">Equipo que va a entrenar</label>
          <select class="in" id="icT">
            <option value="">Lo asigno después</option>
            ${ts.map(t=>`<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}
          </select>
          <div class="help">Si lo eliges ahora, quedará asignado al registrarse.</div>
        </div>`:''}
      ${backendListo()&&((window.RCC_CONFIG||{}).mailFrom||(Backend.cfg||{}).mailFrom)?`
        <div class="f"><label for="icE">Enviarle el código por correo</label>
          <input class="in" id="icE" type="email" inputmode="email"
                 placeholder="persona@correo.com">
          <div class="help">Opcional. Si lo rellenas, le llegará con las
            instrucciones para crear su cuenta. Si no, cópialo tú.</div>
        </div>`:''}
      <button class="btn btn-accent" onclick="Board.crearCodigo('${rol}')">
        Generar código</button>`);
  },
  crearCodigo(rol){
    try{
      const inv = Data.createInvite({ rol, nota:val('icN'),
        team_id: rol==='entrenador' ? val('icT') : null, max:1, dias:30,
        email: val('icE'), nombre: val('icN') });
      const enviado = !!inv.email;
      sheet('Código generado', `
        <div class="codebox">
          <div class="cl">${esc(ROLES[rol].t)}</div>
          <div class="cv">${esc(inv.code)}</div>
          <div class="cd">Un solo uso · caduca el ${esc(inv.caduca)}</div>
        </div>
        ${enviado
          ? hint('Le hemos enviado el código a <strong>'+esc(inv.email)+
              '</strong> con las instrucciones para crear su cuenta.','ok')
          : hint('Dáselo por un canal privado. Con este código esa persona podrá '+
              'crear su cuenta con permisos de '+ROLES[rol].t.toLowerCase()+'.','warn')}
        <button class="btn" onclick="Board.copiar('${inv.code}')">
          ${I.copy(17)} Copiar código</button>
        <div style="height:8px"></div>
        <button class="btn btn-text" onclick="closeSheet();Shell.render()">Cerrar</button>`);
    }catch(e){ toast(e.message); }
  },
  verCodigoFamilia(){
    sheet('Código de familias', `
      <div class="codebox">
        <div class="cl">Código general del club</div>
        <div class="cv">${esc(Data.familyCode())}</div>
        <div class="cd">Uso ilimitado · sin caducidad</div>
      </div>
      ${hint('Puedes difundirlo libremente. Solo da acceso como familia: nunca '+
        'permite entrar como entrenador ni como junta.','ok')}
      <button class="btn" onclick="Board.copiar('${Data.familyCode()}')">
        ${I.copy(17)} Copiar código</button>
      <div style="height:8px"></div>
      <button class="btn btn-text" onclick="closeSheet();Board.regenerarFamilia()">
        Cambiar el código por uno nuevo</button>`);
  },
  anular(code){
    confirmSheet('Anular el código',
      'Quien tenga este código dejará de poder registrarse con él. '+
      'Las cuentas ya creadas no se ven afectadas.', 'Anular',
      ()=>{ try{ Data.revokeInvite(code); toast('Código anulado'); Shell.render(); }
            catch(e){ toast(e.message); } });
  },
  regenerarFamilia(){
    confirmSheet('Cambiar el código de familias',
      'El código actual dejará de funcionar. Tendrás que repartir el nuevo a '+
      'quien aún no se haya registrado.', 'Generar uno nuevo',
      ()=>{ try{ const i = Data.regenerarCodigoFamilia();
              toast('Nuevo código: '+i.code); Shell.render(); }
            catch(e){ toast(e.message); } }, false);
  },
  copiar(code){
    if(navigator.clipboard) navigator.clipboard.writeText(code).catch(()=>{});
    toast('Código copiado: '+code);
  },

  tecnico(uid2){
    const d = DB.load();
    const u = d.users.find(x=>x.id===uid2);
    const mios = d.staff.filter(s=>s.user_id===uid2).map(s=>s.team_id);
    const cert = d.certs.find(c=>c.user_id===uid2);
    sheet(u.nombre, `
      <div class="kv"><span>Email</span><span>${esc(u.email)}</span></div>
      ${u.tel?`<div class="kv"><span>Teléfono</span><span>${esc(u.tel)}</span></div>`:''}
      <div class="kv"><span>Certificado LOPIVI</span><span>${
        cert && cert.estado==='vigente' ? tag('Vigente','t-ok') : tag('Pendiente','t-bad')}</span></div>
      <div class="t-sec">Equipos que entrena</div>
      ${hint('Un entrenador solo ve la plantilla y los datos de los equipos que '+
        'tiene asignados.')}
      <div class="rows">${Data.teams().map(t=>{
        const on = mios.includes(t.id);
        return `<button class="sel ${on?'on':''}"
          onclick="Board.toggleEquipo('${uid2}','${t.id}')">
          <span class="box">${on?I.check(15):''}</span>
          <div class="row-b"><b>${esc(t.nombre)}</b>
            <span>${Data.teamPlayers(t.id).length} jugadores</span></div>
        </button>`;
      }).join('')}</div>
      <button class="btn btn-2" style="margin-top:12px" onclick="closeSheet()">Listo</button>`);
  },
  toggleEquipo(uid2, tid){
    const d = DB.load();
    const on = d.staff.some(s=>s.user_id===uid2 && s.team_id===tid);
    if(on) Data.unassignStaff(uid2,tid); else Data.assignStaff(uid2,tid);
    if(!on){
      if(!d.certs.some(c=>c.user_id===uid2)){
        const u = d.users.find(x=>x.id===uid2);
        d.certs.push({ id:'ce_'+uid2, user_id:uid2, nombre:u.nombre,
          tipo:'CDNS', estado:'ausente', formacion:false });
        DB.save();
      }
      Data.notify(uid2,'Equipo asignado','Ya puedes convocar a tu equipo');
      DB.save();
    }
    this.tecnico(uid2); Shell.render();
  },

  /* ==================== CUOTAS ==================== */
  cuotas(){
    const inv = Data.invoices();
    const per = periodoActual();
    const ya = inv.some(i=>i.periodo===per);
    const ps = Data.players();

    if(!ps.length) return `
      <h1 class="t-page">Cuotas</h1>
      <p class="t-sub">Domiciliación sin comisiones</p>
      ${blank(I.euro(24),'Todavía no hay deportistas',
        'Cuando las familias inscriban a sus hijos podrás emitir las cuotas '+
        'del mes de una sola vez.')}`;

    if(!inv.length) return `
      <h1 class="t-page">Cuotas</h1>
      <p class="t-sub">${ps.length} deportistas inscritos</p>
      ${blank(I.euro(24),'Aún no has emitido ninguna cuota',
        'Se generará un recibo por deportista, con el descuento de hermanos ya '+
        'aplicado. Las familias que no hayan domiciliado quedarán marcadas.',
        `<button class="btn btn-accent" onclick="Board.emitir()">
          Emitir las cuotas de ${esc(per)}</button>`)}`;

    const f = S.iF || 'problemas';
    let lista = inv;
    if(f==='problemas') lista = inv.filter(i=>['devuelto','sin_mandato','pendiente'].includes(i.estado));
    if(f==='proceso')   lista = inv.filter(i=>i.estado==='en_proceso');
    if(f==='ok')        lista = inv.filter(i=>['pagado','cobro_manual'].includes(i.estado));
    const prob = inv.filter(i=>['devuelto','sin_mandato','pendiente'].includes(i.estado));

    return `
    <h1 class="t-page">Cuotas</h1>
    <p class="t-sub">Domiciliación SEPA · el club no paga comisión</p>
    ${!ya ? `<button class="btn btn-accent" onclick="Board.emitir()">
      Emitir las cuotas de ${esc(per)}</button><div style="height:12px"></div>`:''}
    ${prob.length
      ? hint('<strong>'+prob.length+' recibos sin cobrar ('+
          eur(prob.reduce((a,b)=>a+Number(b.importe),0))+').</strong>','bad')
      : hint('Todos los recibos están cobrados o en curso.','ok')}
    <div class="tabs">
      <button class="${f==='problemas'?'on':''}" onclick="S.iF='problemas';Shell.render()">Sin cobrar</button>
      <button class="${f==='proceso'?'on':''}" onclick="S.iF='proceso';Shell.render()">En curso</button>
      <button class="${f==='ok'?'on':''}" onclick="S.iF='ok';Shell.render()">Cobrados</button>
    </div>
    ${f==='proceso'?hint('Los cargos tardan unos <strong>6 días hábiles</strong> en '+
      'confirmarse. Hasta entonces no se consideran cobrados.'):''}
    ${lista.length ? `<div class="rows">${lista.map(i=>{
      const p = Data.player(i.player_id);
      return `<button class="row" onclick="Board.recibo('${i.id}')">
        ${ava(p?p.nombre:'—')}
        <div class="row-b"><b>${esc(p?p.nombre:'—')}</b>
          <span>${esc(i.motivo_devolucion||i.concepto)}</span></div>
        <div class="row-e"><span class="amt">${eur(i.importe)}</span>${tagPay(i.estado)}</div>
      </button>`;
    }).join('')}</div>` : blank(I.check(24),'Nada por aquí','No hay recibos en este estado.')}
    ${hint('Un recibo cobrado puede devolverse hasta <strong>8 semanas</strong> después. '+
      'El saldo del mes no es definitivo hasta entonces.','warn')}`;
  },
  emitir(){
    confirmSheet('Emitir cuotas', 'Se generará un recibo por cada deportista '+
      'inscrito para '+periodoActual()+'. Puedes anularlos después uno a uno.',
      'Emitir', ()=>{
        try{ const n = Data.issueInvoices(periodoActual());
          toast(n+' recibos emitidos'); Shell.render(); }
        catch(e){ toast(e.message); }
      }, false);
  },
  recibo(id){
    const i = Data.invoices().find(x=>x.id===id);
    const p = Data.player(i.player_id);
    sheet('Recibo de '+(p?p.nombre.split(' ')[0]:'—'), `
      <div class="kv"><span>Concepto</span><span>${esc(i.concepto)}</span></div>
      <div class="kv"><span>Cuota base</span><span>${eur(i.base)}</span></div>
      ${Number(i.descuento)?`<div class="kv"><span>Descuento hermanos</span>
        <span style="color:var(--ok)">−${eur(i.descuento)}</span></div>`:''}
      <div class="kv sum"><span>Importe</span><span>${eur(i.importe)}</span></div>
      <div class="kv"><span>Estado</span><span>${tagPay(i.estado)}</span></div>
      ${i.motivo_devolucion?hint('Motivo: <strong>'+esc(i.motivo_devolucion)+
        '</strong>','bad'):''}
      ${i.estado==='sin_mandato'?hint('Esta familia todavía no ha domiciliado la '+
        'cuota. Sin mandato no se puede pasar el recibo.','warn'):''}
      <div class="btns" style="margin-top:16px">
        ${['devuelto','pendiente','sin_mandato'].includes(i.estado)?`
          <button class="btn btn-2" onclick="Board.marcarPago('${id}')">Cobrado en mano</button>`:''}
        ${i.estado==='devuelto'?`
          <button class="btn" onclick="Board.reintentar('${id}')">Reintentar cargo</button>`:''}
      </div>`);
  },
  marcarPago(id){
    Data.updateInvoice(id,{ estado:'cobro_manual', metodo:'Efectivo' });
    closeSheet(); toast('Registrado como cobrado en mano'); Shell.render();
  },
  reintentar(id){
    Data.updateInvoice(id,{ estado:'en_proceso', motivo_devolucion:null });
    closeSheet(); toast('Cargo relanzado'); Shell.render();
  },

  /* ==================== LOPIVI ==================== */
  lopivi(){
    const cs = Data.certs();
    if(!cs.length) return `
      <h1 class="t-page">Cumplimiento LOPIVI</h1>
      <p class="t-sub">Ley Orgánica 8/2021 de protección a la infancia</p>
      ${blank(I.shield(24),'Sin cuerpo técnico registrado',
        'Cuando invites a los entrenadores aparecerán aquí para registrar su '+
        'certificado de delitos de naturaleza sexual.',
        `<button class="btn btn-2" onclick="Board.nuevoCodigo('entrenador')">
          Invitar a un entrenador</button>`)}
      ${hint('La ley obliga a toda entidad con menores a tener delegado de '+
        'protección, protocolo escrito, formación del personal y el certificado '+
        'de cada persona con contacto habitual.')}`;

    const ok = cs.filter(c=>c.estado==='vigente');
    const falta = cs.filter(c=>c.estado!=='vigente');
    const form = cs.filter(c=>c.formacion).length;
    const fila = c=>`<button class="row" onclick="Board.cert('${c.id}')">
      <span class="light ${c.estado==='vigente'?'g':c.estado==='proximo'?'a':'r'}"></span>
      <div class="row-b"><b>${esc(c.nombre)}</b>
        <span>${c.teams.filter(Boolean).map(t=>esc(t.nombre)).join(', ')||'Sin equipo'}</span></div>
      <div class="row-e">${c.estado==='vigente'?tag('Vigente','t-ok')
        :c.estado==='proximo'?tag('Por renovar','t-warn'):tag('Falta','t-bad')}</div>
    </button>`;

    return `
    <h1 class="t-page">Cumplimiento LOPIVI</h1>
    <p class="t-sub">Ley Orgánica 8/2021 de protección a la infancia</p>
    <div class="metrics">
      <div class="metric ${falta.length?'warn':'good'}">
        <div class="mv">${ok.length}/${cs.length}</div>
        <div class="ml">Certificados en regla</div></div>
      <div class="metric"><div class="mv">${form}/${cs.length}</div>
        <div class="ml">Con formación</div></div>
    </div>
    ${falta.length ? hint('<strong>'+falta.length+' personas sin certificado '+
      'vigente.</strong> No deberían tener contacto habitual con menores hasta '+
      'regularizarlo.','bad') : hint('Todo el cuerpo técnico está en regla.','ok')}
    ${falta.length?`<div class="t-sec">Pendientes</div>
      <div class="rows">${falta.map(fila).join('')}</div>`:''}
    ${ok.length?`<div class="t-sec">En regla</div>
      <div class="rows">${ok.map(fila).join('')}</div>`:''}
    <div class="t-sec">Requisitos del club</div>
    <div class="panel">
      <div class="kv"><span>Delegado de protección</span>
        <span>${tag('Designado','t-ok')}</span></div>
      <div class="kv"><span>Protocolo de actuación</span>
        <span>${tag('Publicado','t-ok')}</span></div>
      <div class="kv"><span>Formación del personal</span>
        <span>${form}/${cs.length}</span></div>
    </div>
    <button class="btn" onclick="toast('Dossier generado')">
      ${I.download(17)} Exportar dossier de cumplimiento</button>`;
  },
  cert(id){
    const c = Data.certs().find(x=>x.id===id);
    sheet(c.nombre, `
      ${hint('El certificado de delitos de naturaleza sexual es obligatorio '+
        'para cualquier persona con contacto habitual con menores.')}
      <div class="f"><label for="ceE">Estado del certificado</label>
        <select class="in" id="ceE">
          <option value="ausente" ${c.estado==='ausente'?'selected':''}>No entregado</option>
          <option value="vigente" ${c.estado==='vigente'?'selected':''}>Entregado y vigente</option>
          <option value="proximo" ${c.estado==='proximo'?'selected':''}>Próximo a renovar</option>
        </select></div>
      <div class="f"><label for="ceR">Fecha de revisión</label>
        <input class="in" id="ceR" type="date" value="${esc(c.revisar||'')}"></div>
      <label class="check"><input type="checkbox" id="ceF" ${c.formacion?'checked':''}>
        <span>Ha completado la formación en protección a la infancia</span></label>
      <button class="btn" style="margin-top:12px" onclick="Board.guardarCert('${id}')">
        Guardar</button>`);
  },
  guardarCert(id){
    Data.updateCert(id,{ estado:val('ceE'), revisar:val('ceR'), formacion:chk('ceF') });
    closeSheet(); toast('Actualizado'); Shell.render();
  },

  /* ==================== CLUB ==================== */
  club(){
    const c = Data.club();
    return `
    <h1 class="t-page">El club</h1>
    <p class="t-sub">${esc(c.nombre)} · desde ${c.fundado}</p>

    <div class="t-sec">Categorías, grupos y cuotas</div>
    ${hint('Una categoría puede tener varios grupos (A y B). Los jugadores se '+
      'pueden subir y bajar entre ellos, y un entrenador ve a los de su grupo '+
      'más los del hermano cuando convoca.')}
    ${Data.categories().map(cat=>{
      const eqs = Data.teams().filter(t=>t.cat_id===cat.id);
      return `<div class="panel">
        <div class="panel-hd" style="margin-bottom:10px">
          <b>${esc(cat.nombre)}</b>
          <button class="btn btn-2 btn-sm" onclick="Board.editarCat('${cat.id}')">
            ${eur(cat.cuota)}/mes</button></div>
        ${eqs.map(t=>`<div class="kv">
          <span>${esc(t.nombre)}${t.nivel?'':' <span class="tag t-mute">grupo único</span>'}</span>
          <span>${Data.teamPlayers(t.id).length} jugadores · ${
            Data.teamStaff(t.id).length?esc(Data.teamStaff(t.id)[0].user?.nombre.split(' ')[0]||''):'sin técnico'}</span>
        </div>`).join('')}
        <button class="btn btn-2 btn-sm" style="width:100%;margin-top:10px"
          onclick="Board.nuevoGrupo('${cat.id}')">
          ${I.plus(15)} Añadir grupo a ${esc(cat.nombre)}</button>
      </div>`;
    }).join('')}
    <button class="btn btn-2" onclick="Board.nuevaCat()">
      ${I.plus(17)} Añadir categoría</button>

    <div class="t-sec">Acceso</div>
    <div class="panel">
      <div class="kv"><span>Código de familias</span>
        <span style="font-family:ui-monospace,monospace;letter-spacing:.1em">
          ${esc(Data.familyCode())}</span></div>
      <div class="kv"><span>Temporada</span><span>${esc(Data.season().nombre)}</span></div>
    </div>
    ${hint('Solo la junta puede generar códigos de entrenador o de junta. '+
      'Nadie puede darse esos permisos por su cuenta.')}

    <div class="t-sec">Datos del club</div>
    <div class="stack">
      <button class="btn btn-2" onclick="Board.exportar()">
        ${I.download(17)} Exportar listado a Excel</button>
      <button class="btn btn-2" onclick="Board.copiaSeguridad()">
        ${I.doc(17)} Copia de seguridad completa</button>
      <button class="btn btn-2" onclick="Board.restaurar()">
        ${I.upload(17)} Restaurar una copia</button>
    </div>

    <div class="t-sec">Temporada</div>
    <div class="panel">
      <div class="kv"><span>Actual</span><span>${esc(Data.season().nombre)}</span></div>
      <div class="kv"><span>Deportistas</span><span>${Data.players().length}</span></div>
    </div>
    <button class="btn btn-2" onclick="Board.cerrarTemporada()">
      ${I.arrow(17)} Cerrar temporada y promocionar</button>

    ${Shell.cuenta()}`;
  },
  descargar(nombre, contenido, tipo){
    try{
      const blob = new Blob([contenido], { type:tipo });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      toast('Archivo descargado');
    }catch(e){ toast('No se ha podido descargar'); }
  },
  exportar(){
    if(!Data.players().length){ toast('Todavía no hay deportistas'); return; }
    this.descargar('deportistas-'+Data.season().nombre+'.csv',
      '\ufeff'+Data.exportarCSV(), 'text/csv;charset=utf-8');
  },
  copiaSeguridad(){
    sheet('Copia de seguridad', `
      ${hint('Descarga un archivo con todo: club, cuentas, fichas, partidos y '+
        'cuotas. Guárdalo en un sitio seguro y entrégaselo a la junta entrante.')}
      ${hint('Contiene datos personales de menores. Trátalo como un documento '+
        'confidencial.','warn')}
      <button class="btn btn-accent" onclick="Board.bajarCopia()">
        ${I.download(17)} Descargar copia</button>`);
  },
  bajarCopia(){
    this.descargar('rccornella-copia-'+new Date().toISOString().slice(0,10)+'.json',
      Data.exportarJSON(), 'application/json');
    closeSheet();
  },
  restaurar(){
    sheet('Restaurar una copia', `
      ${hint('Se sustituirá TODO lo que hay ahora por el contenido del archivo. '+
        'Haz antes una copia de seguridad por si acaso.','bad')}
      <div class="f"><label for="rsJ">Pega aquí el contenido del archivo</label>
        <textarea class="in" id="rsJ" rows="5"
          placeholder='{"exportado":"...","datos":{...}}'></textarea></div>
      <button class="btn btn-danger" onclick="Board.hacerRestaurar()">
        Restaurar</button>`);
  },
  hacerRestaurar(){
    try{
      Data.importarJSON(val('rsJ'));
      closeSheet(); toast('Copia restaurada');
      Data.endSession(); location.reload();
    }catch(e){ toast(e.message); }
  },

  cerrarTemporada(){
    const prev = Data.previsualizarCierre();
    if(!prev.length){ toast('No hay deportistas que promocionar'); return; }
    S.cierre = {};
    prev.forEach(x=>{ S.cierre[x.player.id] = x.a ? 'sube' : 'queda'; });
    S.cierrePrev = prev;
    this.pantallaCierre();
  },
  pantallaCierre(){
    const prev = S.cierrePrev;
    const sig = new Date().getFullYear();
    sheet('Cerrar temporada', `
      ${hint('Se archiva la temporada actual y cada deportista sube de categoría. '+
        'Se conservan las fichas y el historial; se vacían eventos, partidos y '+
        'recibos para empezar limpio.')}
      <div class="f"><label for="ctN">Nueva temporada</label>
        <input class="in" id="ctN" value="${sig}-${String(sig+1).slice(2)}"></div>
      <div class="t-sec">Qué pasa con cada uno</div>
      <div class="rows">${prev.map(x=>{
        const est = S.cierre[x.player.id];
        return `<button class="row" onclick="Board.ciclarCierre('${x.player.id}')">
          ${ava(x.player.nombre)}
          <div class="row-b"><b>${esc(x.player.nombre)}</b>
            <span>${esc(x.de?.nombre||'—')}${x.a?' → '+esc(x.a.nombre):''}</span></div>
          <div class="row-e">${
            est==='sube' && x.a ? tag('Sube','t-ok')
            : est==='baja' ? tag('Baja','t-bad') : tag('Se queda','t-mute')}</div>
        </button>`;
      }).join('')}</div>
      <p class="tiny" style="margin:10px 0 14px">Toca a cada deportista para
        alternar entre subir, quedarse o darse de baja.</p>
      <button class="btn btn-accent" onclick="Board.confirmarCierre()">
        Cerrar la temporada</button>`);
  },
  ciclarCierre(pid){
    const x = S.cierrePrev.find(y=>y.player.id===pid);
    const orden = x.a ? ['sube','queda','baja'] : ['queda','baja'];
    const i = orden.indexOf(S.cierre[pid]);
    S.cierre[pid] = orden[(i+1) % orden.length];
    this.pantallaCierre();
  },
  confirmarCierre(){
    const nombre = val('ctN');
    if(!nombre){ toast('Ponle nombre a la temporada'); return; }
    const movs = S.cierrePrev.map(x=>({ player_id:x.player.id,
      accion:S.cierre[x.player.id],
      team_id:x.a?x.a.id:null }));
    const n = movs.filter(m=>m.accion==='baja').length;
    closeSheet();
    confirmSheet('Confirmar el cierre',
      'Se archivará '+Data.season().nombre+' y se abrirá '+nombre+'. '+
      (n?n+' deportistas serán dados de baja. ':'')+
      'Se borrarán eventos, partidos y recibos de la temporada anterior.',
      'Cerrar temporada', ()=>{
        try{ const r = Data.cerrarTemporada(nombre, movs);
          toast(r.subidos+' promocionados, '+r.bajas+' bajas');
          S.cierre=null; S.cierrePrev=null; Shell.render(); }
        catch(e){ toast(e.message); }
      });
  },

  nuevoGrupo(catId){
    const cat = Data.categories().find(c=>c.id===catId);
    const eqs = Data.teams().filter(t=>t.cat_id===catId);
    const sug = ['A','B','C','D'].find(l=>!eqs.some(t=>(t.nivel||'')===l)) || 'B';
    sheet('Nuevo grupo en '+cat.nombre, `
      ${hint('Se usa cuando una categoría tiene dos equipos: por ejemplo un '+
        'grupo de rendimiento y otro de promoción. Comparten categoría y cuota.')}
      <div class="f"><label for="ngL">Letra del grupo</label>
        <input class="in code" id="ngL" maxlength="1" value="${sug}"
          oninput="this.value=this.value.toUpperCase()"></div>
      <button class="btn btn-accent" onclick="Board.guardarGrupo('${catId}')">
        Crear grupo</button>`);
  },
  guardarGrupo(catId){
    try{ const t = Data.addTeam(catId, val('ngL'));
      closeSheet(); toast(t.nombre+' creado'); Shell.render(); }
    catch(e){ toast(e.message); }
  },

  nuevaCat(){
    sheet('Nueva categoría', `
      <div class="f"><label for="ncN2">Nombre</label>
        <input class="in" id="ncN2" placeholder="Sub-20"></div>
      <div class="f"><label for="ncC2">Cuota mensual (€)</label>
        <input class="in" id="ncC2" type="number" min="0" value="40"></div>
      <button class="btn" onclick="Board.guardarCat()">Crear categoría</button>`);
  },
  guardarCat(){
    const n = val('ncN2');
    if(!n){ toast('Ponle nombre'); return; }
    Data.addCategory(n, val('ncC2'));
    closeSheet(); toast('Categoría creada'); Shell.render();
  },
  editarCat(id){
    const c = Data.categories().find(x=>x.id===id);
    sheet(c.nombre, `
      <div class="f"><label for="ecC">Cuota mensual (€)</label>
        <input class="in" id="ecC" type="number" min="0" value="${c.cuota}">
        <div class="help">Afecta a los recibos que emitas a partir de ahora.</div></div>
      <button class="btn" onclick="Board.guardarEditCat('${id}')">Guardar</button>`);
  },
  guardarEditCat(id){
    Data.updateCategory(id,{ cuota:+val('ecC')||0 });
    closeSheet(); toast('Cuota actualizada'); Shell.render();
  }
};
