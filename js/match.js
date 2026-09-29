/* ============================================================================
   Día de partido
   ----------------------------------------------------------------------------
   Tres pestañas: Alineación · En juego · Resumen.
   La idea rectora es que durante el partido el entrenador está de pie, con
   frío y mirando al campo: cada acción tiene que caber en dos toques y los
   objetivos tienen que ser grandes.
   ============================================================================ */

const Match = {

  pantalla(eventId){
    const ev = Data.event(eventId);
    if(!ev) return blank(I.question(24),'Partido no encontrado','');
    const m = Data.ensureMatch(eventId);
    const tab = S.mTab || (m.estado==='final' ? 'resumen'
                        : m.estado==='previo' ? 'alineacion' : 'juego');
    return `
    <button class="back" onclick="Shell.back()">${I.chevL(16)} Volver</button>
    <h1 class="t-page">${evTitulo(ev)}</h1>
    <p class="t-sub">${fechaCorta(ev.inicio)}${ev.lugar?' · '+esc(ev.lugar):''}</p>
    ${this.marcador(m, ev)}
    <div class="tabs">
      <button class="${tab==='alineacion'?'on':''}"
        onclick="S.mTab='alineacion';Shell.render()">Alineación</button>
      <button class="${tab==='juego'?'on':''}"
        onclick="S.mTab='juego';Shell.render()">En juego</button>
      <button class="${tab==='resumen'?'on':''}"
        onclick="S.mTab='resumen';Shell.render()">Resumen</button>
    </div>
    ${tab==='alineacion' ? this.alineacion(eventId,m)
     : tab==='juego'     ? this.juego(eventId,m)
     :                     this.resumen(eventId,m)}`;
  },

  /* ---------------- marcador y reloj ---------------- */
  marcador(m, ev){
    const min = Data.minutoActual(m);
    const vivo = m.estado==='jugando';
    const est = { previo:'Sin empezar', jugando:'Parte '+m.parte,
      descanso:'Descanso', pausa:'Pausado', final:'Finalizado' }[m.estado];
    return `
    <div class="score ${vivo?'live':''}">
      <div class="sc-side">
        <span>${esc(Data.club().nombre.replace('Rugby Club ','').slice(0,14))}</span>
        <b>${m.puntos_favor}</b>
      </div>
      <div class="sc-mid">
        <div class="sc-min">${m.estado==='previo'?'—':min+"'"}</div>
        <div class="sc-est">${vivo?'<i class="blip"></i>':''}${esc(est)}</div>
      </div>
      <div class="sc-side r">
        <span>${esc((ev.rival||'Rival').slice(0,14))}</span>
        <b>${m.puntos_contra}</b>
      </div>
    </div>`;
  },

  /* ═══════════════ ALINEACIÓN ═══════════════ */
  alineacion(eventId, m){
    const poss = HUECOS(m.formacion);
    const puestos = Object.values(m.titulares).filter(Boolean).length;
    const disp = Data.disponibles(eventId);
    const usados = new Set([...Object.values(m.titulares), ...m.banquillo]);
    const libres = disp.filter(p=>!usados.has(p.id));
    const bloq = m.estado!=='previo';

    return `
    ${bloq ? hint('El partido ya ha empezado. Los cambios se hacen desde '+
      '<strong>En juego</strong> para que queden con su minuto.','warn') : ''}

    <div class="lineup-bar">
      <div class="lb-left">
        <b>${puestos}/${poss.length}</b>
        <span>en el campo</span>
      </div>
      <select class="in lb-sel" ${bloq?'disabled':''}
        onchange="Match.formacion('${eventId}',this.value)">
        ${Object.keys(FORMACIONES).map(k=>`
          <option value="${k}" ${+k===m.formacion?'selected':''}>
            ${FORMACIONES[k].nombre} · ${FORMACIONES[k].desc}</option>`).join('')}
      </select>
    </div>

    ${!bloq ? `<div class="btns" style="margin-bottom:14px">
      <button class="btn btn-2" onclick="Match.auto('${eventId}')">
        ${I.sparkle(17)} Rellenar solo</button>
      <button class="btn btn-2" onclick="Match.vaciar('${eventId}')">
        ${I.trash(17)} Vaciar</button>
    </div>`:''}

    ${this.campo(eventId, m, poss, bloq)}

    <div class="t-sec">Banquillo · ${m.banquillo.length}</div>
    ${m.banquillo.length ? `<div class="rows">${m.banquillo.map(pid=>{
      const p = Data.player(pid); if(!p) return '';
      const d = disp.find(x=>x.id===pid) || {};
      return `<div class="row">
        ${ava(p.nombre, d.lesionado?'warn':'')}
        <div class="row-b"><b>${esc(p.nombre)}</b>
          <span>${esc(p.posicion||'Sin posición')}${d.lesionado?' · lesionado':''}</span></div>
        <div class="row-e">${bloq?'':`
          <button class="btn btn-2 btn-sm"
            onclick="Match.quitar('${eventId}','${pid}')">Quitar</button>`}</div>
      </div>`;
    }).join('')}</div>`
    : `<p class="tiny">Nadie en el banquillo todavía.</p>`}

    <div class="t-sec">Disponibles · ${libres.length}</div>
    ${libres.length ? this.filtroGrupo() + `<div class="rows">${
      this.aplicarFiltro(libres).map(p=>`
      <div class="row">
        ${ava(p.nombre, p.lesionado||p.ocupado?'warn':'')}
        <div class="row-b"><b>${esc(p.nombre)}</b>
          <span>${this.etiquetasPos(p)}${p.origen?' · de '+esc(p.origen.nombre):''}</span></div>
        <div class="row-e" style="flex-direction:row;gap:6px;align-items:center">
          ${p.ocupado ? tag('Con '+p.ocupado.nombre,'t-bad')
            : p.lesionado ? tag('Lesionado','t-bad') : tagRsvp(p.rsvp)}
          ${bloq||p.ocupado?'':`<button class="btn btn-2 btn-sm"
            onclick="Match.alBanquillo('${eventId}','${p.id}')">Banquillo</button>`}
        </div>
      </div>`).join('')}</div>`
    : hint('Toda la plantilla está convocada.','ok')}

    ${libres.some(p=>p.origen) ? hint('Los jugadores de otros grupos de la misma '+
      'categoría aparecen marcados. Si ya están convocados con su equipo ese día '+
      'no se pueden seleccionar.') : ''}`;
  },

  filtroGrupo(){
    const f = S.fGrupo || 'todos';
    return `<div class="tabs" style="margin-bottom:10px">
      <button class="${f==='todos'?'on':''}" onclick="S.fGrupo='todos';Shell.render()">Todos</button>
      <button class="${f==='delantera'?'on':''}" onclick="S.fGrupo='delantera';Shell.render()">Delantera</button>
      <button class="${f==='trescuartos'?'on':''}" onclick="S.fGrupo='trescuartos';Shell.render()">Tres cuartos</button>
    </div>`;
  },
  aplicarFiltro(lista){
    const f = S.fGrupo || 'todos';
    if(f==='todos') return lista;
    return lista.filter(p=>p.grupo===f || p.grupo==='mixto');
  },
  etiquetasPos(p){
    const ids = p.posiciones && p.posiciones.length ? p.posiciones
      : Data.posicionesDe(p.id);
    if(!ids.length) return '<span class="tag t-mute">Sin etiquetar</span>';
    return ids.map(id=>{ const c = POS(id); if(!c) return '';
      return `<span class="tag ${c.g==='delantera'?'t-mute':'t-accent'}">${
        c.n} ${esc(c.corto)}</span>`; }).join(' ');
  },
  alBanquillo(eventId, pid){
    try{ Data.aBanquillo(eventId,pid); Shell.render(); }
    catch(e){ toast(e.message); }
  },

  /** El campo: huecos posicionados en porcentaje sobre el césped. */
  campo(eventId, m, poss, bloq){
    return `
    <div class="pitch">
      <div class="pitch-lines">
        <div class="ln try t"></div><div class="ln p22 t"></div>
        <div class="ln mid"></div>
        <div class="ln p22 b"></div><div class="ln try b"></div>
        <div class="posts t"></div><div class="posts b"></div>
        <span class="pl-tag t">Línea de ensayo rival</span>
      </div>
      ${poss.map(pos=>{
        const pid = m.titulares[pos.id];
        const p = pid ? Data.player(pid) : null;
        const cls = pos.c==='Delantera' ? 'fw' : 'bk';
        return `<button class="slot ${p?'on':''} ${cls}"
          style="left:${pos.x}%;top:${pos.y}%"
          onclick="Match.hueco('${eventId}','${pos.id}')"
          title="${esc(pos.t)}">
          <span class="sl-n">${pos.n}</span>
          <span class="sl-name">${p?esc(p.nombre.split(' ')[0]):'—'}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="pitch-key">
      <span><i class="k fw"></i>Delantera</span>
      <span><i class="k bk"></i>Tres cuartos</span>
      <span class="tiny">Toca un dorsal para asignar jugador</span>
    </div>`;
  },

  hueco(eventId, posId){
    const m = Data.ensureMatch(eventId);
    if(m.estado!=='previo'){
      toast('El partido ya ha empezado: usa Cambios'); return;
    }
    const pos = HUECOS(m.formacion).find(p=>p.id===posId);
    const actual = m.titulares[posId];
    const usados = new Set([...Object.values(m.titulares), ...m.banquillo]);
    const disp = Data.disponibles(eventId);
    const libres = disp.filter(p=>!usados.has(p.id));
    const enBanq = disp.filter(p=>m.banquillo.includes(p.id));

    const enc = p => Data.encaje(p.id, pos.pos);
    const ordena = l => l.slice().sort((a,b)=>enc(b).nivel-enc(a).nivel);
    const fila = p => {
      const e = enc(p);
      const cls = e.nivel===3?'t-ok':e.nivel===2?'t-accent':e.nivel===1?'t-info':'t-mute';
      return `<button class="sel" ${p.ocupado?'disabled style="opacity:.45"':''}
        onclick="${p.ocupado?'':`Match.asignar('${eventId}','${posId}','${p.id}')`}">
        ${ava(p.nombre, p.lesionado||p.ocupado?'warn':'')}
        <div class="row-b"><b>${esc(p.nombre)}</b>
          <span>${this.etiquetasPos(p)}${p.origen?' · de '+esc(p.origen.nombre):''}</span></div>
        <div class="row-e" style="gap:3px">
          ${tag(e.t, cls)}
          ${p.ocupado?tag('Ocupado','t-bad'):p.lesionado?tag('Lesionado','t-bad'):''}
        </div>
      </button>`;
    };

    sheet(pos.n+' · '+pos.t, `
      <p class="tiny" style="margin:-4px 0 14px">${esc(pos.linea)} · ${esc(pos.desc)}</p>
      ${actual ? `<div class="panel" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:11px">
          ${ava(Data.player(actual)?.nombre||'')}
          <div style="flex:1"><b>${esc(Data.player(actual)?.nombre||'')}</b>
            <div class="tiny">Ocupa esta posición</div></div>
          <button class="btn btn-2 btn-sm"
            onclick="Data.vaciarHueco('${eventId}','${posId}');closeSheet();Shell.render()">
            Quitar</button>
        </div></div>`:''}
      ${libres.length?`<div class="t-sec">Disponibles · por encaje</div>
        <div class="rows">${ordena(libres).map(fila).join('')}</div>`:''}
      ${enBanq.length?`<div class="t-sec">En el banquillo</div>
        <div class="rows">${ordena(enBanq).map(fila).join('')}</div>`:''}
      ${!libres.length && !enBanq.length
        ? hint('No queda nadie por colocar.','warn') : ''}`);
  },
  asignar(eventId, posId, pid){
    try{ Data.ponerTitular(eventId, posId, pid); closeSheet(); Shell.render(); }
    catch(e){ toast(e.message); }
  },
  quitar(eventId, pid){ Data.sacarDeConvocatoria(eventId,pid); Shell.render(); },
  auto(eventId){ Data.autoAlinear(eventId); toast('Alineación propuesta'); Shell.render(); },
  vaciar(eventId){
    const m = Data.ensureMatch(eventId);
    m.titulares = {}; m.banquillo = []; Data.saveMatch(); Shell.render();
  },
  formacion(eventId, f){
    Data.cambiarFormacion(eventId, +f);
    toast('Formación '+FORMACIONES[+f].nombre); Shell.render();
  },

  /* ═══════════════ EN JUEGO ═══════════════ */
  juego(eventId, m){
    const poss = HUECOS(m.formacion);
    const campo = Object.values(m.titulares).filter(Boolean);
    const min = Data.minutoActual(m);
    const sancion = pid => m.acciones.find(a=>a.tipo==='tarjeta' &&
      a.player===pid && a.color==='roja');

    if(m.estado==='previo' && campo.length===0){
      return blank(I.ball(24),'Sin alineación',
        'Coloca a los jugadores en el campo antes de empezar el partido.',
        `<button class="btn btn-2" onclick="S.mTab='alineacion';Shell.render()">
          Ir a la alineación</button>`);
    }

    return `
    <div class="clock">
      ${m.estado==='previo' ? `
        <button class="btn btn-accent" onclick="Match.reloj('${eventId}','arrancar')">
          ${I.clock(18)} Empezar el partido</button>`
      : m.estado==='jugando' ? `
        <div class="btns">
          <button class="btn btn-2" onclick="Match.reloj('${eventId}','pausa')">
            Pausar</button>
          <button class="btn" onclick="Match.reloj('${eventId}','fin')">
            ${m.parte===1?'Final de la primera parte':'Finalizar partido'}</button>
        </div>`
      : m.estado==='descanso' ? `
        <button class="btn btn-accent" onclick="Match.reloj('${eventId}','arrancar')">
          Empezar la segunda parte</button>`
      : m.estado==='pausa' ? `
        <button class="btn btn-accent" onclick="Match.reloj('${eventId}','arrancar')">
          Reanudar</button>`
      : hint('Partido finalizado. Revisa el resumen.','ok')}
      ${m.estado!=='previo' && m.estado!=='final' ? `
        <button class="btn btn-text" onclick="Match.corregirMinuto('${eventId}')">
          Corregir el minuto (${min}')</button>`:''}
    </div>

    ${m.estado!=='previo' && m.estado!=='final' ? `
    <div class="quick">
      <button onclick="Match.anotar('${eventId}',false)">
        <span class="q-ic">${I.ball(20)}</span>Punto nuestro</button>
      <button onclick="Match.anotar('${eventId}',true)">
        <span class="q-ic">${I.shield(20)}</span>Punto rival</button>
      <button onclick="Match.cambio('${eventId}')">
        <span class="q-ic">${I.swap(20)}</span>Cambio</button>
      <button onclick="Match.tarjeta('${eventId}')">
        <span class="q-ic">${I.warn(20)}</span>Tarjeta</button>
    </div>`:''}

    <div class="t-sec">En el campo · ${campo.length}</div>
    <div class="rows">${poss.map(pos=>{
      const pid = m.titulares[pos.id];
      if(!pid) return '';
      const p = Data.player(pid);
      const roja = sancion(pid);
      const amar = m.acciones.find(a=>a.tipo==='tarjeta' && a.player===pid && a.color==='amarilla');
      return `<button class="row" onclick="Match.jugador('${eventId}','${pid}')">
        <span class="dorsal">${pos.n}</span>
        <div class="row-b"><b>${esc(p?p.nombre:'—')}</b>
          <span>${esc(pos.t)}</span></div>
        <div class="row-e" style="flex-direction:row;gap:5px;align-items:center">
          ${roja?tag('Roja','t-bad'):amar?tag('Amarilla','t-warn'):''}
          ${m.estado==='jugando'?`<span class="mini-sw">${I.swap(15)}</span>`:''}
        </div>
      </button>`;
    }).join('')}</div>

    <div class="t-sec">Banquillo · ${m.banquillo.length}</div>
    ${m.banquillo.length ? `<div class="rows">${m.banquillo.map(pid=>{
      const p = Data.player(pid);
      const mins = Data.minutosJugados(eventId).find(x=>x.player_id===pid);
      return `<div class="row">${ava(p?p.nombre:'')}
        <div class="row-b"><b>${esc(p?p.nombre:'—')}</b>
          <span>${mins&&mins.minutos?'Ha jugado '+mins.minutos+"'":'Sin jugar'}</span></div>
      </div>`;
    }).join('')}</div>` : `<p class="tiny">Banquillo vacío.</p>`}

    ${m.acciones.length ? `<div class="t-sec">Lo que va pasando</div>
      ${this.timeline(eventId, m, true)}`:''}`;
  },

  reloj(eventId, accion){
    if(accion==='arrancar') Data.arrancar(eventId);
    if(accion==='pausa') Data.reanudarPausa(eventId);
    if(accion==='fin'){
      const m = Data.match(eventId);
      if(m.parte===1){ Data.pausar(eventId); toast('Descanso'); }
      else confirmSheet('Finalizar el partido',
        'Se cerrará el acta y se calcularán los minutos de cada jugador. '+
        'Podrás seguir corrigiendo la cronología.','Finalizar',
        ()=>{ Data.pausar(eventId); S.mTab='resumen'; Shell.render(); }, false);
      Shell.render(); return;
    }
    Shell.render();
  },
  corregirMinuto(eventId){
    const m = Data.match(eventId);
    sheet('Corregir el minuto', `
      ${hint('Útil si el árbitro ha parado el reloj o si has empezado tarde.')}
      <div class="f"><label for="cmM">Minuto actual</label>
        <input class="in" id="cmM" type="number" min="0" max="120"
          value="${Data.minutoActual(m)}"></div>
      <button class="btn" onclick="Match.guardarMinuto('${eventId}')">Guardar</button>`);
  },
  guardarMinuto(eventId){
    Data.ajustarMinuto(eventId, +val('cmM')||0);
    closeSheet(); Shell.render();
  },

  /* ---------------- anotar puntos ---------------- */
  anotar(eventId, contra){
    S.pt = null;
    sheet(contra?'Punto del rival':'Punto nuestro', `
      <div class="t-sec">¿Qué ha sido?</div>
      <div class="grid-opts">${PUNTOS.map(p=>`
        <button class="opt" onclick="Match.elegirPunto('${eventId}','${p.clase}',${contra})">
          <span class="o-ic">${I[p.ic](20)}</span>
          <b>${p.t}</b><span>${p.v} puntos</span>
        </button>`).join('')}</div>`);
  },
  elegirPunto(eventId, clase, contra){
    const P = PUNTOS.find(x=>x.clase===clase);
    if(contra){
      Data.addAccion(eventId,{ tipo:'punto', clase, valor:P.v, contra:true });
      closeSheet(); toast(P.t+' del rival'); Shell.render(); return;
    }
    const m = Data.match(eventId);
    const campo = Object.values(m.titulares).filter(Boolean);
    sheet('¿Quién ha anotado?', `
      <div class="t-sec">${P.t} · ${P.v} puntos</div>
      <div class="rows">${campo.map(pid=>{
        const p = Data.player(pid);
        const pos = Data.posicionDe(eventId,pid);
        return `<button class="sel"
          onclick="Match.guardarPunto('${eventId}','${clase}','${pid}')">
          <span class="dorsal">${pos?pos.n:'-'}</span>
          <div class="row-b"><b>${esc(p?p.nombre:'')}</b>
            <span>${esc(pos?pos.t:'')}</span></div>
        </button>`;
      }).join('')}</div>
      <button class="btn btn-2" style="margin-top:12px"
        onclick="Match.guardarPunto('${eventId}','${clase}','')">
        No anotarlo a nadie</button>`);
  },
  guardarPunto(eventId, clase, pid){
    const P = PUNTOS.find(x=>x.clase===clase);
    Data.addAccion(eventId,{ tipo:'punto', clase, valor:P.v,
      player:pid||null, contra:false });
    closeSheet(); toast(P.t+' anotado'); Shell.render();
  },

  /* ---------------- cambios ---------------- */
  cambio(eventId, saleFijo){
    const m = Data.match(eventId);
    if(!m.banquillo.length){
      sheet('Sin banquillo', hint('No hay nadie en el banquillo para entrar.','warn')+
        `<button class="btn btn-2" onclick="closeSheet()">Entendido</button>`);
      return;
    }
    S.sale = saleFijo || null;
    this.pasoCambio(eventId);
  },
  pasoCambio(eventId){
    const m = Data.match(eventId);
    const poss = HUECOS(m.formacion);
    if(!S.sale){
      sheet('Cambio · ¿quién sale?', `
        <div class="steps"><i class="on"></i><i></i></div>
        <div class="stepn">Paso 1 de 2</div>
        <div class="rows">${poss.map(pos=>{
          const pid = m.titulares[pos.id];
          if(!pid) return '';
          const p = Data.player(pid);
          const mins = Data.minutosJugados(eventId).find(x=>x.player_id===pid);
          return `<button class="sel" onclick="Match.setSale('${eventId}','${pid}')">
            <span class="dorsal">${pos.n}</span>
            <div class="row-b"><b>${esc(p?p.nombre:'')}</b>
              <span>${esc(pos.t)}${mins?' · '+mins.minutos+"' jugados":''}</span></div>
          </button>`;
        }).join('')}</div>`);
      return;
    }
    const sale = Data.player(S.sale);
    const pos = Data.posicionDe(eventId, S.sale);
    sheet('Cambio · ¿quién entra?', `
      <div class="steps"><i class="on"></i><i class="on"></i></div>
      <div class="stepn">Paso 2 de 2</div>
      <div class="sub-out">
        <span class="dorsal">${pos?pos.n:'-'}</span>
        <div><b>Sale ${esc(sale?sale.nombre:'')}</b>
          <div class="tiny">${esc(pos?pos.t:'')}</div></div>
        <button class="btn btn-2 btn-sm" onclick="S.sale=null;Match.pasoCambio('${eventId}')">
          Cambiar</button>
      </div>
      <div class="t-sec">Recambios ordenados por encaje</div>
      <div class="rows">${Data.recambios(eventId, S.sale).map(r=>{
        const e = r.encaje;
        const cls = e.nivel===3?'t-ok':e.nivel===2?'t-accent':e.nivel===1?'t-info':'t-mute';
        return `<button class="sel" onclick="Match.hacerCambio('${eventId}','${r.player.id}')">
          ${ava(r.player.nombre)}
          <div class="row-b"><b>${esc(r.player.nombre)}</b>
            <span>${this.etiquetasPos(r.player)}${
              r.minutos?' · ya jugó '+r.minutos+"'":''}</span></div>
          <div class="row-e">${tag(e.t, cls)}</div>
        </button>`;
      }).join('')}</div>
      ${hint('Se ordenan por quién encaja mejor en el puesto que queda libre.')}`);
  },
  setSale(eventId, pid){ S.sale = pid; this.pasoCambio(eventId); },
  hacerCambio(eventId, entra){
    const sale = S.sale;
    Data.addAccion(eventId,{ tipo:'cambio', sale, entra });
    const pe = Data.player(entra), ps = Data.player(sale);
    S.sale = null; closeSheet();
    toast('Entra '+(pe?pe.nombre.split(' ')[0]:'')+' por '+(ps?ps.nombre.split(' ')[0]:''));
    Shell.render();
  },

  /* ---------------- tarjetas ---------------- */
  tarjeta(eventId, pidFijo){
    const m = Data.match(eventId);
    const campo = Object.values(m.titulares).filter(Boolean);
    if(pidFijo){ S.tj = pidFijo; return this.colorTarjeta(eventId); }
    sheet('Tarjeta · ¿a quién?', `
      <div class="rows">${campo.map(pid=>{
        const p = Data.player(pid);
        const pos = Data.posicionDe(eventId,pid);
        return `<button class="sel" onclick="S.tj='${pid}';Match.colorTarjeta('${eventId}')">
          <span class="dorsal">${pos?pos.n:'-'}</span>
          <div class="row-b"><b>${esc(p?p.nombre:'')}</b>
            <span>${esc(pos?pos.t:'')}</span></div>
        </button>`;
      }).join('')}</div>`);
  },
  colorTarjeta(eventId){
    const p = Data.player(S.tj);
    sheet('Tarjeta a '+(p?p.nombre.split(' ')[0]:''), `
      <div class="grid-opts">
        <button class="opt card-y" onclick="Match.guardarTarjeta('${eventId}','amarilla')">
          <span class="o-ic">${I.warn(20)}</span>
          <b>Amarilla</b><span>10 minutos fuera</span></button>
        <button class="opt card-r" onclick="Match.guardarTarjeta('${eventId}','roja')">
          <span class="o-ic">${I.cross(20)}</span>
          <b>Roja</b><span>Expulsión</span></button>
      </div>`);
  },
  guardarTarjeta(eventId, color){
    Data.addAccion(eventId,{ tipo:'tarjeta', color, player:S.tj });
    const p = Data.player(S.tj); S.tj=null;
    closeSheet(); toast('Tarjeta '+color+' a '+(p?p.nombre.split(' ')[0]:''));
    Shell.render();
  },

  /** Acciones rápidas al tocar a un jugador en el campo. */
  jugador(eventId, pid){
    const m = Data.match(eventId);
    const p = Data.player(pid);
    const pos = Data.posicionDe(eventId,pid);
    const mins = Data.minutosJugados(eventId).find(x=>x.player_id===pid);
    const enJuego = m.estado==='jugando';
    sheet(p?p.nombre:'Jugador', `
      <div class="kv"><span>Posición</span>
        <span>${pos?pos.n+' · '+esc(pos.t):'—'}</span></div>
      <div class="kv"><span>Minutos jugados</span>
        <span>${mins?mins.minutos+"'":'—'}</span></div>
      ${enJuego?`<div class="stack" style="margin-top:16px">
        <button class="btn" onclick="closeSheet();Match.cambio('${eventId}','${pid}')">
          ${I.swap(17)} Sustituir</button>
        <button class="btn btn-2" onclick="closeSheet();Match.tarjeta('${eventId}','${pid}')">
          ${I.warn(17)} Tarjeta</button>
        <button class="btn btn-2"
          onclick="closeSheet();Match.puntoDe('${eventId}','${pid}')">
          ${I.ball(17)} Ha anotado</button>
      </div>`:''}
      <button class="btn btn-text" style="margin-top:8px"
        onclick="closeSheet();Shell.go('ficha',{playerId:'${pid}'})">
        Ver su ficha completa</button>`);
  },
  puntoDe(eventId, pid){
    sheet('¿Qué ha anotado?', `
      <div class="grid-opts">${PUNTOS.map(P=>`
        <button class="opt" onclick="Match.guardarPunto('${eventId}','${P.clase}','${pid}')">
          <span class="o-ic">${I[P.ic](20)}</span>
          <b>${P.t}</b><span>${P.v} puntos</span>
        </button>`).join('')}</div>`);
  },

  /* ═══════════════ CRONOLOGÍA ═══════════════ */
  timeline(eventId, m, compacto){
    if(!m.acciones.length) return `<p class="tiny">Sin acciones registradas.</p>`;
    const lista = compacto ? [...m.acciones].reverse().slice(0,8)
                           : [...m.acciones];
    return `<div class="tl">${lista.map(a=>{
      const p = a.player ? Data.player(a.player) : null;
      let ic, txt, cls='';
      if(a.tipo==='punto'){
        const P = PUNTOS.find(x=>x.clase===a.clase);
        ic = I[P.ic](16);
        txt = `<b>${P.t}${a.contra?' del rival':''}</b>` +
              (p?`<span>${esc(p.nombre)}</span>`:'') +
              `<span class="pts">+${a.valor}</span>`;
        cls = a.contra ? 'against' : 'favor';
      } else if(a.tipo==='cambio'){
        const e = Data.player(a.entra), s = Data.player(a.sale);
        ic = I.swap(16);
        txt = `<b>Cambio</b><span>Entra ${esc(e?e.nombre.split(' ')[0]:'')}
          por ${esc(s?s.nombre.split(' ')[0]:'')}</span>`;
        cls = 'sub';
      } else {
        ic = a.color==='roja' ? I.cross(16) : I.warn(16);
        txt = `<b>Tarjeta ${a.color}</b><span>${esc(p?p.nombre:'')}</span>`;
        cls = a.color==='roja' ? 'red' : 'yellow';
      }
      return `<div class="tl-row ${cls}">
        <span class="tl-min">${a.minuto}'</span>
        <span class="tl-ic">${ic}</span>
        <div class="tl-tx">${txt}</div>
        ${!compacto?`<button class="ibtn"
          onclick="Match.borrar('${eventId}','${a.id}')">${I.trash(16)}</button>`:''}
      </div>`;
    }).join('')}</div>`;
  },
  borrar(eventId, id){
    confirmSheet('Eliminar de la cronología',
      'Se recalcularán el marcador y los minutos jugados.','Eliminar',
      ()=>{ Data.borrarAccion(eventId,id); Shell.render(); });
  },

  /* ═══════════════ RESUMEN ═══════════════ */
  resumen(eventId, m){
    const ev = Data.event(eventId);
    if(m.estado==='previo' && !m.acciones.length){
      return blank(I.chart(24),'Todavía no hay nada que resumir',
        'Cuando empiece el partido se irá construyendo el acta: marcador, '+
        'cronología y minutos de cada jugador.');
    }
    const mins = Data.minutosJugados(eventId);
    const anotadores = {};
    m.acciones.filter(a=>a.tipo==='punto' && a.player && !a.contra).forEach(a=>{
      if(!anotadores[a.player]) anotadores[a.player] = { pts:0, ensayos:0 };
      anotadores[a.player].pts += a.valor;
      if(a.clase==='ensayo') anotadores[a.player].ensayos++;
    });
    const res = m.puntos_favor > m.puntos_contra ? 'Victoria'
              : m.puntos_favor < m.puntos_contra ? 'Derrota' : 'Empate';
    const cls = m.puntos_favor > m.puntos_contra ? 'ok'
              : m.puntos_favor < m.puntos_contra ? 'bad' : '';

    return `
    ${m.estado==='final'
      ? `<div class="box-res ${cls}"><b>${res}</b>
          <span>${m.puntos_favor} – ${m.puntos_contra} frente a ${esc(ev.rival||'rival')}</span></div>`
      : hint('El partido sigue en curso. El resumen se actualiza en directo.')}

    <div class="metrics">
      <div class="metric"><div class="mv">${
        m.acciones.filter(a=>a.tipo==='punto'&&a.clase==='ensayo'&&!a.contra).length}</div>
        <div class="ml">Ensayos</div></div>
      <div class="metric"><div class="mv">${
        m.acciones.filter(a=>a.tipo==='cambio').length}</div>
        <div class="ml">Cambios</div></div>
      <div class="metric ${m.acciones.some(a=>a.tipo==='tarjeta')?'warn':''}">
        <div class="mv">${m.acciones.filter(a=>a.tipo==='tarjeta').length}</div>
        <div class="ml">Tarjetas</div></div>
    </div>

    ${Object.keys(anotadores).length ? `<div class="t-sec">Anotadores</div>
    <div class="rows">${Object.entries(anotadores)
      .sort((a,b)=>b[1].pts-a[1].pts).map(([pid,x])=>{
      const p = Data.player(pid);
      return `<div class="row">${ava(p?p.nombre:'')}
        <div class="row-b"><b>${esc(p?p.nombre:'')}</b>
          <span>${x.ensayos?x.ensayos+(x.ensayos===1?' ensayo':' ensayos'):'Al pie'}</span></div>
        <div class="row-e"><span class="amt">${x.pts} pts</span></div>
      </div>`;
    }).join('')}</div>`:''}

    <div class="t-sec">Cronología</div>
    ${this.timeline(eventId, m, false)}

    <div class="t-sec">Minutos por jugador</div>
    ${mins.length ? `<div class="rows">${mins.map(x=>{
      const p = Data.player(x.player_id);
      const tot = m.duracion_parte*2;
      const pct = tot ? Math.round(x.minutos/tot*100) : 0;
      return `<div class="row">${ava(p?p.nombre:'')}
        <div class="row-b"><b>${esc(p?p.nombre:'—')}</b>
          <span>${x.titular?'Titular':'Suplente'}</span>
          <div class="meter" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>
        <div class="row-e"><span class="amt">${x.minutos}'</span></div>
      </div>`;
    }).join('')}</div>` : `<p class="tiny">Sin minutos registrados.</p>`}

    <div class="t-sec">Acta</div>
    <div class="stack">
      <button class="btn btn-2" onclick="Match.compartir('${eventId}')">
        ${I.megaphone(17)} Publicar el resultado a las familias</button>
      <button class="btn btn-text" onclick="Match.reiniciar('${eventId}')">
        Reiniciar el acta del partido</button>
    </div>`;
  },
  compartir(eventId){
    const m = Data.match(eventId), ev = Data.event(eventId);
    const res = m.puntos_favor>m.puntos_contra ? 'Victoria'
      : m.puntos_favor<m.puntos_contra ? 'Derrota' : 'Empate';
    const ens = m.acciones.filter(a=>a.tipo==='punto'&&a.clase==='ensayo'&&!a.contra)
      .map(a=>Data.player(a.player)).filter(Boolean)
      .map(p=>p.nombre.split(' ')[0]);
    const cuerpo = `${res} por ${m.puntos_favor}-${m.puntos_contra} frente a `+
      `${ev.rival||'el rival'}.` + (ens.length?` Ensayos de ${ens.join(', ')}.`:'');
    sheet('Publicar el resultado', `
      <div class="f"><label for="shT">Título</label>
        <input class="in" id="shT" value="Resultado: ${esc(Data.club().nombre
          .replace('Rugby Club ',''))} ${m.puntos_favor} - ${m.puntos_contra} ${
          esc(ev.rival||'')}"></div>
      <div class="f"><label for="shB">Mensaje</label>
        <textarea class="in" id="shB" rows="3">${esc(cuerpo)}</textarea></div>
      <button class="btn btn-accent" onclick="Match.publicar('${eventId}')">
        Publicar a las familias</button>`);
  },
  publicar(eventId){
    const ev = Data.event(eventId);
    Data.addPost({ team_id:ev.team_id, titulo:val('shT'), cuerpo:val('shB') });
    closeSheet(); toast('Resultado publicado'); Shell.render();
  },
  reiniciar(eventId){
    confirmSheet('Reiniciar el acta',
      'Se borrarán marcador, cronología y minutos. La alineación se conserva.',
      'Reiniciar', ()=>{ Data.reiniciarPartido(eventId); S.mTab='alineacion';
        Shell.render(); });
  }
};
