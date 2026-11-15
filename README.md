# What's the Weather

> Check the sky's credit score before you step out.

A lightweight weather app: search any city (or pick a popular one), see live current conditions from
[WeatherAPI.com](https://www.weatherapi.com/), and get a plain-language **sky verdict** on whether it's a good time to step out.

Plain HTML, CSS and vanilla JavaScript (ES modules). No framework, no runtime dependencies.

## Run locally

```bash
cp .env.example .env        # then put your WeatherAPI key in .env
npm run dev                 # builds to dist/ and serves http://localhost:5173
```

`npm run build` only builds. Node 18+ is required.

## How the API key is handled

- The key lives in `.env` locally (git-ignored) and in the **`WEATHER_API_KEY` environment variable** on Vercel.
- `build.js` copies `src/` to `dist/` and writes `dist/js/config.js` with the key at build time.
- **The key is not a secret.** It ships to the browser and is visible in network requests, as with any frontend-only app.
  Restrict it in the WeatherAPI dashboard. Hiding it fully would need a backend proxy, which is out of scope for this release.

## Project structure

```
src/
  index.html          markup for every state (loading, error, data)
  css/styles.css      all styles, responsive breakpoints at 900 / 640 / 420 px
  js/constants.js     default city, popular cities, query overrides, timeouts
  js/api.js           WeatherAPI client: timeout, error classification, payload validation
  js/personality.js   sky verdict rules (pure function)
  js/ui.js            DOM rendering for each state and the JSON viewer
  js/app.js           state, events, request lifecycle (cancels stale requests)
build.js              static build + key injection
dev.js                zero-dependency local server
vercel.json           build command and output directory for Vercel
```

## Sky verdict rules (FR-05)

Inputs: temperature (`temp_c`), condition code (`condition.code`) and wind (`wind_kph`). First match wins:

| Priority | Verdict      | Rule                                                   | Message |
|---------:|--------------|--------------------------------------------------------|---------|
| 1 | Rain Check   | rain, drizzle, shower or thunder condition code        | Carry an umbrella before stepping out. |
| 2 | Freeze Frame | `temp_c <= 10` or snow / sleet / ice condition code    | Bone-chilling cold. Bundle up tight. |
| 3 | Sun Alert    | `temp_c >= 35`                                         | Stay hydrated and avoid excessive sun exposure. |
| 4 | Breezy Mode  | `wind_kph >= 30`                                       | Expect strong winds. Dress accordingly. |
| 5 | Perfect Day  | `18 <= temp_c < 30`                                    | Great weather to step outside. |
| 6 | Warm Spell   | `30 <= temp_c < 35`                                    | Warm out there. Wear light clothes and keep water handy. |
| 7 | Crisp Air    | `10 < temp_c < 18`                                     | A little nippy. A light jacket will do. |

Warm Spell and Crisp Air fill the temperature gaps the PRD's examples leave, so every response gets a verdict.
The verdict is an app-generated interpretation, not a real credit score.

## Error handling (FR-08)

| Scenario | Detected by | Shown |
|---|---|---|
| Empty input | trimmed input is empty | inline validation, no request |
| Invalid city | WeatherAPI code 1006 | "City not found" |
| Invalid / disabled key | codes 1002, 2006, 2008, 2009 or HTTP 401/403 | "API configuration error" |
| Rate limit | code 2007 or HTTP 429 | "Service temporarily busy" + Retry |
| No internet | `fetch` rejects | "No connection" + Retry |
| Server down | HTTP 5xx or code 9999 | "Weather service unavailable" + Retry |
| Slow response | > 4 s | loading state says the service is slow; aborts at 15 s with "Taking too long" + Retry |
| Unexpected / incomplete response | invalid JSON or missing fields | "Something went wrong" + Retry |

On any error the previous result is kept in memory (never overwritten) and offered as **Back to {city}**.
Each request gets an id and aborts the previous one, so a late response can never overwrite a newer search.

## Known data quirk

WeatherAPI resolves a bare `q=Delhi` to **Delhi, Ontario, Canada**. `CITY_QUERY_OVERRIDES` in `constants.js` sends
`Delhi, India` instead, for both the chip and a typed "Delhi". The search box still shows "Delhi".

## Out of scope (per PRD)

Accounts, database, profiles, history, forecasts, notifications, payments, admin, backend services.
