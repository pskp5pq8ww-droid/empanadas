self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Sin interceptar peticiones: los movimientos siempre se confirman contra el servidor.
