// server/services/evCache.js
// In-memory cache for NBA and Football EV bets
// Provides instant access to pre-calculated EV opportunities

// Cache structure
const cache = {
  nba: {
    matches: [],        // All matches with their EV opportunities
    evBets: [],         // Flattened list of all +EV bets
    lastUpdated: null,
    isRefreshing: false,
    error: null,
    progress: null,     // { current, total, step, message }
    stats: {
      totalMatches: 0,
      totalEvBets: 0,
      refreshCount: 0,
      lastRefreshDuration: 0,
    }
  },
  football: {
    matches: [],
    evBets: [],
    lastUpdated: null,
    isRefreshing: false,
    error: null,
    progress: null,     // { current, total, step, message }
    stats: {
      totalMatches: 0,
      totalEvBets: 0,
      refreshCount: 0,
      lastRefreshDuration: 0,
    }
  }
};

// Event listeners for WebSocket notifications
const listeners = [];

// Subscribe to cache updates
const subscribe = (callback) => {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
};

// Notify all listeners of cache update
const notifyListeners = (sport, data) => {
  listeners.forEach(callback => {
    try {
      callback(sport, data);
    } catch (err) {
      console.error('[EVCache] Listener error:', err.message);
    }
  });
};

// Get NBA cache
const getNBACache = () => ({
  matches: cache.nba.matches,
  evBets: cache.nba.evBets,
  lastUpdated: cache.nba.lastUpdated,
  isRefreshing: cache.nba.isRefreshing,
  error: cache.nba.error,
  stats: cache.nba.stats,
});

// Get Football cache
const getFootballCache = () => ({
  matches: cache.football.matches,
  evBets: cache.football.evBets,
  lastUpdated: cache.football.lastUpdated,
  isRefreshing: cache.football.isRefreshing,
  error: cache.football.error,
  stats: cache.football.stats,
});

// Get cache status for both sports
const getCacheStatus = () => ({
  nba: {
    lastUpdated: cache.nba.lastUpdated,
    isRefreshing: cache.nba.isRefreshing,
    error: cache.nba.error,
    totalMatches: cache.nba.stats.totalMatches,
    totalEvBets: cache.nba.stats.totalEvBets,
    refreshCount: cache.nba.stats.refreshCount,
  },
  football: {
    lastUpdated: cache.football.lastUpdated,
    isRefreshing: cache.football.isRefreshing,
    error: cache.football.error,
    totalMatches: cache.football.stats.totalMatches,
    totalEvBets: cache.football.stats.totalEvBets,
    refreshCount: cache.football.stats.refreshCount,
  }
});

// Update NBA cache
const setNBACache = (data) => {
  const startTime = cache.nba.isRefreshing ? Date.now() - (cache.nba._refreshStartTime || Date.now()) : 0;

  cache.nba = {
    ...cache.nba,
    matches: data.matches || [],
    evBets: data.evBets || [],
    lastUpdated: new Date().toISOString(),
    isRefreshing: false,
    error: null,
    stats: {
      totalMatches: data.matches?.length || 0,
      totalEvBets: data.evBets?.length || 0,
      refreshCount: cache.nba.stats.refreshCount + 1,
      lastRefreshDuration: startTime,
    }
  };

  notifyListeners('nba', getNBACache());
  console.log(`[EVCache] NBA cache updated: ${cache.nba.stats.totalMatches} matches, ${cache.nba.stats.totalEvBets} EV bets`);
};

// Update Football cache
const setFootballCache = (data) => {
  const startTime = cache.football.isRefreshing ? Date.now() - (cache.football._refreshStartTime || Date.now()) : 0;

  cache.football = {
    ...cache.football,
    matches: data.matches || [],
    evBets: data.evBets || [],
    lastUpdated: new Date().toISOString(),
    isRefreshing: false,
    error: null,
    stats: {
      totalMatches: data.matches?.length || 0,
      totalEvBets: data.evBets?.length || 0,
      refreshCount: cache.football.stats.refreshCount + 1,
      lastRefreshDuration: startTime,
    }
  };

  notifyListeners('football', getFootballCache());
  console.log(`[EVCache] Football cache updated: ${cache.football.stats.totalMatches} matches, ${cache.football.stats.totalEvBets} EV bets`);
};

// Mark cache as refreshing
const setRefreshing = (sport, isRefreshing) => {
  if (sport === 'nba') {
    cache.nba.isRefreshing = isRefreshing;
    if (isRefreshing) cache.nba._refreshStartTime = Date.now();
  } else if (sport === 'football') {
    cache.football.isRefreshing = isRefreshing;
    if (isRefreshing) cache.football._refreshStartTime = Date.now();
  }
  notifyListeners(sport, sport === 'nba' ? getNBACache() : getFootballCache());
};

// Set error state
const setError = (sport, error) => {
  if (sport === 'nba') {
    cache.nba.error = error;
    cache.nba.isRefreshing = false;
  } else if (sport === 'football') {
    cache.football.error = error;
    cache.football.isRefreshing = false;
  }
  notifyListeners(sport, sport === 'nba' ? getNBACache() : getFootballCache());
};

// Set progress state for cache building
const setProgress = (sport, progress) => {
  // progress: { current, total, step, message }
  if (sport === 'nba') {
    cache.nba.progress = progress;
  } else if (sport === 'football') {
    cache.football.progress = progress;
  }
  // Notify with progress event
  notifyListeners(`${sport}:progress`, { sport, progress });
};

// Get progress for a sport
const getProgress = (sport) => {
  if (sport === 'nba') return cache.nba.progress;
  if (sport === 'football') return cache.football.progress;
  return null;
};

// Check if cache is stale (older than threshold)
const isStale = (sport, thresholdMs = 5 * 60 * 1000) => {
  const lastUpdated = sport === 'nba' ? cache.nba.lastUpdated : cache.football.lastUpdated;
  if (!lastUpdated) return true;

  const age = Date.now() - new Date(lastUpdated).getTime();
  return age > thresholdMs;
};

// Clear cache for a sport
const clearCache = (sport) => {
  if (sport === 'nba') {
    cache.nba.matches = [];
    cache.nba.evBets = [];
    cache.nba.lastUpdated = null;
    cache.nba.error = null;
  } else if (sport === 'football') {
    cache.football.matches = [];
    cache.football.evBets = [];
    cache.football.lastUpdated = null;
    cache.football.error = null;
  }
};

module.exports = {
  // Getters
  getNBACache,
  getFootballCache,
  getCacheStatus,
  getProgress,

  // Setters
  setNBACache,
  setFootballCache,
  setRefreshing,
  setError,
  setProgress,

  // Utilities
  isStale,
  clearCache,

  // Subscriptions
  subscribe,
};
