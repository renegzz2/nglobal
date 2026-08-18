import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Service worker only runs in production. In local development it can keep
// serving stale HTML/modules and leave the UI on a blank shell.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith('nglobal-'))
              .map((cacheName) => caches.delete(cacheName))
          );
        }

        console.log('[SISTEMA] Service worker desactivado en desarrollo.');
      } catch (error) {
        console.error('[SISTEMA] No se pudo limpiar service workers/caches en desarrollo:', error);
      }
      return;
    }

    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('[SISTEMA] Motor de Escucha activo en el scope:', registration.scope);
      })
      .catch((error) => {
        console.error('[SISTEMA] Error de registro del motor:', error);
      });
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
