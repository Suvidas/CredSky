// What’s the Weather — app controller.
// Owns the request lifecycle (loading / success / error / stale), renders the
// weather card and popular-city chips, and wires the API response viewer.

import { DEFAULT_CITY, POPULAR_CITIES, POPULAR_CITY_QUERIES } from './config.js';
import { fetchWeather, WeatherError } from './api.js';
import { getWeatherPersonality, PERSONALITIES } from './personality.js';
import {
  formatClock,
  celsiusText,
  round,
  round1,
  formatUv,
  uvCategory,
  humidityLabel,
  windLabel,
  meterPercent,
} from './format.js';
import { createJsonViewer } from './json-viewer.js';

// ---------- tiny helpers ----------

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>',
  uv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"/></svg>',
  umbrella: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12a10 10 0 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/></svg>',
  retry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/></svg>',
};

const TONE_ICONS = {
  perfect: ICONS.sparkles,
  sun: ICONS.uv,
  rain: ICONS.umbrella,
  freeze: ICONS.snow,
  breeze: ICONS.wind,
  neutral: ICONS.sparkles,
};

// ---------- DOM ----------

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('city-input'),
  button: document.getElementById('search-button'),
  fieldError: document.getElementById('city-error'),
  chips: document.getElementById('city-chips'),
  alert: document.getElementById('alert'),
  alertTitle: document.getElementById('alert-title'),
  alertMessage: document.getElementById('alert-message'),
  alertRetry: document.getElementById('alert-retry'),
  alertDismiss: document.getElementById('alert-dismiss'),
  card: document.getElementById('weather-card'),
  cardBody: document.getElementById('weather-body'),
  cardMeta: document.getElementById('card-meta'),
  status: document.getElementById('sr-status'),
  toast: document.getElementById('toast'),
};

const viewer = createJsonViewer({
  tablist: document.getElementById('json-tabs'),
  panel: document.getElementById('json-panel'),
  code: document.getElementById('json-code'),
  statusEl: document.getElementById('json-status'),
  copyButton: document.getElementById('copy-button'),
});

// ---------- state ----------

const state = {
  seq: 0, // request sequence — only the newest request may render
  controller: null,
  current: null, // { city, data, raw } from the last successful response
  attempted: null, // city of the newest request (for Retry)
  lastError: null, // WeatherError from the newest failed request
};

// ---------- templates ----------

function conditionIconUrl(path) {
  if (typeof path !== 'string' || path === '') return '';
  let url = path.startsWith('//') ? `https:${path}` : path;
  // WeatherAPI serves 64px and 128px icons — take the sharper one for retina displays.
  url = url.replace('/64x64/', '/128x128/');
  return url;
}

function metricHtml(def) {
  return `
    <div class="metric">
      <div class="metric-head">
        <span class="metric-icon" aria-hidden="true">${def.icon}</span>
        <span class="metric-label">${escapeHtml(def.label)}</span>
      </div>
      <p class="metric-value">${def.value}${def.unit ? `<span class="metric-unit">${def.unit}</span>` : ''}</p>
      <div class="metric-meter" aria-hidden="true"><span style="width:${def.meter}%"></span></div>
      <p class="metric-sub">${escapeHtml(def.sub)}</p>
    </div>`;
}

function detailHtml(def) {
  return `<div class="detail"><dt>${escapeHtml(def.label)}</dt><dd>${def.value}</dd></div>`;
}

