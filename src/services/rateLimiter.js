// src/services/rateLimiter.js - API Rate Limiting and Quota Management

const STORAGE_KEY = 'api_rate_limiter';
const CACHE_KEY = 'match_results_cache';

/**
 * Rate Limiter Configuration
 */
const CONFIG = {
  // BetsAPI limits
  maxCallsPerDay: 500, // Adjust based on your API plan
  maxCallsPerHour: 100,
  minDelayBetweenCalls: 1000, // 1 second minimum between calls

  // Retry configuration
  maxRetries: 3,
  retryDelays: [60000, 300000, 900000], // 1min, 5min, 15min

  // Cache configuration
  cacheExpiryHours: 24, // Cache results for 24 hours
};

/**
 * Get rate limiter state from localStorage
 */
function getState() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return {
        dailyCalls: 0,
        hourlyCalls: 0,
        lastCallTime: 0,
        lastResetDate: new Date().toDateString(),
        lastResetHour: new Date().getHours(),
        callHistory: [],
      };
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('[RateLimiter] Error reading state:', error);
    return {
      dailyCalls: 0,
      hourlyCalls: 0,
      lastCallTime: 0,
      lastResetDate: new Date().toDateString(),
      lastResetHour: new Date().getHours(),
      callHistory: [],
    };
  }
}

/**
 * Save rate limiter state to localStorage
 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[RateLimiter] Error saving state:', error);
  }
}

/**
 * Reset counters if day/hour has changed
 */
function resetIfNeeded(state) {
  const now = new Date();
  const currentDate = now.toDateString();
  const currentHour = now.getHours();

  // Reset daily counter if new day
  if (state.lastResetDate !== currentDate) {
    console.log('[RateLimiter] New day detected - resetting daily counter');
    state.dailyCalls = 0;
    state.lastResetDate = currentDate;
    state.callHistory = [];
  }

  // Reset hourly counter if new hour
  if (state.lastResetHour !== currentHour) {
    console.log('[RateLimiter] New hour detected - resetting hourly counter');
    state.hourlyCalls = 0;
    state.lastResetHour = currentHour;
  }

  return state;
}

/**
 * Check if we can make an API call
 */
export function canMakeCall() {
  let state = getState();
  state = resetIfNeeded(state);

  // Check daily limit
  if (state.dailyCalls >= CONFIG.maxCallsPerDay) {
    return {
      allowed: false,
      reason: 'daily_limit',
      message: `Daily limit reached (${CONFIG.maxCallsPerDay} calls). Resets at midnight.`,
      remainingDaily: 0,
      remainingHourly: CONFIG.maxCallsPerHour - state.hourlyCalls,
    };
  }

  // Check hourly limit
  if (state.hourlyCalls >= CONFIG.maxCallsPerHour) {
    return {
      allowed: false,
      reason: 'hourly_limit',
      message: `Hourly limit reached (${CONFIG.maxCallsPerHour} calls). Wait until next hour.`,
      remainingDaily: CONFIG.maxCallsPerDay - state.dailyCalls,
      remainingHourly: 0,
    };
  }

  // Check minimum delay between calls
  const timeSinceLastCall = Date.now() - state.lastCallTime;
  if (timeSinceLastCall < CONFIG.minDelayBetweenCalls) {
    const waitTime = CONFIG.minDelayBetweenCalls - timeSinceLastCall;
    return {
      allowed: false,
      reason: 'rate_limit',
      message: `Please wait ${Math.ceil(waitTime / 1000)}s between API calls`,
      waitTime: waitTime,
      remainingDaily: CONFIG.maxCallsPerDay - state.dailyCalls,
      remainingHourly: CONFIG.maxCallsPerHour - state.hourlyCalls,
    };
  }

  return {
    allowed: true,
    remainingDaily: CONFIG.maxCallsPerDay - state.dailyCalls,
    remainingHourly: CONFIG.maxCallsPerHour - state.hourlyCalls,
  };
}

/**
 * Record an API call
 */
export function recordCall(endpoint) {
  let state = getState();
  state = resetIfNeeded(state);

  state.dailyCalls++;
  state.hourlyCalls++;
  state.lastCallTime = Date.now();
  state.callHistory.push({
    timestamp: Date.now(),
    endpoint: endpoint,
  });

  // Keep only last 100 calls in history
  if (state.callHistory.length > 100) {
    state.callHistory = state.callHistory.slice(-100);
  }

  saveState(state);

  console.log(`[RateLimiter] API call recorded. Daily: ${state.dailyCalls}/${CONFIG.maxCallsPerDay}, Hourly: ${state.hourlyCalls}/${CONFIG.maxCallsPerHour}`);
}

/**
 * Get current quota status
 */
export function getQuotaStatus() {
  let state = getState();
  state = resetIfNeeded(state);

  return {
    dailyCalls: state.dailyCalls,
    dailyLimit: CONFIG.maxCallsPerDay,
    dailyRemaining: CONFIG.maxCallsPerDay - state.dailyCalls,
    dailyPercentUsed: ((state.dailyCalls / CONFIG.maxCallsPerDay) * 100).toFixed(1),

    hourlyCalls: state.hourlyCalls,
    hourlyLimit: CONFIG.maxCallsPerHour,
    hourlyRemaining: CONFIG.maxCallsPerHour - state.hourlyCalls,
    hourlyPercentUsed: ((state.hourlyCalls / CONFIG.maxCallsPerHour) * 100).toFixed(1),

    lastCallTime: state.lastCallTime,
    timeSinceLastCall: Date.now() - state.lastCallTime,
  };
}

/**
 * Wait with rate limiting
 */
export async function waitForRateLimit() {
  const check = canMakeCall();

  if (!check.allowed) {
    if (check.reason === 'rate_limit' && check.waitTime) {
      console.log(`[RateLimiter] Waiting ${check.waitTime}ms before next call`);
      await new Promise(resolve => setTimeout(resolve, check.waitTime));
    } else {
      throw new Error(check.message);
    }
  }
}

/**
 * Cache match result
 */
export function cacheMatchResult(eventId, result) {
  try {
    const cache = getCache();
    cache[eventId] = {
      result: result,
      cachedAt: Date.now(),
      expiresAt: Date.now() + (CONFIG.cacheExpiryHours * 60 * 60 * 1000),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log(`[RateLimiter] Cached result for event ${eventId}`);
  } catch (error) {
    console.error('[RateLimiter] Error caching result:', error);
  }
}

/**
 * Get cached match result
 */
export function getCachedMatchResult(eventId) {
  try {
    const cache = getCache();
    const cached = cache[eventId];

    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      console.log(`[RateLimiter] Cache expired for event ${eventId}`);
      delete cache[eventId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    console.log(`[RateLimiter] Cache hit for event ${eventId}`);
    return cached.result;
  } catch (error) {
    console.error('[RateLimiter] Error reading cache:', error);
    return null;
  }
}

/**
 * Get cache
 */
function getCache() {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('[RateLimiter] Error reading cache:', error);
    return {};
  }
}

/**
 * Clear cache
 */
export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
  console.log('[RateLimiter] Cache cleared');
}

/**
 * Reset rate limiter (for testing/debugging)
 */
export function resetRateLimiter() {
  localStorage.removeItem(STORAGE_KEY);
  console.log('[RateLimiter] Rate limiter reset');
}

/**
 * Get configuration
 */
export function getConfig() {
  return { ...CONFIG };
}

/**
 * Update configuration
 */
export function updateConfig(newConfig) {
  Object.assign(CONFIG, newConfig);
  console.log('[RateLimiter] Configuration updated:', CONFIG);
}
