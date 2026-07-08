const CACHE_VERSION = 'v3'; // <-- SUBE ESTE NÚMERO EN CADA RELEASE (v3, v4, v5...)
const CACHE_NAME = `pk-geoloc-cache-${CACHE_VERSION}`;

const ASSETS = [
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

// Instalar el Service Worker, guardar archivos esenciales y activar de inmediato
self.addEventListener('install', (e) => {
  self.skipWaiting(); // no esperar a que se cierren las pestañas/instancias viejas
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activar: limpiar cachés antiguas y tomar el control de los clientes ya abiertos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim(); // controla las pestañas abiertas sin esperar recarga
    })()
  );
});

// Interceptar peticiones
self.addEventListener('fetch', (e) => {
  // Para la navegación (el HTML principal): red primero, caché como respaldo offline.
  // Esto es clave para que la gente vea SIEMPRE la versión nueva si tiene conexión.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          // Actualiza la caché con la respuesta fresca
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Para el resto de assets (css, js, imágenes, etc.): caché primero, red como respaldo
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(e.request).then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return networkResponse;
        })
      );
    })
  );
});
