// src/pages/Today.jsx - Today's Value Bets Dashboard (using balldontlie.io)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTodaysEPLMatches, formatEPLPredictionsForUI } from "../utils/footballApi";
import { savePrediction, getTodaysPredictions, getAccuracyStats, downloadPredictionsJSON } from "../utils/predictionTracker";
import Skeleton from "../components/Skeleton";

function PredictionCard({ match, predictions, onTrack }) {
  const [tracked, setTracked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [individualTracked, setIndividualTracked] = useState({});
  const [individualSaving, setIndividualSaving] = useState({});

  const marketKeyMap = {
    'Corners': 'corners',
    'Yellow Cards': 'yellowcards',
    'Total Shots': 'shots_total',
    'Shots on Target': 'shots_on_target',
    'Red Cards': 'redcards',
    'Offsides': 'offsides',
  };

  const matchInfo = {
    eventId: match.id,
    homeName: match.home.name,
    homeTeamId: match.home.id,
    awayName: match.away.name,
    awayTeamId: match.away.id,
    kickoffISO: match.time ? new Date(match.time * 1000).toISOString() : null,
    leagueName: match.league.name,
    leagueId: match.league.id,
  };

  const handleTrackAll = async () => {
    setSaving(true);
    try {
      // Save all predictions (Firebase will handle duplicates)
      await Promise.all(
        predictions.map(pred => {
          const predWithKey = {
            ...pred,
            marketKey: marketKeyMap[pred.market] || pred.market.toLowerCase().replace(/\s+/g, '_'),
          };
          return savePrediction(predWithKey, matchInfo);
        })
      );

      setTracked(true);
      // Mark all as individually tracked too
      const allTracked = {};
      predictions.forEach((_, idx) => {
        allTracked[idx] = true;
      });
      setIndividualTracked(allTracked);

      if (onTrack) onTrack();
    } catch (error) {
      console.error('[Today] Error tracking predictions:', error);
      alert('Error saving predictions. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleTrackIndividual = async (pred, idx) => {
    setIndividualSaving(prev => ({ ...prev, [idx]: true }));
    try {
      const predWithKey = {
        ...pred,
        marketKey: marketKeyMap[pred.market] || pred.market.toLowerCase().replace(/\s+/g, '_'),
      };
      await savePrediction(predWithKey, matchInfo);

      setIndividualTracked(prev => ({ ...prev, [idx]: true }));

      // Check if all are tracked
      const allTracked = predictions.every((_, i) => individualTracked[i] || i === idx);
      if (allTracked) {
        setTracked(true);
      }

      if (onTrack) onTrack();
    } catch (error) {
      console.error('[Today] Error tracking individual prediction:', error);
      alert('Error saving prediction. Check console for details.');
    } finally {
      setIndividualSaving(prev => ({ ...prev, [idx]: false }));
    }
  };

  const kickoffTime = match.time ? new Date(match.time * 1000) : null;
  const hoursUntilKickoff = kickoffTime ? Math.round((kickoffTime.getTime() - Date.now()) / (1000 * 60 * 60)) : null;

  return (
    <div style={{
      padding: 20,
      background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
      borderRadius: 16,
      border: "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: "0 4px 12px -2px rgba(0, 0, 0, 0.3)",
      overflow: "hidden",
    }}>
      {/* Match Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {match.home.name} vs {match.away.name}
          </div>
          {hoursUntilKickoff !== null && (
            <div style={{
              fontSize: 12,
              padding: "4px 12px",
              background: hoursUntilKickoff < 2 ? "rgba(239, 68, 68, 0.2)" : "rgba(102, 126, 234, 0.2)",
              borderRadius: 8,
              color: hoursUntilKickoff < 2 ? "#fca5a5" : "#a78bfa",
              fontWeight: 600,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}>
              {hoursUntilKickoff < 1 ? "Soon!" : `${hoursUntilKickoff}h`}
            </div>
          )}
        </div>

        <div style={{
          fontSize: 13,
          color: "#94a3b8",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {match.league.name}
          </span>
          <span>•</span>
          <span style={{
            whiteSpace: "nowrap",
          }}>
            {kickoffTime ? kickoffTime.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }) : "TBD"}
          </span>
        </div>
      </div>

      {/* Predictions List */}
      <div style={{
        display: "grid",
        gap: 10,
        marginBottom: 16,
      }}>
        {predictions.map((pred, idx) => {
          const isTracked = individualTracked[idx];
          const isSaving = individualSaving[idx];

          return (
            <div key={idx} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 12,
              background: "rgba(102, 126, 234, 0.1)",
              borderRadius: 10,
              border: "1px solid rgba(102, 126, 234, 0.2)",
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 4,
                }}>
                  {pred.emoji} {pred.type === 'over' ? 'Over' : 'Under'} {pred.line} {pred.market}
                </div>
                <div style={{
                  fontSize: 12,
                  color: "#94a3b8",
                }}>
                  Home avg: {pred.homeAvg} • Away avg: {pred.awayAvg} • Combined: {pred.prediction}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#10b981",
                  }}>
                    {pred.percentage}%
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: "#94a3b8",
                  }}>
                    @ {pred.odds.toFixed(2)}
                  </div>
                </div>

                <div style={{
                  fontSize: 10,
                  padding: "4px 8px",
                  background: pred.confidence === 'high' ? "rgba(16, 185, 129, 0.2)" : pred.confidence === 'medium' ? "rgba(245, 158, 11, 0.2)" : "rgba(148, 163, 184, 0.2)",
                  color: pred.confidence === 'high' ? "#10b981" : pred.confidence === 'medium' ? "#f59e0b" : "#94a3b8",
                  borderRadius: 6,
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}>
                  {pred.confidence}
                </div>

                {/* Individual Track Button */}
                <button
                  onClick={() => handleTrackIndividual(pred, idx)}
                  disabled={isTracked || isSaving}
                  style={{
                    padding: "6px 12px",
                    background: isTracked ? "rgba(100, 116, 139, 0.2)" : isSaving ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
                    border: isTracked ? "1px solid rgba(100, 116, 139, 0.3)" : isSaving ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: 8,
                    color: isTracked ? "#64748b" : isSaving ? "#f59e0b" : "#10b981",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: (isTracked || isSaving) ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (!isTracked && !isSaving) {
                      e.currentTarget.style.background = "rgba(16, 185, 129, 0.3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isTracked && !isSaving) {
                      e.currentTarget.style.background = "rgba(16, 185, 129, 0.2)";
                    }
                  }}
                >
                  {isTracked ? "✓" : isSaving ? "..." : "Track"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{
        display: "flex",
        gap: 12,
      }}>
        <Link
          to={`/match/${match.id}`}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: "rgba(139, 92, 246, 0.2)",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            borderRadius: 10,
            color: "#a78bfa",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            textAlign: "center",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(139, 92, 246, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(139, 92, 246, 0.2)";
          }}
        >
          View Full Analysis
        </Link>

        <button
          onClick={handleTrackAll}
          disabled={tracked || saving}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: tracked ? "rgba(100, 116, 139, 0.2)" : saving ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
            border: tracked ? "1px solid rgba(100, 116, 139, 0.3)" : saving ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: 10,
            color: tracked ? "#64748b" : saving ? "#f59e0b" : "#10b981",
            fontSize: 14,
            fontWeight: 600,
            cursor: (tracked || saving) ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!tracked && !saving) {
              e.currentTarget.style.background = "rgba(16, 185, 129, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (!tracked && !saving) {
              e.currentTarget.style.background = "rgba(16, 185, 129, 0.2)";
            }
          }}
        >
          {tracked ? "✓ Tracked" : saving ? "Saving..." : "Track All"}
        </button>
      </div>
    </div>
  );
}

