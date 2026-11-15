// WeatherAPI client: one request, classified errors, validated payload.

import { WEATHER_API_KEY } from './config.js';
import { API_BASE, REQUEST_TIMEOUT_MS } from './constants.js';

/**
 * Error kinds:
 *   not_found    – WeatherAPI could not match the city (code 1006)
 *   config       – missing / invalid / disabled API key (1002, 2006, 2008, 2009, HTTP 401/403)
 *   rate_limit   – quota exceeded (2007) or HTTP 429
 *   unavailable  – WeatherAPI server error (HTTP 5xx, code 9999)
 *   network      – browser could not reach the API (offline, DNS, blocked)
 *   timeout      – no response within REQUEST_TIMEOUT_MS
 *   unexpected   – response arrived but is not the shape we need
 *   aborted      – superseded by a newer request (never shown to the user)
 */
export class WeatherError extends Error {
  constructor(kind, message, detail = {}) {
    super(message);
    this.name = 'WeatherError';
    this.kind = kind;
    this.detail = detail;
  }
}

const CONFIG_CODES = new Set([1002, 2006, 2008, 2009]);

function classify(status, code, message) {
  if (code === 1006) return new WeatherError('not_found', message || 'No matching location found.', { status, code });
  if (code === 2007 || status === 429) return new WeatherError('rate_limit', message || 'API quota exceeded.', { status, code });
  if (CONFIG_CODES.has(code) || status === 401 || status === 403) {
    return new WeatherError('config', message || 'API key rejected.', { status, code });
  }
  if (status >= 500 || code === 9999) return new WeatherError('unavailable', message || 'Weather service error.', { status, code });
  return new WeatherError('unexpected', message || `Unexpected response (HTTP ${status}).`, { status, code });
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

/** True only when every field the UI renders is present, so we never render a half-filled card. */
export function isCompletePayload(data) {
  const l = data?.location;
  const c = data?.current;
  return Boolean(
    l && c &&
    isStr(l.name) && typeof l.country === 'string' && isStr(l.localtime) &&
    isNum(c.temp_c) && isNum(c.temp_f) && isNum(c.feelslike_c) &&
    c.condition && isStr(c.condition.text) && isStr(c.condition.icon) && isNum(c.condition.code) &&
    isNum(c.humidity) && isNum(c.wind_kph) && isNum(c.uv) &&
    isNum(c.cloud) && isNum(c.vis_km) && isNum(c.pressure_mb) &&
    isStr(c.last_updated) && (c.is_day === 0 || c.is_day === 1)
  );
}

/** Combine the caller's signal with our timeout without relying on AbortSignal.any (Safari < 17.4). */
function linkedController(outer) {
  const ctrl = new AbortController();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl;
}

/**
 * GET /v1/current.json?key=…&q=city
 * Resolves to { data, raw, url } where raw is the exact response text.
 */
export async function fetchCurrentWeather(city, { signal } = {}) {
  if (!WEATHER_API_KEY) {
    throw new WeatherError('config', 'No WeatherAPI key was configured at build time.', { code: 1002 });
  }

  const params = new URLSearchParams({ key: WEATHER_API_KEY, q: city });
  const url = `${API_BASE}/current.json?${params}`;

  const ctrl = linkedController(signal);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, REQUEST_TIMEOUT_MS);

  let res;
  let raw;
  try {
    res = await fetch(url, { method: 'GET', signal: ctrl.signal, headers: { Accept: 'application/json' } });
    raw = await res.text();
  } catch (err) {
    if (signal?.aborted) throw new WeatherError('aborted', 'Request superseded.');
    if (timedOut) throw new WeatherError('timeout', 'The weather service took too long to respond.');
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new WeatherError('network', err?.message || 'Network request failed.', { offline });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = JSON.parse(raw); } catch { /* handled below */ }

  if (!res.ok || data?.error) {
    throw classify(res.status, data?.error?.code, data?.error?.message);
  }
  if (!isCompletePayload(data)) {
    throw new WeatherError('unexpected', 'The weather response was missing expected fields.', { status: res.status });
  }

  return { data, raw, url: url.replace(WEATHER_API_KEY, '•••') };
}
