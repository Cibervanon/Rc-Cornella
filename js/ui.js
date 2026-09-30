/* ============================================================================
   Helpers de presentación
   ============================================================================ */

const $ = s => document.querySelector(s);
/* Tambien escapa la comilla simple: casi todos los onclick del proyecto son
   onclick="Foo('${id}')", asi que un ' sin escapar allow-abriria el atributo. */
const esc = s => String(s==null?'':s)
  .replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val = id => { const e=document.getElementById(id); return e ? e.value.trim() : ''; };
/* Para contrasenas. Un espacio pegado al final forma parte de la credencial:
   recortarlo en silencio cambia la contrasena que la persona cree haber elegido,
   y si contiene solo espacios se quedaria vacia. */
const valp = id => { const e=document.getElementById(id); return e ? e.value : ''; };
const chk = id => { const e=document.getElementById(id); return e ? e.checked : false; };
const eur = n => Number(n||0).toFixed(2).replace('.',',')+' €';
const ini = n => String(n||'?').trim().split(/\s+/).slice(0,2)
  .map(w=>w[0]||'').join('').toUpperCase();

const DIA = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre'];

function hhmm(iso){
  const d = new Date(iso);
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function fechaCorta(iso, conHora=true){
  const d = new Date(iso), h = new Date(); h.setHours(0,0,0,0);
  const dd = new Date(d); dd.setHours(0,0,0,0);
  const n = Math.round((dd-h)/864e5);
  let t;
  if(n===0) t='Hoy'; else if(n===1) t='Mañana'; else if(n===-1) t='Ayer';
  else if(n>1 && n<7) t = DIA[d.getDay()][0].toUpperCase()+DIA[d.getDay()].slice(1);
  else t = d.getDate()+' '+MES[d.getMonth()];
  return conHora ? t+' · '+hhmm(iso) : t;
}
function diasA(iso){ return Math.round((new Date(iso)-new Date())/864e5); }
function edad(fn){
  if(!fn) return null;
  return Math.floor((Date.now()-new Date(fn))/(365.25*864e5));
}

/* ---------- avisos ---------- */
let _toastT;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(_toastT);
  _toastT = setTimeout(()=>t.classList.add('hidden'), 2800);
}
function sheet(titulo, html){
  $('#sheetTitle').textContent = titulo;
  $('#sheetBody').innerHTML = html;
  $('#sheetWrap').classList.remove('hidden');
  const f = $('#sheetBody').querySelector('input,textarea,select');
  if(f && window.innerWidth > 680) setTimeout(()=>f.focus(), 60);
}
function closeSheet(){ $('#sheetWrap').classList.add('hidden'); }
function confirmSheet(titulo, texto, label, onOk, danger=true){
  window.__ok = onOk;
  sheet(titulo, `
    <div class="hint ${danger?'bad':''}">${I.warn(16)}<span>${esc(texto)}</span></div>
    <div class="btns" style="margin-top:16px">
      <button class="btn btn-2" onclick="closeSheet()">Cancelar</button>
      <button class="btn ${danger?'btn-danger':''}"
        onclick="closeSheet();window.__ok&&window.__ok()">${esc(label)}</button>
    </div>`);
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSheet(); });

/* ---------- componentes ---------- */
const RSVP_T = {
  si:{ t:'Va', c:'t-ok' }, no:{ t:'No va', c:'t-bad' },
  duda:{ t:'Duda', c:'t-warn' }, sin_responder:{ t:'Sin responder', c:'t-mute' }
};
const ATT_T = {
  presente:{ t:'Presente', c:'t-ok' }, tarde:{ t:'Tarde', c:'t-warn' },
  justificado:{ t:'Justificado', c:'t-info' }, ausente:{ t:'Ausente', c:'t-bad' }
};
const tag = (t,c) => `<span class="tag ${c}"><i></i>${esc(t)}</span>`;
const tagRsvp = e => tag(RSVP_T[e].t, RSVP_T[e].c);
const tagAtt  = e => tag(ATT_T[e].t, ATT_T[e].c);

const EV_ICON = { entrenamiento:'dumbbell', partido:'ball', torneo:'trophy',
                  reunion:'users', otro:'pin' };
const EV_NOM  = { entrenamiento:'Entrenamiento', partido:'Partido',
                  torneo:'Torneo', reunion:'Reunión', otro:'Evento' };

function evTitulo(e){
  if(e.tipo==='partido' || e.tipo==='torneo')
    return (e.local?'':'Fuera · ') + 'vs ' + esc(e.rival||'rival por confirmar');
  return esc(e.titulo || EV_NOM[e.tipo] || 'Evento');
}
function ava(nombre, cls=''){ return `<div class="ava ${cls}">${esc(ini(nombre))}</div>`; }
function meter(pct, cls=''){
  return `<div class="meter ${cls}"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>`;
}
function hint(txt, kind=''){
  const ic = kind==='bad' ? I.warn(16) : kind==='warn' ? I.warn(16)
           : kind==='ok' ? I.check(16) : I.info(16);
  return `<div class="hint ${kind}">${ic}<span>${txt}</span></div>`;
}
function blank(icon, titulo, texto, accion=''){
  return `<div class="blank"><div class="bi">${icon}</div>
    <b>${esc(titulo)}</b><p>${texto}</p>${accion}</div>`;
}
function score(n){
  let s = '<span class="score">';
  for(let i=1;i<=5;i++) s += `<span style="color:${i<=n?'var(--accent)':'var(--line-2)'}">${I.star(14, i<=n)}</span>`;
  return s + '</span>';
}
function daymark(iso){
  const d = new Date(iso);
  return `<div class="daymark"><b>${d.getDate()}</b><span>${MES[d.getMonth()]}</span></div>`;
}
