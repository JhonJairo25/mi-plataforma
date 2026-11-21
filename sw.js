// Service worker de Mi Plataforma
// - Páginas (index.html): PRIMERO INTERNET. Con conexión siempre ves la última
//   versión subida a GitHub; sin conexión se usa la copia guardada.
// - Íconos y fuentes: primero la copia guardada (no cambian).
// - API de GitHub (sincronización): nunca se guarda en caché.
const CACHE_NAME = 'mi-plataforma-v22';
const FILES_TO_CACHE = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
];
const NETWORK_TIMEOUT_MS = 5000; // con internet muy lento, a los 5 s usa la copia

self.addEventListener('install', (event) => {
  // Cada archivo por separado: si uno falta, los demás se guardan igual
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    Promise.allSettled(FILES_TO_CACHE.map((f) => cache.add(f)))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

function guardar(req, resp) {
  if (resp && (resp.ok || resp.type === 'opaque')) {
    const copia = resp.clone();
    caches.open(CACHE_NAME).then((c) => c.put(req, copia));
  }
  return resp;
}

function desdeCache(req) {
  return caches.match(req, { ignoreSearch: true })
    .then((r) => r || caches.match('./index.html'));
}

function primeroInternet(req) {
  const red = fetch(req, { cache: 'no-store' }).then((resp) => guardar(req, resp));
  red.catch(() => {}); // evita avisos de error si gana la copia guardada
  const respaldo = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS))
    .then(() => caches.match(req, { ignoreSearch: true }))
    .then((r) => r || red); // si no hay copia, seguir esperando a internet
  return Promise.race([red, respaldo]).catch(() => desdeCache(req));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.github.com') return; // sincronización: siempre directo

  const mismoSitio = url.origin === self.location.origin;
  const esPagina = req.mode === 'navigate' ||
    (mismoSitio && /(\.html|\.webmanifest|\/)$/.test(url.pathname));

  if (esPagina) {
    event.respondWith(primeroInternet(req));
    return;
  }
  const esEstatico = (mismoSitio && /\.(png|svg|ico|mp3|m4a)$/.test(url.pathname)) ||
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (esEstatico) {
    event.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => guardar(req, resp))));
  }
  // Todo lo demás (enlaces externos, etc.): el navegador lo maneja normal
});
