# FABRIZZITO'S KEKITOS → FLEXQR: promociones Web Push

Implementado el 24/10/2026 en el repositorio `Pelaez12/FABRIZZITOS-KEKITOS`.

- Worker: `fabrizzitos-kekitos`.
- URL: https://fabrizzitos-kekitos.fabrizziopelaez91.workers.dev
- Empresa: `e6d10ec9-9d77-403e-ac6f-9273721fb713`.
- Central: `flexqr-platform`, https://panel.comunidadfortaleza.com.
- Estado de publicación: código y migración publicados; envío bloqueado hasta instalar el secreto compartido `BILLING_GATE_TOKEN` en el Worker del negocio. Ese secreto ya existe en el central, pero su valor no es recuperable desde la API de Cloudflare. No se creó ni rotó.

## Bindings y secretos

En **fabrizzitos-kekitos**:

| Nombre | Tipo | Destino / estado |
|---|---|---|
| `DB` | D1 | `fabrizzitos-reservas`, conservada |
| `RECEIPTS` | R2 | `fabrizzitos-comprobantes`, conservado y privado |
| `FLEXQR_PANEL` | Service Binding | `flexqr-platform`, existente y conservado; reservas y consulta de vigencia |
| `FLEXQR_COMPANY_ID` | Variable | UUID de empresa indicado arriba, conservado |
| `FLEXQR_INBOX_TOKEN` | Secret | Existente, conservado; exclusivamente pedidos y reservas |
| `BILLING_GATE_TOKEN` | Secret | **Pendiente**: mismo valor existente en el Worker central; transferir únicamente mediante el gestor de secretos o un canal administrativo seguro |
| `VAPID_PUBLIC_KEY` | Secret | Creado; solo esta clave es pública mediante `/config` |
| `VAPID_PRIVATE_KEY` | Secret | Creado; nunca se devuelve al cliente ni al panel |
| `VAPID_SUBJECT` | Secret | Creado; URL HTTPS del negocio |

En **flexqr-platform**, pendiente de su chat:

```json
{"binding":"PROMOTIONS_FABRIZZITOS_KEKITOS","service":"fabrizzitos-kekitos"}
```

Asociar ese binding a la empresa indicada, junto con `worker_name=fabrizzitos-kekitos` y `database_id=e934c0ae-6d6c-4b8f-88bb-6ee30134f9ff`, usando el flujo/configuración del central. No hace falta copiar claves VAPID al central.

Los despliegues conservan todos los secretos mediante `keep_bindings`.

## Autorización y vigencia

Las rutas administrativas requieren simultáneamente:

```http
Authorization: Bearer <BILLING_GATE_TOKEN existente>
X-Flexqr-Company: e6d10ec9-9d77-403e-ac6f-9273721fb713
Content-Type: application/json
```

`X-Flexqr-Superadmin` no concede acceso ni evita las comprobaciones.

El negocio consulta por `FLEXQR_PANEL`:

```http
GET https://panel.comunidadfortaleza.com/api/platform/internal/billing?company=e6d10ec9-9d77-403e-ac6f-9273721fb713
Authorization: Bearer <mismo secreto compartido>
X-Flexqr-Company: e6d10ec9-9d77-403e-ac6f-9273721fb713
```

Respuesta consumida: `{"allowed":true,"phase":"current","expiresAt":1795323600000}`. Otros campos se ignoran. `expiresAt` es milisegundos Unix. Se exige `allowed === true` y hora actual estrictamente menor a `expiresAt`; no se acepta el período de gracia posterior para promociones. La vigencia hasta el **21/11/2026 inclusive** termina el 22/11/2026 a las 00:00 de Lima (`2026-11-22T05:00:00.000Z`). Se comprueba en cada suscripción, estado, vista previa, confirmación y continuación; un fallo del central bloquea la operación. La baja pública sigue disponible aunque venza la empresa.

## Contratos JSON

