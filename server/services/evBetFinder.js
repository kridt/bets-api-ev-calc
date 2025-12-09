// server/services/evBetFinder.js
// EV Bet Finder - Matches predictions with odds to find value bets
// Runs every 2 minutes, saves results to Firebase

const axios = require('axios');
const { db, collections } = require('../config/firebase');
const footballPredictionService = require('./footballPredictionService');

// Odds API configuration
const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
const ODDS_API_BASE = 'https://api2.odds-api.io/v3';

// User's bookmakers (Danish market)
const USER_BOOKMAKERS = [
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

// League configurations with football-data.org codes and odds-api.io slugs
// NOTE: Limited to EPL only to avoid rate limits on free tier (10 req/min)
// Add more leagues when you have a paid API plan
const SUPPORTED_LEAGUES = [
  { code: 'PL', slug: 'england-premier-league', name: 'Premier League' }
  // Uncomment these when rate limits allow:
  // { code: 'BL1', slug: 'germany-bundesliga', name: 'Bundesliga' },
  // { code: 'SA', slug: 'italy-serie-a', name: 'Serie A' },
  // { code: 'PD', slug: 'spain-laliga', name: 'La Liga' },
  // { code: 'FL1', slug: 'france-ligue-1', name: 'Ligue 1' },
  // { code: 'DED', slug: 'netherlands-eredivisie', name: 'Eredivisie' },
  // { code: 'PPL', slug: 'portugal-liga-portugal', name: 'Liga Portugal' },
  // { code: 'ELC', slug: 'england-championship', name: 'Championship' }
];

// Market mapping from prediction statKey to Odds API market names
const MARKET_MAPPING = {
  'goals': 'Totals',
  'corners': 'Corners Totals',
  'yellow_cards': 'Bookings Totals',
  'shots_on_target': null  // Not available in Odds API
};

// Minimum EV threshold for value bets
const MIN_EV_THRESHOLD = 3.0;

/**
 * Fetch events with odds from Odds API for a specific league
 */
async function fetchLeagueOdds(leagueSlug) {
  try {
    // Step 1: Get events
    const eventsUrl = `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${leagueSlug}&status=pending&limit=30`;
    const eventsResponse = await axios.get(eventsUrl);
    const events = eventsResponse.data;

    if (!Array.isArray(events) || events.length === 0) {
      return [];
    }

    // Step 2: Fetch odds for each event
    const eventsWithOdds = [];
    for (const event of events) {
      try {
        const oddsUrl = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${event.id}&bookmakers=${USER_BOOKMAKERS.join(',')}`;
        const oddsResponse = await axios.get(oddsUrl);

        if (oddsResponse.data && oddsResponse.data.bookmakers) {
          eventsWithOdds.push({
            ...event,
            odds: oddsResponse.data
          });
        }

        // Rate limiting - wait 200ms between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        // Skip events that fail to fetch odds
      }
    }

    return eventsWithOdds;
  } catch (error) {
    console.error(`[EVFinder] Error fetching ${leagueSlug} odds:`, error.message);
    return [];
  }
}

/**
 * Normalize team name for matching
 */
function normalizeTeamName(name) {
  return name
    .toLowerCase()
    .replace(/fc|afc|sc|sv|vfb|vfl|rb|tsv|fsc|1\.|1899|1846|1910/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2)
    .join(' ');
}

/**
 * Match a prediction with an odds event
 */
function findMatchingOddsEvent(prediction, oddsEvents) {
  const predHome = normalizeTeamName(prediction.home_team.name);
  const predAway = normalizeTeamName(prediction.away_team.name);

  for (const event of oddsEvents) {
    const eventHome = normalizeTeamName(event.home);
    const eventAway = normalizeTeamName(event.away);

    // Check if team names match (allowing for partial matches)
    const homeMatch = predHome.includes(eventHome) || eventHome.includes(predHome) ||
                      predHome.split(' ').some(w => eventHome.includes(w));
    const awayMatch = predAway.includes(eventAway) || eventAway.includes(predAway) ||
                      predAway.split(' ').some(w => eventAway.includes(w));

    if (homeMatch && awayMatch) {
      return event;
    }
  }

  return null;
}

/**
 * Extract bookmaker odds for a specific market and line
 */
function extractBookmakerOdds(oddsData, marketName, selection, targetLine) {
  if (!oddsData || !oddsData.bookmakers) return [];

  const bookmakerOdds = [];

  for (const [bookmaker, markets] of Object.entries(oddsData.bookmakers)) {
    const market = markets.find(m => m.name === marketName);
    if (!market || !market.odds) continue;

    for (const oddsEntry of market.odds) {
      // Check if line matches (within 0.1 tolerance)
      if (targetLine !== undefined && oddsEntry.hdp !== undefined) {
        if (Math.abs(oddsEntry.hdp - targetLine) > 0.1) continue;
      }

      const oddsValue = parseFloat(oddsEntry[selection]);
      if (oddsValue && oddsValue > 1.01) {
        bookmakerOdds.push({
          bookmaker,
          odds: oddsValue,
          line: oddsEntry.hdp,
          url: oddsData.urls?.[bookmaker]
        });
        break;  // Only take first matching line per bookmaker
      }
    }
  }

  return bookmakerOdds.sort((a, b) => b.odds - a.odds);
}

/**
 * Calculate EV for a prediction with bookmaker odds
 */
function calculateEV(probability, odds) {
  // EV = (probability * odds) - 1
  const probDecimal = probability / 100;
  return (probDecimal * odds - 1) * 100;
}

/**
 * Find value bets for all supported leagues
 */
async function findAllValueBets() {
  console.log(`[${new Date().toISOString()}] Starting EV bet finder...`);

  const allValueBets = [];
  const stats = {
    leaguesScanned: 0,
    matchesWithPredictions: 0,
    matchesWithOdds: 0,
    matchesMatched: 0,
    predictionsAnalyzed: 0,
    valueBetsFound: 0
  };

  for (const league of SUPPORTED_LEAGUES) {
    try {
      console.log(`[EVFinder] Processing ${league.name}...`);

      // Step 1: Get predictions from football-data.org
      const predictions = await footballPredictionService.getPredictionsForCompetition(league.code, {
        minProb: 55,
        maxProb: 75,
        maxMatches: 30
      });

      if (!predictions.matches || predictions.matches.length === 0) {
        console.log(`[EVFinder] No predictions for ${league.name}`);
        continue;
      }

      stats.matchesWithPredictions += predictions.matches.length;

      // Step 2: Get odds from Odds API
      const oddsEvents = await fetchLeagueOdds(league.slug);
      stats.matchesWithOdds += oddsEvents.length;

      if (oddsEvents.length === 0) {
        console.log(`[EVFinder] No odds events for ${league.name}`);
        continue;
      }

      stats.leaguesScanned++;

      // Step 3: Match predictions with odds and find value bets
      for (const match of predictions.matches) {
        const oddsEvent = findMatchingOddsEvent(match, oddsEvents);
        if (!oddsEvent) continue;

        stats.matchesMatched++;

        for (const prediction of match.predictions) {
          stats.predictionsAnalyzed++;

          // Get the Odds API market name
          const apiMarketName = MARKET_MAPPING[prediction.statKey];
          if (!apiMarketName) continue;

          // Extract bookmaker odds for this prediction
          const bookmakerOdds = extractBookmakerOdds(
            oddsEvent.odds,
            apiMarketName,
            prediction.side,
            prediction.line
          );

          if (bookmakerOdds.length === 0) continue;

          // Calculate EV for each bookmaker
          const valueBooksWithEV = bookmakerOdds.map(book => ({
            ...book,
            ev: calculateEV(prediction.probability, book.odds)
          })).filter(book => book.ev >= MIN_EV_THRESHOLD);

          if (valueBooksWithEV.length === 0) continue;

          // Found a value bet!
          const bestOdds = valueBooksWithEV[0];

          const valueBet = {
            // Match info
            matchId: `${league.code}_${match.gameId}`,
            homeTeam: match.home_team.name,
            awayTeam: match.away_team.name,
            kickoff: match.kickoff,
            league: league.name,
            leagueCode: league.code,

            // Prediction info
            market: prediction.market || prediction.statKey,
            statKey: prediction.statKey,
            selection: prediction.side,
            line: prediction.line,
            probability: prediction.probability,
            fairOdds: prediction.fairOdds,
            predictedTotal: prediction.matchPrediction,
            homeAvg: prediction.homeAvg,
            awayAvg: prediction.awayAvg,
            confidence: prediction.confidence,

            // Best odds
            bestBookmaker: bestOdds.bookmaker,
            bestOdds: bestOdds.odds,
            bestEV: bestOdds.ev,
            bestUrl: bestOdds.url,

            // All value bookmakers
            allBookmakers: valueBooksWithEV,

            // Metadata
            detectedAt: new Date().toISOString(),
            status: 'active',
            result: null
          };

          allValueBets.push(valueBet);
          stats.valueBetsFound++;
        }
      }

      console.log(`[EVFinder] ${league.name}: ${stats.valueBetsFound} value bets so far`);

    } catch (error) {
      console.error(`[EVFinder] Error processing ${league.name}:`, error.message);
    }
  }

  console.log(`[EVFinder] Scan complete:`, stats);
  return { valueBets: allValueBets, stats };
}

/**
 * Save value bets to Firebase
 */
// Helper to add timeout to promises
function withTimeout(promise, ms, operation) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
    )
  ]);
}

// In-memory cache for value bets (fallback if Firebase fails)
let cachedValueBets = [];
let lastCacheUpdate = null;

async function saveValueBetsToFirebase(valueBets) {
  console.log(`[EVFinder] saveValueBetsToFirebase called with ${valueBets?.length || 0} bets`);

  if (!valueBets || valueBets.length === 0) {
    console.log('[EVFinder] No value bets to save');
    return { saved: 0, updated: 0 };
  }

  let saved = 0;
  let updated = 0;
  let errors = 0;

  console.log(`[EVFinder] Starting to save ${valueBets.length} bets to Firebase...`);

  for (let i = 0; i < valueBets.length; i++) {
    const bet = valueBets[i];
    try {
      // Create a unique ID for the bet (match + market + selection + line)
      const betKey = `${bet.matchId}_${bet.statKey}_${bet.selection}_${bet.line}`;

      if (i % 10 === 0 || i === valueBets.length - 1) {
        console.log(`[EVFinder] Progress: ${i+1}/${valueBets.length} bets...`);
      }

      const docRef = db.collection(collections.VALUE_BETS).doc(betKey);

      // Check if bet already exists with timeout
      const existing = await withTimeout(docRef.get(), 10000, 'get');

      if (existing.exists) {
        // Update existing bet with new odds/EV
        await withTimeout(docRef.update({
          bestBookmaker: bet.bestBookmaker,
          bestOdds: bet.bestOdds,
          bestEV: bet.bestEV,
          bestUrl: bet.bestUrl,
          allBookmakers: bet.allBookmakers,
          detectedAt: bet.detectedAt
        }), 10000, 'update');
        updated++;
      } else {
        // Create new bet - sanitize data to avoid undefined values
        // Sanitize allBookmakers array to remove undefined urls
        const sanitizedBookmakers = (bet.allBookmakers || []).map(b => ({
          bookmaker: b.bookmaker || '',
          odds: b.odds || 0,
          line: b.line || 0,
          url: b.url || null,
          ev: b.ev || 0
        }));

        const betData = {
          matchId: bet.matchId || '',
          homeTeam: bet.homeTeam || '',
          awayTeam: bet.awayTeam || '',
          kickoff: bet.kickoff || '',
          league: bet.league || '',
          leagueCode: bet.leagueCode || '',
          market: bet.market || bet.statKey || '',
          statKey: bet.statKey || '',
          selection: bet.selection || '',
          line: bet.line || 0,
          probability: bet.probability || 0,
          fairOdds: bet.fairOdds || 0,
          predictedTotal: bet.predictedTotal || 0,
          homeAvg: bet.homeAvg || 0,
          awayAvg: bet.awayAvg || 0,
          confidence: bet.confidence || '',
          bestBookmaker: bet.bestBookmaker || '',
          bestOdds: bet.bestOdds || 0,
          bestEV: bet.bestEV || 0,
          bestUrl: bet.bestUrl || null,
          allBookmakers: sanitizedBookmakers,
          detectedAt: bet.detectedAt || new Date().toISOString(),
          status: bet.status || 'active',
          result: bet.result || null,
          id: betKey,
          createdAt: new Date().toISOString()
        };

        await withTimeout(docRef.set(betData), 10000, 'set');
        saved++;
      }
    } catch (error) {
      errors++;
      if (errors <= 3) {
        console.error(`[EVFinder] Error saving bet ${i+1}:`, error.message);
      }
    }
  }

  console.log(`[EVFinder] Complete: saved=${saved}, updated=${updated}, errors=${errors}`);
  return { saved, updated, errors };
}

/**
 * Clean up expired bets (matches that have started)
 * Note: Uses simple query to avoid requiring Firebase composite indexes
 */
async function cleanupExpiredBets() {
  try {
    const now = new Date().toISOString();

    // Simple query - get all active bets, filter in memory
    const snapshot = await db.collection(collections.VALUE_BETS)
      .where('status', '==', 'active')
      .get();

    if (snapshot.empty) return 0;

    // Filter expired bets in memory
    const expiredDocs = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.kickoff && data.kickoff < now;
    });

    if (expiredDocs.length === 0) return 0;

    const batch = db.batch();
    expiredDocs.forEach(doc => {
      batch.update(doc.ref, { status: 'expired' });
    });

    await batch.commit();
    console.log(`[EVFinder] Marked ${expiredDocs.length} bets as expired`);
    return expiredDocs.length;
  } catch (error) {
    console.error('[EVFinder] Error cleaning up expired bets:', error.message);
    return 0;
  }
}

/**
 * Main function - find and save value bets
 */
async function runEvBetFinder() {
  const startTime = Date.now();

  try {
    // Step 1: Clean up expired bets (non-blocking)
    cleanupExpiredBets().catch(e => console.error('[EVFinder] Cleanup error:', e.message));

    // Step 2: Find new value bets
    const { valueBets, stats } = await findAllValueBets();

    // Step 3: Save to in-memory cache (always works)
    cachedValueBets = valueBets;
    lastCacheUpdate = new Date().toISOString();
    console.log(`[EVFinder] Cached ${valueBets.length} value bets in memory`);

    // Step 4: Try to save to Firebase (non-blocking, don't wait)
    saveValueBetsToFirebase(valueBets)
      .then(result => console.log(`[EVFinder] Firebase save: saved=${result.saved}, updated=${result.updated}, errors=${result.errors}`))
      .catch(e => console.error('[EVFinder] Firebase save failed:', e.message));

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[EVFinder] Complete in ${duration}s - Found ${stats.valueBetsFound} value bets`);

    return {
      success: true,
      duration,
      stats,
      valueBets: valueBets.length,
      source: 'cache'
    };
  } catch (error) {
    console.error('[EVFinder] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get active value bets - tries Firebase first, falls back to in-memory cache
 */
async function getActiveValueBets(options = {}) {
  const { league, minEV = 0, maxOdds = 10, limit = 100 } = options;

  let bets = [];
  let source = 'cache';

  // Try Firebase first with a short timeout
  try {
    const snapshot = await withTimeout(
      db.collection(collections.VALUE_BETS).where('status', '==', 'active').get(),
      5000,
      'Firebase query'
    );

    if (!snapshot.empty) {
      bets = snapshot.docs.map(doc => doc.data());
      source = 'firebase';
      console.log(`[EVFinder] Got ${bets.length} bets from Firebase`);
    }
  } catch (error) {
    console.log(`[EVFinder] Firebase query failed, using cache: ${error.message}`);
  }

  // Fallback to in-memory cache if Firebase failed or returned empty
  if (bets.length === 0 && cachedValueBets.length > 0) {
    bets = cachedValueBets;
    source = 'cache';
    console.log(`[EVFinder] Using cached bets: ${bets.length} (updated: ${lastCacheUpdate})`);
  }

  // Filter and sort in memory
  bets = bets
    .filter(bet => {
      // Filter by minEV
      if (bet.bestEV < minEV) return false;
      // Filter by maxOdds
      if (bet.bestOdds > maxOdds) return false;
      // Filter by league if specified
      if (league && bet.leagueCode !== league) return false;
      return true;
    })
    // Sort by bestEV descending
    .sort((a, b) => b.bestEV - a.bestEV)
    // Limit results
    .slice(0, limit);

    // Group by match for frontend display
    const matchesMap = new Map();

    for (const bet of bets) {
      const matchKey = bet.matchId;
      if (!matchesMap.has(matchKey)) {
        matchesMap.set(matchKey, {
          matchId: bet.matchId,
          homeTeam: bet.homeTeam,
          awayTeam: bet.awayTeam,
          kickoff: bet.kickoff,
          league: bet.league,
          leagueCode: bet.leagueCode,
          valueBets: [],
          bestEV: 0,
          totalEV: 0
        });
      }

      const match = matchesMap.get(matchKey);
      match.valueBets.push(bet);
      match.totalEV += bet.bestEV;
      match.bestEV = Math.max(match.bestEV, bet.bestEV);
    }

    // Convert to array and sort by best EV
    const matches = Array.from(matchesMap.values())
      .sort((a, b) => b.bestEV - a.bestEV);

    return {
      success: true,
      matches,
      totalBets: bets.length,
      totalMatches: matches.length,
      source,
      cacheUpdatedAt: lastCacheUpdate,
      generatedAt: new Date().toISOString()
    };
}

module.exports = {
  runEvBetFinder,
  findAllValueBets,
  getActiveValueBets,
  cleanupExpiredBets
};
