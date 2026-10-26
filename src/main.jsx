import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Bell, CalendarBlank, CaretLeft, CaretRight, Check, CheckCircle, Clock, Copy, MapPin, Minus, Plus, ShieldCheck, ShoppingBag, Truck, UploadSimple, WhatsappLogo, X } from '@phosphor-icons/react';
import '@fontsource-variable/outfit';
import './style.css';
import Promotions from './Promotions.jsx';
import Account from './Account.jsx';
import { SETTINGS, availableTimes, firstAvailableDate, limaDate, addDays, calculateTotal, money, validateBooking } from '../shared/booking.mjs';

const initialDate = firstAvailableDate();
const pickupMap = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3901.604345820125!2d-77.04777982493852!3d-12.070720888167914!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9105c98bcd1d29eb%3A0xa5c76c0ca4e061c8!2sAcademia%20de%20Natacion%20Kallpa%20Triatlon!5e0!3m2!1ses-419!2spe!4v1792883642782!5m2!1ses-419!2spe';
const initial = { kekeQty: 1, shakeQty: 0, fulfillment: 'pickup', date: '', time: '', name: '', phone: '', address: '', district: 'Jesús María', payment: 'later', accepted: false };
const dateLabel = (date) => date ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : 'Por elegir';
const timeLabel = (time) => time ? `${Number(time.slice(0, 2)) - 12}:${time.slice(3)} p. m.` : '';
const monthLabel = (month) => new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));

function Intro() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    try { return !sessionStorage.getItem('fk-intro'); } catch { return true; }
  });
  const close = () => { setVisible(false); try { sessionStorage.setItem('fk-intro', '1'); } catch {} };
  useEffect(() => {
    if (reduced) { close(); return; }
    const timer = setTimeout(close, 1750);
    return () => clearTimeout(timer);
  }, [reduced]);
  return <AnimatePresence>{visible && !reduced && <motion.div className="intro" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} role="dialog" aria-label="Bienvenida a Fabrizzito's Kekitos" aria-modal="true">
    <motion.div className="intro-ring" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}><motion.img src="/images/intro.webp" alt="Fabrizzito's Kekitos, avena, banana y batidos" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 1.5 }} /></motion.div>
    <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>Un antojo con buena proteína.</motion.p>
    <button className="text-button intro-skip" onClick={close}>Omitir intro <ArrowRight size={16} /></button>
  </motion.div>}</AnimatePresence>;
}

