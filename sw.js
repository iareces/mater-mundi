const CACHE = 'mater-mundi-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Solo cachear GET, ignorar Supabase, Stripe y APIs externas
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  if (url.includes('supabase.co') || url.includes('stripe.com') || url.includes('googleapis') || url.includes('onesignal')) return;

  e.respondWith(
    fetch(e.request)
      .then(function(res) {
        // Cachear respuestas válidas de nuestro propio dominio
        if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, copy); });
        }
        return res;
      })
      .catch(function() {
        // Sin conexión: servir desde caché
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/index.html');
        });
      })
  );
});
