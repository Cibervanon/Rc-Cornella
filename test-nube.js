/* ============================================================================
   Prueba de la capa de servidor, con un Supabase falso.
   ----------------------------------------------------------------------------
   No necesita red, ni claves, ni Docker. Comprueba lo que decide qué se sube y
   qué no: el mapa de tablas, la firma de las filas, la sincronización
   diferencial, los borrados, la hidratación y el apagado sin servidor.

   Ejecutar:  node test-nube.js
   ============================================================================ */

const fs = require('fs');
const path = require('path');
const leer = p => fs.readFileSync(path.join(__dirname, 'js', p), 'utf8');

/* ---------- entorno mínimo, como en test.js ---------- */
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
global.window = {};
global.location = { origin: 'https://club.example', pathname: '/', hash: '' };

/* Un cliente Supabase que no va a ningún sitio pero anota lo que se le pide. */
const llamadas = [];
const tablas = {};
function clienteFalso(sesion = true){
  return {
    auth: {
      getSession: async () => ({ data:{ session: sesion ? { user:{ id:'u_ana' } } : null } }),
      getUser: async () => ({ data:{ user:{ id:'u_ana', email:'ana@club.cat' } } }),
      signOut: async () => ({})
    },
    from(t){
      return {
        select(){
          return { eq(){ return this },
                   limit: async () => ({ data: tablas[t] || [], error: null }) };
        },
        upsert(filas, opts){
          llamadas.push({ op:'upsert', tabla:t, filas, onConflict: opts && opts.onConflict });
          return Promise.resolve({ data:null, error:null });
        },
        delete(){
          return { in: async (col, claves) => {
            llamadas.push({ op:'delete', tabla:t, col, claves });
            return { data:null, error:null };
          } };
        }
      };
    }
  };
}

/* store.js y backend.js, y después las comprobaciones, todo en el mismo
   ámbito: es como los carga el navegador, en orden. */
