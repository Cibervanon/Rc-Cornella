/* Genera los iconos del lanzador Android y los splash screens con el escudo
   real del Rugby Club Cornellà. build-icons.py solo saca los iconos web, así
   que el APK salía con el logo genérico de Capacitor.

   Uso: node build-android-icons.js
*/
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const NEGRO = '#121212';
const NARANJA = '#E8590C';
const ROJO = '#C8102E';
const AMARILLO = '#FFD100';

/* El mismo escudo que build-icons.py, sobre una rejilla base de 64. */
function escudo(cx, cy, e, lema = false) {
  const X = v => cx + (v - 32) * e;
  const Y = v => cy + (v - 32) * e;
  const forma =
    `M ${X(32)} ${Y(11)} L ${X(51)} ${Y(18.5)} L ${X(51)} ${Y(34)} ` +
    `C ${X(51)} ${Y(45)} ${X(42)} ${Y(51.5)} ${X(32)} ${Y(55)} ` +
    `C ${X(22)} ${Y(51.5)} ${X(13)} ${Y(45)} ${X(13)} ${Y(34)} ` +
    `L ${X(13)} ${Y(18.5)} Z`;

  let franjas =
    `<rect x="${X(13)}" y="${Y(11)}" width="${38 * e}" height="${46 * e}" fill="${AMARILLO}"/>`;
  for (let i = 0; i < 5; i++) {
    const fx = 13.8 + i * 7.6;
    franjas +=
      `<rect x="${X(fx)}" y="${Y(11)}" width="${3.8 * e}" height="${46 * e}" fill="${ROJO}"/>`;
  }

  const texto = lema
    ? `<text x="${cx}" y="${Y(62.5)}" font-family="Helvetica,Arial,sans-serif" ` +
      `font-size="${5.2 * e}" font-weight="700" fill="${NARANJA}" ` +
      `text-anchor="middle" letter-spacing="${1.1 * e}">DES DE 1931</text>`
    : '';

  return `
    <path id="sh" d="${forma}" fill="#FFFFFF"/>
    <clipPath id="cl"><use xlink:href="#sh" href="#sh"/></clipPath>
    <g clip-path="url(#cl)">${franjas}</g>
    <path d="${forma}" fill="none" stroke="${NEGRO}" stroke-width="${2.4 * e}"/>
    <ellipse cx="${cx}" cy="${Y(32)}" rx="${10 * e}" ry="${6 * e}"
             transform="rotate(-38 ${cx} ${Y(32)})"
             fill="${NARANJA}" stroke="${NEGRO}" stroke-width="${2.1 * e}"/>
    <g stroke="#FFFFFF" stroke-width="${1.6 * e}" stroke-linecap="round">
      <path d="M ${X(28.4)} ${Y(35.6)} L ${X(35.6)} ${Y(28.4)}"/>
      <path d="M ${X(30.1)} ${Y(31.6)} L ${X(31.7)} ${Y(33.2)}"/>
      <path d="M ${X(32.5)} ${Y(29.2)} L ${X(34.1)} ${Y(30.8)}"/>
    </g>
    ${texto}`;
}

function svgEnv(size, cuerpo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${cuerpo}</svg>`;
}

/* Icono cuadrado clásico: fondo negro, marco naranja, escudo centrado. */
function iconoCuadrado(size) {
  const e = (size / 64) * 0.78;
  const r = size * 0.22;
  return svgEnv(size, `
    <rect width="${size}" height="${size}" rx="${r}" fill="${NEGRO}"/>
    <rect x="${size * 0.03}" y="${size * 0.03}" width="${size * 0.94}"
          height="${size * 0.94}" rx="${r}" fill="none"
          stroke="${NARANJA}" stroke-width="${size * 0.042}"/>
    ${escudo(size / 2, size * 0.47, e, false)}`);
}

/* Icono redondo para los lanzadores que lo piden. */
function iconoRedondo(size) {
  const e = (size / 64) * 0.66;
  return svgEnv(size, `
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${NEGRO}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - size * 0.045}"
            fill="none" stroke="${NARANJA}" stroke-width="${size * 0.045}"/>
    ${escudo(size / 2, size * 0.47, e, false)}`);
}

/* Capa de primer plano del icono adaptativo: solo el escudo, transparente.
   Android recorta esta capa en circulo/rombo, asi que el escudo debe caber en
   la zona segura central: un circulo de 66 de los 108dp, radio 33. El escudo
   mide 38x44 (+2.4 de trazo), su semidiagonal es ~30.3 unidades de la rejilla,
   de ahi el factor maximo: 0.3056 * 64 / 30.3 = 0.645. Con 0.90 el borde
   superior se salia y Android lo recortaba al enmascarar: por eso se veia
   cortado. Y centrado en 0.5, no en 0.47: la zona segura esta centrada en la
   capa, no un poco mas arriba. */
function foregroundAdaptativo(size) {
  const e = (size / 64) * 0.62;
  /* La forma del escudo esta centrada en la unidad 33 de la rejilla (no en la
     32): escudo() la coloca a cy + e, asi que pasando cy = mitad - e queda el
     escudo EXACTAMENTE en el centro de la capa. */
  return svgEnv(size, escudo(size / 2, size * 0.5 - e, e, false));
}

async function png(destino, svg, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(destino);
  const kb = Math.round(fs.statSync(destino).size / 1024);
  console.log(`  ${path.relative(__dirname, destino)}  ${size}x${size}  ${kb} KB`);
}

/* Densidades de Android para el icono del lanzador. */
const DENS = [
  { d: 'mdpi', icono: 48, fg: 108 },
  { d: 'hdpi', icono: 72, fg: 162 },
  { d: 'xhdpi', icono: 96, fg: 216 },
  { d: 'xxhdpi', icono: 144, fg: 324 },
  { d: 'xxxhdpi', icono: 192, fg: 432 },
];

/* Splash: negro con el escudo centrado, para cada orientación y densidad. */
const SPLASH = [
  { d: 'port-mdpi', w: 320, h: 480 },
  { d: 'port-hdpi', w: 480, h: 800 },
  { d: 'port-xhdpi', w: 720, h: 1280 },
  { d: 'port-xxhdpi', w: 960, h: 1600 },
  { d: 'port-xxxhdpi', w: 1280, h: 1920 },
  { d: 'land-mdpi', w: 480, h: 320 },
  { d: 'land-hdpi', w: 800, h: 480 },
  { d: 'land-xhdpi', w: 1280, h: 720 },
  { d: 'land-xxhdpi', w: 1600, h: 960 },
  { d: 'land-xxxhdpi', w: 1920, h: 1280 },
];

function splashSvg(w, h) {
  const lado = Math.min(w, h) * 0.62;
  const e = (lado / 64) * 0.80;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${NEGRO}"/>` +
    escudo(w / 2, h / 2 - lado * 0.06, e, false) +
    `<text x="${w / 2}" y="${h / 2 + lado * 0.58}" font-family="Helvetica,Arial,sans-serif" ` +
    `font-size="${lado * 0.11}" font-weight="700" fill="${NARANJA}" ` +
    `text-anchor="middle" letter-spacing="${lado * 0.02}">DES DE 1931</text>` +
    `</svg>`;
}

