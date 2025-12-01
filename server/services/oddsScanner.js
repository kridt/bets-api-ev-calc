// server/services/oddsScanner.js
const { db, collections } = require('../config/firebase');
const axios = require('axios');

/**
 * Odds Scanner - Runs every 120 seconds
 * Fetches current odds from bookmakers and stores snapshots
 */

/**
 * Fetch odds from odds API
 */
async function fetchOdds(matchId) {
  try {
    // Using odds-api.io (replace with your actual odds API)
    const response = await axios.get(`https://api.odds-api.io/v1/odds`, {
      params: {
        apiKey: process.env.ODDS_API_KEY || 'your-odds-api-key',
        sport: 'soccer_epl',
        matchId: matchId
      }
    });

    return response.data || null;
  } catch (error) {
    console.error(`Error fetching odds for match ${matchId}:`, error.message);
    return null;
  }
}

/**
 * Parse odds data into structured format
 */
function parseOddsData(oddsData) {
  if (!oddsData || !oddsData.bookmakers) return null;

  const markets = {};

  // Group odds by market type
  for (const [bookmaker, marketData] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(marketData)) continue;

    for (const market of marketData) {
      const marketName = market.name;

      if (!markets[marketName]) {
        markets[marketName] = [];
      }

      // Extract odds for this bookmaker
      if (market.odds && Array.isArray(market.odds)) {
        for (const oddsEntry of market.odds) {
          markets[marketName].push({
            bookmaker,
            line: oddsEntry.hdp || oddsEntry.line,
            over: parseFloat(oddsEntry.over || oddsEntry.home),
            under: parseFloat(oddsEntry.under || oddsEntry.away),
            updatedAt: market.updatedAt || new Date()
          });
        }
      }
    }
  }

  return markets;
}

/**
 * Save odds snapshot to Firebase
 */
async function saveOddsSnapshot(matchId, markets) {
  const batch = db.batch();

  for (const [marketName, bookmakers] of Object.entries(markets)) {
    const snapshotRef = db.collection(collections.ODDS_SNAPSHOTS).doc();

    batch.set(snapshotRef, {
      id: snapshotRef.id,
      matchId,
      market: marketName,
      bookmakers,
      scannedAt: new Date()
    });
  }

  await batch.commit();
}

/**
 * Get recent predictions for a match
 */
async function getRecentPredictions(matchId) {
  // Get predictions from the last 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const snapshot = await db.collection(collections.PREDICTIONS)
    .where('matchId', '==', matchId)
    .where('scannedAt', '>=', sixHoursAgo)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Detect value bets by comparing predictions with current odds
 */
async function detectValueBets(matchId, markets, predictions) {
  const valueBets = [];

  for (const prediction of predictions) {
    const marketOdds = markets[getMarketName(prediction.market)];
    if (!marketOdds) continue;

    // Find odds for the predicted line
    const relevantOdds = marketOdds.filter(odd =>
      Math.abs(odd.line - prediction.line) < 0.1
    );

    if (relevantOdds.length === 0) continue;

    // Calculate EV for each bookmaker
    const oddsSide = prediction.selection === 'over' ? 'over' : 'under';

    for (const bookmakerOdds of relevantOdds) {
      const odds = bookmakerOdds[oddsSide];
      if (!odds || odds < 1.01) continue;

      // Calculate Expected Value
      const impliedProb = 1 / odds;
      const trueProbDecimal = prediction.probability / 100;
      const ev = (trueProbDecimal * odds - 1) * 100;

      // Only store if EV > 3%
      if (ev > 3) {
        valueBets.push({
          matchId,
          predictionId: prediction.id,
          market: prediction.market,
          selection: prediction.selection,
          line: prediction.line,
          probability: prediction.probability,
          predictedTotal: prediction.predictedTotal,
          homeAvg: prediction.homeAvg,
          awayAvg: prediction.awayAvg,
          bookmaker: bookmakerOdds.bookmaker,
          odds,
          ev,
          detectedAt: new Date(),
          status: 'active'
        });
      }
    }
  }

  return valueBets;
}

/**
 * Map internal market names to odds API market names
 */
function getMarketName(market) {
  const mapping = {
    'goals': 'Totals',
    'corners': 'Corners Totals',
    'yellow_cards': 'Cards',
    'shots_on_target': 'Shots on Target'
  };
  return mapping[market] || market;
}

/**
 * Save value bets to Firebase
 */
async function saveValueBets(valueBets) {
  if (valueBets.length === 0) return;

  const batch = db.batch();

  for (const bet of valueBets) {
    // Check if similar value bet already exists
    const existing = await db.collection(collections.VALUE_BETS)
      .where('matchId', '==', bet.matchId)
      .where('predictionId', '==', bet.predictionId)
      .where('bookmaker', '==', bet.bookmaker)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (!existing.empty) {
      // Update existing
      const docRef = existing.docs[0].ref;
      batch.update(docRef, {
        odds: bet.odds,
        ev: bet.ev,
        detectedAt: bet.detectedAt
      });
    } else {
      // Create new
      const valueBetRef = db.collection(collections.VALUE_BETS).doc();
      batch.set(valueBetRef, {
        ...bet,
        id: valueBetRef.id
      });
    }
  }

  await batch.commit();
  console.log(`Saved/updated ${valueBets.length} value bets`);
}

/**
 * Get upcoming matches that need odds scanning
 */
async function getUpcomingMatches() {
  // Get matches scheduled for next 7 days
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const snapshot = await db.collection(collections.MATCHES)
    .where('date', '>=', now)
    .where('date', '<=', sevenDaysFromNow)
    .where('status', '==', 'upcoming')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Main odds scanning function
 */
async function scanOdds() {
  console.log(`[${new Date().toISOString()}] Starting odds scan...`);

  try {
    // 1. Get upcoming matches
    const matches = await getUpcomingMatches();
    console.log(`Scanning odds for ${matches.length} matches`);

    let totalValueBets = 0;

    // 2. For each match, fetch odds and detect value bets
    for (const match of matches) {
      try {
        // Fetch current odds
        const oddsData = await fetchOdds(match.id);
        if (!oddsData) {
          console.log(`No odds data for match ${match.id}`);
          continue;
        }

        // Parse odds into structured format
        const markets = parseOddsData(oddsData);
        if (!markets || Object.keys(markets).length === 0) {
          console.log(`No markets found for match ${match.id}`);
          continue;
        }

        // Save odds snapshot
        await saveOddsSnapshot(match.id, markets);

        // Get recent predictions for this match
        const predictions = await getRecentPredictions(match.id);

        // Detect value bets
        const valueBets = await detectValueBets(match.id, markets, predictions);

        // Save value bets
        if (valueBets.length > 0) {
          await saveValueBets(valueBets);
          totalValueBets += valueBets.length;
        }

        // Rate limiting - wait 500ms between matches
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error processing odds for match ${match.id}:`, error.message);
      }
    }

    console.log(`[${new Date().toISOString()}] Odds scan complete. Found ${totalValueBets} value bets`);
    return { success: true, matches: matches.length, valueBets: totalValueBets };
  } catch (error) {
    console.error('Odds scan error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  scanOdds,
  detectValueBets,
  fetchOdds
};
