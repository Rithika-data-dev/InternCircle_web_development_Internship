/* =========================================================
   Skyline – Live Weather Dashboard
   Data: Open-Meteo (free, no API key)
     - Geocoding: city name  -> latitude / longitude
     - Forecast : coordinates -> current weather + 5-day daily
   Concepts: fetch + async/await, AbortController, error
   handling, input validation, dynamic DOM injection.
   ========================================================= */

"use strict";

/* ---------- Config ---------- */
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RECENT = 5;
const SUGGESTIONS = ["London", "Tokyo", "New York", "Sydney"];

/* ---------- DOM references ---------- */
const form = document.getElementById("search-form");
const input = document.getElementById("city-input");
const fieldError = document.getElementById("field-error");
const locateBtn = document.getElementById("locate-btn");
const recentEl = document.getElementById("recent");
const view = document.getElementById("view");
const unitButtons = document.querySelectorAll(".unit-toggle button");

/* ---------- App state ---------- */
const state = {
  unit: load("skyline.unit", "c"),
  recent: load("skyline.recent", []),
  place: null,     // { name, admin1, country, latitude, longitude }
  data: null,      // raw forecast JSON (always in °C / km/h)
  others: [],      // other geocoding matches for the same query
};

let activeController = null; // lets us cancel an in-flight request
let requestId = 0;           // ignores results from outdated requests

/* =========================================================
   Small helpers
   ========================================================= */

/** Safe localStorage read (storage can be blocked). */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore: app still works without persistence */
  }
}

/** Tiny element builder: h("div", {class: "x"}, "text", childNode) */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}

const toUnit = (celsius) => Math.round(state.unit === "f" ? (celsius * 9) / 5 + 32 : celsius);
const toWind = (kmh) => Math.round(state.unit === "f" ? kmh * 0.621371 : kmh);
const windUnit = () => (state.unit === "f" ? "mph" : "km/h");

/** "2026-10-20" -> Date in local time (avoids the UTC off-by-one bug). */
function parseDay(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/* =========================================================
   Validation
   ========================================================= */

/** Returns an error message, or null when the query is valid. */
function validateQuery(raw) {
  const q = raw.trim();
  if (!q) return "Enter a city name to search.";
  if (q.length < 2) return "Use at least 2 characters.";
  if (q.length > 60) return "That name is too long. Keep it under 60 characters.";
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’,-]*$/u.test(q)) {
    return "Use letters, spaces, hyphens or apostrophes only. Numbers and symbols aren't allowed.";
  }
  return null;
}

function showFieldError(message) {
  fieldError.textContent = message;
  fieldError.hidden = false;
  input.setAttribute("aria-invalid", "true");
}

function clearFieldError() {
  fieldError.hidden = true;
  fieldError.textContent = "";
  input.removeAttribute("aria-invalid");
}

/* =========================================================
   Network layer (fetch + async/await)
   ========================================================= */

class AppError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "not-found" | "network" | "server" | "timeout"
  }
}

/** fetch wrapper with timeout, cancellation and clear error types. */
async function fetchJSON(url, signal) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal.addEventListener("abort", onAbort);

  try {
    const response = await fetch(url, { signal: timeout.signal });
    if (!response.ok) {
      throw new AppError("server", `The weather service returned an error (${response.status}).`);
    }
    return await response.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === "AbortError") {
      if (signal.aborted) throw err; // cancelled by us, not a failure
      throw new AppError("timeout", "The request took too long. Check your connection and try again.");
    }
    throw new AppError("network", "Couldn't reach the weather service. Check your internet connection.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** City name -> list of matching places. */
async function geocode(query, signal) {
  // Support "Paris, France": search the first part, use the rest as a hint.
  const [name, ...hintParts] = query.split(",");
  const hint = hintParts.join(" ").trim().toLowerCase();

  const url = `${GEO_URL}?name=${encodeURIComponent(name.trim())}&count=5&language=en&format=json`;
  const json = await fetchJSON(url, signal);
  let results = json.results ?? [];

  if (hint && results.length) {
    const filtered = results.filter((r) =>
      [r.country, r.admin1, r.country_code].some((f) => f && f.toLowerCase().includes(hint))
    );
    if (filtered.length) results = filtered;
  }

  if (!results.length) {
    throw new AppError("not-found", `No city found for “${query}”. Check the spelling or try a nearby city.`);
  }
  return results;
}

/** Coordinates -> current conditions + 5-day forecast (always metric). */
async function getForecast(latitude, longitude, signal) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: 5,
    timezone: "auto",
  });
  return fetchJSON(`${WEATHER_URL}?${params}`, signal);
}

