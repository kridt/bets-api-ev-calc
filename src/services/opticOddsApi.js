// src/services/opticOddsApi.js
// OpticOdds API service for fetching odds data
// API Documentation: https://developer.opticodds.com

const OPTIC_API_KEY = 'aa0061ed-f43f-4ad6-a493-8bb239253a00';
const OPTIC_API_BASE = 'https://api.opticodds.com/api/v3';

// ============ SPORTSBOOKS ============
// Mapping from our internal names to OpticOdds sportsbook IDs
// Verified against OpticOdds /sportsbooks/active endpoint
export const SPORTSBOOK_MAP = {
  // Sharp books
  'Pinnacle': 'pinnacle',

  // European books (playable)
  'Betano': 'betano',
  'Unibet DK': 'unibet_denmark_',
  'Unibet': 'unibet',
  '888sport': '888sport',
  'Betway': 'betway',
  'Betsson': 'betsson',
  'Betsafe': 'betsafe',
  'William Hill': 'william_hill',
  'Betfair': 'betfair',
  'bwin': 'bwin',
  'LeoVegas': 'leovegas',

  // US books
  'DraftKings': 'draftkings',
  'FanDuel': 'fanduel',
  'BetMGM': 'betmgm',
  'Caesars': 'caesars',
  'BetRivers': 'betrivers',
  'Fanatics': 'fanatics',
  'Bally Bet': 'bally_bet',
  'Borgata': 'borgata',

  // Other books
  'Bovada': 'bovada',
  'BetOnline': 'betonline',
  'Superbet': 'superbet',
  'PrizePicks': 'prizepicks',
  'Fliff': 'fliff',
  'Stake': 'stake',
};

// Reverse mapping for display
export const SPORTSBOOK_DISPLAY = Object.fromEntries(
  Object.entries(SPORTSBOOK_MAP).map(([display, id]) => [id, display])
);

// ============ LEAGUES ============
// Soccer leagues mapping - 17 selected leagues
export const SOCCER_LEAGUES = {
  // TOP 5 European leagues
  'england-premier-league': 'england_-_premier_league',
  'spain-laliga': 'spain_-_la_liga',
  'germany-bundesliga': 'germany_-_bundesliga',
  'italy-serie-a': 'italy_-_serie_a',
  'france-ligue-1': 'france_-_ligue_1',

  // 2nd tier leagues
  'england-championship': 'england_-_championship',
  'spain-laliga-2': 'spain_-_la_liga_2',
  'germany-2-bundesliga': 'germany_-_bundesliga_2',
  'italy-serie-b': 'italy_-_serie_b',

  // Other European leagues
  'netherlands-eredivisie': 'netherlands_-_eredivisie',
  'portugal-liga-portugal': 'portugal_-_primeira_liga',
  'belgium-pro-league': 'belgium_-_jupiler_pro_league',
  'scotland-premiership': 'scotland_-_premiership',
  'denmark-superliga': 'denmark_-_superliga',

  // UEFA competitions
  'international-clubs-uefa-champions-league': 'uefa_-_champions_league',
  'international-clubs-uefa-europa-league': 'uefa_-_europa_league',
  'international-clubs-uefa-conference-league': 'uefa_-_europa_conference_league',
};

// Basketball leagues
export const BASKETBALL_LEAGUES = {
  'usa-nba': 'nba',
  'usa-wnba': 'wnba',
};

// ============ MARKETS ============
// Soccer market mapping (our key -> OpticOdds market_id)
export const SOCCER_MARKETS = {
  // Match markets
  'totals': ['total_goals', 'asian_total_goals'],
  'spread': ['asian_handicap', 'goal_spread'],
  'moneyline': ['moneyline_3-way', 'moneyline'],

  // Team totals
  'team_total_home': ['team_total_goals', 'team_total'],
  'team_total_away': ['team_total_goals', 'team_total'],

  // Corners
  'corners_totals': ['total_corners'],
  'corners_spread': ['corner_handicap', 'most_corners_3-way'],

  // Shots
  'shots_on_target_totals': ['total_shots_on_target'],
  'shots_on_target_home': ['team_total_shots_on_target'],
  'shots_on_target_away': ['team_total_shots_on_target'],
  'shots_totals': ['total_shots'],
  'shots_home': ['team_total_shots'],
  'shots_away': ['team_total_shots'],

  // Player props
  'goalscorer': ['anytime_goal_scorer', 'first_goal_scorer'],
  'player_shots': ['player_shots', 'player_shots_on_target'],
  'player_assists': ['player_assists'],
  'player_tackles': ['player_tackles'],
  'player_cards': ['player_cards', 'anytime_card_receiver'],
  'player_passes': ['player_passes', 'player_passes_completed'],
  'player_fouls': ['player_fouls'],
  'player_saves': ['player_saves'],
};