async function generar() {
  console.log('Generando iconos Android del Rugby Club Cornellà');

  for (const { d, icono, fg } of DENS) {
    const dir = path.join(RES, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    await png(path.join(dir, 'ic_launcher.png'), iconoCuadrado(icono), icono);
    await png(path.join(dir, 'ic_launcher_round.png'), iconoRedondo(icono), icono);
    await png(path.join(dir, 'ic_launcher_foreground.png'), foregroundAdaptativo(fg), fg);
  }

  /* Icono adaptativo: fondo negro sólido + escudo como primer plano. */
  const any = path.join(RES, 'mipmap-anydpi-v26');
  fs.mkdirSync(any, { recursive: true });
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <background android:drawable="@color/ic_launcher_background"/>\n' +
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n' +
    '</adaptive-icon>\n';
  fs.writeFileSync(path.join(any, 'ic_launcher.xml'), xml);
  fs.writeFileSync(path.join(any, 'ic_launcher_round.xml'), xml);
  console.log('  mipmap-anydpi-v26/ic_launcher.xml  (adaptativo)');

  /* EL COLOR DEL FONDO. El XML de arriba referencia
     @color/ic_launcher_background, y ese color lo crea Capacitor en BLANCO
     (#FFFFFF). El escudo es blanco con contorno negro: sobre blanco se funde
     con el fondo y el icono se ve roto. Si el script no escribe este fichero,
     el icono adaptativo sale con el fondo equivocado. */
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' +
    '    <color name="ic_launcher_background">' + NEGRO + '</color>\n' +
    '</resources>\n');
  console.log('  values/ic_launcher_background.xml  fondo ' + NEGRO);

  /* Splash del drawable por defecto. Capacitor crea uno con su robot gris en
     drawable/: si no se sobreescribe, ese robot asoma en los arranques donde
     no encaja ninguna densidad concreta. */
  fs.mkdirSync(path.join(RES, 'drawable'), { recursive: true });
  await sharp(Buffer.from(splashSvg(480, 800))).resize(480, 800)
    .toFile(path.join(RES, 'drawable', 'splash.png'));
  console.log('  drawable/splash.png  480x800  ' +
    Math.round(fs.statSync(path.join(RES, 'drawable', 'splash.png')).size / 1024) + ' KB');

  /* Icono maskable del manifest WEB (build-icons.py lo genera con cairosvg,
     que en Windows es un problema). El fondo SI puede ir a sangre completa:
     la zona segura solo limita el contenido. Sin lema, por lo mismo que en
     foregroundAdaptativo. */
  const eWeb = (512 / 64) * 0.62;
  await png(path.join(__dirname, 'icon-maskable-512.png'),
    svgEnv(512, `<rect width="512" height="512" fill="${NEGRO}"/>` +
      escudo(256, 256 - eWeb, eWeb, false)), 512);

  for (const { d, w, h } of SPLASH) {
    const dir = path.join(RES, `drawable-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    const destino = path.join(dir, 'splash.png');
    await sharp(Buffer.from(splashSvg(w, h)))
      .resize(w, h)
      .png()
      .toFile(destino);
    const kb = Math.round(fs.statSync(destino).size / 1024);
    console.log(`  drawable-${d}/splash.png  ${w}x${h}  ${kb} KB`);
  }

  console.log('Listo.');
}

if (require.main === module) {
  generar().catch(e => {
    console.error('Fallo generando iconos:', e);
    process.exit(1);
  });
}

module.exports = { escudo, svgEnv, iconoCuadrado, iconoRedondo, foregroundAdaptativo, splashSvg, generar };
