// src/utils/oddsApi.js - Client for Odds API

// API key should be set in environment variables
const API_KEY = import.meta.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.odds-api.io/v3';

// Warn if API key is not set
if (!API_KEY) {
  console.warn('[oddsApi] WARNING: ODDS_API_KEY not set in environment variables');
}

// User's bookmakers
export const USER_BOOKMAKERS = [
  "LeoVegas DK",
  "Expekt DK",
  "NordicBet",
  "Campobet DK",
  "Betano",
  "Bet365",
  "Unibet DK",
  "Betinia DK",
  "Betsson",
  "Kambi"
];

/**
 * Get all available sports
 * @returns {Promise<Array>} Array of available sports
 */
export async function getSports() {
  if (!API_KEY) {
    throw new Error('ODDS_API_KEY not configured');
  }

  const url = `${BASE_URL}/sports?apiKey=${API_KEY}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    console.error('[oddsApi] getSports error:', error.message);
    throw error;
  }
}

/**
 * Get upcoming football events
 * @param {Object} options - Query options
 * @param {string} options.league - League slug (optional)
 * @param {string} options.status - Event status: 'pending', 'live', 'settled'
 * @returns {Promise<Array>} Array of football events
 */
export async function getFootballEvents(options = {}) {
  if (!API_KEY) {
    throw new Error('ODDS_API_KEY not configured');
  }

  const { league, status = 'pending' } = options;

  let url = `${BASE_URL}/events?apiKey=${API_KEY}&sport=football`;

  if (league) {
    url += `&league=${encodeURIComponent(league)}`;
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const events = await response.json();

    if (events.error) {
      throw new Error(events.error);
    }

    if (!Array.isArray(events)) {
      console.warn('[oddsApi] getFootballEvents: Unexpected response format');
      return [];
    }

    // Filter by status if needed (API doesn't have status parameter)
    if (status) {
      return events.filter(e => e.status === status);
    }

    return events;
  } catch (error) {
    console.error('[oddsApi] getFootballEvents error:', error.message);
    throw error;
  }
}

/**
 * Get odds for a specific event
 * @param {number} eventId - Event ID
 * @param {string[]} bookmakers - Array of bookmaker names (optional, defaults to user's bookmakers)
 * @returns {Promise<Object>} Odds data for the event
 */
export async function getEventOdds(eventId, bookmakers = USER_BOOKMAKERS) {
  if (!API_KEY) {
    throw new Error('ODDS_API_KEY not configured');
  }

  if (!eventId) {
    throw new Error('eventId is required');
  }

  const bookmakersParam = bookmakers.join(',');
  const url = `${BASE_URL}/odds?apiKey=${API_KEY}&eventId=${eventId}&bookmakers=${encodeURIComponent(bookmakersParam)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (error) {
    console.error(`[oddsApi] getEventOdds error for event ${eventId}:`, error.message);
    throw error;
  }
}

/**
 * Get upcoming events with their odds
 * @param {Object} options - Query options
 * @param {string[]} options.bookmakers - Bookmakers to fetch odds for
 * @param {number} options.limit - Maximum number of events to fetch
 */
export async function getUpcomingEventsWithOdds(options = {}) {
  const { bookmakers = USER_BOOKMAKERS, limit = 50 } = options;

  // Get upcoming events
  const events = await getFootballEvents({ status: 'pending' });

  // Filter to only future events
  const now = new Date();
  const futureEvents = events
    .filter(e => new Date(e.date) > now)
    .slice(0, limit);

  // Fetch odds for each event
  const eventsWithOdds = await Promise.all(
    futureEvents.map(async (event) => {
      try {
        const odds = await getEventOdds(event.id, bookmakers);
        return { ...event, odds };
      } catch (error) {
        console.error(`Failed to fetch odds for event ${event.id}:`, error.message);
        return { ...event, odds: null };
      }
    })
  );

  // Filter out events that failed to get odds
  return eventsWithOdds.filter(e => e.odds !== null);
}

/**
 * Get league events with odds (supports all leagues or specific league)
 * @param {Object} options - Query options
 * @param {string} options.league - League slug (or 'all' for all leagues)
 * @param {string[]} options.bookmakers - Bookmakers to fetch odds for
 * @param {number} options.limit - Maximum number of events to fetch per league
 */
export async function getLeagueEventsWithOdds(options = {}) {
  const { league = 'england-premier-league', bookmakers = USER_BOOKMAKERS, limit = 15 } = options;

  let allEvents = [];

  if (league === 'all') {
    // Fetch from all major leagues
    const leagues = [
      'england-premier-league',
      'spain-laliga',
      'germany-bundesliga',
      'italy-serie-a',
      'france-ligue-1',
      'netherlands-eredivisie',
      'portugal-liga-portugal',
      'england-championship',
      'brazil-brasileiro-serie-a',
      'denmark-superliga'
    ];

    for (const leagueSlug of leagues) {
      try {
        const url = `${BASE_URL}/events?apiKey=${API_KEY}&sport=football&league=${leagueSlug}&status=pending&limit=${limit}`;
        const response = await fetch(url);
        const events = await response.json();

        if (!events.error && Array.isArray(events)) {
          allEvents.push(...events);
        }
      } catch (error) {
        console.error(`Failed to fetch ${leagueSlug}:`, error.message);
      }
    }

    console.log(`[oddsApi] ✅ Found ${allEvents.length} events across all leagues`);
  } else {
    // Fetch from specific league
    const url = `${BASE_URL}/events?apiKey=${API_KEY}&sport=football&league=${league}&status=pending&limit=${limit}`;

    console.log(`[oddsApi] Fetching ${league} events:`, url);

    const response = await fetch(url);
    const events = await response.json();

    if (events.error) {
      throw new Error(events.error);
    }

    allEvents = events;
    console.log(`[oddsApi] ✅ Found ${allEvents.length} ${league} events`);
  }

  // Filter to only future events
  const now = new Date();
  const futureEvents = allEvents.filter(e => new Date(e.date) > now);

  console.log(`[oddsApi] ✅ ${futureEvents.length} future events`);

  // Fetch odds for each event
  const eventsWithOdds = await Promise.all(
    futureEvents.map(async (event) => {
      try {
        const odds = await getEventOdds(event.id, bookmakers);
        return { ...event, odds };
      } catch (error) {
        console.error(`Failed to fetch odds for event ${event.id}:`, error.message);
        return { ...event, odds: null };
      }
    })
  );

  // Filter out events that failed to get odds
  const validEvents = eventsWithOdds.filter(e => e.odds !== null);

  console.log(`[oddsApi] ✅ ${validEvents.length} events with valid odds`);

  // Sort by date (earliest first) when showing all leagues
  if (league === 'all') {
    validEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  return validEvents;
}

/**
 * Get Premier League events with odds (optimized)
 * @param {Object} options - Query options
 * @param {string[]} options.bookmakers - Bookmakers to fetch odds for
 * @param {number} options.limit - Maximum number of events to fetch
 */
export async function getPremierLeagueEventsWithOdds(options = {}) {
  return getLeagueEventsWithOdds({ ...options, league: 'england-premier-league' });
}

/**
 * Extract specific market odds from bookmaker data
 * @param {Object} bookmakerData - Bookmaker odds data
 * @param {string} marketName - Market name (e.g., "Corners Totals", "ML")
 */
export function extractMarketOdds(bookmakerData, marketName) {
  if (!bookmakerData || !Array.isArray(bookmakerData)) {
    return null;
  }

  const market = bookmakerData.find(m => m.name === marketName);
  return market || null;
}

/**
 * Find best odds across bookmakers for a specific market
 * @param {Object} oddsData - Full odds data from getEventOdds
 * @param {string} marketName - Market name
 * @param {string} selection - Selection type: 'home', 'away', 'draw', 'over', 'under'
 */
export function findBestOdds(oddsData, marketName, selection) {
  if (!oddsData || !oddsData.bookmakers) {
    return null;
  }

  let bestOdds = {
    bookmaker: null,
    odds: 0,
    url: null
  };

  for (const [bookmaker, markets] of Object.entries(oddsData.bookmakers)) {
    const market = extractMarketOdds(markets, marketName);

    if (!market || !market.odds || market.odds.length === 0) {
      continue;
    }

    const oddsValue = parseFloat(market.odds[0][selection]);

    if (oddsValue && oddsValue > bestOdds.odds) {
      bestOdds = {
        bookmaker,
        odds: oddsValue,
        url: oddsData.urls?.[bookmaker] || null,
        updatedAt: market.updatedAt
      };
    }
  }

  return bestOdds.bookmaker ? bestOdds : null;
}

/**
 * Get all bookmaker odds for a specific market
 * @param {Object} oddsData - Full odds data
 * @param {string} marketName - Market name
 * @param {string} selection - Selection type
 */
export function getAllBookmakerOdds(oddsData, marketName, selection) {
  if (!oddsData || !oddsData.bookmakers) {
    return [];
  }

  const allOdds = [];

  for (const [bookmaker, markets] of Object.entries(oddsData.bookmakers)) {
    const market = extractMarketOdds(markets, marketName);

    if (!market || !market.odds || market.odds.length === 0) {
      continue;
    }

    const oddsValue = parseFloat(market.odds[0][selection]);

    if (oddsValue) {
      allOdds.push({
        bookmaker,
        odds: oddsValue,
        url: oddsData.urls?.[bookmaker] || null,
        updatedAt: market.updatedAt
      });
    }
  }

  // Sort by odds (highest first)
  return allOdds.sort((a, b) => b.odds - a.odds);
}

/**
 * Map common market names to API market names
 */
export const MARKET_MAP = {
  // Match markets
  'match_result': 'ML',
  'draw_no_bet': 'Draw No Bet',
  'spread': 'Spread',
  'goals': 'Totals',
  'goals_alt': 'Goals Over/Under',

  // Half-time markets
  'spread_ht': 'Spread HT',
  'goals_ht': 'Totals HT',

  // Team totals
  'team_total_home': 'Team Total Home',
  'team_total_away': 'Team Total Away',

  // Corners
  'corners': 'Corners Totals',
  'corners_spread': 'Corners Spread',
  'corners_ht': 'Corners Totals HT',

  // Player props
  'goalscorer': 'Anytime Goalscorer',
  'shots_on_target': 'Player Shots On Target',
  'score_or_assist': 'Player to Score or Assist'
};

/**
 * Get mapped market name
 */
export function getMarketName(key) {
  return MARKET_MAP[key] || key;
}
