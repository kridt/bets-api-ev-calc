// server/services/footballDataApi.js
// Football-Data.org API Service for fetching real match statistics

const axios = require('axios');

const API_BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// Rate limiting: Free tier = 10 requests/minute
const REQUEST_DELAY_MS = 6500; // ~9 requests per minute to be safe
let lastRequestTime = 0;

// Cache for team statistics (refreshed every 6 hours)
const statsCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Competition codes
const COMPETITIONS = {
  PREMIER_LEAGUE: 'PL',
  LA_LIGA: 'PD',
  BUNDESLIGA: 'BL1',
  SERIE_A: 'SA',
  LIGUE_1: 'FL1',
  CHAMPIONSHIP: 'ELC',
  EREDIVISIE: 'DED',
  PRIMEIRA_LIGA: 'PPL'
};

/**
 * Rate-limited API request
 */
async function apiRequest(endpoint, params = {}) {
  if (!API_KEY) {
    throw new Error('FOOTBALL_DATA_API_KEY not set in environment variables');
  }

  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'X-Auth-Token': API_KEY
      },
      params
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 429) {
        console.error('[FootballDataAPI] Rate limit exceeded. Waiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        return apiRequest(endpoint, params); // Retry
      }
      throw new Error(`API Error ${status}: ${error.response.data?.message || error.message}`);
    }
    throw error;
  }
}

/**
 * Get upcoming matches for a competition
 * @param {string} competitionCode - Competition code (e.g., 'PL' for Premier League)
 * @param {number} matchday - Optional specific matchday
 */
async function getUpcomingMatches(competitionCode = 'PL', matchday = null) {
  let endpoint = `/competitions/${competitionCode}/matches`;
  const params = { status: 'SCHEDULED' };

  if (matchday) {
    params.matchday = matchday;
  }

  console.log(`[FootballDataAPI] Fetching upcoming ${competitionCode} matches...`);
  const data = await apiRequest(endpoint, params);

  console.log(`[FootballDataAPI] Found ${data.matches?.length || 0} upcoming matches`);
  return data.matches || [];
}

/**
 * Get finished matches for a competition (for calculating statistics)
 * @param {string} competitionCode - Competition code
 * @param {number} limit - Number of recent matches to fetch
 */
async function getFinishedMatches(competitionCode = 'PL', limit = 100) {
  const endpoint = `/competitions/${competitionCode}/matches`;
  const params = {
    status: 'FINISHED',
    limit: Math.min(limit, 100) // API max is 100 per request
  };

  console.log(`[FootballDataAPI] Fetching finished ${competitionCode} matches...`);
  const data = await apiRequest(endpoint, params);

  console.log(`[FootballDataAPI] Found ${data.matches?.length || 0} finished matches`);
  return data.matches || [];
}

/**
 * Get team's recent matches
 * @param {number} teamId - Team ID from football-data.org
 * @param {number} limit - Number of matches to fetch
 */
async function getTeamMatches(teamId, limit = 15) {
  const endpoint = `/teams/${teamId}/matches`;
  const params = {
    status: 'FINISHED',
    limit: Math.min(limit, 100)
  };

  const data = await apiRequest(endpoint, params);
  return data.matches || [];
}

/**
 * Get competition standings (includes team IDs)
 * @param {string} competitionCode - Competition code
 */
async function getStandings(competitionCode = 'PL') {
  const endpoint = `/competitions/${competitionCode}/standings`;
  const data = await apiRequest(endpoint);

  // Extract team data from standings
  const teams = {};
  if (data.standings && data.standings.length > 0) {
    data.standings[0].table.forEach(entry => {
      teams[entry.team.name] = {
        id: entry.team.id,
        name: entry.team.name,
        shortName: entry.team.shortName,
        tla: entry.team.tla,
        played: entry.playedGames,
        won: entry.won,
        draw: entry.draw,
        lost: entry.lost,
        goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst,
        goalDifference: entry.goalDifference,
        points: entry.points
      };
    });
  }

  return teams;
}

/**
 * Calculate team statistics from historical matches
 * @param {Array} matches - Array of match objects
 * @param {number} teamId - Team ID to calculate stats for
 * @param {boolean} isHome - Calculate home or away stats
 */
