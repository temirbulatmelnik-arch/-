/* Only the browser's Push API can trigger this handler. Keep notification text generic. */
self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (!data || typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id)) return;
  const title = data.test ? 'Курс · Проверка Web Push' : 'Курс · Напоминание';
  const body = data.test ? 'Получено фоновое уведомление.' : 'Откройте «Курс» и проверьте ближайшие обязательства.';
  event.waitUntil(self.registration.showNotification(title, { body, tag: data.id, data: { id: data.id } }));
});

self.addEventListener('notificationclick', event => {
  const id = event.notification.data?.id;
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return;
  event.notification.close();
  const url = new URL(self.registration.scope);
  url.searchParams.set('reminder', id);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const client = windows.find(window => window.url.startsWith(self.registration.scope));
    if (client) { await client.navigate(url.href); await client.focus(); }
    else await self.clients.openWindow(url.href);
  }));
});
