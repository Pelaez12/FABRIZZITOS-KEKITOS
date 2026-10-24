import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { queueStatement, deliverReservation, reservationPayload, flexqrConfigured } from '../worker/flexqr.mjs';

let mf, db;
const fakeToken = 'test-only-fake-token';
const company = 'e6d10ec9-9d77-403e-ac6f-9273721fb713';
const now = new Date('2026-11-01T12:00:00Z');
const row = id => ({ id, reference: `FK-${id}`, customer_name: 'Prueba de integración', phone: '955000001', fulfillment: 'pickup', address: '', keke_qty: 2, shake_qty: 1, payment_status: 'pending_review', slot_at: '2026-11-04T23:00:00Z', total_cents: 2000, created_at: '2026-11-01T11:00:00Z' });
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test"); } }', compatibilityDate: '2026-08-06', d1Databases: { DB: 'outbox-test' } });
  db = await mf.getD1Database('DB');
  for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) {
    for (const sql of (await readFile(`migrations/${file}`, 'utf8')).replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  }
});
after(async () => { await mf?.dispose(); });
async function queue(id) {
  const r = row(id);
  await db.prepare(`INSERT INTO reservations (id,reference,request_key,payload_hash,customer_name,phone,fulfillment,booking_date,booking_time,slot_at,keke_qty,shake_qty,total_cents,payment_status,notice_accepted,created_at) VALUES (?,?,?,?,?,?,'pickup','2026-11-04','18:00',?,2,1,2000,'pending_review',1,?)`).bind(id, r.reference, id, 'test-hash', r.customer_name, r.phone, r.slot_at, r.created_at).run();
  await queueStatement({ DB: db }, r).run();
  return r;
}
function env(fetch) { return { DB: db, FLEXQR_COMPANY_ID: company, FLEXQR_INBOX_TOKEN: fakeToken, FLEXQR_PANEL: { fetch } }; }

test('envía solo el contrato v1 por el servidor y persiste el acuse', async () => {
  const r = await queue('accepted');
  let calls = 0;
  const e = env(async (url, init) => {
    calls++;
    assert.equal(url, 'https://panel.comunidadfortaleza.com/api/platform/internal/inbox');
    assert.equal(init.headers.Authorization, `Bearer ${fakeToken}`); assert.equal(init.headers['X-Flexqr-Company'], company);
    assert.equal(init.redirect, 'manual');
    const payload = JSON.parse(init.body); assert.deepEqual(payload, reservationPayload(r)); assert.equal(payload.kind, 'reservation'); assert.equal(payload.amountCents, 2000);
    assert.equal(init.body.includes(fakeToken), false); assert.equal(init.body.includes('receipt_key'), false);
    return Response.json({ received: true, id: 'panel-id-1' }, { status: 201 });
  });
  assert.equal((await deliverReservation(e, r.id, now)).state, 'sent');
  assert.equal((await deliverReservation(e, r.id, now)).state, 'not_due'); assert.equal(calls, 1);
  assert.equal((await db.prepare('SELECT panel_id FROM flexqr_outbox WHERE reservation_id=?').bind(r.id).first()).panel_id, 'panel-id-1');
});
test('un timeout conserva ID y contenido y admite el acuse duplicado 200', async () => {
  const r = await queue('timeout'); const bodies = [];
  const e = env(async (url, init) => { bodies.push(init.body); throw new Error('simulated timeout'); });
  assert.equal((await deliverReservation(e, r.id, now)).state, 'retry');
  e.FLEXQR_PANEL.fetch = async (url, init) => { bodies.push(init.body); return Response.json({ received: true, id: 'panel-saved-before-timeout', duplicate: true }, { status: 200 }); };
  assert.equal((await deliverReservation(e, r.id, new Date(now.getTime() + 60000))).state, 'sent'); assert.equal(bodies[0], bodies[1]);
});
test('un 200 sin received=true nunca marca enviado', async () => {
  const r = await queue('invalid-ack');
  const e = env(async () => Response.json({ ok: true }, { status: 200 }));
  assert.equal((await deliverReservation(e, r.id, now)).state, 'retry');
});
test('respeta Retry-After y evita envíos simultáneos de la misma reserva', async () => {
  const r = await queue('rate-limit'); let calls = 0;
  const e = env(async () => { calls++; return Response.json({}, { status: 429, headers: { 'Retry-After': '300' } }); });
  const states = await Promise.all([deliverReservation(e, r.id, now), deliverReservation(e, r.id, now)]);
  assert.equal(calls, 1); assert.ok(states.some(s => s.state === 'not_due'));
  const saved = await db.prepare('SELECT next_attempt_at FROM flexqr_outbox WHERE reservation_id=?').bind(r.id).first(); assert.equal(saved.next_attempt_at, new Date(now.getTime() + 300000).toISOString());
});
test('un error permanente queda bloqueado y una clave ausente no consume intentos', async () => {
  const r = await queue('bad-payload');
  assert.equal((await deliverReservation(env(async () => Response.json({}, { status: 400 })), r.id, now)).state, 'blocked');
  const missing = await queue('missing-token');
  assert.equal((await deliverReservation({ DB: db }, missing.id, now)).state, 'not_configured');
  assert.equal((await db.prepare('SELECT attempts FROM flexqr_outbox WHERE reservation_id=?').bind(missing.id).first()).attempts, 0);
  assert.equal(flexqrConfigured({ ...env(() => {}), LOCAL_PREVIEW: 'true' }), false);
});
