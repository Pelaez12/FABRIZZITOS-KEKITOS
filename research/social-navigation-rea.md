# Referencia de navegación con REA

Fecha: 26 de octubre de 2026. Petición: tomar Instagram o Facebook como referencia para hacer visible el acceso a la cuenta y organizar el aplicativo.

REA ejecutó dos escenarios públicos de Instagram en un perfil temporal vacío, con Chrome a 1440 × 900. Las únicas acciones declaradas fueron navegar y esperar la carga. No se inició sesión ni se interactuó con cuentas sociales.

- Inicio `https://www.instagram.com/`: evidencia `ev_0583200a686c4912028cf6efa7c0b891ed45f4ce447ed9b616b7fd033c792f39`. El árbol accesible presenta el acceso a la cuenta, campos de identificación y un botón de inicio de sesión, además de recuperación y registro con enlaces propios.
- Perfil público `https://www.instagram.com/instagram/`: evidencia `ev_87f990afbea7610e874d1828a03859827faf8a202c787267eea67e7b72fe7609`. Instagram presentó una ventana de registro con botones explícitos para registrarse e iniciar sesión.

Límite de la observación: el contenido del perfil quedó detrás del aviso de acceso. No se observó una sesión autenticada ni se afirma haber obtenido el código interno o la navegación privada de Instagram. Los navegadores temporales fueron cerrados por REA.

Decisiones propias para Fabrizzito's: menú lateral persistente en escritorio; botón de sesión/perfil visible; iconos acompañados de etiquetas; sección actual destacada; menú modal y accesos inferiores en móvil. Las pantallas tienen rutas explícitas y admiten Atrás/Adelante. Esta estructura adapta la idea de navegación de una app social a reservas, perfil, historial, misiones y premios, conservando la marca existente.

Validación: 48 pruebas automatizadas; comprobación manual local de cambios de sección y Atrás conservando cantidades; revisión de perfil y misiones con la sesión existente en producción; menú móvil a 390 × 844, cierre al seleccionar la sección actual y restablecimiento del tamaño del navegador; respuestas 200 para las 10 rutas, 404 para rutas desconocidas y Google habilitado. No se enviaron campañas, no se crearon reservas de producción ni se giró la ruleta.
