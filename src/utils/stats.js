// src/utils/stats.js

const toNum = (v) =>
  typeof v === "number"
    ? v
    : typeof v === "string"
    ? Number.parseFloat(v.replace("%", ""))
    : undefined;

const pickNum = (o, ...keys) => {
  if (!o) return undefined;
  for (const k of keys)
    if (o[k] != null) {
      const n = toNum(o[k]);
      if (Number.isFinite(n)) return n;
    }
  return undefined;
};

export function average(values) {
  const nums = values.filter(
    (v) => typeof v === "number" && Number.isFinite(v)
  );
  if (!nums.length) return undefined;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function eventDateISO(ev) {
  const iso = ev?.time_start || ev?.time_date;
  if (iso) return new Date(iso).toISOString();
  if (typeof ev?.time === "number")
    return new Date(ev.time * 1000).toISOString();
  if (typeof ev?.created_at === "number")
    return new Date(ev.created_at * 1000).toISOString();
  if (typeof ev?.updated_at === "number")
    return new Date(ev.updated_at * 1000).toISOString();
  return undefined;
}

// ---- stats_trend parsing ----
function normalizeTeamStats(obj = {}) {
  const sot = pickNum(obj, "shots_on_target", "sot", "on_target");
  const soff = pickNum(obj, "shots_off_target", "soff", "off_target");
  const shotsTotal =
    pickNum(obj, "shots", "shots_total", "total_shots") ??
    (Number.isFinite(sot) || Number.isFinite(soff)
      ? (sot || 0) + (soff || 0)
      : undefined);

  return {
    shots_on_target: sot,
    shots_off_target: soff,
    shots_total: shotsTotal,
    corners: pickNum(obj, "corners", "corner"),
    yellowcards: pickNum(obj, "yellowcards", "yellow_cards"),
    redcards: pickNum(obj, "redcards", "red_cards"),
  };
}

function lastVal(arr = []) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const pick = arr.reduce((best, x) => {
    const t = Number.parseFloat((x?.time_str ?? "").toString());
    const bt = Number.parseFloat((best?.time_str ?? "").toString());
    return Number.isFinite(t) && (!Number.isFinite(bt) || t > bt)
      ? x
      : best || x;
  }, null);
  const n = toNum(pick?.val);
  return Number.isFinite(n) ? n : undefined;
}

function parseBucketedTrend(trendObj = {}) {
  const h = {},
    a = {};
  const map = [
    ["on_target", "shots_on_target"],
    ["off_target", "shots_off_target"],
    ["corners", "corners"],
    ["yellowcards", "yellowcards"],
    ["redcards", "redcards"],
    ["shots", "shots_total"],
  ];
  for (const [src, dst] of map) {
    const b = trendObj[src];
    if (!b) continue;
    h[dst] = lastVal(b.home);
    a[dst] = lastVal(b.away);
  }
  if (!Number.isFinite(h.shots_total)) {
    const sot = h.shots_on_target,
      soff = h.shots_off_target;
    if (Number.isFinite(sot) || Number.isFinite(soff))
      h.shots_total = (sot || 0) + (soff || 0);
  }
  if (!Number.isFinite(a.shots_total)) {
    const sot = a.shots_on_target,
      soff = a.shots_off_target;
    if (Number.isFinite(sot) || Number.isFinite(soff))
      a.shots_total = (sot || 0) + (soff || 0);
  }
  return { home: h, away: a };
}

export function trendToFTTotals(trend) {
  if (trend && !Array.isArray(trend) && typeof trend === "object") {
    return parseBucketedTrend(trend);
  }
  if (Array.isArray(trend) && trend.length > 0) {
    const last = trend[trend.length - 1];
    return {
      home: normalizeTeamStats(last?.home || {}),
      away: normalizeTeamStats(last?.away || {}),
    };
  }
  return null;
}