const PRUEBAS = String.raw`

let pass=0, fail=0;
const S = t => console.log('\n── '+t);
const ok = (c,m) => { if(c) pass++; else { fail++; console.log('   XX  '+m); } };
const eq = (a,b,m) => ok(JSON.stringify(a)===JSON.stringify(b),
  m+'  → '+JSON.stringify(a));

const clubId = 'club_1';
const aFila = (coll,obj) => Backend.aFila(coll, obj, clubId);

/* ═══════════════ 1. APAGADO Y ENCENDIDO ═══════════════ */
S('1. Apagado y encendido');
ok(Backend.activo === false, 'sin configurar nada el backend arranca apagado');
ok(Backend.configurado() === false, 'configurar() es falso sin URL ni llave');
ok(backendListo() === false, 'backendListo() es falso');
ok(typeof NUBE === 'function' && NUBE() === null, 'NUBE() devuelve null sin servidor');
DB.load(); DB.save();
ok(mem['rccornella.db.v1'] !== undefined, 'DB.save() sigue funcionando sin servidor');
DB.vaciar();
ok(mem['rccornella.db.v1'] === undefined, 'DB.vaciar() borra la copia local');

Backend.cfg = { supabaseUrl:'https://x.supabase.co', supabaseAnonKey:'anon' };
ok(Backend.configurado() === true, 'con URL y llave, configurar() es verdadero');
Backend.cfg = { supabaseUrl:'https://x.co', supabaseAnonKey:'anon', syncEnabled:false };
ok(Backend.configurado() === false, 'syncEnabled:false apaga la sincronización');
Backend.cfg = { supabaseUrl:'https://x.co', supabaseAnonKey:'anon' };

/* ═══════════════ 2. MAPA DE TABLAS ═══════════════ */
S('2. Traducción de filas');
ok(aFila('users',{ id:'u_1', nombre:'Ana', hash:'99', tel:'600' }).hash === undefined,
  'users: la contraseña nunca sale del dispositivo');
ok(aFila('users',{ id:'u_1' }).club_id === clubId, 'users: se añade club_id');

const fClub = aFila('club',{ id:'club_1', nombre:'RCC' });
ok(fClub.club_id === undefined, 'club: es una sola fila, sin club_id');
ok(fClub.id === 'club_1', 'club: conserva su id');

const fInv = aFila('invites',{ code:'AB12CD', rol:'entrenador', usos:0, max:1, team_id:'t_1' });
ok(fInv.code === 'AB12CD', 'invites: la clave primaria es el código');
ok(fInv.id === undefined, 'invites: no se manda una columna id inexistente');
ok(fInv.team_id === 't_1', 'invites: conserva el equipo asignado');

const fMem = aFila('members',{ club_id:'club_1', user_id:'u_1', rol:'junta' });
ok(fMem.id === 'club_1:u_1:junta', 'members: id sintético club:usuario:rol');
ok(fMem.club_id === 'club_1', 'members: conserva el club');

const fDr = aFila('drills',{ id:'dr_1', n:'Carrera', desc:'A', min:8 });
ok(fDr.descripcion === 'A' && fDr.desc === undefined, 'drills: desc → descripcion');
ok(fDr.min === 8, 'drills: los números se respetan');

const fCat = aFila('categories',{ id:'cat_1', cuota:'', orden:2 });
ok(fCat.cuota === null, 'números vacíos → null (si no, PostgreSQL rechaza el lote)');
ok(fCat.orden === 2, 'números válidos se respetan');
ok(aFila('categories',{ id:'cat_1', cuota:0 }).cuota === 0,
  'el cero NO se convierte en null');

const fMat = aFila('matches',{ id:'m_1', titulares:[{ n:'x' }], puntos_favor:10, parte:'' });
ok(Array.isArray(fMat.titulares), 'matches: la alineación viaja como lista');
ok(fMat.puntos_favor === 10 && fMat.parte === null, 'matches: los números también');
ok(aFila('players',{ id:'p_1', marcas:{ v:80 } }).marcas.v === 80, 'players: marcas se mantiene');
ok(aFila('audit',{ id:'a_1', meta:{ q:'x' } }).meta.q === 'x', 'audit: meta se mantiene');
ok(aFila('sessionDrills',{ id:'sd_1', orden:3 }).orden === 3, 'sessionDrills: orden numérico');
ok(aFila('links',{ player_id:'p_1', guardian_id:'g_1' }).id === 'p_1:g_1',
  'links: id sintético jugador:tutor');
ok(aFila('reads',{ post_id:'po_1', user_id:'u_1' }).id === 'po_1:u_1',
  'reads: id sintético aviso:usuario');
ok(aFila('historico',{ temporada:'2025-26', cerrada:'2026-01-01', jugadores:20 }).id
     === '2025-26:2026-01-01', 'historico: id sintético temporada:fecha');
ok(aFila('historico',{ temporada:'2025-26', cerrada:'2026-01-01', jugadores:20 }).jugadores === 20,
  'historico: los números se respetan');

/* ═══════════════ 3. HIDRATAR ═══════════════ */
S('3. Bajada del servidor');
DB.d = EMPTY();
Backend.activo = true;
Backend.uid = 'u_ana';            // hay sesión: deben bajar también las privadas
Backend.sb = clienteFalso();
tablas.clubs = [{ id:'club_1', nombre:'Rugby Club Cornellà', ciudad:'Cornellà',
                 updated_at:'2026-01-01' }];
tablas.categories = [{ id:'cat_1', nombre:'Sénior A', cuota:45, orden:0,
                       club_id:'club_1', updated_at:'x' }];
tablas.drills = [{ id:'dr_1', descripcion:'Arrancar bajo presión', min:8,
                   club_id:'club_1', updated_at:'x' }];
tablas.players = [{ id:'p_1', nombre:'Marc', club_id:'club_1', updated_at:'x' }];
tablas.posts = [];

(async () => {
  await Backend.hidratar();
  ok(DB.d.club.nombre === 'Rugby Club Cornellà', 'el club baja del servidor');
  ok(DB.d.club.club_id === undefined, 'club_id no se cuela en la app');
  ok(DB.d.club.updated_at === undefined, 'updated_at no se cuela en la app');
  ok(DB.d.categories.length === 1 && DB.d.categories[0].nombre === 'Sénior A',
    'las categorías bajan');
  ok(DB.d.drills[0].desc === 'Arrancar bajo presión', 'descripcion vuelve a llamarse desc');
  ok(DB.d.players.length === 1, 'con sesión bajan también las tablas privadas');
  ok(Backend.clubId === 'club_1', 'el backend recuerda el club para filtrar');
  ok(Backend.base.players.p_1 !== undefined, 'la base recuerda lo que hay en el servidor');
  ok(Backend.base.players.p_1.fila.club_id === 'club_1',
    'la base conserva el club_id para poder reenviar la fila');

  /* ═══════════════ 4. SINCRONIZACIÓN DIFERENCIAL ═══════════════ */
  S('4. Solo se sube lo que ha cambiado');
  ok(Backend.firma({ a:1, b:2 }) === Backend.firma({ b:2, a:1 }),
    'el orden de las columnas no cuenta como cambio');

  llamadas.length = 0;
  DB.save();
  await Backend.volcar();
  ok(llamadas.length === 0, 'un guardado sin cambios no genera ni una petición');

  llamadas.length = 0;
  DB.d.categories.push({ id:'cat_2', nombre:'Sénior B', cuota:50, orden:1 });
  DB.save();
  await Backend.volcar();
  let up = llamadas.find(c => c.op === 'upsert' && c.tabla === 'categories');
  ok(!!up, 'una categoría nueva sí se sube');
  ok(up && up.filas.length === 1 && up.filas[0].id === 'cat_2',
    'solo se sube la fila nueva, no la tabla entera');
  ok(up && up.onConflict === 'id', 'el conflicto se resuelve por id');
  ok(llamadas.filter(c => c.op === 'upsert').every(c => c.tabla !== 'players'),
    'las colecciones que no han cambiado no se tocan');

  llamadas.length = 0;
  DB.d.categories[0].cuota = 50;
  DB.save();
  await Backend.volcar();
  up = llamadas.find(c => c.op === 'upsert' && c.tabla === 'categories');
  ok(up && up.filas.length === 1 && up.filas[0].id === 'cat_1',
    'cambiar una fila existente sube solo esa fila');

  /* ═══════════════ 5. BORRADOS ═══════════════ */
  S('5. Borrados');
  llamadas.length = 0;
  DB.d.categories = DB.d.categories.filter(c => c.id !== 'cat_2');
  DB.save();
  await Backend.volcar();
  const del = llamadas.find(c => c.op === 'delete' && c.tabla === 'categories');
  ok(!!del, 'una categoría eliminada se borra en el servidor');
  eq(del && del.claves, ['cat_2'], 'se borra exactamente la que falta');
  ok(!llamadas.find(c => c.op === 'upsert' && c.tabla === 'categories'),
    'borrar no vuelve a subir la lista entera');

  /* ═══════════════ 6. SIN SESIÓN ═══════════════ */
  S('6. Sin sesión no se sube nada');
  Backend.sb = clienteFalso(false);
  llamadas.length = 0;
  DB.d.categories.push({ id:'cat_3', nombre:'Sénior C', cuota:55, orden:2 });
  DB.save();
  await Backend.volcar();
  ok(llamadas.length === 0, 'sin sesión no sale ni una petición');
  ok(Backend.pendientes === true, 'el trabajo queda pendiente para después');
  ok(mem['rccornella.db.v1'] !== undefined, 'pero sí queda guardado en el dispositivo');

  /* ═══════════════ 7. AGRUPACIÓN DE ESCRITURAS ═══════════════ */
  S('7. Agrupación de escrituras');
  Backend.sb = clienteFalso();
  DB.save();
  await Backend.volcar();
  Backend.base = Backend.instantanea();
  llamadas.length = 0;
  DB.d.categories.push({ id:'cat_9', nombre:'X', cuota:1, orden:9 });
  DB.save();
  Backend.marcar();
  Backend.marcar();
  Backend.marcar();
  ok(Backend.pendientes === true, 'marcar() anota que hay algo que subir');
  ok(Backend.temporizador !== null, 'tres guardados seguidos se agrupan en un temporizador');
  clearTimeout(Backend.temporizador);
  await Backend.volcar();
  ok(llamadas.length === 1, 'y de los tres solo sale una subida');

  /* ═══════════════ 8. FALLO A MEDIAS NO SE PIERDE NADA ═══════════════ */
  S('8. Si el servidor falla, nada se pierde');
  Backend.base = Backend.instantanea();
  llamadas.length = 0;
  DB.d.categories.push({ id:'cat_10', nombre:'Y', cuota:1, orden:10 });
  const bueno = Backend.sb.from.bind(Backend.sb);
  Backend.sb.from = t => {
    const c = bueno(t);
    if(t !== 'categories') return c;
    return { ...c, upsert: () => Promise.resolve({ data:null,
             error:{ message:'boom' } }) };
  };
  DB.save();
  await Backend.volcar();
  ok(Backend.pendientes === true, 'un fallo deja el trabajo pendiente');
  ok(Backend.estado === 'error', 'y se anota el error');
  ok(Backend.ultimoError && /boom/.test(Backend.ultimoError),
    'el mensaje dice qué colección falló');
  ok(Backend.base.categories.cat_10 === undefined,
    'no se da por buena una subida que no ha ocurrido: se reintentará');
  Backend.sb.from = bueno;
  llamadas.length = 0;
  await Backend.volcar();
  ok(llamadas.some(c => c.tabla === 'categories'),
    'al reintentar, la fila que falló vuelve a subir sola');
  ok(Backend.pendientes === false, 'y ya no queda pendiente');

  /* ═══════════════ 9. CERRAR SESIÓN ═══════════════ */
  S('9. Cerrar sesión');
  await Backend.salir();
  ok(Backend.uid === null, 'se olvida el usuario');
  ok(mem['rccornella.db.v1'] === undefined, 'se borra la copia local del club');
  ok(Backend.base.players === undefined, 'se olvida la base de sincronización');
  ok(DB.load() !== null, 'y DB.load() sigue funcionando para el modo local');

  console.log('\n────────────────────────────────────────────────────');
  console.log(fail ? '  '+fail+' fallos de '+(pass+fail)+' comprobaciones'
                   : '  '+pass+' comprobaciones correctas');
  console.log('────────────────────────────────────────────────────');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('   XX  excepción: '+e.message); console.log(e.stack);
                   process.exit(1); });
`;

eval(leer('store.js') + '\n' + leer('backend.js') + '\n' + PRUEBAS);