function calculateTeamStats(matches, teamId, isHome = null) {
  const relevantMatches = matches.filter(match => {
    if (isHome === true) {
      return match.homeTeam.id === teamId;
    } else if (isHome === false) {
      return match.awayTeam.id === teamId;
    }
    return match.homeTeam.id === teamId || match.awayTeam.id === teamId;
  });

  if (relevantMatches.length === 0) {
    return null;
  }

  // Initialize accumulators
  let totalGoalsScored = 0;
  let totalGoalsConceded = 0;
  let totalYellowCards = 0;
  let totalRedCards = 0;
  let totalCorners = 0;
  let totalShots = 0;
  let totalShotsOnTarget = 0;
  let totalFouls = 0;
  let matchesWithStats = 0;
  let matchesWithDetailedStats = 0;

  for (const match of relevantMatches) {
    const isHomeTeam = match.homeTeam.id === teamId;
    const score = match.score?.fullTime;

    if (score) {
      totalGoalsScored += isHomeTeam ? (score.home || 0) : (score.away || 0);
      totalGoalsConceded += isHomeTeam ? (score.away || 0) : (score.home || 0);
      matchesWithStats++;
    }

    // Extract detailed stats if available (from match.statistics or similar)
    // Note: football-data.org basic tier may not include detailed match statistics
    // We'll use bookings data for cards which IS available
    if (match.bookings) {
      const teamBookings = match.bookings.filter(b =>
        (isHomeTeam && b.team.id === teamId) || (!isHomeTeam && b.team.id === teamId)
      );
      totalYellowCards += teamBookings.filter(b => b.card === 'YELLOW_CARD').length;
      totalRedCards += teamBookings.filter(b => b.card === 'RED_CARD').length;
    }
  }

  const gamesPlayed = matchesWithStats || relevantMatches.length;

  return {
    gamesPlayed,
    goals: {
      scored: totalGoalsScored,
      conceded: totalGoalsConceded,
      avgScored: gamesPlayed > 0 ? totalGoalsScored / gamesPlayed : 0,
      avgConceded: gamesPlayed > 0 ? totalGoalsConceded / gamesPlayed : 0
    },
    cards: {
      yellow: totalYellowCards,
      red: totalRedCards,
      avgYellow: gamesPlayed > 0 ? totalYellowCards / gamesPlayed : 0,
      avgRed: gamesPlayed > 0 ? totalRedCards / gamesPlayed : 0
    },
    // Note: Corners and shots may not be available in basic API tier
    // We'll estimate based on league averages adjusted by attacking strength
    corners: {
      avg: null // Will be estimated
    },
    shots: {
      avg: null // Will be estimated
    }
  };
}

/**
 * Estimate corners based on team's attacking strength
 * (football-data.org doesn't provide corner stats in basic tier)
 */
function estimateCorners(goalsPerGame, leagueAvgGoals = 1.35) {
  // EPL average: ~5.5 corners per team per game, ~11 total
  // Teams that score more tend to have more corners
  const baseCorners = 5.5;
  const attackingStrength = goalsPerGame / leagueAvgGoals;

  // Adjust corners based on attacking strength (more goals = more corners)
  const estimatedCorners = baseCorners * (0.7 + 0.3 * attackingStrength);

  return Math.max(3, Math.min(8, estimatedCorners)); // Clamp between 3-8
}

/**
 * Estimate shots on target based on goals
 */
function estimateShotsOnTarget(goalsPerGame) {
  // Typical conversion rate: ~30% of shots on target become goals
  // So shots on target ≈ goals / 0.30
  const conversionRate = 0.30;
  const estimated = goalsPerGame / conversionRate;

  return Math.max(2, Math.min(8, estimated)); // Clamp between 2-8
}

/**
 * Get comprehensive team statistics with caching
 * @param {string} teamName - Team name
 * @param {string} competitionCode - Competition code
 * @param {number} teamId - Optional team ID (if known)
 */
