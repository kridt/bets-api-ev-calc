// src/api.js
const BASE = "/api/bets";

const qs = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

async function get(path, params = {}) {
  const url = `${BASE}?${qs({ path, ...params })}`;
  console.log("[api.js] GET →", url);

  const res = await fetch(url);
  const ct = res.headers.get("content-type") || "";
  console.log("[api.js] ←", { status: res.status, ct });

  if (!ct.includes("application/json")) {
    const preview = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Expected JSON but got ${ct}. Preview: ${preview}`);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`
    );
  }
  return data;
}

export async function fetchNextFixturesByLeague(leagueId, limit = 10) {
  const data = await get("/v1/events/upcoming", {
    sport_id: 1,
    league_id: leagueId,
    page: 1,
  });
  console.log("[api.js] results/upcoming", {
    leagueId,
    count: data?.results?.length ?? 0,
  });
  return (data.results || []).slice(0, limit);
}

export async function fetchEventView(eventId) {
  const data = await get("/v1/event/view", { event_id: eventId, stats: 1 });
  console.log("[api.js] event/view", { eventId, have: !!data?.results?.[0] });
  return data.results?.[0] || null;
}

export async function fetchEventHistory(eventId, limit = 10) {
  const data = await get("/v1/event/history", { event_id: eventId });
  const take = (arr) => (Array.isArray(arr) ? arr.slice(0, limit) : []);
  const home = take(data?.results?.home || []);
  const away = take(data?.results?.away || []);
  console.log("[api.js] event/history", {
    eventId,
    home: home.length,
    away: away.length,
  });
  return { home, away };
}

export async function fetchStatsTrend(eventId) {
  const data = await get("/v1/event/stats_trend", { event_id: eventId });
  const ok = !!data?.results;
  console.log("[api.js] event/stats_trend", {
    eventId,
    ok,
    keys: ok ? Object.keys(data.results) : [],
  });
  return data.results ?? null;
}
