const CACHE_NAME = 'nglobal-v5'; 
const LOGO_URL = new URL('icon-192.png', self.registration.scope).href;

const STATIC_ASSETS = [
  new URL('index.html', self.registration.scope).href,
  new URL('manifest.json', self.registration.scope).href
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
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope) ||
      url.pathname.includes('/api/') || event.request.method !== 'GET' ||
      event.request.headers.has('Authorization')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response.ok || response.headers.get('Cache-Control')?.includes('no-store')) return response;
          return caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, response.clone());
             return response;
          });
        })
        .catch(() => {
          return caches.match(new URL('index.html', self.registration.scope).href);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic' && !networkResponse.headers.get('Cache-Control')?.includes('no-store')) {
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
  const title = typeof data?.title === 'string' ? data.title : 'nglobal Logistics';
  const isCritical = title.includes('ALERTA') || title.includes('EXCURSIÓN');
  const vibratePattern = isCritical ? [200, 100, 200, 100, 200, 500, 500, 100, 500, 100, 500, 500, 200, 100, 200, 100, 200] : [200, 100, 200];

  const options = {
    body: typeof data?.body === 'string' ? data.body : 'Nueva actividad en el sistema.',
    icon: LOGO_URL,
    badge: LOGO_URL,
    vibrate: vibratePattern,
    tag: isCritical ? 'ng-critical' : 'ng-alert',
    renotify: true,
    data: {
      url: typeof data?.url === 'string' ? data.url : './'
    },
    // BLOQUE NUEVO: Acciones rápidas desde la notificación
    actions: [
      { action: 'open_app', title: '📱 Abrir Consola' },
      { action: 'ignore', title: '✖ Ignorar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // BLOQUE NUEVO: Manejo de acciones específicas
  if (event.action === 'ignore') return;

  const scope = self.registration.scope;
  let destination = scope;
  try {
    const target = new URL(event.notification.data?.url || './', scope);
    if (target.href.startsWith(scope)) destination = target.href;
  } catch { /* Open the application home when the notification URL is invalid. */ }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const windowClient = windowClients.find(client => client.url.startsWith(scope));
      return windowClient ? windowClient.focus() : clients.openWindow(destination);
    })
  );
});