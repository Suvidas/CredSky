// App-wide constants. Weather values never live here — only configuration.

export const API_BASE = 'https://api.weatherapi.com/v1';

export const DEFAULT_CITY = 'Mumbai';

export const POPULAR_CITIES = [
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
];

/**
 * Names that WeatherAPI resolves to the wrong place on their own.
 * Bare "Delhi" resolves to Delhi, Ontario, Canada, so we disambiguate it.
 * Keys are lower-case; the search box keeps showing what the user typed.
 */
export const CITY_QUERY_OVERRIDES = {
  delhi: 'Delhi, India',
};

/** Abort a request that takes longer than this. */
export const REQUEST_TIMEOUT_MS = 15000;

/** After this long, the loading state tells the user the service is slow. */
export const SLOW_REQUEST_MS = 4000;
