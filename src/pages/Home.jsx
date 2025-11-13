// src/pages/Home.jsx
import { useEffect, useState } from "react";
import { fetchNextFixturesByLeague } from "../api";
import MatchCard from "../components/MatchCard";
import Skeleton from "../components/Skeleton";

// League configuration with ID, name, and gradient colors
const LEAGUES = [
  // Original leagues
  { id: 49, name: "Danish Superliga", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { id: 94, name: "Premier League", gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)" },

  // World Cup 2026 Qualifiers by Confederation
  { id: 33207, name: "World Cup 2026", gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", emoji: "🏆" },
  { id: 681, name: "Europe - World Cup Qualifying", gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)", emoji: "🇪🇺" },
  { id: 473, name: "South America - World Cup Qualifying", gradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)", emoji: "🌎" },
  { id: 455, name: "Asia - World Cup Qualifying", gradient: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", emoji: "🌏" },
  { id: 1735, name: "Africa - World Cup Qualifying", gradient: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)", emoji: "🌍" },
  { id: 28749, name: "North & Central America - WC Qualifying", gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)", emoji: "🌎" },
  { id: 2641, name: "Oceania - World Cup Qualifying", gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", emoji: "🌊" },
];

function ListSkeleton() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          padding: 20,
          borderRadius: 16,
          background: "rgba(30, 41, 59, 0.5)",
          display: "grid",
          gap: 12,
        }}>
          <Skeleton height={24} width="80%" />
          <Skeleton height={16} width="60%" />
          <Skeleton height={40} width="100%" />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [leagueData, setLeagueData] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const t0 = performance.now?.() ?? Date.now();
      console.log("[Home] load start");
      try {
        setLoading(true);
        setError(null);

        // Fetch all leagues in parallel
        const results = await Promise.all(
          LEAGUES.map(league =>
            fetchNextFixturesByLeague(league.id, 10)
              .then(matches => ({ leagueId: league.id, matches }))
              .catch(err => {
                console.error(`[Home] Error loading ${league.name}:`, err);
                return { leagueId: league.id, matches: [] };
              })
          )
        );

        // Convert array to object keyed by league ID
        const dataMap = {};
        results.forEach(({ leagueId, matches }) => {
          dataMap[leagueId] = matches;
        });

        setLeagueData(dataMap);
        console.log("[Home] load ok", {
          ms: Math.round((performance.now?.() ?? Date.now()) - t0),
        });
      } catch (e) {
        console.error("[Home] load error", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (error) {
    return (
      <div style={{
        padding: 24,
        borderRadius: 16,
        background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(185, 28, 28, 0.1) 100%)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        color: "#fca5a5",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error Loading Matches</div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>{error}</div>
      </div>
    );
  }

  // Helper function to get earliest match time from a list of matches
  const getEarliestMatchTime = (matches) => {
    if (!matches || matches.length === 0) return Infinity;

    const times = matches
      .map(ev => {
        if (typeof ev?.time === "number") return ev.time * 1000;
        if (ev?.time_start) return new Date(ev.time_start).getTime();
        return null;
      })
      .filter(t => t !== null);

    return times.length > 0 ? Math.min(...times) : Infinity;
  };

  // Sort leagues by earliest match time
  const sortedLeagues = [...LEAGUES].sort((a, b) => {
    const aMatches = leagueData[a.id] || [];
    const bMatches = leagueData[b.id] || [];

    // Skip empty leagues (they'll be filtered out later)
    if (aMatches.length === 0) return 1;
    if (bMatches.length === 0) return -1;

    const aTime = getEarliestMatchTime(aMatches);
    const bTime = getEarliestMatchTime(bMatches);

    return aTime - bTime;
  });

  return (
    <div style={{ display: "grid", gap: 40 }}>
      {/* Hero Section */}
      <div style={{
        textAlign: "center",
        padding: "40px 20px",
        background: "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)",
        borderRadius: 24,
        border: "1px solid rgba(102, 126, 234, 0.2)",
      }}>
        <h1 style={{
          fontSize: 48,
          fontWeight: 900,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 16,
        }}>
          Upcoming Matches
        </h1>
        <p style={{
          fontSize: 18,
          color: "#94a3b8",
          maxWidth: 700,
          margin: "0 auto",
        }}>
          Live countdown and statistics for World Cup 2026 Qualifiers and major leagues
        </p>
      </div>

      {/* Leagues Grid */}
      <div style={{
        display: "grid",
        gap: 32,
        gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
      }}>
        {sortedLeagues.map(league => {
          const matches = leagueData[league.id] || [];

          // Skip leagues with no matches
          if (!loading && matches.length === 0) {
            return null;
          }

          return (
            <div key={league.id}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
              }}>
                <div style={{
                  width: 4,
                  height: 32,
                  background: league.gradient,
                  borderRadius: 4,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {league.emoji && (
                      <span style={{ fontSize: 20 }}>{league.emoji}</span>
                    )}
                    <h2 style={{
                      fontSize: 24,
                      fontWeight: 800,
                      color: "#e2e8f0",
                      margin: 0,
                    }}>
                      {league.name}
                    </h2>
                  </div>
                  <p style={{
                    fontSize: 14,
                    color: "#64748b",
                    margin: "4px 0 0 0",
                  }}>
                    {loading ? "Loading..." : `Next ${matches.length} fixtures`}
                  </p>
                </div>
              </div>

              {loading ? (
                <ListSkeleton />
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {matches.map((ev) => (
                    <MatchCard key={ev.id || ev.event_id || ev.Fid} ev={ev} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
