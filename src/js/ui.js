// DOM rendering. Everything shown here comes from the API response passed in.

const $ = (id) => document.getElementById(id);

const els = {
  form: $('search-form'),
  input: $('city-input'),
  searchError: $('search-error'),
  chips: $('city-chips'),
  results: $('results'),
  status: $('sr-status'),
  views: { loading: $('view-loading'), error: $('view-error'), data: $('view-data') },
  loadingTitle: $('loading-title'),
  loadingSub: $('loading-sub'),
  errorIcon: $('error-icon'),
  errorTitle: $('error-title'),
  errorMessage: $('error-message'),
  retryBtn: $('retry-btn'),
  restoreBtn: $('restore-btn'),
  tabFormatted: $('tab-formatted'),
  tabRaw: $('tab-raw'),
  jsonPanel: $('json-panel'),
  jsonCode: $('json-code'),
  jsonMeta: $('json-meta'),
  copyBtn: $('copy-btn'),
};

export { els };

/* ---------- small helpers ---------- */

const text = (id, value) => { $(id).textContent = value; };

/** "2026-11-15 15:45" → Date whose UTC fields equal that wall-clock time. */
function parseWallClock(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
}

const wallFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
});

function formatWallClock(s) {
  const d = parseWallClock(s);
  return d ? wallFmt.format(d) : s;
}

function uvLabel(uv) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

/** API gives protocol-relative 64px icons; use https and the 128px variant of the same icon. */
function iconUrl(icon) {
  const abs = icon.startsWith('//') ? `https:${icon}` : icon;
  return abs.replace('/64x64/', '/128x128/');
}

/* ---------- live local clock in the searched city's timezone ---------- */

let clockTimer = null;

function startClock(location) {
  clearInterval(clockTimer);
  const el = $('local-time');
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: location.tz_id,
    });
  } catch { fmt = null; }

  if (!fmt) { // Unknown tz id: fall back to the API's own localtime string.
    el.textContent = formatWallClock(location.localtime);
    el.dateTime = location.localtime.replace(' ', 'T');
    return;
  }
  const tick = () => { el.textContent = fmt.format(new Date()); };
  el.dateTime = location.localtime.replace(' ', 'T');
  tick();
  clockTimer = setInterval(tick, 15000);
}

/* ---------- views ---------- */

function showView(name) {
  for (const [key, el] of Object.entries(els.views)) el.hidden = key !== name;
  els.results.setAttribute('aria-busy', String(name === 'loading'));
}

export function showLoading(city) {
  els.loadingTitle.textContent = `Fetching live weather for ${city}…`;
  els.loadingSub.textContent = 'Asking WeatherAPI for the latest conditions.';
  showView('loading');
  announce(`Loading weather for ${city}.`);
}

export function markSlow() {
  els.loadingSub.textContent = 'Still working on it. The weather service is responding slowly.';
}

const ERROR_COPY = {
  validation: { icon: '?', title: 'Enter a city', retry: false },
  not_found: { icon: '?', title: 'City not found', retry: false },
  config: { icon: '🔑', title: 'API configuration error', retry: false },
  rate_limit: { icon: '⏳', title: 'Service temporarily busy', retry: true },
  network: { icon: '📡', title: 'No connection', retry: true },
  timeout: { icon: '⏱', title: 'Taking too long', retry: true },
  unavailable: { icon: '🛠', title: 'Weather service unavailable', retry: true },
  unexpected: { icon: '!', title: 'Something went wrong', retry: true },
};

function errorMessage(err, city) {
  switch (err.kind) {
    case 'not_found':
      return `We couldn't find a city called “${city}”. Check the spelling or try a nearby larger city.`;
    case 'config':
      return 'The weather service rejected this app\'s API key, so no data can be loaded. The app owner needs to check the WeatherAPI key configuration.';
    case 'rate_limit':
      return 'The weather service has received too many requests. Please wait a moment and try again.';
    case 'network':
      return err.detail?.offline
        ? 'You appear to be offline. Check your internet connection and try again.'
        : 'We couldn\'t reach the weather service. Check your internet connection and try again.';
    case 'timeout':
      return 'The weather service didn\'t respond in time. It may be slow right now. Please try again.';
    case 'unavailable':
      return 'WeatherAPI is having trouble right now. Please try again in a few minutes.';
    default:
      return 'We received a response we couldn\'t read. Please try again.';
  }
}

export function showError(err, { city, lastCity }) {
  const copy = ERROR_COPY[err.kind] || ERROR_COPY.unexpected;
  els.errorIcon.textContent = copy.icon;
  els.errorTitle.textContent = copy.title;
  els.errorMessage.textContent = errorMessage(err, city);
  els.retryBtn.hidden = !copy.retry;
  els.restoreBtn.hidden = !lastCity;
  if (lastCity) els.restoreBtn.textContent = `Back to ${lastCity}`;
  els.views.error.dataset.kind = err.kind;
  showView('error');
  announce(`${copy.title}. ${els.errorMessage.textContent}`);
}

