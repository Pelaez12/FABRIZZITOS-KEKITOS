import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { buildPushPayload } from '@block65/webcrypto-web-push';

async function component({ permission = 'default', supported = true, ios = false, active = false, enabled = true } = {}) {
  const calls = { permission: 0, subscribe: 0, unsubscribe: 0, posts: [], registrations: [] }, states = []; let index = 0;
  const sub = { toJSON: () => ({ endpoint: 'https://example.test', keys: {} }), unsubscribe: async () => { calls.unsubscribe++; return true; } };
  const registration = { pushManager: { getSubscription: async () => active ? sub : null, subscribe: async () => { calls.subscribe++; return sub; } } };
  const fakeReact = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: initial => { const id = index++; states[id] = id === 0 ? active : initial; return [states[id], value => states[id] = value]; }, useEffect: () => {} };
  const notification = { permission, requestPermission: async () => { calls.permission++; return 'granted'; } };
  const context = { exports: {}, require: name => name === 'react' ? fakeReact : { Bell: 'bell' }, isSecureContext: supported, navigator: { userAgent: ios ? 'iPhone' : 'test', platform: 'test', maxTouchPoints: 0, serviceWorker: { getRegistration: async () => registration, register: async (path, options) => { calls.registrations.push({ path, scope: options.scope }); return registration; }, ready: Promise.resolve(registration) } }, window: { Notification: notification, PushManager: {}, dispatchEvent: () => {} }, Notification: notification, matchMedia: () => ({ matches: false }), Event, Uint8Array, atob, fetch: async (url, init) => { calls.posts.push({ url, init }); return Response.json(url.endsWith('/config') ? { enabled, publicKey: 'AQ', consentVersion: 'promotions-v1' } : { subscribed: true }); } };
  const built = await build({ entryPoints: ['src/Promotions.jsx'], bundle: true, write: false, platform: 'browser', format: 'cjs', external: ['react', '@phosphor-icons/react'] });
  context.module = { exports: {} };
  vm.runInNewContext(built.outputFiles[0].text, context);
  const tree = context.module.exports.default();
  const button = tree.props.children.find(node => node?.type === 'button');
  return { calls, states, click: button.props.onClick };
}
test('el permiso solo se pide al pulsar y solo se suscribe tras aceptar', async () => {
  const c = await component(); assert.equal(c.calls.permission, 0); assert.equal(c.calls.subscribe, 0);
  await c.click(); assert.equal(c.calls.permission, 1); assert.equal(c.calls.subscribe, 1);
  const post = c.calls.posts.find(p => p.url.endsWith('/subscribe')); assert.equal(JSON.parse(post.init.body).consent, true);
  assert.equal(c.calls.registrations[0].path, '/sw.js'); assert.equal(c.calls.registrations[0].scope, '/');
  for (const origin of ['https://reserva.comunidadfortaleza.com', 'https://fabrizzitos-kekitos.fabrizziopelaez91.workers.dev']) {
    assert.equal(new URL(post.url, origin).origin, origin); assert.equal(new URL(c.calls.registrations[0].path, origin).origin, origin);
  }
});
test('permiso denegado, navegador incompatible e iPhone no instalado no se suscriben', async () => {
  for (const options of [{ permission: 'denied' }, { supported: false }, { ios: true }]) {
    const c = await component(options); await c.click(); assert.equal(c.calls.permission, 0); assert.equal(c.calls.subscribe, 0); assert.ok(c.states[2]);
  }
});
test('desactivar revoca suscripción del navegador y del servidor sin pedir permiso', async () => {
  const c = await component({ active: true }); await c.click(); assert.equal(c.calls.unsubscribe, 1); assert.equal(c.calls.permission, 0); assert.ok(c.calls.posts.some(p => p.url.endsWith('/unsubscribe')));
});
test('conexión pendiente no crea una suscripción', async () => {
  const c = await component({ enabled: false }); await c.click(); assert.equal(c.calls.subscribe, 0); assert.match(c.states[2], /aún no están disponibles/);
});
test('Web Push cifra el mensaje y firma VAPID sin contactar a un proveedor', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url');
  const privateKey = (await crypto.subtle.exportKey('jwk', keys.privateKey)).d;
  const client = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/mock', expirationTime: null, keys: { p256dh: Buffer.from(await crypto.subtle.exportKey('raw', client.publicKey)).toString('base64url'), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') } };
  const init = await buildPushPayload({ data: JSON.stringify({ title: 'Simulado', body: 'Solo prueba' }), options: { ttl: 3600 } }, subscription, { publicKey, privateKey, subject: 'https://example.test' });
  const headers = new Headers(init.headers); assert.equal(init.method.toUpperCase(), 'POST'); assert.equal(headers.get('content-encoding'), 'aes128gcm'); assert.match(headers.get('authorization'), /^vapid /); assert.ok(!String(init.body).includes('Solo prueba'));
});
test('Service Worker solo abre enlaces del negocio y conserva eventos push/click', async () => {
  const events = {}, context = { self: { location: { origin: 'https://reserva.comunidadfortaleza.com' }, addEventListener: (type, fn) => events[type] = fn }, URL };
  vm.createContext(context); vm.runInContext(await readFile('public/sw.js', 'utf8'), context);
  assert.equal(vm.runInContext("safeUrl('https://evil.test/path')", context), 'https://reserva.comunidadfortaleza.com'); assert.equal(vm.runInContext("safeUrl('/#booking')", context), 'https://reserva.comunidadfortaleza.com/#booking'); assert.equal(typeof events.push, 'function'); assert.equal(typeof events.notificationclick, 'function');
});