export default function Today() {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // "all", "corners", "shots", "cards"
  const [sortBy, setSortBy] = useState("time"); // "time", "probability", "confidence"
  const [trackedCount, setTrackedCount] = useState(0);

  useEffect(() => {
    loadTodaysMatches();
  }, []);

  async function loadTodaysMatches() {
    const t0 = performance.now();
    console.log("[Today] Loading EPL matches from balldontlie.io...");

    try {
      setLoading(true);
      setError(null);

      // Fetch EPL matches from new API
      const response = await fetchTodaysEPLMatches({
        minProb: 0.58,
        maxProb: 0.62,
        games: 10,
      });

      console.log("[Today] API Response:", response);

      // Format predictions for UI
      const formattedPredictions = formatEPLPredictionsForUI(response.matches || []);

      console.log(`[Today] Found ${formattedPredictions.length} matches with predictions`);

      // Extract matches for state
      const matchesArray = formattedPredictions.map(p => p.match);
      setMatches(matchesArray);
      setPredictions(formattedPredictions);

      console.log(`[Today] Loaded in ${Math.round(performance.now() - t0)}ms`);

    } catch (e) {
      console.error("[Today] Error:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredPredictions = predictions.filter(p => {
    if (filter === "all") return true;
    if (filter === "corners") return p.predictions.some(pred => pred.market.toLowerCase().includes("corners"));
    if (filter === "shots") return p.predictions.some(pred => pred.market.toLowerCase().includes("shots"));
    if (filter === "cards") return p.predictions.some(pred => pred.market.toLowerCase().includes("cards"));
    if (filter === "goals") return p.predictions.some(pred => pred.market.toLowerCase().includes("goals"));
    if (filter === "players") return p.predictions.some(pred => pred.isProp === true);
    return true;
  });

  const sortedPredictions = [...filteredPredictions].sort((a, b) => {
    if (sortBy === "time") {
      const aTime = a.match.time || 0;
      const bTime = b.match.time || 0;
      return aTime - bTime;
    }
    if (sortBy === "probability") {
      const aMax = Math.max(...a.predictions.map(p => p.probability));
      const bMax = Math.max(...b.predictions.map(p => p.probability));
      return bMax - aMax;
    }
    if (sortBy === "confidence") {
      const confScore = { high: 3, medium: 2, low: 1 };
      const aMax = Math.max(...a.predictions.map(p => confScore[p.confidence] || 0));
      const bMax = Math.max(...b.predictions.map(p => confScore[p.confidence] || 0));
      return bMax - aMax;
    }
    return 0;
  });

  const totalBets = predictions.reduce((sum, p) => sum + p.predictions.length, 0);
  const highConfidenceBets = predictions.reduce((sum, p) =>
    sum + p.predictions.filter(pred => pred.confidence === 'high').length, 0
  );

  const accuracy = getAccuracyStats();

  return (
    <div style={{ display: "grid", gap: 32 }}>
      {/* Header */}
      <div style={{
        padding: 32,
        background: "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)",
        borderRadius: 24,
        border: "1px solid rgba(102, 126, 234, 0.2)",
      }}>
        <h1 style={{
          fontSize: 42,
          fontWeight: 900,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 12,
        }}>
          📊 Today's Value Bets
        </h1>
        <p style={{
          fontSize: 16,
          color: "#94a3b8",
          marginBottom: 20,
        }}>
          EPL betting opportunities powered by balldontlie.io - Match stats & Player props with 58-62% probability
        </p>

        {/* Quick Stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}>
          <div style={{
            padding: 16,
            background: "rgba(16, 185, 129, 0.1)",
            borderRadius: 12,
            border: "1px solid rgba(16, 185, 129, 0.2)",
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#10b981" }}>
              {loading ? "..." : totalBets}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              Total Value Bets
            </div>
          </div>

          <div style={{
            padding: 16,
            background: "rgba(139, 92, 246, 0.1)",
            borderRadius: 12,
            border: "1px solid rgba(139, 92, 246, 0.2)",
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#a78bfa" }}>
              {loading ? "..." : predictions.length}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              Matches Analyzed
            </div>
          </div>

          <div style={{
            padding: 16,
            background: "rgba(245, 158, 11, 0.1)",
            borderRadius: 12,
            border: "1px solid rgba(245, 158, 11, 0.2)",
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#f59e0b" }}>
              {loading ? "..." : highConfidenceBets}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              High Confidence
            </div>
          </div>

          <div style={{
            padding: 16,
            background: "rgba(6, 182, 212, 0.1)",
            borderRadius: 12,
            border: "1px solid rgba(6, 182, 212, 0.2)",
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#06b6d4" }}>
              {accuracy.total > 0 ? `${accuracy.accuracy}%` : "N/A"}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              Historical Accuracy
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Actions */}
      <div style={{
        display: "grid",
        gap: 16,
      }}>
        {/* Filters */}
        <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}>
          {["all", "corners", "shots", "cards", "goals", "players"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "8px 16px",
                background: filter === f ? "rgba(102, 126, 234, 0.3)" : "rgba(100, 116, 139, 0.1)",
                border: filter === f ? "1px solid rgba(102, 126, 234, 0.5)" : "1px solid rgba(100, 116, 139, 0.2)",
                borderRadius: 10,
                color: filter === f ? "#a78bfa" : "#94a3b8",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.2s",
              }}
            >
              {f === "players" ? "Player Props" : f}
            </button>
          ))}
        </div>

        {/* Sort & Export */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: "1 1 auto",
          }}>
            <span style={{
              fontSize: 14,
              color: "#94a3b8",
              whiteSpace: "nowrap",
            }}>
              Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: "8px 12px",
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 10,
                color: "#e2e8f0",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                minWidth: 0,
              }}
            >
              <option value="time">Earliest</option>
              <option value="probability">Probability</option>
              <option value="confidence">Confidence</option>
            </select>
          </div>

          {/* Export Button */}
          <button
            onClick={downloadPredictionsJSON}
            style={{
              padding: "8px 16px",
              background: "rgba(16, 185, 129, 0.2)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 10,
              color: "#10b981",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            📥 Export
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: 20,
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 12,
          color: "#fca5a5",
        }}>
          Error: {error}
        </div>
      )}

      {/* Loading Animation */}
      {loading && (
        <div style={{
          display: "grid",
          gap: 32,
        }}>
          {/* Animated Loading Header */}
          <div style={{
            textAlign: "center",
            padding: 40,
          }}>
            <div style={{
              width: 80,
              height: 80,
              margin: "0 auto 24px",
              borderRadius: "50%",
              border: "4px solid rgba(102, 126, 234, 0.2)",
              borderTopColor: "#667eea",
              animation: "spin 1s linear infinite",
            }} />
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#e2e8f0",
              marginBottom: 8,
            }}>
              Analyzing Today's Matches
            </div>
            <div style={{
              fontSize: 14,
              color: "#94a3b8",
            }}>
              Calculating probabilities and finding value bets...
            </div>
          </div>

          {/* Loading Skeleton Cards */}
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              padding: 20,
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
              borderRadius: 16,
              border: "1px solid rgba(255, 255, 255, 0.1)",
              animation: `pulse 1.5s ease-in-out infinite ${i * 0.2}s`,
            }}>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{
                  height: 24,
                  width: "60%",
                  background: "rgba(100, 116, 139, 0.3)",
                  borderRadius: 8,
                }} />
                <div style={{
                  height: 16,
                  width: "40%",
                  background: "rgba(100, 116, 139, 0.2)",
                  borderRadius: 6,
                }} />
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{
                    height: 48,
                    background: "rgba(102, 126, 234, 0.1)",
                    borderRadius: 10,
                  }} />
                  <div style={{
                    height: 48,
                    background: "rgba(102, 126, 234, 0.1)",
                    borderRadius: 10,
                  }} />
                </div>
              </div>
            </div>
          ))}

          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `}</style>
        </div>
      )}

      {/* Predictions List */}
      {!loading && sortedPredictions.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: 60,
          background: "rgba(100, 116, 139, 0.1)",
          borderRadius: 16,
          border: "1px solid rgba(100, 116, 139, 0.2)",
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16,
          }}>
            🤷
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#e2e8f0",
            marginBottom: 8,
          }}>
            No value bets found today
          </div>
          <div style={{
            fontSize: 14,
            color: "#94a3b8",
          }}>
            Try checking back later or adjusting your filters
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 20 }}>
        {sortedPredictions.map((item, idx) => (
          <PredictionCard
            key={idx}
            match={item.match}
            predictions={item.predictions}
            onTrack={() => setTrackedCount(c => c + 1)}
          />
        ))}
      </div>

      {/* Info Box */}
      {!loading && sortedPredictions.length > 0 && (
        <div style={{
          padding: 20,
          background: "rgba(102, 126, 234, 0.1)",
          borderRadius: 16,
          border: "1px solid rgba(102, 126, 234, 0.2)",
        }}>
          <h3 style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 12,
            color: "#667eea",
          }}>
            💡 How to Use
          </h3>
          <ul style={{
            fontSize: 14,
            color: "#94a3b8",
            lineHeight: 1.6,
            margin: 0,
            paddingLeft: 24,
          }}>
            <li>Click "Track All" to save predictions to local storage for later verification</li>
            <li>Click "View Full Analysis" to see detailed team statistics</li>
            <li>Use filters to focus on specific bet types (Corners, Shots, Cards, Goals, Player Props)</li>
            <li>Click "Export JSON" to download all tracked predictions for external analysis</li>
            <li>All predictions use probability models from balldontlie.io EPL data</li>
            <li>Player props show individual player statistics (goals, assists, shots, cards, etc.)</li>
            <li>Match stats show combined team totals (corners, offsides, fouls, tackles, etc.)</li>
          </ul>
        </div>
      )}
    </div>
  );
}
