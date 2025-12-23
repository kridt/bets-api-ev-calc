// server/routes/api.js
const express = require('express');
const router = express.Router();
const { db, collections } = require('../config/firebase');
const { getStatus } = require('../schedulers');

// Import OpticOdds proxy routes
const opticOddsRoutes = require('./opticodds');

// Import football prediction services
let footballPredictionService;
let footballDataApi;
try {
  footballPredictionService = require('../services/footballPredictionService');
  footballDataApi = require('../services/footballDataApi');
} catch (error) {
  console.warn('[API] Football prediction services not loaded:', error.message);
}

// Import EV bet finder service
let evBetFinder;
try {
  evBetFinder = require('../services/evBetFinder');
} catch (error) {
  console.warn('[API] EV bet finder service not loaded:', error.message);
}

// Import balldontlie NBA service
let balldontlieService;
try {
  balldontlieService = require('../services/balldontlieService');
} catch (error) {
  console.warn('[API] Balldontlie NBA service not loaded:', error.message);
}

/**
 * GET /api/value-bets
 * Get current active value bets
 * Query params: minEV, maxOdds, limit, league (league ID or 'all')
 */
router.get('/value-bets', async (req, res) => {
  try {
    const { minEV, maxOdds, limit = 50, league } = req.query;

    let query = db.collection(collections.VALUE_BETS)
      .where('status', '==', 'active')
      .orderBy('ev', 'desc');

    if (minEV) {
      query = query.where('ev', '>=', parseFloat(minEV));
    }

    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const snapshot = await query.get();
    let valueBets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filter by max odds if specified
    if (maxOdds) {
      valueBets = valueBets.filter(bet => bet.odds <= parseFloat(maxOdds));
    }

    // Group by match
    const matchGroups = {};
    for (const bet of valueBets) {
      if (!matchGroups[bet.matchId]) {
        matchGroups[bet.matchId] = {
          match: null,
          valueBets: []
        };
      }
      matchGroups[bet.matchId].valueBets.push(bet);
    }

    // Fetch match details
    for (const matchId of Object.keys(matchGroups)) {
      const matchDoc = await db.collection(collections.MATCHES).doc(matchId).get();
      if (matchDoc.exists) {
        matchGroups[matchId].match = { id: matchDoc.id, ...matchDoc.data() };
      }
    }

    // Convert to array and filter by league if specified
    let result = Object.values(matchGroups)
      .filter(group => group.match !== null);

    // Filter by league if not 'all'
    if (league && league !== 'all') {
      result = result.filter(group => group.match.league?.id === league);
    }

    // Sort by match date (earliest first) for "All" view, or by best EV for league-specific views
    if (league === 'all') {
      result = result
        .map(group => ({
          ...group,
          bestEV: Math.max(...group.valueBets.map(b => b.ev))
        }))
        .sort((a, b) => new Date(a.match.date) - new Date(b.match.date));
    } else {
      result = result
        .map(group => ({
          ...group,
          bestEV: Math.max(...group.valueBets.map(b => b.ev))
        }))
        .sort((a, b) => b.bestEV - a.bestEV);
    }

    res.json({
      success: true,
      count: result.length,
      data: result
    });
  } catch (error) {
    console.error('Error fetching value bets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tracking-stats
 * Get tracking statistics for a date range
 */
router.get('/tracking-stats', async (req, res) => {
  try {
    const { startDate, endDate, days = 30 } = req.query;

    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      start = new Date(end.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);
    }

    const snapshot = await db.collection(collections.TRACKING_STATS)
      .where('date', '>=', start.toISOString().split('T')[0])
      .where('date', '<=', end.toISOString().split('T')[0])
      .orderBy('date', 'desc')
      .get();

    const stats = snapshot.docs.map(doc => doc.data());

    // Calculate overall stats
    const overall = stats.reduce((acc, day) => ({
      totalMatches: acc.totalMatches + (day.totalMatches || 0),
      totalValueBets: acc.totalValueBets + (day.totalValueBets || 0),
      totalSettled: acc.totalSettled + (day.totalSettled || 0),
      wins: acc.wins + (day.wins || 0),
      losses: acc.losses + (day.losses || 0),
      pushes: acc.pushes + (day.pushes || 0),
      totalStake: acc.totalStake + (day.totalStake || 0),
      totalReturn: acc.totalReturn + (day.totalReturn || 0)
    }), {
      totalMatches: 0,
      totalValueBets: 0,
      totalSettled: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      totalStake: 0,
      totalReturn: 0
    });

    overall.roi = overall.totalStake > 0
      ? ((overall.totalReturn - overall.totalStake) / overall.totalStake) * 100
      : 0;
    overall.winRate = overall.totalSettled > 0
      ? (overall.wins / overall.totalSettled) * 100
      : 0;
    overall.avgProfit = overall.totalSettled > 0
      ? (overall.totalReturn - overall.totalStake) / overall.totalSettled
      : 0;

    res.json({
      success: true,
      overall,
      daily: stats
    });
  } catch (error) {
    console.error('Error fetching tracking stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/matches/:matchId
 * Get detailed information about a specific match
 */
router.get('/matches/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    // Get match
    const matchDoc = await db.collection(collections.MATCHES).doc(matchId).get();
    if (!matchDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    const match = { id: matchDoc.id, ...matchDoc.data() };

    // Get predictions
    const predictionsSnapshot = await db.collection(collections.PREDICTIONS)
      .where('matchId', '==', matchId)
      .orderBy('scannedAt', 'desc')
      .limit(100)
      .get();
    const predictions = predictionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Get value bets
    const valueBetsSnapshot = await db.collection(collections.VALUE_BETS)
      .where('matchId', '==', matchId)
      .orderBy('ev', 'desc')
      .get();
    const valueBets = valueBetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Get latest odds snapshot
    const oddsSnapshot = await db.collection(collections.ODDS_SNAPSHOTS)
      .where('matchId', '==', matchId)
      .orderBy('scannedAt', 'desc')
      .limit(1)
      .get();
    const latestOdds = oddsSnapshot.empty ? null : oddsSnapshot.docs[0].data();

    // Get result if exists
    const resultSnapshot = await db.collection(collections.RESULTS)
      .where('matchId', '==', matchId)
      .limit(1)
      .get();
    const result = resultSnapshot.empty ? null : resultSnapshot.docs[0].data();

    res.json({
      success: true,
      data: {
        match,
        predictions,
        valueBets,
        latestOdds,
        result
      }
    });
  } catch (error) {
    console.error('Error fetching match details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/results
 * Get settled bet results
 */
router.get('/results', async (req, res) => {
  try {
    const { limit = 50, days = 7 } = req.query;

    const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const snapshot = await db.collection(collections.RESULTS)
      .where('verifiedAt', '>=', daysAgo)
      .orderBy('verifiedAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Fetch match and value bet details for each result
    const enrichedResults = await Promise.all(results.map(async (result) => {
      const matchDoc = await db.collection(collections.MATCHES).doc(result.matchId).get();
      const match = matchDoc.exists ? { id: matchDoc.id, ...matchDoc.data() } : null;

      const valueBetsSnapshot = await db.collection(collections.VALUE_BETS)
        .where('matchId', '==', result.matchId)
        .where('status', '==', 'settled')
        .get();
      const valueBets = valueBetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return {
        ...result,
        match,
        valueBets
      };
    }));

    res.json({
      success: true,
      count: enrichedResults.length,
      data: enrichedResults
    });
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/scheduler/status
 * Get status of all schedulers
 */
router.get('/scheduler/status', (req, res) => {
  try {
    const status = getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/matches
 * Get upcoming matches from Odds API
 * Query params: league (league slug), limit (default 15)
 */
router.get('/matches', async (req, res) => {
  try {
    const { league = 'all', limit = 15 } = req.query;
    const { getActiveLeagues } = require('../config/leagues');
    const axios = require('axios');

    const apiKey = process.env.ODDS_API_KEY;
    let allMatches = [];

    if (league === 'all') {
      // Fetch from all active leagues
      const leagues = getActiveLeagues();

      for (const leagueConfig of leagues) {
        try {
          const url = `https://api2.odds-api.io/v3/events?apiKey=${apiKey}&sport=football&league=${leagueConfig.slug}&status=pending&limit=${limit}`;
          const response = await axios.get(url);

          const matches = (response.data || []).map(event => ({
            ...event,
            league: {
              id: leagueConfig.id,
              name: leagueConfig.name,
              slug: leagueConfig.slug,
              country: leagueConfig.country
            }
          }));

          allMatches.push(...matches);
        } catch (error) {
          console.error(`Error fetching ${leagueConfig.name}:`, error.message);
        }
      }

      // Sort by date (earliest first)
      allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));

    } else {
      // Fetch from specific league
      const url = `https://api2.odds-api.io/v3/events?apiKey=${apiKey}&sport=football&league=${league}&status=pending&limit=${limit}`;
      const response = await axios.get(url);
      allMatches = response.data || [];
    }

    res.json({
      success: true,
      count: allMatches.length,
      data: allMatches
    });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// FOOTBALL PREDICTIONS API (Real Statistics)
// ============================================

/**
 * GET /api/epl/predictions
 * Get predictions for Premier League matches using real statistics
 * Query params: minProb, maxProb, matchday
 */
router.get('/epl/predictions', async (req, res) => {
  if (!footballPredictionService) {
    return res.status(503).json({
      success: false,
      error: 'Football prediction service not available'
    });
  }

  try {
    const { minProb = 55, maxProb = 68, matchday } = req.query;

    const predictions = await footballPredictionService.getPredictionsForCompetition('PL', {
      minProb: parseFloat(minProb),
      maxProb: parseFloat(maxProb),
      matchday: matchday ? parseInt(matchday) : null
    });

    res.json({
      success: true,
      ...predictions
    });
  } catch (error) {
    console.error('[API] Error fetching EPL predictions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/epl/todays-matches
 * Get predictions for today's EPL matches (matches frontend expected format)
 */
router.get('/epl/todays-matches', async (req, res) => {
  if (!footballPredictionService) {
    return res.status(503).json({
      success: false,
      error: 'Football prediction service not available'
    });
  }

  try {
    const { minProb = 0.55, maxProb = 0.65, games = 10, week } = req.query;

    // Convert from 0-1 format to 0-100 format
    const minProbPercent = parseFloat(minProb) <= 1 ? parseFloat(minProb) * 100 : parseFloat(minProb);
    const maxProbPercent = parseFloat(maxProb) <= 1 ? parseFloat(maxProb) * 100 : parseFloat(maxProb);

    const predictions = await footballPredictionService.getWeeksPredictions('PL', {
      minProb: minProbPercent,
      maxProb: maxProbPercent
    });

    // Transform to format expected by frontend
    const matches = predictions.matches.slice(0, parseInt(games)).map(match => ({
      gameId: match.gameId,
      kickoff: match.kickoff,
      home_team: match.home_team,
      away_team: match.away_team,
      predictions: match.predictions.map(pred => ({
        statKey: pred.statKey,
        side: pred.side,
        line: pred.line,
        probability: pred.probability,
        fairOdds: pred.fairOdds,
        homeAvg: pred.homeAvg,
        awayAvg: pred.awayAvg,
        matchPrediction: pred.matchPrediction,
        type: pred.type,
        confidence: pred.confidence
      }))
    }));

    res.json({
      success: true,
      matches,
      season: '2024-25',
      week: week || 'upcoming',
      minProb: minProbPercent,
      maxProb: maxProbPercent,
      generatedAt: predictions.generatedAt
    });
  } catch (error) {
    console.error('[API] Error fetching today\'s matches:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/football/predictions/:competition
 * Get predictions for any competition
 * Competition codes: PL, PD (La Liga), BL1 (Bundesliga), SA (Serie A), FL1 (Ligue 1)
 */
router.get('/football/predictions/:competition', async (req, res) => {
  if (!footballPredictionService) {
    return res.status(503).json({
      success: false,
      error: 'Football prediction service not available'
    });
  }

  try {
    const { competition } = req.params;
    const { minProb = 55, maxProb = 68, matchday } = req.query;

    const predictions = await footballPredictionService.getPredictionsForCompetition(competition, {
      minProb: parseFloat(minProb),
      maxProb: parseFloat(maxProb),
      matchday: matchday ? parseInt(matchday) : null
    });

    res.json({
      success: true,
      ...predictions
    });
  } catch (error) {
    console.error(`[API] Error fetching ${req.params.competition} predictions:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/football/team-stats/:teamName
 * Get statistics for a specific team
 */
router.get('/football/team-stats/:teamName', async (req, res) => {
  if (!footballDataApi) {
    return res.status(503).json({
      success: false,
      error: 'Football data API not available'
    });
  }

  try {
    const { teamName } = req.params;
    const { competition = 'PL' } = req.query;

    const stats = await footballDataApi.getTeamStatistics(teamName, competition);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[API] Error fetching team stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/football/standings/:competition
 * Get league standings
 */
router.get('/football/standings/:competition', async (req, res) => {
  if (!footballDataApi) {
    return res.status(503).json({
      success: false,
      error: 'Football data API not available'
    });
  }

  try {
    const { competition } = req.params;
    const standings = await footballDataApi.getStandings(competition);

    res.json({
      success: true,
      data: standings
    });
  } catch (error) {
    console.error('[API] Error fetching standings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/football/clear-cache
 * Clear all caches (for debugging/refresh)
 */
router.post('/football/clear-cache', (req, res) => {
  if (!footballPredictionService) {
    return res.status(503).json({
      success: false,
      error: 'Football prediction service not available'
    });
  }

  try {
    footballPredictionService.clearCache();
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/football/cache-stats
 * Get cache statistics
 */
router.get('/football/cache-stats', (req, res) => {
  if (!footballPredictionService) {
    return res.status(503).json({
      success: false,
      error: 'Football prediction service not available'
    });
  }

  try {
    const stats = footballPredictionService.getCacheStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// EV BETS API (Server-side calculated)
// ============================================

/**
 * GET /api/ev-bets
 * Get active EV bets from Firebase (pre-calculated by server)
 * Query params: league, minEV, maxOdds, limit
 */
router.get('/ev-bets', async (req, res) => {
  if (!evBetFinder) {
    return res.status(503).json({
      success: false,
      error: 'EV bet finder service not available'
    });
  }

  try {
    const { league, minEV = 0, maxOdds = 10, limit = 100 } = req.query;

    const result = await evBetFinder.getActiveValueBets({
      league: league && league !== 'all' ? league : null,
      minEV: parseFloat(minEV),
      maxOdds: parseFloat(maxOdds),
      limit: parseInt(limit)
    });

    res.json(result);
  } catch (error) {
    console.error('[API] Error fetching EV bets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ev-bets/refresh
 * Manually trigger an EV bet scan (admin/debug)
 */
router.post('/ev-bets/refresh', async (req, res) => {
  if (!evBetFinder) {
    return res.status(503).json({
      success: false,
      error: 'EV bet finder service not available'
    });
  }

  try {
    console.log('[API] Manual EV bet refresh triggered');
    const result = await evBetFinder.runEvBetFinder();
    res.json(result);
  } catch (error) {
    console.error('[API] Error refreshing EV bets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// NBA PLAYER PROPS API (Balldontlie)
// ============================================

/**
 * GET /api/nba/stat-types
 * Get available stat types for player props
 */
router.get('/nba/stat-types', (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  res.json({
    success: true,
    data: balldontlieService.getStatTypes()
  });
});

/**
 * GET /api/nba/player/search
 * Search for a player by name
 * Query params: name (required)
 */
router.get('/nba/player/search', async (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Player name is required'
      });
    }

    const players = await balldontlieService.searchPlayer(name);
    res.json({
      success: true,
      count: players.length,
      data: players
    });
  } catch (error) {
    console.error('[API] Error searching player:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nba/player/stats
 * Get player's last N games stats
 * Query params: name (required), games (default 10)
 */
router.get('/nba/player/stats', async (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  try {
    const { name, games = 10 } = req.query;
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Player name is required'
      });
    }

    const stats = await balldontlieService.getLastNGamesStats(name, parseInt(games));
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('[API] Error fetching player stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nba/player/season
 * Get player's season stats
 * Query params: name (required), season (optional, e.g., 2024)
 */
router.get('/nba/player/season', async (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  try {
    const { name, season } = req.query;
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Player name is required'
      });
    }

    const stats = await balldontlieService.getSeasonStats(name, season ? parseInt(season) : null);
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('[API] Error fetching season stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nba/hit-rate
 * Calculate hit rate for a player prop
 * "How many times has player gone over X in last N games?"
 * Query params: name (required), stat (required), line (required), games (default 10)
 */
router.get('/nba/hit-rate', async (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  try {
    const { name, stat, line, games = 10 } = req.query;

    if (!name || !stat || line === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required params: name, stat, line'
      });
    }

    const result = await balldontlieService.calculateHitRate(
      name,
      stat,
      parseFloat(line),
      parseInt(games)
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[API] Error calculating hit rate:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nba/season-hit-rate
 * Calculate season hit rate for a player prop
 * Query params: name (required), stat (required), line (required), season (optional)
 */
router.get('/nba/season-hit-rate', async (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  try {
    const { name, stat, line, season } = req.query;

    if (!name || !stat || line === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required params: name, stat, line'
      });
    }

    const result = await balldontlieService.calculateSeasonHitRate(
      name,
      stat,
      parseFloat(line),
      season ? parseInt(season) : null
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[API] Error calculating season hit rate:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/nba/analyze-prop
 * Full prop analysis with EV calculation
 * Query params: name (required), stat (required), line (required), odds (required), games (default 15)
 * Example: /api/nba/analyze-prop?name=LeBron James&stat=points&line=25.5&odds=-110&games=15
 */
router.get('/nba/analyze-prop', async (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  try {
    const { name, stat, line, odds, games = 15 } = req.query;

    if (!name || !stat || line === undefined || odds === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required params: name, stat, line, odds'
      });
    }

    const result = await balldontlieService.analyzePlayerProp(
      name,
      stat,
      parseFloat(line),
      odds,
      parseInt(games)
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[API] Error analyzing prop:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/nba/calculate-ev
 * Calculate EV given probability and book odds
 * Body: { probability, bookOdds }
 */
router.post('/nba/calculate-ev', (req, res) => {
  if (!balldontlieService) {
    return res.status(503).json({
      success: false,
      error: 'NBA service not available'
    });
  }

  try {
    const { probability, bookOdds } = req.body;

    if (probability === undefined || bookOdds === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required: probability (0-1), bookOdds (American format)'
      });
    }

    const ev = balldontlieService.calculateEV(parseFloat(probability), bookOdds);
    res.json({
      success: true,
      ...ev
    });
  } catch (error) {
    console.error('[API] Error calculating EV:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// OPTICODDS PROXY API
// ============================================
router.use('/opticodds', opticOddsRoutes);

// ============================================
// FOOTBALL BET HISTORY (Sportmonks)
// ============================================

// Import sportmonks stats service
let sportmonksStats;
try {
  sportmonksStats = require('../services/sportmonksStats');
} catch (error) {
  console.warn('[API] Sportmonks stats service not loaded:', error.message);
}

/**
 * POST /api/football/bet-history
 * Check how many times a bet would have won in last 10 matches
 * Body: { market, betType, line, homeTeam, awayTeam, selection }
 */
router.post('/football/bet-history', async (req, res) => {
  if (!sportmonksStats) {
    return res.status(503).json({
      success: false,
      error: 'Sportmonks stats service not available'
    });
  }

  try {
    const { market, betType, line, homeTeam, awayTeam, selection } = req.body;

    if (!market || !homeTeam) {
      return res.status(400).json({
        success: false,
        error: 'Required: market, homeTeam'
      });
    }

    console.log(`[API] Checking bet history: ${homeTeam} - ${market} ${betType} ${line}`);

    const result = await sportmonksStats.checkBetHistory({
      market,
      betType,
      line,
      homeTeam,
      awayTeam,
      selection
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[API] Error checking bet history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/football/team-fixtures/:teamName
 * Get last 10 fixtures for a team
 */
router.get('/football/team-fixtures/:teamName', async (req, res) => {
  if (!sportmonksStats) {
    return res.status(503).json({
      success: false,
      error: 'Sportmonks stats service not available'
    });
  }

  try {
    const { teamName } = req.params;
    const { limit = 10 } = req.query;

    const team = await sportmonksStats.searchTeam(teamName);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: `Team not found: ${teamName}`
      });
    }

    const fixtures = await sportmonksStats.getTeamLastFixtures(team.id, parseInt(limit));
    const stats = fixtures.map(f => sportmonksStats.extractMatchStats(f, team.id));

    res.json({
      success: true,
      team: { id: team.id, name: team.name },
      fixtures: stats
    });
  } catch (error) {
    console.error('[API] Error fetching team fixtures:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// TELEGRAM NOTIFICATIONS API
// ============================================

// Import telegram notifier
let telegramNotifier;
try {
  telegramNotifier = require('../services/telegramNotifier');
} catch (error) {
  console.warn('[API] Telegram notifier not loaded:', error.message);
}

/**
 * GET /api/telegram/config
 * Get current Telegram notification configuration
 */
router.get('/telegram/config', (req, res) => {
  if (!telegramNotifier) {
    return res.status(503).json({
      success: false,
      error: 'Telegram notifier not available'
    });
  }

  res.json({
    success: true,
    data: telegramNotifier.getConfig()
  });
});

/**
 * POST /api/telegram/config
 * Update Telegram notification configuration
 * Body: { minEV, maxOdds, sports, enabled, cooldownMinutes }
 */
router.post('/telegram/config', (req, res) => {
  if (!telegramNotifier) {
    return res.status(503).json({
      success: false,
      error: 'Telegram notifier not available'
    });
  }

  try {
    const newConfig = telegramNotifier.updateConfig(req.body);
    res.json({
      success: true,
      data: newConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/telegram/test
 * Send a test message to Telegram
 */
router.post('/telegram/test', async (req, res) => {
  if (!telegramNotifier) {
    return res.status(503).json({
      success: false,
      error: 'Telegram notifier not available'
    });
  }

  try {
    const success = await telegramNotifier.sendTestMessage();
    res.json({
      success,
      message: success ? 'Test message sent!' : 'Failed to send test message'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/telegram/send
 * Manually send a custom message to Telegram
 * Body: { message }
 */
router.post('/telegram/send', async (req, res) => {
  if (!telegramNotifier) {
    return res.status(503).json({
      success: false,
      error: 'Telegram notifier not available'
    });
  }

  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const success = await telegramNotifier.sendTelegramMessage(message);
    res.json({
      success,
      message: success ? 'Message sent!' : 'Failed to send message'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Import telegram bet storage and poller
let telegramBetStorage;
let telegramPoller;
try {
  telegramBetStorage = require('../services/telegramBetStorage');
  telegramPoller = require('../services/telegramCallbackPoller');
} catch (error) {
  console.warn('[API] Telegram bet storage/poller not loaded:', error.message);
}

/**
 * GET /api/telegram/bets
 * Get recent telegram bets
 * Query params: days (default 7)
 */
router.get('/telegram/bets', async (req, res) => {
  if (!telegramBetStorage) {
    return res.status(503).json({
      success: false,
      error: 'Telegram bet storage not available'
    });
  }

  try {
    const { days = 7 } = req.query;
    const bets = await telegramBetStorage.getRecentBets(parseInt(days));
    res.json({
      success: true,
      count: bets.length,
      data: bets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/telegram/tracked
 * Get tracked bets
 */
router.get('/telegram/tracked', async (req, res) => {
  if (!telegramBetStorage) {
    return res.status(503).json({
      success: false,
      error: 'Telegram bet storage not available'
    });
  }

  try {
    const bets = await telegramBetStorage.getTrackedBets();
    res.json({
      success: true,
      count: bets.length,
      data: bets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/telegram/stats
 * Get bet statistics
 */
router.get('/telegram/stats', async (req, res) => {
  if (!telegramBetStorage) {
    return res.status(503).json({
      success: false,
      error: 'Telegram bet storage not available'
    });
  }

  try {
    const stats = await telegramBetStorage.getBetStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/telegram/poller-status
 * Get Telegram callback poller status
 */
router.get('/telegram/poller-status', (req, res) => {
  if (!telegramPoller) {
    return res.status(503).json({
      success: false,
      error: 'Telegram poller not available'
    });
  }

  res.json({
    success: true,
    data: telegramPoller.getStatus()
  });
});

/**
 * POST /api/telegram/cleanup
 * Clean up old dismissed bets
 */
router.post('/telegram/cleanup', async (req, res) => {
  if (!telegramBetStorage) {
    return res.status(503).json({
      success: false,
      error: 'Telegram bet storage not available'
    });
  }

  try {
    await telegramBetStorage.cleanOldBets();
    res.json({
      success: true,
      message: 'Old bets cleaned up'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