Todos los cuerpos son objetos JSON, máximo 8192 bytes. No hay CORS para invocar las rutas administrativas desde el navegador: las llama exclusivamente el servidor central mediante binding. Tiempos en milisegundos Unix; IDs de campañas/vistas previas UUID.

### GET `/api/push/config` — pública

Sin cuerpo. HTTP 200:

```json
{"enabled":false,"publicKey":"<clave VAPID pública o null>","consentVersion":"promotions-v1","reason":"connection_pending","maxSubscribers":500,"campaignLimit":10,"maxPerDay":1}
```

`reason`: `active`, `connection_pending` o `expired`. `enabled=true` solo con VAPID y verificación de vigencia correctas. El marcador de la muestra representa una clave pública; no es un secreto a introducir en el frontend.

### POST `/api/push/subscribe` — pública

Exige `Origin` exactamente igual a `https://reserva.comunidadfortaleza.com` o `https://fabrizzitos-kekitos.fabrizziopelaez91.workers.dev`. Sin comodines; se rechazan otros subdominios, HTTP, puertos alternativos y orígenes ausentes. En local, con `LOCAL_PREVIEW=true`, se admiten 127.0.0.1:5173 y :8787. Límite persistente de 10 solicitudes/minuto/IP de Cloudflare compartido con `/unsubscribe`. El frontend usa `/api/push/*` y registra `/sw.js` con alcance `/`; el Service Worker resuelve enlaces mediante `self.location.origin`. Ambos funcionan en el dominio desde el que se abra el aplicativo. Las suscripciones/permisos son propios de cada origen y no se transfieren automáticamente entre dominios. Las claves VAPID existentes se conservan.

```json
{"subscription":{"endpoint":"https://fcm.googleapis.com/fcm/send/IDENTIFICADOR","expirationTime":null,"keys":{"p256dh":"<base64url de 65 bytes, clave P-256 sin comprimir>","auth":"<base64url de 16 bytes>"}},"consent":true,"consentVersion":"promotions-v1","permission":"granted"}
```

HTTP 200: `{"subscribed":true,"consentVersion":"promotions-v1"}`.

También admite proveedores oficiales Mozilla, Apple y Windows. Rechaza destinos arbitrarios, HTTP, credenciales en URL, fragmentos y puertos alternativos. El servidor valida consentimiento declarado y forma de la suscripción; el permiso real lo gestiona el navegador. Se guardan fecha y versión del consentimiento. El mismo endpoint no puede cambiar de propietario sin su secreto `auth`.

### POST `/api/push/unsubscribe` — pública

```json
{"subscription":{"endpoint":"https://fcm.googleapis.com/fcm/send/IDENTIFICADOR","keys":{"p256dh":"<clave de esta suscripción>","auth":"<auth de esta suscripción>"}}}
```

HTTP 200: `{"subscribed":false}`. Idempotente. Mismo control de origen/límite/propiedad. No requiere vigencia. El aplicativo revoca además la suscripción local del navegador.

### POST `/api/push/status` — administrativa

Entrada inicial: `{}`. Página siguiente: `{"before":<nextBefore recibido>}`.

Ejemplo de respuesta HTTP 200, con empresa activa y sin campañas:

```json
{"subscribers":0,"eligible":0,"waiting":0,"billing":{"allowed":true,"phase":"current","expiresAt":1795323600000},"quotas":{"maxSubscribers":500,"campaignLimit":10,"maxPerDay":1,"day":"2026-10-24","month":"2026-10","campaignsUsed":0,"campaignsToday":0,"remainingMonthly":10,"remainingDaily":1},"maxSubscribers":500,"campaignLimit":10,"maxPerDay":1,"activeCampaign":null,"campaigns":[],"nextBefore":null}
```

`campaigns` incluye hasta 20 objetos del formato de trabajo descrito abajo, más recientes primero. `nextBefore=null` indica fin del historial. `activeCampaign` es un jobId pendiente o null, independiente de la página. `eligible` son dispositivos activos; `waiting=0`, sin lista de espera.

