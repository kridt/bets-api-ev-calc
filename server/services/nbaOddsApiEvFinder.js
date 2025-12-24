// server/services/nbaOddsApiEvFinder.js
// NBA EV Finder using odds-api.io (has REAL Bet365 odds unlike OpticOdds)
// Sends Telegram notifications for 8%+ EV bets on bet365

const telegramNotifier = require('./telegramNotifier');

// Configuration
const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
const ODDS_API_BASE = 'https://api2.odds-api.io/v3';

// Bookmakers - Bet365 for playable, Pinnacle for sharp odds
const PLAYABLE_BOOKMAKERS = ['Bet365'];
const SHARP_BOOKMAKERS = ['Pinnacle'];
const ALL_BOOKMAKERS = [...PLAYABLE_BOOKMAKERS, ...SHARP_BOOKMAKERS];

// EV thresholds
const MIN_EV_PERCENT = 8.0; // Only 8%+ EV for Telegram notifications
const MAX_EVENTS = 10; // Limit events to avoid rate limits

// Player prop markets to track
const PLAYER_PROP_MARKETS = [
  'Points O/U',
  'Rebounds O/U',
  'Assists O/U',
  'Threes Made O/U',
  'Steals O/U',
  'Blocks O/U',
  'Points & Assists O/U',
  'Points & Rebounds O/U',
  'Assists & Rebounds O/U',
  'Points, Assists & Rebounds O/U',
  'Steals & Blocks O/U',
  'Double Double',
  'Triple Double'
];

// Market display names
const MARKET_DISPLAY = {
  'Points O/U': 'Points',
  'Rebounds O/U': 'Rebounds',
  'Assists O/U': 'Assists',
  'Threes Made O/U': '3-Pointers',
  'Steals O/U': 'Steals',
  'Blocks O/U': 'Blocks',
  'Points & Assists O/U': 'Pts+Asts',
  'Points & Rebounds O/U': 'Pts+Rebs',
  'Assists & Rebounds O/U': 'Rebs+Asts',
  'Points, Assists & Rebounds O/U': 'PRA',
  'Steals & Blocks O/U': 'Steals+Blocks',
  'Double Double': 'Double-Double',
  'Triple Double': 'Triple-Double'
};

// In-memory cache
let cachedEvBets = [];
let lastUpdate = null;
let isRunning = false;

/**
 * De-vig odds to get fair probability
 */
function devigOdds(overOdds, underOdds) {
  const overProb = 1 / overOdds;
  const underProb = 1 / underOdds;
  const total = overProb + underProb;

  return {
    fairOverProb: overProb / total,
    fairUnderProb: underProb / total
  };
}

/**
 * Calculate EV percentage
 */
function calculateEV(fairProb, odds) {
  return ((fairProb * odds) - 1) * 100;
}

/**
 * Parse player name from label like "Pascal Siakam (2) (23.5)"
 */
function parsePlayerLabel(label) {
  // Remove the line number at the end and team indicator
  const match = label.match(/^(.+?)\s*\(\d+\)\s*\([0-9.]+\)$/);
  if (match) {
    return match[1].trim();
  }
  return label;
}

/**
 * Fetch NBA events from odds-api.io
 */
async function fetchNBAEvents() {
  const url = `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=basketball&league=usa-nba&status=pending&limit=${MAX_EVENTS}`;

  console.log('[NBA-OddsAPI] Fetching NBA events...');
  const response = await fetch(url);
  const data = await response.json();
  console.log(`[NBA-OddsAPI] Found ${data?.length || 0} events`);

  return data || [];
}

/**
 * Fetch odds for an event
 */
