// This worker handles customer promotions only. It does not cache orders or receipts.
const origin = self.location.origin;
function safeUrl(value) {
  try { const url = new URL(value || '/', origin); return url.origin === origin ? url.href : origin; } catch { return origin; }
}
async function firstDelivery(id) {
  if (!id) return true;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('fabrizzitos-promotions', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('seen');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('seen', 'readwrite'), store = tx.objectStore('seen'); let fresh = false;
      const query = store.get(id);
      query.onsuccess = () => { if (!query.result) { fresh = true; store.put(Date.now(), id); } };
      tx.oncomplete = () => resolve(fresh); tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
self.addEventListener('push', event => event.waitUntil((async () => {
  let data; try { data = event.data?.json(); } catch { return; }
  if (!data || typeof data.title !== 'string' || typeof data.body !== 'string') return;
  if (!await firstDelivery(data.campaignId)) return;
  await self.registration.showNotification(data.title.slice(0, 80), { body: data.body.slice(0, 200), icon: '/images/icon-192.png', badge: '/images/icon-192.png', tag: `fabrizzitos-promo-${data.campaignId || 'notice'}`, data: { url: safeUrl(data.url) } });
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = safeUrl(event.notification.data?.url);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === origin);
    if (existing) { await existing.navigate(target); await existing.focus(); } else await self.clients.openWindow(target);
  })());
});
