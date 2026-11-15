// Orchestration: state, events and the request lifecycle.

import { CITY_QUERY_OVERRIDES, DEFAULT_CITY, POPULAR_CITIES, SLOW_REQUEST_MS } from './constants.js';
import { fetchCurrentWeather } from './api.js';
import { getWeatherPersonality } from './personality.js';
import * as ui from './ui.js';

const { els } = ui;

const state = {
  requestId: 0,          // increments per request; only the latest may render
  controller: null,      // AbortController of the in-flight request
  lastQuery: DEFAULT_CITY,
  lastGood: null,        // { data, raw, query } of the most recent successful response
  jsonView: 'formatted', // 'formatted' | 'raw'
};

const normalise = (s) => s.trim().replace(/\s+/g, ' ');

async function loadWeather(input) {
  const city = normalise(input);
  if (!city) {
    ui.showValidation('Please enter a city name to search.');
    els.input.focus();
    return;
  }
  ui.clearValidation();

  // Cancel the previous request and claim a new id so late responses are ignored.
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const id = ++state.requestId;
  const isLatest = () => id === state.requestId;

  state.lastQuery = city;
  ui.setSearchValue(city);
  ui.setSelectedChip(city);
  ui.showLoading(city);
  const slowTimer = setTimeout(() => { if (isLatest()) ui.markSlow(); }, SLOW_REQUEST_MS);

  try {
    const apiQuery = CITY_QUERY_OVERRIDES[city.toLowerCase()] || city;
    const result = await fetchCurrentWeather(apiQuery, { signal: controller.signal });
    if (!isLatest()) return;
    state.lastGood = { ...result, query: city, apiQuery };
    showResult(state.lastGood);
  } catch (err) {
    if (!isLatest() || err.kind === 'aborted') return;
    console.warn('[weather]', err.kind, err.message, err.detail);
    ui.showError(err, { city, lastCity: state.lastGood?.data.location.name });
  } finally {
    clearTimeout(slowTimer);
    if (isLatest()) state.controller = null;
  }
}

function showResult(result) {
  const personality = getWeatherPersonality(result.data.current);
  ui.renderWeather(result, personality);
  ui.renderJson(state.jsonView, result);
}

function restoreLastGood() {
  if (!state.lastGood) return;
  state.controller?.abort();
  state.requestId++; // invalidate anything still in flight
  state.lastQuery = state.lastGood.query;
  ui.setSearchValue(state.lastGood.query);
  ui.setSelectedChip(state.lastGood.query);
  ui.clearValidation();
  showResult(state.lastGood);
}

function setJsonView(view) {
  state.jsonView = view;
  ui.renderJson(view, state.lastGood);
}

async function copyJson() {
  const textToCopy = ui.jsonTextFor(state.jsonView, state.lastGood);
  if (!textToCopy) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(textToCopy);
    ok = true;
  } catch {
    // Fallback for browsers / contexts without the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  ui.flashCopy(ok);
}

function bindEvents() {
  els.form.addEventListener('submit', (e) => {
    e.preventDefault(); // Enter key and the Search button both submit the form
    loadWeather(els.input.value);
  });

  els.input.addEventListener('input', () => {
    if (els.form.classList.contains('has-error') && els.input.value.trim()) ui.clearValidation();
  });

  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) loadWeather(chip.dataset.city);
  });

  els.retryBtn.addEventListener('click', () => loadWeather(state.lastQuery));
  els.restoreBtn.addEventListener('click', restoreLastGood);

  els.tabFormatted.addEventListener('click', () => setJsonView('formatted'));
  els.tabRaw.addEventListener('click', () => setJsonView('raw'));
  // Arrow-key navigation between tabs (WAI-ARIA tabs pattern).
  for (const tab of [els.tabFormatted, els.tabRaw]) {
    tab.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = state.jsonView === 'formatted' ? 'raw' : 'formatted';
      const target = e.key === 'Home' ? 'formatted' : e.key === 'End' ? 'raw' : next;
      setJsonView(target);
      (target === 'formatted' ? els.tabFormatted : els.tabRaw).focus();
    });
  }

  els.copyBtn.addEventListener('click', copyJson);
}

function init() {
  ui.renderChips(POPULAR_CITIES);
  bindEvents();
  loadWeather(DEFAULT_CITY);
}

init();
