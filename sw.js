/* ============================================================================
   Service worker — modo sin conexión
   ----------------------------------------------------------------------------
   La app no necesita servidor: todos los datos viven en el dispositivo. Este
   worker guarda los archivos para que abra igual sin cobertura, que es lo
   normal en un campo de rugby.
   Estrategia: cache primero para los archivos propios, red para el resto.
   ============================================================================ */
const CACHE = 'rccornella-v4';
const ARCHIVOS = [
  './', './index.html', './styles.css', './manifest.json',
  './js/icons.js', './js/store.js', './js/ui.js', './js/gate.js',
  './js/coach.js', './js/family.js', './js/match.js', './js/board.js',
  './js/shell.js',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './apple-touch-icon.png', './favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) {
        // se refresca en segundo plano para la próxima vez
        fetch(e.request).then(r => {
          if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request)
        .then(r => {
          if (r && r.ok && e.request.url.startsWith(self.location.origin)) {
            const copia = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copia));
          }
          return r;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
