// Turns raw conditions into a "sky verdict". Pure function — easy to test and extend.
//
// Inputs used: temperature (temp_c), condition code (current.condition.code) and wind (wind_kph).
//
// Priority order when conditions overlap (first match wins):
//   1. Rain Check   – any rain, drizzle, shower or thunder condition code
//   2. Freeze Frame – temp_c <= 10 °C, or any snow / sleet / ice condition code
//   3. Sun Alert    – temp_c >= 35 °C
//   4. Breezy Mode  – wind_kph >= 30 km/h
//   5. Perfect Day  – 18 °C <= temp_c < 30 °C (and none of the above)
//   6. Warm Spell   – 30 °C <= temp_c < 35 °C
//   7. Crisp Air    – 10 °C < temp_c < 18 °C
//
// Why this order: getting wet or dangerously cold/hot changes what you carry or wear more
// than wind does; wind only matters once temperature and precipitation are safe.

export const THRESHOLDS = Object.freeze({
  FREEZE_MAX_C: 10,
  PLEASANT_MIN_C: 18,
  WARM_MIN_C: 30,
  HOT_MIN_C: 35,
  WINDY_MIN_KPH: 30,
});

// WeatherAPI condition codes: https://www.weatherapi.com/docs/weather_conditions.json
const RAIN_CODES = new Set([
  1063, 1087, 1150, 1153, 1180, 1183, 1186, 1189, 1192, 1195,
  1240, 1243, 1246, 1273, 1276,
]);
const FREEZE_CODES = new Set([
  1066, 1069, 1072, 1114, 1117, 1168, 1171, 1198, 1201, 1204, 1207,
  1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258,
  1261, 1264, 1279, 1282,
]);

const PERSONALITIES = {
  rain: {
    id: 'rain', tone: 'rain', emoji: '☔', badge: 'Wet',
    title: 'Rain Check',
    description: 'Carry an umbrella before stepping out.',
  },
  freeze: {
    id: 'freeze', tone: 'freeze', emoji: '🥶', badge: 'Cold',
    title: 'Freeze Frame',
    description: 'Bone-chilling cold. Bundle up tight.',
  },
  sun: {
    id: 'sun', tone: 'sun', emoji: '🔥', badge: 'Hot',
    title: 'Sun Alert',
    description: 'Stay hydrated and avoid excessive sun exposure.',
  },
  breezy: {
    id: 'breezy', tone: 'breezy', emoji: '🌬️', badge: 'Windy',
    title: 'Breezy Mode',
    description: 'Expect strong winds. Dress accordingly.',
  },
  perfect: {
    id: 'perfect', tone: 'perfect', emoji: '😎', badge: 'Excellent',
    title: 'Perfect Day',
    description: 'Great weather to step outside.',
  },
  warm: {
    id: 'warm', tone: 'warm', emoji: '🌤️', badge: 'Warm',
    title: 'Warm Spell',
    description: 'Warm out there. Wear light clothes and keep water handy.',
  },
  crisp: {
    id: 'crisp', tone: 'crisp', emoji: '🧥', badge: 'Cool',
    title: 'Crisp Air',
    description: 'A little nippy. A light jacket will do.',
  },
};

export function getWeatherPersonality(current) {
  const t = current.temp_c;
  const wind = current.wind_kph;
  const code = current.condition?.code;
  const T = THRESHOLDS;

  let key;
  if (RAIN_CODES.has(code)) key = 'rain';
  else if (t <= T.FREEZE_MAX_C || FREEZE_CODES.has(code)) key = 'freeze';
  else if (t >= T.HOT_MIN_C) key = 'sun';
  else if (wind >= T.WINDY_MIN_KPH) key = 'breezy';
  else if (t >= T.PLEASANT_MIN_C && t < T.WARM_MIN_C) key = 'perfect';
  else if (t >= T.WARM_MIN_C) key = 'warm';
  else key = 'crisp';

  return {
    ...PERSONALITIES[key],
    basis: `Based on ${t}°C, ${current.condition.text.trim().toLowerCase()} and ${wind} km/h wind.`,
  };
}
