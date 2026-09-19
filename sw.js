/* Service worker: o app abre mesmo sem internet (os dados sincronizam quando a conexão volta). */
const VERSION = '1.2.0';
const CACHE = `rocks-hero-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/fonts.css', 'css/base.css', 'css/components.css', 'css/views.css', 'css/print.css',
  'js/version.js', 'js/constants.js', 'js/util.js', 'js/firebase-config.js',
  'js/sync-local.js', 'js/sync-firebase.js', 'js/store.js', 'js/icons.js', 'js/ui.js',
  'js/chart.js', 'js/lyrics.js', 'js/metronome.js',
  'js/song-sheet.js', 'js/catalog.js', 'js/dnd.js', 'js/setlist.js', 'js/stage.js', 'js/rehearsals.js',
  'js/band.js', 'js/login.js', 'js/app.js',
  'data/songs.js', 'data/games.js', 'data/song-meta.js', 'data/song-extra.js',
  'vendor/firebase-rh.js',
  'assets/fonts/metal-mania-latin.woff2', 'assets/fonts/metal-mania-latin-ext.woff2',
  'assets/fonts/oswald-latin.woff2', 'assets/fonts/oswald-latin-ext.woff2',
  'assets/fonts/permanent-marker-latin.woff2',
  'assets/logo/rocks-hero.svg', 'assets/logo/favicon.svg', 'assets/logo/apple-touch-icon.png',
  'assets/logo/icon-192.png', 'assets/logo/icon-512.png',
  'assets/art/crowd.svg', 'assets/art/amp.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rocks-hero-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firebase e outros serviços seguem direto pela rede

  // Página: rede primeiro (pega a versão nova), cache se estiver offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('index.html', copy));
          return response;
        })
        .catch(() => caches.match('index.html', { ignoreSearch: true })),
    );
    return;
  }

  // Arquivos: responde do cache e atualiza em segundo plano.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(url.pathname.endsWith('/') ? request : new Request(url.origin + url.pathname), response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
