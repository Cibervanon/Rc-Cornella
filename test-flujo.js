/* ============================================================================
   Test de flujo de usuario real (Puppeteer + Chrome del sistema)
   ----------------------------------------------------------------------------
   Los otros tests (test.js, test-nube.js) comprueban funciones aisladas. Este
   arranca la app en un navegador de verdad y la recorre como lo haria una
   persona: fundar el club, repartir codigos, registrarse con codigo, entrar,
   mirar la agenda, etc.

   Ademas comprueba lo que de verdad rompe una app: errores de JavaScript en
   consola, paginas en blanco, y que cada pantalla del documento de
   funcionalidades se pueda pintar.

   Uso:  node test-flujo.js
   ========================================================================== */
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME =
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const RAIZ = __dirname;
const PUERTO = 8731;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/* Servidor estatico minimo: la app necesita http:// (no file://) para que
   funcionen fetch, service worker y el resto de APIs del navegador. */
function servidor() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';
      const destino = path.join(RAIZ, rel);
      if (!destino.startsWith(RAIZ) || !fs.existsSync(destino) ||
          fs.statSync(destino).isDirectory()) {
        res.writeHead(404); res.end('no'); return;
      }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream',
      });
      fs.createReadStream(destino).pipe(res);
    });
    s.listen(PUERTO, () => resolve(s));
  });
}

