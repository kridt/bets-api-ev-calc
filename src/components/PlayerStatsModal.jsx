// src/components/PlayerStatsModal.jsx
// Modal to display player historical stats from API-Football
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./PlayerStatsModal.css";

// League name to API-Football league ID mapping
const LEAGUE_MAPPING = {
  "Premier League": 39,
  "La Liga": 140,
  "Bundesliga": 78,
  "Serie A": 135,
  "Ligue 1": 61,
  "Eredivisie": 88,
  "Liga Portugal": 94,
  "Scottish Premiership": 179,
  "Championship": 40,
};

export default function PlayerStatsModal({ isOpen, onClose, playerName, market, leagueName }) {
  const [loading, setLoading] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [recentMatches, setRecentMatches] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Get league ID from league name
  const getLeagueId = (name) => {
    if (!name) return 39; // Default to Premier League
    for (const [leagueName, id] of Object.entries(LEAGUE_MAPPING)) {
      if (name.toLowerCase().includes(leagueName.toLowerCase())) {
        return id;
      }
    }
    return 39;
  };

  // Auto-search when modal opens with a player name
  useEffect(() => {
    if (isOpen && playerName) {
      searchPlayer(playerName);
    }
    if (!isOpen) {
      // Reset state when closing
      setPlayerStats(null);
      setRecentMatches(null);
      setSearchResults([]);
      setSelectedPlayer(null);
      setError(null);
    }
  }, [isOpen, playerName]);

  const searchPlayer = async (query) => {
    if (!query?.trim()) return;

    setLoading(true);
    setError(null);
    setSearchResults([]);
    setPlayerStats(null);

    try {
      const leagueId = getLeagueId(leagueName);
      const res = await fetch(
        `/api/player-stats?action=search&query=${encodeURIComponent(query)}&league=${leagueId}`
      );
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Search failed");
      }

      if (data.players?.length === 1) {
        // If only one result, auto-load their stats
        loadPlayerStats(data.players[0]);
      } else if (data.players?.length > 1) {
        setSearchResults(data.players);
      } else {
        setError("No players found. Try a different search term.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayerStats = async (player) => {
    setSelectedPlayer(player);
    setLoading(true);
    setError(null);
    setRecentMatches(null);

    try {
      const res = await fetch(`/api/player-stats?action=player&playerId=${player.id}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load stats");
      }

      setPlayerStats(data);

      // Fetch recent matches if we have team info
      if (data.team?.id) {
        loadRecentMatches(player.id, data.team.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentMatches = async (playerId, teamId) => {
    setLoadingMatches(true);

    try {
      const res = await fetch(
        `/api/player-stats?action=recent-matches&playerId=${playerId}&teamId=${teamId}`
      );
      const data = await res.json();

      if (data.success) {
        setRecentMatches(data);
      }
    } catch (err) {
      console.error("Error loading recent matches:", err);
    } finally {
      setLoadingMatches(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  // Get relevant stat highlight based on market
  const getRelevantStat = () => {
    if (!playerStats?.averages) return null;

    const { averages, totals } = playerStats;
    const marketLower = market?.toLowerCase() || "";

    if (marketLower.includes("goal") || marketLower.includes("score")) {
      return { label: "Goals/Game", value: averages.goalsPerGame, total: totals.goals };
    }
    if (marketLower.includes("shot") && marketLower.includes("target")) {
      return { label: "SOT/Game", value: averages.shotsOnTargetPerGame, total: totals.shotsOnTarget };
    }
    if (marketLower.includes("shot")) {
      return { label: "Shots/Game", value: averages.shotsPerGame, total: totals.shots };
    }
    if (marketLower.includes("tackle")) {
      return { label: "Tackles/Game", value: averages.tacklesPerGame, total: totals.tackles };
    }
    if (marketLower.includes("foul")) {
      return { label: "Fouls/Game", value: averages.foulsPerGame, total: totals.fouls };
    }
    if (marketLower.includes("card")) {
      return { label: "Yellow Cards", value: totals.yellowCards, total: totals.yellowCards };
    }
    if (marketLower.includes("assist")) {
      return { label: "Assists/Game", value: averages.assistsPerGame, total: totals.assists };
    }

    return null;
  };

  const relevantStat = getRelevantStat();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="player-stats-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="player-stats-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="player-stats-header">
              <div className="player-stats-title-row">
                <h2 className="player-stats-title">Player Stats</h2>
                <button className="player-stats-close" onClick={onClose}>
                  <span>X</span>
                </button>
              </div>
              {playerName && (
                <p className="player-stats-subtitle">
                  Looking up: <strong>{playerName}</strong>
                  {market && <span className="player-stats-market"> ({market})</span>}
                </p>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div className="player-stats-loading">
                <div className="player-stats-spinner"></div>
                <p>Loading stats...</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="player-stats-error">
                <span className="player-stats-error-icon">!</span>
                <p>{error}</p>
              </div>
            )}

            {/* Search Results */}
            {!loading && !playerStats && searchResults.length > 0 && (
              <div className="player-stats-results">
                <p className="player-stats-results-title">
                  Multiple players found ({searchResults.length})
                </p>
                <div className="player-stats-results-list">
                  {searchResults.map((player) => (
                    <button
                      key={player.id}
                      className="player-stats-result-item"
                      onClick={() => loadPlayerStats(player)}
                    >
                      {player.photo && (
                        <img
                          src={player.photo}
                          alt={player.name}
                          className="player-stats-result-photo"
                        />
                      )}
                      <div className="player-stats-result-info">
                        <span className="player-stats-result-name">{player.name}</span>
                        <span className="player-stats-result-team">
                          {player.team} | {player.position}
                        </span>
                      </div>
                      <div className="player-stats-result-stats">
                        <span className="player-stats-result-goals">
                          {player.goals}G {player.assists}A
                        </span>
                        <span className="player-stats-result-apps">{player.appearances} apps</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Player Stats */}
            {!loading && playerStats && (
              <div className="player-stats-content">
                {/* Player Info */}
                <div className="player-stats-info">
                  {playerStats.player.photo && (
                    <img
                      src={playerStats.player.photo}
                      alt={playerStats.player.name}
                      className="player-stats-photo"
                    />
                  )}
                  <div className="player-stats-details">
                    <h3 className="player-stats-name">{playerStats.player.name}</h3>
                    {playerStats.team && (
                      <div className="player-stats-team">
                        {playerStats.team.logo && (
                          <img src={playerStats.team.logo} alt={playerStats.team.name} className="player-team-logo" />
                        )}
                        <span>{playerStats.team.name}</span>
                      </div>
                    )}
                    <p className="player-stats-meta">
                      {playerStats.player.nationality} | Age: {playerStats.player.age}
                    </p>
                  </div>
                </div>

                {/* Season Badge */}
                <div className="player-season-badge">
                  {playerStats.season}/{playerStats.season + 1} Season Stats
                </div>

                {/* Relevant Stat Highlight */}
                {relevantStat && (
                  <div className="player-stats-highlight">
                    <div className="player-stats-highlight-label">
                      Relevant for this bet:
                    </div>
                    <div className="player-stats-highlight-value">
                      <span className="player-stats-highlight-number">{relevantStat.value}</span>
                      <span className="player-stats-highlight-text">{relevantStat.label}</span>
                    </div>
                    <div className="player-stats-highlight-total">
                      Total: {relevantStat.total}
                    </div>
                  </div>
                )}

                {/* Season Totals */}
                <div className="player-stats-totals-section">
                  <h4 className="player-stats-section-title">Season Totals</h4>
                  <div className="player-stats-totals">
                    <div className="player-stats-stat">
                      <span className="player-stats-stat-value">{playerStats.totals.appearances}</span>
                      <span className="player-stats-stat-label">Apps</span>
                    </div>
                    <div className="player-stats-stat">
                      <span className="player-stats-stat-value">{playerStats.totals.goals}</span>
                      <span className="player-stats-stat-label">Goals</span>
                    </div>
                    <div className="player-stats-stat">
                      <span className="player-stats-stat-value">{playerStats.totals.assists}</span>
                      <span className="player-stats-stat-label">Assists</span>
                    </div>
                    <div className="player-stats-stat">
                      <span className="player-stats-stat-value">{playerStats.totals.shots}</span>
                      <span className="player-stats-stat-label">Shots</span>
                    </div>
                    <div className="player-stats-stat">
                      <span className="player-stats-stat-value">{playerStats.totals.shotsOnTarget}</span>
                      <span className="player-stats-stat-label">SOT</span>
                    </div>
                    <div className="player-stats-stat">
                      <span className="player-stats-stat-value">{Math.round(playerStats.totals.minutes / 90)}</span>
                      <span className="player-stats-stat-label">90s</span>
                    </div>
                  </div>
                </div>

                {/* Per Game Averages */}
                {playerStats.averages && (
                  <div className="player-stats-averages">
                    <h4 className="player-stats-section-title">Per Game Averages</h4>
                    <div className="player-stats-averages-grid">
                      <div className="player-stats-avg">
                        <span className="player-stats-avg-value">{playerStats.averages.goalsPerGame}</span>
                        <span className="player-stats-avg-label">Goals</span>
                      </div>
                      <div className="player-stats-avg">
                        <span className="player-stats-avg-value">{playerStats.averages.assistsPerGame}</span>
                        <span className="player-stats-avg-label">Assists</span>
                      </div>
                      <div className="player-stats-avg">
                        <span className="player-stats-avg-value">{playerStats.averages.shotsPerGame}</span>
                        <span className="player-stats-avg-label">Shots</span>
                      </div>
                      <div className="player-stats-avg">
                        <span className="player-stats-avg-value">{playerStats.averages.shotsOnTargetPerGame}</span>
                        <span className="player-stats-avg-label">SOT</span>
                      </div>
                      <div className="player-stats-avg">
                        <span className="player-stats-avg-value">{playerStats.averages.tacklesPerGame}</span>
                        <span className="player-stats-avg-label">Tackles</span>
                      </div>
                      <div className="player-stats-avg">
                        <span className="player-stats-avg-value">{playerStats.averages.foulsPerGame}</span>
                        <span className="player-stats-avg-label">Fouls</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cards */}
                <div className="player-stats-cards">
                  <div className="player-stats-card yellow">
                    <span className="player-stats-card-icon"></span>
                    <span className="player-stats-card-value">{playerStats.totals.yellowCards}</span>
                  </div>
                  <div className="player-stats-card red">
                    <span className="player-stats-card-icon"></span>
                    <span className="player-stats-card-value">{playerStats.totals.redCards}</span>
                  </div>
                </div>

                {/* Recent Matches */}
                <div className="player-recent-matches">
                  <h4 className="player-stats-section-title">
                    Last 10 Matches (This Season)
                    {recentMatches?.summary && (
                      <span className="player-matches-played">
                        - Played {recentMatches.summary.matchesPlayed}/{recentMatches.summary.totalMatches}
                      </span>
                    )}
                  </h4>

                  {loadingMatches && (
                    <div className="player-matches-loading">
                      <div className="player-matches-spinner"></div>
                      <span>Loading recent matches...</span>
                    </div>
                  )}

                  {recentMatches?.matches && !loadingMatches && (
                    <>
                      {/* Summary Stats for Last 10 */}
                      {recentMatches.summary.matchesPlayed > 0 && (
                        <div className="player-matches-summary-section">
                          <span className="player-matches-summary-label">Last 10 Stats:</span>
                          <div className="player-matches-summary">
                            <div className="player-matches-summary-item">
                              <span className="summary-value">{recentMatches.summary.totalGoals}</span>
                              <span className="summary-label">Goals</span>
                            </div>
                            <div className="player-matches-summary-item">
                              <span className="summary-value">{recentMatches.summary.totalAssists}</span>
                              <span className="summary-label">Assists</span>
                            </div>
                            <div className="player-matches-summary-item">
                              <span className="summary-value">{recentMatches.summary.totalShots}</span>
                              <span className="summary-label">Shots</span>
                            </div>
                            <div className="player-matches-summary-item">
                              <span className="summary-value">{recentMatches.summary.totalShotsOnTarget}</span>
                              <span className="summary-label">SOT</span>
                            </div>
                            <div className="player-matches-summary-item">
                              <span className="summary-value">{recentMatches.summary.avgMinutes}'</span>
                              <span className="summary-label">Avg Min</span>
                            </div>
                            {recentMatches.summary.avgRating && (
                              <div className="player-matches-summary-item">
                                <span className="summary-value">{recentMatches.summary.avgRating}</span>
                                <span className="summary-label">Rating</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Match List */}
                      <div className="player-matches-list">
                        {recentMatches.matches.map((match) => (
                          <div
                            key={match.fixtureId}
                            className={`player-match-item ${match.played ? "played" : "not-played"}`}
                          >
                            <div className="match-date">{formatDate(match.date)}</div>
                            <div className="match-teams">
                              <span className="match-home">{match.homeTeam}</span>
                              <span className="match-score">
                                {match.homeScore} - {match.awayScore}
                              </span>
                              <span className="match-away">{match.awayTeam}</span>
                            </div>
                            <div className="match-player-status">
                              {match.played ? (
                                <div className="match-player-stats">
                                  <span className="player-mins">{match.playerStats?.minutes}'</span>
                                  {match.playerStats?.goals > 0 && (
                                    <span className="player-goals">{match.playerStats.goals}G</span>
                                  )}
                                  {match.playerStats?.assists > 0 && (
                                    <span className="player-assists">{match.playerStats.assists}A</span>
                                  )}
                                  {match.playerStats?.shots > 0 && (
                                    <span className="player-shots">{match.playerStats.shots}S</span>
                                  )}
                                </div>
                              ) : (
                                <span className="player-dnp">DNP</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Back button */}
                {searchResults.length > 1 && (
                  <button
                    className="player-stats-back"
                    onClick={() => {
                      setPlayerStats(null);
                      setRecentMatches(null);
                      setSelectedPlayer(null);
                    }}
                  >
                    Back to results
                  </button>
                )}

                {/* Data Note */}
                <p className="player-stats-note">
                  Data from {playerStats.season}/{playerStats.season + 1} season
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
