// Serverless proxy for WeatherAPI.com — keeps the API key server-side only.
// Vercel:  /api/weather?city=<name>  →  https://api.weatherapi.com/v1/current.json

const WEATHERAPI_ENDPOINT = 'https://api.weatherapi.com/v1/current.json';
const UPSTREAM_TIMEOUT_MS = 12_000;
const MAX_CITY_LENGTH = 120;

// Letters (any script), marks, numbers, spaces, and light punctuation found in real place names.
const CITY_PATTERN = /^[\p{L}\p{M}\p{N}\s.,'’()-]+$/u;

export function normalizeCity(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!cleaned || cleaned.length > MAX_CITY_LENGTH) return '';
  if (!CITY_PATTERN.test(cleaned)) return '';
  if (!/\p{L}|\p{N}/u.test(cleaned)) return '';
  return cleaned;
}

function jsonError(status, code, message) {
  return { status, body: JSON.stringify({ error: { code, message } }) };
}

/**
 * Proxies a single weather lookup. The upstream response body is passed through
 * untouched so the client can show the exact raw JSON from WeatherAPI.
 */
export async function proxyWeather({ method = 'GET', city, apiKey, fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  if (method !== 'GET') return jsonError(405, 'method_not_allowed', 'Only GET requests are supported.');

  const query = normalizeCity(city);
  if (!query) return jsonError(400, 'invalid_city', 'Enter a city name to search.');
  if (!apiKey) return jsonError(500, 'config', 'The weather service is not configured.');

  const url = `${WEATHERAPI_ENDPOINT}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&aqi=no`;

  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    const body = await response.text();
    return { status: response.status, body };
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return jsonError(504, 'upstream_timeout', 'The weather service took too long to respond.');
    }
    return jsonError(502, 'network', 'Could not reach the weather service.');
  }
}

export default async function handler(req, res) {
  let city = '';
  try {
    const url = new URL(req.url, 'http://localhost');
    city = url.searchParams.get('city') ?? '';
  } catch {
    city = '';
  }
  const result = await proxyWeather({ method: req.method, city, apiKey: process.env.WEATHER_API_KEY });
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(result.body);
}