export function renderWeather({ data }, personality) {
  const { location: loc, current: cur } = data;

  document.body.dataset.daypart = cur.is_day === 1 ? 'day' : 'night';
  document.body.dataset.tone = personality.tone;

  // Current weather card
  text('loc-name', loc.name);
  text('loc-place', [loc.region, loc.country].filter(Boolean).join(', '));
  text('local-tz', loc.tz_id || '');
  startClock(loc);

  const icon = $('cond-icon');
  icon.src = iconUrl(cur.condition.icon);
  icon.alt = cur.condition.text.trim();
  text('temp-c', cur.temp_c);
  text('cond-text', cur.condition.text.trim());
  text('feels-c', cur.feelslike_c);

  // Verdict
  text('verdict-emoji', personality.emoji);
  text('verdict-badge', personality.badge);
  text('verdict-title', personality.title);
  text('verdict-desc', personality.description);
  text('verdict-basis', personality.basis);
  $('verdict').dataset.tone = personality.tone;

  // Primary metrics
  text('m-humidity', cur.humidity);
  $('m-humidity-bar').style.width = `${Math.max(0, Math.min(100, cur.humidity))}%`;
  text('m-wind', cur.wind_kph);
  text('m-wind-sub', cur.wind_dir ? `From the ${cur.wind_dir}` : '');
  text('m-uv', cur.uv);
  text('m-uv-sub', uvLabel(cur.uv));

  // Secondary details
  text('d-cloud', cur.cloud);
  text('d-vis', cur.vis_km);
  text('d-pressure', cur.pressure_mb);
  text('d-wind', cur.wind_kph);
  text('d-temp-f', cur.temp_f);
  text('d-updated', `${formatWallClock(cur.last_updated)} (local)`);

  showView('data');
  announce(`Showing weather for ${loc.name}: ${cur.temp_c} degrees Celsius, ${cur.condition.text.trim()}. ${personality.title}.`);
}

/* ---------- JSON viewer ---------- */

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function highlight(json) {
  return escapeHtml(json).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, lit, num) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (lit) return `<span class="j-lit">${lit}</span>`;
      return `<span class="j-num">${num}</span>`;
    },
  );
}

export function renderJson(view, result) {
  const formatted = view === 'formatted';
  els.tabFormatted.setAttribute('aria-selected', String(formatted));
  els.tabRaw.setAttribute('aria-selected', String(!formatted));
  els.tabFormatted.tabIndex = formatted ? 0 : -1;
  els.tabRaw.tabIndex = formatted ? -1 : 0;
  els.jsonPanel.setAttribute('aria-labelledby', formatted ? 'tab-formatted' : 'tab-raw');
  els.jsonPanel.classList.toggle('is-raw', !formatted);

  if (!result) { els.jsonCode.textContent = ''; return; }
  if (formatted) els.jsonCode.innerHTML = highlight(JSON.stringify(result.data, null, 2));
  else els.jsonCode.textContent = result.raw;

  const bytes = new Blob([result.raw]).size;
  els.jsonMeta.textContent = `GET /v1/current.json · q=${result.apiQuery} · ${(bytes / 1024).toFixed(1)} KB`;
}

export function jsonTextFor(view, result) {
  if (!result) return '';
  return view === 'formatted' ? JSON.stringify(result.data, null, 2) : result.raw;
}

let copyTimer = null;
export function flashCopy(ok) {
  els.copyBtn.textContent = ok ? 'Copied!' : 'Copy failed';
  els.copyBtn.classList.toggle('is-done', ok);
  announce(ok ? 'JSON copied to clipboard.' : 'Could not copy JSON.');
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    els.copyBtn.textContent = 'Copy';
    els.copyBtn.classList.remove('is-done');
  }, 1800);
}

/* ---------- search + chips ---------- */

export function renderChips(cities) {
  els.chips.replaceChildren(...cities.map((city) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.city = city;
    btn.textContent = city;
    btn.setAttribute('aria-pressed', 'false');
    li.append(btn);
    return li;
  }));
}

export function setSelectedChip(city) {
  const target = (city || '').trim().toLowerCase();
  for (const btn of els.chips.querySelectorAll('.chip')) {
    const on = btn.dataset.city.toLowerCase() === target;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
}

export function setSearchValue(city) { els.input.value = city; }

export function showValidation(message) {
  els.searchError.textContent = message;
  els.input.setAttribute('aria-invalid', 'true');
  els.form.classList.add('has-error');
}

export function clearValidation() {
  els.searchError.textContent = '';
  els.input.removeAttribute('aria-invalid');
  els.form.classList.remove('has-error');
}

export function announce(message) {
  els.status.textContent = '';
  // Re-set on next frame so repeated identical messages are still announced.
  requestAnimationFrame(() => { els.status.textContent = message; });
}
