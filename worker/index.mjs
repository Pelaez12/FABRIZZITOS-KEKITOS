import { SETTINGS, BookingError, availableTimes, isDate, validateBooking, slotDate } from '../shared/booking.mjs';

const MAX_RECEIPT = 5 * 1024 * 1024;
const MAX_BODY = MAX_RECEIPT + 64 * 1024;
// Build-time immutable static assets let the MCP deploy one complete Worker module.
const STATIC_ASSETS = __STATIC_ASSETS__;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const digest = async (data) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');

async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new BookingError('El comprobante debe pesar como máximo 5 MB.', 413);
  if (!request.body) throw new BookingError('El pedido está vacío.');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BODY) { await reader.cancel(); throw new BookingError('El comprobante debe pesar como máximo 5 MB.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

function imageMime(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
  if (new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  throw new BookingError('Sube una foto JPG, PNG o WebP válida.', 400, 'receipt');
}

function confirmation(row, local) {
  return { id: row.id, reference: row.reference, date: row.booking_date, time: row.booking_time, total: row.total_cents, paymentStatus: row.payment_status, fulfillment: row.fulfillment, kekeQty: row.keke_qty, shakeQty: row.shake_qty, local };
}

async function reserve(request, env) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && !(env.LOCAL_PREVIEW === 'true' && origin === 'http://127.0.0.1:5173')) throw new BookingError('Origen de solicitud no permitido.', 403);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new BookingError('Formato de pedido no válido.', 415);
  const requestKey = request.headers.get('Idempotency-Key') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestKey)) throw new BookingError('Actualiza la página e intenta nuevamente.', 400);
  const body = await boundedBody(request);
  const form = await new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') }, body }).formData();
  let raw;
  try { raw = JSON.parse(form.get('booking')); } catch { throw new BookingError('No se pudo leer el pedido.'); }
  // Validate immutable fields before accepting any payment image or database write.
  const prior = await env.DB.prepare('SELECT * FROM reservations WHERE request_key = ?').bind(requestKey).first();
  // An already-saved request remains retryable after its original 48 h cutoff.
  const booking = validateBooking(raw, prior ? new Date(prior.created_at) : new Date());
  let receiptBytes, receiptMime = null, receiptHash = null;
  const receipt = form.get('receipt');
  if (booking.payment === 'yape') {
    if (!receipt || typeof receipt === 'string' || receipt.size < 16) throw new BookingError('Adjunta tu comprobante de Yape.', 400, 'receipt');
    if (receipt.size > MAX_RECEIPT) throw new BookingError('El comprobante debe pesar como máximo 5 MB.', 413, 'receipt');
    receiptBytes = new Uint8Array(await receipt.arrayBuffer());
    receiptMime = imageMime(receiptBytes);
    receiptHash = await digest(receiptBytes);
    if (!env.RECEIPTS) throw new BookingError('La carga de comprobantes aún no está habilitada. Puedes reservar sin pagar.', 503, 'receipt');
  } else if (receipt && typeof receipt !== 'string' && receipt.size > 0) {
    throw new BookingError('Elimina el comprobante o selecciona pagar con Yape.', 400, 'receipt');
  }
  const payloadHash = await digest(new TextEncoder().encode(JSON.stringify({ ...booking, receiptHash })));
  if (prior) {
    if (prior.payload_hash !== payloadHash) throw new BookingError('Este intento corresponde a otro pedido. Inicia una nueva reserva.', 409);
    return json(confirmation(prior, env.LOCAL_PREVIEW === 'true'));
  }
  const id = crypto.randomUUID();
  const reference = `FK-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const receiptKey = receiptBytes ? `receipts/${id}/${crypto.randomUUID()}` : null;
  const createdAt = new Date().toISOString();
  const paymentStatus = receiptBytes ? 'pending_review' : 'unpaid';
  if (receiptBytes) await env.RECEIPTS.put(receiptKey, receiptBytes, { httpMetadata: { contentType: receiptMime }, customMetadata: { reservationId: id, sha256: receiptHash } });
  try {
    // The stock check and insert are ONE SQL statement, so concurrent requests cannot oversell.
    const insert = env.DB.prepare(`INSERT INTO reservations (id, reference, request_key, payload_hash, customer_name, phone, fulfillment, address, district, booking_date, booking_time, slot_at, keke_qty, shake_qty, total_cents, payment_status, receipt_key, receipt_mime, receipt_sha256, notice_accepted, created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?
      WHERE ? + COALESCE((SELECT SUM(keke_qty) FROM reservations WHERE booking_date = ? AND reservation_status <> 'cancelled'),0) <= ?`)
      .bind(id, reference, requestKey, payloadHash, booking.name, booking.phone, booking.fulfillment, booking.address, booking.district, booking.date, booking.time, slotDate(booking.date, booking.time).toISOString(), booking.kekeQty, booking.shakeQty, booking.total, paymentStatus, receiptKey, receiptMime, receiptHash, createdAt, booking.kekeQty, booking.date, SETTINGS.dailyKekeLimit);
    const event = (type, title) => env.DB.prepare('INSERT INTO admin_events (id,reservation_id,event_type,title,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM reservations WHERE id = ?)').bind(crypto.randomUUID(), id, type, title, createdAt, id);
    const statements = [insert, event('reservation.created', 'Tienes una nueva reserva')];
    if (receiptBytes) statements.push(event('payment.review_requested', 'Tienes un nuevo pago por revisar'));
    const results = await env.DB.batch(statements);
    if (!results[0].meta.changes) throw new BookingError('Ya no quedan suficientes kekitos para ese día. Elige otra fecha o reduce la cantidad.', 409, 'stock');
  } catch (error) {
    // A parallel retry with the same key may have won the unique constraint.
    const prior = await env.DB.prepare('SELECT * FROM reservations WHERE request_key = ?').bind(requestKey).first();
    if (prior && prior.payload_hash === payloadHash) {
      // Preserve this receipt if the insert committed but its response was lost.
      if (receiptKey && prior.receipt_key !== receiptKey) await env.RECEIPTS.delete(receiptKey);
      return json(confirmation(prior, env.LOCAL_PREVIEW === 'true'));
    }
    if (receiptKey) await env.RECEIPTS.delete(receiptKey);
    throw error;
  }
  return json(confirmation({ id, reference, booking_date: booking.date, booking_time: booking.time, total_cents: booking.total, payment_status: paymentStatus, fulfillment: booking.fulfillment, keke_qty: booking.kekeQty, shake_qty: booking.shakeQty }, env.LOCAL_PREVIEW === 'true'), 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/api/config') return json({ ...SETTINGS, local: env.LOCAL_PREVIEW === 'true', receiptsAvailable: Boolean(env.RECEIPTS) });
      if (request.method === 'GET' && url.pathname === '/api/availability') {
        const month = url.searchParams.get('month');
        if (!/^\d{4}-\d{2}$/.test(month || '') || !isDate(`${month}-01`)) throw new BookingError('Mes no válido.');
        const rows = await env.DB.prepare("SELECT booking_date, SUM(keke_qty) AS used FROM reservations WHERE booking_date LIKE ? AND reservation_status <> 'cancelled' GROUP BY booking_date").bind(`${month}-%`).all();
        const used = Object.fromEntries(rows.results.map(row => [row.booking_date, row.used]));
        const days = {};
        for (let day = 1; day <= 31; day++) {
          const date = `${month}-${String(day).padStart(2, '0')}`;
          if (!isDate(date)) break;
          days[date] = { remaining: Math.max(0, SETTINGS.dailyKekeLimit - (used[date] || 0)), times: availableTimes(date) };
        }
        return json({ days });
      }
      if (request.method === 'POST' && url.pathname === '/api/reservations') return await reserve(request, env);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Ruta no disponible.' }, 404);
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Método no permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
      if (env.ASSETS) {
        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
        return new Response(response.body, { status: response.status, headers });
      }
      const asset = STATIC_ASSETS[url.pathname === '/' ? '/index.html' : url.pathname];
      if (asset) {
        const bytes = Uint8Array.from(atob(asset.content), c => c.charCodeAt(0));
        return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
          'Content-Type': asset.type,
          'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        } });
      }
      return json({ error: 'Página no encontrada.' }, 404);
    } catch (error) {
      if (error instanceof BookingError) return json({ error: error.message, field: error.field }, error.status);
      // Do not log names, phone numbers, addresses or receipt data.
      console.error(JSON.stringify({ event: 'request_failed', route: url.pathname, errorType: error?.name || 'Error' }));
      return json({ error: 'No pudimos guardar tu reserva. Inténtalo nuevamente; no se confirmará hasta que aparezca tu código.' }, 500);
    }
  },
};
