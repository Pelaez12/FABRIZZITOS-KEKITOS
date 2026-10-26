export const APP_ROUTES = Object.freeze({
  '/': { title: 'Inicio', view: 'home' },
  '/reservar': { title: 'Reservar kekitos', view: 'booking' },
  '/iniciar-sesion': { title: 'Iniciar sesión', view: 'login' },
  '/mi-cuenta': { title: 'Mi cuenta', view: 'progress' },
  '/mi-perfil': { title: 'Mi perfil', view: 'profile' },
  '/mis-reservas': { title: 'Mis reservas', view: 'orders' },
  '/misiones': { title: 'Misiones', view: 'missions' },
  '/ruleta': { title: 'Ruleta y premios', view: 'wheel' },
  '/promociones': { title: 'Promociones', view: 'promotions' },
  '/ubicacion': { title: 'Dónde recoger', view: 'location' },
});
const legacy = { '#booking': '/reservar', '#cuenta': '/mi-cuenta', '#ruleta': '/ruleta', '#promociones': '/promociones', '#ubicacion': '/ubicacion' };
export function routeForUrl(url) {
  return (url.pathname === '/' && legacy[url.hash]) || (Object.hasOwn(APP_ROUTES, url.pathname) ? url.pathname : null);
}
export function appAssetPath(path) {
  return Object.hasOwn(APP_ROUTES, path) ? (path === '/' ? '/index.html' : `${path}/index.html`) : path;
}