### POST `/api/push/campaigns` — vista previa administrativa

```json
{"title":"Hoy hay kekitos","body":"Conoce los próximos horneados.","url":"/#booking","confirm":false}
```

`confirm` puede omitirse para vista previa. `title`: 1–80 caracteres; `body`: 1–200; `url`: ruta del propio negocio, máximo 300, por defecto `/?promos=1`. No se admiten destinos externos ni caracteres de control.

HTTP 200:

```json
{"preview":true,"previewId":"<uuid>","expiresAt":1792872600000,"eligible":12,"skipped":0,"content":{"title":"Hoy hay kekitos","body":"Conoce los próximos horneados.","url":"/#booking"},"quotas":{"maxSubscribers":500,"campaignLimit":10,"maxPerDay":1,"day":"2026-10-24","month":"2026-10","campaignsUsed":0,"campaignsToday":0,"remainingMonthly":10,"remainingDaily":1},"canSend":true}
```

La vista previa dura diez minutos y captura la audiencia y su consentimiento; no envía, no crea campaña ni consume cuota. `canSend=false` si no hay audiencia o cuota.

### POST `/api/push/campaigns` — confirmación administrativa

Después de que una persona revise y confirme el texto y la audiencia:

```json
{"title":"Hoy hay kekitos","body":"Conoce los próximos horneados.","url":"/#booking","confirm":true,"previewId":"<uuid de la vista previa>"}
```

Debe coincidir exactamente con el contenido normalizado de la vista previa. HTTP **202** devuelve el objeto de trabajo. Crea de forma atómica campaña y destinatarios persistentes; consume cuota. **Todavía no envía**. Repetir la misma confirmación devuelve el mismo `jobId` sin consumir cuota otra vez. Para reintentar tras pérdida de respuesta, conservar `previewId` y contenido; no generar otra vista previa como reintento automático.

### POST `/api/push/campaigns/:id` — continuación administrativa

Entrada `{"action":"continue"}` o `{}`. Procesa como máximo diez destinatarios, con solicitudes en paralelo y timeout de ocho segundos por proveedor. HTTP 202 si queda trabajo; HTTP 200 cuando termina. Consultar sin enviar con `{"action":"status"}` (HTTP 200).

Formato exacto del objeto de trabajo, usado también por confirmación e historial:

```json
{"jobId":"<uuid>","status":"queued","done":false,"total":12,"processed":0,"remaining":12,"pending":12,"sending":0,"accepted":0,"expired":0,"failed":0,"skipped":0,"uncertain":0,"content":{"title":"Hoy hay kekitos","body":"Conoce los próximos horneados.","url":"/#booking"},"createdAt":1792872000000,"completedAt":null}
```

`status`: `queued`, `processing`, `completed`. `remaining=pending+sending`; `processed=total-remaining`. `accepted` significa aceptación por el proveedor, no lectura ni entrega comprobada al dispositivo. `expired` es 404/410 y desactiva la suscripción. `failed` es rechazo HTTP definitivo para esta campaña. `skipped` incluye baja/cambio de consentimiento o vencimiento antes de enviar. `uncertain` es timeout/interrupción: pudo entregarse y **no se reintenta**, para evitar duplicados.

El central debe persistir el `jobId` y continuar hasta `done=true`, con pausas y reintentos de la misma ruta ante pérdida de respuesta. Si otra continuación mantiene el lease de 90 segundos, la llamada devuelve las estadísticas actuales. La clave primaria de destinatarios, reclamación atómica, lease y comprobación de consentimiento impiden repetir intentos. Tras interrupción, los destinatarios reclamados quedan `uncertain` al recuperar el lease. El Service Worker añade deduplicación por campaña en IndexedDB. No se promete entrega exactamente una vez frente a fallos externos; se prioriza no reenviar resultados ambiguos.

### Errores

Formato común: `{"error":"<explicación en español>"}`.

