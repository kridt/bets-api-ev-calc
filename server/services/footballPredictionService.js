// server/services/footballPredictionService.js
// Main service that integrates statistics and probability calculation

const footballDataApi = require('./footballDataApi');
const probabilityCalculator = require('./footballProbabilityCalculator');
const { db, collections } = require('../config/firebase');

/**
 * Football Prediction Service
 *
 * This service:
 * 1. Fetches upcoming matches from football-data.org
 * 2. Gets team statistics for each match
 * 3. Generates probability predictions
 * 4. Caches results in Firebase
 * 5. Returns predictions in format expected by frontend
 */

// In-memory cache for predictions (refresh every 30 minutes)
const predictionsCache = new Map();
const PREDICTIONS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get predictions for upcoming matches in a competition
 *
 * @param {string} competitionCode - Competition code (e.g., 'PL' for Premier League)
 * @param {Object} options - Options
 * @returns {Promise<Object>} Predictions data
 */
async function getPredictionsForCompetition(competitionCode = 'PL', options = {}) {
  const {
    minProb = 55,
    maxProb = 68,
    matchday = null,
    useCache = true,
    maxMatches = 20
  } = options;

  const cacheKey = `${competitionCode}_${matchday || 'upcoming'}`;

  // Check cache
  if (useCache) {
    const cached = predictionsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < PREDICTIONS_CACHE_TTL) {
      console.log(`[PredictionService] Using cached predictions for ${competitionCode}`);
      return filterPredictions(cached.data, minProb, maxProb);
    }
  }

  console.log(`[PredictionService] Generating predictions for ${competitionCode}...`);

  try {
    // 1. Get upcoming matches
    const matches = await footballDataApi.getUpcomingMatches(competitionCode, matchday);

    if (!matches || matches.length === 0) {
      console.log(`[PredictionService] No upcoming matches found for ${competitionCode}`);
      return { matches: [], competition: competitionCode };
    }

    console.log(`[PredictionService] Found ${matches.length} upcoming matches`);

    // Limit matches to process
    const matchesToProcess = matches.slice(0, maxMatches);

    // 2. Get team statistics and generate predictions for each match
    const matchPredictions = [];

    for (const match of matchesToProcess) {
      try {
        const predictions = await generateMatchPredictions(match, competitionCode, { minProb, maxProb });

        if (predictions.length > 0) {
          matchPredictions.push({
            gameId: match.id,
            kickoff: match.utcDate,
            home_team: {
              id: match.homeTeam.id,
              name: match.homeTeam.name,
              shortName: match.homeTeam.shortName || match.homeTeam.tla
            },
            away_team: {
              id: match.awayTeam.id,
              name: match.awayTeam.name,
              shortName: match.awayTeam.shortName || match.awayTeam.tla
            },
            competition: {
              id: competitionCode,
              name: getCompetitionName(competitionCode)
            },
            matchday: match.matchday,
            predictions
          });
        }

        // Rate limiting between matches
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`[PredictionService] Error processing match ${match.id}:`, error.message);
      }
    }

    // 3. Cache the results
    const result = {
      matches: matchPredictions,
      competition: competitionCode,
      competitionName: getCompetitionName(competitionCode),
      generatedAt: new Date().toISOString(),
      totalPredictions: matchPredictions.reduce((sum, m) => sum + m.predictions.length, 0)
    };

    predictionsCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    console.log(`[PredictionService] Generated ${result.totalPredictions} predictions for ${matchPredictions.length} matches`);

    return filterPredictions(result, minProb, maxProb);

  } catch (error) {
    console.error(`[PredictionService] Error fetching predictions:`, error.message);
    throw error;
  }
}

/**
 * Generate predictions for a single match
 */
async function generateMatchPredictions(match, competitionCode, options = {}) {
  const { minProb = 55, maxProb = 68 } = options;

  // Get team statistics
  const [homeStats, awayStats] = await Promise.all([
    footballDataApi.getTeamStatistics(match.homeTeam.name, competitionCode, match.homeTeam.id),
    footballDataApi.getTeamStatistics(match.awayTeam.name, competitionCode, match.awayTeam.id)
  ]);

  // Generate predictions using probability calculator
  const matchInfo = {
    id: match.id,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    kickoff: match.utcDate
  };

  const predictions = probabilityCalculator.generateMatchPredictions(
    homeStats,
    awayStats,
    matchInfo,
    {
      minProbability: minProb,
      maxProbability: maxProb,
      markets: ['goals', 'corners', 'yellow_cards', 'shots_on_target']
    }
  );

  return predictions;
}

