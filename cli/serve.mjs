#!/usr/bin/env node
// Preview the screen locally: serves out/site/ at http://localhost:8080 (after `npm run build`).
//   npm run serve [-- --port 8080]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { ROOT } from '../lib/config.mjs';

const site = join(ROOT, 'out', 'site');
const i = process.argv.indexOf('--port');
const port = Number(i > 0 ? process.argv[i + 1] : 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/]|\.\.)+/, '');
  try {
    const body = await readFile(join(site, path || 'index.html'));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path || 'index.html')] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Serving out/site at http://localhost:${port}`));
