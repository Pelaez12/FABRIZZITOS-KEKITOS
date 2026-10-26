import { build } from 'esbuild';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IndexablePage, LOCAL_SCHEMA } from '../shared/seo.mjs';

const types = { '.html': 'text/html;charset=utf-8', '.css': 'text/css;charset=utf-8', '.js': 'application/javascript;charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
types['.webmanifest'] = 'application/manifest+json';
types['.txt'] = 'text/plain;charset=utf-8';
types['.xml'] = 'application/xml;charset=utf-8';
const htmlPath = 'dist/client/index.html';
const sourceHtml = await readFile(htmlPath, 'utf8');
// Replace an earlier generated render when this script is run again without Vite.
const publicHtml = sourceHtml.replace(/<div id="root">[\s\S]*?<\/div><!-- public-render-end -->|<div id="root"><\/div>/, `<div id="root">${renderToStaticMarkup(React.createElement(IndexablePage))}</div><!-- public-render-end -->`);
const schema = JSON.stringify(LOCAL_SCHEMA).replaceAll('<', '\\u003c');
const finalHtml = publicHtml.replace(/<script id="local-business-schema"[\s\S]*?<\/script>/g, '').replace('</head>', `<script id="local-business-schema" type="application/ld+json">${schema}</script></head>`);
await writeFile(htmlPath, finalHtml);
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