// ---- offsides helpers from event/view ----
function extractOffsideNumber(statsSideObj) {
  if (!statsSideObj || typeof statsSideObj !== "object") return undefined;
  if (Number.isFinite(toNum(statsSideObj.offsides)))
    return toNum(statsSideObj.offsides);
  if (Number.isFinite(toNum(statsSideObj.offside)))
    return toNum(statsSideObj.offside);
  for (const [k, v] of Object.entries(statsSideObj)) {
    if (k.toLowerCase().includes("offside")) {
      const n = toNum(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function ourTeamSide(ev, ourName, ourId) {
  // detect if our team was home/away
  const hName = (ev.home?.name || ev.home_name || "").toLowerCase().trim();
  const aName = (ev.away?.name || ev.away_name || "").toLowerCase().trim();
  const target = (ourName || "").toLowerCase().trim();
  if (target && (hName === target || hName.includes(target))) return "home";
  if (target && (aName === target || aName.includes(target))) return "away";
  const hId = String(ev.home?.id || ev.home_id || "");
  const aId = String(ev.away?.id || ev.away_id || "");
  if (ourId && String(ourId) === hId) return "home";
  if (ourId && String(ourId) === aId) return "away";
  return "home";
}

// ---- main aggregator ----
export async function computeAveragesForTeam(
  prevEvents,
  fetchTrend,
  fetchViewForOffsides,
  opts = {}
) {
  const { ourName = "", ourId = "" } = opts;

  const throttle = async (arr, limit, task) => {
    const out = new Array(arr.length);
    let i = 0;
    async function worker() {
      while (i < arr.length) {
        const idx = i++;
        out[idx] = await task(arr[idx], idx).catch(() => null);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(limit, arr.length) }, worker)
    );
    return out;
  };

  const trendResults = await throttle(prevEvents, 4, async (ev) => {
    const eid = ev.id || ev.event_id || ev.Fid;
    const trend = await fetchTrend(eid);
    const ft = trendToFTTotals(trend);
    const side = ourTeamSide(ev, ourName, ourId);
    const pick = ft ? (side === "home" ? ft.home : ft.away) : null;
    return { ev, eid, ok: !!ft, side, pick };
  });

  const withOffsides = await throttle(prevEvents, 3, async (ev) => {
    const eid = ev.id || ev.event_id || ev.Fid;
    const v = await fetchViewForOffsides(eid);
    const stats = v?.stats || v?.extra?.stats;
    const side = ourTeamSide(ev, ourName, ourId);
    const off =
      side === "home"
        ? extractOffsideNumber(stats?.home)
        : extractOffsideNumber(stats?.away);
    return { eid, off };
  });

  const merged = trendResults
    .map((t) => {
      if (!t) return null;
      const off = withOffsides.find((x) => x && x.eid === t.eid)?.off;
      const base = t.ok ? { ...t.pick } : {};
      if (off !== undefined) base.offsides = off;

      const hName = t.ev.home?.name || t.ev.home_name || "";
      const aName = t.ev.away?.name || t.ev.away_name || "";
      const opponent = t.side === "home" ? aName || "—" : hName || "—";
      const hScore =
        t.ev.ss?.split("-")?.[0] ??
        t.ev.home_score ??
        t.ev.fs_h ??
        t.ev.score_home;
      const aScore =
        t.ev.ss?.split("-")?.[1] ??
        t.ev.away_score ??
        t.ev.fs_a ??
        t.ev.score_away;

      return {
        eventId: t.eid,
        ok: t.ok,
        side: t.side,
        opponent,
        dateISO: eventDateISO(t.ev) || null,
        score:
          hScore != null && aScore != null ? `${hScore}-${aScore}` : undefined,
        league_id: t.ev.league_id ?? t.ev.league?.id ?? undefined,
        league_name: t.ev.league?.name || t.ev.league_name || undefined,
        ...base,
      };
    })
    .filter(Boolean);

  const fields = [
    "shots_total",
    "shots_on_target",
    "shots_off_target",
    "offsides",
    "corners",
    "yellowcards",
    "redcards",
  ];

  const valid = merged.filter((m) => m.ok);
  const pickNums = (f) =>
    valid
      .map((m) => m[f])
      .filter((x) => typeof x === "number" && Number.isFinite(x));

  const averages = {},
    mins = {},
    maxs = {};
  for (const f of fields) {
    const arr = pickNums(f);
    if (arr.length) {
      averages[f] = arr.reduce((a, b) => a + b, 0) / arr.length;
      mins[f] = Math.min(...arr);
      maxs[f] = Math.max(...arr);
    } else {
      averages[f] = undefined;
      mins[f] = undefined;
      maxs[f] = undefined;
    }
  }

  return { averages, mins, maxs, sample: valid.length, details: merged };
}
