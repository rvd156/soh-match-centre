// SOH Match Centre service worker.

self.addEventListener('push', (event) => {
  let data = {}

  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { body: event.data.text() }
    }
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'SOH Match Centre',
      {
        body: data.body || 'There is a new match update.',
        icon: '/soh-crest.png',
        tag: data.tag,
        data: {
          url: data.url || '/live'
        }
      }
    )
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const destination = new URL(
    event.notification.data?.url || '/live',
    self.location.origin
  ).href

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(async openWindows => {
        for (const windowClient of openWindows) {
          if (new URL(windowClient.url).origin === self.location.origin) {
            await windowClient.navigate(destination)
            return windowClient.focus()
          }
        }

        return clients.openWindow(destination)
      })
  )
})
