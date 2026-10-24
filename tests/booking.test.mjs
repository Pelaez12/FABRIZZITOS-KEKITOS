import test from 'node:test';
import assert from 'node:assert/strict';
import { availableTimes, validateBooking, calculateTotal, firstAvailableDate, limaDate } from '../shared/booking.mjs';

const now = new Date('2026-10-26T23:15:00Z'); // Monday, 18:15 Lima.
const valid = { kekeQty: 2, shakeQty: 1, fulfillment: 'pickup', date: '2026-10-28', time: '18:30', name: 'Cliente de prueba', phone: '955000001', address: '', district: '', payment: 'later', accepted: true };

test('48 horas exactas: excluye 18:00 y ofrece 18:30', () => {
  assert.equal(availableTimes('2026-10-28', now).includes('18:00'), false);
  assert.equal(availableTimes('2026-10-28', now)[0], '18:30');
  assert.equal(availableTimes('2026-10-27', now).length, 0);
});
test('sábado, domingo, fechas inexistentes y horas fuera del horario no se reservan', () => {
  for (const date of ['2026-10-31', '2026-11-01', '2026-02-30']) assert.deepEqual(availableTimes(date, now), []);
  assert.throws(() => validateBooking({ ...valid, time: '22:30' }, now));
  assert.equal(availableTimes('2026-10-30', now).at(-1), '22:00');
});
test('la zona horaria es Lima, aunque UTC ya sea el día siguiente', () => {
  assert.equal(limaDate(new Date('2026-10-27T02:00:00Z')), '2026-10-26');
  assert.equal(firstAvailableDate(now), '2026-10-28');
});
test('precios y delivery se calculan en centavos en el servidor', () => {
  assert.equal(validateBooking(valid, now).total, 2000);
  assert.equal(calculateTotal({ kekeQty: 3, shakeQty: 0, fulfillment: 'delivery' }), 1800);
  assert.equal(validateBooking({ ...valid, total: 1 }, now).total, 2000);
});
test('delivery rechaza batidos y distritos diferentes a Jesús María', () => {
  assert.throws(() => validateBooking({ ...valid, fulfillment: 'delivery', district: 'Jesús María', address: 'Av. de prueba 123' }, now), /batidos/);
  assert.throws(() => validateBooking({ ...valid, shakeQty: 0, fulfillment: 'delivery', district: 'Lince', address: 'Av. de prueba 123' }, now), /Jesús María/);
});
test('rechaza cantidades negativas, fraccionarias, vacías y superiores al cupo', () => {
  for (const values of [{ kekeQty: -1 }, { kekeQty: 1.2 }, { kekeQty: 16 }, { kekeQty: 0, shakeQty: 0 }]) assert.throws(() => validateBooking({ ...valid, ...values }, now));
});
test('valida contacto y aceptación y normaliza prefijo peruano', () => {
  assert.equal(validateBooking({ ...valid, phone: '+51 955 000 001' }, now).phone, '955000001');
  assert.throws(() => validateBooking({ ...valid, phone: '123' }, now));
  assert.throws(() => validateBooking({ ...valid, accepted: false }, now));
});
