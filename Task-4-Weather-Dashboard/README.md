# Skyline – Live Weather Dashboard

A vanilla HTML/CSS/JavaScript weather app that fetches real-time temperature,
weather icons and a 5-day forecast for any city.

## Run it
Open `index.html` in a browser (an internet connection is required).
Optional: serve the folder with VS Code "Live Server" or `python3 -m http.server`.

## APIs (free, no API key)
- Geocoding: https://geocoding-api.open-meteo.com/v1/search
- Forecast:  https://api.open-meteo.com/v1/forecast

## Requirements covered
| Requirement | Where |
|---|---|
| fetch + async/await | `fetchJSON`, `geocode`, `getForecast`, `searchCity` in `script.js` |
| Dynamic DOM injection | `h()` element builder, `renderWeather`, `renderLoading`, `renderError`, `renderEmpty` |
| Input validation | `validateQuery` (empty, too short/long, invalid characters) |
| Error states | city not found, offline, timeout, server error, blocked location |
| Weather icons | inline SVG set mapped from WMO weather codes (`describe`, `ICONS`) |
| 5-day forecast | `data.daily` rendered as rows with a min/max range bar |

## Extras
- Background sky changes with conditions and day/night
- °C / °F toggle (converts locally, no extra request)
- Recent searches and unit saved in localStorage
- "Use my location" button (Geolocation API)
- Alternative matches (e.g. Paris, Texas) and "Paris, France" style queries
- Cancels outdated requests with AbortController, 10 s timeout

## Files
- `index.html`  page structure
- `style.css`   layout, themes, responsive rules
- `script.js`   all logic
