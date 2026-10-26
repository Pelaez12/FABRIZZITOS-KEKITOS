import { createLocalJWKSet, jwtVerify } from 'jose';
import { PUBLIC_ORIGINS } from './promotions.mjs';
const SESSION = '__Host-fk_session', FLOW = '__Host-fk_oauth';
export class AccountError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const accountJson = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
export const cookieValue = (request, name) => request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
const cookie = (name, value, age) => `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
const enabled = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
function allowedHost(request, env) {
  const origin = new URL(request.url).origin;
  if (!PUBLIC_ORIGINS.includes(origin) && !(env.LOCAL_PREVIEW === 'true' && /^http:\/\/127\.0\.0\.1:(5173|8787|8788)$/.test(origin))) throw new AccountError('Dominio no permitido.', 403);
  return origin;
}
export function accountOrigin(request, env) {
  const origin = allowedHost(request, env);
  if (request.headers.get('Origin') !== origin) throw new AccountError('Origen no permitido.', 403);
}
export async function accountBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new AccountError('Usa JSON.', 415);
  if (!request.body) throw new AccountError('Falta el cuerpo de la solicitud.');
  const reader = request.body.getReader(); let size = 0, text = ''; const decoder = new TextDecoder();
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); throw new AccountError('Solicitud demasiado grande.', 413); } text += decoder.decode(value, { stream: true }); }
  let body; try { body = JSON.parse(text + decoder.decode()); } catch { throw new AccountError('JSON no válido.'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new AccountError('Objeto JSON requerido.'); return body;
}
export async function currentAccount(request, env, now = Date.now()) {
  const token = cookieValue(request, SESSION);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT a.* FROM customer_accounts a JOIN customer_sessions s ON s.user_id=a.id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha256(token), now).first();
}
export async function requireAccount(request, env, now) {
  const user = await currentAccount(request, env, now); if (!user) throw new AccountError('Ingresa con Google para usar tu cuenta.', 401); return user;
}
export async function boundedGoogleJson(r) {
  if (!r.ok) { await r.body?.cancel(); throw new AccountError('Google no pudo validar el acceso.', 502); }
  const reader = r.body.getReader(); const chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new AccountError('Respuesta de Google no válida.', 502); } chunks.push(value); }
  const bytes = new Uint8Array(size); let n = 0; for (const chunk of chunks) { bytes.set(chunk, n); n += chunk.length; } return JSON.parse(new TextDecoder().decode(bytes));
}
export async function verifyGoogle(idToken, env, nonce, now, fetcher = fetch) {
  const jwks = await boundedGoogleJson(await fetcher('https://www.googleapis.com/oauth2/v3/certs', { redirect: 'manual', signal: AbortSignal.timeout(8000) }));
  const { payload } = await jwtVerify(idToken, createLocalJWKSet(jwks), { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_ID, currentDate: new Date(now), maxTokenAge: '10m', clockTolerance: 30 });
  if (payload.nonce !== nonce || (payload.azp && payload.azp !== env.GOOGLE_CLIENT_ID) || payload.email_verified !== true || typeof payload.sub !== 'string' || payload.sub.length > 255 || typeof payload.email !== 'string' || payload.email.length > 254) throw new AccountError('No se pudo verificar tu identidad de Google.', 401);
  return { sub: payload.sub, email: payload.email, name: String(payload.name || payload.email.split('@')[0]).slice(0, 100) };
}
export async function authRoutes(request, env, { now = Date.now(), fetcher = fetch } = {}) {
  const url = new URL(request.url), route = url.pathname;
  if (!route.startsWith('/api/auth/')) return null;
  try {
    const origin = allowedHost(request, env);
    if (route === '/api/auth/config' && request.method === 'GET') return accountJson({ enabled: enabled(env), provider: 'google', callbackUrl: `${origin}/api/auth/google/callback` });
    if (route === '/api/auth/logout' && request.method === 'POST') {
      accountOrigin(request, env); const token = cookieValue(request, SESSION);
      if (token) await env.DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await sha256(token)).run();
      return new Response('{"loggedOut":true}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookie(SESSION, '', 0) } });
    }
    if (!enabled(env)) throw new AccountError('El acceso con Google estará disponible cuando el negocio termine su configuración.', 503);
    if (route === '/api/auth/google/start' && request.method === 'GET') {
      const bucket = `${Math.floor(now / 3600000)}:${await sha256(request.headers.get('CF-Connecting-IP') || 'local')}`;
      const limited = await env.DB.prepare('INSERT INTO customer_auth_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<20 RETURNING count').bind(bucket, now + 7200000).first();
      if (!limited) throw new AccountError('Demasiados intentos. Prueba más tarde.', 429);
      const state = random(), browser = random(), verifier = random(), nonce = random();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM customer_oauth_flows WHERE expires_at<=?').bind(now),
        env.DB.prepare('DELETE FROM customer_sessions WHERE expires_at<=?').bind(now),
        env.DB.prepare('DELETE FROM customer_auth_limits WHERE expires_at<=?').bind(now),
        env.DB.prepare('INSERT INTO customer_oauth_flows VALUES (?,?,?,?,?,?)').bind(await sha256(state), await sha256(browser), verifier, nonce, origin, now + 600000),
      ]);
      const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
      const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${origin}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
      return new Response(null, { status: 303, headers: { Location: target.href, 'Set-Cookie': cookie(FLOW, browser, 600), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    if (route === '/api/auth/google/callback' && request.method === 'GET') {
      const state = url.searchParams.get('state') || '', browser = cookieValue(request, FLOW), code = url.searchParams.get('code');
      if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser)) throw new AccountError('La sesión de acceso venció. Vuelve a intentarlo.', 401);
      const flow = await env.DB.prepare('DELETE FROM customer_oauth_flows WHERE state_hash=? AND browser_hash=? AND origin=? AND expires_at>? RETURNING *').bind(await sha256(state), await sha256(browser), origin, now).first();
      if (!flow || !code || code.length > 4096 || url.searchParams.has('error')) throw new AccountError('El acceso fue cancelado o venció. Puedes volver a intentarlo.', 401);
      const tokens = await boundedGoogleJson(await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, code_verifier: flow.verifier, grant_type: 'authorization_code', redirect_uri: `${origin}/api/auth/google/callback` }).toString(), redirect: 'manual', signal: AbortSignal.timeout(8000) }));
      const profile = await verifyGoogle(tokens.id_token, env, flow.nonce, now, fetcher);
      const user = await env.DB.prepare('INSERT INTO customer_accounts(id,google_sub,email,name,created_at) VALUES (?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email RETURNING id').bind(crypto.randomUUID(), profile.sub, profile.email, profile.name, now).first();
      const token = random(), previous = cookieValue(request, SESSION);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await sha256(previous)),
        env.DB.prepare('INSERT INTO customer_sessions VALUES (?,?,?)').bind(await sha256(token), user.id, now + 30 * 86400000),
      ]);
      const headers = new Headers({ Location: '/mi-cuenta', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      headers.append('Set-Cookie', cookie(SESSION, token, 30 * 86400)); headers.append('Set-Cookie', cookie(FLOW, '', 0));
      return new Response(null, { status: 303, headers });
    }
    throw new AccountError('Ruta de acceso no disponible.', 404);
  } catch (error) { return accountJson({ error: error instanceof AccountError ? error.message : 'No se pudo completar el acceso con Google. Vuelve a intentarlo.' }, error instanceof AccountError ? error.status : 502); }
}
