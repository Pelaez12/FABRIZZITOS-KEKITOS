# Análisis de referencia de Calendly con REA

Fecha: 24 de octubre de 2026. Herramienta: REA 6.7.0.

## Alcance observado

REA ejecutó dos escenarios controlados con un perfil temporal de Chromium: lectura de `https://calendly.com/` y `https://calendly.com/login`. Retuvo DOM y accesibilidad. No se inició sesión, no se creó una reunión y no se enviaron datos a formularios.

También se obtuvo el JavaScript público del widget de integración desde la URL publicada en la documentación oficial:

`https://assets.calendly.com/assets/external/widget.js`

- Tamaño adquirido: 11 933 bytes.
- SHA-256: `2ab1c4e5467cc511e3980f656b62656c786241ac71692106fe58037a74337e39`.
- Operación REA: `analyze_javascript_application`.
- Evidencia: `ev_1f7fea739240c27b093e9978521f5c84a1df8ea3891b7fcc12a72b4398a94924`.
- Resultado: un archivo JavaScript analizado, 3 167 nodos AST visitados, cero fallos de parseo.

## Lectura del artefacto

El widget expone puntos de entrada para integración inline y emergente (`initInlineWidget`, `initPopupWidget`, `showPopupWidget`, `closePopupWidget`). Contiene mecanismos de comunicación entre documentos y referencias a eventos como `calendly.page_height` y `calendly.prefill`. Son observaciones del código público adquirido, no pruebas de que todos esos caminos se hayan ejecutado en las visitas observadas.

Este archivo es el contenedor de integración, no el código completo del calendario de reservas. El análisis estático de REA está orientado también a relaciones de Electron; la ausencia de hallazgos de Electron en un widget web no significa ausencia de comportamiento web. REA advierte que expresiones dinámicas u ofuscadas pueden dejar relaciones sin resolver.

## Aplicación a Fabrizzito's Kekitos

La documentación pública de Calendly describe un enlace de reservas sin necesidad de una cuenta del invitado, selección de disponibilidad y posterior confirmación. Se adaptó ese patrón a un flujo propio: productos y entrega, fecha y hora, datos y pago, confirmación. Las reglas de alimentos, stock, Yape, direcciones y entrega son propias de este proyecto.

El código privado del servidor de Calendly no fue obtenido ni está disponible a partir de estos artefactos. No se copiaron bundles ni fuentes de Calendly al código publicado del aplicativo.

## Fuentes y reproducción

- [Repositorio oficial de REA](https://github.com/morluto/rea).
- [Preguntas frecuentes de reservas de Calendly](https://calendly.com/help/scheduling-faq).
- [Documentación oficial con el script de integración](https://help.calendly.com/hc/pt-br/articles/4412934840087-Como-rastrear-a-atividade-de-incorpora%C3%A7%C3%A3o-no-Google-Analytics).

Los escenarios declarativos están en `research/calendly-scenario.json` y `research/calendly-login-scenario.json`. `scripts/acquire-calendly-reference.mjs` obtiene únicamente el artefacto público, registra su identidad y no lo ejecuta. Las evidencias y el bundle descargado permanecen en `artifacts/`, fuera del repositorio.
