// src/pages/EPLMatch.jsx - EPL Match Analysis with Last 10 Games Stats (Direct API)
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const API_KEY = import.meta.env.VITE_BALLDONTLIE_API_KEY;
const API_BASE = "https://api.balldontlie.io";

async function bdFetch(url) {
  const response = await fetch(url, {
    headers: {
      'Authorization': API_KEY,
    },
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

        console.log('[EPLMatch] Fetching game', gameId);

        // Fetch all teams first
        const teamsResponse = await bdFetch(`${API_BASE}/epl/v1/teams`);
        const teamsMap = {};
        (teamsResponse.data || []).forEach(team => {
          teamsMap[team.id] = team;
        });

        // Fetch recent games to find the match
        const gamesUrl = new URL(`${API_BASE}/epl/v1/games`);
        gamesUrl.searchParams.append("season", "2025");
        gamesUrl.searchParams.append("per_page", "100");
        const gamesResponse = await bdFetch(gamesUrl.toString());

        const game = (gamesResponse.data || []).find(g => g.id === parseInt(gameId));
        if (!game) {
          throw new Error('Game not found');
        }

        const homeTeam = teamsMap[game.home_team_id] || { id: game.home_team_id, name: `Team ${game.home_team_id}` };
        const awayTeam = teamsMap[game.away_team_id] || { id: game.away_team_id, name: `Team ${game.away_team_id}` };

        console.log('[EPLMatch] Found game:', homeTeam.name, 'vs', awayTeam.name);

        // Fetch recent games for both teams
        const [homeGames, awayGames] = await Promise.all([
          fetchTeamRecentGames(game.home_team_id, teamsMap),
          fetchTeamRecentGames(game.away_team_id, teamsMap),
        ]);

        console.log('[EPLMatch] Home games:', homeGames.length, 'Away games:', awayGames.length);

        // Format data
        const homeFormatted = formatGames(homeGames, game.home_team_id);
        const awayFormatted = formatGames(awayGames, game.away_team_id);

        const result = {
          game: {
            id: game.id,
            kickoff: game.kickoff,
            status: game.status,
            homeTeam,
            awayTeam,
          },
          homeTeam: {
            name: homeTeam.name,
            recentGames: homeFormatted,
            averages: calculateAverages(homeFormatted),
            gamesAnalyzed: homeFormatted.length,
          },
          awayTeam: {
            name: awayTeam.name,
            recentGames: awayFormatted,
            averages: calculateAverages(awayFormatted),
            gamesAnalyzed: awayFormatted.length,
          },
        };

        console.log('[EPLMatch] Result:', result);
        setData(result);

      } catch (e) {
        console.error('[EPLMatch] Error:', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalysis();
  }, [gameId]);

  async function fetchTeamRecentGames(teamId, teamsMap) {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const url = new URL(`${API_BASE}/epl/v1/games`);
    url.searchParams.append("season", "2025");
    url.searchParams.append("start_date", startDate);
    url.searchParams.append("end_date", endDate);
    url.searchParams.append("team_ids[]", teamId);
    url.searchParams.append("per_page", "20");

    const response = await bdFetch(url.toString());

    // Filter completed games
    const completedGames = (response.data || []).filter(
      g => g.status === "FullTime" || g.status === "FT"
    );

    const gamesWithStats = [];

    // Fetch stats for each game (limit to 10)
    for (const game of completedGames.slice(0, 10)) {
      try {
        const statsUrl = `${API_BASE}/epl/v1/games/${game.id}/team_stats`;
        const statsResponse = await bdFetch(statsUrl);

        const teams = statsResponse.data?.teams || [];
        let homeStats = {};
        let awayStats = {};

        for (const team of teams) {
          const statsObj = {};
          (team.stats || []).forEach(stat => {
            if (stat.name && stat.value !== undefined) {
              statsObj[stat.name] = stat.value;
            }
          });

          if (team.team_id === game.home_team_id) {
            homeStats = statsObj;
          } else {
            awayStats = statsObj;
          }
        }

        gamesWithStats.push({
          ...game,
          home_team: teamsMap[game.home_team_id] || { id: game.home_team_id, name: `Team ${game.home_team_id}` },
          away_team: teamsMap[game.away_team_id] || { id: game.away_team_id, name: `Team ${game.away_team_id}` },
          home_team_stats: homeStats,
          away_team_stats: awayStats,
        });

      } catch (err) {
        console.error(`[EPLMatch] Error fetching stats for game ${game.id}:`, err);
      }
    }

    return gamesWithStats;
  }

  function formatGames(games, teamId) {
    return games.map(g => {
      const isHome = g.home_team_id === teamId;
      const teamStats = isHome ? g.home_team_stats : g.away_team_stats;

      return {
        gameId: g.id,
        date: g.kickoff,
        opponent: isHome ? g.away_team?.name : g.home_team?.name,
        isHome,
        stats: {
          corners: teamStats?.att_corner || teamStats?.corner_taken || 0,
          yellowCards: teamStats?.total_yel_card || 0,
          redCards: teamStats?.red_card || 0,
          shotsOnTarget: teamStats?.ontarget_scoring_att || 0,
          shotsTotal: (teamStats?.ontarget_scoring_att || 0) + (teamStats?.shot_off_target || 0),
          offsides: teamStats?.total_offside || 0,
          fouls: teamStats?.fk_foul_lost || 0,
          possession: teamStats?.possession_percentage || 0,
        },
      };
    });
  }

  function calculateAverages(games) {
    if (games.length === 0) return null;

    const sum = games.reduce((acc, g) => ({
      corners: acc.corners + g.stats.corners,
      yellowCards: acc.yellowCards + g.stats.yellowCards,
      redCards: acc.redCards + g.stats.redCards,
      shotsOnTarget: acc.shotsOnTarget + g.stats.shotsOnTarget,
      shotsTotal: acc.shotsTotal + g.stats.shotsTotal,
      offsides: acc.offsides + g.stats.offsides,
      fouls: acc.fouls + g.stats.fouls,
    }), { corners: 0, yellowCards: 0, redCards: 0, shotsOnTarget: 0, shotsTotal: 0, offsides: 0, fouls: 0 });

    const count = games.length;
    return {
      corners: (sum.corners / count).toFixed(1),
      yellowCards: (sum.yellowCards / count).toFixed(1),
      redCards: (sum.redCards / count).toFixed(1),
      shotsOnTarget: (sum.shotsOnTarget / count).toFixed(1),
      shotsTotal: (sum.shotsTotal / count).toFixed(1),
      offsides: (sum.offsides / count).toFixed(1),
      fouls: (sum.fouls / count).toFixed(1),
    };
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 24 }}>
        <div style={{
          padding: 40,
          textAlign: "center",
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}>
          <div style={{
            width: 60,
            height: 60,
            margin: "0 auto 20px",
            borderRadius: "50%",
            border: "4px solid rgba(102, 126, 234, 0.2)",
            borderTopColor: "#667eea",
            animation: "spin 1s linear infinite",
          }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>
            Loading Match Analysis...
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
            Fetching data from Ball Don't Lie API
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "grid", gap: 24 }}>
        <Link to="/" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: "#8b5cf6",
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 600,
          padding: "8px 16px",
          background: "rgba(139, 92, 246, 0.1)",
          borderRadius: 12,
          width: "fit-content",
        }}>
          ← Back to Today
        </Link>
        <div style={{
          padding: 24,
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 16,
          color: "#fca5a5",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  const { game, homeTeam, awayTeam } = data;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Back Button */}
      <Link to="/" style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "#8b5cf6",
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 600,
        padding: "8px 16px",
        background: "rgba(139, 92, 246, 0.1)",
        borderRadius: 12,
        width: "fit-content",
        transition: "all 0.2s",
      }}>
        ← Back to Today's Matches
      </Link>

      {/* Match Header */}
      <div style={{
        padding: 32,
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
        }} />

        <div style={{
          fontSize: 32,
          fontWeight: 900,
          marginBottom: 16,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <span>{game.homeTeam.name}</span>
          <span style={{
            fontSize: 24,
            padding: "8px 16px",
            background: "rgba(139, 92, 246, 0.2)",
            borderRadius: 12,
            color: "#a78bfa",
          }}>VS</span>
          <span>{game.awayTeam.name}</span>
        </div>

        <div style={{
          fontSize: 14,
          color: "#94a3b8",
          textAlign: "center",
        }}>
          {game.kickoff ? new Date(game.kickoff).toLocaleString() : "TBD"} • EPL
        </div>
      </div>

      {/* Averages Comparison */}
      <div style={{
        padding: 24,
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}>
        <h3 style={{
          fontSize: 20,
          fontWeight: 800,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <div style={{
            width: 4,
            height: 24,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            borderRadius: 4,
          }} />
          Statistics Comparison (Last {Math.max(homeTeam.gamesAnalyzed, awayTeam.gamesAnalyzed)} Games)
        </h3>

        <div style={{ display: "grid", gap: 12 }}>
          <StatsComparisonRow label="Corners" emoji="🚩" home={homeTeam.averages?.corners} away={awayTeam.averages?.corners} />
          <StatsComparisonRow label="Shots on Target" emoji="🎯" home={homeTeam.averages?.shotsOnTarget} away={awayTeam.averages?.shotsOnTarget} />
          <StatsComparisonRow label="Total Shots" emoji="⚽" home={homeTeam.averages?.shotsTotal} away={awayTeam.averages?.shotsTotal} />
          <StatsComparisonRow label="Yellow Cards" emoji="🟨" home={homeTeam.averages?.yellowCards} away={awayTeam.averages?.yellowCards} />
          <StatsComparisonRow label="Red Cards" emoji="🟥" home={homeTeam.averages?.redCards} away={awayTeam.averages?.redCards} />
          <StatsComparisonRow label="Offsides" emoji="🏴" home={homeTeam.averages?.offsides} away={awayTeam.averages?.offsides} />
          <StatsComparisonRow label="Fouls" emoji="🚨" home={homeTeam.averages?.fouls} away={awayTeam.averages?.fouls} />
        </div>

        <div style={{
          marginTop: 16,
          padding: 12,
          background: "rgba(102, 126, 234, 0.1)",
          borderRadius: 8,
          fontSize: 12,
          color: "#94a3b8",
        }}>
          Combined corners prediction: {(parseFloat(homeTeam.averages?.corners || 0) + parseFloat(awayTeam.averages?.corners || 0)).toFixed(1)}
        </div>
      </div>

      {/* Last 10 Games for Each Team */}
      <div style={{
        display: "grid",
        gap: 24,
        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
      }}>
        {/* Home Team Recent Games */}
        <div style={{
          padding: 24,
          borderRadius: 20,
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}>
          <h3 style={{
            fontSize: 18,
            fontWeight: 800,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <div style={{
              width: 4,
              height: 24,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              borderRadius: 4,
            }} />
            {homeTeam.name} - Last {homeTeam.gamesAnalyzed} Games
          </h3>

          <div style={{ display: "grid", gap: 8 }}>
            {homeTeam.recentGames.map((game, idx) => (
              <GameStatsRow key={game.gameId || idx} game={game} />
            ))}
          </div>
        </div>

        {/* Away Team Recent Games */}
        <div style={{
          padding: 24,
          borderRadius: 20,
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}>
          <h3 style={{
            fontSize: 18,
            fontWeight: 800,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <div style={{
              width: 4,
              height: 24,
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              borderRadius: 4,
            }} />
            {awayTeam.name} - Last {awayTeam.gamesAnalyzed} Games
          </h3>

          <div style={{ display: "grid", gap: 8 }}>
            {awayTeam.recentGames.map((game, idx) => (
              <GameStatsRow key={game.gameId || idx} game={game} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsComparisonRow({ label, emoji, home, away }) {
  const homeVal = parseFloat(home) || 0;
  const awayVal = parseFloat(away) || 0;
  const total = homeVal + awayVal;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center",
      gap: 16,
      padding: 12,
      background: "rgba(100, 116, 139, 0.1)",
      borderRadius: 10,
    }}>
      <div style={{
        textAlign: "right",
        fontSize: 20,
        fontWeight: 700,
        color: homeVal > awayVal ? "#10b981" : "#e2e8f0",
      }}>
        {home || "0"}
      </div>
      <div style={{
        textAlign: "center",
        fontSize: 13,
        color: "#94a3b8",
        minWidth: 120,
      }}>
        {emoji} {label}
        <div style={{ fontSize: 11, color: "#64748b" }}>
          Total: {total.toFixed(1)}
        </div>
      </div>
      <div style={{
        textAlign: "left",
        fontSize: 20,
        fontWeight: 700,
        color: awayVal > homeVal ? "#f59e0b" : "#e2e8f0",
      }}>
        {away || "0"}
      </div>
    </div>
  );
}

function GameStatsRow({ game }) {
  const date = game.date ? new Date(game.date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  }) : '';

  return (
    <div style={{
      padding: 12,
      background: "rgba(100, 116, 139, 0.1)",
      borderRadius: 10,
      fontSize: 13,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
      }}>
        <div style={{ fontWeight: 600, color: "#e2e8f0" }}>
          {game.isHome ? "vs" : "@"} {game.opponent}
        </div>
        <div style={{ color: "#64748b", fontSize: 12 }}>
          {date}
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        fontSize: 11,
      }}>
        <StatBadge label="Corners" value={game.stats.corners} />
        <StatBadge label="Shots" value={game.stats.shotsOnTarget} />
        <StatBadge label="Cards" value={game.stats.yellowCards} color="#f59e0b" />
        <StatBadge label="Fouls" value={game.stats.fouls} />
      </div>
    </div>
  );
}

function StatBadge({ label, value, color = "#94a3b8" }) {
  return (
    <div style={{
      textAlign: "center",
      padding: "4px 6px",
      background: "rgba(0, 0, 0, 0.2)",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "#64748b" }}>{label}</div>
    </div>
  );
}
