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
