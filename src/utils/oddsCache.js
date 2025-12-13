// src/utils/oddsCache.js
// Client-side utility to fetch from the odds cache server

// Cache server URL - uses environment variable or defaults to Render deployment
const CACHE_SERVER_URL = import.meta.env.VITE_CACHE_SERVER_URL || 'https://odds-notifyer-server.onrender.com';

// Direct API config (fallback) - uses environment variable
const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api2.odds-api.io/v3';

// Flag to track if cache server is available
let cacheServerAvailable = true;
let lastCacheCheck = 0;
const CACHE_CHECK_INTERVAL = 60000; // Re-check every minute

// Check if cache server is available
async function checkCacheServer() {
  const now = Date.now();
  if (now - lastCacheCheck < CACHE_CHECK_INTERVAL) {
    return cacheServerAvailable;
  }

  try {
    const response = await fetch(`${CACHE_SERVER_URL}/health`, { timeout: 3000 });
    cacheServerAvailable = response.ok;
    lastCacheCheck = now;
    console.log(`[OddsCache] Server ${cacheServerAvailable ? 'available' : 'unavailable'}`);
  } catch {
    cacheServerAvailable = false;
    lastCacheCheck = now;
    console.log('[OddsCache] Server unavailable, using direct API');
  }

  return cacheServerAvailable;
}

// Get cache server status
export async function getCacheStatus() {
  try {
    const response = await fetch(`${CACHE_SERVER_URL}/api/status`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('[OddsCache] Failed to get status:', error);
  }
  return null;
}

// ==================== NBA FUNCTIONS ====================

// Get NBA events from cache
export async function getNbaEvents() {
  await checkCacheServer();

  if (cacheServerAvailable) {
    try {
      const response = await fetch(`${CACHE_SERVER_URL}/api/nba/events`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[OddsCache] Got ${data.count} NBA events from cache`);
        return { events: data.events, fromCache: true, lastUpdate: data.lastUpdate };
      }
    } catch (error) {
      console.error('[OddsCache] NBA events cache error:', error);
    }
  }

  // Fallback to direct API
  console.log('[OddsCache] Fetching NBA events from direct API');
  const toDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await fetch(
    `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=basketball&league=usa-nba&status=pending&to=${toDate}`
  );
  const events = await response.json();
  return { events, fromCache: false, lastUpdate: new Date() };
}

// Get NBA odds for a specific event
export async function getNbaOdds(eventId, bookmakers) {
  await checkCacheServer();

  if (cacheServerAvailable) {
    try {
      const response = await fetch(`${CACHE_SERVER_URL}/api/nba/odds/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.bookmakers) {
          console.log(`[OddsCache] Got NBA odds for ${eventId} from cache`);
          return { odds: data, fromCache: true };
        }
      }
    } catch (error) {
      console.error('[OddsCache] NBA odds cache error:', error);
    }
  }

  // Fallback to direct API
  console.log(`[OddsCache] Fetching NBA odds for ${eventId} from direct API`);
  const bookmakerStr = Array.isArray(bookmakers) ? bookmakers.join(',') : bookmakers;
  const response = await fetch(
    `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${bookmakerStr}`
  );
  const odds = await response.json();
  return { odds, fromCache: false };
}

// Get all NBA data (events + odds combined)
export async function getAllNbaData() {
  await checkCacheServer();

  if (cacheServerAvailable) {
    try {
      const response = await fetch(`${CACHE_SERVER_URL}/api/nba/all`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[OddsCache] Got all NBA data from cache: ${data.eventsWithOdds}/${data.totalEvents} events with odds`);
        return { ...data, fromCache: true };
      }
    } catch (error) {
      console.error('[OddsCache] NBA all data cache error:', error);
    }
  }

  // No direct API fallback for "all" - return empty
  return { events: [], fromCache: false, error: 'Cache server unavailable' };
}

// ==================== FOOTBALL FUNCTIONS ====================

// Get football events from cache
export async function getFootballEvents(leagueSlug) {
  await checkCacheServer();

  if (cacheServerAvailable) {
    try {
      const url = leagueSlug
        ? `${CACHE_SERVER_URL}/api/football/events/${leagueSlug}`
        : `${CACHE_SERVER_URL}/api/football/events`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log(`[OddsCache] Got football events from cache`);
        return { ...data, fromCache: true };
      }
    } catch (error) {
      console.error('[OddsCache] Football events cache error:', error);
    }
  }

  // Fallback to direct API
  console.log('[OddsCache] Fetching football events from direct API');
  const toDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const response = await fetch(
    `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${leagueSlug}&status=pending&to=${toDate}`
  );
  const events = await response.json();
  return { events, fromCache: false, lastUpdate: new Date() };
}

// Get football odds for a specific event
export async function getFootballOdds(eventId, bookmaker) {
  await checkCacheServer();

  if (cacheServerAvailable) {
    try {
      const response = await fetch(`${CACHE_SERVER_URL}/api/football/odds/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.bookmakers) {
          // If specific bookmaker requested, filter
          if (bookmaker && data.bookmakers[bookmaker]) {
            console.log(`[OddsCache] Got football odds for ${eventId}/${bookmaker} from cache`);
            return {
              odds: {
                ...data,
                bookmakers: { [bookmaker]: data.bookmakers[bookmaker] }
              },
              fromCache: true
            };
          }
          console.log(`[OddsCache] Got football odds for ${eventId} from cache`);
          return { odds: data, fromCache: true };
        }
      }
    } catch (error) {
      console.error('[OddsCache] Football odds cache error:', error);
    }
  }

  // Fallback to direct API
  console.log(`[OddsCache] Fetching football odds for ${eventId}/${bookmaker} from direct API`);
  const response = await fetch(
    `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${bookmaker}`
  );
  const odds = await response.json();
  return { odds, fromCache: false };
}

// Get all football data for a league
export async function getAllFootballData(leagueSlug) {
  await checkCacheServer();

  if (cacheServerAvailable) {
    try {
      const url = leagueSlug
        ? `${CACHE_SERVER_URL}/api/football/all/${leagueSlug}`
        : `${CACHE_SERVER_URL}/api/football/all`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log(`[OddsCache] Got all football data from cache`);
        return { ...data, fromCache: true };
      }
    } catch (error) {
      console.error('[OddsCache] Football all data cache error:', error);
    }
  }

  // No direct API fallback for "all" - return empty
  return { events: [], fromCache: false, error: 'Cache server unavailable' };
}

// Export config for components that need it
export const config = {
  CACHE_SERVER_URL,
  ODDS_API_KEY,
  ODDS_API_BASE
};