// Basketball market mapping
export const BASKETBALL_MARKETS = {
  // Match markets
  'totals': ['total_points'],
  'spread': ['point_spread'],
  'moneyline': ['moneyline'],

  // Player props
  'player_points': ['player_points'],
  'player_rebounds': ['player_rebounds'],
  'player_assists': ['player_assists'],
  'player_threes': ['player_made_threes'],
  'player_steals': ['player_steals'],
  'player_blocks': ['player_blocks'],
  'player_pts_rebs': ['player_points_+_rebounds'],
  'player_pts_asts': ['player_points_+_assists'],
  'player_rebs_asts': ['player_rebounds_+_assists'],
  'player_pts_rebs_asts': ['player_points_+_rebounds_+_assists'],
  'player_turnovers': ['player_turnovers'],
  'player_double_double': ['player_double_double'],
  'player_triple_double': ['player_triple_double'],
};

// ============ UTILITY FUNCTIONS ============

/**
 * Convert American odds to decimal odds
 * @param {number} americanOdds - American odds (e.g., -110, +150)
 * @returns {number} Decimal odds (e.g., 1.91, 2.50)
 */
export function americanToDecimal(americanOdds) {
  if (americanOdds === null || americanOdds === undefined || isNaN(americanOdds)) {
    return null;
  }
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
}

/**
 * Convert decimal odds to American odds
 * @param {number} decimalOdds - Decimal odds (e.g., 1.91, 2.50)
 * @returns {number} American odds (e.g., -110, +150)
 */
export function decimalToAmerican(decimalOdds) {
  if (decimalOdds === null || decimalOdds === undefined || isNaN(decimalOdds)) {
    return null;
  }
  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  } else {
    return Math.round(-100 / (decimalOdds - 1));
  }
}

/**
 * Make authenticated API request to OpticOdds
 */
