// Browser-side API client.
// Talks only to the same-origin /api/weather proxy, which holds the
// WeatherAPI.com key server-side — no key is ever shipped to the browser.

const CLIENT_TIMEOUT_MS = 30_000;

// WeatherAPI error codes that mean "the API key is missing/invalid/disabled".
const CONFIG_CODES = new Set([1002, 1003, 2006, 2007, 2008, 2009]);

const ERROR_TITLES = {
  not_found: 'City not found',
  config: 'Weather service isn’t configured',
  rate_limit: 'Weather service is busy',
  network: 'You appear to be offline',
  service: 'Weather service unavailable',
  invalid_response: 'Unexpected response',
  generic: 'Something went wrong',
};

export class WeatherError extends Error {
  constructor(kind, { title, message, retryable = true, status } = {}) {
    super(message);
    this.name = 'WeatherError';
    this.kind = kind;
    this.title = title ?? ERROR_TITLES[kind] ?? ERROR_TITLES.generic;
    this.retryable = retryable;
    this.status = status;
  }
}

function kindFromStatus(status, payload) {
  const code = payload?.error?.code;
  if (code === 'config') return 'config';
  if (code === 'invalid_city') return 'not_found';
  if (code === 'network' || code === 'upstream_timeout') return 'service';

  const numeric = Number(code);
  if (Number.isFinite(numeric)) {
    if (numeric === 1006) return 'not_found'; // "No matching location found."
    if (CONFIG_CODES.has(numeric)) return 'config';
  }
  if (status === 401 || status === 403) return 'config';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'service';
  return 'generic';
}

function messageFor(kind, city, status) {
  switch (kind) {
    case 'not_found':
      return `We couldn’t find any weather for “${city}”. Check the spelling and try another city.`;
    case 'config':
      return 'The WeatherAPI key on the server is missing or invalid. Update the WEATHER_API_KEY environment variable and redeploy.';
    case 'rate_limit':
      return 'Too many requests reached the weather API just now. Give it a moment, then try again.';
    case 'network':
      return 'Check your internet connection and try again.';
    case 'service':
      return `The weather API isn’t responding right now${status ? ` (status ${status})` : ''}. It should be back shortly.`;
    case 'invalid_response':
      return 'The weather service sent data we don’t recognise. Try again in a moment.';
    default:
      return 'An unexpected error occurred while fetching the weather. Try again.';
  }
}

function validateWeatherData(data) {
  const loc = data?.location;
  const cur = data?.current;
  const hasLocation = Boolean(loc) && typeof loc.name === 'string' && loc.name.trim() !== '';
  const hasCore = Boolean(cur) && Number.isFinite(cur.temp_c) && Boolean(cur.condition) && typeof cur.condition.text === 'string';
  if (!hasLocation || !hasCore) {
    throw new WeatherError('invalid_response', {
      title: ERROR_TITLES.invalid_response,
      message: messageFor('invalid_response'),
      retryable: true,
    });
  }
}

/**
 * Fetches weather for a city. Resolves { data, raw } where `raw` is the exact
 * response text (kept for the Raw JSON view) and `data` is the parsed object.
 */
export async function fetchWeather(city, signal) {
  const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(CLIENT_TIMEOUT_MS)
    : null;
  const combinedSignal = timeoutSignal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, timeoutSignal])
    : signal;

  let response;
  try {
    response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, {
      signal: combinedSignal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error; // superseded by a newer search
    if (error?.name === 'TimeoutError') {
      throw new WeatherError('service', {
        title: ERROR_TITLES.service,
        message: messageFor('service', city, 'timeout'),
        retryable: true,
        status: 504,
      });
    }
    throw new WeatherError('network', {
      title: ERROR_TITLES.network,
      message: messageFor('network', city),
      retryable: true,
    });
  }

  const raw = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const kind = kindFromStatus(response.status, payload);
    throw new WeatherError(kind, {
      title: ERROR_TITLES[kind] ?? ERROR_TITLES.generic,
      message: messageFor(kind, city, response.status),
      retryable: kind !== 'not_found' && kind !== 'config',
      status: response.status,
    });
  }

  if (!payload) {
    throw new WeatherError('invalid_response', {
      title: ERROR_TITLES.invalid_response,
      message: messageFor('invalid_response'),
      retryable: true,
      status: response.status,
    });
  }

  validateWeatherData(payload);
  return { data: payload, raw };
}
