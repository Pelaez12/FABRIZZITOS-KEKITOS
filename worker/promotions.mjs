import { buildPushPayload } from '@block65/webcrypto-web-push';

export const COMPANY = 'e6d10ec9-9d77-403e-ac6f-9273721fb713';
export const ORIGIN = 'https://fabrizzitos-kekitos.fabrizziopelaez91.workers.dev';
export const PUBLIC_ORIGINS = Object.freeze([ORIGIN, 'https://reserva.comunidadfortaleza.com']);
export const CONSENT_VERSION = 'promotions-v1';
export const LIMITS = Object.freeze({ maxSubscribers: 500, campaignLimit: 10, maxPerDay: 1 });
const encoder = new TextEncoder();
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class PushError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), x => x.toString(16).padStart(2, '0')).join('');
async function equal(a, b) {
  const [x, y] = await Promise.all([hash(a || ''), hash(b || '')]);
  let mismatch = 0;
  for (let i = 0; i < x.length; i++) mismatch |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return mismatch === 0;
}
export const calendarDay = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
const keysReady = env => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
const gateReady = env => Boolean(env.BILLING_GATE_TOKEN && env.FLEXQR_PANEL?.fetch);

async function readJson(request, maxBytes = 8192) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PushError('Usa Content-Type: application/json.', 415);
  if (!request.body) throw new PushError('Falta el cuerpo JSON.');
  const reader = request.body.getReader(); let size = 0; const chunks = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) { await reader.cancel(); throw new PushError('Solicitud demasiado grande.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  let result;
  try { result = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new PushError('JSON no válido.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new PushError('Se requiere un objeto JSON.');
  return result;
}

export async function billingAccess(env, now) {
  if (!gateReady(env)) throw new PushError('Falta conectar la autorización de FLEXQR.', 503);
  let result;
  try {
    const r = await env.FLEXQR_PANEL.fetch(`https://panel.comunidadfortaleza.com/api/platform/internal/billing?company=${COMPANY}`, { method: 'GET', headers: { Authorization: `Bearer ${env.BILLING_GATE_TOKEN}`, 'X-Flexqr-Company': COMPANY }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (!r.ok) { await r.body?.cancel(); throw new Error('billing_unavailable'); }
    // Apply a small response budget without trusting Content-Length.
    result = await readJson(new Request('https://billing.internal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: r.body, duplex: 'half' }), 16384);
  } catch { throw new PushError('No se pudo verificar la vigencia en FLEXQR.', 503); }
  if (result.allowed !== true || !Number.isFinite(result.expiresAt) || now >= result.expiresAt) throw new PushError('La empresa no tiene vigencia activa para promociones.', 402);
  return { allowed: true, phase: result.phase, expiresAt: result.expiresAt };
}

export async function adminAccess(request, env, now) {
  if (!env.BILLING_GATE_TOKEN) throw new PushError('Falta configurar BILLING_GATE_TOKEN.', 503);
  if (!await equal(request.headers.get('Authorization'), `Bearer ${env.BILLING_GATE_TOKEN}`)) throw new PushError('No autorizado.', 401);
  if (request.headers.get('X-Flexqr-Company') !== COMPANY) throw new PushError('La empresa no coincide.', 403);
  // X-Flexqr-Superadmin is deliberately ignored: it never bypasses authorization or expiry.
  return billingAccess(env, now);
}

async function publicAccess(request, env, now) {
  const origin = request.headers.get('Origin');
  if (!PUBLIC_ORIGINS.includes(origin) && !(env.LOCAL_PREVIEW === 'true' && ['http://127.0.0.1:5173', 'http://127.0.0.1:8787'].includes(origin))) throw new PushError('Origen no permitido.', 403);
  const window = Math.floor(now / 60000);
  const bucket = `${window}:${await hash(request.headers.get('CF-Connecting-IP') || 'local')}`;
  const row = await env.DB.prepare(`INSERT INTO promotion_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<10 RETURNING count`).bind(bucket, (window + 2) * 60000).first();
  if (!row) throw new PushError('Espera un minuto antes de reintentar.', 429);
}

function decoded(value) {
  if (typeof value !== 'string' || !/^[\w-]+={0,2}$/.test(value)) return new Uint8Array();
  try { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); } catch { return new Uint8Array(); }
}
export function validateSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    const trusted = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com'].includes(url.hostname) || url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com');
    if (!trusted || url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hash || value.endpoint.length > 2048) return false;
    const key = decoded(value.keys?.p256dh), auth = decoded(value.keys?.auth);
    return key.length === 65 && key[0] === 4 && auth.length === 16;
  } catch { return false; }
}

function content(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const url = input.url ?? '/?promos=1';
  if (!title || title.length > 80 || !body || body.length > 200 || /[\u0000-\u001f]/.test(title + body)) throw new PushError('Usa un título de hasta 80 caracteres y un mensaje de hasta 200.');
  if (typeof url !== 'string' || url.length > 300 || !url.startsWith('/') || url.startsWith('//') || /[\\\u0000-\u0020]/.test(url) || new URL(url, ORIGIN).origin !== ORIGIN) throw new PushError('La promoción debe enlazar a una ruta de este aplicativo.');
  return { title, body, url };
}

async function quota(env, now) {
  const day = calendarDay(now), month = day.slice(0, 7);
  const counts = await env.DB.prepare('SELECT COUNT(*) AS monthly,SUM(CASE WHEN day=? THEN 1 ELSE 0 END) AS daily FROM promotion_campaigns WHERE company_id=? AND month=?').bind(day, COMPANY, month).first();
  return { ...LIMITS, day, month, campaignsUsed: counts.monthly, campaignsToday: counts.daily || 0, remainingMonthly: Math.max(0, 10 - counts.monthly), remainingDaily: Math.max(0, 1 - (counts.daily || 0)) };
}

async function campaignStats(env, id) {
  const campaign = await env.DB.prepare('SELECT id,status,content_json,created_at,completed_at FROM promotion_campaigns WHERE company_id=? AND id=?').bind(COMPANY, id).first();
  if (!campaign) throw new PushError('Campaña no encontrada.', 404);
  const rows = await env.DB.prepare('SELECT status,COUNT(*) AS count FROM promotion_deliveries WHERE company_id=? AND campaign_id=? GROUP BY status').bind(COMPANY, id).all();
  const counts = { pending: 0, sending: 0, accepted: 0, expired: 0, failed: 0, skipped: 0, uncertain: 0 };
  for (const row of rows.results) counts[row.status] = row.count;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { jobId: id, status: campaign.status, done: campaign.status === 'completed', total, processed: total - counts.pending - counts.sending, remaining: counts.pending + counts.sending, ...counts, content: JSON.parse(campaign.content_json), createdAt: campaign.created_at, completedAt: campaign.completed_at };
}

async function finishIfDone(env, id, now) {
  await env.DB.prepare(`UPDATE promotion_campaigns SET status='completed',completed_at=?,lease_until=NULL WHERE company_id=? AND id=? AND NOT EXISTS(SELECT 1 FROM promotion_deliveries WHERE company_id=? AND campaign_id=? AND status IN ('pending','sending'))`).bind(now, COMPANY, id, COMPANY, id).run();
}

export async function continueCampaign(env, id, now, send, expiresAt = Infinity) {
  const startedAt = Date.now();
  const lease = now + 90000;
  const claimed = await env.DB.prepare(`UPDATE promotion_campaigns SET status='processing',lease_until=? WHERE company_id=? AND id=? AND status<>'completed' AND (lease_until IS NULL OR lease_until<=?) RETURNING content_json`).bind(lease, COMPANY, id, now).first();
  if (!claimed) return campaignStats(env, id);
  // An interrupted delivery may have reached its provider. Never resend an ambiguous recipient.
  await env.DB.prepare(`UPDATE promotion_deliveries SET status='uncertain',completed_at=? WHERE company_id=? AND campaign_id=? AND status='sending' AND claimed_at<=?`).bind(now, COMPANY, id, now - 90000).run();
  const recipients = await env.DB.prepare(`UPDATE promotion_deliveries SET status='sending',claimed_at=? WHERE company_id=? AND campaign_id=? AND subscriber_id IN (SELECT subscriber_id FROM promotion_deliveries WHERE company_id=? AND campaign_id=? AND status='pending' ORDER BY subscriber_id LIMIT 10) AND status='pending' RETURNING subscriber_id,consented_at`).bind(now, COMPANY, id, COMPANY, id).all();
  const message = { ...JSON.parse(claimed.content_json), campaignId: id, tag: `fabrizzitos-promo-${id}` };
  await Promise.all(recipients.results.map(async recipient => {
    const sub = await env.DB.prepare('SELECT subscription_json,active,consented_at FROM promotion_subscriptions WHERE company_id=? AND id=?').bind(COMPANY, recipient.subscriber_id).first();
    let state = 'skipped', http = null;
    if (sub?.active === 1 && sub.consented_at === recipient.consented_at && now + Date.now() - startedAt < expiresAt) {
      try {
        http = await send(JSON.parse(sub.subscription_json), message, env);
        state = http >= 200 && http < 300 ? 'accepted' : [404, 410].includes(http) ? 'expired' : 'failed';
      } catch { state = 'uncertain'; }
      if (state === 'expired') await env.DB.prepare('UPDATE promotion_subscriptions SET active=0,updated_at=? WHERE company_id=? AND id=? AND consented_at=?').bind(now, COMPANY, recipient.subscriber_id, recipient.consented_at).run();
    }
    await env.DB.prepare(`UPDATE promotion_deliveries SET status=?,completed_at=?,http_status=? WHERE company_id=? AND campaign_id=? AND subscriber_id=? AND status='sending' AND claimed_at=?`).bind(state, now, http, COMPANY, id, recipient.subscriber_id, now).run();
  }));
  await env.DB.prepare('UPDATE promotion_campaigns SET lease_until=NULL WHERE company_id=? AND id=? AND lease_until=?').bind(COMPANY, id, lease).run();
  await finishIfDone(env, id, now);
  return campaignStats(env, id);
}

export async function sendWebPush(subscription, message, env) {
  const init = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: 3600 } }, subscription, { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
  const r = await fetch(subscription.endpoint, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  await r.body?.cancel();
  return r.status;
}

export async function pushRoutes(request, env, { now = Date.now(), send = sendWebPush } = {}) {
  const route = new URL(request.url).pathname;
  if (!route.startsWith('/api/push/')) return null;
  try {
    if (route === '/api/push/config' && request.method === 'GET') {
      let billing = null, reason = 'connection_pending';
      if (keysReady(env) && gateReady(env)) {
        try { billing = await billingAccess(env, now); reason = 'active'; } catch (e) { reason = e.status === 402 ? 'expired' : 'connection_pending'; }
      }
      return response({ enabled: !!billing, publicKey: keysReady(env) ? env.VAPID_PUBLIC_KEY : null, consentVersion: CONSENT_VERSION, reason, ...LIMITS });
    }
    if (request.method !== 'POST') throw new PushError('Método no permitido.', 405);
    const publicRoute = ['/api/push/subscribe', '/api/push/unsubscribe'].includes(route);
    let billing;
    if (publicRoute) await publicAccess(request, env, now);
    else billing = await adminAccess(request, env, now);
    const input = await readJson(request);
    if (publicRoute) {
      if (!validateSubscription(input.subscription)) throw new PushError('Suscripción no válida.');
      const subscription = { endpoint: input.subscription.endpoint, keys: { p256dh: input.subscription.keys.p256dh, auth: input.subscription.keys.auth } };
      const id = await hash(subscription.endpoint), authHash = await hash(subscription.keys.auth);
      const existing = await env.DB.prepare('SELECT auth_hash FROM promotion_subscriptions WHERE company_id=? AND id=?').bind(COMPANY, id).first();
      if (existing && !await equal(existing.auth_hash, authHash)) throw new PushError('La suscripción no pertenece a este dispositivo.', 403);
      if (route.endsWith('/unsubscribe')) {
        await env.DB.prepare('UPDATE promotion_subscriptions SET active=0,updated_at=? WHERE company_id=? AND id=? AND auth_hash=?').bind(now, COMPANY, id, authHash).run();
        return response({ subscribed: false });
      }
      if (input.consent !== true || input.consentVersion !== CONSENT_VERSION || input.permission !== 'granted') throw new PushError('Se requiere consentimiento explícito y permiso concedido.');
      if (!keysReady(env)) throw new PushError('Las promociones aún no están configuradas.', 503);
      await billingAccess(env, now);
      const saved = await env.DB.prepare(`INSERT INTO promotion_subscriptions(company_id,id,subscription_json,auth_hash,consent_version,consented_at,updated_at)
        SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM promotion_subscriptions WHERE company_id=? AND active=1)<500 OR EXISTS(SELECT 1 FROM promotion_subscriptions WHERE company_id=? AND id=? AND active=1 AND auth_hash=?)
        ON CONFLICT(company_id,id) DO UPDATE SET subscription_json=excluded.subscription_json,active=1,consent_version=excluded.consent_version,consented_at=CASE WHEN active=1 THEN consented_at ELSE excluded.consented_at END,updated_at=excluded.updated_at WHERE auth_hash=excluded.auth_hash RETURNING id`)
        .bind(COMPANY, id, JSON.stringify(subscription), authHash, CONSENT_VERSION, now, now, COMPANY, COMPANY, id, authHash).first();
      if (!saved) throw new PushError('Se alcanzó el límite de 500 dispositivos.', 429);
      return response({ subscribed: true, consentVersion: CONSENT_VERSION });
    }
    if (route === '/api/push/status') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM promotion_subscriptions WHERE company_id=? AND active=1').bind(COMPANY).first();
      const before = input.before ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isSafeInteger(before) || before < 0) throw new PushError('Cursor de historial no válido.');
      const jobs = await env.DB.prepare('SELECT id,created_at FROM promotion_campaigns WHERE company_id=? AND created_at<? ORDER BY created_at DESC LIMIT 20').bind(COMPANY, before).all();
      const campaigns = await Promise.all(jobs.results.map(row => campaignStats(env, row.id)));
      const active = await env.DB.prepare("SELECT id FROM promotion_campaigns WHERE company_id=? AND status<>'completed' ORDER BY created_at DESC LIMIT 1").bind(COMPANY).first();
      return response({ subscribers: count.n, eligible: count.n, waiting: 0, billing, quotas: await quota(env, now), ...LIMITS, activeCampaign: active?.id || null, campaigns, nextBefore: jobs.results.length === 20 ? jobs.results.at(-1).created_at : null });
    }
    if (route === '/api/push/campaigns') {
      const value = content(input), serialized = JSON.stringify(value), contentHash = await hash(serialized);
      if (!keysReady(env)) throw new PushError('Faltan las claves VAPID.', 503);
      if (input.confirm !== true) {
        const audience = await env.DB.prepare('SELECT id,consented_at FROM promotion_subscriptions WHERE company_id=? AND active=1 ORDER BY id LIMIT 500').bind(COMPANY).all();
        const id = crypto.randomUUID(), quotas = await quota(env, now);
        await env.DB.prepare('INSERT INTO promotion_previews(company_id,id,content_json,content_hash,audience_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(COMPANY, id, serialized, contentHash, JSON.stringify(audience.results), now, now + 600000).run();
        return response({ preview: true, previewId: id, expiresAt: now + 600000, eligible: audience.results.length, skipped: 0, content: value, quotas, canSend: audience.results.length > 0 && quotas.remainingDaily > 0 && quotas.remainingMonthly > 0 });
      }
      if (typeof input.previewId !== 'string') throw new PushError('Primero solicita una vista previa.');
      const preview = await env.DB.prepare('SELECT * FROM promotion_previews WHERE company_id=? AND id=?').bind(COMPANY, input.previewId).first();
      if (!preview || preview.content_hash !== contentHash) throw new PushError('La vista previa no coincide con el mensaje.', 409);
      const prior = await env.DB.prepare('SELECT id FROM promotion_campaigns WHERE company_id=? AND preview_id=?').bind(COMPANY, preview.id).first();
      if (prior) return response(await campaignStats(env, prior.id), 202);
      if (preview.expires_at <= now) throw new PushError('La vista previa venció. Solicita otra.', 409);
      if (!JSON.parse(preview.audience_json).length) throw new PushError('La vista previa no tiene destinatarios.', 409);
      const id = crypto.randomUUID(), day = calendarDay(now), month = day.slice(0, 7);
      const insert = env.DB.prepare(`INSERT OR IGNORE INTO promotion_campaigns(company_id,id,preview_id,content_json,content_hash,day,month,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM promotion_campaigns WHERE company_id=? AND month=?)<10 AND NOT EXISTS(SELECT 1 FROM promotion_campaigns WHERE company_id=? AND day=?)`)
        .bind(COMPANY, id, preview.id, serialized, contentHash, day, month, now, COMPANY, month, COMPANY, day);
      const recipients = env.DB.prepare(`INSERT INTO promotion_deliveries(company_id,campaign_id,subscriber_id,consented_at)
        SELECT ?,?,json_extract(j.value,'$.id'),json_extract(j.value,'$.consented_at') FROM promotion_previews p,json_each(p.audience_json) j
        WHERE p.company_id=? AND p.id=? AND EXISTS(SELECT 1 FROM promotion_campaigns WHERE company_id=? AND id=?)`)
        .bind(COMPANY, id, COMPANY, preview.id, COMPANY, id);
      const result = await env.DB.batch([insert, recipients]);
      if (!result[0].meta.changes) {
        const duplicate = await env.DB.prepare('SELECT id FROM promotion_campaigns WHERE company_id=? AND preview_id=?').bind(COMPANY, preview.id).first();
        if (duplicate) return response(await campaignStats(env, duplicate.id), 202);
        throw new PushError('Límite del plan Básico: 1 campaña diaria y 10 mensuales.', 429);
      }
      // Confirmation creates a job only. Delivery requires a separate authenticated continuation.
      return response(await campaignStats(env, id), 202);
    }
    const match = route.match(/^\/api\/push\/campaigns\/([a-f0-9-]{36})$/);
    if (match) {
      if (input.action === 'status') return response(await campaignStats(env, match[1]));
      if (input.action && input.action !== 'continue') throw new PushError('Acción no válida.');
      if (!keysReady(env)) throw new PushError('Faltan las claves VAPID.', 503);
      const result = await continueCampaign(env, match[1], now, send, billing.expiresAt);
      return response(result, result.done ? 200 : 202);
    }
    throw new PushError('Ruta no encontrada.', 404);
  } catch (e) {
    return response({ error: e instanceof PushError ? e.message : 'No se pudo procesar la solicitud de promociones.' }, e instanceof PushError ? e.status : 500);
  }
}
