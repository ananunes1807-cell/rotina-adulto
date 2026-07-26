const CACHE_NAME = 'rotina-adulto-v6';
const FILES = [
  './index.html',
  './styles.css?v=7',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    // 'no-store' força ignorar o cache HTTP do navegador — sem isso, o
    // fetch() abaixo podia devolver uma resposta antiga mesmo com o app
    // publicado de novo, dando a impressão de que o deploy não "pegou".
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        const copia = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------- Notificação push (FCM) ----------
// O Cloudflare Worker manda a mensagem pro FCM, o FCM entrega aqui.
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = {}; }
  const titulo = payload.notification?.title || 'Rotina';
  const corpo = payload.notification?.body || 'Hora de uma tarefa.';
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: payload.data?.tarefaId || 'rotina-lembrete',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const existente = clientsArr.find(c => c.url.includes(self.registration.scope));
      if (existente) return existente.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
