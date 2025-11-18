// src/utils/nbaLocalApi.js - NBA EV API Integration

// Use proxy path for local development, production server for prod
// Development: Vite proxy rewrites /nba-api -> http://localhost:4000/api
// Production: Direct connection to Render server
const BASE_URL = import.meta.env.PROD
  ? "https://basketball-ev-server.onrender.com/api"
  : "/nba-api";

// Stat code labels for display
export const STAT_LABELS = {
  pts: "Points",
  reb: "Rebounds",
  ast: "Assists",
  fg3m: "3-Pointers Made",
  pra: "Points + Rebounds + Assists",
  pr: "Points + Rebounds",
  pa: "Points + Assists",
  ra: "Rebounds + Assists"
};

/**
 * Fetch recommended bets from local NBA EV API
 * @param {Object} options - Query parameters
 * @param {number} options.minProb - Minimum probability threshold (0-1)
 * @param {number} options.maxProb - Maximum probability threshold (0-1)
 * @param {number} options.perGame - Max picks per game
 * @param {number} options.games - Number of games to evaluate
 * @param {number} options.maxPlayersPerTeam - Max players per team to scan
 * @param {Function} options.onProgress - Optional callback for progress updates
 * @returns {Promise<Object>} API response with games and predictions
 */
export async function fetchRecommendedBets(options = {}) {
  const {
    minProb = 0.65,
    maxProb = 0.7,
    perGame = 5,
    games = 5,
    maxPlayersPerTeam = 6,
    onProgress = null
  } = options;

  const params = new URLSearchParams({
    minProb: minProb.toString(),
    maxProb: maxProb.toString(),
    perGame: perGame.toString(),
    games: games.toString(),
    maxPlayersPerTeam: maxPlayersPerTeam.toString()
  });

  try {
    console.log(`[NBA Local API] Fetching recommended bets with params:`, Object.fromEntries(params));

    if (onProgress) onProgress('Connecting to API...');

    // Create an AbortController with a longer timeout (2 minutes for slow processing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    try {
      if (onProgress) onProgress('Processing NBA statistics...');

      const response = await fetch(`${BASE_URL}/recommended-bets?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      if (onProgress) onProgress('Receiving predictions...');

      const data = await response.json();
      console.log(`[NBA Local API] Received ${data.games?.length || 0} games with predictions`);

      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout - API took too long to respond (>2 minutes)');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('[NBA Local API] Error fetching recommended bets:', error);

    // Provide more helpful error messages
    if (error.message.includes('Failed to fetch')) {
      throw new Error('Cannot connect to API - make sure it is running at http://localhost:4000');
    }

    throw error;
  }
}

/**
 * Get stat label for display
 * @param {string} statCode - Stat code (pts, reb, ast, pra, etc.)
 * @returns {string} Display label
 */
export function getStatLabel(statCode) {
  return STAT_LABELS[statCode] || statCode.toUpperCase();
}

/**
 * Format probability as percentage
 * @param {number} probability - Probability value (0-100 or 0-1)
 * @returns {string} Formatted percentage
 */
export function formatProbability(probability) {
  // Handle both decimal (0.65) and percentage (65) formats
  const percentValue = probability > 1 ? probability : probability * 100;
  return `${percentValue.toFixed(1)}%`;
}

/**
 * Format datetime for display
 * @param {string} datetime - ISO datetime string
 * @returns {string} Formatted datetime
 */
export function formatGameTime(datetime) {
  return new Date(datetime).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
    timeZoneName: "short"
  });
}

/**
 * Transform API pick data to match tracking format
 * @param {Object} pick - Pick from API
 * @param {Object} game - Game data
 * @param {string} playerTeam - Player's team (either home or away)
 * @returns {Object} Transformed pick data
 */
export function transformPickForTracking(pick, game, playerTeam = null) {
  // If playerTeam not provided, try to infer it (would need additional data from API)
  const team = playerTeam || game.home_team.full_name;

  return {
    gameId: game.gameId,
    homeTeam: game.home_team.full_name,
    awayTeam: game.visitor_team.full_name,
    gameTime: formatGameTime(game.datetime),
    gameTimeISO: game.datetime,
    playerName: pick.playerName,
    playerTeam: team,
    playerId: pick.playerId,
    statType: getStatLabel(pick.stat),
    shortName: pick.stat.toUpperCase(),
    propType: ['pra', 'pr', 'pa', 'ra'].includes(pick.stat) ? 'combined' : 'individual',
    line: pick.line,
    type: pick.side, // 'over' or 'under'
    probability: pick.probability / 100, // Convert to decimal
    percentage: formatProbability(pick.probability),
    odds: pick.fairOdds,
  };
}