function weatherBodyHtml(data, { stale = false } = {}) {
  const loc = data.location ?? {};
  const cur = data.current ?? {};
  const conditionText = cur.condition?.text ?? '—';
  const personalityKey = getWeatherPersonality({
    tempC: cur.temp_c,
    windKph: cur.wind_kph,
    conditionText,
    conditionCode: cur.condition?.code,
  });
  const personality = PERSONALITIES[personalityKey] ?? PERSONALITIES['perfect-day'];
  const iconUrl = conditionIconUrl(cur.condition?.icon);
  const regionLine = [loc.region, loc.country].filter(Boolean).join(' · ');
  const stamp = cur.last_updated ?? loc.localtime;

  const metricDefs = [
    { label: 'Humidity', icon: ICONS.drop, value: round(cur.humidity), unit: '%', meter: meterPercent(cur.humidity, 100), sub: humidityLabel(cur.humidity) },
    { label: 'Wind', icon: ICONS.wind, value: round(cur.wind_kph), unit: 'km/h', meter: meterPercent(cur.wind_kph, 60), sub: windLabel(cur.wind_kph) },
    { label: 'UV index', icon: ICONS.uv, value: formatUv(cur.uv), unit: '', meter: meterPercent(cur.uv, 11), sub: uvCategory(cur.uv) },
  ];

  const detailDefs = [
    { label: 'Cloud coverage', value: `${round(cur.cloud)}%` },
    { label: 'Visibility', value: `${round1(cur.vis_km)} km` },
    { label: 'Pressure', value: `${round(cur.pressure_mb)} mb` },
    { label: 'Wind speed', value: `${round(cur.wind_kph)} km/h${cur.wind_dir ? ` · ${escapeHtml(cur.wind_dir)}` : ''}` },
    { label: 'Temperature (°F)', value: `${round(cur.temp_f)}°F` },
    { label: 'Last updated', value: `${escapeHtml(formatClock(stamp))} local` },
  ];

  return `
    ${stale ? `<p class="card-flag">${ICONS.clock} Showing the last successful reading for ${escapeHtml(loc.name ?? '')}</p>` : ''}
    <div class="weather-top">
      <div class="weather-loc">
        <h3 class="weather-city">${escapeHtml(loc.name ?? '—')}${loc.country ? `<span class="weather-country">, ${escapeHtml(loc.country)}</span>` : ''}</h3>
        ${regionLine ? `<p class="weather-region">${escapeHtml(regionLine)}</p>` : ''}
        <p class="weather-time">
          <span class="wt-icon" aria-hidden="true">${ICONS.clock}</span>
          <time datetime="${escapeHtml(String(loc.localtime ?? '')).replace(' ', 'T')}">${escapeHtml(formatClock(loc.localtime))}</time>
          ${loc.tz_id ? `<span class="tz-pill">${escapeHtml(loc.tz_id)}</span>` : ''}
        </p>
      </div>
      <div class="weather-now">
        ${iconUrl ? `<img class="condition-icon" src="${escapeHtml(iconUrl)}" alt="${escapeHtml(conditionText)}" width="72" height="72" loading="lazy">` : ''}
        <p class="weather-temp"><span class="temp-value">${round(cur.temp_c)}</span><span class="temp-unit">°C</span></p>
        <p class="weather-condition">${escapeHtml(conditionText)}</p>
        <p class="weather-feels">Feels like ${escapeHtml(celsiusText(cur.feelslike_c))}</p>
      </div>
    </div>
    <div class="personality">
      <span class="p-icon" aria-hidden="true">${TONE_ICONS[personality.tone] ?? ICONS.sparkles}</span>
      <div class="p-copy">
        <p class="p-title">${escapeHtml(personality.title)}</p>
        <p class="p-desc">${escapeHtml(personality.description)}</p>
      </div>
      <span class="p-note">App-generated read · not a real credit score</span>
    </div>
    <div class="metrics">
      ${metricDefs.map(metricHtml).join('')}
    </div>
    <dl class="details">
      ${detailDefs.map(detailHtml).join('')}
    </dl>`;
}

function skeletonHtml() {
  return `
    <div class="weather-top">
      <div class="weather-loc">
        <span class="skeleton sk-title"></span>
        <span class="skeleton sk-line w-55"></span>
        <span class="skeleton sk-line w-40"></span>
      </div>
      <div class="weather-now">
        <span class="skeleton sk-temp"></span>
        <span class="skeleton sk-line w-45"></span>
      </div>
    </div>
    <span class="skeleton sk-strip"></span>
    <div class="metrics">
      <span class="skeleton sk-metric"></span>
      <span class="skeleton sk-metric"></span>
      <span class="skeleton sk-metric"></span>
    </div>
    <span class="skeleton sk-line w-70"></span>`;
}

