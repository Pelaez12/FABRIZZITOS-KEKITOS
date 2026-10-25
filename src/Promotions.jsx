import React, { useEffect, useState } from 'react';
import { Bell } from '@phosphor-icons/react';

const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const supported = () => isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function api(path, body) {
  const r = await fetch(`/api/push/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'No pudimos actualizar las promociones. Intenta nuevamente.');
  return data;
}
export default function Promotions() {
  const [active, setActive] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (!supported()) return;
      try { const registration = await navigator.serviceWorker.getRegistration('/'); const sub = await registration?.pushManager.getSubscription(); if (alive) setActive(!!sub); } catch {}
    };
    refresh(); window.addEventListener('promotions-change', refresh);
    return () => { alive = false; window.removeEventListener('promotions-change', refresh); };
  }, []);
  const toggle = async () => {
    setMessage('');
    if (ios() && !standalone()) { setMessage('En iPhone o iPad, abre esta página en Safari, pulsa Compartir → Añadir a pantalla de inicio. Ábrela desde ese icono y pulsa «Activar promociones». Requiere iOS/iPadOS 16.4 o posterior.'); return; }
    if (!supported()) { setMessage('Este navegador no admite avisos push. Puedes seguir reservando con normalidad. Prueba un navegador actualizado.'); return; }
    setBusy(true);
    try {
      if (active) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const sub = await registration?.pushManager.getSubscription();
        if (sub) {
          const subscription = sub.toJSON();
          const removed = await sub.unsubscribe();
          if (!removed) throw new Error('No se pudo desactivar en este navegador. Reintenta o bloquea los avisos desde sus ajustes.');
          setActive(false);
          await api('unsubscribe', { subscription });
        }
        setMessage('Promociones desactivadas. Puedes volver a activarlas cuando quieras.');
      } else {
        // Request synchronously inside the click gesture, including Safari's user activation requirement.
        if (Notification.permission === 'denied') throw new Error('Los avisos están bloqueados. Puedes permitirlos en los ajustes de este sitio. Tus pedidos siguen disponibles.');
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (permission !== 'granted') throw new Error(permission === 'denied' ? 'No activamos promociones. Puedes cambiar el permiso en los ajustes del navegador y seguir reservando normalmente.' : 'No activamos promociones. Puedes decidirlo más adelante.');
        const config = await api('config');
        if (!config.enabled) throw new Error('Las promociones aún no están disponibles. Puedes seguir reservando y volver a intentarlo más adelante.');
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const registration = await navigator.serviceWorker.ready;
        let sub = await registration.pushManager.getSubscription();
        const created = !sub;
        if (!sub) {
          const bytes = Uint8Array.from(atob(config.publicKey.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
          sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        }
        try { await api('subscribe', { subscription: sub.toJSON(), consent: true, consentVersion: config.consentVersion, permission }); }
        catch (error) { if (created) await sub.unsubscribe(); throw error; }
        setActive(true); setMessage('Listo. Recibirás promociones y avisos de nuevos horneados.');
      }
    } catch (error) { setMessage(error.message || 'No se pudo completar el cambio. Puedes seguir reservando.'); }
    finally { setBusy(false); window.dispatchEvent(new Event('promotions-change')); }
  };
  return <div className="promotion-controls"><p>Recibe ofertas y avisos de nuevos horneados de FABRIZZITO’S KEKITOS. Como máximo un aviso al día. Es opcional y puedes desactivarlo aquí.</p><button className="button primary" type="button" disabled={busy} onClick={toggle}><Bell size={19} />{busy ? 'Actualizando…' : active ? 'Desactivar promociones' : 'Activar promociones'}</button>{ios() && !standalone() && <p className="field-help">En iPhone: Safari → Compartir → Añadir a pantalla de inicio. Después, abre el aplicativo desde su icono.</p>}{!supported() && !(ios() && !standalone()) && <p className="field-help">Este navegador no admite notificaciones push. Puedes hacer pedidos normalmente.</p>}{message && <p className="permission-message" role="status">{message}</p>}</div>;
}
