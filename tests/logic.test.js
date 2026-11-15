// Unit tests for the pure logic: weather personality thresholds (FR-05),
// city normalisation (FR-10) and the proxy behaviour (FR-08, FR-10).
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { getWeatherPersonality, PERSONALITIES, THRESHOLDS } from '../js/personality.js';
import { normalizeCity, proxyWeather } from '../api/weather.js';

test('every personality copy matches the PRD', () => {
  assert.deepEqual(PERSONALITIES['freeze-frame'], {
    title: 'Freeze Frame', description: 'Bone-chilling cold. Bundle up tight.', tone: 'freeze',
  });
  assert.deepEqual(PERSONALITIES['perfect-day'], {
    title: 'Perfect Day', description: 'Great weather to step outside.', tone: 'perfect',
  });
  assert.deepEqual(PERSONALITIES['sun-alert'], {
    title: 'Sun Alert', description: 'Stay hydrated and avoid excessive sun exposure.', tone: 'sun',
  });
  assert.deepEqual(PERSONALITIES['rain-check'], {
    title: 'Rain Check', description: 'Carry an umbrella before stepping out.', tone: 'rain',
  });
  assert.deepEqual(PERSONALITIES['breezy-mode'], {
    title: 'Breezy Mode', description: 'Expect strong winds. Dress accordingly.', tone: 'breeze',
  });
});

test('thresholds are defined', () => {
  assert.equal(THRESHOLDS.veryColdMaxC, 8);
  assert.equal(THRESHOLDS.veryHotMinC, 35);
  assert.equal(THRESHOLDS.windyMinKph, 25);
});

test('very cold → Freeze Frame, even while raining or windy', () => {
  assert.equal(getWeatherPersonality({ tempC: 2, windKph: 40, conditionText: 'Light rain', conditionCode: 1183 }), 'freeze-frame');
  assert.equal(getWeatherPersonality({ tempC: THRESHOLDS.veryColdMaxC }), 'freeze-frame');
});

test('rainy → Rain Check, even when it is very hot', () => {
  assert.equal(getWeatherPersonality({ tempC: 40, windKph: 5, conditionText: 'Moderate rain', conditionCode: 1189 }), 'rain-check');
  assert.equal(getWeatherPersonality({ tempC: 20, conditionText: 'Patchy rain nearby' }), 'rain-check');
  assert.equal(getWeatherPersonality({ tempC: 20, conditionText: 'Thunder showers' }), 'rain-check');
  assert.equal(getWeatherPersonality({ tempC: 20, conditionText: 'Light snow' }), 'rain-check');
  assert.equal(getWeatherPersonality({ tempC: 20, windKph: 40, conditionCode: 1063, conditionText: 'Patchy rain possible' }), 'rain-check');
});

test('very hot → Sun Alert', () => {
  assert.equal(getWeatherPersonality({ tempC: 41, windKph: 5, conditionText: 'Sunny' }), 'sun-alert');
  assert.equal(getWeatherPersonality({ tempC: THRESHOLDS.veryHotMinC, conditionText: 'Clear' }), 'sun-alert');
});

test('windy → Breezy Mode (dry, mild, strong wind)', () => {
  assert.equal(getWeatherPersonality({ tempC: 20, windKph: 40, conditionText: 'Windy' }), 'breezy-mode');
  assert.equal(getWeatherPersonality({ tempC: 20, windKph: THRESHOLDS.windyMinKph, conditionText: 'Clear' }), 'breezy-mode');
});

test('pleasant conditions → Perfect Day', () => {
  assert.equal(getWeatherPersonality({ tempC: 24, windKph: 8, conditionText: 'Sunny' }), 'perfect-day');
  assert.equal(getWeatherPersonality({ tempC: 18, windKph: 12, conditionText: 'Partly cloudy' }), 'perfect-day');
  assert.equal(getWeatherPersonality({ tempC: 31.1, windKph: 9, conditionText: 'Smoky haze', conditionCode: 1036 }), 'perfect-day');
});

test('normalizeCity trims, rejects empties, scripts and overlong input', () => {
  assert.equal(normalizeCity('  Mumbai  '), 'Mumbai');
  assert.equal(normalizeCity('St. John’s'), 'St. John’s');
  assert.equal(normalizeCity(''), '');
  assert.equal(normalizeCity('   '), '');
  assert.equal(normalizeCity(null), '');
  assert.equal(normalizeCity('<script>alert(1)</script>'), '');
  assert.equal(normalizeCity('x'.repeat(121)), '');
  assert.equal(normalizeCity('Mumbai '.repeat(30)), '');
});

test('proxy rejects non-GET requests', async () => {
  const result = await proxyWeather({ method: 'POST', city: 'Mumbai', apiKey: 'k' });
  assert.equal(result.status, 405);
});

test('proxy rejects an empty/invalid city without calling upstream', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { status: 200, text: async () => '{}' }; };
  for (const city of ['', '   ', '<script>', 'x'.repeat(500)]) {
    const result = await proxyWeather({ city, apiKey: 'k', fetchImpl });
    assert.equal(result.status, 400);
    assert.equal(JSON.parse(result.body).error.code, 'invalid_city');
  }
  assert.equal(called, false);
});

test('proxy reports a config error when the key is missing', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { status: 200, text: async () => '{}' }; };
  const result = await proxyWeather({ city: 'Mumbai', apiKey: '', fetchImpl });
  assert.equal(result.status, 500);
  assert.equal(JSON.parse(result.body).error.code, 'config');
  assert.equal(called, false);
});

test('proxy passes the upstream status and raw body through untouched', async () => {
  const fetchImpl = async () => ({ status: 200, text: async () => '{"location":{"name":"Mumbai"},"current":{"temp_c":31.1}}' });
  const result = await proxyWeather({ city: 'Mumbai', apiKey: 'k', fetchImpl });
  assert.equal(result.status, 200);
  assert.equal(result.body, '{"location":{"name":"Mumbai"},"current":{"temp_c":31.1}}');
});

test('proxy forwards upstream error statuses (invalid key, unknown city, rate limit)', async () => {
  const fetchImpl = async (url) => ({
    status: url.includes('q=Nowhere') ? 400 : 401,
    text: async () => (url.includes('q=Nowhere')
      ? '{"error":{"code":1006,"message":"No matching location found."}}'
      : '{"error":{"code":2006,"message":"API key is invalid."}}'),
  });
  assert.equal((await proxyWeather({ city: 'Nowhere', apiKey: 'k', fetchImpl })).status, 400);
  assert.equal((await proxyWeather({ city: 'Mumbai', apiKey: 'k', fetchImpl })).status, 401);
});

test('proxy maps an upstream timeout to 504', async () => {
  // A fake fetch that never settles but honours the abort signal (like the real one).
  const fetchImpl = (url, { signal } = {}) => new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason));
  });
  const result = await proxyWeather({ city: 'Mumbai', apiKey: 'k', fetchImpl, timeoutMs: 30 });
  assert.equal(result.status, 504);
  assert.equal(JSON.parse(result.body).error.code, 'upstream_timeout');
});

test('proxy maps network failure to 502', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const result = await proxyWeather({ city: 'Mumbai', apiKey: 'k', fetchImpl });
  assert.equal(result.status, 502);
  assert.equal(JSON.parse(result.body).error.code, 'network');
});
