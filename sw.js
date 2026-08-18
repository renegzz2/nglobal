const CACHE_NAME = 'nglobal-v4'; 
const LOGO_URL = 'https://sucvgevhsmxrpkpvrblm.supabase.co/storage/v1/object/public/storage/logong.jpeg';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.href.includes('supabase.co') || 
      url.href.includes('generativelanguage.googleapis.com') ||
      event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, response.clone());
             return response;
          });
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
            });
        }
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});

// MI DIOS: MOTOR DE NOTIFICACIONES REFORZADO (v4.2)
self.addEventListener('push', (event) => {
  let data = { title: 'nglobal Logistics', body: 'Nueva actividad en el sistema.' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // REGLA JEFE: Patrón de vibración SOS para alertas críticas (TEMPERATURA)
  const isCritical = data.title.includes('ALERTA') || data.title.includes('EXCURSIÓN');
  const vibratePattern = isCritical ? [200, 100, 200, 100, 200, 500, 500, 100, 500, 100, 500, 500, 200, 100, 200, 100, 200] : [200, 100, 200];

  const options = {
    body: data.body,
    icon: LOGO_URL,
    badge: LOGO_URL,
    vibrate: vibratePattern,
    tag: isCritical ? 'ng-critical' : 'ng-alert',
    renotify: true,
    data: {
      url: data.url || '/'
    },
    // BLOQUE NUEVO: Acciones rápidas desde la notificación
    actions: [
      { action: 'open_app', title: '📱 Abrir Consola' },
      { action: 'ignore', title: '✖ Ignorar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // BLOQUE NUEVO: Manejo de acciones específicas
  if (event.action === 'ignore') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      return clients.openWindow(event.notification.data.url);
    })
  );
});