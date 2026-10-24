import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import path from 'node:path';

const preview = process.argv.includes('--preview');
const root = process.cwd();
await mkdir('.local', { recursive: true });
if (!preview) await build({ entryPoints: ['worker/index.mjs'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: '.local/worker.mjs', define: { __STATIC_ASSETS__: '{}' } });
const mf = new Miniflare({
  modules: true,
  scriptPath: path.join(root, preview ? 'dist/worker/index.mjs' : '.local/worker.mjs'),
  // Latest compatibility date supported by the stable local workerd binary.
  // Production uses 2026-10-24 in cloudflare-resources.json.
  compatibilityDate: '2026-08-06',
  host: '127.0.0.1',
  port: 8787,
  d1Databases: { DB: 'fabrizzitos-local' },
  d1Persist: path.join(root, '.local/d1'),
  r2Buckets: ['RECEIPTS'],
  r2Persist: path.join(root, '.local/r2'),
  bindings: { LOCAL_PREVIEW: 'true' },
});
await mf.ready;
const db = await mf.getD1Database('DB');
for (const file of (await readdir('migrations')).filter(file => file.endsWith('.sql')).sort()) {
  const schema = (await readFile(`migrations/${file}`, 'utf8')).replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const sql of schema) await db.prepare(sql).run();
}
let vite;
if (!preview) { vite = await createServer(); await vite.listen(); }
console.log(`FABRIZZITO'S KEKITOS: ${preview ? 'http://127.0.0.1:8787' : 'http://127.0.0.1:5173'} (pruebas locales persistentes)`);
async function close() { await vite?.close(); await mf.dispose(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
