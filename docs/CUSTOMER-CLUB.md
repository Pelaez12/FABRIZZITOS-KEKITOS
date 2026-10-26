# Club de clientes, perfil, XP y ruleta

## Publicación y pendientes

Worker `fabrizzitos-kekitos`, dominio principal `https://reserva.comunidadfortaleza.com`, con workers.dev conservado. Reservas para el mismo día habilitadas, siempre lunes a viernes de 18:00 a 22:00, cada media hora, únicamente horarios futuros y cupo de 15 kekitos por día. Precios y delivery no cambian.

Google Login quedó conectado el 26/10/2026 con el último archivo OAuth facilitado por el propietario: cliente «FABRIZZITOS KEKITOS · Reservas» del proyecto **flexcoreos**. **GOOGLE_CLIENT_ID** y **GOOGLE_CLIENT_SECRET** están guardados como secretos del Worker. Se verificó enabled=true, cliente correcto, scopes openid/email/profile, PKCE S256 y callbacks de ambos dominios. El proyecto de Google está en producción para usuarios externos y se comprobó un ingreso real con la cuenta propietaria y retorno a una sesión autenticada del aplicativo. No se generaron pedidos ni premios. Reservar como invitado sigue disponible. La marca de consentimiento de Google es la compartida del proyecto FlexCoreOS (FLEXQR); no se modificó para no afectar a sus otros clientes.

El cliente OAuth es de tipo aplicación web. Para futuras modificaciones, conservar estos callbacks exactos. Redirect URI exacto principal:

```text
https://reserva.comunidadfortaleza.com/api/auth/google/callback
```

Si se usará login también desde workers.dev, registrar además:

```text
https://fabrizzitos-kekitos.fabrizziopelaez91.workers.dev/api/auth/google/callback
```

Scopes mínimos `openid email profile`. Configurar el estado de publicación/usuarios de prueba de Google según corresponda. No enviar secretos por el chat, no usar variables `VITE_*`. No hacen falta otros secretos de sesión: se usan tokens aleatorios de 256 bits cuyos hashes se guardan en D1, cookies `__Host-*`, HttpOnly, Secure, SameSite=Lax, caducidad de sesión de 30 días. OAuth usa state ligado al navegador, nonce, PKCE S256, un solo uso del flujo y validación RS256, issuer, audiencia, expiración y email verificado mediante `jose`. No se guardan access/refresh tokens de Google. El proveedor es la clave `sub` de Google, nunca un correo/telefono afirmado por el cliente.

Las sesiones y permisos son por dominio. Se mantienen todos los secretos anteriores, VAPID, pedidos, comprobantes, D1 y R2. No se modificó el Worker central de FLEXQR.

## Datos y perfil

La migración aditiva `migrations/0004_customer_accounts.sql` crea:

- `customer_accounts`: identidad Google, nombre, email, celular nacional normalizado y dirección opcional.
- `customer_sessions`: hashes de sesión y vencimiento.
- `customer_oauth_flows`: state/browser hashes, PKCE, nonce, origen y vencimiento a diez minutos.
- `customer_auth_limits`: límite de 20 inicios OAuth por IP y hora.
- `customer_orders`: asociación entre una nueva reserva y la cuenta autenticada.
- `customer_push_links`: propiedad de una suscripción existente y validada.
- `customer_mission_claims`: reclamos únicos y definición de la misión congelada.
- `customer_wheel_spins`: resultado, número de giro, código y estado de canje.
- `customer_review_events`: revisiones administrativas idempotentes.

Las tablas de reservas anteriores no se alteran. El perfil guarda nombre completo, celular peruano de nueve dígitos (se muestra +51), dirección y correo verificado de Google. La dirección sigue limitada por las reglas de delivery de Jesús María. Los datos se autocompletan sin sobreescribir cambios manuales hechos en el formulario. Cerrar sesión limpia el autocompletado. El historial muestra las últimas 30 reservas; contadores y XP consideran todos los pedidos asociados. No se vinculan automáticamente pedidos anteriores por coincidencia de teléfono, nombre o email.

## Reglas de XP

| Acción | XP |
|---|---:|
| Un kekito reservado | 1, pendiente hasta pago aprobado o entrega |
| Un batido reservado | 6, pendiente hasta pago aprobado o entrega |
| Un kekito con comprobante enviado antes del horario, posteriormente aprobado | 5 adicionales |
| Misión de activar promociones | 300, una sola vez por cuenta |

