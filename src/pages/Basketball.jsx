// src/pages/Basketball.jsx - NBA EV Props using Local API
import { useEffect, useState } from "react";
import Countdown from "../components/Countdown";
import {
  fetchRecommendedBets,
  getStatLabel,
  formatProbability,
  formatGameTime,
  transformPickForTracking,
} from "../utils/nbaLocalApi";
import { trackNBAPrediction, getAllNBAPredictions } from "../services/nbaTracking";

// Helper function to generate global tracking key (matches server format)
function generateGlobalTrackingKey(gameId, playerName, statType, line, type) {
  const sanitize = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `global_${gameId}_${sanitize(playerName)}_${sanitize(statType)}_${line}_${type}`;
}

function GameCard({ game, trackedPredictions, onTrackPrediction }) {
  const [expandedPicks, setExpandedPicks] = useState(new Set());

  // Toggle expanded state for pick details
  const toggleExpanded = (pickKey) => {
    setExpandedPicks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pickKey)) {
        newSet.delete(pickKey);
      } else {
        newSet.add(pickKey);
      }
      return newSet;
    });
  };

  const gameTime = new Date(game.datetime);
  const isUpcoming = gameTime > new Date();

  if (!isUpcoming) {
    return null; // Don't show games that have already started
  }

  return (
    <div
      style={{
        padding: 24,
        borderRadius: 20,
        background:
          "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Game Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
                {game.visitor_team.full_name} ({game.visitor_team.abbreviation})
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                @
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#e2e8f0",
                  marginTop: 4,
                }}
              >
                {game.home_team.full_name} ({game.home_team.abbreviation})
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatGameTime(game.datetime)}
          </div>
        </div>
        <Countdown targetDate={game.datetime} compact={true} />
      </div>

      {/* Best Picks */}
      {game.bestPicks && game.bestPicks.length > 0 ? (
        <div>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#10b981",
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Best Picks ({game.bestPicks.length})
          </h4>
          <div style={{ display: "grid", gap: 12 }}>
            {game.bestPicks.map((pick, idx) => {
              // Generate global tracking key
              const pickKey = generateGlobalTrackingKey(
                game.gameId,
                pick.playerName,
                getStatLabel(pick.stat),
                pick.line,
                pick.side
              );
              const isTracked = trackedPredictions.has(pickKey);
              const isExpanded = expandedPicks.has(pickKey);
              const isCombined = ["pra", "pr", "pa", "ra"].includes(pick.stat);

              return (
                <div
                  key={idx}
                  style={{
                    padding: 16,
                    background: "rgba(16, 185, 129, 0.1)",
                    borderRadius: 12,
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                  }}
                >
                  {/* Player Name */}
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      marginBottom: 8,
                      color: "#10b981",
                    }}
                  >
                    {pick.playerName}
                  </div>

                  {/* Pick Details */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 13,
                      padding: "8px 12px",
                      background: isCombined
                        ? "rgba(16, 185, 129, 0.08)"
                        : "transparent",
                      borderRadius: 6,
                      border: isCombined
                        ? "1px solid rgba(16, 185, 129, 0.15)"
                        : "none",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flex: 1,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>
                        {pick.side === "over" ? "📈" : "📉"}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {pick.side.toUpperCase()} {pick.line}
                      </span>
                      <span style={{ color: "#94a3b8" }}>
                        {getStatLabel(pick.stat)}
                      </span>
                      {isCombined && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            background: "rgba(16, 185, 129, 0.2)",
                            borderRadius: 4,
                            color: "#10b981",
                            fontWeight: 600,
                          }}
                        >
                          {pick.stat.toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <span style={{ color: "#10b981", fontWeight: 700 }}>
                        {formatProbability(pick.probability)}
                      </span>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>
                        @ {pick.fairOdds.toFixed(2)}
                      </span>
                      <button
                        onClick={() => onTrackPrediction(pick, game)}
                        disabled={isTracked}
                        style={{
                          padding: "4px 12px",
                          fontSize: 11,
                          background: isTracked
                            ? "rgba(16, 185, 129, 0.2)"
                            : "rgba(16, 185, 129, 0.8)",
                          color: isTracked ? "#10b981" : "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: isTracked ? "default" : "pointer",
                          fontWeight: 600,
                          opacity: isTracked ? 0.6 : 1,
                        }}
                      >
                        {isTracked ? "✓ Tracked" : "Track"}
                      </button>
                    </span>
                  </div>

                  {/* Stats Overview */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 8,
                      fontSize: 12,
                      color: "#94a3b8",
                    }}
                  >
                    <div>
                      <span style={{ opacity: 0.7 }}>Season Avg: </span>
                      <span style={{ fontWeight: 600, color: "#cbd5e1" }}>
                        {pick.seasonAvg.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span style={{ opacity: 0.7 }}>Recent Avg: </span>
                      <span style={{ fontWeight: 600, color: "#cbd5e1" }}>
                        {pick.recentAvg.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span style={{ opacity: 0.7 }}>Volatility (σ): </span>
                      <span style={{ fontWeight: 600, color: "#cbd5e1" }}>
                        {pick.sigma.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <button
                        onClick={() => toggleExpanded(pickKey)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#10b981",
                          cursor: "pointer",
                          fontSize: 11,
                          textDecoration: "underline",
                          padding: 0,
                          fontWeight: 600,
                        }}
                      >
                        {isExpanded ? "▼ Hide details" : "▶ Show details"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: "rgba(16, 185, 129, 0.05)",
                        borderRadius: 8,
                        border: "1px solid rgba(16, 185, 129, 0.15)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          lineHeight: 1.6,
                        }}
                      >
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ color: "#10b981" }}>
                            Season Average:
                          </strong>{" "}
                          {pick.seasonAvg.toFixed(1)}{" "}
                          {getStatLabel(pick.stat).toLowerCase()}
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ color: "#10b981" }}>
                            Recent Form:
                          </strong>{" "}
                          {pick.recentAvg.toFixed(1)}{" "}
                          {getStatLabel(pick.stat).toLowerCase()} (last 5 games)
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <strong style={{ color: "#10b981" }}>
                            Consistency:
                          </strong>{" "}
                          σ = {pick.sigma.toFixed(1)} (
                          {pick.sigma < 5
                            ? "Very Consistent"
                            : pick.sigma < 8
                            ? "Consistent"
                            : "Variable"}
                          )
                        </div>
                        <div>
                          <strong style={{ color: "#10b981" }}>Value:</strong>{" "}
                          {pick.probability}% probability suggests fair odds of{" "}
                          {pick.fairOdds.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: 30,
            textAlign: "center",
            color: "#94a3b8",
            background: "rgba(100, 116, 139, 0.05)",
            borderRadius: 12,
            border: "1px dashed rgba(100, 116, 139, 0.3)",
          }}
        >
          No qualifying picks found for this game
        </div>
      )}
    </div>
  );
}

