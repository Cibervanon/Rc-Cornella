/* ============================================================================
   Pruebas de flujo — se simula cada perfil de principio a fin
   ============================================================================ */

global.localStorage = { _d:{}, getItem(k){return this._d[k]??null},
  setItem(k,v){this._d[k]=String(v)}, removeItem(k){delete this._d[k]} };
const stub = () => ({ innerHTML:'', textContent:'', value:'', checked:false,
  dataset:{}, children:[], classList:{add(){},remove(){},toggle(){},contains(){return false}},
  setAttribute(){}, addEventListener(){}, focus(){}, querySelector:()=>stub(),
  style:{setProperty(){}} });
const FIELDS = {};
global.document = {
  querySelector:()=>stub(),
  getElementById:(id)=> (id in FIELDS)
    ? { value:String(FIELDS[id]??''), checked:!!FIELDS[id], classList:stub().classList }
    : null,
  createElement:()=>stub(), addEventListener(){},
  documentElement:{style:{setProperty(){}}}
};
global.window = { scrollTo(){}, innerWidth:400 };
global.navigator = {};

const fs = require('fs');
const files = ['icons.js','store.js','ui.js','gate.js','coach.js','family.js',
  'match.js','board.js','shell.js'];
const src = files.map(f=>fs.readFileSync(__dirname+'/js/'+f,'utf8')).join('\n');

