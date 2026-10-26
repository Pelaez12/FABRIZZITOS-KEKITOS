export const SETTINGS = Object.freeze({
  brand: "FABRIZZITO'S KEKITOS",
  timezone: 'America/Lima',
  address: 'Av. Talara 450, Jesús María',
  yape: '955882306',
  yapeOwner: 'Luis Pelaez',
  cancellationPhone: '992272521',
  minimumNoticeHours: 0,
  bookingHorizonDays: 90,
  dailyKekeLimit: 15,
  kekePrice: 400,
  shakePrice: 1200,
  deliveryPrice: 600,
  notificationsConnected: false,
});

export const TIMES = Array.from({ length: 9 }, (_, i) => `${18 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`);
export const money = (cents) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 }).format(cents / 100);
export const limaDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: SETTINGS.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const slotDate = (date, time) => new Date(`${date}T${time}:00-05:00`);
export const addDays = (date, days) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

export function isDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}

export function availableTimes(date, now = new Date()) {
  if (!isDate(date) || [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) return [];
  if (date > addDays(limaDate(now), SETTINGS.bookingHorizonDays)) return [];
  return TIMES.filter((time) => slotDate(date, time).getTime() >= now.getTime() + SETTINGS.minimumNoticeHours * 3600000);
}

export function firstAvailableDate(now = new Date()) {
  let date = limaDate(now);
  for (let i = 0; i <= SETTINGS.bookingHorizonDays; i++, date = addDays(date, 1)) {
    if (availableTimes(date, now).length) return date;
  }
  return null;
}

export function calculateTotal({ kekeQty, shakeQty, fulfillment }) {
  return kekeQty * SETTINGS.kekePrice + shakeQty * SETTINGS.shakePrice + (fulfillment === 'delivery' ? SETTINGS.deliveryPrice : 0);
}

export class BookingError extends Error {
  constructor(message, status = 400, field = '') { super(message); this.status = status; this.field = field; }
}

export function validateBooking(raw, now = new Date()) {
  const kekeQty = Number(raw.kekeQty);
  const shakeQty = Number(raw.shakeQty);
  if (!Number.isInteger(kekeQty) || kekeQty < 0 || kekeQty > SETTINGS.dailyKekeLimit || !Number.isInteger(shakeQty) || shakeQty < 0 || shakeQty > 99 || kekeQty + shakeQty === 0) throw new BookingError('Elige al menos un producto. Puedes reservar hasta 15 kekitos por día.', 400, 'products');
  const fulfillment = raw.fulfillment;
  if (!['pickup', 'delivery'].includes(fulfillment)) throw new BookingError('Elige recojo o delivery.', 400, 'fulfillment');
  if (fulfillment === 'delivery' && shakeQty > 0) throw new BookingError('Los batidos son solo para recojo. Retíralos del pedido para elegir delivery.', 400, 'fulfillment');
  if (!availableTimes(raw.date, now).includes(raw.time)) throw new BookingError('Elige un horario que aún no haya pasado, de lunes a viernes, de 6 a 10 p. m. Puedes reservar para hoy si hay cupos.', 400, 'date');
  const name = String(raw.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100) throw new BookingError('Escribe tu nombre (de 2 a 100 caracteres).', 400, 'name');
  const phone = String(raw.phone || '').replace(/[\s()+-]/g, '').replace(/^51(?=9\d{8}$)/, '');
  if (!/^9\d{8}$/.test(phone)) throw new BookingError('Escribe un celular peruano de 9 dígitos.', 400, 'phone');
  const address = fulfillment === 'delivery' ? String(raw.address || '').trim() : '';
  if (fulfillment === 'delivery' && (raw.district !== 'Jesús María' || address.length < 8 || address.length > 240)) throw new BookingError('Indica una dirección de Jesús María (de 8 a 240 caracteres).', 400, 'address');
  if (!['later', 'yape'].includes(raw.payment)) throw new BookingError('Elige cómo deseas pagar.', 400, 'payment');
  if (raw.accepted !== true) throw new BookingError('Confirma que leíste el aviso de reserva y cancelación.', 400, 'accepted');
  const booking = { kekeQty, shakeQty, fulfillment, date: raw.date, time: raw.time, name, phone, address, district: fulfillment === 'delivery' ? 'Jesús María' : '', payment: raw.payment, accepted: true };
  return { ...booking, total: calculateTotal(booking) };
}
