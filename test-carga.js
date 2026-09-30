/* Comprueba que index.html carga los scripts en el orden en el que dependen.
   Con el orden equivocado, `backendListo` no existiría todavía y la app
   arrancaría rota aunque cada fichero por separado sea correcto. */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const orden = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
console.log('Orden de carga:\n  ' + orden.join('\n  '));

/* Cada script necesita lo que tiene delante. */
const necesita = {
  'js/config.js':  [],
  'js/icons.js':   ['js/config.js'],
  'js/store.js':   ['js/config.js'],
  'js/ui.js':      ['js/store.js'],
  'js/gate.js':    ['js/store.js', 'js/ui.js'],
  'js/coach.js':   ['js/store.js', 'js/ui.js'],
  'js/family.js':  ['js/store.js', 'js/ui.js'],
  'js/match.js':   ['js/store.js', 'js/ui.js'],
  'js/board.js':   ['js/store.js', 'js/ui.js', 'js/gate.js'],
  'js/backend.js': ['js/store.js'],
  'js/fcm.js':     ['js/store.js', 'js/backend.js'],
  'js/shell.js':   ['js/store.js', 'js/ui.js', 'js/gate.js', 'js/backend.js',
                    'js/fcm.js']
};

let fail = 0;
for (const [f, deps] of Object.entries(necesita)) {
  const pos = orden.indexOf(f);
  if (pos < 0) { console.log('  XX  falta ' + f); fail++; continue; }
  for (const d of deps) {
    const pd = orden.indexOf(d);
    if (pd < 0 || pd > pos) {
      console.log('  XX  ' + f + ' se carga antes de ' + d); fail++;
    }
  }
}

/* Los ficheros que existen en js/ tienen que estar en el HTML. */
for (const f of fs.readdirSync(path.join(__dirname, 'js'))) {
  if (f.endsWith('.js') && !orden.includes('js/' + f)) {
    console.log('  XX  js/' + f + ' existe pero no se carga'); fail++;
  }
}

/* Y el service worker tiene que conocerlos, o seguirá sirviendo la versión
   anterior desde la caché. */
const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
for (const f of orden) {
  if (!sw.includes(f)) { console.log('  XX  ' + f + ' no está en la caché de sw.js'); fail++; }
}
/* Y el número de la caché tiene que haber subido respecto a lo último
   confirmado. Fijar aquí un número (v6, v7...) se rompe solo en la siguiente
   subida, que es justo cuando deja de vigilar nada; lo que importa es que
   quien publica haya subido el número para que los móviles no se queden
   sirviendo la versión anterior. */
const verCache = txt => {
  const m = txt.match(/const CACHE = 'rccornella-v(\d+)'/);
  return m ? Number(m[1]) : NaN;
};
const cacheActual = verCache(sw);
let cacheConfirmada = NaN;
try {
  cacheConfirmada = verCache(
    require('child_process').execFileSync('git', ['show', 'HEAD:sw.js'],
      { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch (e) { /* sin git no se puede comparar */ }

/* Solo hay que subir la caché si sw.js ha cambiado respecto a lo confirmado.
   Comparar siempre contra HEAD hacía fallar el árbol limpio, donde la versión
   actual y la confirmada son la misma por definición. */
let swCambiado = false;
try {
  swCambiado = require('child_process')
    .execFileSync('git', ['diff', 'HEAD', '--', 'sw.js'],
      { cwd: __dirname, encoding: 'utf8' }).trim() !== '';
} catch (e) { swCambiado = !Number.isFinite(cacheConfirmada); }

if (!Number.isFinite(cacheActual))
  { console.log('  XX  sw.js no declara la versión de caché'); fail++; }
else if (swCambiado && cacheActual <= cacheConfirmada)
  { console.log(`  XX  sw.js cambió sin subir la caché (v${cacheConfirmada} -> v${cacheActual})`); fail++; }
else
  { console.log(`  ·  caché rccornella-v${cacheActual}` +
      (swCambiado ? '' : ' (sin cambios respecto a HEAD)')); }

/* Si hay service worker, tiene que tener los dos handlers de push. Un aviso que
   llega pero no se pinta es el fallo más difícil de detectar en un móvil. */
if (!/addEventListener\('push'/.test(sw))
  { console.log('  XX  sw.js no atiende los push'); fail++; }
if (!/addEventListener\('notificationclick'/.test(sw))
  { console.log('  XX  sw.js no atiende el toque en un aviso'); fail++; }

/* La versión del SDK de Firebase tiene que estar fijada. Sin esto, un cambio
   en Google puede dejar los push sin funcionar sin que nadie toque nada. */
const fcm = fs.readFileSync(path.join(__dirname, 'js/fcm.js'), 'utf8');
if (!/SDK:\s*'\d+\.\d+\.\d+'/.test(fcm))
  { console.log('  XX  la versión de Firebase no está fijada'); fail++; }

/* Y el token nunca puede escribirse sin pasar por el RPC, que es lo que
   comprueba que el token es de quien dice ser. */
if (!/rpc\('register_push_token'/.test(fcm))
  { console.log('  XX  el token se escribe sin register_push_token'); fail++; }
if (/from\('push_tokens'\)\s*\.\s*upsert/.test(fcm))
  { console.log('  XX  el token se inserta directamente, saltándose el RPC'); fail++; }

console.log(fail ? '\n' + fail + ' fallos' : '\nOrden correcto');
process.exit(fail ? 1 : 0);
