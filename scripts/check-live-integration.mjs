// Explicit manual smoke test. Creates one clearly-labelled live test reservation.
// Its returned ID must be cancelled in origin after verifying the FLEXQR receipt.
import { firstAvailableDate, addDays } from '../shared/booking.mjs';
const origin = 'https://fabrizzitos-kekitos.fabrizziopelaez91.workers.dev';
const booking = { kekeQty: 1, shakeQty: 0, fulfillment: 'pickup', date: addDays(firstAvailableDate(), 7), time: '18:00', name: 'PRUEBA DE CONEXIÓN - NO PREPARAR', phone: '900000000', address: '', district: '', payment: 'later', accepted: true };
const form = new FormData();
form.set('booking', JSON.stringify(booking));
const requestKey = process.argv[2] || crypto.randomUUID();
const response = await fetch(`${origin}/api/reservations`, { method: 'POST', headers: { Origin: origin, 'Idempotency-Key': requestKey }, body: form, signal: AbortSignal.timeout(20000) });
const result = await response.json();
if (![200, 201].includes(response.status)) throw new Error(`Smoke test rejected: ${response.status}`);
console.log(JSON.stringify({ id: result.id, reference: result.reference, liveTest: true }));
