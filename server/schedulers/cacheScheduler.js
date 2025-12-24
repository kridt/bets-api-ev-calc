// server/schedulers/cacheScheduler.js
// Schedules cache refresh every 5 minutes for NBA and Football
// Staggers refreshes to avoid rate limits

const { buildNBACache } = require('../services/nbaCacheBuilder');
const { buildFootballCache } = require('../services/footballCacheBuilder');
const { runNBAEvFinder } = require('../services/nbaOddsApiEvFinder');
const evCache = require('../services/evCache');

// Configuration
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NBA_OFFSET_MS = 0;                   // NBA starts immediately
const FOOTBALL_OFFSET_MS = 2 * 60 * 1000;  // Football starts 2 minutes after NBA

let nbaInterval = null;
let footballInterval = null;
let isRunning = false;

// Refresh NBA cache (runs both OpticOdds cache builder and odds-api.io EV finder)
const refreshNBA = async () => {
  const startTime = Date.now();
  console.log('[CacheScheduler] Refreshing NBA cache...');

  try {
    // Run the OpticOdds cache builder for frontend display
    const result = await buildNBACache();
    console.log(`[CacheScheduler] NBA OpticOdds cache: ${result.evBets.length} EV bets in ${result.duration}ms`);

    // Also run the odds-api.io EV finder (has real Bet365 odds!)
    // This one sends Telegram notifications for 8%+ EV bets
    try {
      const oddsApiResult = await runNBAEvFinder();
      if (oddsApiResult.stats) {
        console.log(`[CacheScheduler] NBA odds-api.io: ${oddsApiResult.stats.evBets} EV bets (8%+) in ${oddsApiResult.stats.duration}s`);
      }
    } catch (oddsApiErr) {
      console.error('[CacheScheduler] NBA odds-api.io failed:', oddsApiErr.message);
    }

    return result;
  } catch (err) {
    console.error('[CacheScheduler] NBA refresh failed:', err.message);
    throw err;
  }
};

// Refresh Football cache
const refreshFootball = async () => {
  const startTime = Date.now();
  console.log('[CacheScheduler] Refreshing Football cache...');

  try {
    const result = await buildFootballCache();
    console.log(`[CacheScheduler] Football refresh complete: ${result.evBets.length} EV bets found in ${result.duration}ms`);
    return result;
  } catch (err) {
    console.error('[CacheScheduler] Football refresh failed:', err.message);
    throw err;
  }
};

// Refresh all caches
const refreshAll = async () => {
  console.log('[CacheScheduler] Refreshing all caches...');

  const results = {
    nba: null,
    football: null,
    errors: [],
  };

  // Refresh NBA first
  try {
    results.nba = await refreshNBA();
  } catch (err) {
    results.errors.push({ sport: 'nba', error: err.message });
  }

  // Wait a bit then refresh Football
  await new Promise(r => setTimeout(r, FOOTBALL_OFFSET_MS));

  try {
    results.football = await refreshFootball();
  } catch (err) {
    results.errors.push({ sport: 'football', error: err.message });
  }

  console.log('[CacheScheduler] All caches refreshed');
  return results;
};

// Start the scheduler
const startCacheScheduler = () => {
  if (isRunning) {
    console.log('[CacheScheduler] Already running');
    return;
  }

  console.log(`[CacheScheduler] Starting (refresh every ${REFRESH_INTERVAL_MS / 1000}s)`);
  isRunning = true;

  // Run initial refresh
  refreshAll().catch(err => {
    console.error('[CacheScheduler] Initial refresh failed:', err.message);
  });

  // Set up interval for future refreshes
  nbaInterval = setInterval(async () => {
    try {
      await refreshNBA();
    } catch (err) {
      console.error('[CacheScheduler] NBA interval refresh failed:', err.message);
    }
  }, REFRESH_INTERVAL_MS);

  // Football starts with offset
  setTimeout(() => {
    footballInterval = setInterval(async () => {
      try {
        await refreshFootball();
      } catch (err) {
        console.error('[CacheScheduler] Football interval refresh failed:', err.message);
      }
    }, REFRESH_INTERVAL_MS);
  }, FOOTBALL_OFFSET_MS);

  console.log('[CacheScheduler] Scheduler started');
};

// Stop the scheduler
const stopCacheScheduler = () => {
  if (!isRunning) {
    console.log('[CacheScheduler] Not running');
    return;
  }

  if (nbaInterval) {
    clearInterval(nbaInterval);
    nbaInterval = null;
  }

  if (footballInterval) {
    clearInterval(footballInterval);
    footballInterval = null;
  }

  isRunning = false;
  console.log('[CacheScheduler] Scheduler stopped');
};

// Get scheduler status
const getSchedulerStatus = () => ({
  isRunning,
  refreshIntervalMs: REFRESH_INTERVAL_MS,
  cache: evCache.getCacheStatus(),
});

// Manual refresh trigger
const manualRefresh = async (sport = 'all') => {
  console.log(`[CacheScheduler] Manual refresh triggered for: ${sport}`);

  if (sport === 'nba') {
    return refreshNBA();
  } else if (sport === 'football') {
    return refreshFootball();
  } else {
    return refreshAll();
  }
};

module.exports = {
  startCacheScheduler,
  stopCacheScheduler,
  getSchedulerStatus,
  manualRefresh,
  refreshNBA,
  refreshFootball,
  refreshAll,
};