/**
 * Filter predictions by probability range
 */
function filterPredictions(data, minProb, maxProb) {
  const filtered = {
    ...data,
    matches: data.matches.map(match => ({
      ...match,
      predictions: match.predictions.filter(p =>
        p.probability >= minProb && p.probability <= maxProb
      )
    })).filter(match => match.predictions.length > 0)
  };

  filtered.totalPredictions = filtered.matches.reduce((sum, m) => sum + m.predictions.length, 0);

  return filtered;
}

/**
 * Get competition display name
 */
function getCompetitionName(code) {
  const names = {
    'PL': 'English Premier League',
    'PD': 'La Liga',
    'BL1': 'Bundesliga',
    'SA': 'Serie A',
    'FL1': 'Ligue 1',
    'ELC': 'Championship',
    'DED': 'Eredivisie',
    'PPL': 'Primeira Liga'
  };
  return names[code] || code;
}

/**
 * Save predictions to Firebase for tracking
 */
async function savePredictionsToFirebase(predictions) {
  if (!predictions.matches || predictions.matches.length === 0) {
    return { saved: 0 };
  }

  const batch = db.batch();
  let savedCount = 0;

  for (const match of predictions.matches) {
    for (const prediction of match.predictions) {
      const docId = `${match.gameId}_${prediction.statKey}_${prediction.line}_${prediction.side}`;
      const docRef = db.collection(collections.PREDICTIONS).doc(docId);

      batch.set(docRef, {
        ...prediction,
        matchId: match.gameId,
        homeTeam: match.home_team.name,
        awayTeam: match.away_team.name,
        kickoff: new Date(match.kickoff),
        competition: match.competition,
        savedAt: new Date()
      }, { merge: true });

      savedCount++;
    }
  }

  await batch.commit();
  console.log(`[PredictionService] Saved ${savedCount} predictions to Firebase`);

  return { saved: savedCount };
}

/**
 * Get predictions for today's matches
 */
async function getTodaysPredictions(competitionCode = 'PL', options = {}) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const predictions = await getPredictionsForCompetition(competitionCode, options);

  // Filter to today's matches only
  const todaysMatches = predictions.matches.filter(match => {
    const kickoff = new Date(match.kickoff);
    return kickoff >= today && kickoff < tomorrow;
  });

  return {
    ...predictions,
    matches: todaysMatches,
    totalPredictions: todaysMatches.reduce((sum, m) => sum + m.predictions.length, 0),
    date: today.toISOString().split('T')[0]
  };
}

/**
 * Get predictions for this week's matches
 */
async function getWeeksPredictions(competitionCode = 'PL', options = {}) {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const predictions = await getPredictionsForCompetition(competitionCode, options);

  // Filter to this week's matches
  const weekMatches = predictions.matches.filter(match => {
    const kickoff = new Date(match.kickoff);
    return kickoff >= today && kickoff < nextWeek;
  });

  return {
    ...predictions,
    matches: weekMatches,
    totalPredictions: weekMatches.reduce((sum, m) => sum + m.predictions.length, 0),
    dateRange: {
      from: today.toISOString().split('T')[0],
      to: nextWeek.toISOString().split('T')[0]
    }
  };
}

/**
 * Clear predictions cache
 */
function clearCache() {
  predictionsCache.clear();
  footballDataApi.clearCache();
  console.log('[PredictionService] All caches cleared');
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    predictions: {
      size: predictionsCache.size,
      entries: Array.from(predictionsCache.keys())
    },
    teamStats: footballDataApi.getCacheStats()
  };
}

module.exports = {
  getPredictionsForCompetition,
  generateMatchPredictions,
  savePredictionsToFirebase,
  getTodaysPredictions,
  getWeeksPredictions,
  clearCache,
  getCacheStats,
  filterPredictions
};