/* =========================================================
   Controller: orchestrates a search
   ========================================================= */

/** Starts a new request, cancelling any previous one. */
function beginRequest() {
  if (activeController) activeController.abort();
  activeController = new AbortController();
  requestId += 1;
  return { signal: activeController.signal, id: requestId };
}

function setBusy(busy) {
  view.setAttribute("aria-busy", String(busy));
  form.querySelector('button[type="submit"]').disabled = busy;
  locateBtn.disabled = busy;
}

async function searchCity(query) {
  const { signal, id } = beginRequest();
  setBusy(true);
  renderLoading();

  try {
    const matches = await geocode(query, signal);
    if (id !== requestId) return;
    await loadPlace(matches[0], matches.slice(1), signal, id);
    rememberCity(matches[0].name);
  } catch (err) {
    handleError(err, id);
  } finally {
    if (id === requestId) setBusy(false);
  }
}

async function loadPlace(place, others, signal, id) {
  const data = await getForecast(place.latitude, place.longitude, signal);
  if (id !== requestId) return; // a newer search replaced this one
  state.place = place;
  state.data = data;
  state.others = others;
  renderWeather();
}

/** User clicked an alternative match (e.g. Paris, Texas). */
async function pickMatch(place) {
  const others = [state.place, ...state.others].filter((p) => p.id !== place.id);
  const { signal, id } = beginRequest();
  setBusy(true);
  renderLoading();
  try {
    await loadPlace(place, others, signal, id);
  } catch (err) {
    handleError(err, id);
  } finally {
    if (id === requestId) setBusy(false);
  }
}

function useMyLocation() {
  clearFieldError();
  if (!("geolocation" in navigator)) {
    showFieldError("Your browser doesn't support location lookup. Search for a city instead.");
    return;
  }
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const { signal, id } = beginRequest();
      setBusy(true);
      renderLoading();
      try {
        const place = {
          id: "geo",
          name: "Your location",
          admin1: "",
          country: `${coords.latitude.toFixed(2)}°, ${coords.longitude.toFixed(2)}°`,
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        await loadPlace(place, [], signal, id);
      } catch (err) {
        handleError(err, id);
      } finally {
        if (id === requestId) setBusy(false);
      }
    },
    (err) => {
      locateBtn.disabled = false;
      showFieldError(
        err.code === err.PERMISSION_DENIED
          ? "Location access was blocked. Allow it in your browser settings, or search for a city."
          : "Couldn't get your location. Search for a city instead."
      );
      if (!state.data) renderEmpty();
    },
    { timeout: 10000 }
  );
}

function handleError(err, id) {
  if (err.name === "AbortError" || id !== requestId) return; // superseded request
  const titles = {
    "not-found": "City not found",
    network: "You seem to be offline",
    timeout: "That took too long",
    server: "Weather service problem",
  };
  renderError(titles[err.kind] ?? "Something went wrong", err.message ?? "Please try again.");
}

/* ---------- Recent searches ---------- */
function rememberCity(name) {
  state.recent = [name, ...state.recent.filter((c) => c.toLowerCase() !== name.toLowerCase())].slice(0, MAX_RECENT);
  save("skyline.recent", state.recent);
  renderRecent();
}

/* =========================================================
   Weather codes -> label, icon, sky theme
   (WMO codes used by Open-Meteo)
   ========================================================= */

function describe(code, isDay = 1) {
  const day = Boolean(isDay);
  if (code === 0) return { label: "Clear sky", icon: day ? "sun" : "moon", sky: day ? "clear-day" : "clear-night" };
  if (code === 1) return { label: "Mostly clear", icon: day ? "sun" : "moon", sky: day ? "clear-day" : "clear-night" };
  if (code === 2) return { label: "Partly cloudy", icon: day ? "partly-day" : "partly-night", sky: "cloudy" };
  if (code === 3) return { label: "Overcast", icon: "cloud", sky: "cloudy" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "fog", sky: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "rain", sky: "rain" };
  if (code >= 61 && code <= 67) return { label: "Rain", icon: "rain", sky: "rain" };
  if (code >= 71 && code <= 77) return { label: "Snow", icon: "snow", sky: "snow" };
  if (code >= 80 && code <= 82) return { label: "Rain showers", icon: "rain", sky: "rain" };
  if (code === 85 || code === 86) return { label: "Snow showers", icon: "snow", sky: "snow" };
  if (code >= 95) return { label: "Thunderstorm", icon: "storm", sky: "storm" };
  return { label: "Unknown", icon: "cloud", sky: "cloudy" };
}