| HTTP | Significado |
|---|---|
| 400 | Contenido/consentimiento/acción/cursor/suscripción inválidos |
| 401 | Bearer incorrecto o ausente, una vez configurado el secreto |
| 402 | Empresa sin vigencia activa o vencida |
| 403 | Otra empresa, origen ajeno o suscripción de otro dispositivo |
| 404 | Campaña o ruta inexistente |
| 405 | Método incorrecto |
| 409 | Vista previa ausente, distinta, vencida o sin audiencia |
| 413 / 415 | Cuerpo demasiado grande / tipo distinto de JSON |
| 429 | Límite de solicitudes, 500 dispositivos, campaña diaria o mensual |
| 503 | Secreto/binding/VAPID pendiente o central no verificable |

## Plan Básico y almacenamiento

500 dispositivos activos, 10 campañas por mes calendario y 1 por día calendario, siempre `America/Lima`. Las cuotas se aplican en sentencias SQL atómicas y restricciones únicas; no dependen de la interfaz. Una campaña confirmada consume cuota aunque falle el proveedor. Renovar una suscripción activa no consume otro dispositivo.

Migración **aditiva aplicada** en D1: `migrations/0003_customer_promotions.sql`, siete sentencias. Crea `promotion_subscriptions`, `promotion_rate_limits`, `promotion_previews`, `promotion_campaigns`, `promotion_deliveries` e índices. No modifica ni vacía tablas de reservas, eventos, outbox ni archivos de comprobantes. El cron existente de pedidos permanece igual y no envía promociones.

Los datos de dispositivos son privados en D1; no se listan endpoints, claves de suscripción ni secretos en las respuestas administrativas. Las suscripciones de clientes están separadas de eventos/notificaciones administrativas.

## Cliente y pruebas

Botón «Activar promociones» en la página y en el aviso emergente posterior a reservar. Solo pide permiso al pulsarlo. Permite desactivar, explica avisos opcionales, navegador incompatible, permiso denegado e instalación en pantalla de inicio de iPhone/iPad (Safari, iOS/iPadOS 16.4+). Reservar no requiere aceptar promociones. Manifest, iconos y `/sw.js` publicados; no había otro Service Worker en el proyecto. Se conserva el flujo de reservas y el código de integración existente.

36 pruebas automatizadas aprobadas: reglas de reservas, D1/R2 privados, inbox de pedidos, consentimiento/permiso/origen, IP rate limit, autenticación y aislamiento, vigencia con límite inclusivo del día, cierre ante fallo central, cuota concurrente de 500, cuotas mensual/diaria, vista previa y confirmación, idempotencia, continuaciones simultáneas, baja previa a entrega, 410, timeout e interrupción. Cliente probado con APIs simuladas; cifrado Web Push/VAPID probado sin red. Compilación de producción correcta. No se activaron suscripciones en el navegador del usuario ni se crearon/enviaron campañas reales.

## Pasos pendientes en FLEXQR

1. Instalar en el Worker del negocio el **mismo** `BILLING_GATE_TOKEN` ya existente en el central mediante un mecanismo seguro. Si su valor original no está disponible, coordinar con quien administra el secreto; no inventar otro valor ni rotarlo unilateralmente.
2. Añadir Service Binding central `PROMOTIONS_FABRIZZITOS_KEKITOS → fabrizzitos-kekitos` y asociarlo a esta empresa. No se modificó el Worker central desde este chat.
3. Conectar el panel al flujo JSON documentado: vista previa, confirmación explícita, guardar jobId, continuar lotes y mostrar historial/estadísticas. El proxy central existente debe reenviar bearer y empresa; no mandar esas credenciales al navegador.
4. Verificar `/api/push/config` con `enabled=true` y `/status` mediante binding, con empresa activa y vencimiento `1795323600000`. Hacer primero la comprobación sin enviar campañas. Una prueba real de entrega requiere consentimiento del dispositivo y autorización expresa para esa campaña.
