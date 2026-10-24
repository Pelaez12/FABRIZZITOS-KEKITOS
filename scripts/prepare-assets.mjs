import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/images', { recursive: true });
await mkdir('assets/originals', { recursive: true });
const images = [
  ['assets/originals/logo.png', 'logo'],
  ['assets/originals/intro.png', 'intro'],
  ['assets/originals/notifications.png', 'notifications'],
];
for (const [source, name] of images) {
  await sharp(source).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`public/images/${name}.webp`);
}
await sharp(images[0][0]).resize(96, 96).png().toFile('public/images/favicon.png');
console.log('Imágenes del usuario conservadas y versiones web optimizadas.');
