// Product configuration — the only place app-level constants live.

// FR-01.1: Mumbai is the default city.
export const DEFAULT_CITY = 'Mumbai';

// FR-03: the predefined popular-city shortcuts.
export const POPULAR_CITIES = Object.freeze([
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Ahmedabad',
  'New York',
  'London',
]);

// The API geocoder resolves bare "Delhi" to Delhi, Ontario (Canada).
// These queries only disambiguate WHICH city — no weather values are involved.
// Used for popular-city clicks and for typed searches that match a popular city.
export const POPULAR_CITY_QUERIES = Object.freeze({
  Delhi: 'Delhi, India',
});