/* Inline SVG icons (static strings, no user data, so innerHTML is safe) */
const CLOUD = `<g fill="#EEF4FA"><circle cx="22" cy="38" r="8"/><circle cx="33" cy="30" r="12"/><circle cx="46" cy="37" r="9"/><rect x="22" y="37" width="24" height="9"/></g>`;
const SUN_CORE = (cx, cy, r) => {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join("");
  return `<g stroke="#FFC94D" stroke-width="3" stroke-linecap="round">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFC94D"/>`;
};
const MOON = (cx, cy, r) =>
  `<path fill="#F5E9B8" d="M${cx + r * 0.3} ${cy - r}A${r} ${r} 0 1 0 ${cx + r} ${cy + r * 0.3}A${r * 0.85} ${r * 0.85} 0 0 1 ${cx + r * 0.3} ${cy - r}Z"/>`;

const ICONS = {
  sun: SUN_CORE(32, 32, 12),
  moon: MOON(32, 32, 18),
  cloud: `<g transform="translate(0 4)">${CLOUD}</g>`,
  "partly-day": `${SUN_CORE(24, 24, 9)}<g transform="translate(6 10) scale(.9)">${CLOUD}</g>`,
  "partly-night": `${MOON(24, 24, 13)}<g transform="translate(6 10) scale(.9)">${CLOUD}</g>`,
  rain: `<g transform="translate(0 -6)">${CLOUD}</g><g stroke="#7CC4FF" stroke-width="3" stroke-linecap="round"><line x1="25" y1="46" x2="22" y2="54"/><line x1="35" y1="46" x2="32" y2="54"/><line x1="45" y1="46" x2="42" y2="54"/></g>`,
  snow: `<g transform="translate(0 -6)">${CLOUD}</g><g fill="#fff"><circle cx="24" cy="49" r="2.5"/><circle cx="34" cy="53" r="2.5"/><circle cx="44" cy="49" r="2.5"/></g>`,
  storm: `<g transform="translate(0 -8)">${CLOUD}</g><polygon fill="#FFD84D" points="35,38 27,52 34,52 31,63 43,46 36,46 39,38"/>`,
  fog: `<g transform="translate(0 -6)">${CLOUD}</g><g stroke="#EEF4FA" stroke-width="3" stroke-linecap="round" opacity=".85"><line x1="16" y1="48" x2="48" y2="48"/><line x1="22" y1="55" x2="54" y2="55"/></g>`,
};

function iconEl(name, label) {
  const span = h("span", { class: "icon", role: "img", "aria-label": label });
  span.innerHTML = `<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">${ICONS[name] ?? ICONS.cloud}</svg>`;
  return span;
}

/* =========================================================
   Rendering (dynamic DOM injection)
   ========================================================= */

function renderRecent() {
  recentEl.replaceChildren(
    ...state.recent.map((city) =>
      h("button", { class: "chip", type: "button", onclick: () => runSearch(city) }, city)
    )
  );
}

function renderLoading() {
  const skeleton = h(
    "div",
    { class: "skeleton", role: "status", "aria-label": "Loading weather" },
    h("i", { style: "height:2.2rem;width:55%" }),
    h("i", { style: "height:9rem;width:80%" }),
    h("i", { style: "height:14rem;width:100%" })
  );
  view.replaceChildren(skeleton);
}

function renderEmpty() {
  document.body.dataset.sky = "idle";
  view.replaceChildren(
    h(
      "section",
      { class: "state" },
      h("h2", {}, "Which city's weather do you want to see?"),
      h("p", {}, "Search any city above to see its temperature right now and the next five days."),
      h(
        "div",
        { class: "actions" },
        SUGGESTIONS.map((c) => h("button", { class: "chip", type: "button", onclick: () => runSearch(c) }, c))
      )
    )
  );
}

function renderError(title, message) {
  view.replaceChildren(
    h(
      "section",
      { class: "state error", role: "alert" },
      h("h2", {}, title),
      h("p", {}, message),
      h(
        "div",
        { class: "actions" },
        state.place
          ? h("button", { class: "btn btn-ghost", type: "button", onclick: () => renderWeather() }, "Back to " + state.place.name)
          : null,
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => input.focus() }, "Search again")
      )
    )
  );
  if (!state.place) document.body.dataset.sky = "idle";
}

