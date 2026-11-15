// Small pure helpers that turn API values into display strings.
// The WeatherAPI response already carries the searched city's LOCAL time
// (e.g. "2026-11-15 15:39"), so strings are parsed literally — never shifted
// into the browser's timezone.

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const YEAR = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' });

function splitStamp(stamp) {
  if (typeof stamp !== 'string') return null;
  const match = stamp.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, m] = match;
  return {
    utc: Date.UTC(Number(y), Number(mo) - 1, Number(d)),
    h: Number(h),
    m: Number(m),
  };
}

/** "2026-11-15 15:39" → "3:39 PM" */
export function formatClock(stamp) {
  const parts = splitStamp(stamp);
  if (!parts) return typeof stamp === 'string' ? stamp : '—';
  const period = parts.h >= 12 ? 'PM' : 'AM';
  const hour12 = parts.h % 12 === 0 ? 12 : parts.h % 12;
  return `${hour12}:${String(parts.m).padStart(2, '0')} ${period}`;
}

/** "2026-11-15 15:39" → "Sat, 15 Nov 2026" (the city's local date) */
export function formatDay(stamp) {
  const parts = splitStamp(stamp);
  if (!parts) return '';
  const date = new Date(parts.utc);
  return `${WEEKDAY.format(date)}, ${DAY.format(date)} ${YEAR.format(date)}`;
}

export const round = (value) => (Number.isFinite(value) ? String(Math.round(value)) : '—');
export const round1 = (value) => (Number.isFinite(value) ? value.toFixed(1) : '—');

/** Feels-like temperature, e.g. "31°C" */
export const celsiusText = (value) => `${round(value)}°C`;

/** UV index display: 3 → "3", 2.8 → "2.8" */
export function formatUv(value) {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Derived UV category — an interpretation of the API's uv value, not hardcoded weather. */
export function uvCategory(uv) {
  if (!Number.isFinite(uv) || uv < 0) return '—';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

export function humidityLabel(humidity) {
  if (!Number.isFinite(humidity)) return '—';
  if (humidity < 30) return 'Dry air';
  if (humidity <= 60) return 'Comfortable';
  return 'Humid';
}

export function windLabel(kph) {
  if (!Number.isFinite(kph)) return '—';
  if (kph < 12) return 'Calm';
  if (kph < 25) return 'Light breeze';
  return 'Strong winds';
}

/** Meter fill %, clamped to 0–100. Decorative only (aria-hidden). */
export function meterPercent(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}
