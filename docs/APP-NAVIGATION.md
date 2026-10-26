# Navegación del aplicativo

Publicado en https://reserva.comunidadfortaleza.com/.

Rutas: `/`, `/reservar`, `/iniciar-sesion`, `/mi-cuenta`, `/mi-perfil`, `/mis-reservas`, `/misiones`, `/ruleta`, `/promociones` y `/ubicacion`.

`shared/navigation.mjs` define la lista explícita para el cliente, la generación HTML y el Worker. El cliente utiliza History API y conserva el formulario de reserva al navegar internamente. Atrás/Adelante sincroniza la pantalla. Los enlaces antiguos `/#booking`, `/#cuenta`, `/#ruleta`, `/#promociones` y `/#ubicacion` siguen funcionando.

El acceso de Google mantiene su inicio y callback existentes. Tras el callback correcto, dirige a `/mi-cuenta`. Las credenciales y las cookies seguras no cambian. Reservar sigue siendo posible sin iniciar sesión. El componente de cuenta permanece montado para autocompletar los datos aunque su pantalla no esté visible.

La barra lateral se muestra en escritorio. Hasta 900 px se sustituye por cabecera con botón de cuenta, menú modal nativo (foco contenido, Escape y restauración de foco) y tres accesos inferiores. El menú se cierra al seleccionar una ruta, incluso si ya es la sección actual.

La portada conserva el contenido local indexable, canonical y JSON-LD. Las otras rutas tienen HTML propio para recarga directa, canonical propio y `noindex, follow` en HTML y cabecera. Las rutas desconocidas continúan devolviendo 404. No se cambian Service Worker, promociones, comprobantes, migraciones, bindings ni secretos.

Despliegue de esta versión: `0f56f191cb6a43a2ad20d92b7fb051e9`. Se reutilizaron los bindings activos del Worker y se conservaron los secretos con `keep_bindings`.