function renderWeather() {
  const { place, data } = state;
  if (!place || !data) return renderEmpty();

  const cur = data.current;
  const info = describe(cur.weather_code, cur.is_day);
  document.body.dataset.sky = info.sky;
  const unitLabel = state.unit.toUpperCase();

  const region = [place.admin1, place.country].filter(Boolean).join(", ");
  const localTime = cur.time.split("T")[1]; // already in the city's timezone

  /* Current conditions */
  const now = h(
    "section",
    { class: "now", "aria-label": `Current weather in ${place.name}` },
    h("h1", { class: "place" }, place.name),
    h("p", { class: "region" }, region),
    h(
      "div",
      { class: "reading" },
      h("div", { class: "temp", "aria-label": `${toUnit(cur.temperature_2m)} degrees ${unitLabel}` }, String(toUnit(cur.temperature_2m)), h("sup", {}, "°" + unitLabel)),
      iconEl(info.icon, info.label)
    ),
    h("p", { class: "summary" }, info.label),
    h("p", { class: "stamp" }, `Local time ${localTime}`),
    h(
      "dl",
      { class: "facts" },
      fact("Feels like", `${toUnit(cur.apparent_temperature)}°`),
      fact("Humidity", `${cur.relative_humidity_2m}%`),
      fact("Wind", `${toWind(cur.wind_speed_10m)} ${windUnit()}`),
      fact("Chance of rain today", `${data.daily.precipitation_probability_max[0] ?? 0}%`)
    )
  );

  if (state.others.length) {
    now.append(
      h(
        "div",
        { class: "matches" },
        h("p", {}, "Not the right place? Other matches:"),
        h(
          "div",
          { class: "chip-row" },
          state.others.map((p) =>
            h(
              "button",
              { class: "chip", type: "button", onclick: () => pickMatch(p) },
              [p.name, p.admin1, p.country_code].filter(Boolean).join(", ")
            )
          )
        )
      )
    );
  }

  /* 5-day forecast */
  const d = data.daily;
  const weekMin = Math.min(...d.temperature_2m_min);
  const weekMax = Math.max(...d.temperature_2m_max);
  const span = weekMax - weekMin || 1;

  const days = d.time.map((date, i) => {
    const dayInfo = describe(d.weather_code[i], 1);
    const lo = d.temperature_2m_min[i];
    const hi = d.temperature_2m_max[i];
    const left = ((lo - weekMin) / span) * 100;
    const width = Math.max(((hi - lo) / span) * 100, 6);
    const name = i === 0 ? "Today" : parseDay(date).toLocaleDateString(undefined, { weekday: "short" });

    const bar = h("div", { class: "range", "aria-hidden": "true" }, h("span", { style: `left:${left}%;width:${width}%` }));

    return h(
      "li",
      { class: "day" },
      h("span", { class: "name" }, name),
      iconEl(dayInfo.icon, dayInfo.label),
      h("span", { class: "rain", title: "Chance of rain" }, `${d.precipitation_probability_max[i] ?? 0}%`),
      h(
        "div",
        { class: "temps" },
        h("span", { class: "lo" }, `${toUnit(lo)}°`),
        bar,
        h("span", { class: "hi" }, `${toUnit(hi)}°`)
      )
    );
  });

  const forecast = h("section", { class: "forecast", "aria-label": "5-day forecast" }, h("h2", {}, "Next 5 days"), h("ol", {}, days));

  view.replaceChildren(h("div", { class: "weather" }, now, forecast));
  document.title = `${toUnit(cur.temperature_2m)}° ${place.name} – Skyline`;
}

function fact(term, value) {
  return h("div", {}, h("dt", {}, term), h("dd", {}, value));
}

/* =========================================================
   Events
   ========================================================= */

function runSearch(query) {
  const error = validateQuery(query);
  if (error) {
    showFieldError(error);
    input.focus();
    return;
  }
  clearFieldError();
  input.value = query.trim();
  searchCity(query.trim());
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value);
});

input.addEventListener("input", clearFieldError);
locateBtn.addEventListener("click", useMyLocation);

function syncUnitButtons() {
  unitButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.unit === state.unit)));
}

unitButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    state.unit = btn.dataset.unit;
    save("skyline.unit", state.unit);
    syncUnitButtons();
    if (state.data) renderWeather(); // re-render only, no new request needed
  })
);

/* ---------- Boot ---------- */
syncUnitButtons();
renderRecent();
if (state.recent.length) runSearch(state.recent[0]);
else renderEmpty();
