// Public reference artifacts remain ignored under artifacts/. Never execute them.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url = 'https://assets.calendly.com/assets/external/widget.js';
const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Public script fetch failed: ${response.status}`);
const source = await response.text();
if (Buffer.byteLength(source) > 2 * 1024 * 1024) throw new Error('Reference exceeds the acquisition budget.');
await mkdir('artifacts/calendly-public', { recursive: true });
await writeFile('artifacts/calendly-public/widget.js', source);
const manifest = { url, acquiredAt: new Date().toISOString(), bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'), scope: 'Public embed widget only. No backend or authenticated application access.' };
await writeFile('artifacts/calendly-public/provenance.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
