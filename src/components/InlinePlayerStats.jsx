// src/components/InlinePlayerStats.jsx
// Compact inline player stats shown directly in the EV bet card
import { useState } from "react";
import "./InlinePlayerStats.css";

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

export default function InlinePlayerStats({ playerName, market, leagueName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [recentMatches, setRecentMatches] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Get league ID from league name
  const getLeagueId = (name) => {
    if (!name) return 39;
    for (const [leagueName, id] of Object.entries(LEAGUE_MAPPING)) {
      if (name.toLowerCase().includes(leagueName.toLowerCase())) {
        return id;
      }
    }
    return 39;
  };

  // Get relevant stat based on market type
  const getRelevantStats = () => {
    if (!playerStats?.averages || !playerStats?.totals) return null;
    const { averages, totals } = playerStats;
    const marketLower = market?.toLowerCase() || "";

    if (marketLower.includes("goal") || marketLower.includes("score")) {
      return {
        primary: { label: "Goals/Game", value: averages.goalsPerGame, total: totals.goals },
        secondary: { label: "Mins/Game", value: averages.minutesPerGame }
      };
    }
    if (marketLower.includes("shot") && marketLower.includes("target")) {
      return {
        primary: { label: "SOT/Game", value: averages.shotsOnTargetPerGame, total: totals.shotsOnTarget },
        secondary: { label: "Shots/Game", value: averages.shotsPerGame }
      };
    }
    if (marketLower.includes("shot")) {
      return {
        primary: { label: "Shots/Game", value: averages.shotsPerGame, total: totals.shots },
        secondary: { label: "SOT/Game", value: averages.shotsOnTargetPerGame }
      };
    }
    if (marketLower.includes("tackle")) {
      return {
        primary: { label: "Tackles/Game", value: averages.tacklesPerGame, total: totals.tackles },
        secondary: { label: "Mins/Game", value: averages.minutesPerGame }
      };
    }
    if (marketLower.includes("foul")) {
      return {
        primary: { label: "Fouls/Game", value: averages.foulsPerGame, total: totals.fouls },
        secondary: { label: "Mins/Game", value: averages.minutesPerGame }
      };
    }
    if (marketLower.includes("card")) {
      return {
        primary: { label: "Yellow Cards", value: totals.yellowCards, total: totals.yellowCards },
        secondary: { label: "Red Cards", value: totals.redCards }
      };
    }
    if (marketLower.includes("assist")) {
      return {
        primary: { label: "Assists/Game", value: averages.assistsPerGame, total: totals.assists },
        secondary: { label: "Mins/Game", value: averages.minutesPerGame }
      };
    }
    // Default for goalscorer
    return {
      primary: { label: "Goals/Game", value: averages.goalsPerGame, total: totals.goals },
      secondary: { label: "Mins/Game", value: averages.minutesPerGame }
    };
  };

  // Fetch player stats when button is clicked
  const fetchPlayerStats = async () => {
    if (!playerName) return;

    // Skip if not a player name (match markets)
    if (playerName.toLowerCase().startsWith("line ")) return;

    setShowStats(true);
    setLoading(true);
    setError(null);

    try {
      const leagueId = getLeagueId(leagueName);
      // Search for player
      const searchRes = await fetch(
        `/api/player-stats?action=search&query=${encodeURIComponent(playerName)}&league=${leagueId}`
      );
      const searchData = await searchRes.json();

      if (!searchData.success || !searchData.players?.length) {
        setError("Player not found");
        setLoading(false);
        return;
      }

      // Get first matching player
      const player = searchData.players[0];

      // Fetch detailed stats
      const statsRes = await fetch(`/api/player-stats?action=player&playerId=${player.id}`);
      const statsData = await statsRes.json();

      if (!statsData.success) {
        setError("Failed to load stats");
        setLoading(false);
        return;
      }

      setPlayerStats(statsData);

      // Fetch recent matches if we have team info
      if (statsData.team?.id) {
        const matchesRes = await fetch(
          `/api/player-stats?action=recent-matches&playerId=${player.id}&teamId=${statsData.team.id}`
        );
        const matchesData = await matchesRes.json();
        if (matchesData.success) {
          setRecentMatches(matchesData);
        }
      }
    } catch (err) {
      setError("Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  // Don't render for match markets
  if (playerName?.toLowerCase().startsWith("line ")) return null;

  const relevantStats = getRelevantStats();

  // Show button if stats haven't been loaded yet
  if (!showStats) {
    return (
      <div className="inline-player-stats">
        <button
          className="inline-stats-button"
          onClick={fetchPlayerStats}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          Player Stats
        </button>
      </div>
    );
  }

  return (
    <div className="inline-player-stats">
      {loading && (
        <div className="inline-stats-loading">
          <div className="inline-stats-spinner"></div>
          <span>Loading stats...</span>
        </div>
      )}

      {error && (
        <div className="inline-stats-error">
          {error}
        </div>
      )}

      {!loading && playerStats && (
        <>
          {/* Compact Stats Row */}
          <div className="inline-stats-row">
            {/* Last 10 Games */}
            {recentMatches?.summary && (
              <div className="inline-stat-box last10">
                <span className="inline-stat-label">Last 10</span>
                <span className="inline-stat-value">
                  {recentMatches.summary.matchesPlayed}/10
                </span>
                <span className="inline-stat-sublabel">played</span>
              </div>
            )}

            {/* Avg Minutes */}
            {recentMatches?.summary && (
              <div className="inline-stat-box">
                <span className="inline-stat-label">Avg Min</span>
                <span className="inline-stat-value">
                  {recentMatches.summary.avgMinutes}'
                </span>
              </div>
            )}

            {/* Relevant Primary Stat */}
            {relevantStats?.primary && (
              <div className="inline-stat-box highlight">
                <span className="inline-stat-label">{relevantStats.primary.label}</span>
                <span className="inline-stat-value">
                  {relevantStats.primary.value}
                </span>
                {relevantStats.primary.total !== undefined && (
                  <span className="inline-stat-sublabel">
                    ({relevantStats.primary.total} total)
                  </span>
                )}
              </div>
            )}

            {/* Last 10 Relevant Stat */}
            {recentMatches?.summary && (
              <>
                {market?.toLowerCase().includes("goal") && (
                  <div className="inline-stat-box">
                    <span className="inline-stat-label">L10 Goals</span>
                    <span className="inline-stat-value">{recentMatches.summary.totalGoals}</span>
                  </div>
                )}
                {market?.toLowerCase().includes("shot") && (
                  <div className="inline-stat-box">
                    <span className="inline-stat-label">L10 Shots</span>
                    <span className="inline-stat-value">{recentMatches.summary.totalShots}</span>
                    <span className="inline-stat-sublabel">({recentMatches.summary.totalShotsOnTarget} SOT)</span>
                  </div>
                )}
                {market?.toLowerCase().includes("assist") && (
                  <div className="inline-stat-box">
                    <span className="inline-stat-label">L10 Assists</span>
                    <span className="inline-stat-value">{recentMatches.summary.totalAssists}</span>
                  </div>
                )}
              </>
            )}

            {/* Season Apps */}
            <div className="inline-stat-box">
              <span className="inline-stat-label">Season</span>
              <span className="inline-stat-value">{playerStats.totals.appearances}</span>
              <span className="inline-stat-sublabel">apps</span>
            </div>

            {/* Toggle Expand */}
            <button
              className="inline-stats-toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Less" : "More"}
            </button>
          </div>

          {/* Expanded Details */}
          {expanded && recentMatches?.matches && (
            <div className="inline-stats-expanded">
              <div className="inline-matches-header">
                Recent Matches ({playerStats.season}/{playerStats.season + 1})
              </div>
              <div className="inline-matches-list">
                {recentMatches.matches.slice(0, 5).map((match) => (
                  <div
                    key={match.fixtureId}
                    className={`inline-match ${match.played ? "played" : "not-played"}`}
                  >
                    <span className="match-date">
                      {new Date(match.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </span>
                    <span className="match-fixture">
                      {match.homeTeam} {match.homeScore}-{match.awayScore} {match.awayTeam}
                    </span>
                    {match.played ? (
                      <span className="match-player-info">
                        {match.playerStats?.minutes}'
                        {match.playerStats?.goals > 0 && <span className="stat-goal"> {match.playerStats.goals}G</span>}
                        {match.playerStats?.assists > 0 && <span className="stat-assist"> {match.playerStats.assists}A</span>}
                        {match.playerStats?.shots > 0 && <span className="stat-shot"> {match.playerStats.shots}S</span>}
                      </span>
                    ) : (
                      <span className="match-dnp">DNP</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
