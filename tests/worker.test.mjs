import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { firstAvailableDate, availableTimes, addDays } from '../shared/booking.mjs';

let mf, db, bucket;
const date = firstAvailableDate();
const base = { kekeQty: 1, shakeQty: 0, fulfillment: 'pickup', date, time: availableTimes(date)[0], name: 'Prueba automática', phone: '955000001', address: '', district: '', payment: 'later', accepted: true };
function form(booking, file) { const data = new FormData(); data.set('booking', JSON.stringify(booking)); if (file) data.set('receipt', file, 'prueba.png'); return data; }
async function send(booking = base, { key = crypto.randomUUID(), file } = {}) {
  const request = new Request('https://test.local/api/reservations', { method: 'POST', headers: { 'Idempotency-Key': key, Origin: 'https://test.local' }, body: form(booking, file) });
  return mf.dispatchFetch(request.url, { method: 'POST', headers: Object.fromEntries(request.headers), body: new Uint8Array(await request.arrayBuffer()) });
}

before(async () => {
  const output = await build({ entryPoints: ['worker/index.mjs'], write: false, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', define: { __STATIC_ASSETS__: '{}' } });
  mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-08-06', d1Databases: { DB: 'fabrizzitos-test' }, r2Buckets: ['RECEIPTS'], bindings: { LOCAL_PREVIEW: 'true' } });
  db = await mf.getD1Database('DB'); bucket = await mf.getR2Bucket('RECEIPTS');
  for (const sql of (await readFile('migrations/0001_initial.sql', 'utf8')).replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
});
after(async () => { await mf?.dispose(); });

test('guarda reserva sin pago y un evento pendiente para el panel', async () => {
  const response = await send(); assert.equal(response.status, 201);
  const result = await response.json(); assert.equal(result.paymentStatus, 'unpaid'); assert.equal(result.total, 400);
  const row = await db.prepare('SELECT * FROM reservations WHERE id = ?').bind(result.id).first(); assert.equal(row.receipt_key, null);
  const events = await db.prepare('SELECT * FROM admin_events WHERE reservation_id = ?').bind(result.id).all(); assert.equal(events.results.length, 1); assert.equal(events.results[0].delivery_status, 'pending');
});
test('reintentar no duplica la reserva ni descuenta stock dos veces', async () => {
  const key = crypto.randomUUID();
  const a = await send(base, { key }); const b = await send(base, { key });
  assert.equal(a.status, 201); assert.equal(b.status, 200);
  assert.equal((await a.json()).reference, (await b.json()).reference);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM reservations WHERE request_key = ?').bind(key).first()).n, 1);
  const mismatch = await send({ ...base, kekeQty: 2 }, { key }); assert.equal(mismatch.status, 409);
});
test('dos pedidos simultáneos no pueden superar los 15 kekitos del día', async () => {
  const nextDate = addDays(date, 7);
  const booking = { ...base, date: nextDate, time: '18:00', kekeQty: 8 };
  const responses = await Promise.all([send(booking), send(booking)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  const row = await db.prepare("SELECT SUM(keke_qty) AS n FROM reservations WHERE booking_date = ? AND reservation_status <> 'cancelled'").bind(nextDate).first(); assert.equal(row.n, 8);
});
test('almacena el comprobante privado en R2 y pide revisión, nunca aprobación automática', async () => {
  const file = new File([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1])], 'prueba.png', { type: 'image/png' });
  const response = await send({ ...base, payment: 'yape' }, { file }); assert.equal(response.status, 201);
  const result = await response.json(); assert.equal(result.paymentStatus, 'pending_review');
  const row = await db.prepare('SELECT receipt_key,receipt_sha256 FROM reservations WHERE id = ?').bind(result.id).first(); assert.ok(row.receipt_sha256); assert.ok(await bucket.head(row.receipt_key));
  const events = await db.prepare('SELECT event_type FROM admin_events WHERE reservation_id = ?').bind(result.id).all(); assert.equal(events.results.length, 2);
  assert.equal((await mf.dispatchFetch(`https://test.local/${row.receipt_key}`)).status, 404);
});
test('rechaza archivos falsos, pagos sin foto, delivery de batidos y solicitudes de otro origen', async () => {
  assert.equal((await send({ ...base, payment: 'yape' })).status, 400);
  const file = new File(['<html>archivo inválido</html>'], 'fake.png', { type: 'image/png' });
  assert.equal((await send({ ...base, payment: 'yape' }, { file })).status, 400);
  assert.equal((await send({ ...base, fulfillment: 'delivery', shakeQty: 1, district: 'Jesús María', address: 'Calle prueba 123' })).status, 400);
  const response = await mf.dispatchFetch('https://test.local/api/reservations', { method: 'POST', headers: { Origin: 'https://otro.local', 'Idempotency-Key': crypto.randomUUID() }, body: form(base) }); assert.equal(response.status, 403);
});
test('disponibilidad refleja las cantidades reservadas y solo entrega datos agregados', async () => {
  const response = await mf.dispatchFetch(`https://test.local/api/availability?month=${date.slice(0, 7)}`); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.days[date].remaining, 12); assert.equal(JSON.stringify(result).includes('phone'), false);
});