Una captura no equivale a pago aprobado. Las reservas sin pago siguen siendo válidas, pero su XP permanece pendiente hasta que se apruebe el pago o se registre la entrega. Las canceladas no suman XP ni créditos de ruleta; también se revierten los bonos de misiones de consumo que dejen de cumplir su objetivo. Las compras con pago aprobado sin comprobante suman XP base y crédito de ruleta, pero no el extra de adelanto.

Los totales se calculan desde los pedidos y reclamos del servidor, no desde localStorage o números enviados por el cliente. Reintentar una reserva o un reclamo no duplica puntos. Desactivar promociones posteriormente **no quita** el premio inicial de 300 XP. Un dispositivo/suscripción no puede dar ese premio a varias cuentas.

| Nivel | XP acumulado requerido |
|---|---:|
| Explorador de kekitos | 0 |
| Fanático | 500 |
| Apasionado de los kekes | 1.000 |
| Master de los kekes | 4.000 |
| Master Chef | 32.000 |

Los niveles son reconocimiento; no hay conversión de XP a dinero, premios extra o descuentos fuera de la ruleta.

## Misiones

Calendario `America/Lima`, semanas desde el lunes. La rotación se calcula en servidor con una semilla estable de cuenta y período: recargar no cambia la misión. Los objetivos de consumo se cumplen con pedidos creados dentro del período y con pago aprobado o entrega registrada; la interfaz separa el avance pendiente de validar.

- Una vez: activar y vincular promociones, 300 XP.
- Diaria de kekitos: objetivo estable de 2, 3 o 4; recompensa 75, 100 o 125 XP.
- Diaria de batidos: 1 o 2; 40 u 80 XP.
- Semanal: 6, 9 o 12 kekitos; 250, 350 o 450 XP.
- Mensual de kekitos: 25, recompensa 900 XP.
- Mensual de batidos: 5, recompensa 300 XP.

El cliente reclama una misión completa mientras sigue vigente. Cada misión y período se pueden reclamar una sola vez, incluso con peticiones simultáneas. No se acredita XP por solo abrir una página, cargar una foto o fabricar una petición en el navegador.

## Ruleta

Un giro por cada **10 kekitos con pago aprobado**; no cuentan reservas impagas, batidos ni compras canceladas. No cuesta dinero extra. Puede acumular varios giros. Cada giro se consume aunque no tenga premio.

| Resultado | Probabilidad exacta | Valor nominal |
|---|---:|---:|
| Suerte para la próxima | 35 % | S/0 |
| 25 % de descuento en un kekito | 45,5 % | S/1 |
| 50 % de descuento en un kekito | 16,25 % | S/2 |
| Un kekito gratis | 3,25 % | S/4 |

Valor nominal promedio de premios: `0,455×1 + 0,1625×2 + 0,0325×4 = S/0,91` por diez kekitos, 2,275 % sobre S/40 de venta. No es un cálculo de utilidad ni costo de producción.

Se usa Web Crypto con muestreo por rechazo para sortear sin sesgo entre 10.000 resultados. Resultado y código UUID quedan guardados antes de animar. La sentencia SQL asigna y consume un crédito de forma atómica; las restricciones únicas evitan duplicados por concurrencia. `requestId` conserva el mismo resultado al reintentar.

El premio se aplica a **un** kekito y no se cambia por dinero. Se guarda en «Mis premios» y se presenta en el local para canje autenticado. No se resta automáticamente del checkout ni del Yape actual; los precios y comprobantes existentes se conservan. El negocio valida un solo canje, sin vencimiento configurado. El descuento/canje no genera otro crédito de compra por sí mismo. Si se anulan las compras que habilitaron un giro, el premio no se puede canjear. La ilustración suministrada está en `assets/originals/roulette.png` y su versión web en `public/images/roulette.webp`.

## API de cliente

Todas las respuestas JSON usan `Cache-Control: no-store`. Cuerpos de POST JSON de hasta 8 KB. Las mutaciones requieren sesión y Origin exactamente igual al dominio de la petición, dentro de los dos dominios permitidos; no hay CORS para acceder a cuentas ajenas.

