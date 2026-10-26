import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { authRoutes, sha256, verifyGoogle } from '../worker/auth.mjs';
import { accountRoutes } from '../worker/accounts.mjs';
import { COMPANY } from '../worker/promotions.mjs';
import { LEVELS, missionsFor, summarizeLoyalty, prizeAt } from '../shared/loyalty.mjs';
const ORIGIN = 'https://reserva.comunidadfortaleza.com', NOW = Date.parse('2026-10-26T16:00:00Z');
const TOKEN = 'a'.repeat(64), OTHER = 'b'.repeat(64);
let db, mf, env;
before(async () => {
  mf = new Miniflare({ modules: true, script: 'export default{fetch(){return new Response("test")}}', compatibilityDate: '2026-08-06', d1Databases: { DB: 'account-tests' } });
  db = await mf.getD1Database('DB');
  for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) for (const sql of (await readFile(`migrations/${file}`, 'utf8')).replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
});
after(async () => mf?.dispose());
beforeEach(async () => {
  for (const table of ['customer_review_events', 'customer_wheel_spins', 'customer_mission_claims', 'customer_push_links', 'customer_orders', 'customer_sessions', 'customer_accounts', 'customer_oauth_flows', 'customer_auth_limits', 'promotion_subscriptions', 'reservations']) await db.prepare(`DELETE FROM ${table}`).run();
  env = { DB: db, BILLING_GATE_TOKEN: 'mock-billing', FLEXQR_PANEL: { fetch: async () => Response.json({ allowed: true, expiresAt: NOW + 86400000 }) } };
  for (const [id, token] of [['user-a', TOKEN], ['user-b', OTHER]]) {
    await db.prepare('INSERT INTO customer_accounts(id,google_sub,email,name,created_at) VALUES (?,?,?,?,?)').bind(id, id, `${id}@example.test`, 'Cliente de prueba', NOW).run();
    await db.prepare('INSERT INTO customer_sessions VALUES (?,?,?)').bind(await sha256(token), id, NOW + 86400000).run();
  }
});
async function call(path, body, options = {}) {
  const request = new Request(ORIGIN + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Cookie: `__Host-fk_session=${options.token || TOKEN}`, ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const r = await accountRoutes(request, env, { now: options.now || NOW, roll: options.roll || (() => 0) }); return { status: r.status, data: await r.json() };
}
async function order({ user = 'user-a', kekes = 3, shakes = 0, paid = 'pending_review', status = 'reserved', receipt = 'private/mock', createdAt = new Date(NOW).toISOString() } = {}) {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO reservations(id,reference,request_key,payload_hash,customer_name,phone,fulfillment,booking_date,booking_time,slot_at,keke_qty,shake_qty,total_cents,payment_status,reservation_status,receipt_key,notice_accepted,created_at) VALUES (?,?,?,?,?,?,'pickup','2026-10-26','18:00','2026-10-26T23:00:00.000Z',?,?,?,?,?,?,1,?)`)
    .bind(id, id.slice(0, 10), crypto.randomUUID(), 'hash', 'Prueba', '955000001', kekes, shakes, kekes * 400 + shakes * 1200, paid, status, receipt, createdAt).run();
  await db.prepare('INSERT INTO customer_orders VALUES (?,?)').bind(id, user).run(); return id;
}
test('perfil exige sesión, valida origen y autocompleta solo datos de su propietario', async () => {
  assert.equal((await call('/api/account/me', undefined, { token: 'c'.repeat(64) })).status, 401);
  assert.equal((await call('/api/account/profile', { name: 'Cliente Prueba', phone: '123' })).status, 400);
  const body = { name: 'Cliente Prueba', phone: '+51 955 000 001', address: 'Av. Prueba 450, Jesús María' };
  assert.equal((await call('/api/account/profile', body, { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call('/api/account/profile', body)).status, 200);
  assert.equal((await call('/api/account/me')).data.profile.phone, '955000001');
  assert.equal((await call('/api/account/me', undefined, { token: OTHER })).data.profile.phone, '');
  assert.equal((await call('/api/account/me', undefined, { now: NOW + 86400001 })).status, 401);
  const badLogout = await authRoutes(new Request(ORIGIN + '/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.test', Cookie: `__Host-fk_session=${TOKEN}` } }), env, { now: NOW }); assert.equal(badLogout.status, 403);
  const logout = await authRoutes(new Request(ORIGIN + '/api/auth/logout', { method: 'POST', headers: { Origin: ORIGIN, Cookie: `__Host-fk_session=${TOKEN}` } }), env, { now: NOW }); assert.equal(logout.status, 200);
  assert.equal((await call('/api/account/me')).status, 401);
});
test('XP de reserva queda pendiente; adelanto validado añade 5 por kekito, batidos dan 6 y anular revierte', async () => {
  const id = await order({ kekes: 3, shakes: 1 }); await order({ user: 'user-b', paid: 'approved' });
  let me = (await call('/api/account/me')).data; assert.equal(me.xp, 0); assert.equal(me.pendingXp, 9); assert.equal(me.orders.length, 1);
  await db.prepare("UPDATE reservations SET payment_status='approved' WHERE id=?").bind(id).run();
  me = (await call('/api/account/me')).data; assert.equal(me.xp, 24); assert.equal(me.prepaidKekes, 3); assert.equal(me.paidKekes, 3);
  await db.prepare("UPDATE reservations SET reservation_status='cancelled' WHERE id=?").bind(id).run();
  me = (await call('/api/account/me')).data; assert.equal(me.xp, 0); assert.equal(me.paidKekes, 0);
});
test('los niveles respetan los cuatro umbrales finales', () => {
  assert.deepEqual(LEVELS.map(l => l.xp), [500, 1000, 4000, 32000]);
  const claims = [{ points: 32000, definition_json: '{"kind":"notifications"}' }];
  assert.equal(summarizeLoyalty([], claims).level.name, 'Master Chef');
});
test('misiones estables por cuenta y día de Lima; reclamo concurrente único, con compras validadas', async () => {
  const missions = missionsFor('user-a', new Date(NOW)); assert.deepEqual(missions, missionsFor('user-a', new Date(NOW + 60000)));
  assert.equal(missions.find(m => m.period === 'weekly').start, '2026-10-26');
  const mission = missions.find(m => m.kind === 'kekes' && m.period === 'daily');
  const id = await order({ kekes: mission.target });
  assert.equal((await call('/api/account/missions/claim', { missionId: mission.id })).status, 409);
  await db.prepare("UPDATE reservations SET payment_status='approved' WHERE id=?").bind(id).run();
  const results = await Promise.all([call('/api/account/missions/claim', { missionId: mission.id }), call('/api/account/missions/claim', { missionId: mission.id })]);
  assert.equal(results[0].status, 200); assert.equal(results[1].status, 200);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM customer_mission_claims').first()).n, 1);
  assert.equal((await call('/api/account/me')).data.xp, mission.target * 6 + mission.points);
  await db.prepare("UPDATE reservations SET reservation_status='cancelled' WHERE id=?").bind(id).run(); assert.equal((await call('/api/account/me')).data.xp, 0);
  assert.equal((await call('/api/account/missions/claim', { missionId: 'daily:2000-01-01:kekes' })).status, 404);
});
test('300 XP por avisos: propiedad de suscripción, una sola cuenta y no penaliza desactivar después', async () => {
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/mock-account', keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } };
  const id = await sha256(subscription.endpoint), authHash = await sha256(subscription.keys.auth);
  assert.equal((await call('/api/account/missions/claim', { missionId: 'notifications-v1' })).status, 409);
  await db.prepare('INSERT INTO promotion_subscriptions VALUES (?,?,?,?,1,?,?,?)').bind(COMPANY, id, JSON.stringify(subscription), authHash, 'promotions-v1', NOW, NOW).run();
  assert.equal((await call('/api/account/push-link', { subscription })).status, 200);
  assert.equal((await call('/api/account/push-link', { subscription }, { token: OTHER })).status, 409);
  await call('/api/account/missions/claim', { missionId: 'notifications-v1' }); await call('/api/account/missions/claim', { missionId: 'notifications-v1' });
  assert.equal((await call('/api/account/me')).data.xp, 300);
  await db.prepare('UPDATE promotion_subscriptions SET active=0').run(); assert.equal((await call('/api/account/me')).data.xp, 300);
});
test('ruleta: 35 % sin premio, créditos solo pagados, concurrencia y reintento sin duplicados', async () => {
  const counts = new Map(); for (let n = 0; n < 10000; n++) { const p = prizeAt(n); counts.set(p.id, (counts.get(p.id) || 0) + 1); }
  assert.deepEqual([...counts.values()], [3500, 4550, 1625, 325]);
  const id = await order({ kekes: 10 });
  const requestId = crypto.randomUUID(); assert.equal((await call('/api/account/wheel/spin', { requestId })).status, 409);
  await db.prepare("UPDATE reservations SET payment_status='approved' WHERE id=?").bind(id).run();
  const options = { roll: () => 9999 };
  const results = await Promise.all([call('/api/account/wheel/spin', { requestId }, options), call('/api/account/wheel/spin', { requestId: crypto.randomUUID() }, options)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const winner = results.find(r => r.status === 201).data.spin;
  assert.equal((await call('/api/account/wheel/spin', { requestId: winner.request_key })).data.spin.id, winner.id);
  assert.equal((await call('/api/account/me')).data.availableSpins, 0);
  assert.equal((await call('/api/account/me', undefined, { token: OTHER })).data.spins.length, 0);
  const adminHeaders = { Authorization: 'Bearer mock-billing', 'X-Flexqr-Company': COMPANY };
  assert.equal((await call(`/api/account/admin/rewards/${winner.code}/redeem`, {})).status, 401);
  assert.equal((await call(`/api/account/admin/rewards/${winner.code}/redeem`, {}, { headers: adminHeaders })).status, 200);
  assert.equal((await call(`/api/account/admin/rewards/${winner.code}/redeem`, {}, { headers: adminHeaders })).status, 409);
});
test('revisión administrativa es autenticada, idempotente y no pisa estados concurrentes', async () => {
  const id = await order();
  const body = { eventId: crypto.randomUUID(), paymentStatus: 'approved', expectedPaymentStatus: 'pending_review', reservationStatus: 'reserved', expectedReservationStatus: 'reserved' };
  const headers = { Authorization: 'Bearer mock-billing', 'X-Flexqr-Company': COMPANY };
  assert.equal((await call(`/api/account/admin/reservations/${id}`, body)).status, 401);
  assert.equal((await call(`/api/account/admin/reservations/${id}`, body, { headers: { ...headers, 'X-Flexqr-Company': 'another' } })).status, 403);
  assert.equal((await call(`/api/account/admin/reservations/${id}`, body, { headers })).status, 200);
  assert.equal((await call(`/api/account/admin/reservations/${id}`, body, { headers })).data.replay, true);
  assert.equal((await call(`/api/account/admin/reservations/${id}`, { ...body, paymentStatus: 'rejected' }, { headers })).status, 409);
  assert.equal((await call(`/api/account/admin/reservations/${id}`, { ...body, eventId: crypto.randomUUID() }, { headers })).status, 409);
  assert.equal((await call('/api/account/me')).data.xp, 18);
});
test('Google queda deshabilitado sin credenciales; no ofrece acceso simulado', async () => {
  const config = await authRoutes(new Request(ORIGIN + '/api/auth/config'), env); assert.equal((await config.json()).enabled, false);
  const start = await authRoutes(new Request(ORIGIN + '/api/auth/google/start'), env); assert.equal(start.status, 503);
});
test('Google OAuth: firma, nonce, audiencia, state, PKCE y cookie segura, con proveedor simulado', async () => {
  env.GOOGLE_CLIENT_ID = 'mock-google-client'; env.GOOGLE_CLIENT_SECRET = 'mock-google-secret';
  const start = await authRoutes(new Request(ORIGIN + '/api/auth/google/start'), env, { now: NOW }); assert.equal(start.status, 303);
  const target = new URL(start.headers.get('Location')), nonce = target.searchParams.get('nonce'), state = target.searchParams.get('state');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256'); assert.equal(target.searchParams.get('redirect_uri'), ORIGIN + '/api/auth/google/callback');
  const keys = await generateKeyPair('RS256', { extractable: true }); const jwk = await exportJWK(keys.publicKey); jwk.kid = 'mock';
  const sign = (audience, tokenNonce = nonce, expired = false) => new SignJWT({ sub: 'mock-new-google-user', email: 'mock@example.test', email_verified: true, name: 'Prueba Google', nonce: tokenNonce }).setProtectedHeader({ alg: 'RS256', kid: 'mock' }).setIssuer('https://accounts.google.com').setAudience(audience).setIssuedAt(Math.floor(NOW / 1000) - (expired ? 7200 : 0)).setExpirationTime(Math.floor(NOW / 1000) + (expired ? -3600 : 600)).sign(keys.privateKey);
  const fetcher = async (url, init) => {
    if (url.endsWith('/token')) {
      const params = new URLSearchParams(init.body); const verifier = params.get('code_verifier');
      const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
      assert.equal(challenge, target.searchParams.get('code_challenge')); assert.equal(params.get('client_secret'), 'mock-google-secret');
      return Response.json({ id_token: await sign(env.GOOGLE_CLIENT_ID) });
    }
    assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs'); return Response.json({ keys: [jwk] });
  };
  await assert.rejects(verifyGoogle(await sign('wrong-client'), env, nonce, NOW, fetcher));
  await assert.rejects(verifyGoogle(await sign(env.GOOGLE_CLIENT_ID, 'wrong-nonce'), env, nonce, NOW, fetcher));
  await assert.rejects(verifyGoogle(await sign(env.GOOGLE_CLIENT_ID, nonce, true), env, nonce, NOW, fetcher));
  const callback = ORIGIN + '/api/auth/google/callback?' + new URLSearchParams({ code: 'mock-code', state });
  assert.equal((await authRoutes(new Request(callback), env, { now: NOW, fetcher })).status, 401);
  const flowCookie = start.headers.get('Set-Cookie').split(';')[0];
  const finish = await authRoutes(new Request(callback, { headers: { Cookie: flowCookie } }), env, { now: NOW, fetcher }); assert.equal(finish.status, 303);
  assert.match(finish.headers.get('Set-Cookie'), /__Host-fk_session=/); assert.match(finish.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await authRoutes(new Request(callback, { headers: { Cookie: flowCookie } }), env, { now: NOW, fetcher })).status, 401);
  const stored = await db.prepare("SELECT * FROM customer_accounts WHERE google_sub='mock-new-google-user'").first(); assert.equal(stored.email, 'mock@example.test');
});
