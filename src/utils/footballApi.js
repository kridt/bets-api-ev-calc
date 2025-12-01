// src/utils/footballApi.js - API client for balldontlie EPL football data

// Must be set in Vercel env vars for production
const API_BASE_URL = import.meta.env.VITE_FOOTBALL_API_URL || 'http://localhost:4000';

/**
 * Fetch EPL matches with predictions
 * @param {Object} options - Query options
 * @param {number} options.minProb - Minimum probability (default 0.58)
 * @param {number} options.maxProb - Maximum probability (default 0.62)
 * @param {number} options.games - Number of games to fetch (default 10)
 * @param {number} options.week - Optional gameweek number (auto-detected if not provided)
 * @returns {Promise<Object>} Response with matches and predictions
 */
export async function fetchTodaysEPLMatches(options = {}) {
  const {
    minProb = 0.58,
    maxProb = 0.62,
    games = 10,
    week, // Auto-detected by backend if not provided
  } = options;

  const params = new URLSearchParams({
    minProb: minProb.toString(),
    maxProb: maxProb.toString(),
    games: games.toString(),
  });

  // Only add week parameter if explicitly provided
  if (week) {
    params.append('week', week.toString());
  }

  const url = `${API_BASE_URL}/api/epl/todays-matches?${params}`;
  console.log('[footballApi] Fetching:', url);

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`API Error: ${error.error || response.statusText}`);
  }

  const data = await response.json();
  console.log('[Frontend] ✅ Received EPL data from server:');
  console.log(`[Frontend]    📌 Matches: ${data.matches?.length || 0}`);
  console.log(`[Frontend]    📊 Season: ${data.season}`);
  console.log(`[Frontend]    🗓️  Gameweek: ${data.week || 'auto-detected'}`);
  console.log(`[Frontend]    🎯 Probability range: ${data.minProb} - ${data.maxProb}`);

  if (data.matches && data.matches.length > 0) {
    let totalPredictions = 0;
    let matchPredictions = 0;
    let playerPredictions = 0;

    data.matches.forEach(match => {
      totalPredictions += match.predictions?.length || 0;
      match.predictions?.forEach(pred => {
        if (pred.type === 'match') matchPredictions++;
        if (pred.type === 'player') playerPredictions++;
      });
    });

    console.log(`[Frontend]    📊 Total match predictions: ${matchPredictions}`);
    console.log(`[Frontend]    🎯 Total player predictions: ${playerPredictions}`);
    console.log(`[Frontend]    📈 Total predictions to display: ${totalPredictions}`);
  }

  return data;
}

/**
 * Convert API predictions to format compatible with existing UI
 * @param {Array} matches - Matches from API
 * @returns {Array} Formatted predictions
 */
export function formatEPLPredictionsForUI(matches) {
  const formatted = [];

  for (const match of matches) {
    if (!match.predictions || match.predictions.length === 0) {
      continue;
    }

    // Format predictions for UI
    const uiPredictions = match.predictions.map((pred) => {
      // Determine emoji based on stat type
      let emoji = '⚽';
      let market = pred.statKey || 'Unknown';

      // Map stat keys to readable names and emojis
      const statMap = {
        // Match stats
        corners: { label: 'Corners', emoji: '🚩' },
        yellow_cards: { label: 'Yellow Cards', emoji: '🟨' },
        red_cards: { label: 'Red Cards', emoji: '🟥' },
        goals: { label: 'Goals', emoji: '⚽' },
        assists: { label: 'Assists', emoji: '🎯' },
        shots_on_target: { label: 'Shots on Target', emoji: '🎯' },
        offsides: { label: 'Offsides', emoji: '🏴' },
        tackles: { label: 'Tackles', emoji: '💪' },
        fouls: { label: 'Fouls', emoji: '🚨' },
        clearances: { label: 'Clearances', emoji: '🛡️' },
        passes: { label: 'Passes', emoji: '🔄' },
        touches: { label: 'Touches', emoji: '👟' },
      };

      if (statMap[pred.statKey]) {
        market = statMap[pred.statKey].label;
        emoji = statMap[pred.statKey].emoji;
      }

      // Add player name for player props
      if (pred.type === 'player' && pred.playerName) {
        market = `${pred.playerName} - ${market}`;
      }

      return {
        market,
        emoji,
        statKey: pred.statKey,
        type: pred.side,
        line: pred.line,
        probability: pred.probability / 100, // Convert back to 0-1 range
        odds: pred.fairOdds,
        decimalOdds: pred.fairOdds.toFixed(2),
        percentage: pred.probability.toFixed(1),
        prediction: pred.matchPrediction?.toFixed(1) || ((pred.homeAvg || 0) + (pred.awayAvg || 0)).toFixed(1),
        homeAvg: pred.homeAvg?.toFixed(1) || pred.seasonAvg?.toFixed(1) || '0.0',
        awayAvg: pred.awayAvg?.toFixed(1) || pred.recentAvg?.toFixed(1) || '0.0',
        confidence: getConfidenceLevel(pred.probability),
        isProp: pred.type === 'player',
      };
    });

    // Create match object compatible with existing UI
    formatted.push({
      match: {
        id: match.gameId,
        time: new Date(match.kickoff).getTime() / 1000, // Convert to Unix timestamp
        home: {
          id: match.home_team.id,
          name: match.home_team.name,
        },
        away: {
          id: match.away_team.id,
          name: match.away_team.name,
        },
        league: {
          id: 'epl',
          name: 'English Premier League',
        },
      },
      predictions: uiPredictions,
    });
  }

  return formatted;
}

/**
 * Get confidence level based on probability
 * @param {number} probability - Probability percentage (0-100)
 * @returns {string} Confidence level: 'high', 'medium', or 'low'
 */
function getConfidenceLevel(probability) {
  if (probability >= 61) return 'high';
  if (probability >= 59) return 'medium';
  return 'low';
}

/**
 * Get stat label for display
 * @param {string} statKey - Stat key from API
 * @returns {string} Human-readable label
 */
export function getStatLabel(statKey) {
  const labels = {
    corners: 'Corners',
    yellow_cards: 'Yellow Cards',
    red_cards: 'Red Cards',
    goals: 'Goals',
    assists: 'Assists',
    shots_on_target: 'Shots on Target',
    offsides: 'Offsides',
    tackles: 'Tackles',
    fouls: 'Fouls',
    clearances: 'Clearances',
    passes: 'Passes',
    touches: 'Touches',
  };

  return labels[statKey] || statKey;
}
