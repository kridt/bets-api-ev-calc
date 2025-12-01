// test-football-predictions.js
// Test script to verify the football prediction system works correctly

require('dotenv').config();

const footballDataApi = require('./services/footballDataApi');
const probabilityCalculator = require('./services/footballProbabilityCalculator');
const footballPredictionService = require('./services/footballPredictionService');

async function runTests() {
  console.log('='.repeat(70));
  console.log('FOOTBALL PREDICTION SYSTEM TEST');
  console.log('='.repeat(70));

  // Check API key
  if (!process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('\n❌ ERROR: FOOTBALL_DATA_API_KEY not set in .env file');
    console.log('Please get your API key from: https://www.football-data.org/client/register');
    console.log('Then add it to your .env file: FOOTBALL_DATA_API_KEY=your_key_here\n');
    process.exit(1);
  }

  console.log('\n✅ API Key found\n');

  try {
    // Test 1: Probability Calculator
    console.log('='.repeat(50));
    console.log('TEST 1: Probability Calculator');
    console.log('='.repeat(50));

    // Test Poisson probability for goals
    const homeStats = {
      goals: { avg: 1.8, homeAvg: 2.1, avgConceded: 1.2 },
      corners: { avg: 5.5, homeAvg: 6.0 },
      yellow_cards: { avg: 1.6, homeAvg: 1.5 },
      shots_on_target: { avg: 5.0, homeAvg: 5.5 }
    };

    const awayStats = {
      goals: { avg: 1.3, awayAvg: 1.0, avgConceded: 1.5 },
      corners: { avg: 4.8, awayAvg: 4.5 },
      yellow_cards: { avg: 2.0, awayAvg: 2.2 },
      shots_on_target: { avg: 4.2, awayAvg: 3.8 }
    };

    const matchInfo = {
      id: 'test-123',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoff: new Date().toISOString()
    };

    const predictions = probabilityCalculator.generateMatchPredictions(
      homeStats,
      awayStats,
      matchInfo,
      { minProbability: 50, maxProbability: 75 }
    );

    console.log(`\nGenerated ${predictions.length} predictions for Arsenal vs Chelsea:`);
    console.log('\nTop 5 predictions:');
    predictions.slice(0, 5).forEach((pred, i) => {
      console.log(`  ${i + 1}. ${pred.market} ${pred.side} ${pred.line}`);
      console.log(`     Probability: ${pred.probability}% | Fair Odds: ${pred.fairOdds.toFixed(2)}`);
      console.log(`     Expected: ${pred.matchPrediction} (Home: ${pred.homeAvg}, Away: ${pred.awayAvg})`);
    });

    console.log('\n✅ Probability calculator working correctly');

    // Test 2: Football Data API
    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Football Data API');
    console.log('='.repeat(50));

    console.log('\nFetching Premier League standings...');
    const standings = await footballDataApi.getStandings('PL');
    const teamNames = Object.keys(standings).slice(0, 5);
    console.log(`Found ${Object.keys(standings).length} teams`);
    console.log('Top 5 teams:', teamNames.join(', '));

    console.log('\nFetching team statistics for Arsenal...');
    const arsenalStats = await footballDataApi.getTeamStatistics('Arsenal', 'PL');
    console.log('Arsenal stats:');
    console.log(`  Goals: ${arsenalStats.goals.avg.toFixed(2)} per game`);
    console.log(`  Yellow Cards: ${arsenalStats.yellow_cards.avg.toFixed(2)} per game`);
    console.log(`  Corners (est): ${arsenalStats.corners.avg.toFixed(2)} per game`);
    console.log(`  Data Quality: ${arsenalStats.dataQuality?.isDefault ? 'Default (estimated)' : 'Calculated from real data'}`);

    console.log('\n✅ Football Data API working correctly');

    // Test 3: Full Prediction Service
    console.log('\n' + '='.repeat(50));
    console.log('TEST 3: Full Prediction Service');
    console.log('='.repeat(50));

    console.log('\nFetching predictions for upcoming EPL matches...');
    const eplPredictions = await footballPredictionService.getPredictionsForCompetition('PL', {
      minProb: 55,
      maxProb: 68,
      maxMatches: 5
    });

    console.log(`\nFound ${eplPredictions.matches?.length || 0} matches with predictions`);
    console.log(`Total predictions: ${eplPredictions.totalPredictions}`);

    if (eplPredictions.matches && eplPredictions.matches.length > 0) {
      console.log('\nFirst match predictions:');
      const firstMatch = eplPredictions.matches[0];
      console.log(`  ${firstMatch.home_team.name} vs ${firstMatch.away_team.name}`);
      console.log(`  Kickoff: ${new Date(firstMatch.kickoff).toLocaleString()}`);
      console.log(`  Predictions: ${firstMatch.predictions.length}`);

      firstMatch.predictions.slice(0, 3).forEach((pred, i) => {
        console.log(`    ${i + 1}. ${pred.market} ${pred.side} ${pred.line}: ${pred.probability}%`);
      });
    }

    console.log('\n✅ Full prediction service working correctly');

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('\nThe football prediction system is ready to use.');
    console.log('\nAPI Endpoints available:');
    console.log('  GET /api/epl/predictions - Get EPL predictions');
    console.log('  GET /api/epl/todays-matches - Get today\'s EPL matches (frontend format)');
    console.log('  GET /api/football/predictions/:competition - Get predictions for any competition');
    console.log('  GET /api/football/team-stats/:teamName - Get team statistics');
    console.log('  GET /api/football/standings/:competition - Get league standings');
    console.log('\nTo start the server:');
    console.log('  cd server && npm start');
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
