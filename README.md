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
- Esquema: `migrations/0001_initial.sql`, ya aplicado a la base remota inicial.

El bucket R2 tiene `r2.dev` desactivado y no tiene dominios públicos. El Worker no expone rutas para descargar comprobantes. Solo guarda en D1 la clave del objeto, tipo y SHA-256. No se registran nombres, celulares, direcciones ni imágenes en los logs de la aplicación.

`npm run build` crea `dist/worker/index.mjs`, un módulo autocontenido con los recursos estáticos optimizados. Se puede desplegar con el MCP de Cloudflare utilizando la metadata y los bindings de `cloudflare-resources.json`, o con `npm run deploy` si ya se dispone de un token de Cloudflare en la variable de entorno `CLOUDFLARE_API_TOKEN`. No guardar tokens en archivos ni en el repositorio.

## Integraciones aplazadas por solicitud del propietario

- **Panel de administración:** `admin_events` funciona como outbox. Cada reserva genera `reservation.created` y, si incluye foto, `payment.review_requested`. Los eventos permanecen `pending`. Todavía no se envían notificaciones al panel ni se implementaron endpoints administrativos públicos.
- **Revisión de pagos:** los estados `approved` y `rejected` están previstos en el esquema, pero solo deberán modificarse desde una futura API administrativa autenticada. Una reserva sin pagar no equivale a un pago rechazado.
- **Notificaciones de horneado:** el aviso emergente aparece después de confirmar la reserva, permite cerrarlo o reabrirlo y solicita permiso solo tras pulsar el botón. Todavía no hay suscripción push, VAPID ni envío remoto.
- **Cancelaciones:** por ahora se solicita contactar por WhatsApp, con mensaje que incluye el código de reserva. Pulsar el enlace no cancela automáticamente la reserva.

## Referencias y archivos

Las tres imágenes originales aportadas están en `assets/originals/` y las versiones web en `public/images/`. La identidad visual final es FABRIZZITO'S KEKITOS; las imágenes originales contienen variaciones del nombre que se conservaron según lo solicitado.

El análisis de REA se resume en `research/calendly-analysis.md`. El código de Calendly descargado para inspección y las evidencias completas quedan en `artifacts/`, excluido de Git. No se incorporó código de Calendly al aplicativo.
