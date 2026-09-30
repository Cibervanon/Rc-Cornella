/* ============================================================================
   Copia la web a www/ y luego la deja lista para el APK.
   ----------------------------------------------------------------------------
   El APK no lee los ficheros de la raiz, sino los de www/. Si se edita un .js
   y no se copia, el movil sigue ejecutando la version antigua: por eso el build
   siempre pasa por aqui.

   Uso: node copiar-web.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const WWW = path.join(RAIZ, 'www');

const FICHEROS = [
  'index.html', 'styles.css', 'sw.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-maskable-512.png',
  'apple-touch-icon.png', 'favicon.png',
];

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const f of FICHEROS) {
  const origen = path.join(RAIZ, f);
  if (!fs.existsSync(origen)) { console.log(`  (no existe, se omite) ${f}`); continue; }
  fs.copyFileSync(origen, path.join(WWW, f));
}

fs.cpSync(path.join(RAIZ, 'js'), path.join(WWW, 'js'), { recursive: true });

const n = fs.readdirSync(WWW).length;
const js = fs.readdirSync(path.join(WWW, 'js')).filter(f => f.endsWith('.js')).length;
console.log(`www/ lista: ${n} entradas, ${js} ficheros js`);

if (!fs.existsSync(path.join(WWW, 'index.html'))) {
  console.error('Falta index.html en www/');
  process.exit(1);
}
