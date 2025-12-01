// test-ev-system.js - Complete test of the EV betting system

import { getUpcomingEventsWithOdds, getEventOdds, USER_BOOKMAKERS } from './src/utils/oddsApi.js';
import { findMatchingEvent } from './src/utils/teamMatcher.js';
import { compareWithBookmakers, calculateEV } from './src/utils/evCalculator.js';

async function testEVSystem() {
  console.log('🎯 TESTING EV BETTING SYSTEM');
  console.log('='.repeat(70));
  console.log('\n📚 Your Bookmakers:');
  USER_BOOKMAKERS.forEach((bm, i) => console.log(`${i + 1}. ${bm}`));

  console.log('\n' + '='.repeat(70));
  console.log('STEP 1: Fetching upcoming events with odds...');
  console.log('='.repeat(70));

  const eventsWithOdds = await getUpcomingEventsWithOdds({ limit: 10 });

  console.log(`\n✅ Found ${eventsWithOdds.length} upcoming events with odds\n`);

  if (eventsWithOdds.length === 0) {
    console.log('❌ No upcoming events found. Try again later.');
    return;
  }

  // Display first few events
  eventsWithOdds.slice(0, 5).forEach((event, i) => {
    console.log(`${i + 1}. ${event.home} vs ${event.away}`);
    console.log(`   League: ${event.league?.name}`);
    console.log(`   Date: ${new Date(event.date).toLocaleString()}`);
    console.log(`   Available bookmakers: ${Object.keys(event.odds?.bookmakers || {}).length}`);
    console.log('');
  });

  // Test with the first event
  const testEvent = eventsWithOdds[0];

  console.log('='.repeat(70));
  console.log(`STEP 2: Analyzing ${testEvent.home} vs ${testEvent.away}`);
  console.log('='.repeat(70));

  const oddsData = testEvent.odds;

  // Display available markets
  const bookmaker = Object.keys(oddsData.bookmakers)[0];
  const markets = oddsData.bookmakers[bookmaker];

  console.log(`\n📊 Available markets from ${bookmaker}:`);
  markets.forEach((market, i) => {
    console.log(`${i + 1}. ${market.name}`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('STEP 3: Simulating EV Calculation');
  console.log('='.repeat(70));

  // Simulate a prediction: 60% chance of over 2.5 goals
  const simulatedPrediction = {
    market: 'Totals',
    selection: 'over',
    line: 2.5,
    probability: 0.60, // 60% probability
    confidence: 'medium'
  };

  console.log('\n🎲 Simulated Prediction:');
  console.log(`Market: ${simulatedPrediction.market}`);
  console.log(`Selection: Over ${simulatedPrediction.line} goals`);
  console.log(`Probability: ${(simulatedPrediction.probability * 100).toFixed(1)}%`);
  console.log(`Fair Odds: ${(1 / simulatedPrediction.probability).toFixed(2)}`);

  // Get bookmaker odds for this market
  console.log('\n📈 Bookmaker Odds:');

  const bookmakerOdds = [];

  for (const [bookmakername, marketsList] of Object.entries(oddsData.bookmakers)) {
    const totalsMarket = marketsList.find(m => m.name === 'Totals');

    if (!totalsMarket || !totalsMarket.odds) continue;

    // Find 2.5 line
    const line25 = totalsMarket.odds.find(o => o.hdp === 2.5);

    if (line25 && line25.over) {
      const odds = parseFloat(line25.over);
      const ev = calculateEV(simulatedPrediction.probability, odds);

      bookmakerOdds.push({
        bookmaker: bookmakername,
        odds,
        url: oddsData.urls?.[bookmakername],
        updatedAt: totalsMarket.updatedAt
      });

      console.log(`${bookmakername}: ${odds} (EV: ${ev?.toFixed(2)}%)`);
    }
  }

  // Compare with all bookmakers
  if (bookmakerOdds.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('STEP 4: Finding Best Value');
    console.log('='.repeat(70));

    const comparison = compareWithBookmakers(
      simulatedPrediction.probability,
      bookmakerOdds,
      {
        market: simulatedPrediction.market,
        selection: simulatedPrediction.selection,
        line: simulatedPrediction.line
      }
    );

    console.log(`\n✨ Best Opportunity:`);
    console.log(`Bookmaker: ${comparison.bestOpportunity.bookmaker}`);
    console.log(`Odds: ${comparison.bestOpportunity.odds}`);
    console.log(`Expected Value: ${comparison.bestOpportunity.ev}%`);
    console.log(`Edge: ${comparison.bestOpportunity.edge}%`);
    console.log(`Grade: ${comparison.bestOpportunity.grade.toUpperCase()}`);
    console.log(`URL: ${comparison.bestOpportunity.url}`);

    // Show all value bets
    const valueBets = comparison.allBookmakers.filter(b => b.isValueBet);

    if (valueBets.length > 0) {
      console.log(`\n💰 All Value Bets (${valueBets.length}):`);
      valueBets.forEach((bet, i) => {
        console.log(`${i + 1}. ${bet.bookmaker}: ${bet.odds} (EV: ${bet.ev}%, Grade: ${bet.grade})`);
      });
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('STEP 5: Testing Corners Market');
  console.log('='.repeat(70));

  // Simulate corners prediction: 58% chance of over 9.5 corners
  const cornersPrediction = {
    market: 'Corners Totals',
    selection: 'over',
    line: 9.5,
    probability: 0.58
  };

  console.log(`\n🚩 Corners Prediction:`);
  console.log(`Over ${cornersPrediction.line} corners`);
  console.log(`Probability: ${(cornersPrediction.probability * 100).toFixed(1)}%`);

  const cornersOdds = [];

  for (const [bookmakername, marketsList] of Object.entries(oddsData.bookmakers)) {
    const cornersMarket = marketsList.find(m => m.name === 'Corners Totals');

    if (!cornersMarket || !cornersMarket.odds) continue;

    const line95 = cornersMarket.odds.find(o => o.hdp === 9.5);

    if (line95 && line95.over) {
      const odds = parseFloat(line95.over);
      const ev = calculateEV(cornersPrediction.probability, odds);

      cornersOdds.push({
        bookmaker: bookmakername,
        odds,
        url: oddsData.urls?.[bookmakername]
      });

      console.log(`${bookmakername}: ${odds} (EV: ${ev?.toFixed(2)}%)`);
    }
  }

  if (cornersOdds.length > 0) {
    const cornersComparison = compareWithBookmakers(
      cornersPrediction.probability,
      cornersOdds,
      cornersPrediction
    );

    console.log(`\n✨ Best Corners Bet:`);
    console.log(`${cornersComparison.bestOpportunity.bookmaker}: ${cornersComparison.bestOpportunity.odds}`);
    console.log(`EV: ${cornersComparison.bestOpportunity.ev}%`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ TEST COMPLETE!');
  console.log('='.repeat(70));

  console.log('\n📝 Summary:');
  console.log(`- Fetched odds from ${USER_BOOKMAKERS.length} bookmakers`);
  console.log(`- Analyzed ${markets.length} different markets`);
  console.log(`- Demonstrated EV calculation for multiple predictions`);

  console.log('\n💡 Next Steps:');
  console.log('1. Integrate with your existing stats API predictions');
  console.log('2. Run automated scans for value bets');
  console.log('3. Set up alerts for high-value opportunities');
  console.log('4. Track performance over time');

  return {
    success: true,
    eventsAnalyzed: eventsWithOdds.length,
    bookmakers: USER_BOOKMAKERS.length,
    markets: markets.length
  };
}

// Run the test
testEVSystem()
  .then(result => {
    console.log('\n✅ Test completed successfully!');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  });
