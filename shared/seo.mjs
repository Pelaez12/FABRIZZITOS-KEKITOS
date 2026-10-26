import React from 'react';
import { SETTINGS } from './booking.mjs';
const h = React.createElement;
export const SITE_URL = 'https://reserva.comunidadfortaleza.com/';
export const SEO_TITLE = "Kekitos proteicos en Jesús María | Fabrizzito's Kekitos";
export const SEO_DESCRIPTION = 'Kekitos de banana y avena a S/4 y batidos a S/12 en Jesús María. Recojo en Av. Talara 450 y delivery de kekitos en el distrito. Reserva online.';
export const LOCAL_FAQ = Object.freeze([
  ['¿Dónde comprar kekitos proteicos en Jesús María?', 'Reserva en FABRIZZITO’S KEKITOS y recoge tu pedido en Av. Talara 450, Jesús María, Lima. Atendemos de lunes a viernes de 6:00 a 10:00 p. m.'],
  ['¿Cuánto cuestan los kekitos y los batidos?', 'Cada kekito proteico de banana y avena cuesta S/4. El batido proteico de vainilla cuesta S/12 y se entrega únicamente por recojo.'],
  ['¿Puedo reservar kekitos para hoy?', 'Sí. Puedes reservar para el mismo día si quedan cupos y el horario no ha pasado. Hay horarios cada media hora, de lunes a viernes entre las 6:00 y las 10:00 p. m.'],
  ['¿Hacen delivery en Jesús María?', 'Sí, únicamente de kekitos dentro de Jesús María, por S/6 adicionales. Los batidos son solo para recojo en el local.'],
  ['¿Tengo que pagar antes de reservar?', 'Puedes reservar sin pagar ahora o adjuntar tu comprobante de Yape. El comprobante se revisa manualmente y no se considera aprobado por el solo hecho de subirlo.'],
]);
export const LOCAL_SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE_URL}#website`, url: SITE_URL, name: SETTINGS.brand, inLanguage: 'es-PE', publisher: { '@id': `${SITE_URL}#negocio` } },
    { '@type': 'Bakery', '@id': `${SITE_URL}#negocio`, name: SETTINGS.brand, url: SITE_URL, description: SEO_DESCRIPTION,
      image: `${SITE_URL}images/intro.webp`, logo: `${SITE_URL}images/favicon.png`, telephone: '+51992272521', priceRange: 'S/4–S/12',
      address: { '@type': 'PostalAddress', streetAddress: 'Av. Talara 450', addressLocality: 'Jesús María', addressRegion: 'Lima', addressCountry: 'PE' },
      areaServed: { '@type': 'Place', name: 'Jesús María, Lima, Perú' },
      openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '18:00', closes: '22:00' }],
      hasMenu: { '@type': 'Menu', name: 'Kekitos y batidos proteicos', hasMenuSection: { '@type': 'MenuSection', name: 'Nuestros productos', hasMenuItem: [
        { '@type': 'MenuItem', name: 'Kekito proteico de banana y avena', description: 'Kekito de banana y avena, disponible para recojo o delivery en Jesús María.', offers: { '@type': 'Offer', price: (SETTINGS.kekePrice / 100).toFixed(2), priceCurrency: 'PEN', url: `${SITE_URL}reservar` } },
        { '@type': 'MenuItem', name: 'Batido proteico de vainilla', description: 'Batido de proteína de vainilla, solo para recojo en el local.', offers: { '@type': 'Offer', price: (SETTINGS.shakePrice / 100).toFixed(2), priceCurrency: 'PEN', url: `${SITE_URL}reservar` } },
      ] } },
    },
  ],
};
export function LocalInfo() {
  return h('section', { className: 'local-info', id: 'kekitos-jesus-maria', 'aria-labelledby': 'local-info-title' },
    h('div', { className: 'local-info-heading' }, h('h2', { id: 'local-info-title' }, 'Kekitos de banana y avena en Jesús María'),
      h('p', null, 'Una merienda de kekitos proteicos y batidos de vainilla, con recojo en Av. Talara 450. Reserva tus cantidades y elige un horario disponible.')),
    h('div', { className: 'local-menu' },
      h('article', null, h('h3', null, 'Kekito proteico de banana y avena'), h('p', null, 'S/4 por unidad. Para recoger en el local o pedir por delivery dentro de Jesús María.')),
      h('article', null, h('h3', null, 'Batido proteico de vainilla'), h('p', null, 'S/12 por unidad. Solo recojo para acompañar tus kekitos.'))),
    h('div', { className: 'local-faq' }, h('h3', null, 'Antes de reservar'), LOCAL_FAQ.map(([question, answer]) => h('details', { key: question }, h('summary', null, question), h('p', null, answer)))),
    h('a', { className: 'button secondary', href: '/reservar' }, 'Reservar kekitos en Jesús María'));
}
// Visible initial HTML for users and crawlers. React replaces it with the full app.
// This contains the same public information as the interactive page, never account data.
export function IndexablePage() {
  return h(React.Fragment, null,
    h('header', { className: 'site-header' }, h('a', { className: 'brand', href: SITE_URL }, h('img', { src: '/images/favicon.png', width: 48, height: 48, alt: '' }), h('span', null, "FABRIZZITO'S", h('strong', null, 'KEKITOS')))),
    h('main', null, h('section', { className: 'hero' }, h('div', { className: 'hero-copy' }, h('p', null, 'Hechos en Jesús María'), h('h1', null, 'Kekitos proteicos', h('br'), h('span', null, 'en Jesús María.')), h('p', null, 'Kekitos de banana y avena, batidos proteicos y un espacio reservado para ti.'), h('a', { className: 'button primary', href: '/reservar' }, 'Reservar')),
      h('div', { className: 'hero-visual' }, h('img', { className: 'hero-image', src: '/images/intro.webp', width: 660, height: 660, alt: "Kekitos de banana y avena y batido proteico de Fabrizzito’s Kekitos en Jesús María" }))),
      h('section', { className: 'details', id: 'booking' }, h('div', null, h('h2', null, 'Reserva para hoy o elige otra fecha'), h('p', null, 'Lunes a viernes, de 6:00 a 10:00 p. m., en horarios de media hora. Según disponibilidad.')),
        h('div', null, h('p', null, 'Recojo en Av. Talara 450, Jesús María. Delivery de kekitos en el distrito por S/6.'), h('p', null, 'Activa JavaScript para elegir productos, consultar cupos y confirmar tu reserva. También puedes consultar por WhatsApp.'), h('a', { className: 'button secondary', href: 'https://wa.me/51992272521' }, 'Consultar por WhatsApp'))),
      h(LocalInfo)),
    h('footer', null, h('span', null, SETTINGS.brand), h('p', null, 'Av. Talara 450, Jesús María, Lima, Perú.')));
}
