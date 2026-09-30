/* ============================================================================
   Service worker — modo sin conexión
   ----------------------------------------------------------------------------
   Guarda los archivos para que la app abra igual sin cobertura, que es lo
   normal en un campo de rugby.

   Estrategia: cache primero para los archivos propios, red para el resto, con
   dos excepciones que importan:
     · js/config.js va SIEMPRE por red primero. Si no, un dispositivo que ya
       tiene la configuración vieja(cacheada) seguiría arrancando sin servidor
       después de que alguien la rellenara.
     · el paquete de Supabase se pide a jsdelivr, así que nunca se sustituye por
       la página de inicio cuando no hay red: eso devolvería HTML donde el
       navegador espera JavaScript.
   ============================================================================ */
/* v6: se ha añadido js/fcm.js (avisos push) y se ha fijado la versión de
   supabase-js. Al subir este número, el activate borra la caché vieja: por eso
   hay que subirlo en cada cambio, aunque el nombre del fichero no cambie. */
const CACHE = 'rccornella-v13';
const ARCHIVOS = [
  './', './index.html', './styles.css', './manifest.json',
  './js/config.js', './js/icons.js', './js/store.js', './js/ui.js', './js/gate.js',
  './js/coach.js', './js/family.js', './js/match.js', './js/board.js',
  './js/backend.js', './js/fcm.js', './js/shell.js',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './apple-touch-icon.png', './favicon.png'
];

/* Ficheros que tienen que estar al día siempre, aunque haya copia en el caché. */
const SIEMPRE_FRESCO = ['/js/config.js'];

const esFresco = u => SIEMPRE_FRESCO.some(p => u.pathname.endsWith(p));

/* ---------------------------------------------------------------------------
   Avisos push
   ---------------------------------------------------------------------------
   El service worker tiene que vivir en el origen (no en un CDN) porque es quien
   recibe el push. La app no usa un worker aparte: usa este mismo, así que los
   avisos y el modo sin conexión no se pelean por el mismo sitio.

   Hay que poner dos cosas en el payload al enviar:
     · notification → el móvil pinta la notificación sin nuestra ayuda.
     · data.url     → al tocarla, `notificationclick` decide a dónde ir.
   Si solo se manda `data`, no aparece nada: el sistema no inventa el aviso.
   --------------------------------------------------------------------------- */

self.addEventListener('push', e => {
  if (!e.data) return;
  let aviso = {};
  try { aviso = e.data.json() || {}; } catch(err) { aviso = {}; }

  const titulo  = aviso.titulo  || 'Rugby Club Cornellà';
  const cuerpo  = aviso.cuerpo  || '';
  const destino = aviso.url     || '/';
  const tag     = aviso.tag     || 'rcc';

  // Con `tag` se agrupan los avisos iguales: cinco confirmaciones pendientes
  // dejan una sola notificación, no cinco. Con `renotify` el contador se
  // actualiza, que es justo lo que se quiere en un recordatorio.
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: tag,
      renotify: true,
      vibrate: [90, 40, 90],
      data: { url: destino },
      requireInteraction: !!aviso.importante
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(listas => {
      // Si la app ya está abierta, se lleva a la pantalla de pedidos y no se
      // abre una pestaña nueva: nadie quiere tres copias del club en el móvil.
      for(const c of listas){
        if(new URL(c.url).origin === self.location.origin){
          c.focus();
          c.postMessage({ tipo:'navegar', url:destino });
          return;
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});

/* Si el service worker se queda dormido y el navegador lo despierta con una
   notificación ya montada, se reconstruye igual. Es un caso raro pero ocurre
   en Android y produce notificaciones en blanco, que parecen un fallo. */
self.addEventListener('notificationclose', () => {});

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

  const url = new URL(e.request.url);
  const deOtroSitio = !url.origin.startsWith(self.location.origin);

  // La configuración manda en la red. Sin red, se usa la copia, que para eso está.
  if (esFresco(url)) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r && r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copia));
          }
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

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
          if (r && r.ok && !deOtroSitio) {
            const copia = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copia));
          }
          return r;
        })
        .catch(() => {
          // Solo tiene sentido devolver la app cuando lo que fallaba era
          // navegación. Devolver index.html en cualquier otro caso rompe cosas
          // de forma difícil de diagnosticar.
          if (e.request.mode === 'navigate') return caches.match('./index.html');
          throw new Error('Sin conexión');
        });
    })
  );
});

/* Los handlers de `push` y `notificationclick` están más arriba, en este mismo
   fichero. La app registra este service worker también para el modo sin
   conexión, y las dos cosas funcionan con el mismo. */
