import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Gift, GoogleLogo, SignOut, Star, Trophy, UserCircle } from '@phosphor-icons/react';
import { LEVELS, PRIZES } from '../shared/loyalty.mjs';
import { money } from '../shared/booking.mjs';
const periodNames = { once: 'Una sola vez', daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual' };
const paymentNames = { unpaid: 'Pago pendiente', pending_review: 'Comprobante en revisión', approved: 'Pago aprobado', rejected: 'Comprobante rechazado' };
export async function accountApi(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'No pudimos consultar tu cuenta.'); error.status = response.status; throw error; }
  return data;
}
function GoogleButton({ enabled }) { return enabled ? <a className="button primary google-login" href="/api/auth/google/start"><GoogleLogo size={20} />Continuar con Google</a> : <button className="button secondary google-login" type="button" disabled><GoogleLogo size={20} />Google, próximamente</button>; }
export default function Account({ revision, onProfile, onSession, view }) {
  const [auth, setAuth] = useState(null), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const tab = view;
  const [profile, setProfile] = useState({ name: '', phone: '', address: '' }), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [spinResult, setSpinResult] = useState(null), [angle, setAngle] = useState(0), [spinning, setSpinning] = useState(false);
  const spinKey = useRef(null), timer = useRef(null);
  const load = async () => {
    setError('');
    try {
      const config = await accountApi('/api/auth/config'); setAuth(config);
      try { const me = await accountApi('/api/account/me'); setData(me); setProfile(me.profile); onProfile?.(me.profile); onSession?.(me.profile); }
      catch (e) { if (e.status === 401) { setData(null); onSession?.(null); } else throw e; }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [revision]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const saveProfile = async event => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const result = await accountApi('/api/account/profile', profile); setProfile(result.profile); onProfile?.(result.profile); setMessage('Perfil guardado. Lo usaremos para completar tus próximas reservas.'); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const claim = async mission => {
    setBusy(true); setMessage('');
    try {
      if (mission.kind === 'notifications' && !mission.canClaim && !mission.claimed) {
        const registration = await navigator.serviceWorker?.getRegistration('/'); const sub = await registration?.pushManager.getSubscription();
        if (!sub) throw new Error('Activa las promociones en la sección de avisos y vuelve a verificar esta misión.');
        await accountApi('/api/account/push-link', { subscription: sub.toJSON() });
      }
      await accountApi('/api/account/missions/claim', { missionId: mission.id }); setMessage(`Misión completada: +${mission.points} XP.`); await load();
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const spin = async () => {
    if (spinning || busy) return; setBusy(true); setMessage('');
    spinKey.current ||= crypto.randomUUID();
    try {
      const result = await accountApi('/api/account/wheel/spin', { requestId: spinKey.current });
      spinKey.current = null;
      let accumulated = 0, center = 0;
      for (const prize of PRIZES) { if (prize.id === result.spin.prize_id) center = (accumulated + prize.weight / 2) / 10000 * 360; accumulated += prize.weight; }
      setSpinResult(null); setSpinning(true); setAngle(previous => previous + 1800 + ((360 - center - previous % 360 + 360) % 360));
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      timer.current = setTimeout(async () => { setSpinResult(result.spin); setSpinning(false); await load(); }, reduced ? 0 : 4000);
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const logout = async () => { setBusy(true); try { await accountApi('/api/auth/logout', {}); setData(null); onProfile?.(null); onSession?.(null); setMessage('Sesión cerrada.'); } catch (e) { setMessage(e.message); } finally { setBusy(false); } };
  const visible = ['login', 'progress', 'profile', 'orders', 'missions', 'wheel'].includes(view);
  const titles = { login: 'Bienvenido a tu club.', progress: 'Mi cuenta.', profile: 'Mi perfil.', orders: 'Mis reservas.', missions: 'Misiones para sumar XP.' };
  return <div hidden={!visible} className="account-route">
    <section className="club-section" id="cuenta" hidden={view === 'wheel' && !!data} aria-labelledby="club-title">
      <div className="club-heading"><div><span className="club-eyebrow"><Star size={18} />EL CLUB DE TUS KEKITOS</span><h1 id="club-title">{titles[view] || 'Ingresa para guardar tus premios.'}</h1><p>Tu perfil, tus reservas y las misiones que te acercan al siguiente nivel.</p></div>{data ? <div className="club-actions"><button className="text-button" type="button" disabled={busy} onClick={load}>Actualizar cuenta</button><button className="text-button" type="button" disabled={busy} onClick={logout}><SignOut size={18} />Cerrar sesión</button></div> : <GoogleButton enabled={auth?.enabled} />}</div>
      {error && <p className="notice error" role="alert">{error} <button className="text-button" type="button" onClick={load}>Reintentar</button></p>}
      {loading ? <p className="account-loading" role="status">Consultando tu cuenta…</p> : !data ? <div className="club-welcome"><div><UserCircle size={40} weight="duotone" /><h3>Tu próxima reserva, más fácil.</h3><p>Guarda tu nombre, celular y dirección. Al ingresar, tus nuevos pedidos quedarán asociados a tu cuenta y podrás revisar qué está reservado, pagado o pendiente.</p>{!auth?.enabled && <p className="account-pending">El acceso con Google está pendiente de configuración. Mientras tanto, puedes reservar normalmente sin cuenta.</p>}<a className="text-button" href="/reservar">Hacer una reserva<ArrowRight size={17} /></a></div><div className="xp-explainer"><h3>Así sumas XP</h3><p><strong>+1 XP</strong> por kekito reservado · <strong>+6 XP</strong> por batido.</p><p><strong>+5 XP extra</strong> por cada kekito pagado por adelantado y aprobado.</p><p className="small">El XP de compra queda pendiente hasta validar el pago o entregar el pedido. Las compras canceladas no cuentan. Tu primera misión de avisos vale 300 XP.</p></div></div> : <>
        <nav className="account-nav" aria-label="Secciones de mi cuenta">{[['progress', '/mi-cuenta', 'Mi progreso'], ['profile', '/mi-perfil', 'Mi perfil'], ['orders', '/mis-reservas', 'Mis reservas'], ['missions', '/misiones', 'Misiones']].map(([id, href, title]) => <a href={href} key={id} aria-current={tab === id ? 'page' : undefined}>{title}</a>)}</nav>{view === 'login' && <p>Tu sesión ya está iniciada. Elige una sección para continuar o <a href="/reservar">haz una reserva</a>.</p>}
        {tab === 'profile' && <form className="account-profile" onSubmit={saveProfile}><h3>Datos para tus reservas</h3><p>Solo tú y el negocio pueden consultar estos datos. El correo proviene de tu cuenta de Google.</p><div className="fields-row"><label>Nombre completo<input value={profile.name} autoComplete="name" required minLength={2} maxLength={100} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></label><label>Celular completo<div className="phone-input"><span>+51</span><input value={profile.phone} type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="955 000 000" maxLength={16} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} /></div></label></div><label>Correo de Google<input value={profile.email} readOnly autoComplete="email" /></label><label>Dirección habitual en Jesús María (opcional)<input value={profile.address} autoComplete="street-address" maxLength={240} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} /></label><button className="button primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar perfil'}</button></form>}
        {tab === 'orders' && <div className="account-orders"><h3>Tus últimas 30 reservas</h3>{data.orders.length === 0 ? <p>Tu próximo pedido aparecerá aquí si lo haces con la sesión iniciada. Las reservas anteriores sin cuenta no se vinculan automáticamente.</p> : data.orders.map(order => <article className="account-order" key={order.id}><div><strong>{order.reference}</strong><span>{order.date} · {order.time}</span></div><div><span>{order.kekeQty} kekitos · {order.shakeQty} batidos</span><small>{order.status === 'cancelled' ? 'Cancelada' : order.status === 'fulfilled' ? 'Entregada' : 'Reservada'} · {paymentNames[order.paymentStatus]}</small></div><strong>{money(order.total)}</strong></article>)}</div>}
        {tab === 'progress' && <><div className="xp-overview"><div><Trophy size={30} /><h3>{data.level.name}</h3><strong className="xp-number">{data.xp.toLocaleString('es-PE')} <span>XP</span></strong><p>{data.pendingXp} XP de compras pendientes de validar.</p>{data.level.next ? <><progress aria-label="Progreso hacia el siguiente nivel" value={data.xp - data.level.xp} max={data.level.next.xp - data.level.xp} /><p>Te faltan {data.level.remaining.toLocaleString('es-PE')} XP para {data.level.next.name}.</p></> : <p>¡Alcanzaste Master Chef!</p>}</div><dl className="account-counts"><div><dt>Kekitos reservados</dt><dd>{data.reservedKekes}</dd></div><div><dt>Kekitos pagados</dt><dd>{data.paidKekes}</dd></div><div><dt>Con adelanto aprobado</dt><dd>{data.prepaidKekes}</dd></div><div><dt>Batidos reservados</dt><dd>{data.reservedShakes}</dd></div></dl></div><div className="account-shortcuts"><a href="/mi-perfil">Completar mi perfil<ArrowRight size={18} /></a><a href="/misiones">Ver mis misiones<ArrowRight size={18} /></a><a href="/ruleta">Mis giros y premios<Gift size={19} /></a></div></>}{tab === 'missions' && <><div className="mission-heading"><h3>Misiones para tu próxima pausa</h3><p>Las misiones de consumo avanzan con pagos aprobados o pedidos entregados. Días, semanas y meses según la hora de Lima.</p></div><div className="mission-list">{data.missions.map(mission => <article className="mission-row" key={mission.id}><div><small>{periodNames[mission.period]}</small><h4>{mission.title}</h4><p>{Math.min(mission.progress, mission.target)} / {mission.target}{mission.pendingProgress ? ` · ${mission.pendingProgress} pendiente(s) de validar` : ''}</p></div><strong>+{mission.points} XP</strong><button className="button secondary" type="button" disabled={busy || mission.claimed || (!mission.canClaim && mission.kind !== 'notifications')} onClick={() => claim(mission)}>{mission.claimed ? 'Reclamada' : mission.kind === 'notifications' && !mission.canClaim ? 'Verificar avisos' : 'Reclamar XP'}</button></article>)}</div></>}
      </>}
      <ol hidden={!['progress', 'login'].includes(view)} className="level-track" aria-label="Niveles del club">{LEVELS.map(level => <li key={level.xp} className={data?.xp >= level.xp ? 'level-earned' : ''}><Trophy size={20} /><strong>{level.name}</strong><span>{level.xp.toLocaleString('es-PE')} XP</span></li>)}</ol>
      {message && <p className="permission-message account-message" role="status">{message}</p>}
    </section>
    <section className="wheel-section" id="ruleta" hidden={view !== 'wheel'} aria-labelledby="wheel-title"><div className="wheel-art"><img src="/images/roulette.webp" alt="Fabrizzito's Kekitos: gira la ruleta y prueba tu suerte" width="560" height="560" loading="lazy" /><p>Por cada 10 kekitos pagados y validados, tienes un giro sin costo extra.</p></div><div className="wheel-content"><span className="club-eyebrow"><Gift size={18} />UNA PAUSA CON SORPRESA</span><h2 id="wheel-title">Tu próxima vuelta puede tener premio.</h2><p>{data ? `Tienes ${data.availableSpins} giro(s) disponible(s). Vas ${data.wheelProgress} de 10 kekitos para el siguiente.` : 'Ingresa con Google para guardar tus compras, giros y premios.'}</p><div className="prize-wheel" aria-hidden="true"><div className="wheel-pointer" /><div className="wheel-disc" style={{ transform: `rotate(${angle}deg)` }}><span>FK</span></div></div><button className="button primary" type="button" disabled={!data || data.availableSpins < 1 || spinning || busy} onClick={spin}>{spinning ? 'Girando…' : data ? 'Girar la ruleta' : 'Ingresa para girar'}<ArrowRight size={19} /></button><ul className="prize-odds">{PRIZES.map(prize => <li key={prize.id}><span>{prize.label}</span><strong>{(prize.weight / 100).toLocaleString('es-PE')} %</strong></li>)}</ul>{spinResult && <div className="wheel-result" role="status"><strong>{spinResult.prize_label}</strong>{spinResult.discount_cents > 0 && <p>Tu código está guardado en «Mis premios». Preséntalo en el local para validar el canje.</p>}</div>}<p className="small">El resultado se decide y guarda en el servidor. El 35 % de los giros no tiene premio. Cada premio se aplica a un kekito, no se cambia por dinero y requiere validación en el local.</p></div>{data && <div className="saved-prizes"><h3>Mis premios y giros</h3>{!data.spins.length ? <p>Aquí aparecerán tus resultados cuando completes tus primeros 10 kekitos pagados.</p> : data.spins.map(item => <article key={item.id}><div><strong>{item.prize_label}</strong><span>Giro {item.spin_number}{item.redeemed_at ? ' · Canjeado' : item.discount_cents > 0 ? ' · Pendiente de canje' : ''}</span></div>{item.discount_cents > 0 && <code>{item.code}</code>}</article>)}</div>}</section>
  </div>;
}