function errorCardBodyHtml(err) {
  return `
    <div class="weather-error">
      <p class="error-icon" aria-hidden="true">✕</p>
      <p class="error-title">${escapeHtml(err.title)}</p>
      <p class="error-message">${escapeHtml(err.message)}</p>
      ${err.retryable
        ? `<button type="button" class="retry-button" data-retry><span aria-hidden="true">${ICONS.retry}</span>Try again</button>`
        : '<p class="error-hint">Try searching for a different city above.</p>'}
    </div>`;
}

// ---------- rendering ----------

function announce(text) {
  els.status.textContent = text;
}

function buildChips() {
  els.chips.innerHTML = POPULAR_CITIES.map(
    (city) => `<button type="button" class="chip" data-city="${escapeHtml(city)}" aria-pressed="false">${escapeHtml(city)}</button>`
  ).join('');
}

function highlightChip(city) {
  const target = (city ?? '').trim().toLowerCase();
  els.chips.querySelectorAll('.chip').forEach((chip) => {
    const active = target !== '' && chip.dataset.city.toLowerCase() === target;
    chip.setAttribute('aria-pressed', String(active));
  });
}

function showFieldError(message) {
  els.fieldError.textContent = message;
  els.fieldError.hidden = false;
  els.input.setAttribute('aria-invalid', 'true');
  els.input.classList.add('is-invalid');
}

function clearFieldError() {
  els.fieldError.hidden = true;
  els.input.removeAttribute('aria-invalid');
  els.input.classList.remove('is-invalid');
}

function setLoadingUi(city) {
  els.alert.hidden = true;
  els.card.dataset.tone = 'neutral';
  els.card.setAttribute('aria-busy', 'true');
  els.cardBody.innerHTML = skeletonHtml();
  els.cardMeta.textContent = `Fetching ${city}…`;
  els.button.classList.add('is-loading');
  els.button.setAttribute('aria-busy', 'true');
  viewer.setLoading();
  highlightChip(city);
  announce(`Fetching weather for ${city}…`);
}

function currentTone() {
  if (!state.current) return 'neutral';
  const cur = state.current.data.current ?? {};
  const key = getWeatherPersonality({
    tempC: cur.temp_c,
    windKph: cur.wind_kph,
    conditionText: cur.condition?.text ?? '',
    conditionCode: cur.condition?.code,
  });
  return PERSONALITIES[key]?.tone ?? 'neutral';
}

function renderSuccess() {
  const { data, raw } = state.current;
  const cur = data.current ?? {};

  els.alert.hidden = true;
  els.card.setAttribute('aria-busy', 'false');
  els.card.dataset.tone = currentTone();
  els.cardBody.innerHTML = weatherBodyHtml(data);
  const stamp = cur.last_updated ?? data.location?.localtime;
  const tz = data.location?.tz_id;
  els.cardMeta.textContent = `Updated ${formatClock(stamp)}${tz ? ` · ${tz}` : ''}`;

  // FR-02: the search input retains the searched (canonical) city.
  els.input.value = data.location?.name ?? els.input.value;
  highlightChip(data.location?.name);

  els.button.classList.remove('is-loading');
  els.button.removeAttribute('aria-busy');
  viewer.setData(data, raw);
  announce(`${data.location?.name ?? 'City'} weather updated.`);
}

function showAlert(err) {
  els.alert.hidden = false;
  els.alert.dataset.kind = err.kind;
  els.alertTitle.textContent = err.title;
  els.alertMessage.textContent = err.message;
  els.alertRetry.hidden = !err.retryable;
}