| Método | Ruta | Contrato |
|---|---|---|
| GET | `/api/auth/config` | `{enabled,provider:"google",callbackUrl}` |
| GET | `/api/auth/google/start` | Redirección Google con state/nonce/PKCE; 503 mientras falten credenciales |
| GET | `/api/auth/google/callback` | Intercambia code, valida ID token, crea sesión y redirige a `/#cuenta` |
| POST | `/api/auth/logout` | `{}` → `{loggedOut:true}` |
| GET | `/api/account/me` | `{profile,xp,pendingXp,level,reservedKekes,paidKekes,prepaidKekes,reservedShakes,missions,orders,spins,availableSpins,wheelProgress,levels,prizes}` |
| POST | `/api/account/profile` | `{name,phone,address}` → `{saved:true,profile:{name,phone,address,email}}` |
| POST | `/api/account/push-link` | `{subscription:<PushSubscription JSON>}` → `{linked:true}` |
| POST | `/api/account/missions/claim` | `{missionId}` → `{claimed:true,replay,points}` |
| POST | `/api/account/wheel/spin` | `{requestId:<UUID estable del intento>}` → 201 `{spin,replay:false}` o 200 para replay |

La reserva autenticada conserva `/api/reservations`, multipart, y la misma idempotencia. La cuenta se deriva de la cookie HttpOnly; se ignoran identificadores de usuario que pudiera mandar el formulario. Una reserva sin cuenta sigue usando el flujo anterior.

## Conexión pendiente con FLEXQR para pagos y canjes

Estas rutas están implementadas en el Worker del negocio y deben ser llamadas **desde el servidor central**. Usan el `BILLING_GATE_TOKEN` existente, cabecera `X-Flexqr-Company: e6d10ec9-9d77-403e-ac6f-9273721fb713` y verificación de vigencia por el binding `FLEXQR_PANEL`. El encabezado superadmin solo no autoriza. No se publican secretos en el cliente.

El central puede obtener el UUID de reserva desde el sourceId existente `fabrizzitos:<UUID>`.

**GET `/api/account/admin/reservations/:id`** devuelve:

```json
{"reservationId":"<UUID>","paymentStatus":"pending_review","reservationStatus":"reserved","totalCents":1200,"receiptAvailable":true}
```

**POST `/api/account/admin/reservations/:id`**, después de la revisión manual:

```json
{"eventId":"<UUID único de la revisión>","expectedPaymentStatus":"pending_review","expectedReservationStatus":"reserved","paymentStatus":"approved","reservationStatus":"reserved"}
```

Respuesta `{updated:true,eventId,replay:false}`. Repetir el mismo eventId y contenido es idempotente (`replay:true`). Reusar eventId con datos distintos o cambiar estados que ya no coinciden devuelve 409. Estados de pago admitidos: `unpaid`, `pending_review`, `approved`, `rejected`. Reserva: `reserved`, `cancelled`, `fulfilled`. La revisión se audita y actualiza de forma atómica; solo este evento administrativo o un cambio autorizado del negocio valida pagos/entregas. La interfaz de cliente puede actualizar la cuenta para ver el nuevo saldo.

**POST `/api/account/admin/rewards/:code/redeem`**, cuerpo `{}`, devuelve `{redeemed:true,discountCents:100|200|400}`. Un canje repetido devuelve 409. El central debe registrar la aplicación del beneficio al pedido/entrega y no descontarlo nuevamente. Los códigos de «Suerte para la próxima» no son premios y no se canjean.

Este chat no cambió el panel central ni su política de revisión. Por tanto, **falta que FLEXQR llame a estas rutas al aprobar/rechazar pagos, entregar/cancelar pedidos y canjear premios**. Hasta entonces, no hay confirmación automática del estado de pago desde el central. El contrato de inbox y el almacenamiento privado de comprobantes permanecen como estaban.

## Verificación

Pruebas de fechas y horarios del mismo día, cuentas aisladas, perfiles, enlace de reserva a sesión, reintentos, expiración de sesión, OAuth simulado firmado con RS256, rechazo por nonce/audiencia/vencimiento y state inválidos, PKCE, claims únicos, XP pendiente y aprobado, cancelaciones, misión de promociones, umbrales, probabilidades exhaustivas de los 10.000 resultados, concurrencia de giros, replay, canje único y revisión administrativa idempotente. Continúan las pruebas de stock, Yape/R2, inbox y Web Push. No se crean cuentas reales, giros reales ni campañas promocionales durante las pruebas.

Referencia de autenticación: https://developers.google.com/identity/openid-connect/openid-connect
