# FABRIZZITO'S KEKITOS

Aplicación de reservas de kekitos de banana y avena y batidos proteicos. React, Vite, Motion y Cloudflare Workers con D1 y R2 privado.

## Reglas del negocio

| Concepto | Valor |
| --- | --- |
| Kekito proteico | S/4 por unidad |
| Batido proteico de vainilla | S/12 por unidad, solo recojo |
| Delivery | S/6, únicamente kekitos dentro de Jesús María |
| Recojo | Av. Talara 450, Jesús María |
| Atención | Lunes a viernes, 18:00 a 22:00, cada 30 minutos |
| Anticipación | Al menos 48 horas exactas |
| Cupo | 15 kekitos por fecha, entre todos los horarios |
| Yape | 955882306, Luis Pelaez |
| Cancelaciones | WhatsApp 992272521 |

Los precios y cupos se validan en el servidor. Una captura de pago genera `pending_review`, nunca aprobación automática. Se puede reservar con `unpaid` sin adjuntar una foto. Las reservas consumen cupo aunque no estén pagadas; al marcar una reserva `cancelled`, su cupo vuelve a estar disponible.

El catálogo y las reglas están en `shared/booking.mjs`. El calendario muestra los siguientes 90 días como horizonte técnico configurable; se mantiene el mínimo de 48 horas. No se especificó un cupo diario de batidos. La validación técnica admite de 0 a 99 batidos por pedido, sin inventar un límite de producción diario.

## Ejecutar localmente

Usa Node.js 24 LTS y npm.

```sh
npm ci
npm run dev
```

Abre `http://127.0.0.1:5173`. Vite usa la API local en el puerto 8787. Los datos y las fotos de prueba persisten en `.local/` y nunca se suben a Git ni a producción.

Para probar la compilación completa:

```sh
npm run build
npm run preview
```

Abre `http://127.0.0.1:8787`. La vista local se identifica explícitamente como prueba. El runtime local estable soporta la fecha de compatibilidad 2026-08-06; la configuración de producción usa 2026-10-24. La aplicación no depende de APIs exclusivas del intervalo entre esas fechas.

## Verificar

```sh
npm test
npm run build
```

Las pruebas de integración ejecutan el Worker en Miniflare con D1 y R2 aislados. Cubren concurrencia del cupo, idempotencia, importes, 48 horas, fines de semana, restricciones de delivery y carga de comprobantes. El navegador se revisó también con una reserva completa local.

## Recursos de Cloudflare

Los identificadores de los recursos, que no son secretos, están en `cloudflare-resources.json`.

- D1: `fabrizzitos-reservas`, binding `DB`.
- R2: `fabrizzitos-comprobantes`, binding `RECEIPTS`.
- Worker: `fabrizzitos-kekitos`.
- Esquema: `migrations/0001_initial.sql`, `migrations/0002_flexqr_outbox.sql` y `migrations/0003_customer_promotions.sql`, aplicados a D1.

El bucket R2 tiene `r2.dev` desactivado y no tiene dominios públicos. El Worker no expone rutas para descargar comprobantes. Solo guarda en D1 la clave del objeto, tipo y SHA-256. No se registran nombres, celulares, direcciones ni imágenes en los logs de la aplicación.

`npm run build` crea `dist/worker/index.mjs`, un módulo autocontenido con los recursos estáticos optimizados. Se puede desplegar con el MCP de Cloudflare utilizando la metadata y los bindings de `cloudflare-resources.json`, o con `npm run deploy` si ya se dispone de un token de Cloudflare en la variable de entorno `CLOUDFLARE_API_TOKEN`. No guardar tokens en archivos ni en el repositorio.

## Integración con FLEXQR

Las reservas se guardan primero en D1 junto con una fila inmutable en `flexqr_outbox`. Después se envían desde el servidor al Service binding `FLEXQR_PANEL`, que apunta a `flexqr-platform`. La empresa es `e6d10ec9-9d77-403e-ac6f-9273721fb713`.

La clave solo existe como secreto `FLEXQR_INBOX_TOKEN` en Cloudflare. `keep_bindings` conserva los secretos existentes al desplegar; no exportes su valor al repositorio, al frontend ni a variables `VITE_*`. Para usar `npm run deploy`, la clave ya debe existir en el Worker.

El emisor conserva el mismo `sourceId` y JSON en cada reintento. Solo marca `sent` con HTTP 200/201, `received: true` e ID del panel. Un lease en D1 evita envíos simultáneos. Los fallos temporales usan backoff y `Retry-After`; un cron cada cinco minutos procesa hasta diez pendientes. Errores de datos 400/409/413/415 quedan `blocked` para corrección; 401/403/402 se reintentan con una demora mayor. Los cuerpos de error y datos de clientes nunca van a logs. La vista local nunca envía datos al panel real.

También se incorporan progresivamente las reservas anteriores que sigan activas y tengan una fecha futura; no se remite el historial completado o cancelado. `admin_events` conserva por separado los eventos internos de reserva y pago y no debe confundirse con el acuse de FLEXQR.

El contrato se documenta en [la guía oficial del panel](https://panel.comunidadfortaleza.com/panel/integraciones/pedidos-reservas). La entrega se registra en `flexqr_outbox.status`, `panel_id`, `delivered_at`, `last_http_status` y `last_error_code` sin publicar endpoints administrativos.

## Funciones que requieren ampliar la integración

- **Fotos de comprobantes:** el contrato FLEXQR v1 solo admite `sourceId`, `kind`, `customerName`, `customerPhone`, `summary`, `scheduledAt` y `amountCents`. El resumen indica si hay un comprobante pendiente de revisión, pero no envía la foto, una URL pública ni una credencial de acceso a R2. El panel necesita soporte autenticado adicional para consultar las imágenes.
- **Revisión de pagos:** los estados `approved` y `rejected` están previstos en el esquema, pero solo deberán modificarse desde una futura API administrativa autenticada. Una reserva sin pagar no equivale a un pago rechazado.
- **Promociones Web Push:** implementadas con consentimiento, baja, VAPID, Service Worker, cuotas y campañas persistentes. Falta transferir de forma segura el secreto compartido `BILLING_GATE_TOKEN` y asociar el binding en el central. Contratos exactos y coordinación: [FLEXQR-PUSH-HANDOFF.md](docs/FLEXQR-PUSH-HANDOFF.md).
- **Estados y cancelaciones:** la conexión v1 es unidireccional. Cambiar el estado o cancelar en FLEXQR no actualiza la reserva ni libera stock en el aplicativo de origen. Por ahora se solicita contactar por WhatsApp, con mensaje que incluye el código; la cancelación debe aplicarse también en origen. Se requiere un contrato de retorno autenticado para sincronizar estados.

## Referencias y archivos

Las tres imágenes originales aportadas están en `assets/originals/` y las versiones web en `public/images/`. La identidad visual final es FABRIZZITO'S KEKITOS; las imágenes originales contienen variaciones del nombre que se conservaron según lo solicitado.

El análisis de REA se resume en `research/calendly-analysis.md`. El código de Calendly descargado para inspección y las evidencias completas quedan en `artifacts/`, excluido de Git. No se incorporó código de Calendly al aplicativo.
