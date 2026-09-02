// SOH Match Centre service worker.
// Handles incoming push notifications.

self.addEventListener('push', (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(
      data?.title || 'SOH Match Centre',
      {
        body: data?.body || 'There is a new match update.',
        icon: '/soh-crest.png',
      }
    )
  );
});