const RUN = String.raw`
let pass=0, fail=0, sec='';
function S_(t){ sec=t; console.log('\n── '+t); }
function ok(c,m){ if(c){pass++;} else {fail++; console.log('   ✗ '+m);} }
function view(label, fn){
  try{
    const o = fn();
    if(typeof o!=='string' || o.length<40) throw new Error('salida vacía');
    if(/undefined|NaN|\[object Object\]/.test(o)) throw new Error('imprime undefined/NaN');
    if(/<script|onerror=/i.test(o) && !/escapado/.test(o)) { /* ok */ }
    pass++;
  }catch(e){ fail++; console.log('   ✗ render '+label+': '+e.message); }
}
function F(obj){ for(const k in FIELDS) delete FIELDS[k]; Object.assign(FIELDS,obj); }
function allViews(mod, etiqueta){
  mod.nav.forEach(n=>{ S.q=''; view(etiqueta+'/'+n.k, ()=>mod[n.k]()); });
}

/* ═══════════════ 1. ESTADO INICIAL: TODO VACÍO ═══════════════ */
S_('1. Arranque en blanco');
ok(!Data.clubExists(), 'no debe haber club al arrancar');
ok(DB.load().users.length===0, 'no debe haber usuarios precargados');
ok(DB.load().players.length===0, 'no debe haber jugadores precargados');
ok(DB.load().events.length===0, 'no debe haber eventos precargados');
Gate.step=null; view('gate/bienvenida', ()=>Gate.render());

/* ═══════════════ 2. FUNDACIÓN DEL CLUB ═══════════════ */
S_('2. La junta funda el club');
try{ Data.foundClub({ clubNombre:'', userNombre:'X', email:'a@b.es',
  password:'12345678' }); ok(false,'debe exigir nombre de club'); }catch(e){ ok(true); }
try{ Data.foundClub({ clubNombre:'RC', userNombre:'X', email:'malemail',
  password:'12345678' }); ok(false,'debe validar el email'); }catch(e){ ok(true); }
try{ Data.foundClub({ clubNombre:'RC', userNombre:'X', email:'a@b.es',
  password:'123' }); ok(false,'debe exigir 8 caracteres'); }catch(e){ ok(true); }

Data.foundClub({ clubNombre:'Rugby Club Cornellà', ciudad:'Cornellà de Llobregat',
  temporada:'2026-27', userNombre:'Jordi Puig', email:'junta@rcc.cat',
  password:'clave1234', categorias:CAT_PRESET });
ok(Data.clubExists(), 'el club queda creado');
ok(Data.rol()==='junta', 'el fundador es junta');
ok(Data.teams().length===7, 'se crean 7 equipos');
ok(Data.drills().length>0, 'la biblioteca de ejercicios se inicializa');
ok(Data.familyCode().length===6, 'se genera el código de familias');
ok(Data.players().length===0, 'sigue sin jugadores');

try{ Data.foundClub({ clubNombre:'Otro', userNombre:'Y', email:'y@b.es',
  password:'12345678' }); ok(false,'no se puede fundar dos veces'); }catch(e){ ok(true); }

Shell.tab='panel'; S={};
allViews(Board,'junta');

/* ═══════════════ 3. SEGURIDAD DE CÓDIGOS ═══════════════ */
S_('3. Control de acceso por códigos');
const codFam = Data.familyCode();
ok(Data.peekCode(codFam).rol==='familia', 'el código general da rol familia');
ok(!Data.peekCode('ZZZZZZ').ok, 'un código inventado se rechaza');
ok(!Data.peekCode('').ok, 'código vacío se rechaza');
ok(Data.peekCode(codFam.toLowerCase()).ok, 'el código no distingue mayúsculas');

// NADIE puede autoconcederse rol de entrenador
try{
  Data.register({ nombre:'Intruso', email:'intruso@x.es', password:'12345678',
    code:codFam });
  const rolesIntruso = DB.load().members.filter(m=>m.user_id===
    DB.load().users.find(u=>u.email==='intruso@x.es').id).map(m=>m.rol);
  ok(rolesIntruso.length===1 && rolesIntruso[0]==='familia',
    'con código de familia SOLO se obtiene rol familia');
}catch(e){ fail++; console.log('   ✗ '+e.message); }

// registrarse cambia la sesión al nuevo usuario: volvemos a la junta
ok(Data.rol()==='familia', 'tras registrarse, la sesión es del nuevo usuario');
Data.endSession(); Data.login('junta@rcc.cat','clave1234');
ok(Data.rol()==='junta', 'la junta recupera su sesión');

const inv1 = Data.createInvite({ rol:'entrenador', nota:'Francisco', max:1, dias:30 });
ok(inv1.code.length===6, 'la junta genera código de entrenador');
ok(inv1.max===1, 'el código de entrenador es de un solo uso');
ok(!!inv1.caduca, 'el código de entrenador caduca');

// un código caducado no sirve
const caducado = Data.createInvite({ rol:'entrenador', nota:'viejo', max:1, dias:30 });
DB.load().invites.find(i=>i.code===caducado.code).caduca='2020-01-01';
ok(!Data.peekCode(caducado.code).ok, 'un código caducado se rechaza');

/* ═══════════════ 4. ENTRENADOR ═══════════════ */
S_('4. Alta y trabajo del entrenador');
const equipoS16 = Data.teams().find(t=>t.nombre==='Sub-16');
const invCoach = Data.createInvite({ rol:'entrenador', nota:'Fran',
  team_id:equipoS16.id, max:1, dias:30 });

Data.endSession();
Data.register({ nombre:'Francisco Fras', email:'coach@rcc.cat',
  password:'clave1234', code:invCoach.code });
ok(Data.rol()==='entrenador', 'el código de entrenador otorga ese rol');
ok(Data.myTeams().length===1, 'queda asignado a su equipo automáticamente');
ok(Data.myCert(), 'se le crea la ficha de certificado LOPIVI');
ok(Data.myCert().estado==='ausente', 'el certificado arranca como pendiente');

// el código de un solo uso ya no vale
ok(!Data.peekCode(invCoach.code).ok, 'el código de un solo uso se consume');

// email duplicado
try{ Data.register({ nombre:'Otro', email:'coach@rcc.cat', password:'12345678',
  code:codFam }); ok(false,'no debe permitir email duplicado'); }catch(e){ ok(true); }

Shell.tab='hoy'; S={};
allViews(Coach,'entrenador');
S.teamId = equipoS16.id;
ok(Data.teamPlayers(equipoS16.id).length===0, 'la plantilla arranca vacía');
view('entrenador/hoy sin plantilla', ()=>Coach.hoy());
view('entrenador/equipo vacío', ()=>Coach.equipo());

// un entrenador NO puede crear códigos
try{ Data.createInvite({ rol:'entrenador' });
  ok(false,'el entrenador no debe poder generar códigos'); }catch(e){ ok(true); }
// ni emitir cuotas
try{ Data.issueInvoices('octubre 2026');
  ok(false,'el entrenador no debe poder emitir cuotas'); }catch(e){ ok(true); }

/* ═══════════════ 5. FAMILIA ═══════════════ */
S_('5. Alta de familia e inscripción');
Data.endSession();
Data.register({ nombre:'Marta Soler Vidal', email:'marta@correo.es',
  password:'clave1234', tel:'600112233', code:codFam });
ok(Data.rol()==='familia', 'el código general da rol familia');
ok(!!Data.myGuardian(), 'se crea su ficha de tutora');
ok(Data.myPlayers().length===0, 'arranca sin deportistas');

Shell.tab='inicio'; S={};
view('familia/inicio vacío', ()=>Family.inicio());
ok(Family.inicio().includes('Inscribe'), 'el estado vacío guía a inscribir');
allViews(Family,'familia');

const h1 = Data.addPlayer({ nombre:'Nil Soler Vidal', fecha_nac:'2011-04-12',
  team_id:equipoS16.id, talla:'M', posicion:'Centro' });
ok(Data.myPlayers().length===1, 'el primer hijo queda inscrito');
ok(Data.enrollment(h1.id).descuento===0, 'el primer hijo no lleva descuento');

const equipoS12 = Data.teams().find(t=>t.nombre==='Sub-12');
const h2 = Data.addPlayer({ nombre:'Ona Soler Vidal', fecha_nac:'2015-08-03',
  team_id:equipoS12.id, talla:'10' });
ok(Data.myPlayers().length===2, 'segundo hijo inscrito');
ok(Data.enrollment(h2.id).descuento===0.15, 'el segundo hermano lleva 15% de descuento');
ok(Data.siblings(h1.id).length===1, 'se detectan los hermanos');

try{ Data.addPlayer({ nombre:'', team_id:equipoS16.id });
  ok(false,'debe exigir nombre'); }catch(e){ ok(true); }
try{ Data.addPlayer({ nombre:'Sin equipo' });
  ok(false,'debe exigir categoría'); }catch(e){ ok(true); }

S.childId=h1.id;
allViews(Family,'familia con hijos');
ok(Data.pendingDocs(h1.id).length===3, 'quedan 3 documentos por firmar');
Data.sign(h1.id, Data.docs()[0].id);
ok(Data.pendingDocs(h1.id).length===2, 'firmar reduce los pendientes');
Data.sign(h1.id, Data.docs()[0].id);
ok(Data.signatures(h1.id).length===1, 'no se duplica una firma');

// mandato SEPA
try{ Data.signMandate(Data.myGuardian().id,'1234','Marta');
  ok(false,'debe validar el IBAN'); }catch(e){ ok(true); }
Data.signMandate(Data.myGuardian().id,'ES2121001234560123456789','Marta Soler Vidal');
ok(Data.mandate(Data.myGuardian().id).firmado, 'el mandato queda firmado');
ok(!Data.mandate(Data.myGuardian().id).iban.includes('0123456789'),
  'el IBAN se guarda enmascarado');

/* ═══════════════ 6. CICLO COMPLETO DE CONVOCATORIA ═══════════════ */
S_('6. Ciclo de convocatoria y asistencia');
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
S={ teamId:equipoS16.id };
ok(Data.teamPlayers(equipoS16.id).length===1, 'el entrenador ya ve al jugador inscrito');

const futuro = new Date(Date.now()+3*864e5);
const ev = Data.createEvent({ team_id:equipoS16.id, tipo:'partido',
  rival:'UE Santboiana', local:true, inicio:futuro.toISOString(),
  titulo:'Partido', lugar:'Estadi Municipal Pilar Pons',
  notas:'Traer protector bucal' });
ok(Data.tally(ev.id).total===1, 'se genera el RSVP de la plantilla');
ok(Data.tally(ev.id).sin===1, 'arranca en "sin responder"');

try{ Data.createEvent({ tipo:'entrenamiento' });
  ok(false,'debe exigir equipo'); }catch(e){ ok(true); }

const nRec = Data.remind(ev.id);
ok(nRec===1, 'el recordatorio va solo a quien no ha respondido');

// la familia responde
Data.endSession(); Data.login('marta@correo.es','clave1234');
S={ childId:h1.id };
view('familia/inicio con pendiente', ()=>Family.inicio());
ok(Family.inicio().includes('Falta tu respuesta'), 'inicio destaca lo pendiente');
Data.setRsvp(ev.id, h1.id, 'si');
ok(Data.rsvpOf(ev.id,h1.id).estado==='si', 'la respuesta se guarda');
ok(!!Data.rsvpOf(ev.id,h1.id).at, 'se sella la hora de respuesta');
Data.setRsvp(ev.id, h1.id, 'no', 'Examen');
ok(Data.rsvpOf(ev.id,h1.id).motivo==='Examen', 'guarda el motivo del "no"');
Data.setRsvp(ev.id, h1.id, 'si');
ok(Data.tally(ev.id).si===1 && Data.tally(ev.id).sin===0, 'el recuento cuadra');

S={ childId:h1.id, eventId:ev.id, evPid:h1.id };
view('familia/evento', ()=>Family.evento(ev.id,h1.id));

// vuelve el entrenador: convoca y pasa lista
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
S={ teamId:equipoS16.id, eventId:ev.id, evTab:'rsvp', sel:null };
view('entrenador/evento rsvp', ()=>Coach.evento(ev.id));
S.evTab='conv'; view('entrenador/evento convocatoria', ()=>Coach.evento(ev.id));
ok(S.sel && S.sel.has(h1.id), 'preselecciona a quien ha confirmado');
S.evTab='lista'; view('entrenador/evento lista', ()=>Coach.evento(ev.id));

Data.setCallups(ev.id,[h1.id]);
ok(Data.callups(ev.id).length===1, 'la convocatoria se guarda');
Data.setAttendance(ev.id,h1.id,'presente');
ok(Data.attStats(h1.id).pct===100, 'la asistencia se calcula');
Data.setAttendance(ev.id,h1.id,'ausente');
ok(Data.attStats(h1.id).pct===0, 'cambiar el estado recalcula');
ok(Data.attendance(ev.id).length===1, 'no se duplica el registro de asistencia');
Data.setAttendance(ev.id,h1.id,'presente');

/* ═══════════════ 7. PRIVACIDAD ═══════════════ */
S_('7. Privacidad y separación de datos');
// evaluación no compartida
Data.saveEvaluation({ player_id:h1.id, tecnica:4, fisico:3, tactica:4, actitud:5,
  fuerte:'Buena actitud', mejora:'Pase largo', compartida:false });
ok(Data.evaluations(h1.id).length===1, 'el técnico ve su evaluación');
ok(Data.evaluations(h1.id,true).length===0, 'la familia NO ve las no compartidas');
Data.saveEvaluation({ player_id:h1.id, tecnica:4, fisico:4, tactica:4, actitud:5,
  compartida:true });
ok(Data.evaluations(h1.id,true).length===1, 'sí ve las compartidas');

// notas privadas: solo su autor
Data.addNote(h1.id,'Candidato a capitán');
ok(Data.notes(h1.id).length===1, 'el autor ve su nota');
DB.load().notes.push({ id:'nX', player_id:h1.id, autor:'otro_usuario',
  texto:'Nota ajena', at:new Date().toISOString() });
DB.save();
ok(Data.notes(h1.id).length===1, 'NO ve las notas de otro entrenador');
ok(!Data.notes(h1.id).some(n=>n.texto==='Nota ajena'), 'la nota ajena queda oculta');

// la familia no ve notas del técnico
Data.endSession(); Data.login('marta@correo.es','clave1234');
ok(Data.notes(h1.id).length===0, 'la familia no ve ninguna nota privada');
ok(Data.myPlayers().every(p=>['Nil Soler Vidal','Ona Soler Vidal']
  .includes(p.nombre)), 'la familia solo ve a sus hijos');
ok(Data.myPlayers().length===2, 'y solo a los suyos');

// la familia no puede emitir cuotas ni códigos
try{ Data.createInvite({rol:'junta'}); ok(false,'familia no crea códigos'); }
catch(e){ ok(true); }
try{ Data.issueInvoices('x'); ok(false,'familia no emite cuotas'); }catch(e){ ok(true); }

/* ═══════════════ 8. JUGADOR CON CUENTA PROPIA ═══════════════ */
S_('8. Jugador con cuenta propia');
Data.endSession(); Data.login('junta@rcc.cat','clave1234');
const invJug = Data.createInvite({ rol:'familia', nota:'cuenta del jugador', max:1 });
Data.endSession();
Data.register({ nombre:'Nil Soler', email:'nil@correo.es', password:'clave1234',
  code:invJug.code });
// el club vincula su ficha
DB.load().players.find(p=>p.id===h1.id).user_id = Data.ses.userId;
DB.save();
Data.setSession({ ...Data.ses, rol:'jugador' });
ok(Data.myPlayers().length===1, 'el jugador solo se ve a sí mismo');
ok(Data.myPlayers()[0].id===h1.id, 'y es su propia ficha');
S={}; allViews(Family,'jugador');
ok(Family.esJugador(), 'se detecta el perfil de jugador');

/* ═══════════════ 9. TESORERÍA ═══════════════ */
S_('9. Cuotas y estados SEPA');
Data.endSession(); Data.login('junta@rcc.cat','clave1234');
S={};
const emitidos = Data.issueInvoices('octubre 2026');
ok(emitidos===2, 'se emite un recibo por deportista (emitidos: '+emitidos+')');
const facturas = Data.invoices();
const fNil = facturas.find(i=>i.player_id===h1.id);
const fOna = facturas.find(i=>i.player_id===h2.id);
ok(fNil.estado==='en_proceso', 'con mandato firmado el recibo entra en proceso');
ok(Number(fOna.descuento)>0, 'el segundo hermano lleva descuento en el recibo');
ok(Math.abs(fOna.importe-(fOna.base*0.85))<0.02, 'el descuento es del 15%');
const repetidos = Data.issueInvoices('octubre 2026');
ok(repetidos===0, 'no se duplican recibos del mismo periodo');
ok(Object.keys(PAY_T).includes(fNil.estado), 'todo estado tiene etiqueta');
Data.updateInvoice(fNil.id,{ estado:'devuelto', motivo_devolucion:'Saldo insuficiente' });
ok(Data.invoices({estados:['devuelto']}).length===1, 'se filtra por estado');
S.iF='problemas'; view('junta/cuotas', ()=>Board.cuotas());
Data.updateInvoice(fNil.id,{ estado:'en_proceso', motivo_devolucion:null });

/* ═══════════════ 10. LOPIVI Y ASIGNACIONES ═══════════════ */
S_('10. LOPIVI y gestión de personas');
ok(Data.certs().length===1, 'el entrenador aparece en el registro LOPIVI');
ok(Data.certs()[0].estado!=='vigente', 'arranca sin certificado');
Data.updateCert(Data.certs()[0].id,{ estado:'vigente', formacion:true });
ok(Data.certs()[0].estado==='vigente', 'la junta lo puede regularizar');
S.gTab='tecnicos'; view('junta/personas técnicos', ()=>Board.gente());
S.gTab='familias'; view('junta/personas familias', ()=>Board.gente());
S.gTab='codigos';  view('junta/personas códigos', ()=>Board.gente());
view('junta/lopivi', ()=>Board.lopivi());

const invSinEquipo = Data.createInvite({ rol:'entrenador', nota:'Segundo', max:1 });
Data.endSession();
Data.register({ nombre:'Ana Ferrer', email:'ana@rcc.cat', password:'clave1234',
  code:invSinEquipo.code });
ok(Data.myTeams().length===0, 'sin team_id queda sin equipo');
S={}; view('entrenador/sin equipo', ()=>Coach.hoy());
ok(Coach.hoy().includes('Aún no tienes equipo'), 'se le explica qué falta');
Data.endSession(); Data.login('junta@rcc.cat','clave1234');
ok(Data.coachesWithoutTeam().length===1, 'la junta detecta al técnico sin equipo');
const anaId = DB.load().users.find(u=>u.email==='ana@rcc.cat').id;
Data.assignStaff(anaId, Data.teams().find(t=>t.nombre==='Sub-18').id);
ok(Data.coachesWithoutTeam().length===0, 'al asignarlo desaparece del aviso');

/* ═══════════════ 11. LOGIN Y SESIÓN ═══════════════ */
S_('11. Inicio de sesión');
try{ Data.login('noexiste@x.es','clave1234'); ok(false,'email inexistente'); }
catch(e){ ok(true); }
try{ Data.login('junta@rcc.cat','malaclave'); ok(false,'contraseña mala'); }
catch(e){ ok(true); }
const r = Data.login('junta@rcc.cat','clave1234');
ok(r.roles.includes('junta'), 'inicia sesión correctamente');
ok(Data.login('JUNTA@RCC.CAT','clave1234'), 'el email no distingue mayúsculas');
try{ Data.changePassword('mala','nuevaclave123'); ok(false,'valida la actual'); }
catch(e){ ok(true); }
try{ Data.changePassword('clave1234','123'); ok(false,'valida longitud'); }
catch(e){ ok(true); }
Data.changePassword('clave1234','nuevaclave1');
ok(Data.login('junta@rcc.cat','nuevaclave1'), 'la contraseña cambia');

/* ═══════════════ 12. ACCESIBILIDAD Y ANTI-VIBECODE ═══════════════ */
S_('12. Interfaz: accesibilidad y señales de plantilla');
const css = require('fs').readFileSync(__dirname+'/styles.css','utf8');
const js  = files.map(f=>require('fs').readFileSync(__dirname+'/js/'+f,'utf8')).join('');

ok(!/linear-gradient\([^)]*(?:8B5CF6|A855F7|6366F1|purple)/i.test(css),
  'sin gradientes morados de plantilla');
ok(!(css.match(/linear-gradient/g)||[]).length ||
   (css.match(/linear-gradient/g)||[]).length<=1,
  'como mucho un gradiente, y solo de marca');
ok(!/box-shadow:[^;]*0 0 \d+px[^;]*(rgba\(\d+,\s*\d+,\s*255)/i.test(css),
  'sin glows de neón');
const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
ok(!emojiRe.test(js), 'ningún emoji usado como icono de interfaz');
ok(/svg/.test(js), 'la iconografía es SVG');
ok(/min-height:4[4-9]px|min-height:5\d px|min-height:5\dpx/.test(css),
  'áreas táctiles de al menos 44px');
ok(/aria-label/.test(js), 'hay etiquetas accesibles');
ok(/aria-hidden/.test(js), 'los iconos decorativos se ocultan a lectores');
ok(/font-size:16px/.test(css), 'el cuerpo de texto es de 16px');
// una sola familia de acento
const acentos = (css.match(/--accent:#[0-9A-Fa-f]{6}/g)||[]);
ok(acentos.length===1, 'un único color de acento definido');
ok(/#E8590C/i.test(css), 'usa el naranja del escudo del club');
ok(/#121212/i.test(css), 'usa el negro de la equipación del club');
ok(/1931/.test(js), 'recoge el año de fundación del club');
// diseño móvil
ok(/@media\(max-width:400px\)/.test(css), 'hay ajustes para móvil estrecho');
ok(/@media\(max-width:340px\)/.test(css), 'y para pantallas muy pequeñas');
ok(/overflow:hidden|text-overflow:ellipsis/.test(css), 'se controla el desbordamiento');
ok(/flex-wrap:wrap/.test(css), 'los bloques se parten si no caben');
ok(/viewport-fit=cover/.test(require('fs').readFileSync(__dirname+'/index.html','utf8')),
  'la ventana cubre la pantalla completa');
ok(/safe-area-inset-bottom/.test(css), 'respeta la zona segura inferior');
ok(!/width:\s*\d{4,}px/.test(css), 'sin anchos fijos enormes que desborden');
ok(/position:sticky/.test(css), 'la cabecera queda fija');
// modo sin conexión
const sw = require('fs').readFileSync(__dirname+'/sw.js','utf8');
ok(/caches\.open/.test(sw), 'el service worker cachea archivos');
ok(/addAll/.test(sw), 'guarda la lista de archivos de la app');
ok(/skipWaiting/.test(sw), 'se activa sin esperar');
['icons.js','store.js','ui.js','gate.js','coach.js','family.js','match.js',
 'board.js','shell.js'].forEach(f=>
  ok(sw.includes(f), 'el worker cachea '+f));
ok(/offbar/.test(css), 'hay aviso visual de sin conexión');

// iconos de la aplicación, necesarios para el APK
const fs2 = require('fs');
const mf = JSON.parse(fs2.readFileSync(__dirname+'/manifest.json','utf8'));
ok(Array.isArray(mf.icons) && mf.icons.length>=3, 'el manifiesto declara iconos');
ok(mf.icons.some(i=>i.sizes==='192x192'), 'hay icono de 192');
ok(mf.icons.some(i=>i.sizes==='512x512' && i.purpose==='any'), 'hay icono de 512');
ok(mf.icons.some(i=>i.purpose==='maskable'), 'hay icono maskable para Android');
ok(mf.id && mf.scope && mf.start_url, 'el manifiesto tiene id, scope y start_url');
ok(mf.theme_color==='#121212', 'el color de tema es el negro del club');
['icon-192.png','icon-512.png','icon-maskable-512.png','icon-1024.png',
 'apple-touch-icon.png','favicon.png'].forEach(f=>{
  ok(fs2.existsSync(__dirname+'/'+f), 'existe '+f);
  if(fs2.existsSync(__dirname+'/'+f))
    ok(fs2.statSync(__dirname+'/'+f).size>1000, f+' tiene contenido');
});
// cabecera PNG y dimensiones reales
function pngSize(f){
  const b = fs2.readFileSync(__dirname+'/'+f);
  const firma = b.slice(0,8).toString('hex')==='89504e470d0a1a0a';
  return { firma, w:b.readUInt32BE(16), h:b.readUInt32BE(20) };
}
[['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],
 ['icon-1024.png',1024],['apple-touch-icon.png',180]].forEach(([f,px])=>{
  const s2 = pngSize(f);
  ok(s2.firma, f+' es un PNG válido');
  ok(s2.w===px && s2.h===px, f+' mide '+px+'x'+px);
});
const html = fs2.readFileSync(__dirname+'/index.html','utf8');
ok(/apple-touch-icon/.test(html), 'index enlaza el icono de iOS');
ok(/rel="icon"/.test(html), 'index enlaza el favicon');
ok(sw.includes('icon-512.png'), 'el worker cachea los iconos');

/* ═══════════════ 13. ESCAPADO Y ROBUSTEZ ═══════════════ */
S_('13. Robustez');
ok(esc('<script>alert(1)</script>').includes('&lt;'), 'se escapa el HTML');
Data.endSession(); Data.login('marta@correo.es','clave1234');
const malicioso = Data.addPlayer({ nombre:'<img src=x onerror=alert(1)>',
  team_id:equipoS16.id });
S={ childId:malicioso.id };
const salida = Family.progreso();
ok(!salida.includes('<img src=x'), 'el nombre con HTML se escapa en la vista');
ok(salida.includes('&lt;img'), 'aparece escapado');
Data.removePlayer(malicioso.id);
ok(!DB.load().enrollments.some(e=>e.player_id===malicioso.id),
  'dar de baja limpia la inscripción');
ok(!DB.load().links.some(l=>l.player_id===malicioso.id),
  'dar de baja limpia el vínculo familiar');

view('evento inexistente', ()=>Family.evento('no_existe','no_existe'));
view('ficha inexistente', ()=>Coach.ficha('no_existe'));
S={};
ok(Data.attStats('inexistente').pct===null, 'estadística de jugador inexistente');
ok(Data.tally('inexistente').total===0, 'recuento de evento inexistente');

/* ═══════════════ 14. INTEGRIDAD ═══════════════ */
S_('14. Integridad de datos');
const d = DB.load();
ok(d.rsvp.every(r=>d.events.some(e=>e.id===r.event_id)), 'RSVP apunta a eventos reales');
ok(d.enrollments.every(e=>d.players.some(p=>p.id===e.player_id)),
  'inscripciones apuntan a jugadores reales');
ok(d.invoices.every(i=>d.players.some(p=>p.id===i.player_id)),
  'recibos apuntan a jugadores reales');
ok(d.links.every(l=>d.guardians.some(g=>g.id===l.guardian_id)),
  'vínculos apuntan a tutores reales');
ok(d.staff.every(s=>d.teams.some(t=>t.id===s.team_id)),
  'el cuerpo técnico apunta a equipos reales');
ok(d.members.every(m=>d.users.some(u=>u.id===m.user_id)),
  'los permisos apuntan a usuarios reales');
ok(new Set(d.invites.map(i=>i.code)).size===d.invites.length,
  'no hay códigos duplicados');
ok(new Set(d.users.map(u=>u.email)).size===d.users.length,
  'no hay emails duplicados');
const ev2 = d.events[0];
Data.deleteEvent(ev2.id);
ok(!d.rsvp.some(r=>r.event_id===ev2.id), 'borrar evento limpia sus RSVP');
ok(!d.callups.some(c=>c.event_id===ev2.id), 'y sus convocatorias');
ok(!d.attendance.some(a=>a.event_id===ev2.id), 'y su asistencia');

/* ═══════════════ 15. HUECOS CORREGIDOS ═══════════════ */
S_('15. Huecos funcionales corregidos');
Data.endSession(); Data.login('junta@rcc.cat','nuevaclave1');
S={};

// editar ficha
const pTest = Data.players()[0];
Data.updatePlayer(pTest.id,{ posicion:'Apertura', dorsal:10, talla:'L' });
ok(Data.player(pTest.id).posicion==='Apertura', 'se puede editar la ficha');
ok(Data.player(pTest.id).dorsal===10, 'se guarda el dorsal');

// cambiar de categoría
const destino = Data.teams().find(t=>t.nombre==='Sub-18');
const cuotaAntes = Data.enrollment(pTest.id).cuota;
Data.movePlayer(pTest.id, destino.id);
ok(Data.playerTeam(pTest.id).id===destino.id, 'se puede cambiar de categoría');
ok(Data.enrollment(pTest.id).cuota===destino.cat.cuota, 'la cuota se actualiza');
Data.movePlayer(pTest.id, equipoS16.id);

// editar y reprogramar evento
const evEdit = Data.createEvent({ team_id:equipoS16.id, tipo:'entrenamiento',
  inicio:new Date(Date.now()+5*864e5).toISOString(), titulo:'Test edit' });
const confAntes = Data.tally(evEdit.id).total;
Data.updateEvent(evEdit.id,{ lugar:'Otro campo',
  inicio:new Date(Date.now()+6*864e5).toISOString() });
ok(Data.event(evEdit.id).lugar==='Otro campo', 'se puede editar el evento');
ok(Data.tally(evEdit.id).total===confAntes, 'reprogramar conserva las confirmaciones');
const notifAntes = DB.load().notifs.length;
Data.avisarCambioEvento(evEdit.id);
ok(DB.load().notifs.length>notifAntes, 'reprogramar avisa a las familias');

// revocar código
const invRev = Data.createInvite({ rol:'entrenador', nota:'para anular', max:1 });
ok(Data.peekCode(invRev.code).ok, 'el código funciona antes de anular');
Data.revokeInvite(invRev.code);
ok(!Data.peekCode(invRev.code).ok, 'anulado deja de funcionar');
try{ Data.revokeInvite(Data.familyCode());
  ok(false,'no debe poder anularse el código general'); }catch(e){ ok(true); }
const nuevoFam = Data.regenerarCodigoFamilia();
ok(nuevoFam.code!==codFam, 'se regenera el código de familias');
ok(Data.peekCode(nuevoFam.code).rol==='familia', 'el nuevo funciona');

// la junta accede a fichas
S.gTab='depor'; view('junta/deportistas', ()=>Board.gente());
ok(Board.gente().includes(pTest.nombre.split(' ')[0]) ||
   Board.gente().includes('Buscar deportista'), 'la junta lista deportistas');
S={}; view('junta/ficha de jugador', ()=>Coach.ficha(pTest.id));

// exportación
const csv = Data.exportarCSV();
ok(csv.split('\n').length===Data.players().length+1, 'el CSV tiene una fila por jugador');
ok(csv.includes('Nombre'), 'el CSV lleva cabecera');
const json = Data.exportarJSON();
ok(JSON.parse(json).datos.club, 'la copia de seguridad contiene el club');
try{ Data.importarJSON('no es json'); ok(false,'rechaza archivo inválido'); }
catch(e){ ok(true); }
try{ Data.importarJSON('{"datos":{}}'); ok(false,'rechaza json sin club'); }
catch(e){ ok(true); }

/* ═══════════════ 16. DÍA DE PARTIDO ═══════════════ */
S_('16. Día de partido');
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
S={ teamId:equipoS16.id };

// necesitamos plantilla suficiente
Data.endSession(); Data.login('marta@correo.es','clave1234');
const extra=[];
for(let i=0;i<20;i++){
  extra.push(Data.addPlayer({ nombre:'Jugador Prueba '+i, team_id:equipoS16.id,
    posicion:['Pilar','Talonador','Segunda línea','Centro','Ala','Apertura'][i%6] }));
}
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
S={ teamId:equipoS16.id };
ok(Data.teamPlayers(equipoS16.id).length>=18, 'hay plantilla suficiente');

const evP = Data.createEvent({ team_id:equipoS16.id, tipo:'partido',
  rival:'UE Santboiana', local:true, titulo:'Partido',
  inicio:new Date(Date.now()+864e5).toISOString() });
const mt = Data.ensureMatch(evP.id);
ok(!!mt, 'se crea el acta del partido');
ok(mt.estado==='previo', 'arranca en estado previo');
ok([7,15].includes(mt.formacion), 'formación XV o VII según la categoría');
ok(HUECOS(mt.formacion).length===mt.formacion, 'las posiciones cuadran con la formación');
ok(Object.keys(FORMACIONES).length===2, 'solo existen XV y VII');

// alineación automática
Data.autoAlinear(evP.id);
const m2 = Data.match(evP.id);
const enCampo = Object.values(m2.titulares).filter(Boolean);
ok(enCampo.length>0, 'la alineación automática coloca jugadores');
ok(new Set(enCampo).size===enCampo.length, 'nadie aparece dos veces en el campo');
ok(!enCampo.some(pid=>m2.banquillo.includes(pid)),
  'nadie está en campo y banquillo a la vez');

// un jugador solo ocupa un hueco
const poss = POSICIONES(m2.formacion);
const primero = enCampo[0];
Data.ponerTitular(evP.id, poss[poss.length-1].id, primero);
const m3 = Data.match(evP.id);
ok(Object.values(m3.titulares).filter(x=>x===primero).length===1,
  'colocar a alguien lo quita de su hueco anterior');

Data.autoAlinear(evP.id);
S.mTab='alineacion'; view('partido/alineación', ()=>Match.pantalla(evP.id));

// reloj
Data.arrancar(evP.id);
ok(Data.match(evP.id).estado==='jugando', 'el partido arranca');
Data.ajustarMinuto(evP.id, 12);
ok(Data.minutoActual(Data.match(evP.id))>=12, 'se corrige el minuto');
S.mTab='juego'; view('partido/en juego', ()=>Match.pantalla(evP.id));

// puntos
const anotador = Object.values(Data.match(evP.id).titulares).filter(Boolean)[0];
Data.addAccion(evP.id,{ tipo:'punto', clase:'ensayo', valor:5, player:anotador });
ok(Data.match(evP.id).puntos_favor===5, 'el ensayo suma 5');
Data.addAccion(evP.id,{ tipo:'punto', clase:'conversion', valor:2, player:anotador });
ok(Data.match(evP.id).puntos_favor===7, 'la transformación suma 2');
Data.addAccion(evP.id,{ tipo:'punto', clase:'penal', valor:3, contra:true });
ok(Data.match(evP.id).puntos_contra===3, 'el rival también suma');

// cambio con minuto
const mm = Data.match(evP.id);
const sale = Object.values(mm.titulares).filter(Boolean)[0];
const entra = mm.banquillo[0];
ok(!!entra, 'hay alguien en el banquillo');
Data.ajustarMinuto(evP.id, 20);
Data.addAccion(evP.id,{ tipo:'cambio', sale, entra, minuto:20 });
const m4 = Data.match(evP.id);
ok(Object.values(m4.titulares).includes(entra), 'el que entra pasa al campo');
ok(!Object.values(m4.titulares).includes(sale), 'el que sale deja el campo');
ok(m4.banquillo.includes(sale), 'el que sale va al banquillo');
ok(!m4.banquillo.includes(entra), 'el que entra deja el banquillo');
ok(m4.acciones.some(a=>a.tipo==='cambio'&&a.minuto===20), 'el cambio guarda el minuto');

// minutos jugados
Data.ajustarMinuto(evP.id, 35);
const minutos = Data.minutosJugados(evP.id);
const mSale = minutos.find(x=>x.player_id===sale);
const mEntra = minutos.find(x=>x.player_id===entra);
ok(mSale && mSale.minutos===20, 'el sustituido acumula hasta su minuto ('+
  (mSale?mSale.minutos:'?')+')');
ok(mSale.titular===true, 'consta como titular');
ok(mEntra && mEntra.minutos>0, 'el que entra acumula desde su minuto');
ok(mEntra.titular===false, 'consta como suplente');
ok(minutos.every(x=>x.minutos>=0), 'ningún minuto negativo');

// tarjetas
Data.addAccion(evP.id,{ tipo:'tarjeta', color:'amarilla', player:entra, minuto:30 });
ok(Data.match(evP.id).acciones.some(a=>a.tipo==='tarjeta'), 'se registra la tarjeta');

// deshacer
const accPunto = Data.match(evP.id).acciones.find(a=>a.clase==='ensayo');
Data.borrarAccion(evP.id, accPunto.id);
ok(Data.match(evP.id).puntos_favor===2, 'borrar un punto recalcula el marcador');
Data.addAccion(evP.id,{ tipo:'punto', clase:'ensayo', valor:5, player:anotador, minuto:10 });

const accCambio = Data.match(evP.id).acciones.find(a=>a.tipo==='cambio');
Data.borrarAccion(evP.id, accCambio.id);
const m5 = Data.match(evP.id);
ok(Object.values(m5.titulares).includes(sale), 'deshacer un cambio devuelve al titular');
ok(m5.banquillo.includes(entra), 'y al suplente al banquillo');
Data.addAccion(evP.id,{ tipo:'cambio', sale, entra, minuto:20 });

// descanso y final
Data.pausar(evP.id);
ok(Data.match(evP.id).estado==='descanso', 'primera parte cerrada');
Data.arrancar(evP.id);
ok(Data.match(evP.id).parte===2, 'arranca la segunda parte');
Data.pausar(evP.id);
ok(Data.match(evP.id).estado==='final', 'el partido finaliza');
S.mTab='resumen'; view('partido/resumen', ()=>Match.pantalla(evP.id));

// resumen de temporada
const rt = Data.resumenTemporada(equipoS16.id);
ok(rt.partidos===1, 'cuenta un partido finalizado');
ok(rt.jugadores[anotador] && rt.jugadores[anotador].ensayos===1,
  'acumula ensayos por jugador');
ok(rt.jugadores[anotador].puntos>=5, 'acumula puntos');

// la familia ve el resumen pero no lo edita
Data.endSession(); Data.login('marta@correo.es','clave1234');
S={ childId:h1.id };
view('familia/resumen partido', ()=>Family.resumenPartido(evP.id));
ok(!Family.resumenPartido(evP.id).includes('Match.borrar'),
  'la familia no puede editar la cronología');

// cambio de formación conserva gente
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
S={ teamId:equipoS16.id };
const evF = Data.createEvent({ team_id:equipoS16.id, tipo:'partido', rival:'X',
  inicio:new Date(Date.now()+2*864e5).toISOString() });
Data.cambiarFormacion(evF.id, 15);
Data.autoAlinear(evF.id);
const antes = Object.values(Data.match(evF.id).titulares).filter(Boolean).length +
  Data.match(evF.id).banquillo.length;
Data.cambiarFormacion(evF.id, 7);
const desp = Object.values(Data.match(evF.id).titulares).filter(Boolean).length +
  Data.match(evF.id).banquillo.length;
ok(antes===desp, 'cambiar de formación no pierde jugadores ('+antes+'→'+desp+')');
ok(Object.values(Data.match(evF.id).titulares).filter(Boolean).length<=7,
  'no quedan más titulares que la formación');

/* ═══════════════ 16b. POSICIONES Y ETIQUETAS ═══════════════ */
S_('16b. Posiciones de rugby');
// numeración oficial
ok(POS_CAT.length===15, 'hay 15 puestos canónicos');
ok(POS_CAT.filter(p=>p.g==='delantera').length===8, '8 delanteros');
ok(POS_CAT.filter(p=>p.g==='trescuartos').length===7, '7 tres cuartos');
POS_CAT.forEach((c,i)=>ok(c.n===i+1, 'el puesto '+(i+1)+' lleva su número'));
ok(POS('talon').n===2, 'el talonador es el 2');
ok(POS('medio').n===9, 'el medio melé es el 9');
ok(POS('apertura').n===10, 'la apertura es el 10');
ok(POS('ala_izq').n===11 && POS('ala_der').n===14, 'las alas son 11 y 14');
ok(POS('centro_1').n===12 && POS('centro_2').n===13, 'los centros son 12 y 13');
ok(POS('zaguero').n===15, 'el zaguero es el 15');
ok(POS_CAT.filter(p=>p.linea==='Primera línea').length===3, '3 en primera línea');
ok(POS_CAT.filter(p=>p.linea==='Tercera línea').length===3, '3 en tercera línea');
// XV
const h15 = HUECOS(15);
ok(h15.length===15, 'el XV tiene 15 huecos');
ok(new Set(h15.map(h=>h.n)).size===15, 'dorsales del 1 al 15 sin repetir');
ok(h15.filter(h=>h.g==='delantera').length===8, 'el XV alinea 8 delanteros');
ok(h15.every(h=>h.x>=0&&h.x<=100&&h.y>=0&&h.y<=100), 'coordenadas dentro del campo');
// delantera abajo, línea arriba
const yFw = h15.filter(h=>h.g==='delantera').map(h=>h.y);
const yBk = h15.filter(h=>h.g==='trescuartos').map(h=>h.y);
ok(Math.min(...yFw) > Math.max(...yBk) - 20, 'la delantera queda por detrás de la línea');
// VII: 3 delanteros y 4 tres cuartos
const h7 = HUECOS(7);
ok(h7.length===7, 'el VII tiene 7 huecos');
ok(h7.filter(h=>h.g==='delantera').length===3, 'sevens: 3 delanteros');
ok(h7.filter(h=>h.g==='trescuartos').length===4, 'sevens: 4 tres cuartos');
ok(h7.filter(h=>h.pos==='pilar_i'||h.pos==='pilar_d').length===2, 'sevens: 2 pilares');
ok(h7.some(h=>h.pos==='talon'), 'sevens: un talonador');
ok(['medio','apertura','centro_1','ala_der'].every(id=>h7.some(h=>h.pos===id)),
  'sevens: medio, apertura, centro y ala');
ok(!h7.some(h=>h.pos==='zaguero'), 'sevens no lleva zaguero');
ok(new Set(h7.map(h=>h.n)).size===7, 'sevens numera del 1 al 7 sin repetir');

// etiquetado y encaje
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
S={ teamId:equipoS16.id };
const jt = Data.teamPlayers(equipoS16.id);
Data.setPosiciones(jt[0].id, ['talon','pilar_i']);
ok(Data.posicionesDe(jt[0].id).length===2, 'se guardan varios puestos');
ok(Data.grupoDe(jt[0].id)==='delantera', 'se deduce el grupo');
Data.setPosiciones(jt[1].id, ['apertura']);
ok(Data.grupoDe(jt[1].id)==='trescuartos', 'apertura es tres cuartos');
ok(Data.encaje(jt[0].id,'talon').nivel===3, 'encaje exacto');
ok(Data.encaje(jt[0].id,'pilar_d').nivel===2, 'misma línea');
ok(Data.encaje(jt[0].id,'octavo').nivel===1, 'mismo grupo');
ok(Data.encaje(jt[0].id,'zaguero').nivel===0, 'fuera de puesto');
ok(Data.encaje(jt[2].id,'talon').nivel===0, 'sin etiquetar no encaja');
Data.setPosiciones(jt[0].id, ['talon','pilar_i','octavo','segunda_i','medio']);
ok(Data.posicionesDe(jt[0].id).length===4, 'máximo cuatro puestos');

// alineación automática respeta el puesto
const evPos = Data.createEvent({ team_id:equipoS16.id, tipo:'partido', rival:'Y',
  inicio:new Date(Date.now()+4*864e5).toISOString() });
Data.cambiarFormacion(evPos.id, 15);
Data.autoAlinear(evPos.id);
const mPos = Data.match(evPos.id);
ok(mPos.titulares['talon']===jt[0].id || Data.encaje(mPos.titulares['talon'],'talon').nivel>=2,
  'el talonador etiquetado va al 2');
ok(mPos.titulares['apertura']===jt[1].id, 'la apertura etiquetada va al 10');

// recambios ordenados por encaje
const titTalon = mPos.titulares['talon'];
const rec = Data.recambios(evPos.id, titTalon);
ok(Array.isArray(rec), 'devuelve lista de recambios');
if(rec.length>1) ok(rec[0].encaje.nivel>=rec[rec.length-1].encaje.nivel,
  'los recambios van del que mejor encaja al que peor');

/* ═══════════════ 16c. DATOS FÍSICOS Y CLASIFICACIONES ═══════════════ */
S_('16c. Físico, marcas y clasificaciones');
Data.updatePlayer(jt[0].id,{ peso:78, altura:180, pie:'Derecho' });
ok(Data.player(jt[0].id).peso===78, 'se guarda el peso');
// catálogo de pruebas editable
ok(Data.pruebas().length===6, 'el club arranca con 6 pruebas propuestas');
ok(Data.prueba('sprint40').menorMejor===true, 'el sprint está marcado como menor mejor');
ok(Data.prueba('banca').menorMejor===false, 'la banca no');

Data.setMarca(jt[0].id,'banca',85);
Data.setMarca(jt[1].id,'banca',70);
Data.setMarca(jt[0].id,'sprint40',5.4);
Data.setMarca(jt[1].id,'sprint40',5.1);
ok(Data.marcas(jt[0].id).banca.valor===85, 'se guarda la marca');
ok(Data.marcas(jt[0].id).banca.fecha, 'la marca lleva fecha');
const rkB = Data.rankingMarca(equipoS16.id,'banca');
ok(rkB[0].p.id===jt[0].id, 'en banca gana el de más kilos');
const rkS = Data.rankingMarca(equipoS16.id,'sprint40');
ok(rkS[0].p.id===jt[1].id, 'en sprint gana el de menos tiempo');

// histórico al mejorar
Data.setMarca(jt[0].id,'banca',92);
ok(Data.marcas(jt[0].id).banca.valor===92, 'se actualiza la marca');
ok(Data.historicoMarca(jt[0].id,'banca').length===2, 'se conserva el registro anterior');
ok(Data.historicoMarca(jt[0].id,'banca')[1].valor===85, 'el anterior era 85');

// solo se listan las pruebas con marca
ok(Data.marcasDe(jt[0].id).length===2, 'el jugador tiene 2 marcas registradas');
ok(Data.marcasDe(jt[2].id).length===0, 'quien no tiene marcas no lista ninguna');

// quitar una marca de un jugador sin tocar la prueba
Data.setMarca(jt[0].id,'banca',null);
ok(!Data.marcas(jt[0].id).banca, 'se puede quitar la marca de un jugador');
ok(!!Data.prueba('banca'), 'la prueba sigue existiendo para el resto');
ok(Data.rankingMarca(equipoS16.id,'banca').length===1, 'el ranking se recalcula');

// crear prueba propia
const nueva = Data.addPrueba({ t:'Salto vertical', u:'cm', menorMejor:false });
ok(Data.pruebas().length===7, 'se añade la prueba propia');
ok(nueva.propia===true, 'queda marcada como propia');
try{ Data.addPrueba({ t:'salto vertical', u:'cm' });
  ok(false,'no debe permitir nombres duplicados'); }catch(e){ ok(true); }
try{ Data.addPrueba({ t:'   ', u:'cm' }); ok(false,'exige nombre'); }catch(e){ ok(true); }
Data.setMarca(jt[0].id, nueva.id, 58);
ok(Data.marcas(jt[0].id)[nueva.id].valor===58, 'se registra marca en la prueba propia');
ok(Data.usoPrueba(nueva.id)===1, 'cuenta cuántos la usan');

// editar prueba
Data.updatePrueba(nueva.id,{ t:'Salto con contramovimiento', u:'cm' });
ok(Data.prueba(nueva.id).t==='Salto con contramovimiento', 'se renombra la prueba');
ok(Data.marcas(jt[0].id)[nueva.id].valor===58, 'la marca se conserva al renombrar');
try{ Data.updatePrueba(nueva.id,{ t:'' }); ok(false,'no acepta nombre vacío'); }
catch(e){ ok(true); }
try{ Data.updatePrueba(nueva.id,{ t:'Press banca' }); ok(false,'ni duplicados'); }
catch(e){ ok(true); }
// cambiar el criterio recalcula el ranking
Data.setMarca(jt[1].id, nueva.id, 40);
ok(Data.rankingMarca(equipoS16.id,nueva.id)[0].p.id===jt[0].id, 'gana el salto más alto');
Data.updatePrueba(nueva.id,{ menorMejor:true });
ok(Data.rankingMarca(equipoS16.id,nueva.id)[0].p.id===jt[1].id,
  'al invertir el criterio cambia el ranking');
Data.updatePrueba(nueva.id,{ menorMejor:false });

// reordenar
const ordAntes = Data.pruebas().map(x=>x.id);
Data.moverPrueba(ordAntes[1], -1);
ok(Data.pruebas()[0].id===ordAntes[1], 'se puede reordenar la lista');
Data.moverPrueba(ordAntes[1], 1);

// borrar una prueba borra sus marcas
const usoAntes = Data.usoPrueba(nueva.id);
ok(usoAntes===2, 'dos jugadores tienen marca en la prueba propia');
Data.removePrueba(nueva.id);
ok(!Data.prueba(nueva.id), 'la prueba se borra');
ok(!Data.marcas(jt[0].id)[nueva.id], 'y se limpian las marcas de los jugadores');
ok(Data.pruebas().length===6, 'vuelve a haber 6 pruebas');
try{ Data.setMarca(jt[0].id, nueva.id, 50);
  ok(false,'no deja registrar en una prueba borrada'); }catch(e){ ok(true); }
// no se puede vaciar del todo
const copia = Data.pruebas().map(x=>x.id);
copia.slice(0,5).forEach(id=>Data.removePrueba(id));
ok(Data.pruebas().length===1, 'queda una sola prueba');
try{ Data.removePrueba(Data.pruebas()[0].id);
  ok(false,'debe quedar al menos una prueba'); }catch(e){ ok(true); }
// restaurar para el resto de pruebas
PRUEBAS_SEMILLA.forEach(x=>{ if(!Data.prueba(x.id)) DB.load().pruebas.push({...x}); });
DB.save();
// validación de valores
try{ Data.setMarca(jt[0].id,'banca',-5); ok(false,'rechaza negativos'); }catch(e){ ok(true); }
try{ Data.setMarca(jt[0].id,'banca','abc'); ok(false,'rechaza texto'); }catch(e){ ok(true); }

const tabla = Data.tablaEquipo(equipoS16.id);
ok(tabla.length===Data.teamPlayers(equipoS16.id).length, 'la tabla cubre la plantilla');
ok(tabla.every(x=>x.player && typeof x.minutos==='number'), 'la tabla está completa');
const clas = Data.clasificaciones(equipoS16.id);
ok(Array.isArray(clas), 'devuelve clasificaciones');
clas.forEach(c=>{
  ok(c.lista.length<=10, 'cada clasificación muestra como mucho 10');
  for(let i=1;i<c.lista.length;i++)
    ok(c.lista[i-1][c.id] >= c.lista[i][c.id], c.t+' va de mayor a menor');
});
const se = Data.statsEquipo(equipoS16.id);
ok(se.partidos>=1, 'cuenta los partidos jugados');
ok(se.ganados+se.empatados+se.perdidos===se.partidos, 'el balance cuadra');
ok(se.dif===se.pf-se.pc, 'la diferencia de puntos cuadra');
ok(se.delanteros+se.linea<=se.plantilla, 'el reparto por grupo es coherente');
const cob = Data.coberturaPuestos(equipoS16.id,15);
ok(cob.length===15, 'la cobertura revisa los 15 puestos');
ok(cob.every(c=>c.aptos>=c.exactos), 'los aptos incluyen a los especialistas');
S.eqTab='plantilla'; view('entrenador/plantilla', ()=>Coach.equipo());
S.eqTab='rank';      view('entrenador/clasificaciones', ()=>Coach.equipo());
S.eqTab='stats';     view('entrenador/estadísticas', ()=>Coach.equipo());
S={ teamId:equipoS16.id, fTab:'fisico' };
view('entrenador/ficha físico', ()=>Coach.ficha(jt[0].id));
S.fTab='resumen'; view('entrenador/ficha resumen', ()=>Coach.ficha(jt[0].id));

/* ═══════════════ 16d. GRUPOS A Y B ═══════════════ */
S_('16d. Grupos A y B de una categoría');
Data.endSession(); Data.login('junta@rcc.cat','nuevaclave1');
S={};
const catS16 = Data.categories().find(c=>c.nombre==='Sub-16');
const grupoB = Data.addTeam(catS16.id,'B');
ok(Data.teams().filter(t=>t.cat_id===catS16.id).length===2, 'la categoría tiene dos grupos');
ok(Data.team(equipoS16.id).nivel==='A', 'el grupo original pasa a ser A');
ok(grupoB.nombre==='Sub-16 B', 'el nuevo se llama Sub-16 B');
try{ Data.addTeam(catS16.id,'B'); ok(false,'no debe duplicar el grupo B'); }
catch(e){ ok(true); }
try{ Data.addTeam(catS16.id,''); ok(false,'exige letra'); }catch(e){ ok(true); }
ok(Data.hermanos(equipoS16.id).length===1, 'A reconoce a su hermano B');
ok(Data.hermanos(grupoB.id)[0].id===equipoS16.id, 'y B reconoce a A');

// bajar un jugador al B
const bajado = Data.teamPlayers(equipoS16.id)[0];
const nA = Data.teamPlayers(equipoS16.id).length;
Data.moverGrupo(bajado.id, grupoB.id);
ok(Data.playerTeam(bajado.id).id===grupoB.id, 'el jugador baja al grupo B');
ok(Data.teamPlayers(equipoS16.id).length===nA-1, 'sale del A');
ok(Data.teamPlayers(grupoB.id).length===1, 'entra en el B');
ok(Data.attStats(bajado.id).total>=0, 'conserva su historial');
try{ Data.moverGrupo(bajado.id, Data.teams().find(t=>t.nombre==='Sub-18').id);
  ok(false,'no permite saltar de categoría con moverGrupo'); }catch(e){ ok(true); }

// el A ve al del B como disponible para convocar
const evAB = Data.createEvent({ team_id:equipoS16.id, tipo:'partido', rival:'Z',
  inicio:new Date(Date.now()+7*864e5).toISOString() });
const dispAB = Data.disponibles(evAB.id);
ok(dispAB.some(p=>p.id===bajado.id && p.origen && p.origen.id===grupoB.id),
  'el jugador del B aparece disponible marcado con su grupo');
ok(Data.plantelAmpliado(equipoS16.id).length===
   Data.teamPlayers(equipoS16.id).length+Data.teamPlayers(grupoB.id).length,
  'el plantel ampliado suma los dos grupos');

// no se puede convocar a quien ya juega con el otro grupo ese día
const evB = Data.createEvent({ team_id:grupoB.id, tipo:'partido', rival:'W',
  inicio:new Date(Date.now()+7*864e5).toISOString() });
Data.ponerTitular(evB.id, 'talon', bajado.id);
const comp = Data.comprometidos(evAB.id);
ok(comp[bajado.id] && comp[bajado.id].id===grupoB.id,
  'se detecta que ya está comprometido ese día');
try{ Data.ponerTitular(evAB.id,'talon',bajado.id);
  ok(false,'no debe dejar alinearlo en dos equipos el mismo día'); }
catch(e){ ok(true); }
try{ Data.aBanquillo(evAB.id,bajado.id);
  ok(false,'tampoco al banquillo'); }catch(e){ ok(true); }
const dispAB2 = Data.disponibles(evAB.id);
ok(dispAB2.find(p=>p.id===bajado.id).ocupado, 'aparece marcado como ocupado');
// y la alineación automática lo salta
Data.autoAlinear(evAB.id);
ok(!Object.values(Data.match(evAB.id).titulares).includes(bajado.id),
  'la alineación automática no lo coloca');
// devolverlo al A
Data.moverGrupo(bajado.id, equipoS16.id);

/* ═══════════════ 17. CIERRE DE TEMPORADA ═══════════════ */
S_('17. Cierre de temporada');
Data.endSession(); Data.login('junta@rcc.cat','nuevaclave1');
S={};
const prev = Data.previsualizarCierre();
ok(prev.length===Data.players().length, 'previsualiza a todos los deportistas');
ok(prev.some(x=>x.a), 'propone subida de categoría');
const nPlayersAntes = Data.players().length;
const movs = prev.map(x=>({ player_id:x.player.id,
  accion: x.a?'sube':'queda', team_id:x.a?x.a.id:null }));
const res = Data.cerrarTemporada('2027-28', movs);
ok(Data.season().nombre==='2027-28', 'la temporada cambia');
ok(Data.players().length===nPlayersAntes, 'las fichas se conservan');
ok(Data.events().length===0, 'los eventos se vacían');
ok(Data.invoices().length===0, 'los recibos se vacían');
ok((DB.load().matches||[]).length===0, 'los partidos se archivan');
ok(DB.load().historico.length===1, 'queda registro histórico');
ok(res.subidos>0, 'se promocionaron '+res.subidos+' jugadores');

/* ═══════════════ 18. FLUJO COMPLETO DE UN PARTIDO ═══════════════ */
S_('18. Partido completo de principio a fin');
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
// categoría nueva y limpia, para que el flujo no arrastre nada anterior
Data.endSession(); Data.login('junta@rcc.cat','nuevaclave1');
const catF = Data.addCategory('Sub-18 Test', 45);
const eqF = Data.teams().find(t=>t.cat_id===catF.id);
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
Data.assignStaff(Data.ses.userId, eqF.id);
S={ teamId:eqF.id };
ok(Data.teamPlayers(eqF.id).length===0, 'la categoría de prueba arranca vacía');

// 1) plantilla con puestos repartidos
Data.endSession(); Data.login('marta@correo.es','clave1234');
const reparto = ['pilar_i','talon','pilar_d','segunda_i','segunda_d','ala_ciego',
  'ala_abier','octavo','medio','apertura','ala_izq','centro_1','centro_2',
  'ala_der','zaguero','pilar_i','talon','centro_1','ala_der','medio'];
const plantel=[];
reparto.forEach((pos,i)=>{
  plantel.push(Data.addPlayer({ nombre:'Titular '+String(i+1).padStart(2,'0'),
    team_id:eqF.id, posiciones:[pos], peso:70+i, altura:170+i }));
});
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
S={ teamId:eqF.id };
ok(Data.teamPlayers(eqF.id).length===20, 'plantilla de 20 jugadores');
ok(Data.statsEquipo(eqF.id).sinEtiquetar===0, 'todos con puesto asignado');

// 2) se convoca el partido
const P = Data.createEvent({ team_id:eqF.id, tipo:'partido', rival:'UE Santboiana',
  local:true, titulo:'Partido', lugar:'Estadi Municipal Pilar Pons',
  inicio:new Date(Date.now()+864e5).toISOString(),
  convocatoria:new Date(Date.now()+864e5-3600e3).toISOString(),
  notas:'Protector bucal obligatorio' });
ok(Data.tally(P.id).total===20, 'se pide confirmación a los 20');

// 3) responden
Data.rsvpList(P.id).forEach((r,i)=>{
  Data.setRsvp(P.id, r.player_id, i<18?'si':i===18?'duda':'no', i===19?'Lesión':null);
});
const tP = Data.tally(P.id);
ok(tP.si===18 && tP.duda===1 && tP.no===1, 'el recuento de respuestas cuadra');
ok(tP.sin===0, 'no queda nadie sin responder');
ok(Data.remind(P.id)===0, 'no hay a quién recordar');

// 4) alineación
const mP = Data.ensureMatch(P.id);
ok(mP.formacion===15, 'Sub-18 juega a XV');
ok(mP.duracion_parte===35, 'partes de 35 minutos en Sub-18');
Data.autoAlinear(P.id);
const mP2 = Data.match(P.id);
const titul = Object.values(mP2.titulares).filter(Boolean);
ok(titul.length===15, 'quince titulares colocados');
ok(new Set(titul).size===15, 'sin repetidos');
ok(mP2.banquillo.length>0, 'hay banquillo');
ok(!titul.some(id=>mP2.banquillo.includes(id)), 'nadie duplicado entre campo y banquillo');
// el que dijo que no, fuera
const dijoNo = Data.rsvpList(P.id).find(r=>r.estado==='no').player_id;
ok(!titul.includes(dijoNo), 'quien dijo que no va no sale de titular');
// encajes correctos
const buenos = HUECOS(15).filter(h=>{
  const pid = mP2.titulares[h.id];
  return pid && Data.encaje(pid,h.pos).nivel>=2;
}).length;
ok(buenos>=12, 'al menos 12 de 15 en su puesto o su línea (son '+buenos+')');

// 5) arranca el partido
Data.arrancar(P.id);
ok(Data.match(P.id).estado==='jugando', 'el reloj corre');
ok(Data.match(P.id).parte===1, 'primera parte');

// 6) primera parte: ensayo + transformación + penal rival
Data.ajustarMinuto(P.id, 8);
const ala = mP2.titulares['ala_izq'];
Data.addAccion(P.id,{ tipo:'punto', clase:'ensayo', valor:5, player:ala, minuto:8 });
const ap = mP2.titulares['apertura'];
Data.addAccion(P.id,{ tipo:'punto', clase:'conversion', valor:2, player:ap, minuto:9 });
Data.addAccion(P.id,{ tipo:'punto', clase:'penal', valor:3, contra:true, minuto:15 });
ok(Data.match(P.id).puntos_favor===7, '7-0 tras ensayo transformado');
ok(Data.match(P.id).puntos_contra===3, 'el rival lleva 3');

// 7) tarjeta amarilla y cambio en el 25
const terc = mP2.titulares['ala_abier'];
Data.addAccion(P.id,{ tipo:'tarjeta', color:'amarilla', player:terc, minuto:22 });
const recs = Data.recambios(P.id, mP2.titulares['pilar_i']);
ok(recs.length>0, 'hay recambios disponibles para el pilar');
ok(recs[0].encaje.nivel>=recs[recs.length-1].encaje.nivel, 'ordenados por encaje');
const salePilar = mP2.titulares['pilar_i'];
const entraPilar = recs[0].player.id;
Data.addAccion(P.id,{ tipo:'cambio', sale:salePilar, entra:entraPilar, minuto:25 });
ok(Data.match(P.id).titulares['pilar_i']===entraPilar, 'el recambio ocupa el puesto');
ok(Data.match(P.id).banquillo.includes(salePilar), 'el sustituido va al banquillo');

// 8) descanso
Data.ajustarMinuto(P.id, 35);
Data.pausar(P.id);
ok(Data.match(P.id).estado==='descanso', 'se llega al descanso');
ok(Data.match(P.id).minuto===35, 'el reloj se detiene en 35');

// 9) segunda parte
Data.arrancar(P.id);
ok(Data.match(P.id).parte===2, 'arranca la segunda parte');
ok(Data.minutoActual(Data.match(P.id))>=35, 'el reloj continúa desde 35');
Data.ajustarMinuto(P.id, 52);
Data.addAccion(P.id,{ tipo:'punto', clase:'ensayo', valor:5,
  player:Data.match(P.id).titulares['centro_1'], minuto:52 });
Data.addAccion(P.id,{ tipo:'punto', clase:'ensayo', valor:5, contra:true, minuto:60 });
Data.addAccion(P.id,{ tipo:'punto', clase:'conversion', valor:2, contra:true, minuto:61 });
Data.ajustarMinuto(P.id, 65);
const saleOcho = Data.match(P.id).titulares['octavo'];
const recs2 = Data.recambios(P.id, saleOcho);
if(recs2.length){
  Data.addAccion(P.id,{ tipo:'cambio', sale:saleOcho, entra:recs2[0].player.id, minuto:65 });
}
Data.ajustarMinuto(P.id, 70);
Data.pausar(P.id);
const fin = Data.match(P.id);
ok(fin.estado==='final', 'el partido termina');
ok(fin.puntos_favor===12, 'marcador final a favor: 12 (es '+fin.puntos_favor+')');
ok(fin.puntos_contra===10, 'marcador final en contra: 10 (es '+fin.puntos_contra+')');

// 10) minutos: coherentes con la duración
const minF = Data.minutosJugados(P.id);
const total = fin.duracion_parte*2;
ok(minF.every(x=>x.minutos>=0 && x.minutos<=total),
  'ningún minuto fuera de rango (0-'+total+')');
const sinCambiar = minF.find(x=>x.player_id===mP2.titulares['zaguero']);
ok(sinCambiar.minutos===total, 'quien no fue sustituido juega el partido entero');
const pilarSale = minF.find(x=>x.player_id===salePilar);
ok(pilarSale.minutos===25, 'el pilar sustituido en el 25 acumula 25 minutos');
const pilarEntra = minF.find(x=>x.player_id===entraPilar);
ok(pilarEntra.minutos===total-25, 'el que entró en el 25 juega el resto');
ok(pilarEntra.titular===false, 'consta como suplente');
ok(minF.filter(x=>x.minutos>0).length>=15, 'al menos 15 jugadores con minutos');

// 11) resumen y estadística
S={ teamId:eqF.id, mTab:'resumen' };
view('partido completo/resumen', ()=>Match.pantalla(P.id));
S.mTab='alineacion'; view('partido completo/alineación', ()=>Match.pantalla(P.id));
S.mTab='juego';      view('partido completo/en juego', ()=>Match.pantalla(P.id));
const stF = Data.statsEquipo(eqF.id);
ok(stF.partidos===1, 'la estadística cuenta el partido');
ok(stF.ganados===1, 'consta como victoria');
ok(stF.ensayos===2, 'se contabilizan los 2 ensayos propios');
ok(stF.pf===12 && stF.pc===10, 'puntos a favor y en contra correctos');
ok(stF.conversion===50, 'una transformación de dos ensayos es el 50%');
ok(stF.hanJugado>=15, 'reparto de minutos calculado');
const rtF = Data.resumenTemporada(eqF.id);
ok(rtF.jugadores[ala].ensayos===1, 'el ala suma su ensayo');
ok(rtF.jugadores[ap].puntos===2, 'la apertura suma la transformación');
const clF = Data.clasificaciones(eqF.id);
ok(clF.some(c=>c.id==='minutos'), 'aparece la clasificación de minutos');
ok(clF.some(c=>c.id==='ensayos'), 'y la de ensayos');

// 12) la familia lo ve en solo lectura
Data.endSession(); Data.login('marta@correo.es','clave1234');
S={ childId:Data.myPlayers()[0].id };
const vistaFam = Family.resumenPartido(P.id);
ok(vistaFam.includes('12'), 'la familia ve el marcador');
ok(!vistaFam.includes('Match.borrar'), 'la familia no puede editar el acta');
ok(!vistaFam.includes('Match.cambio'), 'ni hacer cambios');

// 13) deshacer una acción recalcula todo
Data.endSession(); Data.login('coach@rcc.cat','clave1234');
Data.setSession({ ...Data.ses, rol:'entrenador' });
const accEns = Data.match(P.id).acciones.find(a=>a.clase==='ensayo'&&!a.contra);
Data.borrarAccion(P.id, accEns.id);
ok(Data.match(P.id).puntos_favor===7, 'borrar un ensayo resta 5 puntos');
Data.addAccion(P.id,{ tipo:'punto', clase:'ensayo', valor:5, player:ala, minuto:8 });
ok(Data.match(P.id).puntos_favor===12, 'volver a añadirlo restaura el marcador');
const minTras = Data.minutosJugados(P.id);
ok(minTras.find(x=>x.player_id===salePilar).minutos===25,
  'los minutos siguen siendo correctos tras editar');

/* ═══════════════ RESULTADO ═══════════════ */
console.log('\n' + '─'.repeat(52));
console.log(fail===0
  ? '  ✅  '+pass+' comprobaciones correctas'
  : '  ❌  '+fail+' fallos de '+(pass+fail)+' comprobaciones');
console.log('─'.repeat(52));
process.exit(fail?1:0);
`;

eval(src + '\n' + RUN);
