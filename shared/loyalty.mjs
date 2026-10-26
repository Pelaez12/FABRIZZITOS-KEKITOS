import { addDays, limaDate } from './booking.mjs';

export const LEVELS = Object.freeze([
  { name: 'Fanático', xp: 500 }, { name: 'Apasionado de los kekes', xp: 1000 },
  { name: 'Master de los kekes', xp: 4000 }, { name: 'Master Chef', xp: 32000 },
]);
export const PRIZES = Object.freeze([
  { id: 'next-time', label: 'Suerte para la próxima', weight: 3500, discountCents: 0 },
  { id: 'quarter', label: '25 % de descuento en un kekito', weight: 4550, discountCents: 100 },
  { id: 'half', label: '50 % de descuento en un kekito', weight: 1625, discountCents: 200 },
  { id: 'free', label: 'Un kekito gratis', weight: 325, discountCents: 400 },
]);
export function prizeAt(roll) {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10000) throw new Error('Invalid roll');
  let limit = 0; return PRIZES.find(prize => roll < (limit += prize.weight));
}
export function levelFor(xp) {
  const level = LEVELS.filter(level => xp >= level.xp).at(-1) || { name: 'Explorador de kekitos', xp: 0 };
  const next = LEVELS.find(level => level.xp > xp) || null;
  return { ...level, next, remaining: next ? next.xp - xp : 0 };
}
const seed = value => [...value].reduce((n, c) => (Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
export function missionsFor(userId, now = new Date()) {
  const today = limaDate(now), weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const week = addDays(today, -(weekday === 0 ? 6 : weekday - 1));
  const month = today.slice(0, 7), monthStart = `${month}-01`;
  const nextMonth = new Date(`${monthStart}T12:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const dailyTarget = [2, 3, 4][seed(`${userId}:${today}:keke`) % 3];
  const shakeTarget = [1, 2][seed(`${userId}:${today}:shake`) % 2];
  const weeklyTarget = [6, 9, 12][seed(`${userId}:${week}`) % 3];
  return [
    { id: 'notifications-v1', period: 'once', title: 'Activa las promociones', kind: 'notifications', target: 1, points: 300 },
    { id: `daily:${today}:kekes`, period: 'daily', title: `Reserva ${dailyTarget} kekitos`, kind: 'kekes', target: dailyTarget, points: dailyTarget === 3 ? 100 : dailyTarget === 2 ? 75 : 125, start: today, end: addDays(today, 1) },
    { id: `daily:${today}:shakes`, period: 'daily', title: `Reserva ${shakeTarget} ${shakeTarget === 1 ? 'batido' : 'batidos'}`, kind: 'shakes', target: shakeTarget, points: shakeTarget * 40, start: today, end: addDays(today, 1) },
    { id: `weekly:${week}:kekes`, period: 'weekly', title: `${weeklyTarget} kekitos esta semana`, kind: 'kekes', target: weeklyTarget, points: weeklyTarget === 6 ? 250 : weeklyTarget === 9 ? 350 : 450, start: week, end: addDays(week, 7) },
    { id: `monthly:${month}:kekes`, period: 'monthly', title: '25 kekitos este mes', kind: 'kekes', target: 25, points: 900, start: monthStart, end: nextMonth.toISOString().slice(0, 10) },
    { id: `monthly:${month}:shakes`, period: 'monthly', title: '5 batidos este mes', kind: 'shakes', target: 5, points: 300, start: monthStart, end: nextMonth.toISOString().slice(0, 10) },
  ];
}
export const isQualified = order => order.reservation_status !== 'cancelled' && (order.payment_status === 'approved' || order.reservation_status === 'fulfilled');
export function missionProgress(mission, orders, notifications, qualifiedOnly = true) {
  if (mission.kind === 'notifications') return notifications ? 1 : 0;
  return orders.reduce((sum, order) => {
    const date = limaDate(new Date(order.created_at));
    if (order.reservation_status === 'cancelled' || (qualifiedOnly && !isQualified(order)) || date < mission.start || date >= mission.end) return sum;
    return sum + Number(mission.kind === 'kekes' ? order.keke_qty : order.shake_qty);
  }, 0);
}
export function summarizeLoyalty(orders, claims = [], notifications = false) {
  let xp = 0, pendingXp = 0, reservedKekes = 0, paidKekes = 0, prepaidKekes = 0, reservedShakes = 0;
  for (const order of orders) {
    if (order.reservation_status === 'cancelled') continue;
    const base = Number(order.keke_qty) + Number(order.shake_qty) * 6;
    reservedKekes += Number(order.keke_qty); reservedShakes += Number(order.shake_qty);
    if (isQualified(order)) xp += base; else pendingXp += base;
    if (order.payment_status === 'approved') {
      paidKekes += Number(order.keke_qty);
      if (order.receipt_key && Date.parse(order.created_at) <= Date.parse(order.slot_at)) { prepaidKekes += Number(order.keke_qty); xp += Number(order.keke_qty) * 5; }
    }
  }
  for (const claim of claims) {
    const definition = JSON.parse(claim.definition_json);
    // Opting out later never removes the one-time notification reward.
    if (definition.kind === 'notifications' || missionProgress(definition, orders, notifications) >= definition.target) xp += claim.points;
  }
  return { xp, pendingXp, level: levelFor(xp), reservedKekes, paidKekes, prepaidKekes, reservedShakes };
}
