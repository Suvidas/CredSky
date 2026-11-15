// Local development server — mirrors the production setup: static site + /api/weather proxy.
// The real key lives in .env (git-ignored). Run with:  npm run dev

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proxyWeather } from './api/weather.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

async function loadDotEnv() {
  if (process.env.WEATHER_API_KEY) return;
  try {
    const source = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env is optional when the variable is already set in the environment
  }
}

function sendError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendError(res, 400, 'Bad request');
  }

  if (pathname === '/api/weather') {
    const url = new URL(req.url, 'http://localhost');
    const result = await proxyWeather({
      method: req.method,
      city: url.searchParams.get('city') ?? '',
      apiKey: process.env.WEATHER_API_KEY,
    });
    res.writeHead(result.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(result.body);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'Method not allowed');

  const safePath = normalize(pathname).replace(/^[/\\]+/, '');
  if (safePath.split(/[\\/]/).some((part) => part.startsWith('.') || part === '..')) {
    return sendError(res, 403, 'Forbidden');
  }

  // Serve only the public site — never server code, env files or tests.
  const parts = safePath === '' ? [] : safePath.split(/[\\/]/);
  const allowed = parts.length === 0 || (parts.length === 1 && parts[0] === 'index.html')
    ? true
    : ['assets', 'css', 'js'].includes(parts[0]);
  if (!allowed) return sendError(res, 404, 'Not found');

  const filePath = resolve(ROOT, safePath === '' ? 'index.html' : safePath);
  const rootPrefix = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  if (!filePath.startsWith(rootPrefix)) return sendError(res, 403, 'Forbidden');

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendError(res, 404, 'Not found');
  }
});

await loadDotEnv();

server.listen(PORT, () => {
  console.log(`What’s the Weather  →  http://localhost:${PORT}`);
  console.log(
    process.env.WEATHER_API_KEY
      ? 'WeatherAPI key loaded from the environment.'
      : 'WARNING: WEATHER_API_KEY is not set — /api/weather will return a config error.'
  );
});
