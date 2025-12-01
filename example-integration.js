// example-integration.js - Example of how to integrate with your existing stats API

import { findEVOpportunities } from './src/services/evBettingService.js';
import { fetchTodaysEPLMatches } from './src/utils/footballApi.js';

/**
 * Example: Find EV opportunities for today's EPL matches
 */
async function findEPLValueBets() {
  console.log('🏴󠁧󠁢󠁥󠁮󠁧󠁿 Finding Value Bets for EPL Matches...\n');

  try {
    // Step 1: Get predictions from your stats API
    console.log('📊 Fetching EPL predictions...');
    const eplData = await fetchTodaysEPLMatches({
      minProb: 0.58,
      maxProb: 0.62,
      games: 10
    });

    if (!eplData.matches || eplData.matches.length === 0) {
      console.log('❌ No EPL matches found');
      return;
    }

    console.log(`✅ Found ${eplData.matches.length} EPL matches with predictions\n`);

    // Step 2: Convert to standard format
    const standardMatches = eplData.matches.map(match => ({
      home: match.home_team.name,
      away: match.away_team.name,
      time: new Date(match.kickoff).getTime() / 1000,
      league: {
        name: 'English Premier League',
        slug: 'english-premier-league'
      },
      predictions: match.predictions.map(pred => ({
        market: mapMarketName(pred.statKey),
        selection: pred.side, // 'over' or 'under'
        line: pred.line,
        probability: pred.probability / 100, // Convert to 0-1
        statKey: pred.statKey,
        confidence: pred.confidence || 'medium'
      }))
    }));

    // Step 3: Find value bets
    console.log('💰 Searching for value bets...\n');
    const results = await findEVOpportunities(standardMatches, {
      minEV: 5,             // Minimum 5% EV
      minProbability: 0.58,
      maxProbability: 0.62,
      minConfidence: 0.75   // 75% team matching confidence
    });

    // Step 4: Display results
    displayResults(results);

    return results;

  } catch (error) {
    console.error('❌ Error finding value bets:', error.message);
    console.error(error.stack);
  }
}

/**
 * Display results in a nice format
 */
function displayResults(results) {
  console.log('='.repeat(80));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(80));

  console.log(`\n📈 Statistics:`);
  console.log(`   Total matches analyzed: ${results.summary.totalMatches}`);
  console.log(`   Matches with odds data: ${results.summary.matchedEvents}`);
  console.log(`   Matches with value bets: ${results.summary.matchesWithValue}`);
  console.log(`   Total value bets found: ${results.summary.totalValueBets}`);

  if (results.stats.count > 0) {
    console.log(`\n💡 Value Bet Stats:`);
    console.log(`   Average EV: ${results.stats.avgEV.toFixed(2)}%`);
    console.log(`   Average Edge: ${results.stats.avgEdge.toFixed(2)}%`);
    console.log(`   Average Odds: ${results.stats.avgOdds.toFixed(2)}`);

    console.log(`\n🎯 Grade Distribution:`);
    Object.entries(results.stats.gradeDistribution).forEach(([grade, count]) => {
      console.log(`   ${grade}: ${count}`);
    });
  }

  if (results.matches.length === 0) {
    console.log('\n❌ No value bets found.');
    console.log('💡 Try:');
    console.log('   - Lowering minEV parameter');
    console.log('   - Widening probability range');
    console.log('   - Checking different markets');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('💰 VALUE BETS');
  console.log('='.repeat(80));

  results.matches.forEach((match, i) => {
    console.log(`\n${i + 1}. ${match.match.home} vs ${match.match.away}`);
    console.log(`   📅 ${new Date(match.match.date).toLocaleString()}`);
    console.log(`   🏆 ${match.match.league.name}`);
    console.log(`   🎯 Match Confidence: ${(match.match.matchingConfidence * 100).toFixed(1)}%`);
    console.log(`   💰 Value Bets: ${match.valueBets.length}\n`);

    match.valueBets.forEach((bet, j) => {
      console.log(`   ${j + 1}. ${bet.emoji || '⚽'} ${bet.market}`);
      console.log(`      Selection: ${bet.type.toUpperCase()} ${bet.line}`);
      console.log(`      Probability: ${bet.percentage}%`);
      console.log(`      Predicted: ${bet.prediction} (Home: ${bet.homeAvg}, Away: ${bet.awayAvg})`);
      console.log(`      \n      🏪 Best Bookmaker: ${bet.odds.bookmaker}`);
      console.log(`      💵 Odds: ${bet.odds.odds}`);
      console.log(`      📈 Expected Value: +${bet.odds.ev}%`);
      console.log(`      📊 Edge: +${bet.odds.edge}%`);
      console.log(`      ⭐ Grade: ${bet.odds.grade.toUpperCase()}`);
      console.log(`      🔗 URL: ${bet.odds.url}\n`);

      // Show alternative bookmakers if available
      if (bet.allBookmakers && bet.allBookmakers.length > 1) {
        console.log(`      📋 Other bookmakers:`);
        bet.allBookmakers.slice(1, 4).forEach(bm => {
          console.log(`         ${bm.bookmaker}: ${bm.odds} (EV: ${bm.ev}%)`);
        });
        console.log('');
      }
    });

    console.log('   ' + '-'.repeat(76));
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ Analysis Complete!');
  console.log('='.repeat(80));
}

/**
 * Map stat keys to market names
 */
function mapMarketName(statKey) {
  const marketMap = {
    'corners': 'Corners',
    'yellow_cards': 'Yellow Cards',
    'goals': 'Goals',
    'shots_on_target': 'Shots on Target'
  };

  return marketMap[statKey] || statKey;
}

/**
 * Example: Continuous monitoring
 */
async function monitorValueBets(intervalMinutes = 60) {
  console.log(`🔄 Starting continuous monitoring (every ${intervalMinutes} minutes)...\n`);

  // Run immediately
  await findEPLValueBets();

  // Then run at intervals
  setInterval(async () => {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`🔄 Refreshing... ${new Date().toLocaleString()}`);
    console.log('='.repeat(80) + '\n');

    await findEPLValueBets();
  }, intervalMinutes * 60 * 1000);
}

// Run examples
console.log('🎯 EV BETTING SYSTEM - INTEGRATION EXAMPLE\n');
console.log('Choose an option:');
console.log('1. Find EPL value bets (one-time)');
console.log('2. Monitor continuously (hourly)\n');

// For this example, just run once
findEPLValueBets()
  .then(results => {
    if (results && results.summary.totalValueBets > 0) {
      console.log(`\n✅ Found ${results.summary.totalValueBets} value betting opportunities!`);
      console.log('💡 Ready to place bets? Visit the bookmaker URLs above.');
    }
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
  });

// Uncomment to run continuous monitoring:
// monitorValueBets(60); // Check every hour
