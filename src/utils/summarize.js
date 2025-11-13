// src/utils/summarize.js
export function summarizeDetails(details = [], opts = {}) {
  const { onlySide, onlyLeagueId } = opts; // onlySide: "home" | "away" | undefined

  const filtered = details.filter((d) => {
    if (onlySide && d.side !== onlySide) return false;
    if (onlyLeagueId && String(d.league_id || "") !== String(onlyLeagueId))
      return false;
    return true;
  });

  const contributed = filtered.filter((d) => d.ok); // had stats_trend
  const coveragePct = filtered.length
    ? (contributed.length / filtered.length) * 100
    : 0;

  // totals
  const homeCount = filtered.filter((d) => d.side === "home").length;
  const awayCount = filtered.filter((d) => d.side === "away").length;

  // competitions breakdown
  const comp = {};
  for (const d of filtered) {
    const name = d.league_name || "Unknown competition";
    comp[name] = (comp[name] || 0) + 1;
  }

  return {
    total_listed: filtered.length,
    total_with_stats: contributed.length,
    coveragePct,
    homeCount,
    awayCount,
    competitions: Object.entries(comp).map(([name, count]) => ({
      name,
      count,
    })),
    filtered,
  };
}
