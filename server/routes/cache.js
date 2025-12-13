// server/routes/cache.js
// REST API endpoints for accessing cached EV bets

const express = require('express');
const router = express.Router();
const evCache = require('../services/evCache');
const { manualRefresh, getSchedulerStatus } = require('../schedulers/cacheScheduler');
const { getConnectedClientsCount } = require('../websocket');

// GET /api/cache/nba - Get cached NBA data
router.get('/nba', (req, res) => {
  try {
    const cache = evCache.getNBACache();

    res.json({
      success: true,
      data: cache,
      meta: {
        lastUpdated: cache.lastUpdated,
        isRefreshing: cache.isRefreshing,
        totalMatches: cache.stats?.totalMatches || 0,
        totalEvBets: cache.stats?.totalEvBets || 0,
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/cache/football - Get cached Football data
router.get('/football', (req, res) => {
  try {
    const cache = evCache.getFootballCache();

    res.json({
      success: true,
      data: cache,
      meta: {
        lastUpdated: cache.lastUpdated,
        isRefreshing: cache.isRefreshing,
        totalMatches: cache.stats?.totalMatches || 0,
        totalEvBets: cache.stats?.totalEvBets || 0,
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/cache/status - Get cache status for all sports
router.get('/status', (req, res) => {
  try {
    const status = getSchedulerStatus();

    res.json({
      success: true,
      data: {
        ...status,
        connectedClients: getConnectedClientsCount(),
        serverTime: new Date().toISOString(),
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/cache/refresh - Manually trigger a cache refresh
router.post('/refresh', async (req, res) => {
  try {
    const { sport } = req.body;
    const validSports = ['nba', 'football', 'all'];

    if (sport && !validSports.includes(sport)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sport. Use one of: ${validSports.join(', ')}`,
      });
    }

    // Check if already refreshing
    const status = evCache.getCacheStatus();
    if (sport === 'nba' && status.nba.isRefreshing) {
      return res.status(409).json({
        success: false,
        error: 'NBA cache is already refreshing',
      });
    }
    if (sport === 'football' && status.football.isRefreshing) {
      return res.status(409).json({
        success: false,
        error: 'Football cache is already refreshing',
      });
    }

    // Start refresh in background
    res.json({
      success: true,
      message: `Refresh started for: ${sport || 'all'}`,
      isAsync: true,
    });

    // Perform refresh after response is sent
    manualRefresh(sport || 'all').catch(err => {
      console.error('[CacheRoutes] Manual refresh failed:', err.message);
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/cache/nba/bets - Get only NBA EV bets (lightweight)
router.get('/nba/bets', (req, res) => {
  try {
    const cache = evCache.getNBACache();
    const { minEV, maxOdds, bookmaker, market } = req.query;

    let bets = cache.evBets || [];

    // Apply filters
    if (minEV) {
      bets = bets.filter(b => b.evPercent >= parseFloat(minEV));
    }
    if (maxOdds) {
      bets = bets.filter(b => b.odds <= parseFloat(maxOdds));
    }
    if (bookmaker) {
      bets = bets.filter(b => b.bookmaker === bookmaker);
    }
    if (market) {
      bets = bets.filter(b => b.market.includes(market));
    }

    res.json({
      success: true,
      data: bets,
      meta: {
        total: bets.length,
        lastUpdated: cache.lastUpdated,
        filters: { minEV, maxOdds, bookmaker, market },
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/cache/football/bets - Get only Football EV bets (lightweight)
router.get('/football/bets', (req, res) => {
  try {
    const cache = evCache.getFootballCache();
    const { minEV, maxOdds, bookmaker, league, market } = req.query;

    let bets = cache.evBets || [];

    // Apply filters
    if (minEV) {
      bets = bets.filter(b => b.evPercent >= parseFloat(minEV));
    }
    if (maxOdds) {
      bets = bets.filter(b => b.odds <= parseFloat(maxOdds));
    }
    if (bookmaker) {
      bets = bets.filter(b => b.bookmaker === bookmaker);
    }
    if (league) {
      bets = bets.filter(b => b.league.includes(league));
    }
    if (market) {
      bets = bets.filter(b => b.market.includes(market));
    }

    res.json({
      success: true,
      data: bets,
      meta: {
        total: bets.length,
        lastUpdated: cache.lastUpdated,
        filters: { minEV, maxOdds, bookmaker, league, market },
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