function Quantity({ title, value, max, onChange }) {
  return <div className="quantity" aria-label={`Cantidad de ${title}`}>
    <button type="button" className="icon-button" aria-label={`Quitar un ${title}`} disabled={value === 0} onClick={() => onChange(value - 1)}><Minus size={16} /></button>
    <output aria-live="polite" aria-label={`${title} seleccionados`}>{value}</output>
    <button type="button" className="icon-button" aria-label={`Agregar un ${title}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={16} /></button>
  </div>;
}

function Notice({ children, error = false }) {
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : undefined}>{error ? <X size={19} /> : <ShieldCheck size={19} />}<div>{children}</div></div>;
}

function Calendar({ data, setData, availability, month, setMonth, loading, error, refresh }) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const earliestMonth = initialDate.slice(0, 7);
  const lastMonth = addDays(limaDate(), SETTINGS.bookingHorizonDays).slice(0, 7);
  const move = (amount) => {
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + amount, 1)).toISOString().slice(0, 7);
    setMonth(next);
  };
  const selected = availability[data.date];
  return <>
    <div className="calendar-layout">
      <div className="calendar">
        <div className="calendar-heading"><h3>{monthLabel(month)}</h3><div className="calendar-arrows"><button type="button" className="icon-button" aria-label="Mes anterior" disabled={month <= earliestMonth} onClick={() => move(-1)}><CaretLeft size={19} /></button><button type="button" className="icon-button" aria-label="Mes siguiente" disabled={month >= lastMonth} onClick={() => move(1)}><CaretRight size={19} /></button></div></div>
        <div className="calendar-grid" aria-label="Días de la semana">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => <span className="weekday" key={i} aria-label={['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][i]}>{day}</span>)}</div>
        <div className={`calendar-grid days ${loading ? 'is-loading' : ''}`} aria-label="Elige una fecha" aria-busy={loading}>
          {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
          {Array.from({ length: count }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`;
            const day = availability[date];
            const disabled = loading || !!error || !day?.times.length || day.remaining < data.kekeQty;
            return <button type="button" key={date} className={`day ${data.date === date ? 'selected' : ''}`} disabled={disabled} aria-pressed={data.date === date} aria-label={`${dateLabel(date)}${day?.remaining === 0 ? ', kekitos agotados' : ''}`} onClick={() => setData({ ...data, date, time: '' })}>{i + 1}{!disabled && <span className="day-dot" />}</button>;
          })}
        </div>
        <p className="calendar-key"><span />Fechas disponibles · Hora de Lima</p>
      </div>
      <div className="times-panel">
        <h3>{data.date ? new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`)) : 'Elige un día'}</h3>
        {!data.date ? <div className="time-empty"><CalendarBlank size={34} weight="light" /><p>Selecciona una fecha para ver los horarios.</p></div> : <>
          <p className="muted small">{data.fulfillment === 'pickup' ? 'Hora de recojo' : 'Hora acordada de entrega'}</p>
          <div className="time-grid">{(selected?.times || []).map(time => <button type="button" key={time} className={`time ${data.time === time ? 'selected' : ''}`} aria-pressed={data.time === time} onClick={() => setData({ ...data, time })}>{timeLabel(time)}{data.time === time && <Check size={15} weight="bold" />}</button>)}</div>
          {selected && <p className="availability-note">{selected.remaining} de 15 kekitos disponibles ese día.</p>}
        </>}
      </div>
    </div>
    {error && <Notice error>{error} <button className="text-button" type="button" onClick={refresh}>Volver a consultar</button></Notice>}
    <Notice>También puedes reservar <strong>para el mismo día</strong>, si quedan cupos y el horario aún no pasó. Atendemos de lunes a viernes, de 6 a 10 p. m.</Notice>
  </>;
}

function Notifications() {
  const dialogRef = useRef(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (open && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!open && dialogRef.current?.open) dialogRef.current.close();
  }, [open]);
  return <>
    <button className="text-button notification-reopen" type="button" onClick={() => setOpen(true)}><Bell size={19} />Recibir avisos de horneado</button>
    <dialog className="notification-dialog" ref={dialogRef} aria-labelledby="notification-title" aria-describedby="notification-description" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="notification-modal-content">
        <button type="button" className="icon-button notification-close" aria-label="Cerrar aviso de notificaciones" onClick={() => setOpen(false)}><X size={21} /></button>
        <img className="notification-art" src="/images/notifications.webp" alt="Activa las notificaciones de Fabrizzito's Kekitos para enterarte cuando estamos horneando" width="360" height="360" />
        <div className="notification-copy"><span className="notification-bell"><Bell size={28} weight="duotone" /></span><h2 id="notification-title">Que no se te pase el próximo horneado.</h2><p id="notification-description">Entérate de nuestras ofertas y próximos horneados.</p><Promotions /><button className="text-button notification-later" type="button" onClick={() => setOpen(false)}>Volver a mi reserva</button></div>
      </div>
    </dialog>
  </>;
}

function Confirmation({ result, data, onReset }) {
  const cancellation = `https://wa.me/51${SETTINGS.cancellationPhone}?text=${encodeURIComponent(`Hola, necesito cancelar mi reserva ${result.reference}, para el ${result.date} a las ${timeLabel(result.time)}. Mi nombre es ${data.name}.`)}`;
  const calendarFile = () => {
    const start = new Date(`${result.date}T${result.time}:00-05:00`);
    const end = new Date(start.getTime() + 30 * 60000);
    const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const escape = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fabrizzitos//Reservas//ES', 'BEGIN:VEVENT', `UID:${result.id}@fabrizzitos`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape("Pedido de FABRIZZITO'S KEKITOS")}`, `LOCATION:${escape(data.fulfillment === 'pickup' ? SETTINGS.address : `${data.address}, Jesús María`)}`, `DESCRIPTION:${escape(`Reserva ${result.reference}. ${result.kekeQty} kekitos y ${result.shakeQty} batidos. Total ${money(result.total)}. Cancelaciones: ${SETTINGS.cancellationPhone}.`)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${result.reference}.ics`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="confirmation" id="booking" tabIndex={-1}>
    <div className="success-mark"><Check size={32} weight="bold" /></div><p className="confirmation-code">{result.reference}</p><h2>Tu antojo ya tiene fecha.</h2><p>Gracias, {data.name}. {result.local ? 'Esta reserva de prueba se guardó solo en el entorno local.' : 'Guardamos tu reserva.'}</p>
    <div className="confirmation-details"><div><CalendarBlank size={23} /><span>{dateLabel(result.date)}<strong>{timeLabel(result.time)} · Lima</strong></span></div><div><MapPin size={23} /><span>{data.fulfillment === 'pickup' ? 'Te esperamos en' : 'Delivery en Jesús María'}<strong>{data.fulfillment === 'pickup' ? SETTINGS.address : data.address}</strong></span></div><div><ShoppingBag size={23} /><span>{result.kekeQty} kekitos · {result.shakeQty} batidos<strong>Total: {money(result.total)}</strong></span></div></div>
    <Notice>{result.paymentStatus === 'pending_review' ? <><strong>Comprobante recibido, pendiente de revisión.</strong> El administrador verificará tu pago. La captura todavía no significa que el pago esté aprobado.</> : <><strong>Reserva confirmada, pago pendiente.</strong> Tus productos estarán separados para el horario que elegiste.</>}</Notice>
    <div className="confirmation-actions"><button className="button primary" onClick={calendarFile}>Agregar al calendario<CalendarBlank size={19} /></button><button className="button secondary" onClick={onReset}>Hacer otra reserva<Plus size={18} /></button></div>
    <p className="cancel-note">Prepararemos tus kekitos para ti. Si ya no podrás recibirlos, <a href={cancellation} target="_blank" rel="noreferrer">avísanos al 992 272 521 para cancelar tu reserva</a>.</p>
    <Notifications />
  </section>;
}

function App() {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(0);
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState(null);
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);
  const headingRef = useRef(null);
  const keyRef = useRef(null);
  const profileRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(setConfig).catch(e => { if (e.name !== 'AbortError') setConfigError(true); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setAvailabilityError('');
    fetch(`/api/availability?month=${month}`, { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(response => { setAvailability(response.days); setLoading(false); }).catch(e => { if (e.name !== 'AbortError') { setAvailabilityError('No pudimos consultar los cupos.'); setLoading(false); } });
    return () => controller.abort();
  }, [month, revision]);
  useEffect(() => {
    if (!receipt) { setReceiptPreview(''); return; }
    const url = URL.createObjectURL(receipt); setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);
  useEffect(() => {
    if (result) document.getElementById('booking')?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  }, [result, reduced]);
  const total = calculateTotal(data);
  const update = (key, value) => { setData(d => ({ ...d, [key]: value })); setError(''); };
  const applyProfile = profile => {
    const previousProfile = profileRef.current; profileRef.current = profile;
    setData(previous => {
      const fields = Object.fromEntries(['name', 'phone', 'address'].map(key => [key, !profile ? '' : !previous[key] || previous[key] === previousProfile?.[key] ? profile[key] || '' : previous[key]]));
      return { ...previous, ...fields };
    });
  };
  const go = (next) => { setStep(next); setError(''); requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true })); };
  const next = (event) => {
    // The same button becomes a submit button on the last step. Stop this
    // click's native default action before React updates its type.
    event?.preventDefault();
    if (step === 0 && data.kekeQty + data.shakeQty === 0) { setError('Agrega al menos un producto para continuar.'); return; }
    if (step === 1 && (!data.date || !data.time || loading || availabilityError || !availability[data.date]?.times.includes(data.time) || availability[data.date].remaining < data.kekeQty || !availableTimes(data.date).includes(data.time))) { setError('Elige una fecha y un horario con cupos disponibles.'); return; }
    go(step + 1);
  };
  const upload = (event) => {
    const file = event.target.files?.[0]; setReceiptError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setReceiptError('Elige una imagen JPG, PNG o WebP.'); setReceipt(null); event.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { setReceiptError('La imagen debe pesar como máximo 5 MB.'); setReceipt(null); event.target.value = ''; return; }
    setReceipt(file);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(SETTINGS.yape); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError('No se pudo copiar. Mantén pulsado el número 955882306 para copiarlo.'); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      validateBooking(data);
      if (data.payment === 'yape' && !receipt) throw new Error('Adjunta tu comprobante de Yape o elige reservar sin pagar.');
      if (!config) throw new Error('No hay conexión con el servicio. Vuelve a consultar e inténtalo de nuevo.');
      const payload = JSON.stringify(data);
      const signature = `${payload}|${data.payment === 'yape' ? `${receipt.name}:${receipt.size}:${receipt.lastModified}` : ''}`;
      if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() };
      const form = new FormData(); form.append('booking', payload);
      if (data.payment === 'yape') form.append('receipt', receipt);
      setBusy(true);
      const response = await fetch('/api/reservations', { method: 'POST', headers: { 'Idempotency-Key': keyRef.current.key }, body: form });
      const body = await response.json();
      if (!response.ok) { if (body.field === 'stock') setRevision(r => r + 1); throw new Error(body.error || 'No se pudo guardar tu reserva.'); }
      setResult(body); setRevision(r => r + 1);
    } catch (e) { setError(e.message || 'No hay conexión. Inténtalo nuevamente con el mismo pedido para evitar duplicados.'); }
    finally { setBusy(false); }
  };

  return <MotionConfig reducedMotion="user"><Intro />
    <a className="skip-link" href="#booking">Ir a la reserva</a>
    <header className="site-header"><a href="#" className="brand" aria-label="Fabrizzito's Kekitos, inicio"><img src="/images/favicon.png" alt="" width="48" height="48" /><span>FABRIZZITO'S<strong>KEKITOS</strong></span></a><nav aria-label="Navegación principal"><a href="#cuenta" className="nav-link">Mi cuenta</a><a href="#ruleta" className="nav-link">Ruleta</a><a className="button small-button" href="#booking">Reservar <ArrowUpRightIcon /></a></nav></header>
    <main>
      {!result && <><section className="hero"><div className="hero-copy"><div className="hero-location"><MapPin size={17} />Hechos en Jesús María</div><h1>Tu antojo,<br /><span>a tu hora.</span></h1><p>Kekitos de banana y avena, batidos proteicos y un espacio reservado para ti.</p><a href="#booking" className="button primary hero-button">Reservar <ArrowRight size={21} /></a></div><div className="hero-visual"><img className="hero-image" src="/images/intro.webp" alt="Kekitos de avena y banana y batido de proteína de vainilla de Fabrizzito's Kekitos" width="660" height="660" fetchPriority="high" /><div className="fresh-tag"><Clock size={19} /><span>Recién hechos.<strong>A la hora que elijas.</strong></span></div></div></section>
      <div className="service-strip"><span><CalendarBlank size={21} />Lunes a viernes</span><span><Clock size={21} />6:00 a 10:00 p. m.</span><span><MapPin size={21} />Av. Talara 450, Jesús María</span></div>
      <section className="booking-section" id="booking"><div className="booking-topline"><div><h2>Separa tu próxima merienda.</h2><p>Elige tu pedido. Nosotros lo preparamos para ti.</p></div><span className="advance-note"><Clock size={17} />También para hoy</span></div>
      {config?.local && <div className="local-banner">Vista de prueba local. Las reservas y fotos de esta vista no se envían al negocio.</div>}
      {configError && !config && <Notice error>No hay conexión con el servicio de reservas. <button className="text-button" onClick={() => setRevision(r => r + 1)}>Volver a conectar</button></Notice>}
      <div className="booking-shell"><div className="booking-main"><ol className="steps" aria-label="Pasos de reserva">{['Tu pedido', 'Fecha y hora', 'Datos y pago'].map((label, i) => <li key={label} className={step === i ? 'active' : step > i ? 'complete' : ''} aria-current={step === i ? 'step' : undefined}><button type="button" disabled={i > step || busy} onClick={() => go(i)}><span>{step > i ? <Check size={15} weight="bold" /> : i + 1}</span>{label}</button></li>)}</ol>
      <form onSubmit={submit}>
      <AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={reduced ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
      <h3 className="step-title" ref={headingRef} tabIndex={-1}>{['¿Qué se te antoja?', '¿Cuándo lo quieres?', 'Casi listo. Dale tu nombre.'][step]}</h3>
      {step === 0 && <>
        <div className={`product-row ${data.kekeQty ? 'has-quantity' : ''}`}><div className="product-photo keke-photo"><img src="/images/intro.webp" alt="Kekitos de avena y banana" /></div><div className="product-copy"><h4>Kekito proteico</h4><p>Banana y avena</p><strong>S/ 4.00 <span>/ unidad</span></strong></div><Quantity title="kekito" value={data.kekeQty} max={15} onChange={value => update('kekeQty', value)} /></div>
        <div className={`product-row ${data.shakeQty ? 'has-quantity' : ''}`}><div className="product-photo shake-photo"><img src="/images/intro.webp" alt="Batido proteico de vainilla" /></div><div className="product-copy"><h4>Batido proteico</h4><p>Proteína de vainilla</p><strong>S/ 12.00 <span>/ unidad</span></strong><span className="product-tag">Solo recojo</span></div><Quantity title="batido" value={data.shakeQty} max={99} onChange={value => { setData(d => ({ ...d, shakeQty: value, fulfillment: value ? 'pickup' : d.fulfillment })); setError(''); }} /></div>
        <fieldset className="fulfillment"><legend>¿Cómo recibes tu pedido?</legend><div className="fulfillment-options"><label className={data.fulfillment === 'pickup' ? 'chosen' : ''}><input type="radio" name="fulfillment" value="pickup" checked={data.fulfillment === 'pickup'} onChange={() => update('fulfillment', 'pickup')} /><ShoppingBag size={23} /><span><strong>Recojo en el local</strong><small>Av. Talara 450 · Gratis</small></span><span className="radio-dot" /></label><label className={`${data.fulfillment === 'delivery' ? 'chosen' : ''} ${data.shakeQty ? 'option-disabled' : ''}`}><input type="radio" name="fulfillment" value="delivery" checked={data.fulfillment === 'delivery'} disabled={data.shakeQty > 0} onChange={() => update('fulfillment', 'delivery')} /><Truck size={24} /><span><strong>Delivery de kekitos</strong><small>Solo Jesús María · + S/ 6.00</small></span><span className="radio-dot" /></label></div><p className="field-help">{data.shakeQty ? 'Tu pedido incluye batidos, por eso corresponde recojo. Para delivery, deja los batidos en cero.' : 'El delivery está disponible únicamente para kekitos dentro de Jesús María.'}</p></fieldset>
      </>}
      {step === 1 && <Calendar data={data} setData={setData} month={month} setMonth={value => { setMonth(value); setData(d => ({ ...d, date: '', time: '' })); }} availability={availability} loading={loading} error={availabilityError} refresh={() => setRevision(r => r + 1)} />}
      {step === 2 && <>
        <div className="fields-row"><label>Tu nombre<input name="name" autoComplete="name" placeholder="Nombre y apellido" value={data.name} minLength={2} maxLength={100} required onChange={e => update('name', e.target.value)} /></label><label>Tu celular<div className="phone-input"><span>+51</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="9XX XXX XXX" value={data.phone} maxLength={16} required onChange={e => update('phone', e.target.value)} /></div></label></div>
        {data.fulfillment === 'delivery' && <div className="delivery-address"><label>Dirección de entrega<input name="address" autoComplete="street-address" placeholder="Av., calle, número, departamento y referencia" value={data.address} minLength={8} maxLength={240} required onChange={e => update('address', e.target.value)} /></label><p className="field-help"><MapPin size={15} />Distrito: Jesús María · Delivery S/ 6.00</p></div>}
        <fieldset className="payment"><legend>¿Cómo prefieres pagar?</legend><label className={`payment-option ${data.payment === 'later' ? 'chosen' : ''}`}><input type="radio" name="payment" value="later" checked={data.payment === 'later'} onChange={() => { update('payment', 'later'); setReceipt(null); }} /><span className="radio-dot" /><span><strong>Reservar sin pagar ahora</strong><small>Tu pedido queda separado; el pago sigue pendiente.</small></span></label><label className={`payment-option ${data.payment === 'yape' ? 'chosen' : ''} ${config && !config.receiptsAvailable ? 'option-disabled' : ''}`}><input type="radio" name="payment" value="yape" checked={data.payment === 'yape'} disabled={config && !config.receiptsAvailable} onChange={() => update('payment', 'yape')} /><span className="radio-dot" /><span><strong>Ya pagué con Yape</strong><small>Adjunta el comprobante para su revisión.</small></span><span className="yape-word">Yape</span></label>{config && !config.receiptsAvailable && <p className="field-help">Los comprobantes aún no están habilitados. Puedes reservar sin pagar.</p>}</fieldset>
        {data.payment === 'yape' && <div className="yape-details"><div className="yape-number"><div><span>Yapea {money(total)} a Luis Pelaez</span><strong>955 882 306</strong></div><button type="button" className="button secondary" onClick={copy}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Copiado' : 'Copiar número'}</button></div><p className="small muted">Verifica que el destinatario sea Luis Pelaez antes de pagar.</p><label className="upload-label"><UploadSimple size={26} /><strong>{receipt ? 'Cambiar comprobante' : 'Subir comprobante de Yape'}</strong><span>JPG, PNG o WebP · Máximo 5 MB</span><input type="file" name="receipt" accept="image/jpeg,image/png,image/webp" onChange={upload} /></label>{receiptPreview && <div className="receipt-preview"><img src={receiptPreview} alt="Tu comprobante de Yape, pendiente de enviar" /><span>{receipt.name}</span><button type="button" className="icon-button" aria-label="Eliminar comprobante" onClick={() => setReceipt(null)}><X size={18} /></button></div>}{receiptError && <p className="field-error" role="alert">{receiptError}</p>}<p className="field-help">La revisión será manual. Subir la captura no valida el pago automáticamente.</p></div>}
        <label className="acceptance"><input type="checkbox" checked={data.accepted} required onChange={e => update('accepted', e.target.checked)} /><span>Entiendo que prepararán mi pedido para el horario elegido. Si ya no lo quiero, escribiré al <a href={`https://wa.me/51${SETTINGS.cancellationPhone}`} target="_blank" rel="noreferrer">992 272 521</a> para cancelar la reserva.</span></label>
        <p className="privacy-note"><ShieldCheck size={16} />Usaremos tu nombre, celular y comprobante solo para gestionar tu pedido y revisar el pago.</p>
      </>}
      </motion.div></AnimatePresence>
      {error && <Notice error>{error}</Notice>}
      <div className="form-footer">{step > 0 ? <button type="button" className="text-button" disabled={busy} onClick={() => go(step - 1)}><ArrowLeft size={17} />Volver</button> : <span className="small muted">Hechos para tu próxima pausa.</span>}{step < 2 ? <button type="button" className="button primary" onClick={next}>Continuar<ArrowRight size={19} /></button> : <button type="submit" className="button primary" disabled={busy || !config}>{busy ? 'Guardando reserva…' : 'Confirmar reserva'}{!busy && <Check size={19} />}</button>}</div>
      </form></div>
      <aside className="order-summary" aria-label="Resumen del pedido"><div className="summary-heading"><ShoppingBag size={21} /><h3>Tu reserva</h3></div><div className="summary-lines" aria-live="polite">{data.kekeQty > 0 && <div><span>{data.kekeQty} × Kekito proteico</span><strong>{money(data.kekeQty * 400)}</strong></div>}{data.shakeQty > 0 && <div><span>{data.shakeQty} × Batido proteico</span><strong>{money(data.shakeQty * 1200)}</strong></div>}{data.kekeQty + data.shakeQty === 0 && <p>Agrega un producto para comenzar.</p>}<div><span>{data.fulfillment === 'pickup' ? 'Recojo en local' : 'Delivery · Jesús María'}</span><strong>{data.fulfillment === 'pickup' ? 'Gratis' : 'S/ 6.00'}</strong></div></div><div className="summary-total"><span>Total</span><strong>{money(total)}</strong></div><div className="summary-schedule"><CalendarBlank size={20} /><div><span>{data.date ? dateLabel(data.date) : 'Tu fecha está por elegir'}</span>{data.time && <strong>{timeLabel(data.time)}</strong>}</div></div><div className="summary-address"><MapPin size={20} /><span>{data.fulfillment === 'pickup' ? SETTINGS.address : 'Delivery de kekitos solo en Jesús María'}</span></div><p className="summary-footnote">Tu reserva se confirma al terminar el formulario.</p></aside></div></section></>}
      {result && <Confirmation result={result} data={data} onReset={() => { setResult(null); setData(initial); setReceipt(null); setStep(0); keyRef.current = null; setRevision(r => r + 1); }} />}
      <section className="details" id="details"><div><h2>Una pausa rica,<br />sin complicarte.</h2><p>Elige un horario disponible y cómo recibir tu pedido.</p></div><div className="detail-items"><div><CalendarBlank size={25} /><h3>Reserva incluso para hoy</h3><p>Lunes a viernes, de 6 a 10 p. m. Puedes elegir hoy si quedan cupos, cada media hora.</p></div><div><MapPin size={25} /><h3>Pasa por tus favoritos</h3><p>Te esperamos en Av. Talara 450, Jesús María. Delivery de kekitos en el distrito por S/6.</p></div><div><WhatsappLogo size={25} /><h3>Si cambias de planes, avisa</h3><p>Escríbenos al <a href={`https://wa.me/51${SETTINGS.cancellationPhone}`} target="_blank" rel="noreferrer">992 272 521</a> para cancelar. Te estaremos esperando con tu pedido preparado.</p></div></div></section>
      <Account revision={revision} onProfile={applyProfile} />
      <section className="promotions-section" id="promociones"><div><span className="eyebrow">DEL HORNO A TU PANTALLA</span><h2>Una buena pausa empieza con un aviso.</h2></div><Promotions /></section>
      <section className="location-section" id="ubicacion" aria-labelledby="location-title"><div className="location-copy"><span className="location-icon"><MapPin size={26} /></span><h2 id="location-title">Tu pedido te espera aquí.</h2><p className="location-address">{SETTINGS.address}</p><p>Lunes a viernes<br /><strong>6:00 a 10:00 p. m.</strong></p><a className="button secondary" href="https://www.google.com/maps/search/?api=1&query=Av.+Talara+450,+Jes%C3%BAs+Mar%C3%ADa,+Lima" target="_blank" rel="noreferrer">Abrir Google Maps<ArrowUpRightIcon /></a><p className="location-delivery">Delivery de kekitos únicamente dentro de Jesús María.</p></div><iframe className="pickup-map" src={pickupMap} title="Mapa del punto de recojo en Av. Talara 450, Jesús María" width="600" height="450" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></section>
    </main><footer><span>FABRIZZITO'S KEKITOS</span><p>Banana, avena y una buena pausa.</p><a href={`https://wa.me/51${SETTINGS.cancellationPhone}`} target="_blank" rel="noreferrer"><WhatsappLogo size={18} />Escríbenos</a></footer>
  </MotionConfig>;
}

function ArrowUpRightIcon() { return <ArrowRight size={17} style={{ transform: 'rotate(-45deg)' }} />; }

createRoot(document.getElementById('root')).render(<App />);