function renderError() {
  const err = state.lastError;
  els.card.setAttribute('aria-busy', 'false');
  els.button.classList.remove('is-loading');
  els.button.removeAttribute('aria-busy');

  if (state.current) {
    // Keep the last valid reading visible (never blank, never incomplete data),
    // and make it obvious that it is not the failed search's result.
    els.card.dataset.tone = currentTone();
    els.cardBody.innerHTML = weatherBodyHtml(state.current.data, { stale: true });
    els.cardMeta.textContent = `Showing last reading · ${state.current.city}`;
    viewer.setData(state.current.data, state.current.raw); // restore the payload cleared during loading
  } else {
    els.card.dataset.tone = 'neutral';
    els.cardBody.innerHTML = errorCardBodyHtml(err);
    els.cardMeta.textContent = 'No data yet';
    viewer.setEmpty();
  }

  highlightChip(state.current?.city);
  showAlert(err);
  announce(`${err.title}. ${err.message}`);
}

// ---------- toast ----------

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => {
      els.toast.hidden = true;
    }, 250);
  }, 2200);
}

// ---------- request lifecycle ----------

/**
 * Maps a user-facing city label to the query actually sent to the API.
 * Popular-city names get an explicit country suffix when the API's geocoder
 * is ambiguous (e.g. bare "Delhi" resolves to Delhi, Ontario).
 */
function resolveQuery(label) {
  const city = (label ?? '').trim();
  if (!city) return '';
  const popular = POPULAR_CITIES.find((name) => name.toLowerCase() === city.toLowerCase());
  if (popular && POPULAR_CITY_QUERIES[popular]) return POPULAR_CITY_QUERIES[popular];
  return city;
}

async function requestWeather(city, { display = city } = {}) {
  state.seq += 1;
  const id = state.seq;

  // Abort any in-flight request so an older response can never overwrite a newer one (FR-08).
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  state.attempted = city;
  state.lastError = null;

  setLoadingUi(display);

  try {
    const result = await fetchWeather(city, controller.signal);
    if (id !== state.seq) return; // a newer request took over
    state.current = { city: result.data.location.name, data: result.data, raw: result.raw };
    state.lastError = null;
    renderSuccess();
  } catch (error) {
    if (id !== state.seq) return; // superseded — ignore
    if (error instanceof WeatherError) {
      state.lastError = error;
    } else {
      state.lastError = new WeatherError('generic', {
        title: 'Something went wrong',
        message: 'An unexpected error occurred while fetching the weather. Try again.',
        retryable: true,
      });
    }
    renderError();
  }
}

function handleSearch(rawQuery) {
  const city = (rawQuery ?? '').trim();
  if (!city) {
    // FR-02.4: empty input never triggers an API request.
    showFieldError('Type a city name first — the search can’t be empty.');
    els.input.focus();
    announce('Type a city name first.');
    return;
  }
  clearFieldError();
  requestWeather(resolveQuery(city), { display: city });
}

function retry() {
  const city = state.attempted ?? state.current?.city ?? resolveQuery(els.input.value);
  if (city) {
    clearFieldError();
    requestWeather(city, { display: els.input.value.trim() || city });
  }
}

// ---------- events ----------

function wireEvents() {
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSearch(els.input.value);
  });

  els.input.addEventListener('input', clearFieldError);

  els.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    const label = chip.dataset.city;
    els.input.value = label; // FR-03.3: sync the search input
    clearFieldError();
    requestWeather(resolveQuery(label), { display: label });
  });

  els.alertRetry.addEventListener('click', () => {
    els.alert.hidden = true;
    retry();
  });

  els.alertDismiss.addEventListener('click', () => {
    els.alert.hidden = true;
  });

  els.cardBody.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry]')) {
      els.alert.hidden = true;
      retry();
    }
  });

  document.getElementById('copy-button').addEventListener('click', async () => {
    const ok = await viewer.copyCurrent();
    toast(ok ? 'Copied to clipboard' : 'Copy isn’t available in this browser');
  });
}

// ---------- init (FR-01) ----------

buildChips();
wireEvents();
viewer.setLoading();
requestWeather(DEFAULT_CITY);
