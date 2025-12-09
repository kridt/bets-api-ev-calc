// server/services/statsScanner.js
const { db, collections } = require('../config/firebase');
const { getActiveLeagues } = require('../config/leagues');
const axios = require('axios');

/**
 * Stats Scanner - Runs every 3 hours
 * Fetches upcoming matches from multiple leagues, calculates probabilities based on team stats
 */

// Poisson probability distribution
function poissonProbability(lambda, k) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

/**
 * Calculate probability for over/under markets using Poisson distribution
 */
function calculatePoissonProbability(homeAvg, awayAvg, line, selection) {
  const totalExpected = homeAvg + awayAvg;

  if (selection === 'under') {
    // P(X <= line) = sum of P(X = k) for k = 0 to floor(line)
    let prob = 0;
    for (let k = 0; k <= Math.floor(line); k++) {
      prob += poissonProbability(totalExpected, k);
    }
    return prob * 100;
  } else {
    // P(X > line) = 1 - P(X <= line)
    let probUnder = 0;
    for (let k = 0; k <= Math.floor(line); k++) {
      probUnder += poissonProbability(totalExpected, k);
    }
    return (1 - probUnder) * 100;
  }
}

/**
 * Fetch matches for a specific league from Odds API
 */
async function fetchLeagueMatches(league) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const url = `https://api2.odds-api.io/v3/events?apiKey=${apiKey}&sport=football&league=${league.slug}&status=pending&limit=50`;
    const response = await axios.get(url);

    const allMatches = response.data || [];

    // Filter to ensure we only get matches from the exact league we want
    const leagueMatches = allMatches.filter(match => {
      const leagueName = match.league?.name || '';
      return leagueName === league.name;
    });

    console.log(`\n[Stats Scanner] ⚽ Found ${leagueMatches.length} ${league.name} matches from Odds API`);

    if (leagueMatches.length > 0) {
      console.log(`\n[Stats Scanner] 📋 Upcoming ${league.name} Matches:`);
      leagueMatches.slice(0, 5).forEach((match, index) => {
        const date = new Date(match.date);
        const dateStr = date.toLocaleDateString('en-GB', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit'
        });
        console.log(`  ${index + 1}. ${match.home} vs ${match.away}`);
        console.log(`     📅 ${dateStr} at ${timeStr}`);
      });
      if (leagueMatches.length > 5) {
        console.log(`  ... and ${leagueMatches.length - 5} more matches`);
      }
      console.log('');
    } else {
      console.log(`[Stats Scanner] ⚠️  No upcoming ${league.name} matches found`);
      console.log(`[Stats Scanner] (Received ${allMatches.length} total matches from API for slug: ${league.slug})`);
    }

    // Transform to our format
    const matches = leagueMatches.map(event => ({
      id: event.id || `${event.home}-${event.away}-${event.date}`.replace(/\s/g, '-'),
      home_team: event.home,
      away_team: event.away,
      commence_time: event.date,
      home: event.home,
      away: event.away,
      date: new Date(event.date),
      league: {
        id: league.id,
        name: league.name,
        slug: league.slug,
        country: league.country
      }
    }));

    return matches;
  } catch (error) {
    console.error(`[Stats Scanner] ❌ Error fetching ${league.name} matches:`, error.message);
    if (error.response) {
      console.error('[Stats Scanner] API Response:', error.response.status, error.response.data);
    }
    return [];
  }
}

/**
 * Get team statistics (using EPL league averages for now)
 * TODO: Integrate with a football stats API for team-specific data
 */
async function fetchTeamStats(teamName) {
  // EPL league averages per team per match
  // Using league averages until a proper football stats API is integrated
  const eplAverages = {
    goals: { avg: 1.35 },           // ~2.7 total goals per match
    corners: { avg: 5.5 },          // ~11 total corners per match
    yellow_cards: { avg: 1.75 },    // ~3.5 total yellow cards per match
    shots_on_target: { avg: 5.0 }   // ~10 total shots on target per match
  };

  return eplAverages;
}

/**
 * Generate predictions for all markets
 */
async function generatePredictions(match, homeStats, awayStats) {
  const predictions = [];
  const markets = ['goals', 'corners', 'yellow_cards', 'shots_on_target'];

  for (const market of markets) {
    const homeAvg = homeStats[market]?.avg || 0;
    const awayAvg = awayStats[market]?.avg || 0;
    const predictedTotal = homeAvg + awayAvg;

    // Generate predictions for common lines
    const lines = getCommonLines(market, predictedTotal);

    for (const line of lines) {
      // Over prediction
      const overProb = calculatePoissonProbability(homeAvg, awayAvg, line, 'over');
      if (overProb > 40 && overProb < 75) { // Only store predictions with reasonable probability
        predictions.push({
          matchId: match.id,
          market,
          selection: 'over',
          line,
          probability: overProb,
          predictedTotal,
          homeAvg,
          awayAvg,
          scannedAt: new Date()
        });
      }

      // Under prediction
      const underProb = calculatePoissonProbability(homeAvg, awayAvg, line, 'under');
      if (underProb > 40 && underProb < 75) {
        predictions.push({
          matchId: match.id,
          market,
          selection: 'under',
          line,
          probability: underProb,
          predictedTotal,
          homeAvg,
          awayAvg,
          scannedAt: new Date()
        });
      }
    }
  }

  return predictions;
}

