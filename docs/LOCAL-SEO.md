# SEO local de FABRIZZITO'S KEKITOS

Configurado el 26/10/2026 para `https://reserva.comunidadfortaleza.com/`.

## Implementación

- Título y descripción orientados a kekitos proteicos, banana y avena, y Jesús María.
- Encabezado visible «Kekitos proteicos en Jesús María».
- Información local y preguntas frecuentes: Av. Talara 450, precios S/4 y S/12, lunes a viernes de 18:00 a 22:00, delivery solo de kekitos en Jesús María por S/6 y reservas para el mismo día sujetas a cupos.
- Contenido público inicial generado en la compilación, visible sin ejecutar JavaScript; React lo reemplaza por el aplicativo completo con la misma información pública. Nunca se incluyen perfiles, sesiones o reservas privadas en ese HTML.
- Datos estructurados JSON-LD `Bakery`, dirección, teléfono público del negocio, horarios y menú con precios PEN. No se agregaron reseñas, puntuaciones, certificaciones, valores nutricionales ni coordenadas inventadas.
- Canonical a la URL principal; workers.dev sigue operativo y apunta a la misma canónica para evitar señales duplicadas.
- Open Graph y tarjeta social con las fotografías existentes de la marca.
- `robots.txt` permite el rastreo público y excluye `/api/`. Esta regla no sustituye la autenticación de APIs.
- `sitemap.xml` contiene solo la URL pública canónica y la imagen principal, sin fragmentos, rutas de API, perfiles ni URLs inexistentes.

La fuente de contenido público es `shared/seo.mjs`, reutilizada en la interfaz y en el render estático. `scripts/build-worker.mjs` añade el contenido al HTML generado por Vite y empaqueta el Worker. Se conservaron los secretos de Google, VAPID, FLEXQR, las reservas y R2.

## Search Console

Propiedad: `https://reserva.comunidadfortaleza.com/`.

Se envió `https://reserva.comunidadfortaleza.com/sitemap.xml`. Search Console confirmó **Correcto**, una URL descubierta, el 26/10/2026. La inspección inicial indicó «Descubierta: actualmente sin indexar» y sin rastreo previo. La solicitud de indexación es una petición a Google, no una confirmación de que la página ya esté indexada ni de una posición concreta.

## Seguimiento y límites

Search Console todavía está procesando los datos iniciales. Revisar en los próximos días la indexación y después las impresiones, consultas y clics para búsquedas como «kekitos proteicos Jesús María», «kekes de banana y avena Jesús María» y el nombre de la marca. No se configuraron anuncios ni se hizo ningún gasto.

Para mejorar también la presencia en Maps, completar o verificar la ficha real del negocio en Google Business Profile con nombre, dirección, horario, web y fotos coherentes. La verificación de Google puede requerir una acción del propietario. No se creó una ficha duplicada ni se cambió la ficha de la academia que aparece en el mapa del mismo local. Las reseñas deben ser de clientes reales, sin inventarlas ni condicionarlas a premios.

No se puede garantizar un plazo de indexación, aparecer primero ni que una búsqueda genérica muestre siempre el negocio. La relevancia, distancia y popularidad influyen en los resultados locales.

Referencias oficiales:

- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://support.google.com/business/answer/7091