async function apiRequest(endpoint, params = {}) {
  const url = new URL(`${OPTIC_API_BASE}${endpoint}`);

  // Add query parameters
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      // For arrays, add multiple params with same key
      value.forEach(v => url.searchParams.append(key, v));
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': OPTIC_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`OpticOdds API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ============ API FUNCTIONS ============

/**
 * Get available sports
 */
export async function getSports() {
  const data = await apiRequest('/sports');
  return data.data;
}

/**
 * Get leagues for a sport
 */
export async function getLeagues(sport) {
  const data = await apiRequest('/leagues', { sport });
  return data.data;
}

/**
 * Get active sportsbooks for a sport/league
 */
export async function getActiveSportsbooks(sport, league) {
  const data = await apiRequest('/sportsbooks/active', { sport, league });
  return data.data;
}

/**
 * Get fixtures for a league
 * @param {string} sport - Sport ID (e.g., 'soccer', 'basketball')
 * @param {string} league - League ID (e.g., 'england_-_premier_league', 'nba')
 * @param {object} options - Additional options (status, limit, etc.)
 */
export async function getFixtures(sport, league, options = {}) {
  const params = {
    sport,
    league,
    ...options,
  };

  const data = await apiRequest('/fixtures', params);
  return data.data;
}

/**
 * Get odds for a specific fixture
 * @param {string} fixtureId - Fixture ID
 * @param {string[]} sportsbooks - Array of sportsbook IDs
 * @param {object} options - Additional options (market, etc.)
 */
export async function getFixtureOdds(fixtureId, sportsbooks, options = {}) {
  // OpticOdds requires separate sportsbook params for multiple books
  const params = {
    fixture_id: fixtureId,
    sportsbook: sportsbooks,
    ...options,
  };

  const data = await apiRequest('/fixtures/odds', params);
  return data.data?.[0] || null;
}

/**
 * Get odds for multiple fixtures (batched)
 * @param {string[]} fixtureIds - Array of fixture IDs
 * @param {string[]} sportsbooks - Array of sportsbook IDs
 */
export async function getBatchFixtureOdds(fixtureIds, sportsbooks) {
  // Fetch odds for each fixture in parallel
  const promises = fixtureIds.map(id => getFixtureOdds(id, sportsbooks));
  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

// ============ DATA TRANSFORMATION ============

/**
 * Transform OpticOdds fixture to our internal format
 */
export function transformFixture(fixture) {
  return {
    id: fixture.id,
    home: fixture.home_team_display,
    away: fixture.away_team_display,
    homeId: fixture.home_competitors?.[0]?.id,
    awayId: fixture.away_competitors?.[0]?.id,
    date: fixture.start_date,
    status: fixture.status,
    isLive: fixture.is_live,
    sport: fixture.sport,
    league: fixture.league,
    venue: fixture.venue_name,
  };
}

/**
 * Transform OpticOdds odds to our internal format
 * Groups odds by market and selection for easier processing
 */
export function transformOdds(oddsData, targetMarkets = null) {
  if (!oddsData?.odds) return [];

  const transformed = [];

  for (const odd of oddsData.odds) {
    // Convert American odds to decimal
    const decimalOdds = americanToDecimal(odd.price);
    if (!decimalOdds || decimalOdds <= 1) continue;

    // Get display name for sportsbook
    const bookmakerDisplay = SPORTSBOOK_DISPLAY[odd.sportsbook] || odd.sportsbook;

    // Determine if this is an over/under market
    const isOver = odd.selection_line === 'over' || odd.name?.toLowerCase().includes('over');
    const isUnder = odd.selection_line === 'under' || odd.name?.toLowerCase().includes('under');

    // Extract line/points
    const line = odd.points;

    // Get player name if this is a player prop
    const playerName = odd.player_id ? odd.name?.split(' ').slice(0, -1).join(' ') : null;

    transformed.push({
      id: odd.id,
      bookmaker: bookmakerDisplay,
      bookmarkerId: odd.sportsbook,
      market: odd.market,
      marketId: odd.market_id,
      name: odd.name,
      selection: odd.selection,
      normalizedSelection: odd.normalized_selection,
      selectionLine: odd.selection_line,
      isMain: odd.is_main,
      line: line,
      points: odd.points,
      price: odd.price, // Original American odds
      decimalOdds: decimalOdds, // Converted decimal odds
      playerId: odd.player_id,
      playerName: playerName,
      teamId: odd.team_id,
      groupingKey: odd.grouping_key,
      timestamp: odd.timestamp,
      isOver,
      isUnder,
    });
  }

  return transformed;
}

/**
 * Group transformed odds by market and line for EV calculation
 * Returns structure compatible with existing EV calculation code
 */
export function groupOddsByMarket(transformedOdds) {
  const groups = {};

  for (const odd of transformedOdds) {
    // Create group key based on market, line, and selection type
    const lineKey = odd.line !== null ? odd.line : 'null';
    const groupKey = `${odd.marketId}|${lineKey}|${odd.groupingKey || 'default'}`;

    if (!groups[groupKey]) {
      groups[groupKey] = {
        market: odd.market,
        marketId: odd.marketId,
        line: odd.line,
        groupingKey: odd.groupingKey,
        playerName: odd.playerName,
        odds: [],
      };
    }

    groups[groupKey].odds.push(odd);
  }

  return Object.values(groups);
}

/**
 * Parse odds into format compatible with existing EV calculation
 * Converts OpticOdds structure to match current odds-api.io format
 */
export function parseOddsForEV(oddsData, marketKeys = null) {
  const transformed = transformOdds(oddsData, marketKeys);
  const props = [];

  // Group odds by market, line, and bookmaker
  const byMarketLineBook = {};

  for (const odd of transformed) {
    const lineKey = odd.line !== null ? String(odd.line) : 'main';
    const key = `${odd.marketId}|${lineKey}|${odd.bookmaker}|${odd.playerName || 'match'}`;

    if (!byMarketLineBook[key]) {
      byMarketLineBook[key] = {
        bookmaker: odd.bookmaker,
        market: odd.market,
        marketId: odd.marketId,
        line: odd.line,
        playerName: odd.playerName,
        overOdds: null,
        underOdds: null,
        homeOdds: null,
        awayOdds: null,
        drawOdds: null,
        timestamp: odd.timestamp,
      };
    }

    // Assign odds based on selection type
    if (odd.isOver) {
      byMarketLineBook[key].overOdds = odd.decimalOdds;
    } else if (odd.isUnder) {
      byMarketLineBook[key].underOdds = odd.decimalOdds;
    } else if (odd.normalizedSelection?.includes('home') || odd.teamId) {
      // Team-specific odds
      if (odd.selection?.toLowerCase().includes('draw')) {
        byMarketLineBook[key].drawOdds = odd.decimalOdds;
      } else {
        // Determine home/away based on team position
        byMarketLineBook[key].homeOdds = odd.decimalOdds;
      }
    }
  }

  // Convert to props array
  for (const entry of Object.values(byMarketLineBook)) {
    props.push({
      player: entry.playerName || entry.market,
      market: entry.marketId,
      marketName: entry.market,
      marketType: entry.overOdds !== null ? 'totals' : 'spread',
      line: entry.line,
      overOdds: entry.overOdds,
      underOdds: entry.underOdds,
      homeOdds: entry.homeOdds,
      awayOdds: entry.awayOdds,
      bookmaker: entry.bookmaker,
      updatedAt: entry.timestamp ? new Date(entry.timestamp * 1000).toISOString() : null,
    });
  }

  return props;
}

// ============ CONVENIENCE FUNCTIONS ============

/**
 * Get upcoming soccer fixtures with odds
 */
export async function getSoccerFixturesWithOdds(leagueSlug, sportsbooks) {
  // Convert our league slug to OpticOdds format
  const opticLeague = SOCCER_LEAGUES[leagueSlug] || leagueSlug;
  const opticBooks = sportsbooks.map(b => SPORTSBOOK_MAP[b] || b);

  // Get fixtures
  const fixtures = await getFixtures('soccer', opticLeague, { status: 'unplayed' });

  // Get odds for each fixture
  const fixturesWithOdds = [];
  for (const fixture of fixtures.slice(0, 10)) { // Limit to first 10
    try {
      const oddsData = await getFixtureOdds(fixture.id, opticBooks);
      if (oddsData) {
        fixturesWithOdds.push({
          fixture: transformFixture(fixture),
          odds: oddsData.odds || [],
          props: parseOddsForEV(oddsData),
        });
      }
    } catch (err) {
      console.error(`Error fetching odds for ${fixture.id}:`, err);
    }
  }

  return fixturesWithOdds;
}

/**
 * Get upcoming NBA fixtures with odds
 */
export async function getNBAFixturesWithOdds(sportsbooks) {
  const opticBooks = sportsbooks.map(b => SPORTSBOOK_MAP[b] || b);

  // Get fixtures
  const fixtures = await getFixtures('basketball', 'nba', { status: 'unplayed' });

  // Get odds for each fixture
  const fixturesWithOdds = [];
  for (const fixture of fixtures.slice(0, 10)) { // Limit to first 10
    try {
      const oddsData = await getFixtureOdds(fixture.id, opticBooks);
      if (oddsData) {
        fixturesWithOdds.push({
          fixture: transformFixture(fixture),
          odds: oddsData.odds || [],
          props: parseOddsForEV(oddsData),
        });
      }
    } catch (err) {
      console.error(`Error fetching odds for ${fixture.id}:`, err);
    }
  }

  return fixturesWithOdds;
}

export default {
  // Core API functions
  getSports,
  getLeagues,
  getActiveSportsbooks,
  getFixtures,
  getFixtureOdds,
  getBatchFixtureOdds,

  // Transformation functions
  transformFixture,
  transformOdds,
  groupOddsByMarket,
  parseOddsForEV,

  // Utility functions
  americanToDecimal,
  decimalToAmerican,

  // Convenience functions
  getSoccerFixturesWithOdds,
  getNBAFixturesWithOdds,

  // Mappings
  SPORTSBOOK_MAP,
  SPORTSBOOK_DISPLAY,
  SOCCER_LEAGUES,
  BASKETBALL_LEAGUES,
  SOCCER_MARKETS,
  BASKETBALL_MARKETS,
};