/**
 * Get common betting lines for a market based on predicted total
 */
function getCommonLines(market, predictedTotal) {
  const lines = [];

  if (market === 'goals') {
    // Common goal lines: 0.5, 1.5, 2.5, 3.5, 4.5
    for (let i = 0.5; i <= 4.5; i += 1) {
      lines.push(i);
    }
  } else if (market === 'corners') {
    // Common corner lines: 8.5, 9.5, 10.5, 11.5, 12.5
    for (let i = 8.5; i <= 12.5; i += 1) {
      lines.push(i);
    }
  } else if (market === 'yellow_cards') {
    // Common card lines: 2.5, 3.5, 4.5, 5.5
    for (let i = 2.5; i <= 5.5; i += 1) {
      lines.push(i);
    }
  } else if (market === 'shots_on_target') {
    // Common shots lines: 8.5, 9.5, 10.5, 11.5
    for (let i = 8.5; i <= 11.5; i += 1) {
      lines.push(i);
    }
  }

  return lines;
}

/**
 * Save or update match in Firebase
 */
async function saveMatch(match) {
  const matchRef = db.collection(collections.MATCHES).doc(match.id.toString());

  const matchData = {
    id: match.id.toString(),
    home: match.home_team?.full_name || match.home,
    away: match.visitor_team?.full_name || match.away,
    date: new Date(match.date),
    league: {
      id: match.league?.id || 'epl',
      name: match.league?.name || 'English Premier League'
    },
    status: match.status || 'upcoming',
    updatedAt: new Date()
  };

  // Check if match exists
  const doc = await matchRef.get();
  if (!doc.exists) {
    matchData.createdAt = new Date();
  }

  await matchRef.set(matchData, { merge: true });
  return matchData;
}

/**
 * Save predictions to Firebase
 */
async function savePredictions(predictions) {
  const batch = db.batch();

  for (const prediction of predictions) {
    const predictionRef = db.collection(collections.PREDICTIONS).doc();
    batch.set(predictionRef, {
      ...prediction,
      id: predictionRef.id
    });
  }

  await batch.commit();
  console.log(`Saved ${predictions.length} predictions to Firebase`);
}

/**
 * Main stats scanning function - scans all active leagues
 */
async function scanStats() {
  console.log(`[${new Date().toISOString()}] Starting stats scan...`);

  try {
    // Get all active leagues
    const activeLeagues = getActiveLeagues();
    console.log(`\n[Stats Scanner] 🌍 Scanning ${activeLeagues.length} leagues:\n${activeLeagues.map(l => `  - ${l.name}`).join('\n')}\n`);

    let totalMatches = 0;
    let totalPredictions = 0;
    const leagueResults = [];

    // 1. Fetch matches from all leagues
    for (const league of activeLeagues) {
      try {
        const matches = await fetchLeagueMatches(league);

        if (matches.length === 0) {
          console.log(`[Stats Scanner] ⏭️  Skipping ${league.name} - no matches found\n`);
          continue;
        }

        totalMatches += matches.length;
        let leaguePredictions = 0;

        // 2. For each match, fetch team stats and generate predictions
        for (const match of matches) {
          try {
            // Save match
            await saveMatch(match);

            // Fetch team stats (using league averages for now)
            const homeStats = await fetchTeamStats(match.home_team?.id);
            const awayStats = await fetchTeamStats(match.visitor_team?.id);

            // Generate predictions
            const predictions = await generatePredictions(match, homeStats, awayStats);

            // Save predictions
            if (predictions.length > 0) {
              await savePredictions(predictions);
              leaguePredictions += predictions.length;
              totalPredictions += predictions.length;
            }

            // Rate limiting - wait 500ms between matches
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`[Stats Scanner] ❌ Error processing match ${match.id}:`, error.message);
          }
        }

        leagueResults.push({
          league: league.name,
          matches: matches.length,
          predictions: leaguePredictions
        });

        console.log(`[Stats Scanner] ✅ ${league.name}: ${matches.length} matches, ${leaguePredictions} predictions\n`);

        // Rate limiting between leagues - wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`[Stats Scanner] ❌ Error scanning ${league.name}:`, error.message);
      }
    }

    console.log(`\n[Stats Scanner] 📊 SUMMARY:`);
    console.log(`[Stats Scanner] Total Matches: ${totalMatches}`);
    console.log(`[Stats Scanner] Total Predictions: ${totalPredictions}`);
    leagueResults.forEach(result => {
      console.log(`[Stats Scanner]   - ${result.league}: ${result.matches} matches, ${result.predictions} predictions`);
    });
    console.log(`\n[${new Date().toISOString()}] Stats scan complete.\n`);

    return { success: true, matches: totalMatches, predictions: totalPredictions, leagues: leagueResults };
  } catch (error) {
    console.error('[Stats Scanner] ❌ Stats scan error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  scanStats,
  calculatePoissonProbability,
  generatePredictions
};
