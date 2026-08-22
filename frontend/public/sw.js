// Planora Background Service Worker for Desktop System Notifications (Google Calendar style)
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Handle click on native desktop / OS notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/calendar'
  const eventId = event.notification.data?.eventId
  const startTime = event.notification.data?.startTime

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a Planora tab is already open, focus it and notify
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'PLANORA_NOTIFICATION_CLICK',
            eventId,
            startTime,
            url: targetUrl,
          })
          return client.focus()
        }
      }
      // If no tab is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
