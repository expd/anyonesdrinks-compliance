#!/usr/bin/env node
// Generates print QR codes for every product into qr/.
//   npm install   (once, installs the qrcode package)
//   npm run qr
// Output: qr/<slug>.svg for the printer, qr/<slug>.png for proofs and test scans.

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const site = JSON.parse(await readFile(path.join(ROOT, 'site.json'), 'utf8'));
const files = (await readdir(path.join(ROOT, 'products'))).filter((f) => f.endsWith('.json'));
await mkdir(path.join(ROOT, 'qr'), { recursive: true });

const options = { errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#000000', light: '#ffffff' } };

for (const file of files) {
  const { slug } = JSON.parse(await readFile(path.join(ROOT, 'products', file), 'utf8'));
  const url = `${site.baseUrl}/${slug}/`;
  const svg = await QRCode.toString(url, { ...options, type: 'svg' });
  await writeFile(path.join(ROOT, 'qr', `${slug}.svg`), svg);
  await QRCode.toFile(path.join(ROOT, 'qr', `${slug}.png`), url, { ...options, width: 1200 });
  const { modules } = QRCode.create(url, options);
  console.log(`${slug}: ${url} (${modules.size}x${modules.size} modules + quiet zone)`);
}
