self.addEventListener('push', event => {
  let message = { title: 'Keepsake', body: 'You have something worth remembering.' }
  try {
    if (event.data) message = { ...message, ...event.data.json() }
  } catch {
    if (event.data) message.body = event.data.text()
  }
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    icon: '/keepsake-icon.svg',
    badge: '/keepsake-icon.svg',
    data: { url: message.url || '/' },
    tag: message.tag || 'keepsake-reminder',
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'))
})

// App-shell caching for the installed app. API traffic is never cached;
// navigation and static assets fall back to the last saved shell offline.
const SHELL_CACHE = 'keepsake-shell-v1'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.add('/')).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== SHELL_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api')) return
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone()
        caches.open(SHELL_CACHE).then(cache => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request).then(match => match || caches.match('/'))),
  )
})
