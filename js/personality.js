// Weather "personality" — an app-generated interpretation of current conditions.
// FR-05 note: this is not a real credit score, just a plain-English read on the sky.
//
// Priority order when several conditions match at once (first match wins):
//   1. Freeze Frame — very cold, even if it is also raining or windy
//   2. Rain Check   — rain / drizzle / thunder / snow, even when it is very hot
//   3. Sun Alert    — very hot
//   4. Breezy Mode  — strong wind
//   5. Perfect Day  — everything else (pleasant)

export const THRESHOLDS = Object.freeze({
  veryColdMaxC: 8, // ≤ 8 °C counts as very cold
  veryHotMinC: 35, // ≥ 35 °C counts as very hot
  windyMinKph: 25, // ≥ 25 km/h counts as windy
});

export const PERSONALITIES = Object.freeze({
  'freeze-frame': { title: 'Freeze Frame', description: 'Bone-chilling cold. Bundle up tight.', tone: 'freeze' },
  'rain-check': { title: 'Rain Check', description: 'Carry an umbrella before stepping out.', tone: 'rain' },
  'sun-alert': { title: 'Sun Alert', description: 'Stay hydrated and avoid excessive sun exposure.', tone: 'sun' },
  'breezy-mode': { title: 'Breezy Mode', description: 'Expect strong winds. Dress accordingly.', tone: 'breeze' },
  'perfect-day': { title: 'Perfect Day', description: 'Great weather to step outside.', tone: 'perfect' },
});

// WeatherAPI condition codes that mean "wet weather is happening or imminent".
const PRECIPITATION_CODES = new Set([
  1063, 1066, 1069, 1072, 1087, 1114, 1117,
  1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201,
  1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237,
  1240, 1243, 1246, 1249, 1252, 1255, 1258, 1261, 1264,
  1273, 1276, 1279, 1282,
]);

const PRECIPITATION_PATTERN = /rain|drizzle|shower|thunder|snow|sleet|blizzard|freezing|ice pellet/i;

export function getWeatherPersonality({ tempC, windKph, conditionText = '', conditionCode } = {}) {
  if (Number.isFinite(tempC) && tempC <= THRESHOLDS.veryColdMaxC) return 'freeze-frame';
  const rainyByCode = Number.isFinite(conditionCode) && PRECIPITATION_CODES.has(conditionCode);
  if (rainyByCode || PRECIPITATION_PATTERN.test(conditionText)) return 'rain-check';
  if (Number.isFinite(tempC) && tempC >= THRESHOLDS.veryHotMinC) return 'sun-alert';
  if (Number.isFinite(windKph) && windKph >= THRESHOLDS.windyMinKph) return 'breezy-mode';
  return 'perfect-day';
}
