// src/pages/EPLMatch.jsx - EPL Match Analysis with Last 10 Games Stats
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_FOOTBALL_API_URL || 'http://localhost:4000';

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

        const response = await fetch(`${API_BASE_URL}/api/epl/match/${gameId}/analysis`);

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error || `Failed to fetch: ${response.status}`);
        }

        const result = await response.json();
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

        <div style={{
          display: "grid",
          gap: 12,
        }}>
          <StatsComparisonRow
            label="Corners"
            emoji="🚩"
            home={homeTeam.averages?.corners}
            away={awayTeam.averages?.corners}
          />
          <StatsComparisonRow
            label="Shots on Target"
            emoji="🎯"
            home={homeTeam.averages?.shotsOnTarget}
            away={awayTeam.averages?.shotsOnTarget}
          />
          <StatsComparisonRow
            label="Total Shots"
            emoji="⚽"
            home={homeTeam.averages?.shotsTotal}
            away={awayTeam.averages?.shotsTotal}
          />
          <StatsComparisonRow
            label="Yellow Cards"
            emoji="🟨"
            home={homeTeam.averages?.yellowCards}
            away={awayTeam.averages?.yellowCards}
          />
          <StatsComparisonRow
            label="Red Cards"
            emoji="🟥"
            home={homeTeam.averages?.redCards}
            away={awayTeam.averages?.redCards}
          />
          <StatsComparisonRow
            label="Offsides"
            emoji="🏴"
            home={homeTeam.averages?.offsides}
            away={awayTeam.averages?.offsides}
          />
          <StatsComparisonRow
            label="Fouls"
            emoji="🚨"
            home={homeTeam.averages?.fouls}
            away={awayTeam.averages?.fouls}
          />
        </div>

        <div style={{
          marginTop: 16,
          padding: 12,
          background: "rgba(102, 126, 234, 0.1)",
          borderRadius: 8,
          fontSize: 12,
          color: "#94a3b8",
        }}>
          Combined prediction: {parseFloat(homeTeam.averages?.corners || 0) + parseFloat(awayTeam.averages?.corners || 0)} corners
        </div>
      </div>

      {/* Last 10 Games for Each Team */}
      <div style={{
        display: "grid",
        gap: 24,
        gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
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
