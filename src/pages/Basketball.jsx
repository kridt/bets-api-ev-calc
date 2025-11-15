// src/pages/Basketball.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Countdown from "../components/Countdown";
import { calculateBettingPredictions } from "../utils/probability";
import { getCachedTopPlayers, fetchUpcomingGames } from "../utils/nbaApi";
import { trackNBAPrediction } from "../services/nbaTracking";

function calculatePlayerPropPredictions(playerStats, gameDetails = []) {
  const predictions = [];

  // Calculate player form (weighted average favoring recent games)
  function calculateFormWeightedAvg(values) {
    if (!values || values.length === 0) return 0;

    // Weight recent games more heavily: [1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6]
    let weightedSum = 0;
    let totalWeight = 0;

    values.forEach((val, idx) => {
      const weight = 1.5 - (idx * 0.1); // More recent = higher weight
      weightedSum += val * Math.max(weight, 0.6);
      totalWeight += Math.max(weight, 0.6);
    });

    return weightedSum / totalWeight;
  }

  // Calculate trend (positive = improving, negative = declining)
  function calculateTrend(values) {
    if (!values || values.length < 5) return 0;
    const recent = values.slice(0, 5);
    const older = values.slice(5, 10);
    if (older.length === 0) return 0;

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    return recentAvg - olderAvg;
  }

  // Individual stats (Points, Rebounds, Assists)
  const individualStats = [
    { key: 'pts', name: 'Points', emoji: '🎯' },
    { key: 'reb', name: 'Rebounds', emoji: '🏀' },
    { key: 'ast', name: 'Assists', emoji: '🤝' }
  ];

  individualStats.forEach(({ key, name, emoji }) => {
    const values = playerStats[key];
    if (!values || values.length === 0) return;

    // Use form-weighted average instead of simple average
    const formAvg = calculateFormWeightedAvg(values);
    const trend = calculateTrend(values);

    // Standard deviation for probability calculation
    const squareDiffs = values.map(v => Math.pow(v - formAvg, 2));
    const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);

    // Get last 5 games for display
    const last5Games = values.slice(0, 5);

    // Get last 5 game details for this specific stat
    const last5GameDetails = gameDetails.slice(0, 5).map(game => ({
      date: game.date,
      opponent: game.opponent,
      value: game[key] // Get the specific stat (pts, reb, or ast)
    }));

    // Find lines in 63-67% probability range for better value
    for (let line = Math.max(0, formAvg - 2); line <= formAvg + 2; line += 0.5) {
      const z = (line - formAvg) / stdDev;
      const cdf = 0.5 * (1 + erf(z / Math.sqrt(2)));
      let probOver = 1 - cdf;

      // Adjust probability based on trend (hot hand theory)
      if (trend > 0) probOver *= 1.02; // Slight boost if improving
      if (trend < 0) probOver *= 0.98; // Slight penalty if declining

      if (probOver >= 0.63 && probOver <= 0.67) {
        predictions.push({
          stat: name,
          emoji,
          line: Number(line.toFixed(1)), // Round to 1 decimal place
          type: 'over',
          probability: probOver,
          odds: 1 / probOver,
          percentage: (probOver * 100).toFixed(1),
          avg: formAvg.toFixed(1),
          propType: 'individual',
          last5Games: last5Games,
          last5GameDetails: last5GameDetails,
          trend: trend.toFixed(1),
          statKey: key
        });
      }

      let probUnder = cdf;
      if (trend > 0) probUnder *= 0.98; // Penalty if improving
      if (trend < 0) probUnder *= 1.02; // Boost if declining

      if (probUnder >= 0.63 && probUnder <= 0.67) {
        predictions.push({
          stat: name,
          emoji,
          line: Number(line.toFixed(1)), // Round to 1 decimal place
          type: 'under',
          probability: probUnder,
          odds: 1 / probUnder,
          percentage: (probUnder * 100).toFixed(1),
          avg: formAvg.toFixed(1),
          propType: 'individual',
          last5Games: last5Games,
          last5GameDetails: last5GameDetails,
          trend: trend.toFixed(1),
          statKey: key
        });
      }
    }
  });

  // Combined props (commonly bet on)
  const combinedProps = [
    {
      keys: ['pts', 'reb', 'ast'],
      name: 'Pts+Reb+Ast',
      emoji: '💎',
      shortName: 'PRA'
    },
    {
      keys: ['pts', 'ast'],
      name: 'Pts+Ast',
      emoji: '⚡',
      shortName: 'PA'
    },
    {
      keys: ['pts', 'reb'],
      name: 'Pts+Reb',
      emoji: '🔥',
      shortName: 'PR'
    },
    {
      keys: ['reb', 'ast'],
      name: 'Reb+Ast',
      emoji: '🌟',
      shortName: 'RA'
    }
  ];

  combinedProps.forEach(({ keys, name, emoji, shortName }) => {
    // Check if all required stats are available
    if (!keys.every(key => playerStats[key] && playerStats[key].length > 0)) return;

    // Calculate combined values for each game
    const combinedValues = [];
    const numGames = playerStats[keys[0]].length;

    for (let i = 0; i < numGames; i++) {
      let sum = 0;
      for (const key of keys) {
        sum += playerStats[key][i] || 0;
      }
      combinedValues.push(sum);
    }

    // Use form-weighted average for combined stats as well
    const formAvg = calculateFormWeightedAvg(combinedValues);
    const trend = calculateTrend(combinedValues);

    // Standard deviation for probability calculation
    const squareDiffs = combinedValues.map(v => Math.pow(v - formAvg, 2));
    const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / combinedValues.length);

    // Get last 5 games for display
    const last5Games = combinedValues.slice(0, 5);

    // Get last 5 game details for this combined stat
    const last5GameDetails = gameDetails.slice(0, 5).map(game => {
      // Calculate combined value for this game
      const combinedValue = keys.reduce((sum, key) => sum + (game[key] || 0), 0);
      return {
        date: game.date,
        opponent: game.opponent,
        value: combinedValue
      };
    });

    // Find lines in 63-67% probability range
    for (let line = Math.max(0, formAvg - 3); line <= formAvg + 3; line += 0.5) {
      const z = (line - formAvg) / stdDev;
      const cdf = 0.5 * (1 + erf(z / Math.sqrt(2)));
      let probOver = 1 - cdf;

      // Adjust probability based on trend (hot hand theory)
      if (trend > 0) probOver *= 1.02; // Slight boost if improving
      if (trend < 0) probOver *= 0.98; // Slight penalty if declining

      if (probOver >= 0.63 && probOver <= 0.67) {
        predictions.push({
          stat: name,
          emoji,
          line: Number(line.toFixed(1)), // Round to 1 decimal place
          type: 'over',
          probability: probOver,
          odds: 1 / probOver,
          percentage: (probOver * 100).toFixed(1),
          avg: formAvg.toFixed(1),
          propType: 'combined',
          shortName,
          last5Games: last5Games,
          last5GameDetails: last5GameDetails,
          trend: trend.toFixed(1),
          statKey: keys.join('+')
        });
      }

      let probUnder = cdf;
      if (trend > 0) probUnder *= 0.98; // Penalty if improving
      if (trend < 0) probUnder *= 1.02; // Boost if declining

      if (probUnder >= 0.63 && probUnder <= 0.67) {
        predictions.push({
          stat: name,
          emoji,
          line: Number(line.toFixed(1)), // Round to 1 decimal place
          type: 'under',
          probability: probUnder,
          odds: 1 / probUnder,
          percentage: (probUnder * 100).toFixed(1),
          avg: formAvg.toFixed(1),
          propType: 'combined',
          shortName,
          last5Games: last5Games,
          last5GameDetails: last5GameDetails,
          trend: trend.toFixed(1),
          statKey: keys.join('+')
        });
      }
    }
  });

  // Return top 2 predictions sorted by probability closest to 65%
  return predictions
    .sort((a, b) => Math.abs(b.probability - 0.65) - Math.abs(a.probability - 0.65))
    .slice(0, 2); // Show best 2 predictions per player
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function GameCard({ game }) {
  const homeName = game.home?.name || "Home Team";
  const awayName = game.away?.name || "Away Team";
  const ko = game.time ? new Date(game.time * 1000).toISOString() : null;

  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculatingPredictions, setCalculatingPredictions] = useState(true);
  const [trackedPredictions, setTrackedPredictions] = useState(new Set());
  const [expandedPredictions, setExpandedPredictions] = useState(new Set());

  // Toggle expanded state for game details
  const toggleExpanded = (predictionKey) => {
    setExpandedPredictions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(predictionKey)) {
        newSet.delete(predictionKey);
      } else {
        newSet.add(predictionKey);
      }
      return newSet;
    });
  };

  // Handle tracking a prediction
  const handleTrackPrediction = async (prediction, playerName, playerTeam) => {
    const predictionKey = `${game.id}_${playerName}_${prediction.stat}_${prediction.line}_${prediction.type}`;

    if (trackedPredictions.has(predictionKey)) {
      console.log('[Tracking] Already tracked:', predictionKey);
      return;
    }

    try {
      await trackNBAPrediction({
        gameId: game.id,
        homeTeam: homeName,
        awayTeam: awayName,
        gameTime: new Date(game.time * 1000).toLocaleString("en-GB", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        }),
        gameTimeISO: new Date(game.time * 1000).toISOString(),
        playerName: playerName,
        playerTeam: playerTeam,
        playerId: null, // Can add player ID from API later
        statType: prediction.stat,
        shortName: prediction.shortName || prediction.stat.substring(0, 3).toUpperCase(),
        propType: prediction.propType,
        line: prediction.line,
        type: prediction.type,
        probability: prediction.probability,
        percentage: prediction.percentage,
        odds: prediction.odds,
      });

      // Mark as tracked
      setTrackedPredictions(prev => new Set([...prev, predictionKey]));
      console.log('[Tracking] Saved:', predictionKey);

    } catch (error) {
      console.error('[Tracking] Error:', error);
      alert('Failed to track prediction. Please try again.');
    }
  };

  useEffect(() => {
    async function loadPlayers() {
      try {
        setLoading(true);
        setCalculatingPredictions(true);
        console.log(`[Basketball] Loading players for ${homeName} vs ${awayName}`);

        // GOAT tier: 600 req/min - can load teams in parallel
        const [home, away] = await Promise.all([
          getCachedTopPlayers(homeName, 5),
          getCachedTopPlayers(awayName, 5)
        ]);

        setHomePlayers(home);
        setAwayPlayers(away);

        console.log(`[Basketball] Loaded ${home.length} home players, ${away.length} away players`);
        console.log(`[Basketball] Calculating predictions with form-weighted averages...`);

        // Give UI a moment to update, then mark predictions as calculated
        setTimeout(() => setCalculatingPredictions(false), 100);
      } catch (error) {
        console.error("[Basketball] Error loading players:", error);
        setHomePlayers([]);
        setAwayPlayers([]);
      } finally {
        setLoading(false);
      }
    }

    loadPlayers();
  }, [homeName, awayName]);

  return (
    <div style={{
      padding: 24,
      borderRadius: 20,
      background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
    }}>
      {/* Game Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{homeName}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>vs</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginTop: 4 }}>{awayName}</div>
            </div>
          </div>
          <div style={{
            fontSize: 12,
            color: "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            {ko ? new Date(ko).toLocaleString("en-GB", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Paris",
              timeZoneName: "short"
            }) : "TBD"}
          </div>
        </div>
        {ko && <Countdown targetDate={ko} compact={true} />}
      </div>

      {/* Player Props */}
      <div style={{ display: "grid", gap: 20 }}>
        {/* Home Team Players */}
        <div>
          <h4 style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#10b981",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            {homeName} - Top Props
          </h4>
          {calculatingPredictions ? (
            <div style={{
              padding: 30,
              textAlign: "center",
              color: "#94a3b8",
              background: "rgba(16, 185, 129, 0.05)",
              borderRadius: 12,
              border: "1px dashed rgba(16, 185, 129, 0.3)",
            }}>
              <div style={{
                fontSize: 32,
                marginBottom: 12,
                animation: "bounce 1s ease-in-out infinite"
              }}>
                🏀
              </div>
              <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#10b981" }}>
                Calculating predictions...
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Analyzing form-weighted averages and player trends
              </div>
              <style>{`
                @keyframes bounce {
                  0%, 100% { transform: translateY(0) scale(1); }
                  50% { transform: translateY(-10px) scale(1.1); }
                }
              `}</style>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {homePlayers.map((player, idx) => {
                const predictions = calculatePlayerPropPredictions(player, player.gameDetails || []);
                if (predictions.length === 0) return null;

                return (
                  <div key={idx} style={{
                    padding: 16,
                    background: "rgba(16, 185, 129, 0.1)",
                    borderRadius: 12,
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#10b981" }}>
                      {player.name}
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {predictions.map((pred, pidx) => {
                        const predKey = `${game.id}_${player.name}_${pred.stat}_${pred.line}_${pred.type}`;
                        const isTracked = trackedPredictions.has(predKey);

                        return (
                          <div key={pidx}>
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: 13,
                              padding: "6px 8px",
                              background: pred.propType === 'combined' ? "rgba(16, 185, 129, 0.08)" : "transparent",
                              borderRadius: 6,
                              border: pred.propType === 'combined' ? "1px solid rgba(16, 185, 129, 0.15)" : "none",
                            }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                                <span>{pred.emoji}</span>
                                <span>
                                  {pred.type === 'over' ? 'Over' : 'Under'} {pred.line} {pred.stat}
                                </span>
                                {pred.propType === 'combined' && (
                                  <span style={{
                                    fontSize: 10,
                                    padding: "2px 6px",
                                    background: "rgba(16, 185, 129, 0.2)",
                                    borderRadius: 4,
                                    color: "#10b981",
                                    fontWeight: 600
                                  }}>
                                    {pred.shortName}
                                  </span>
                                )}
                              </span>
                              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ color: "#10b981", fontWeight: 600 }}>{pred.percentage}%</span>
                                <span style={{ color: "#94a3b8", fontSize: 12 }}>@ {pred.odds.toFixed(2)}</span>
                                <button
                                  onClick={() => handleTrackPrediction(pred, player.name, homeName)}
                                  disabled={isTracked}
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 11,
                                    background: isTracked ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.8)",
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
                            {/* Last 5 Games Stats */}
                            {pred.last5Games && pred.last5Games.length > 0 && (
                              <div style={{
                                marginTop: 4,
                                marginLeft: 28,
                              }}>
                                <div style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}>
                                  <span style={{ opacity: 0.7 }}>Last 5 games:</span>
                                  <span style={{ fontWeight: 600, color: "#94a3b8" }}>
                                    {pred.last5Games.join(', ')}
                                  </span>
                                  <span style={{ opacity: 0.7 }}>
                                    (Avg: {pred.avg}
                                    {pred.trend && pred.trend !== '0.0' && (
                                      <span style={{
                                        color: parseFloat(pred.trend) > 0 ? "#10b981" : "#ef4444",
                                        marginLeft: 4
                                      }}>
                                        {parseFloat(pred.trend) > 0 ? '↗' : '↘'} {Math.abs(parseFloat(pred.trend)).toFixed(1)}
                                      </span>
                                    )}
                                    )
                                  </span>
                                  {pred.last5GameDetails && pred.last5GameDetails.length > 0 && (
                                    <button
                                      onClick={() => toggleExpanded(predKey)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#10b981",
                                        cursor: "pointer",
                                        fontSize: 11,
                                        textDecoration: "underline",
                                        padding: 0,
                                        marginLeft: 4
                                      }}
                                    >
                                      {expandedPredictions.has(predKey) ? '▼ Hide details' : '▶ Show details'}
                                    </button>
                                  )}
                                </div>
                                {/* Expanded game details */}
                                {expandedPredictions.has(predKey) && pred.last5GameDetails && pred.last5GameDetails.length > 0 && (
                                  <div style={{
                                    marginTop: 8,
                                    padding: 8,
                                    background: "rgba(16, 185, 129, 0.05)",
                                    borderRadius: 6,
                                    border: "1px solid rgba(16, 185, 129, 0.15)",
                                  }}>
                                    {pred.last5GameDetails.map((gameDetail, gIdx) => (
                                      <div key={gIdx} style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: 10,
                                        color: "#94a3b8",
                                        padding: "3px 0",
                                        borderBottom: gIdx < pred.last5GameDetails.length - 1 ? "1px solid rgba(16, 185, 129, 0.1)" : "none"
                                      }}>
                                        <span style={{ opacity: 0.7 }}>{gameDetail.date}</span>
                                        <span style={{ fontWeight: 600, color: "#cbd5e1" }}>{gameDetail.opponent}</span>
                                        <span style={{ fontWeight: 600, color: "#10b981" }}>{gameDetail.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Away Team Players */}
        <div>
          <h4 style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#f59e0b",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            {awayName} - Top Props
          </h4>
          {calculatingPredictions ? (
            <div style={{
              padding: 30,
              textAlign: "center",
              color: "#94a3b8",
              background: "rgba(245, 158, 11, 0.05)",
              borderRadius: 12,
              border: "1px dashed rgba(245, 158, 11, 0.3)",
            }}>
              <div style={{
                fontSize: 32,
                marginBottom: 12,
                animation: "bounce 1s ease-in-out infinite"
              }}>
                🏀
              </div>
              <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#f59e0b" }}>
                Calculating predictions...
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Analyzing form-weighted averages and player trends
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {awayPlayers.map((player, idx) => {
                const predictions = calculatePlayerPropPredictions(player, player.gameDetails || []);
                if (predictions.length === 0) return null;

                return (
                  <div key={idx} style={{
                    padding: 16,
                    background: "rgba(245, 158, 11, 0.1)",
                    borderRadius: 12,
                    border: "1px solid rgba(245, 158, 11, 0.2)",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#f59e0b" }}>
                      {player.name}
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {predictions.map((pred, pidx) => {
                        const predKey = `${game.id}_${player.name}_${pred.stat}_${pred.line}_${pred.type}`;
                        const isTracked = trackedPredictions.has(predKey);

                        return (
                          <div key={pidx}>
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: 13,
                              padding: "6px 8px",
                              background: pred.propType === 'combined' ? "rgba(245, 158, 11, 0.08)" : "transparent",
                              borderRadius: 6,
                              border: pred.propType === 'combined' ? "1px solid rgba(245, 158, 11, 0.15)" : "none",
                            }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                                <span>{pred.emoji}</span>
                                <span>
                                  {pred.type === 'over' ? 'Over' : 'Under'} {pred.line} {pred.stat}
                                </span>
                                {pred.propType === 'combined' && (
                                  <span style={{
                                    fontSize: 10,
                                    padding: "2px 6px",
                                    background: "rgba(245, 158, 11, 0.2)",
                                    borderRadius: 4,
                                    color: "#f59e0b",
                                    fontWeight: 600
                                  }}>
                                    {pred.shortName}
                                  </span>
                                )}
                              </span>
                              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ color: "#f59e0b", fontWeight: 600 }}>{pred.percentage}%</span>
                                <span style={{ color: "#94a3b8", fontSize: 12 }}>@ {pred.odds.toFixed(2)}</span>
                                <button
                                  onClick={() => handleTrackPrediction(pred, player.name, awayName)}
                                  disabled={isTracked}
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 11,
                                    background: isTracked ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.8)",
                                    color: isTracked ? "#f59e0b" : "#fff",
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
                            {/* Last 5 Games Stats */}
                            {pred.last5Games && pred.last5Games.length > 0 && (
                              <div style={{
                                marginTop: 4,
                                marginLeft: 28,
                              }}>
                                <div style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}>
                                  <span style={{ opacity: 0.7 }}>Last 5 games:</span>
                                  <span style={{ fontWeight: 600, color: "#94a3b8" }}>
                                    {pred.last5Games.join(', ')}
                                  </span>
                                  <span style={{ opacity: 0.7 }}>
                                    (Avg: {pred.avg}
                                    {pred.trend && pred.trend !== '0.0' && (
                                      <span style={{
                                        color: parseFloat(pred.trend) > 0 ? "#10b981" : "#ef4444",
                                        marginLeft: 4
                                      }}>
                                        {parseFloat(pred.trend) > 0 ? '↗' : '↘'} {Math.abs(parseFloat(pred.trend)).toFixed(1)}
                                      </span>
                                    )}
                                    )
                                  </span>
                                  {pred.last5GameDetails && pred.last5GameDetails.length > 0 && (
                                    <button
                                      onClick={() => toggleExpanded(predKey)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#f59e0b",
                                        cursor: "pointer",
                                        fontSize: 11,
                                        textDecoration: "underline",
                                        padding: 0,
                                        marginLeft: 4
                                      }}
                                    >
                                      {expandedPredictions.has(predKey) ? '▼ Hide details' : '▶ Show details'}
                                    </button>
                                  )}
                                </div>
                                {/* Expanded game details */}
                                {expandedPredictions.has(predKey) && pred.last5GameDetails && pred.last5GameDetails.length > 0 && (
                                  <div style={{
                                    marginTop: 8,
                                    padding: 8,
                                    background: "rgba(245, 158, 11, 0.05)",
                                    borderRadius: 6,
                                    border: "1px solid rgba(245, 158, 11, 0.15)",
                                  }}>
                                    {pred.last5GameDetails.map((gameDetail, gIdx) => (
                                      <div key={gIdx} style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: 10,
                                        color: "#94a3b8",
                                        padding: "3px 0",
                                        borderBottom: gIdx < pred.last5GameDetails.length - 1 ? "1px solid rgba(245, 158, 11, 0.1)" : "none"
                                      }}>
                                        <span style={{ opacity: 0.7 }}>{gameDetail.date}</span>
                                        <span style={{ fontWeight: 600, color: "#cbd5e1" }}>{gameDetail.opponent}</span>
                                        <span style={{ fontWeight: 600, color: "#f59e0b" }}>{gameDetail.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Basketball() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('[Basketball] Loading upcoming NBA games from Ball Don\'t Lie API...');
        const nbaGames = await fetchUpcomingGames(30);

        // Filter to only show games that haven't started yet
        const now = new Date();
        console.log(`[Basketball] Current time: ${now.toLocaleString("en-GB", { timeZone: "Europe/Paris" })} CET`);

        const upcomingGames = nbaGames.filter(game => {
          if (!game.time) return false;
          const gameTime = new Date(game.time * 1000);
          const isUpcoming = gameTime > now;

          console.log(`[Basketball] Game ${game.home.name} vs ${game.away.name}: ${gameTime.toLocaleString("en-GB", { timeZone: "Europe/Paris" })} CET - ${isUpcoming ? 'UPCOMING' : 'STARTED'}`);

          return isUpcoming;
        }).slice(0, 10); // Limit to 10 upcoming games

        console.log(`[Basketball] Showing ${upcomingGames.length} upcoming games (filtered from ${nbaGames.length} total)`);
        setGames(upcomingGames);
      } catch (e) {
        console.error("[Basketball] load error", e);
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
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error Loading Games</div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 40 }}>
      {/* Hero Section */}
      <div style={{
        textAlign: "center",
        padding: "40px 20px",
        background: "linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%)",
        borderRadius: 24,
        border: "1px solid rgba(245, 158, 11, 0.2)",
      }}>
        <h1 style={{
          fontSize: 48,
          fontWeight: 900,
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 16,
        }}>
          🏀 NBA Player Props
        </h1>
        <p style={{
          fontSize: 18,
          color: "#94a3b8",
          maxWidth: 700,
          margin: "0 auto 16px",
        }}>
          Statistical analysis for individual and combined NBA player props - Points, Rebounds, Assists, and combinations
        </p>
        <div style={{
          fontSize: 13,
          color: "#10b981",
          background: "rgba(16, 185, 129, 0.1)",
          padding: "8px 16px",
          borderRadius: 8,
          display: "inline-block",
        }}>
          ✅ Ball Don't Lie API GOAT Tier - Real-time NBA statistics (600 req/min)
        </div>
      </div>

      {/* Games List */}
      <div style={{ display: "grid", gap: 24 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
            <div style={{ marginBottom: 12, fontSize: 16 }}>Loading NBA games and player statistics...</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Fetching real-time data from Ball Don't Lie API GOAT tier (600 req/min)
            </div>
          </div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
            No upcoming NBA games found
          </div>
        ) : (
          games.map(game => (
            <GameCard key={game.id} game={game} />
          ))
        )}
      </div>

      {/* Info Box */}
      <div style={{
        padding: 20,
        background: "rgba(16, 185, 129, 0.1)",
        borderRadius: 16,
        border: "1px solid rgba(16, 185, 129, 0.3)",
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#10b981" }}>
          🏀 About NBA Player Props
        </h3>
        <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
          <ul style={{ margin: "0", paddingLeft: 24 }}>
            <li>Powered by Ball Don't Lie API GOAT tier with real NBA game-by-game statistics</li>
            <li>Uses actual 2024-25 season game data (not generated) with form-weighted averages</li>
            <li>Shows real game dates and opponents for each stat line</li>
            <li>Only displays active players with recent game stats (filters out retired/inactive)</li>
            <li>Incorporates player trends: hot hand theory (↗ improving, ↘ declining)</li>
            <li>Individual props: Points (PTS), Rebounds (REB), Assists (AST)</li>
            <li>Combined props: PRA (Pts+Reb+Ast), PA (Pts+Ast), PR (Pts+Reb), RA (Reb+Ast)</li>
            <li>Targets 63-67% probability range for optimal value betting</li>
            <li>Shows best 2 predictions per player based on probability accuracy</li>
            <li>Click "▶ Show details" to see actual game dates and opponents</li>
            <li>Click "Track" to save predictions to Firebase for later result checking</li>
            <li>Game times displayed in CET timezone</li>
            <li>Displays next 10 upcoming games (started games are hidden)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
