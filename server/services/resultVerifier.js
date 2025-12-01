// server/services/resultVerifier.js
const { db, collections } = require('../config/firebase');
const axios = require('axios');

/**
 * Result Verifier
 * Checks finished matches and verifies value bet outcomes
 */

/**
 * Fetch match result from API
 */
async function fetchMatchResult(matchId) {
  try {
    const response = await axios.get(`https://epl.balldontlie.io/api/games/${matchId}`, {
      headers: {
        'Authorization': process.env.BALLDONTLIE_API_KEY || 'your-api-key'
      }
    });

    return response.data.data || null;
  } catch (error) {
    console.error(`Error fetching result for match ${matchId}:`, error.message);
    return null;
  }
}

/**
 * Parse match statistics from result
 */
function parseMatchStats(matchData) {
  return {
    finalScore: {
      home: matchData.home_team_score || 0,
      away: matchData.visitor_team_score || 0
    },
    marketResults: {
      goals: (matchData.home_team_score || 0) + (matchData.visitor_team_score || 0),
      corners: matchData.stats?.corners || 0,
      yellow_cards: matchData.stats?.yellow_cards || 0,
      shots_on_target: matchData.stats?.shots_on_target || 0
    }
  };
}

/**
 * Determine bet result (win/loss/push)
 */
function determineBetResult(valueBet, actualResult) {
  const market = valueBet.market;
  const selection = valueBet.selection;
  const line = valueBet.line;

  // Get actual value for the market
  const actualValue = actualResult.marketResults[market];
  if (actualValue === undefined || actualValue === null) {
    return null; // Cannot determine result
  }

  // Compare actual value with line
  if (selection === 'over') {
    if (actualValue > line) return 'win';
    if (actualValue < line) return 'loss';
    return 'push'; // Exactly on line
  } else if (selection === 'under') {
    if (actualValue < line) return 'win';
    if (actualValue > line) return 'loss';
    return 'push'; // Exactly on line
  }

  return null;
}

/**
 * Calculate actual profit/loss for a bet
 */
function calculateProfit(valueBet, result) {
  const stake = 1; // Assuming unit stakes

  if (result === 'win') {
    return (valueBet.odds - 1) * stake; // Profit
  } else if (result === 'loss') {
    return -stake; // Loss
  } else {
    return 0; // Push - stake returned
  }
}

/**
 * Update value bet with result
 */
async function updateValueBetResult(valueBetId, result, profit) {
  await db.collection(collections.VALUE_BETS).doc(valueBetId).update({
    result,
    profit,
    status: 'settled',
    settledAt: new Date()
  });
}

/**
 * Save match result
 */
async function saveMatchResult(matchId, stats, valueBetIds) {
  const resultRef = db.collection(collections.RESULTS).doc();

  await resultRef.set({
    id: resultRef.id,
    matchId,
    ...stats,
    valueBetIds,
    verifiedAt: new Date()
  });
}

/**
 * Update match status
 */
async function updateMatchStatus(matchId, status, result = null) {
  const updates = {
    status,
    updatedAt: new Date()
  };

  if (result) {
    updates.result = result;
  }

  await db.collection(collections.MATCHES).doc(matchId).update(updates);
}

/**
 * Update daily tracking stats
 */