export default function Basketball() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [trackedPredictions, setTrackedPredictions] = useState(new Set());

  // Filter controls
  const [minProb, setMinProb] = useState(0.58);
  const [maxProb, setMaxProb] = useState(0.62);
  const [perGame, setPerGame] = useState(5);
  const [gamesCount, setGamesCount] = useState(5);

  // Load predictions
  const loadPredictions = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingProgress("Initializing...");
      console.log("[Basketball] Loading NBA EV predictions from local API...");

      const response = await fetchRecommendedBets({
        minProb,
        maxProb,
        perGame,
        games: gamesCount,
        maxPlayersPerTeam: 6,
        onProgress: (message) => {
          setLoadingProgress(message);
          console.log("[Basketball Progress]", message);
        },
      });

      setData(response);
      setLoadingProgress("");
      console.log(
        `[Basketball] Loaded ${
          response.games?.length || 0
        } games with predictions`
      );
    } catch (e) {
      console.error("[Basketball] load error", e);
      setError(e.message);
      setLoadingProgress("");
    } finally {
      setLoading(false);
    }
  };

  // Load globally tracked predictions
  const loadTrackedPredictions = async () => {
    try {
      const allPredictions = await getAllNBAPredictions();
      // Extract unique keys from all tracked predictions
      const trackedKeys = new Set(allPredictions.map(p => p.id));
      setTrackedPredictions(trackedKeys);
      console.log(`[Basketball] Loaded ${trackedKeys.size} globally tracked predictions`);
    } catch (error) {
      console.error("[Basketball] Error loading tracked predictions:", error);
    }
  };

  useEffect(() => {
    loadPredictions();
    loadTrackedPredictions(); // Load globally tracked predictions
  }, []); // Load once on mount

  // Handle tracking a prediction
  const handleTrackPrediction = async (pick, game) => {
    // Generate global tracking key
    const pickKey = generateGlobalTrackingKey(
      game.gameId,
      pick.playerName,
      getStatLabel(pick.stat),
      pick.line,
      pick.side
    );

    if (trackedPredictions.has(pickKey)) {
      console.log("[Tracking] Already tracked globally:", pickKey);
      return;
    }

    try {
      const trackingData = transformPickForTracking(pick, game);
      const savedKey = await trackNBAPrediction(trackingData);

      // Mark as tracked globally
      setTrackedPredictions((prev) => new Set([...prev, savedKey]));
      console.log("[Tracking] Saved globally:", savedKey);
    } catch (error) {
      console.error("[Tracking] Error:", error);
      alert("Failed to track prediction. Please try again.");
    }
  };

  if (error) {
    return (
      <div style={{ display: "grid", gap: 24 }}>
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            background:
              "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(185, 28, 28, 0.1) 100%)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#fca5a5",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 8,
              color: "#ef4444",
            }}
          >
            Error Loading Predictions
          </div>
          <div
            style={{
              fontSize: 14,
              opacity: 0.9,
              marginBottom: 16,
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.8,
              color: "#94a3b8",
              marginBottom: 12,
            }}
          >
            Make sure your local NBA EV API is running at:
          </div>
          <div
            style={{
              padding: "8px 16px",
              background: "rgba(15, 23, 42, 0.8)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "monospace",
              color: "#10b981",
              marginBottom: 16,
              display: "inline-block",
            }}
          >
            http://localhost:4000
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, color: "#94a3b8" }}>
            The API may take 30-60 seconds to process. Max timeout is 2 minutes.
            <br />
            Render free tier may need time to spin up if inactive.
          </div>
          <button
            onClick={loadPredictions}
            style={{
              marginTop: 16,
              padding: "12px 24px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🔄 Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 40 }}>
      {/* Hero Section */}
      <div
        style={{
          textAlign: "center",
          padding: "40px 20px",
          background:
            "linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%)",
          borderRadius: 24,
          border: "1px solid rgba(245, 158, 11, 0.2)",
        }}
      >
        <h1
          style={{
            fontSize: 48,
            fontWeight: 900,
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 16,
          }}
        >
          🏀 NBA Player Props EV
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "#94a3b8",
            maxWidth: 700,
            margin: "0 auto 16px",
          }}
        >
          Statistical probability-based predictions for NBA player props
        </p>
        <div
          style={{
            fontSize: 13,
            color: "#10b981",
            background: "rgba(16, 185, 129, 0.1)",
            padding: "8px 16px",
            borderRadius: 8,
            display: "inline-block",
          }}
        >
          ✅ Powered by Local NBA EV API - No sportsbook odds required
        </div>
      </div>

      {/* Control Panel */}
      <div
        style={{
          padding: 24,
          background: "rgba(30, 41, 59, 0.5)",
          backdropFilter: "blur(12px)",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 16,
            color: "#10b981",
          }}
        >
          🎯 Filter Controls
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <label
              style={{
                fontSize: 12,
                color: "#94a3b8",
                display: "block",
                marginBottom: 4,
              }}
            >
              Min Probability
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={minProb}
              onChange={(e) => setMinProb(parseFloat(e.target.value))}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: "#94a3b8",
                display: "block",
                marginBottom: 4,
              }}
            >
              Max Probability
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={maxProb}
              onChange={(e) => setMaxProb(parseFloat(e.target.value))}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: "#94a3b8",
                display: "block",
                marginBottom: 4,
              }}
            >
              Picks Per Game
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={perGame}
              onChange={(e) => setPerGame(parseInt(e.target.value))}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: "#94a3b8",
                display: "block",
                marginBottom: 4,
              }}
            >
              Games To Scan
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={gamesCount}
              onChange={(e) => setGamesCount(parseInt(e.target.value))}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </div>
        </div>
        <button
          onClick={loadPredictions}
          disabled={loading}
          style={{
            marginTop: 16,
            padding: "12px 24px",
            background: loading
              ? "rgba(100, 116, 139, 0.3)"
              : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            color: loading ? "#64748b" : "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            width: "100%",
          }}
        >
          {loading ? loadingProgress || "Loading..." : "🔄 Refresh Predictions"}
        </button>
      </div>

      {/* Games List */}
      <div style={{ display: "grid", gap: 24 }}>
        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              background: "rgba(16, 185, 129, 0.05)",
              borderRadius: 16,
              border: "1px solid rgba(16, 185, 129, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: 48,
                marginBottom: 16,
                animation: "spin 2s linear infinite",
              }}
            >
              🏀
            </div>
            <div
              style={{
                marginBottom: 12,
                fontSize: 18,
                fontWeight: 600,
                color: "#10b981",
              }}
            >
              Loading NBA Predictions...
            </div>
            {loadingProgress && (
              <div
                style={{
                  fontSize: 14,
                  color: "#94a3b8",
                  marginBottom: 8,
                  fontWeight: 500,
                }}
              >
                {loadingProgress}
              </div>
            )}
            <div style={{ fontSize: 13, opacity: 0.7, color: "#94a3b8" }}>
              This may take 30-60 seconds as the API processes statistics
            </div>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg) scale(1); }
                50% { transform: rotate(180deg) scale(1.1); }
                100% { transform: rotate(360deg) scale(1); }
              }
            `}</style>
          </div>
        ) : !data || !data.games || data.games.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "#94a3b8",
              background: "rgba(100, 116, 139, 0.05)",
              borderRadius: 16,
              border: "1px dashed rgba(100, 116, 139, 0.3)",
            }}
          >
            ⚠️ No qualifying picks found. Try adjusting the filter settings.
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div
              style={{
                padding: 16,
                background: "rgba(16, 185, 129, 0.1)",
                borderRadius: 12,
                border: "1px solid rgba(16, 185, 129, 0.2)",
                fontSize: 13,
                color: "#94a3b8",
              }}
            >
              <strong style={{ color: "#10b981" }}>Season:</strong>{" "}
              {data.season} |
              <strong style={{ color: "#10b981", marginLeft: 8 }}>
                Probability Range:
              </strong>{" "}
              {(data.minProb * 100).toFixed(0)}% -{" "}
              {(data.maxProb * 100).toFixed(0)}% |
              <strong style={{ color: "#10b981", marginLeft: 8 }}>
                Max Per Game:
              </strong>{" "}
              {data.perGame} picks
            </div>

            {/* Games */}
            {data.games.map((game) => (
              <GameCard
                key={game.gameId}
                game={game}
                trackedPredictions={trackedPredictions}
                onTrackPrediction={handleTrackPrediction}
              />
            ))}
          </>
        )}
      </div>

      {/* Info Box */}
      <div
        style={{
          padding: 20,
          background: "rgba(16, 185, 129, 0.1)",
          borderRadius: 16,
          border: "1px solid rgba(16, 185, 129, 0.3)",
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 12,
            color: "#10b981",
          }}
        >
          🏀 About NBA EV Player Props
        </h3>
        <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
          <ul style={{ margin: "0", paddingLeft: 24 }}>
            <li>
              Powered by NBA EV calculation API on Render
            </li>
            <li>
              Pure statistical probability model - no sportsbook odds required
            </li>
            <li>
              Individual props: Points, Rebounds, Assists, 3-Pointers Made
            </li>
            <li>
              Combined props: PRA (Pts+Reb+Ast), PR (Pts+Reb), PA (Pts+Ast), RA
              (Reb+Ast)
            </li>
            <li>
              Based on season averages, recent form, and standard deviation
            </li>
            <li>Fair odds calculated as 1 / probability_decimal</li>
            <li>
              Customize probability range and picks per game using controls
              above
            </li>
            <li>
              Click "Track" to save predictions to Firebase for result checking
            </li>
            <li>Game times displayed in CET timezone</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
