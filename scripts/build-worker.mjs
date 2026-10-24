import { build } from 'esbuild';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const types = { '.html': 'text/html;charset=utf-8', '.css': 'text/css;charset=utf-8', '.js': 'application/javascript;charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const assets = {};
async function collect(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, file.name);
    if (file.isDirectory()) await collect(full);
    else {
      const url = '/' + path.relative('dist/client', full).replaceAll('\\', '/');
      assets[url] = { content: (await readFile(full)).toString('base64'), type: types[path.extname(file.name)] || 'application/octet-stream' };
    }
  }
}
await collect('dist/client');
await mkdir('dist/worker', { recursive: true });
await build({ entryPoints: ['worker/index.mjs'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'dist/worker/index.mjs', minify: true, define: { __STATIC_ASSETS__: JSON.stringify(assets) } });
console.log(`Worker preparado con ${Object.keys(assets).length} recursos estáticos.`);