async function updateTrackingStats(date, bets) {
  const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const statsRef = db.collection(collections.TRACKING_STATS).doc(dateString);

  // Get current stats
  const doc = await statsRef.get();
  const currentStats = doc.exists ? doc.data() : {
    date: dateString,
    totalMatches: 0,
    totalValueBets: 0,
    totalSettled: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    totalStake: 0,
    totalReturn: 0,
    roi: 0,
    avgEV: 0
  };

  // Calculate new stats
  const wins = bets.filter(b => b.result === 'win').length;
  const losses = bets.filter(b => b.result === 'loss').length;
  const pushes = bets.filter(b => b.result === 'push').length;
  const totalProfit = bets.reduce((sum, b) => sum + (b.profit || 0), 0);
  const totalStake = bets.length; // Assuming unit stakes
  const totalReturn = totalStake + totalProfit;
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;
  const avgEV = bets.length > 0
    ? bets.reduce((sum, b) => sum + (b.ev || 0), 0) / bets.length
    : 0;

  // Update stats
  await statsRef.set({
    date: dateString,
    totalMatches: currentStats.totalMatches + 1,
    totalValueBets: currentStats.totalValueBets + bets.length,
    totalSettled: currentStats.totalSettled + bets.length,
    wins: currentStats.wins + wins,
    losses: currentStats.losses + losses,
    pushes: currentStats.pushes + pushes,
    totalStake: currentStats.totalStake + totalStake,
    totalReturn: currentStats.totalReturn + totalReturn,
    roi: currentStats.totalStake + totalStake > 0
      ? ((currentStats.totalReturn + totalReturn - currentStats.totalStake - totalStake) /
        (currentStats.totalStake + totalStake)) * 100
      : 0,
    avgEV
  }, { merge: true });
}

/**
 * Get finished matches that need verification
 */
async function getFinishedMatches() {
  // Get matches from the last 7 days that are marked as finished but not verified
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const snapshot = await db.collection(collections.MATCHES)
    .where('status', '==', 'finished')
    .where('date', '>=', sevenDaysAgo)
    .get();

  // Check if already has result
  const needsVerification = [];
  for (const doc of snapshot.docs) {
    const matchId = doc.id;
    const resultSnapshot = await db.collection(collections.RESULTS)
      .where('matchId', '==', matchId)
      .limit(1)
      .get();

    if (resultSnapshot.empty) {
      needsVerification.push({ id: matchId, ...doc.data() });
    }
  }

  return needsVerification;
}

/**
 * Get value bets for a match
 */
async function getMatchValueBets(matchId) {
  const snapshot = await db.collection(collections.VALUE_BETS)
    .where('matchId', '==', matchId)
    .where('status', '==', 'active')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Main result verification function
 */
async function verifyResults() {
  console.log(`[${new Date().toISOString()}] Starting result verification...`);

  try {
    // 1. Get finished matches needing verification
    const matches = await getFinishedMatches();
    console.log(`Found ${matches.length} matches to verify`);

    let totalVerified = 0;

    // 2. For each match, fetch result and verify bets
    for (const match of matches) {
      try {
        // Fetch match result
        const matchResult = await fetchMatchResult(match.id);
        if (!matchResult || matchResult.status !== 'Final') {
          console.log(`Match ${match.id} not finished yet`);
          continue;
        }

        // Parse match stats
        const stats = parseMatchStats(matchResult);

        // Get value bets for this match
        const valueBets = await getMatchValueBets(match.id);

        if (valueBets.length === 0) {
          console.log(`No value bets to verify for match ${match.id}`);
          // Still save the result
          await saveMatchResult(match.id, stats, []);
          await updateMatchStatus(match.id, 'finished', stats.finalScore);
          continue;
        }

        // Verify each bet
        const verifiedBets = [];
        for (const bet of valueBets) {
          const result = determineBetResult(bet, stats);
          if (result) {
            const profit = calculateProfit(bet, result);
            await updateValueBetResult(bet.id, result, profit);
            verifiedBets.push({
              ...bet,
              result,
              profit
            });
          }
        }

        // Save match result
        await saveMatchResult(match.id, stats, verifiedBets.map(b => b.id));

        // Update match status
        await updateMatchStatus(match.id, 'finished', stats.finalScore);

        // Update tracking stats
        await updateTrackingStats(new Date(), verifiedBets);

        totalVerified++;
        console.log(`Verified ${verifiedBets.length} bets for match ${match.id}`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error verifying match ${match.id}:`, error.message);
      }
    }

    console.log(`[${new Date().toISOString()}] Verification complete. Verified ${totalVerified} matches`);
    return { success: true, matches: totalVerified };
  } catch (error) {
    console.error('Result verification error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  verifyResults,
  determineBetResult,
  fetchMatchResult
};
