/* Офлайн-кэш. При изменении файлов курса увеличьте VERSION. */
const VERSION = 'arablearn-20261016-154344';
const FILES = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/util.js', 'js/audio.js', 'js/state.js', 'js/course.js', 'js/levels.js', 'js/lesson.js', 'js/app.js',
  'data/script.js', 'data/a1.js', 'data/a2.js', 'data/b1.js', 'data/b2.js',
  'fonts/naskh-400.woff2', 'fonts/naskh-700.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// сеть в приоритете (чтобы обновления приходили сразу), кэш — если офлайн
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
