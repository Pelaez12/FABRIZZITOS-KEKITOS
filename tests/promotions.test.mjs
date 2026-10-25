import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { pushRoutes, COMPANY, ORIGIN, calendarDay, billingAccess, validateSubscription } from '../worker/promotions.mjs';
let mf, db, env, ip = 0;
const NOW = Date.parse('2026-10-24T20:00:00Z');
const EXPIRES = Date.parse('2026-11-22T05:00:00Z');
const message = { title: 'Prueba simulada', body: 'No se envía a personas.', url: '/' };
const subscription = (id = crypto.randomUUID()) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } });
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-08-06', d1Databases: { DB: 'push-tests' } });
  db = await mf.getD1Database('DB');
  for (const sql of (await readFile('migrations/0003_customer_promotions.sql', 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
});
after(async () => mf?.dispose());
beforeEach(async () => {
  for (const table of ['promotion_deliveries', 'promotion_campaigns', 'promotion_previews', 'promotion_subscriptions', 'promotion_rate_limits']) await db.prepare(`DELETE FROM ${table}`).run();
  env = { DB: db, BILLING_GATE_TOKEN: 'mock-only-token', VAPID_PUBLIC_KEY: 'mock-public', VAPID_PRIVATE_KEY: 'mock-private', VAPID_SUBJECT: 'https://example.test', FLEXQR_PANEL: { fetch: async (url, init) => { assert.ok(url.endsWith(`?company=${COMPANY}`)); assert.equal(init.headers.Authorization, 'Bearer mock-only-token'); return Response.json({ allowed: true, phase: 'active', expiresAt: EXPIRES }); } } };
});
async function call(path, body = {}, options = {}) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer mock-only-token', 'X-Flexqr-Company': COMPANY, Origin: ORIGIN, 'CF-Connecting-IP': `test-${++ip}`, ...options.headers };
  const method = options.method || 'POST';
  const result = await pushRoutes(new Request(ORIGIN + '/api/push/' + path, { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), options.env || env, { now: options.now ?? NOW, send: options.send || (async () => { throw new Error('Unexpected send'); }) });
  return { status: result.status, data: await result.json() };
}
const subscribe = (sub = subscription(), options) => call('subscribe', { subscription: sub, consent: true, consentVersion: 'promotions-v1', permission: 'granted' }, options);
async function previewAndConfirm(options = {}) {
  const preview = await call('campaigns', message, options); assert.equal(preview.status, 200);
  return call('campaigns', { ...message, confirm: true, previewId: preview.data.previewId }, options);
}
test('config no revela secretos y falla cerrado si falta la clave compartida', async () => {
  const result = await call('config', {}, { method: 'GET', env: { ...env, BILLING_GATE_TOKEN: undefined } });
  assert.equal(result.data.enabled, false); assert.equal(result.data.reason, 'connection_pending');
  assert.ok(!JSON.stringify(result.data).includes('mock-private'));
});
test('exige consentimiento, versión y permiso; valida origen y proveedor', async () => {
  for (const values of [{ consent: false }, { consentVersion: 'old' }, { permission: 'denied' }, { permission: 'default' }]) {
    assert.equal((await call('subscribe', { subscription: subscription(), consent: true, consentVersion: 'promotions-v1', permission: 'granted', ...values })).status, 400);
  }
  assert.equal((await subscribe(subscription(), { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await subscribe(subscription(), { headers: { Origin: '' } })).status, 403);
  assert.equal(validateSubscription({ ...subscription(), endpoint: 'https://localhost/private' }), false);
  assert.equal(validateSubscription({ ...subscription(), endpoint: 'https://fcm.googleapis.com.evil.test/push' }), false);
  assert.equal((await subscribe()).status, 200);
});
test('limita solicitudes públicas por IP de Cloudflare', async () => {
  for (let n = 0; n < 10; n++) assert.equal((await subscribe(subscription(), { headers: { 'CF-Connecting-IP': 'same' } })).status, 200);
  assert.equal((await subscribe(subscription(), { headers: { 'CF-Connecting-IP': 'same' } })).status, 429);
});
test('superadmin no salta bearer, empresa ni vencimiento', async () => {
  assert.equal((await call('status', {}, { headers: { Authorization: '', 'X-Flexqr-Superadmin': '1' } })).status, 401);
  assert.equal((await call('status', {}, { headers: { 'X-Flexqr-Company': 'another', 'X-Flexqr-Superadmin': '1' } })).status, 403);
  assert.equal((await call('status', {}, { now: EXPIRES, headers: { 'X-Flexqr-Superadmin': '1' } })).status, 402);
  assert.equal((await call('status', {}, { now: EXPIRES - 1 })).status, 200);
  assert.equal((await subscribe(subscription(), { now: EXPIRES })).status, 402);
  await assert.rejects(billingAccess({ ...env, FLEXQR_PANEL: { fetch: async () => { throw Error('offline'); } } }, NOW), /vigencia/);
  assert.equal(calendarDay(EXPIRES - 1), '2026-11-21'); assert.equal(calendarDay(EXPIRES), '2026-11-22');
});
test('500 dispositivos: cuota atómica, renovación y aislamiento de otra empresa', async () => {
  await db.batch(Array.from({ length: 499 }, (_, n) => db.prepare('INSERT INTO promotion_subscriptions VALUES (?,?,?,?,1,?,?,?)').bind(COMPANY, `seed-${n}`, '{}', 'hash', 'promotions-v1', NOW, NOW)));
  await db.prepare('INSERT INTO promotion_subscriptions VALUES (?,?,?,?,1,?,?,?)').bind('another', 'unrelated', '{}', 'hash', 'v1', NOW, NOW).run();
  const subs = [subscription(), subscription()];
  const results = await Promise.all(subs.map(s => subscribe(s))); assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
  const winner = subs[results.findIndex(r => r.status === 200)]; assert.equal((await subscribe(winner)).status, 200);
  assert.equal((await call('status')).data.subscribers, 500);
});
test('vista previa y confirmación no envían; confirmación es persistente e idempotente', async () => {
  await subscribe();
  assert.equal((await call('campaigns', { ...message, confirm: true })).status, 400);
  const preview = await call('campaigns', message); assert.equal(preview.data.eligible, 1);
  assert.equal((await call('campaigns', { ...message, body: 'cambiado', confirm: true, previewId: preview.data.previewId })).status, 409);
  const body = { ...message, confirm: true, previewId: preview.data.previewId };
  const results = await Promise.all([call('campaigns', body), call('campaigns', body)]);
  assert.equal(results[0].status, 202); assert.equal(results[0].data.jobId, results[1].data.jobId);
  assert.equal(results[0].data.pending, 1);
  assert.equal((await call('campaigns', { ...message, url: 'https://evil.test' })).status, 400);
});
test('vistas previas vencidas y cuotas diaria/mensual en Lima', async () => {
  await subscribe(); const preview = await call('campaigns', message);
  assert.equal((await call('campaigns', { ...message, confirm: true, previewId: preview.data.previewId }, { now: NOW + 600001 })).status, 409);
  assert.equal((await previewAndConfirm()).status, 202);
  assert.equal((await previewAndConfirm()).status, 429);
  await db.prepare('DELETE FROM promotion_deliveries').run(); await db.prepare('DELETE FROM promotion_campaigns').run();
  await db.batch(Array.from({ length: 10 }, (_, i) => db.prepare('INSERT INTO promotion_campaigns(company_id,id,preview_id,content_json,content_hash,day,month,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(COMPANY, `seed-${i}`, `preview-${i}`, '{}', 'hash', `2026-10-${String(i + 1).padStart(2, '0')}`, '2026-10', NOW)));
  assert.equal((await previewAndConfirm()).status, 429);
  assert.equal(calendarDay(Date.parse('2026-10-25T01:00:00Z')), '2026-10-24');
});
test('baja verifica propiedad y funciona aunque venza la empresa', async () => {
  const sub = subscription(); await subscribe(sub);
  assert.equal((await call('unsubscribe', { subscription: { ...sub, keys: { ...sub.keys, auth: Buffer.alloc(16, 3).toString('base64url') } } })).status, 403);
  assert.equal((await call('unsubscribe', { subscription: sub }, { now: EXPIRES })).status, 200);
  assert.equal((await call('status')).data.subscribers, 0);
});
test('continuaciones simultáneas y repetidas no duplican entregas; baja antes de enviar', async () => {
  const subs = Array.from({ length: 13 }, () => subscription()); for (const sub of subs) await subscribe(sub);
  const job = (await previewAndConfirm()).data.jobId; await call('unsubscribe', { subscription: subs[0] });
  const sent = new Set();
  const send = async sub => { assert.ok(!sent.has(sub.endpoint)); sent.add(sub.endpoint); return 201; };
  await Promise.all([call(`campaigns/${job}`, {}, { send }), call(`campaigns/${job}`, {}, { send })]);
  const last = await call(`campaigns/${job}`, {}, { send }); assert.equal(last.data.done, true); assert.equal(sent.size, 12); assert.equal(last.data.skipped, 1);
  await call(`campaigns/${job}`, {}, { send }); assert.equal(sent.size, 12);
  assert.equal((await call(`campaigns/${job}`, { action: 'status' })).data.accepted, 12);
  assert.equal((await call('status')).data.campaigns.length, 1);
});
test('errores ambiguos no se reintentan y 410 da de baja el dispositivo', async () => {
  await subscribe(); await subscribe(); const job = (await previewAndConfirm()).data.jobId; let calls = 0;
  const send = async () => { if (++calls === 1) throw Error('timeout'); return 410; };
  const result = await call(`campaigns/${job}`, {}, { send }); assert.equal(result.data.uncertain, 1); assert.equal(result.data.expired, 1);
  await call(`campaigns/${job}`, {}, { send }); assert.equal(calls, 2); assert.equal((await call('status')).data.subscribers, 1);
});
test('la continuación vuelve a comprobar vigencia y no envía al vencer', async () => {
  await subscribe(); const job = (await previewAndConfirm()).data.jobId;
  assert.equal((await call(`campaigns/${job}`, {}, { now: EXPIRES })).status, 402);
  assert.equal((await call(`campaigns/${job}`, { action: 'status' })).data.pending, 1);
});
test('tras una interrupción no repite destinatarios con resultado desconocido', async () => {
  await subscribe(); const job = (await previewAndConfirm()).data.jobId;
  await db.prepare("UPDATE promotion_deliveries SET status='sending',claimed_at=? WHERE campaign_id=?").bind(NOW - 100000, job).run();
  await db.prepare("UPDATE promotion_campaigns SET status='processing',lease_until=? WHERE id=?").bind(NOW - 10000, job).run();
  const result = await call(`campaigns/${job}`); assert.equal(result.data.uncertain, 1); assert.equal(result.data.done, true);
});