async function getTeamStatistics(teamName, competitionCode = 'PL', teamId = null) {
  const cacheKey = `${competitionCode}_${teamName}`;

  // Check cache
  const cached = statsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[FootballDataAPI] Using cached stats for ${teamName}`);
    return cached.data;
  }

  try {
    // Get team ID if not provided
    if (!teamId) {
      const standings = await getStandings(competitionCode);
      const team = Object.values(standings).find(t =>
        t.name.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(t.name.toLowerCase()) ||
        t.shortName?.toLowerCase() === teamName.toLowerCase() ||
        t.tla?.toLowerCase() === teamName.toLowerCase()
      );

      if (team) {
        teamId = team.id;
      } else {
        console.warn(`[FootballDataAPI] Team not found: ${teamName}`);
        return getDefaultStats();
      }
    }

    // Get team's recent matches
    const matches = await getTeamMatches(teamId, 15);

    // Calculate overall stats
    const overallStats = calculateTeamStats(matches, teamId);
    const homeStats = calculateTeamStats(matches, teamId, true);
    const awayStats = calculateTeamStats(matches, teamId, false);

    if (!overallStats) {
      return getDefaultStats();
    }

    // Build comprehensive stats object
    const stats = {
      teamId,
      teamName,
      gamesPlayed: overallStats.gamesPlayed,

      goals: {
        avg: overallStats.goals.avgScored,
        homeAvg: homeStats?.goals.avgScored || overallStats.goals.avgScored,
        awayAvg: awayStats?.goals.avgScored || overallStats.goals.avgScored * 0.85, // Away teams score ~15% less
        avgConceded: overallStats.goals.avgConceded
      },

      yellow_cards: {
        avg: overallStats.cards.avgYellow || 1.8, // League average if no data
        homeAvg: homeStats?.cards.avgYellow || overallStats.cards.avgYellow || 1.7,
        awayAvg: awayStats?.cards.avgYellow || (overallStats.cards.avgYellow || 1.8) * 1.1 // Away teams get ~10% more cards
      },

      red_cards: {
        avg: overallStats.cards.avgRed || 0.05,
        homeAvg: homeStats?.cards.avgRed || 0.04,
        awayAvg: awayStats?.cards.avgRed || 0.06
      },

      // Estimated stats (not directly available from API)
      corners: {
        avg: estimateCorners(overallStats.goals.avgScored),
        homeAvg: estimateCorners(homeStats?.goals.avgScored || overallStats.goals.avgScored),
        awayAvg: estimateCorners(awayStats?.goals.avgScored || overallStats.goals.avgScored * 0.85)
      },

      shots_on_target: {
        avg: estimateShotsOnTarget(overallStats.goals.avgScored),
        homeAvg: estimateShotsOnTarget(homeStats?.goals.avgScored || overallStats.goals.avgScored),
        awayAvg: estimateShotsOnTarget(awayStats?.goals.avgScored || overallStats.goals.avgScored * 0.85)
      },

      // Metadata
      lastUpdated: new Date().toISOString(),
      dataQuality: {
        goalsReliable: true,
        cardsReliable: overallStats.cards.avgYellow > 0,
        cornersEstimated: true,
        shotsEstimated: true
      }
    };

    // Cache the stats
    statsCache.set(cacheKey, {
      data: stats,
      timestamp: Date.now()
    });

    console.log(`[FootballDataAPI] Calculated stats for ${teamName}:`, {
      goals: stats.goals.avg.toFixed(2),
      yellowCards: stats.yellow_cards.avg.toFixed(2),
      corners: stats.corners.avg.toFixed(2),
      shotsOnTarget: stats.shots_on_target.avg.toFixed(2)
    });

    return stats;

  } catch (error) {
    console.error(`[FootballDataAPI] Error fetching stats for ${teamName}:`, error.message);
    return getDefaultStats();
  }
}

/**
 * Get default/fallback statistics when real data unavailable
 */
function getDefaultStats() {
  return {
    goals: { avg: 1.35, homeAvg: 1.5, awayAvg: 1.2 },
    yellow_cards: { avg: 1.75, homeAvg: 1.6, awayAvg: 1.9 },
    red_cards: { avg: 0.05, homeAvg: 0.04, awayAvg: 0.06 },
    corners: { avg: 5.5, homeAvg: 5.8, awayAvg: 5.2 },
    shots_on_target: { avg: 4.5, homeAvg: 4.8, awayAvg: 4.2 },
    dataQuality: { isDefault: true }
  };
}

/**
 * Get head-to-head statistics between two teams
 * @param {number} team1Id - First team ID
 * @param {number} team2Id - Second team ID
 */
async function getHeadToHead(team1Id, team2Id) {
  const endpoint = `/teams/${team1Id}/matches`;
  const params = {
    status: 'FINISHED',
    limit: 50
  };

  try {
    const data = await apiRequest(endpoint, params);
    const h2hMatches = data.matches?.filter(m =>
      (m.homeTeam.id === team1Id && m.awayTeam.id === team2Id) ||
      (m.homeTeam.id === team2Id && m.awayTeam.id === team1Id)
    ) || [];

    if (h2hMatches.length === 0) {
      return null;
    }

    let totalGoals = 0;
    let totalCards = 0;

    for (const match of h2hMatches) {
      const score = match.score?.fullTime;
      if (score) {
        totalGoals += (score.home || 0) + (score.away || 0);
      }
    }

    return {
      matchesPlayed: h2hMatches.length,
      avgGoals: h2hMatches.length > 0 ? totalGoals / h2hMatches.length : null,
      recentMatches: h2hMatches.slice(0, 5).map(m => ({
        date: m.utcDate,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        score: m.score?.fullTime
      }))
    };
  } catch (error) {
    console.error('[FootballDataAPI] Error fetching H2H:', error.message);
    return null;
  }
}

/**
 * Clear the statistics cache
 */
function clearCache() {
  statsCache.clear();
  console.log('[FootballDataAPI] Cache cleared');
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    size: statsCache.size,
    entries: Array.from(statsCache.keys())
  };
}

module.exports = {
  COMPETITIONS,
  getUpcomingMatches,
  getFinishedMatches,
  getTeamMatches,
  getStandings,
  getTeamStatistics,
  getHeadToHead,
  getDefaultStats,
  clearCache,
  getCacheStats,
  // Export helpers for testing
  calculateTeamStats,
  estimateCorners,
  estimateShotsOnTarget
};
