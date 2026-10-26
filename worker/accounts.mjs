import { AccountError, accountJson, accountBody, accountOrigin, requireAccount, sha256 } from './auth.mjs';
import { adminAccess, COMPANY, validateSubscription } from './promotions.mjs';
import { missionsFor, missionProgress, summarizeLoyalty, PRIZES, LEVELS, prizeAt } from '../shared/loyalty.mjs';

const ordersFor = async (env, userId) => (await env.DB.prepare('SELECT r.* FROM reservations r JOIN customer_orders o ON o.reservation_id=r.id WHERE o.user_id=? ORDER BY r.created_at DESC,r.id DESC').bind(userId).all()).results;
async function stateFor(env, userId, now) {
  const orders = await ordersFor(env, userId);
  const claims = (await env.DB.prepare('SELECT * FROM customer_mission_claims WHERE user_id=?').bind(userId).all()).results;
  const push = await env.DB.prepare('SELECT 1 AS active FROM customer_push_links l JOIN promotion_subscriptions p ON p.id=l.subscription_id AND p.company_id=? WHERE l.user_id=? AND p.active=1 LIMIT 1').bind(COMPANY, userId).first();
  const summary = summarizeLoyalty(orders, claims, !!push);
  const missions = missionsFor(userId, new Date(now)).map(mission => {
    const claimed = claims.some(claim => claim.mission_id === mission.id);
    const progress = missionProgress(mission, orders, !!push);
    return { ...mission, progress, pendingProgress: Math.max(0, missionProgress(mission, orders, !!push, false) - progress), claimed, canClaim: !claimed && progress >= mission.target };
  });
  const spins = (await env.DB.prepare('SELECT id,spin_number,prize_id,prize_label,discount_cents,code,created_at,redeemed_at FROM customer_wheel_spins WHERE user_id=? ORDER BY spin_number DESC').bind(userId).all()).results;
  return { ...summary, missions, orders, spins, availableSpins: Math.max(0, Math.floor(summary.paidKekes / 10) - spins.length), wheelProgress: summary.paidKekes % 10 };
}
export function secureRoll() {
  let n; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= 4294960000);
  return n % 10000;
}
async function reviewOrder(request, env, id, now) {
  await adminAccess(request, env, now);
  const body = await accountBody(request), statuses = ['unpaid', 'pending_review', 'approved', 'rejected'], reservations = ['reserved', 'cancelled', 'fulfilled'];
  if (!/^[\da-f-]{36}$/i.test(body.eventId || '') || !statuses.includes(body.paymentStatus) || !statuses.includes(body.expectedPaymentStatus) || !reservations.includes(body.reservationStatus) || !reservations.includes(body.expectedReservationStatus)) throw new AccountError('Indica eventId, estados nuevos y estados esperados válidos.');
  const hash = await sha256(JSON.stringify({ id, payment: body.paymentStatus, reservation: body.reservationStatus, expectedPayment: body.expectedPaymentStatus, expectedReservation: body.expectedReservationStatus }));
  const prior = await env.DB.prepare('SELECT * FROM customer_review_events WHERE event_id=?').bind(body.eventId).first();
  if (prior) { if (prior.payload_hash !== hash) throw new AccountError('eventId ya usado con otros datos.', 409); return accountJson({ updated: true, eventId: body.eventId, replay: true }); }
  const result = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO customer_review_events SELECT ?,id,?,?,?,? FROM reservations WHERE id=? AND payment_status=? AND reservation_status=?`).bind(body.eventId, hash, body.paymentStatus, body.reservationStatus, now, id, body.expectedPaymentStatus, body.expectedReservationStatus),
    env.DB.prepare(`UPDATE reservations SET payment_status=?,reservation_status=? WHERE id=? AND payment_status=? AND reservation_status=? AND EXISTS(SELECT 1 FROM customer_review_events WHERE event_id=? AND payload_hash=?)`).bind(body.paymentStatus, body.reservationStatus, id, body.expectedPaymentStatus, body.expectedReservationStatus, body.eventId, hash),
  ]);
  if (!result[0].meta.changes) {
    const concurrent = await env.DB.prepare('SELECT payload_hash FROM customer_review_events WHERE event_id=?').bind(body.eventId).first();
    if (concurrent?.payload_hash === hash) return accountJson({ updated: true, eventId: body.eventId, replay: true });
    throw new AccountError('La reserva cambió o no existe. Actualiza sus estados antes de reintentar.', 409);
  }
  return accountJson({ updated: true, eventId: body.eventId, replay: false });
}
export async function accountRoutes(request, env, { now = Date.now(), roll = secureRoll } = {}) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/account/')) return null;
  try {
    const review = path.match(/^\/api\/account\/admin\/reservations\/([\da-f-]{36})$/i);
    if (review && request.method === 'GET') {
      await adminAccess(request, env, now);
      const row = await env.DB.prepare('SELECT id,payment_status,reservation_status,total_cents,receipt_key FROM reservations WHERE id=?').bind(review[1]).first();
      if (!row) throw new AccountError('Reserva no encontrada.', 404);
      return accountJson({ reservationId: row.id, paymentStatus: row.payment_status, reservationStatus: row.reservation_status, totalCents: row.total_cents, receiptAvailable: !!row.receipt_key });
    }
    if (review && request.method === 'POST') return await reviewOrder(request, env, review[1], now);
    const redeem = path.match(/^\/api\/account\/admin\/rewards\/([\da-f-]{36})\/redeem$/i);
    if (redeem && request.method === 'POST') {
      await adminAccess(request, env, now); await accountBody(request);
      const prize = await env.DB.prepare('SELECT * FROM customer_wheel_spins WHERE code=?').bind(redeem[1]).first();
      if (!prize || !prize.discount_cents) throw new AccountError('Premio no encontrado.', 404);
      const state = await stateFor(env, prize.user_id, now);
      if (Math.floor(state.paidKekes / 10) < prize.spin_number) throw new AccountError('Las compras que habilitaron este giro fueron anuladas.', 409);
      const changed = await env.DB.prepare('UPDATE customer_wheel_spins SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL RETURNING id').bind(now, prize.id).first();
      if (!changed) throw new AccountError('Este premio ya fue canjeado.', 409);
      return accountJson({ redeemed: true, discountCents: prize.discount_cents });
    }
    if (path.startsWith('/api/account/admin/')) throw new AccountError('Ruta no disponible.', 404);
    const user = await requireAccount(request, env, now);
    if (request.method === 'GET' && path === '/api/account/me') {
      const state = await stateFor(env, user.id, now);
      return accountJson({ profile: { name: user.name, email: user.email, phone: user.phone, address: user.address }, ...state, orders: state.orders.slice(0, 30).map(order => ({ id: order.id, reference: order.reference, date: order.booking_date, time: order.booking_time, kekeQty: order.keke_qty, shakeQty: order.shake_qty, total: order.total_cents, paymentStatus: order.payment_status, status: order.reservation_status })), levels: LEVELS, prizes: PRIZES });
    }
    if (request.method !== 'POST') throw new AccountError('Método no permitido.', 405);
    accountOrigin(request, env); const body = await accountBody(request);
    if (path === '/api/account/profile') {
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s()+-]/g, '').replace(/^51(?=9\d{8}$)/, '') : '';
      const address = typeof body.address === 'string' ? body.address.trim() : '';
      if (name.length < 2 || name.length > 100 || !/^9\d{8}$/.test(phone) || address.length > 240 || /[\u0000-\u001f]/.test(name + address)) throw new AccountError('Indica tu nombre completo, celular peruano de 9 dígitos y una dirección de hasta 240 caracteres.');
      await env.DB.prepare('UPDATE customer_accounts SET name=?,phone=?,address=? WHERE id=?').bind(name, phone, address, user.id).run();
      return accountJson({ saved: true, profile: { name, phone, address, email: user.email } });
    }
    if (path === '/api/account/push-link') {
      if (!validateSubscription(body.subscription)) throw new AccountError('Primero activa las promociones en este dispositivo.');
      const id = await sha256(body.subscription.endpoint), auth = await sha256(body.subscription.keys.auth);
      const saved = await env.DB.prepare('SELECT active,auth_hash FROM promotion_subscriptions WHERE company_id=? AND id=?').bind(COMPANY, id).first();
      if (!saved?.active || saved.auth_hash !== auth) throw new AccountError('Activa las promociones antes de verificar esta misión.', 409);
      const linked = await env.DB.prepare('INSERT INTO customer_push_links VALUES (?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET linked_at=excluded.linked_at WHERE user_id=excluded.user_id RETURNING user_id').bind(id, user.id, now).first();
      if (!linked) throw new AccountError('Este dispositivo ya está vinculado a otra cuenta.', 409);
      return accountJson({ linked: true });
    }
    if (path === '/api/account/missions/claim') {
      const state = await stateFor(env, user.id, now), mission = state.missions.find(m => m.id === body.missionId);
      if (!mission) throw new AccountError('Esta misión venció o no existe.', 404);
      if (mission.claimed) return accountJson({ claimed: true, replay: true, points: mission.points });
      if (!mission.canClaim) throw new AccountError('Completa la misión con compras validadas antes de reclamar el XP.', 409);
      const result = await env.DB.prepare('INSERT OR IGNORE INTO customer_mission_claims VALUES (?,?,?,?,?)').bind(user.id, mission.id, mission.points, JSON.stringify(mission), now).run();
      return accountJson({ claimed: true, replay: !result.meta.changes, points: mission.points });
    }
    if (path === '/api/account/wheel/spin') {
      if (!/^[\da-f-]{36}$/i.test(body.requestId || '')) throw new AccountError('Falta un identificador de giro válido.');
      const existing = await env.DB.prepare('SELECT * FROM customer_wheel_spins WHERE user_id=? AND request_key=?').bind(user.id, body.requestId).first();
      if (existing) return accountJson({ spin: existing, replay: true });
      const prize = prizeAt(roll()); const id = crypto.randomUUID(), code = crypto.randomUUID();
      const saved = await env.DB.prepare(`INSERT OR IGNORE INTO customer_wheel_spins(id,user_id,request_key,spin_number,prize_id,prize_label,discount_cents,code,created_at)
        SELECT ?,?,?,(SELECT COUNT(*)+1 FROM customer_wheel_spins WHERE user_id=?),?,?,?,?,?
        WHERE (SELECT COALESCE(SUM(r.keke_qty),0)/10 FROM reservations r JOIN customer_orders o ON o.reservation_id=r.id WHERE o.user_id=? AND r.payment_status='approved' AND r.reservation_status<>'cancelled')>(SELECT COUNT(*) FROM customer_wheel_spins WHERE user_id=?) RETURNING *`)
        .bind(id, user.id, body.requestId, user.id, prize.id, prize.label, prize.discountCents, code, now, user.id, user.id).first();
      if (!saved) {
        const retry = await env.DB.prepare('SELECT * FROM customer_wheel_spins WHERE user_id=? AND request_key=?').bind(user.id, body.requestId).first();
        if (retry) return accountJson({ spin: retry, replay: true });
        throw new AccountError('Necesitas 10 kekitos pagados y validados por cada giro.', 409);
      }
      return accountJson({ spin: saved, replay: false }, 201);
    }
    throw new AccountError('Ruta de cuenta no disponible.', 404);
  } catch (error) { return accountJson({ error: error?.status ? error.message : 'No se pudo actualizar tu cuenta. Intenta nuevamente.' }, error?.status || 500); }
}
