// src/pages/EPLMatch.jsx - EPL Match Analysis with Last 10 Games Stats
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const API_KEY = import.meta.env.VITE_BALLDONTLIE_API_KEY;
const API_BASE = "https://api.balldontlie.io";

async function bdFetch(url) {
  const response = await fetch(url, {
    headers: { 'Authorization': API_KEY },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export default function EPLMatch() {
  const { gameId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch all teams
        const teamsRes = await bdFetch(`${API_BASE}/epl/v1/teams?season=2025`);
        const teamsMap = {};
        teamsRes.data.forEach(t => teamsMap[t.id] = t);

        // 2. Fetch ALL games with pagination
        let allGames = [];
        let cursor = null;
        for (let i = 0; i < 10; i++) {
          const url = new URL(`${API_BASE}/epl/v1/games`);
          url.searchParams.append("season", "2025");
          url.searchParams.append("per_page", "100");
          if (cursor) url.searchParams.append("cursor", cursor);

          const res = await bdFetch(url.toString());
          allGames = allGames.concat(res.data || []);

          if (res.meta?.next_cursor) {
            cursor = res.meta.next_cursor;
          } else {
            break;
          }
        }

        console.log('[EPLMatch] Total games fetched:', allGames.length);

        // 3. Find the match
        const game = allGames.find(g => g.id === parseInt(gameId));
        if (!game) throw new Error('Game not found');

        const homeTeamId = game.home_team_id;
        const awayTeamId = game.away_team_id;
        const homeTeam = teamsMap[homeTeamId];
        const awayTeam = teamsMap[awayTeamId];

        console.log('[EPLMatch] Match:', homeTeam?.name, 'vs', awayTeam?.name);

        // 4. Get recent completed games for each team (sorted by date desc)
        const getTeamGames = (teamId) => {
          return allGames
            .filter(g => (g.home_team_id === teamId || g.away_team_id === teamId) &&
                        (g.status === "FullTime" || g.status === "FT"))
            .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))
            .slice(0, 10);
        };

        const homeGames = getTeamGames(homeTeamId);
        const awayGames = getTeamGames(awayTeamId);

        console.log('[EPLMatch] Home team recent:', homeGames.map(g =>
          `${new Date(g.kickoff).toLocaleDateString()} vs ${g.home_team_id === homeTeamId ? teamsMap[g.away_team_id]?.short_name : teamsMap[g.home_team_id]?.short_name}`
        ));
        console.log('[EPLMatch] Away team recent:', awayGames.map(g =>
          `${new Date(g.kickoff).toLocaleDateString()} vs ${g.home_team_id === awayTeamId ? teamsMap[g.away_team_id]?.short_name : teamsMap[g.home_team_id]?.short_name}`
        ));

        // 5. Fetch stats for each game
        const fetchGameStats = async (games, teamId) => {
          const results = [];
          for (const g of games) {
            try {
              const statsRes = await bdFetch(`${API_BASE}/epl/v1/games/${g.id}/team_stats`);
              const teams = statsRes.data?.teams || [];

              const isHome = g.home_team_id === teamId;
              const opponentId = isHome ? g.away_team_id : g.home_team_id;

              // Find this team's stats
              let teamStats = {};
              for (const t of teams) {
                if (t.team_id === teamId) {
                  (t.stats || []).forEach(s => teamStats[s.name] = s.value);
                }
              }

              results.push({
                gameId: g.id,
                date: g.kickoff,
                opponent: teamsMap[opponentId]?.name || `Team ${opponentId}`,
                isHome,
                stats: {
                  corners: teamStats.corner_taken || 0,
                  yellowCards: teamStats.total_yel_card || 0,
                  redCards: teamStats.red_card || 0,
                  shotsOnTarget: teamStats.ontarget_scoring_att || 0,
                  shotsTotal: teamStats.total_scoring_att || 0,
                  offsides: teamStats.total_offside || 0,
                  fouls: teamStats.fk_foul_lost || 0,
                },
              });
            } catch (e) {
              console.error(`[EPLMatch] Error fetching stats for game ${g.id}:`, e);
            }
          }
          return results;
        };

        const [homeStats, awayStats] = await Promise.all([
          fetchGameStats(homeGames, homeTeamId),
          fetchGameStats(awayGames, awayTeamId),
        ]);

        // 6. Calculate averages
        const calcAvg = (games) => {
          if (!games.length) return null;
          const sum = games.reduce((acc, g) => ({
            corners: acc.corners + g.stats.corners,
            yellowCards: acc.yellowCards + g.stats.yellowCards,
            redCards: acc.redCards + g.stats.redCards,
            shotsOnTarget: acc.shotsOnTarget + g.stats.shotsOnTarget,
            shotsTotal: acc.shotsTotal + g.stats.shotsTotal,
            offsides: acc.offsides + g.stats.offsides,
            fouls: acc.fouls + g.stats.fouls,
          }), { corners: 0, yellowCards: 0, redCards: 0, shotsOnTarget: 0, shotsTotal: 0, offsides: 0, fouls: 0 });

          const n = games.length;
          return {
            corners: (sum.corners / n).toFixed(1),
            yellowCards: (sum.yellowCards / n).toFixed(1),
            redCards: (sum.redCards / n).toFixed(1),
            shotsOnTarget: (sum.shotsOnTarget / n).toFixed(1),
            shotsTotal: (sum.shotsTotal / n).toFixed(1),
            offsides: (sum.offsides / n).toFixed(1),
            fouls: (sum.fouls / n).toFixed(1),
          };
        };

        setData({
          game: { id: game.id, kickoff: game.kickoff, homeTeam, awayTeam },
          homeTeam: { name: homeTeam?.name, recentGames: homeStats, averages: calcAvg(homeStats), gamesAnalyzed: homeStats.length },
          awayTeam: { name: awayTeam?.name, recentGames: awayStats, averages: calcAvg(awayStats), gamesAnalyzed: awayStats.length },
        });

      } catch (e) {
        console.error('[EPLMatch] Error:', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalysis();
  }, [gameId]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "rgba(30, 41, 59, 0.8)", borderRadius: 20 }}>
        <div style={{ width: 60, height: 60, margin: "0 auto 20px", borderRadius: "50%", border: "4px solid rgba(102, 126, 234, 0.2)", borderTopColor: "#667eea", animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>Loading Match Analysis...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "grid", gap: 24 }}>
        <Link to="/" style={{ color: "#8b5cf6", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>← Back</Link>
        <div style={{ padding: 24, background: "rgba(239, 68, 68, 0.1)", borderRadius: 16, color: "#fca5a5" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  const { game, homeTeam, awayTeam } = data;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#8b5cf6", textDecoration: "none", fontSize: 14, fontWeight: 600, padding: "8px 16px", background: "rgba(139, 92, 246, 0.1)", borderRadius: 12, width: "fit-content" }}>
        ← Back to Today's Matches
      </Link>

      {/* Match Header */}
      <div style={{ padding: 32, borderRadius: 20, background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)", border: "1px solid rgba(255, 255, 255, 0.1)", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)" }} />
        <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 16, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
          <span>{game.homeTeam?.name}</span>
          <span style={{ fontSize: 24, padding: "8px 16px", background: "rgba(139, 92, 246, 0.2)", borderRadius: 12, color: "#a78bfa" }}>VS</span>
          <span>{game.awayTeam?.name}</span>
        </div>
        <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
          {game.kickoff ? new Date(game.kickoff).toLocaleString() : "TBD"} • EPL
        </div>
      </div>

      {/* Averages Comparison */}
      <div style={{ padding: 24, borderRadius: 20, background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 4, height: 24, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", borderRadius: 4 }} />
          Statistics Comparison (Last {Math.max(homeTeam.gamesAnalyzed, awayTeam.gamesAnalyzed)} Games)
        </h3>
        <div style={{ display: "grid", gap: 12 }}>
          <StatsRow label="Corners" emoji="🚩" home={homeTeam.averages?.corners} away={awayTeam.averages?.corners} />
          <StatsRow label="Shots on Target" emoji="🎯" home={homeTeam.averages?.shotsOnTarget} away={awayTeam.averages?.shotsOnTarget} />
          <StatsRow label="Total Shots" emoji="⚽" home={homeTeam.averages?.shotsTotal} away={awayTeam.averages?.shotsTotal} />
          <StatsRow label="Yellow Cards" emoji="🟨" home={homeTeam.averages?.yellowCards} away={awayTeam.averages?.yellowCards} />
          <StatsRow label="Offsides" emoji="🏴" home={homeTeam.averages?.offsides} away={awayTeam.averages?.offsides} />
          <StatsRow label="Fouls" emoji="🚨" home={homeTeam.averages?.fouls} away={awayTeam.averages?.fouls} />
        </div>
        <div style={{ marginTop: 16, padding: 12, background: "rgba(102, 126, 234, 0.1)", borderRadius: 8, fontSize: 12, color: "#94a3b8" }}>
          Combined corners: {(parseFloat(homeTeam.averages?.corners || 0) + parseFloat(awayTeam.averages?.corners || 0)).toFixed(1)}
        </div>
      </div>

      {/* Recent Games */}
      <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))" }}>
        <TeamGames title={`${homeTeam.name} - Last ${homeTeam.gamesAnalyzed} Games`} games={homeTeam.recentGames} color="#10b981" />
        <TeamGames title={`${awayTeam.name} - Last ${awayTeam.gamesAnalyzed} Games`} games={awayTeam.recentGames} color="#f59e0b" />
      </div>
    </div>
  );
}

function StatsRow({ label, emoji, home, away }) {
  const h = parseFloat(home) || 0, a = parseFloat(away) || 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16, padding: 12, background: "rgba(100, 116, 139, 0.1)", borderRadius: 10 }}>
      <div style={{ textAlign: "right", fontSize: 20, fontWeight: 700, color: h > a ? "#10b981" : "#e2e8f0" }}>{home || "0"}</div>
      <div style={{ textAlign: "center", fontSize: 13, color: "#94a3b8", minWidth: 120 }}>
        {emoji} {label}
        <div style={{ fontSize: 11, color: "#64748b" }}>Total: {(h + a).toFixed(1)}</div>
      </div>
      <div style={{ textAlign: "left", fontSize: 20, fontWeight: 700, color: a > h ? "#f59e0b" : "#e2e8f0" }}>{away || "0"}</div>
    </div>
  );
}

function TeamGames({ title, games, color }) {
  return (
    <div style={{ padding: 24, borderRadius: 20, background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 4, height: 24, background: color, borderRadius: 4 }} />
        {title}
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        {games.map((g, i) => (
          <div key={i} style={{ padding: 12, background: "rgba(100, 116, 139, 0.1)", borderRadius: 10, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{g.isHome ? "vs" : "@"} {g.opponent}</div>
              <div style={{ color: "#64748b", fontSize: 12 }}>{new Date(g.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              <Stat label="Corners" value={g.stats.corners} />
              <Stat label="Shots" value={g.stats.shotsOnTarget} />
              <Stat label="Cards" value={g.stats.yellowCards} color="#f59e0b" />
              <Stat label="Fouls" value={g.stats.fouls} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color = "#94a3b8" }) {
  return (
    <div style={{ textAlign: "center", padding: "4px 6px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "#64748b" }}>{label}</div>
    </div>
  );
}
