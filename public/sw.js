// AlertaInvest Service Worker v1
const CACHE = 'alertainvest-v1';
const STATIC = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return; // nunca cacheia API
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || '⚡ OPORTUNIDADE!', {
      body: data.body || 'Uma ação atingiu seu alvo de compra!',
      icon: data.icon || '',
      tag: data.tag || 'alerta',
      renotify: true,
      vibrate: [300, 100, 300, 100, 600],
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(cs => {
      if (cs.length) return cs[0].focus();
      return clients.openWindow('./');
    })
  );
});
