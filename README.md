# What’s the Weather (SkyCred)

**Check the sky’s credit score before you step out.**

A lightweight, CRED-inspired current-conditions dashboard. Search any city, read the live
weather, and get a plain-English interpretation (“Freeze Frame”, “Rain Check”, “Sun Alert”…).
Built with vanilla HTML, CSS and JavaScript — no frameworks, no mock data. Live data comes
from [WeatherAPI.com](https://www.weatherapi.com/) through a serverless proxy.

## Live & local

| Where | How |
| --- | --- |
| **Production (Vercel)** | **https://credsky-gamma.vercel.app** — auto-deployed from this repo |
| **Local dev** | `npm install` *(no dependencies — optional)*, then `npm run dev` → http://localhost:3000 |
| **Unit tests** | `npm test` |

## How the key stays secret

The browser never sees the WeatherAPI key:

```
Browser  ──GET /api/weather?city=──▶  /api/weather (serverless, Vercel)
                                     WEATHER_API_KEY (env var / .env)
                                              │
                                              ▼
                                     api.weatherapi.com/v1/current.json
```

- `api/weather.js` — the proxy (validates input, calls WeatherAPI, passes status + body through untouched).
- `server.js` — the same proxy + static file server for local development.
- The key lives in `.env` locally (git-ignored) and in the `WEATHER_API_KEY` environment variable on Vercel.

## Project structure

```
index.html            markup (kept free of any weather values)
css/styles.css        all styling — CRED-inspired dark UI
js/config.js          default city + popular-city list
js/personality.js     weather interpretation rules (thresholds + priority order)
js/format.js          pure formatting helpers (times, units, derived labels)
js/api.js             browser client: fetch, validation, error mapping
js/json-viewer.js     API response viewer: Formatted/Raw tabs + copy
js/app.js             request lifecycle, rendering, events
api/weather.js        serverless proxy (Vercel)
server.js             local dev server (static + same proxy)
tests/logic.test.js   unit tests for interpretation + proxy logic
```

## Weather interpretation (FR-05)

`getWeatherPersonality({ tempC, windKph, conditionText, conditionCode })` uses temperature,
condition and wind speed. **Priority order when several conditions match:**

1. **Freeze Frame** — `temp ≤ 8 °C` (even if raining/windy)
2. **Rain Check** — rainy/drizzly/thunder/snow condition (WeatherAPI code or text), even when very hot
3. **Sun Alert** — `temp ≥ 35 °C`
4. **Breezy Mode** — `wind ≥ 25 km/h`
5. **Perfect Day** — everything else

The strip in the card always notes that this read is app-generated, not a real credit score.

## Error handling (FR-08)

| Scenario | Behaviour |
| --- | --- |
| Empty input | inline validation, no API call |
| Unknown city | “City not found” alert (API code `1006`) |
| Invalid/missing API key | API-configuration alert (codes `1002/2006/…`) |
| Rate limit (429) | “Weather service is busy” + Retry |
| Offline / network error | connectivity alert + Retry |
| 5xx / timeout | “Weather service unavailable” + Retry |
| Malformed payload | “Unexpected response”, previous valid data kept |
| Slow response | skeleton + button spinner immediately |
| Stale races | newer request aborts the older one; only the newest response may render |
| Failure after a success | previous card stays visible, marked *“showing the last successful reading”* |

## Deploy to Vercel

```bash
npm i -g vercel
vercel link
vercel env add WEATHER_API_KEY production   # paste the WeatherAPI.com key
vercel deploy --prod
```

When the project's Git Integration is connected to this GitHub repository,
Vercel deploys every push to `main` automatically. A CI-driven alternative
(with tests before deploy) lives in [`docs/deploy-workflow.example.yml`](docs/deploy-workflow.example.yml).

## Data sources

- Weather: `GET https://api.weatherapi.com/v1/current.json` (`key`, `q` params, `aqi=no`)
- Weather icons: `current.condition.icon` from the same response
