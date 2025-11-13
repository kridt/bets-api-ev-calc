// src/api.js
const BASE = "/api/bets";

const qs = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

async function get(path, params = {}) {
  const url = `${BASE}?${qs({ path, ...params })}`;
  const t0 = performance.now?.() ?? Date.now();
  console.log("[api.js] GET →", url);

  const res = await fetch(url);
  const ct = res.headers.get("content-type") || "";
  console.log("[api.js] ←", {
    status: res.status,
    ct,
    ms: Math.round((performance.now?.() ?? Date.now()) - t0),
  });

  const isJson = ct.includes("application/json");
  if (!isJson) {
    const text = await res.text().catch(() => "");
    console.error("[api.js] ERR non-JSON", {
      status: res.status,
      preview: text.slice(0, 200),
    });
    throw new Error(
      `Expected JSON but got ${ct || "unknown content type"} from ${url}.\n` +
        `Preview: ${text.slice(0, 200)}`
    );
  }

  const body = await res.json().catch(async (e) => {
    const text = await res.text().catch(() => "");
    console.error("[api.js] ERR bad JSON parse", {
      err: e?.message,
      preview: text.slice(0, 200),
    });
    throw new Error(`JSON parse error from ${url}: ${e?.message}`);
  });

  if (!res.ok) {
    console.error("[api.js] ERR HTTP", { status: res.status, body });
    throw new Error(
      `HTTP ${res.status} from ${url}: ${JSON.stringify(body).slice(0, 200)}`
    );
  }
  if (body.success !== 1) {
    console.warn("[api.js] WARN BetsAPI success!=1", body);
    // still return to caller so they can render an empty state if they want
  }
  return body;
}

export async function fetchNextFixturesByLeague(leagueId, limit = 10) {
  const data = await get("/v1/events/upcoming", {
    sport_id: 1,
    league_id: leagueId,
    page: 1,
  });
  console.log("[api.js] results/upcoming", {
    count: data?.results?.length ?? 0,
    leagueId,
  });
  return (data.results || []).slice(0, limit);
}

export async function fetchEventView(eventId) {
  const data = await get("/v1/event/view", { event_id: eventId, stats: 1 });
  console.log("[api.js] event/view", { have: !!data?.results?.[0], eventId });
  return data.results?.[0] || null;
}

export async function fetchEventHistory(eventId, limit = 10) {
  const data = await get("/v1/event/history", { event_id: eventId });
  const home = Array.isArray(data?.results?.home)
    ? data.results.home.slice(0, limit)
    : [];
  const away = Array.isArray(data?.results?.away)
    ? data.results.away.slice(0, limit)
    : [];
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

export async function fetchLeagues(sportId = 1) {
  const data = await get("/v1/league", { sport_id: sportId });
  console.log("[api.js] league", {
    count: data?.results?.length ?? 0,
  });
  return data.results || [];
}
