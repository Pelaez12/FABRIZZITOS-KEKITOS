const ENDPOINT = 'https://panel.comunidadfortaleza.com/api/platform/internal/inbox';
const PERMANENT_ERRORS = new Set([400, 409, 413, 415]);

export function flexqrConfigured(env) {
  // Local previews never send real customer records to the business panel.
  return env.LOCAL_PREVIEW !== 'true' && Boolean(env.FLEXQR_INBOX_TOKEN && env.FLEXQR_COMPANY_ID && env.FLEXQR_PANEL);
}

export function reservationPayload(row) {
  const products = [row.keke_qty ? `${row.keke_qty} kekito(s) proteico(s) de banana y avena` : '', row.shake_qty ? `${row.shake_qty} batido(s) proteico(s) de vainilla` : ''].filter(Boolean).join('; ');
  const delivery = row.fulfillment === 'delivery' ? `Delivery: ${row.address}, Jesús María (S/6 incluido).` : 'Recojo: Av. Talara 450, Jesús María.';
  const payment = row.payment_status === 'pending_review' ? 'Comprobante recibido, pendiente de revisión. Foto privada en el aplicativo de origen.' : row.payment_status === 'approved' ? 'Pago validado en origen.' : 'Pago pendiente.';
  return {
    sourceId: `fabrizzitos:${row.id}`,
    kind: 'reservation',
    customerName: row.customer_name,
    customerPhone: `+51${row.phone}`,
    summary: `${row.reference}. ${products}. ${delivery} ${payment}`,
    scheduledAt: row.slot_at,
    amountCents: row.total_cents,
  };
}

export function queueStatement(env, row) {
  return env.DB.prepare(`INSERT OR IGNORE INTO flexqr_outbox (reservation_id,payload_json,next_attempt_at,created_at,updated_at)
    SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM reservations WHERE id = ?)`)
    .bind(row.id, JSON.stringify(reservationPayload(row)), row.created_at, row.created_at, row.created_at, row.id);
}

async function responseJson(response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { return null; }
}

export async function deliverReservation(env, reservationId, now = new Date()) {
  if (!flexqrConfigured(env)) return { state: 'not_configured' };
  const timestamp = now.toISOString();
  const lease = new Date(now.getTime() + 90000).toISOString();
  // Claim once, atomically. Overlapping HTTP requests and cron runs cannot send in parallel.
  const row = await env.DB.prepare(`UPDATE flexqr_outbox SET attempts = attempts + 1, lease_until = ?, updated_at = ?
    WHERE reservation_id = ? AND status IN ('queued','retry') AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)
    RETURNING *`).bind(lease, timestamp, reservationId, timestamp, timestamp).first();
  if (!row) return { state: 'not_due' };
  let status = null, result = null, retryAfter = 0;
  try {
    const response = await env.FLEXQR_PANEL.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.FLEXQR_INBOX_TOKEN}`, 'X-Flexqr-Company': env.FLEXQR_COMPANY_ID },
      body: row.payload_json,
      signal: AbortSignal.timeout(15000),
      // Workers implements manual/follow, not the standard Fetch "error" mode.
      // Never follow a redirect carrying the connection credential.
      redirect: 'manual',
    });
    status = response.status;
    const header = response.headers.get('Retry-After');
    if (header) retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - now.getTime());
    result = await responseJson(response);
  } catch {
    // Never log the credential, customer fields, receipt keys or response bodies.
  }
  if ([200, 201].includes(status) && result?.received === true && typeof result.id === 'string' && result.id.length > 0 && result.id.length <= 128) {
    await env.DB.prepare(`UPDATE flexqr_outbox SET status='sent',panel_id=?,delivered_at=?,last_http_status=?,last_error_code=NULL,lease_until=NULL,updated_at=? WHERE reservation_id=? AND lease_until=?`)
      .bind(result.id, timestamp, status, timestamp, row.reservation_id, lease).run();
    return { state: 'sent', status };
  }
  const blocked = PERMANENT_ERRORS.has(status);
  const minimumDelay = [401, 403].includes(status) ? 15 * 60000 : status === 402 ? 60 * 60000 : 30000;
  const backoff = Math.min(60 * 60000, 30000 * 2 ** Math.min(row.attempts - 1, 7));
  const delay = Math.min(24 * 3600000, Math.max(minimumDelay, backoff, Number.isFinite(retryAfter) ? retryAfter : 0));
  const next = new Date(now.getTime() + delay).toISOString();
  await env.DB.prepare(`UPDATE flexqr_outbox SET status=?,next_attempt_at=?,last_http_status=?,last_error_code=?,lease_until=NULL,updated_at=? WHERE reservation_id=? AND lease_until=?`)
    .bind(blocked ? 'blocked' : 'retry', next, status, status ? `HTTP_${status}` : 'NETWORK_OR_TIMEOUT', timestamp, row.reservation_id, lease).run();
  console.warn(JSON.stringify({ event: 'flexqr_delivery_pending', httpStatus: status, retry: !blocked }));
  return { state: blocked ? 'blocked' : 'retry', status };
}

export function scheduleDelivery(env, ctx, reservationId) {
  if (!flexqrConfigured(env) || !ctx) return;
  ctx.waitUntil(deliverReservation(env, reservationId).catch(() => {
    console.error(JSON.stringify({ event: 'flexqr_delivery_failed' }));
  }));
}

export async function drainOutbox(env) {
  if (!flexqrConfigured(env)) return;
  // Backfill only active future reservations, including those saved before this integration.
  const missing = await env.DB.prepare(`SELECT r.* FROM reservations r LEFT JOIN flexqr_outbox o ON o.reservation_id=r.id
    WHERE o.reservation_id IS NULL AND r.reservation_status='reserved' AND r.slot_at > ? ORDER BY r.created_at LIMIT 10`).bind(new Date().toISOString()).all();
  if (missing.results.length) await env.DB.batch(missing.results.map(row => queueStatement(env, row)));
  const now = new Date().toISOString();
  const due = await env.DB.prepare(`SELECT reservation_id FROM flexqr_outbox WHERE status IN ('queued','retry') AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?) ORDER BY next_attempt_at LIMIT 10`).bind(now, now).all();
  for (const row of due.results) await deliverReservation(env, row.reservation_id);
}
