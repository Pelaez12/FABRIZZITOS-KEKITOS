import { readFile } from 'node:fs/promises';

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Define CLOUDFLARE_API_TOKEN en el entorno antes de desplegar. No lo escribas en archivos.');
const config = JSON.parse(await readFile('cloudflare-resources.json', 'utf8'));
const source = await readFile('dist/worker/index.mjs', 'utf8');
const form = new FormData();
form.set('metadata', new Blob([JSON.stringify({
  main_module: 'index.mjs', compatibility_date: config.compatibility_date,
  bindings: config.bindings,
  observability: { enabled: true, logs: { enabled: true, invocation_logs: true }, traces: { enabled: true, head_sampling_rate: 0.1 }, redact_query_string: true },
})], { type: 'application/json' }));
form.set('index.mjs', new Blob([source], { type: 'application/javascript+module' }), 'index.mjs');
async function request(suffix, init) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}${suffix}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(`Cloudflare ${response.status}: ${JSON.stringify(result.errors)}`);
  return result.result;
}
await request(`/workers/scripts/${config.worker_name}`, { method: 'PUT', body: form });
await request(`/workers/scripts/${config.worker_name}/subdomain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
const subdomain = await request('/workers/subdomain');
console.log(`https://${config.worker_name}.${subdomain.subdomain}.workers.dev`);