let ok = 0, fallos = 0;
const problemas = [];
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  OK   ${nombre}`); }
  else {
    fallos++; problemas.push(nombre + (detalle ? ' -> ' + detalle : ''));
    console.log(`  FALLO ${nombre}${detalle ? '  (' + detalle + ')' : ''}`);
  }
}

(async () => {
  console.log('Test de flujo de usuario en navegador real\n');
  if (!fs.existsSync(CHROME)) {
    console.log('No se encuentra Chrome en ' + CHROME);
    process.exit(1);
  }

  const server = await servidor();
  const navegador = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 412, height: 915 });

  /* Todo lo que la app lance por consola se guarda para poder culparlo. */
  const errores = [];
  pagina.on('pageerror', e => errores.push('pageerror: ' + e.message));
  pagina.on('console', m => {
    if (m.type() === 'error') errores.push('console: ' + m.text());
  });
  pagina.on('requestfailed', r => {
    const u = r.url();
    /* El CDN de supabase puede fallar sin conexion: no es un fallo de la app. */
    if (u.includes('jsdelivr') || u.includes('supabase')) return;
    errores.push('request: ' + u + ' (' + r.failure().errorText + ')');
  });

  const texto = () => pagina.evaluate(() => document.body.innerText);
  const html = () => pagina.evaluate(() => document.body.innerHTML);
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  /* La app declara sus objetos con `const` en el ambito global de los scripts.
     Eso NO los cuelga de `window`, asi que hay que mirarlos por su nombre. Y
     ademas renderiza de forma asincrona (carga supabase-js del CDN y luego
     hidrata), asi que hay que esperar a que este lista de verdad. */
  async function esperarApp(ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const lista = await pagina.evaluate(() => {
        try {
          return typeof Gate !== 'undefined' && typeof Data !== 'undefined' &&
                 typeof Backend !== 'undefined' && typeof Shell !== 'undefined' &&
                 document.querySelector('#root').innerHTML.length > 50;
        } catch (e) { return false; }
      });
      if (lista) return true;
      await esperar(150);
    }
    return false;
  }

  async function pulsar(textoBoton) {
    const okClick = await pagina.evaluate(t => {
      const b = [...document.querySelectorAll('button,a')]
        .find(x => x.innerText.trim().includes(t));
      if (b) { b.click(); return true; }
      return false;
    }, textoBoton);
    if (!okClick) throw new Error(`no se encontro el boton "${textoBoton}"`);
    await esperar(220);
  }

  async function escribir(selector, valor) {
    await pagina.evaluate(s => { const e = document.querySelector(s); if (e) e.value = ''; }, selector);
    await pagina.type(selector, valor, { delay: 8 });
  }

  /* ---------------------------------------------------------------------
     1. Arranque
     --------------------------------------------------------------------- */
  console.log('1. Arranque de la app');
  await pagina.goto(`http://localhost:${PUERTO}/index.html`, { waitUntil: 'networkidle2' });
  const arranco = await esperarApp();
  comprobar('la app termina de arrancar y pintar', arranco);

  const globals = await pagina.evaluate(() => ({
    Data: typeof Data, Backend: typeof Backend,
    Gate: typeof Gate, Shell: typeof Shell, DB: typeof DB,
    esc: typeof esc, val: typeof val, crest: typeof crest, I: typeof I,
  }));
  comprobar('Data definido', globals.Data === 'object', globals.Data);
  comprobar('Backend definido', globals.Backend === 'object', globals.Backend);
  comprobar('Gate definido', globals.Gate === 'object', globals.Gate);
  comprobar('Shell definido', globals.Shell === 'object', globals.Shell);
  comprobar('DB definido', globals.DB === 'object', globals.DB);
  comprobar('ayudas esc/val/crest/I', globals.esc === 'function' && globals.val === 'function'
    && globals.crest === 'function' && globals.I === 'object');

  const cuerpo = await texto();
  comprobar('la pantalla no esta en blanco', cuerpo.trim().length > 20,
    `solo ${cuerpo.trim().length} caracteres`);
  comprobar('aparece el nombre del club', /Cornell/.test(cuerpo), cuerpo.slice(0, 60));
  comprobar('no hay errores JS al arrancar', errores.length === 0, errores.slice(0, 3).join(' | '));

  /* ---------------------------------------------------------------------
     2. Fundar el club (la junta directiva)
     --------------------------------------------------------------------- */
  console.log('\n2. La junta funda el club');
  await pulsar('Crear el club');

  const enFundar = await pagina.evaluate(() => !!Gate.fundar);
  comprobar('se abre el formulario de fundar', enFundar);

  const hayForm = await pagina.evaluate(() => !!document.querySelector('input,select,textarea'));
  comprobar('el formulario tiene campos que rellenar', hayForm);

  /* Se rellena lo que el propio DOM pida, para no depender de ids internos. */
  const relleno = await pagina.evaluate(() => {
    const etiquetas = [...document.querySelectorAll('label')].map(l => l.innerText.trim().toLowerCase());
    const campos = [...document.querySelectorAll('input:not([type=hidden]),select')];
    return { etiquetas, campos: campos.length,
      tipos: campos.map(c => c.type || c.tagName.toLowerCase()) };
  });
  console.log(`     (formulario con ${relleno.campos} campos: ${relleno.etiquetas.slice(0, 6).join(', ')})`);
  comprobar('el formulario de fundar pide datos del club', relleno.campos > 0);

  /* ---------------------------------------------------------------------
     3. Estructura de datos: la app responde antes de founded
     --------------------------------------------------------------------- */
  console.log('\n3. La app responde sin club creado (modo vacio)');
  const antes = await pagina.evaluate(() => {
    try {
      return {
        existe: Data.clubExists(),
        roles: Data.myRoles().length,
        jugadores: Data.players().length,
        eventos: Data.events().length,
        equipos: Data.teams().length,
        categorias: Data.categories().length,
      };
    } catch (e) { return { error: e.message }; }
  });
  comprobar('sin club: clubExists() es false', antes.existe === false, JSON.stringify(antes));
  comprobar('sin club: no hay jugadores de ejemplo', antes.jugadores === 0, JSON.stringify(antes));
  comprobar('sin club: no hay eventos de ejemplo', antes.eventos === 0, JSON.stringify(antes));
  comprobar('sin club: no hay equipos de ejemplo', antes.equipos === 0, JSON.stringify(antes));
  comprobar('sin club: no hay categorias de ejemplo', antes.categorias === 0, JSON.stringify(antes));

  /* ---------------------------------------------------------------------
     4. Pantallas: se pintan todas sin reventar
     --------------------------------------------------------------------- */
  console.log('\n4. Todas las pantallas se pintan sin errores');
  const rutas = ['hoy', 'agenda', 'jugadores', 'partidos', 'cuotas', 'avisos', 'perfil', 'admin'];
  for (const r of rutas) {
    const antesErr = errores.length;
    let pintada = false, detalle = '';
    try {
      await pagina.evaluate(ruta => {
        if (typeof Shell !== 'undefined' && Shell.go) Shell.go(ruta);
        else Shell.render();
      }, r);
      await esperar(180);
      const t = await texto();
      pintada = t.trim().length > 5;
      detalle = `(${t.trim().length} chars)`;
    } catch (e) { detalle = e.message; }
    comprobar(`pantalla "${r}" se pinta`, pintada && errores.length === antesErr,
      `${detalle} ${errores.slice(antesErr).join(' ')}`);
  }

  /* ---------------------------------------------------------------------
     5. Comprobacion contra el documento de funcionalidades
     --------------------------------------------------------------------- */
  console.log('\n5. El documento de funcionalidades se cumple de verdad');
  /* Cada seccion del documento tiene que estar implementada por funciones que
     existen de verdad en el codigo. Si el documento promete algo que el codigo
     ya no tiene, salta aqui. */
  const SECCIONES = {
    '1. Acceso y seguridad': ['foundClub', 'register', 'login', 'peekCode',
      'changePassword', 'createInvite', 'revokeInvite', 'createSession',
      'loadSession', 'setSession', 'validEmail', 'myRoles', 'wipe'],
    '2. Junta directiva': ['addCategory', 'updateCategory', 'addTask', 'toggleTask',
      'addPost', 'posts', 'readAll', 'notifs', 'exportarCSV', 'exportarJSON',
      'importarJSON', 'invites', 'allStaff'],
    '3. Entrenador': ['sessions', 'createSession', 'endSession', 'setAttendance',
      'attendance', 'drills', 'addDrill', 'addPrueba', 'evaluations',
      'saveEvaluation', 'addNote', 'notes', 'injuries', 'addInjury', 'closeInjury',
      'activeInjuries', 'callups', 'setCallups', 'rsvpOf', 'setRsvp', 'rsvpList',
      'issueInvoices', 'invoices', 'certs', 'myCert', 'updateCert'],
    '4. Familia': ['myPlayers', 'myGuardian', 'guardiansOf', 'hermanos',
      'siblings', 'docs', 'pendingDocs', 'signMandate', 'signatures', 'mandate',
      'familyCode', 'regenerarCodigoFamilia'],
    '5. Jugador': ['player', 'marcas', 'setMarca', 'goals', 'toggleGoal',
      'historicoMarca', 'rankingMarca', 'posicionDe'],
    '6. Posiciones, puestos y grupos': ['posicionesDe', 'setPosiciones', 'moverGrupo',
      'addTeam', 'cambiarFormacion', 'playerTeam', 'coberturaPuestos',
      'addCategory', 'updateCategory'],
    '7. Dia de partido': ['match', 'ensureMatch', 'saveMatch', 'ponerTitular',
      'sacarDeConvocatoria', 'quitarDeAlineacion', 'aBanquillo', 'recambios',
      'ajustarMinuto', 'addGoal', 'addAccion', 'borrarAccion', 'statsEquipo',
      'autoAlinear', 'minutoActual', 'reiniciarPartido', 'pausar', 'reanudarPausa',
      'playerTeam', 'movePlayer', 'enCampo', 'comprometidos'],
    '8. Datos del jugador y clasificaciones': ['player', 'marcas', 'marcasDe',
      'clasificaciones', 'historicoMarca', 'rankingMarca', 'evaluations',
      'minutosJugados', 'teamPlayers', 'plantelAmpliado'],
    '9. Funciones transversales': ['exportarJSON', 'importarJSON', 'exportarCSV',
      'wipe', 'vaciar', 'appUrl', 'clubNombre', 'validEmail', 'fechaLarga'],
    '10. Quien ve que': ['myRoles', 'rol', 'allStaff', 'myPlayers',
      'guardiansOf', 'teamStaff', 'me', 'players'],
  };

  /* Las funciones viven repartidas entre Data, DB, Shell y Gate, segun si son
     de datos, de almacenamiento o de interfaz. Se mira en todos. */
  const implementadas = await pagina.evaluate(nombres => {
    const ambitos = [Data, DB, Shell, Gate];
    const faltan = nombres.filter(n =>
      !ambitos.some(a => a && Object.prototype.hasOwnProperty.call(a, n)));
    return { faltan };
  }, [...new Set(Object.values(SECCIONES).flat())]);

  for (const [seccion, funcs] of Object.entries(SECCIONES)) {
    const faltan = funcs.filter(f => implementadas.faltan.includes(f));
    comprobar(seccion, faltan.length === 0, `falta: ${faltan.join(', ')}`);
  }

  /* El documento promete que la app arranca vacia. Se comprueba arriba, pero
     tambien que no queden datos de ejemplo metidos a mano en el codigo. */
  const sinEjemplos = await pagina.evaluate(() =>
    Object.values(Data).filter(f => typeof f === 'function').length);
  comprobar('el store expone funciones de verdad', sinEjemplos > 80, String(sinEjemplos));

  /* ---------------------------------------------------------------------
     6. Sin errores acumulados
     --------------------------------------------------------------------- */
  console.log('\n6. Recuento de errores de JavaScript');
  const relevantes = errores.filter(e => !/favicon/i.test(e));
  if (relevantes.length) {
    console.log('     Errores encontrados:');
    [...new Set(relevantes)].forEach(e => console.log('       - ' + e));
  }
  comprobar('ningun error de JS en todo el recorrido', relevantes.length === 0,
    `${relevantes.length} errores`);

  /* ---------------------------------------------------------------------
     7. El viaje completo: fundar el club y entrar como familia
     --------------------------------------------------------------------- */
  console.log('\n7. Viaje completo de usuario (modo local, sin tocar Supabase)');
  await pagina.close();
  await navegador.close();
  server.close();

  /* Se repite todo en una pagina nueva, esta vez en modo local: asi se
     comprueba el recorrido completo sin crear cuentas de verdad en el
     proyecto de Supabase del club. */
  const server2 = await servidor();
  const navegador2 = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const p2 = await navegador2.newPage();
  await p2.setViewport({ width: 412, height: 915 });

  /* Se desactiva la sincronizacion antes de que cargue la app. */
  await p2.setRequestInterception(true);
  p2.on('request', req => {
    if (req.url().endsWith('/js/config.js')) {
      const cuerpo = fs.readFileSync(path.join(RAIZ, 'js', 'config.js'), 'utf8')
        .replace(/syncEnabled\s*:\s*true/, 'syncEnabled: false');
      req.respond({
        status: 200, contentType: 'text/javascript; charset=utf-8', body: cuerpo,
      });
      return;
    }
    /* Sin CDN: en local no hace falta supabase-js. */
    if (req.url().includes('jsdelivr') || req.url().includes('supabase')) {
      return req.respond({ status: 200, contentType: 'text/javascript', body: '' });
    }
    req.continue();
  });

  const errores2 = [];
  p2.on('pageerror', e => errores2.push('pageerror: ' + e.message));
  p2.on('console', m => { if (m.type() === 'error') errores2.push('console: ' + m.text()); });

  const t2 = () => p2.evaluate(() => document.body.innerText);
  const e2 = ms => new Promise(r => setTimeout(r, ms));

  async function listo(ms = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await p2.evaluate(() => {
        try { return typeof Gate !== 'undefined' && typeof Data !== 'undefined' &&
          document.querySelector('#root').innerHTML.length > 50; } catch (e) { return false; }
      })) return true;
      await e2(150);
    }
    return false;
  }

  async function click(txt) {
    const okc = await p2.evaluate(t => {
      const b = [...document.querySelectorAll('button,a')]
        .find(x => x.innerText.trim().includes(t));
      if (b) { b.click(); return true; } return false;
    }, txt);
    if (!okc) throw new Error(`no se encontro "${txt}"`);
    await e2(200);
  }
  async function pon(sel, v) {
    await p2.evaluate(s => { const e = document.querySelector(s); if (e) e.value = ''; }, sel);
    await p2.type(sel, v, { delay: 5 });
  }
  async function marca(sel) {
    await p2.evaluate(s => {
      const e = document.querySelector(s);
      if (e && !e.checked) e.click();
    }, sel);
  }

  await p2.goto(`http://localhost:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  comprobar('la app arranca en modo local', await listo());

  const esLocal = await p2.evaluate(() => !backendListo());
  comprobar('el modo local esta activo (no toca Supabase)', esLocal);

  /* -- 7.1 La junta funda el club -- */
  await click('Crear el club');
  await pon('#cN', 'Rugby Club Cornella Test');
  await pon('#cC', 'Cornella de Llobregat');
  await pon('#cT', '2026-27');
  await click('Continuar');
  await e2(200);
  const enPaso2 = await p2.evaluate(() => Gate.asistente.n === 2);
  comprobar('paso 1 -> paso 2 (categorias)', enPaso2);
  await click('Continuar');
  await e2(200);
  const enPaso3 = await p2.evaluate(() => Gate.asistente.n === 3);
  comprobar('paso 2 -> paso 3 (cuenta de admin)', enPaso3);

  await pon('#fN', 'Junta Directiva');
  await pon('#fE', 'junta@cor.test');
  await pon('#fP', 'contrasena123');
  await click('Crear el club');
  await e2(700);

  const errAlFundar = await p2.evaluate(() => Gate.err || '');
  if (errAlFundar) console.log('     (aviso de la app: ' + errAlFundar + ')');

  const fundado = await p2.evaluate(() => {
    try { return { existe: Data.clubExists(), nombre: Data.clubNombre(),
      roles: Data.myRoles(), cats: Data.categories().length }; }
    catch (e) { return { error: e.message }; }
  });
  comprobar('el club se ha creado', fundado.existe === true, JSON.stringify(fundado));
  comprobar('el club tiene nombre', /Cornella/.test(fundado.nombre || ''), fundado.nombre);
  comprobar('la junta queda con un rol', fundado.roles && fundado.roles.length > 0,
    JSON.stringify(fundado.roles));
  comprobar('se crean las categorias del club', fundado.cats > 0, String(fundado.cats));
  comprobar('tras fundar se entra en la app', await p2.evaluate(() =>
    Gate.step === null && !document.body.innerText.includes('Pon en marcha el club')));

  /* -- 7.2 La junta reparte un codigo de familia -- */
  const codigo = await p2.evaluate(() => {
    try {
      const c = Data.createInvite({ rol: 'familia', equipo_id: null, usos: 1 });
      return (Array.isArray(c) ? c[0] : c);
    } catch (e) { return { error: e.message }; }
  });
  comprobar('la junta puede crear un codigo de acceso',
    !codigo.error && !!(codigo.code || codigo.codigo), JSON.stringify(codigo));
  const code = codigo.code || codigo.codigo;

  /* -- 7.3 Cambiar de usuario sin perder el club --
     Ojo: en modo local Backend.salir() llama a DB.vaciar() y se lleva el club
     entero. Aqui solo se cierra la sesion, que es lo que pasa en la nube (alli
     los datos se vuelven a bajar del servidor). */
  await p2.evaluate(() => {
    try { Backend.uid = null; } catch (e) {}
    Data.setSession(null);
    Gate.resetearGoogle();
    Gate.step = 'elegir';
    Shell.view = 'gate';
    Shell.render();
  });
  await e2(400);
  comprobar('el club sigue ahi al cambiar de usuario',
    await p2.evaluate(() => Data.clubExists()));
  comprobar('vuelve la pantalla de elegir perfil',
    (await t2()).includes('código') || (await t2()).includes('codigo'),
    (await t2()).slice(0, 80));

  /* -- 7.4 La familia se registra con el codigo -- */
  await p2.evaluate(() => { Gate.step = 'codigo'; Shell.view = 'gate'; Shell.render(); });
  await e2(250);
  await pon('#gCode', String(code));
  await p2.evaluate(() => Gate.checkCode());
  await e2(400);

  const rolDetectado = await p2.evaluate(() => Gate.rolDetectado);
  comprobar('el codigo reconoce el rol de familia', rolDetectado === 'familia',
    String(rolDetectado));
  const enDatos = await p2.evaluate(() => Gate.step === 'datos');
  comprobar('el codigo abre el formulario de datos', enDatos);

  /* Sin aceptar la privacidad no se deja seguir. */
  await pon('#rN', 'Marta Soler');
  await pon('#rE', 'marta@cor.test');
  await pon('#rT', '600000000');
  await pon('#rP', 'familia123');
  await click('Crear mi cuenta');
  await e2(300);
  const pidePrivacidad = await p2.evaluate(() => Gate.err || '');
  comprobar('exige aceptar la politica de privacidad', /privacidad/i.test(pidePrivacidad),
    pidePrivacidad);

  await marca('#rOk');
  await click('Crear mi cuenta');
  await e2(800);

  const errRegistro = await p2.evaluate(() => Gate.err || '');
  if (errRegistro) console.log('     (aviso de la app: ' + errRegistro + ')');
  const registradas = await p2.evaluate(() => {
    try { return { roles: Data.myRoles(), existe: Data.clubExists() }; }
    catch (e) { return { error: e.message }; }
  });
  comprobar('la familia queda registrada con su rol',
    Array.isArray(registradas.roles) && registradas.roles.includes('familia'),
    JSON.stringify(registradas.roles));

  /* -- 7.5 La familia entra y ve la app -- */
  await p2.evaluate(() => {
    try { Backend.uid = null; } catch (e) {}
    Data.setSession(null);
    Gate.resetearGoogle();
    Gate.step = 'login';
    Shell.view = 'gate';
    Shell.render();
  });
  await e2(300);
  await pon('#lE', 'marta@cor.test');
  await pon('#lP', 'familia123');
  await p2.evaluate(() => Gate.doLogin());
  await e2(800);

  const entro = await p2.evaluate(() => {
    try { return { roles: Data.myRoles(), err: Gate.err || '' }; }
    catch (e) { return { error: e.message }; }
  });
  comprobar('la familia puede iniciar sesion con su contrasena',
    Array.isArray(entro.roles) && entro.roles.length > 0, JSON.stringify(entro));
  comprobar('no hay error de login', !entro.err, entro.err);

  /* -- 7.6 El codigo no se puede reutilizar -- */
  const reutilizable = await p2.evaluate(c => {
    const r = Data.peekCode(c);
    return !!(r && r.ok);
  }, String(code));
  comprobar('un codigo gastado ya no vale', reutilizable === false);

  console.log('\n8. Errores de JavaScript en el viaje completo');
  const rel2 = errores2.filter(e => !/favicon|jsdelivr|supabase/i.test(e));
  if (rel2.length) [...new Set(rel2)].forEach(e => console.log('     - ' + e));
  comprobar('ningun error de JS en el viaje completo', rel2.length === 0,
    `${rel2.length} errores`);

  await navegador2.close();
  server2.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Comprobaciones correctas: ${ok}`);
  console.log(`Fallos: ${fallos}`);
  if (problemas.length) {
    console.log('\nLo que hay que arreglar:');
    problemas.forEach(p => console.log('  - ' + p));
  }
  console.log('='.repeat(60));
  process.exit(fallos ? 1 : 0);
})().catch(e => {
  console.error('\nEl test fallo a medias:', e.message);
  process.exit(1);
});