async function fetchEventOdds(eventId) {
  const bookmakerList = ALL_BOOKMAKERS.map(b => encodeURIComponent(b)).join(',');
  const url = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${bookmakerList}`;

  const response = await fetch(url);
  return response.json();
}

// Map Bet365 market names to Pinnacle stat types in labels
const MARKET_TO_PINNACLE_STAT = {
  'Points O/U': 'Points',
  'Rebounds O/U': 'Rebounds',
  'Assists O/U': 'Assists',
  'Threes Made O/U': '3 Point FG',
  'Steals O/U': 'Steals',
  'Blocks O/U': 'Blocks',
  'Points & Assists O/U': 'Pts+Asts',
  'Points & Rebounds O/U': 'Pts+Rebs',
  'Assists & Rebounds O/U': 'Rebs+Asts',
  'Points, Assists & Rebounds O/U': 'Pts+Rebs+Asts',
  'Steals & Blocks O/U': 'Stls+Blks',
};

/**
 * Parse Pinnacle label like "Chet Holmgren (Rebounds)" -> { player: "Chet Holmgren", stat: "Rebounds" }
 */
function parsePinnacleLabel(label) {
  const match = label.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return { player: match[1].trim(), stat: match[2].trim() };
  }
  return null;
}

/**
 * Find EV opportunities in event odds
 */
function findEvOpportunities(event, oddsData) {
  const opportunities = [];

  if (!oddsData?.bookmakers) return opportunities;

  const bet365Markets = oddsData.bookmakers['Bet365'] || [];
  const pinnacleMarkets = oddsData.bookmakers['Pinnacle'] || [];

  // Find Pinnacle's combined Player Props market
  const pinnaclePlayerProps = pinnacleMarkets.find(m => m.name === 'Player Props');
  if (!pinnaclePlayerProps || !pinnaclePlayerProps.odds) {
    return opportunities;
  }

  // Build lookup: "PlayerName|StatType|Line" -> { over, under }
  const pinnacleOddsMap = new Map();
  for (const odd of pinnaclePlayerProps.odds) {
    const parsed = parsePinnacleLabel(odd.label);
    if (parsed) {
      const key = `${parsed.player.toLowerCase()}|${parsed.stat}|${odd.hdp}`;
      pinnacleOddsMap.set(key, {
        over: parseFloat(odd.over),
        under: parseFloat(odd.under)
      });
    }
  }

  // Process each Bet365 player prop market
  for (const marketName of PLAYER_PROP_MARKETS) {
    const bet365Market = bet365Markets.find(m => m.name === marketName);
    if (!bet365Market) continue;

    const pinnacleStatType = MARKET_TO_PINNACLE_STAT[marketName];
    if (!pinnacleStatType) continue;

    // Check each Bet365 player prop
    for (const bet365Odd of bet365Market.odds) {
      const player = parsePlayerLabel(bet365Odd.label);
      const line = bet365Odd.hdp;

      // Look up matching Pinnacle odds
      const key = `${player.toLowerCase()}|${pinnacleStatType}|${line}`;
      const pinnacleOdd = pinnacleOddsMap.get(key);

      if (!pinnacleOdd || !pinnacleOdd.over || !pinnacleOdd.under) continue;

      // De-vig Pinnacle odds to get fair probabilities
      const { fairOverProb, fairUnderProb } = devigOdds(pinnacleOdd.over, pinnacleOdd.under);

      const bet365Over = parseFloat(bet365Odd.over);
      const bet365Under = parseFloat(bet365Odd.under);

      // Check OVER bet EV
      if (bet365Over && bet365Over > 1) {
        const evOver = calculateEV(fairOverProb, bet365Over);
        if (evOver >= MIN_EV_PERCENT) {
          opportunities.push({
            matchId: event.id,
            matchName: `${event.home} vs ${event.away}`,
            homeTeam: event.home,
            awayTeam: event.away,
            matchDate: event.date,
            player: player,
            market: marketName,
            marketDisplay: MARKET_DISPLAY[marketName] || marketName,
            line: line,
            betType: 'OVER',
            bookmaker: 'bet365',
            bookmakerDisplay: 'Bet365',
            odds: bet365Over,
            evPercent: parseFloat(evOver.toFixed(2)),
            fairProb: fairOverProb,
            fairOdds: 1 / fairOverProb,
            comparableBooks: 1,
            sport: 'NBA',
            league: 'NBA',
            pinnacleOdds: pinnacleOdd.over,
            oddsUpdatedAt: bet365Market.updatedAt
          });
        }
      }

      // Check UNDER bet EV
      if (bet365Under && bet365Under > 1) {
        const evUnder = calculateEV(fairUnderProb, bet365Under);
        if (evUnder >= MIN_EV_PERCENT) {
          opportunities.push({
            matchId: event.id,
            matchName: `${event.home} vs ${event.away}`,
            homeTeam: event.home,
            awayTeam: event.away,
            matchDate: event.date,
            player: player,
            market: marketName,
            marketDisplay: MARKET_DISPLAY[marketName] || marketName,
            line: line,
            betType: 'UNDER',
            bookmaker: 'bet365',
            bookmakerDisplay: 'Bet365',
            odds: bet365Under,
            evPercent: parseFloat(evUnder.toFixed(2)),
            fairProb: fairUnderProb,
            fairOdds: 1 / fairUnderProb,
            comparableBooks: 1,
            sport: 'NBA',
            league: 'NBA',
            pinnacleOdds: pinnacleOdd.under,
            oddsUpdatedAt: bet365Market.updatedAt
          });
        }
      }
    }
  }

  return opportunities;
}

/**
 * Main function - find NBA EV bets and send Telegram notifications
 */
async function runNBAEvFinder() {
  if (isRunning) {
    console.log('[NBA-OddsAPI] Scan already in progress, skipping...');
    return { evBets: [], skipped: true };
  }

  if (!ODDS_API_KEY) {
    console.error('[NBA-OddsAPI] ODDS_API_KEY not configured');
    return { evBets: [], error: 'API key not configured' };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('[NBA-OddsAPI] Starting NBA EV scan...');

    // Fetch NBA events
    let events = await fetchNBAEvents();
    if (events.length === 0) {
      console.log('[NBA-OddsAPI] No NBA events found');
      return { evBets: [], stats: { events: 0, evBets: 0 } };
    }

    // Limit events to avoid rate limits
    events = events.slice(0, MAX_EVENTS);


    const allEvBets = [];
    let processedEvents = 0;

    for (const event of events) {
      try {
        // Fetch odds for this event
        const oddsData = await fetchEventOdds(event.id);

        // Find EV opportunities
        const opportunities = findEvOpportunities(event, oddsData);
        allEvBets.push(...opportunities);

        processedEvents++;

        // Rate limiting - 1 second between requests
        await new Promise(r => setTimeout(r, 1000));

      } catch (error) {
        console.log(`[NBA-OddsAPI] Error: ${event.home} vs ${event.away}: ${error.message}`);
      }
    }

    // Sort by EV descending
    allEvBets.sort((a, b) => b.evPercent - a.evPercent);

    // Update cache
    cachedEvBets = allEvBets;
    lastUpdate = new Date().toISOString();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[NBA-OddsAPI] Complete in ${duration}s - Found ${allEvBets.length} EV bets (${MIN_EV_PERCENT}%+)`);

    // Log top opportunities
    if (allEvBets.length > 0) {
      console.log('[NBA-OddsAPI] Top EV bets:');
      allEvBets.slice(0, 5).forEach((bet, i) => {
        console.log(`  ${i+1}. ${bet.player} ${bet.marketDisplay} ${bet.betType} ${bet.line} - ${bet.evPercent}% EV @ ${bet.odds} (Bet365)`);
      });
    }

    // Send Telegram notifications
    if (allEvBets.length > 0) {
      try {
        const telegramResult = await telegramNotifier.processEVBets(allEvBets, 'NBA');
        if (telegramResult.sent > 0) {
          console.log(`[NBA-OddsAPI] Sent ${telegramResult.sent} Telegram alerts`);
        }
      } catch (telegramError) {
        console.error('[NBA-OddsAPI] Telegram error:', telegramError.message);
      }
    }

    return {
      success: true,
      evBets: allEvBets,
      stats: {
        events: processedEvents,
        evBets: allEvBets.length,
        duration
      }
    };

  } catch (error) {
    console.error('[NBA-OddsAPI] Error:', error.message);
    return { success: false, error: error.message };
  } finally {
    isRunning = false;
  }
}

/**
 * Get cached EV bets
 */
function getCachedEvBets() {
  return {
    evBets: cachedEvBets,
    lastUpdate,
    count: cachedEvBets.length
  };
}

module.exports = {
  runNBAEvFinder,
  getCachedEvBets,
  MIN_EV_PERCENT
};
