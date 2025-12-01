// Test script to get odds for specific events
require('dotenv').config();

const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.odds-api.io/v3';

if (!API_KEY) {
  console.error('ERROR: ODDS_API_KEY not set in environment variables');
  console.error('Please set ODDS_API_KEY in your .env file');
  process.exit(1);
}

// User's bookmakers
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

async function main() {
  console.log('🔍 Testing Odds API with real events...\n');

  try {
    // Step 1: Get some upcoming football events
    console.log('Step 1: Getting upcoming football events...');
    const eventsUrl = `${BASE_URL}/events?apiKey=${API_KEY}&sport=football&status=upcoming`;
    const eventsResponse = await fetch(eventsUrl);
    const events = await eventsResponse.json();

    if (events.error) {
      console.error('Events error:', events.error);
      return;
    }

    console.log(`Found ${events.length} upcoming events`);

    // Find some matches from major leagues
    const upcomingMatches = events
      .filter(e => e.status === 'upcoming')
      .filter(e => {
        const league = e.league?.slug || '';
        return league.includes('premier-league') ||
               league.includes('la-liga') ||
               league.includes('bundesliga') ||
               league.includes('serie-a') ||
               league.includes('ligue-1');
      })
      .slice(0, 5);

    if (upcomingMatches.length === 0) {
      console.log('No upcoming matches from major leagues found');
      // Just use the first 3 upcoming matches
      upcomingMatches.push(...events.filter(e => e.status === 'upcoming').slice(0, 3));
    }

    console.log(`\nTesting with ${upcomingMatches.length} matches:\n`);
    upcomingMatches.forEach((match, i) => {
      console.log(`${i + 1}. ${match.home} vs ${match.away}`);
      console.log(`   League: ${match.league?.name}`);
      console.log(`   ID: ${match.id}`);
      console.log(`   Date: ${match.date}`);
      console.log('');
    });

    // Step 2: Get odds for the first match with user's bookmakers
    if (upcomingMatches.length > 0) {
      const testMatch = upcomingMatches[0];
      console.log('\n' + '='.repeat(70));
      console.log(`Getting odds for: ${testMatch.home} vs ${testMatch.away}`);
      console.log('='.repeat(70));

      // Try with just one bookmaker first
      const oddsUrl = `${BASE_URL}/odds?apiKey=${API_KEY}&eventId=${testMatch.id}&bookmaker=Bet365`;
      console.log(`\nURL: ${oddsUrl}`);

      const oddsResponse = await fetch(oddsUrl);
      const oddsData = await oddsResponse.json();

      if (oddsData.error) {
        console.error('\n❌ Error getting odds:', oddsData.error);
      } else {
        console.log('\n✅ Odds data structure:');
        console.log(JSON.stringify(oddsData, null, 2));
      }

      // Step 3: Try with all user's bookmakers
      console.log('\n' + '='.repeat(70));
      console.log('Testing with multiple bookmakers...');
      console.log('='.repeat(70));

      const bookmakersParam = USER_BOOKMAKERS.join(',');
      const multiOddsUrl = `${BASE_URL}/odds?apiKey=${API_KEY}&eventId=${testMatch.id}&bookmakers=${encodeURIComponent(bookmakersParam)}`;

      console.log(`\nBookmakers: ${USER_BOOKMAKERS.join(', ')}`);

      const multiOddsResponse = await fetch(multiOddsUrl);
      const multiOddsData = await multiOddsResponse.json();

      if (multiOddsData.error) {
        console.error('\n❌ Error:', multiOddsData.error);
      } else {
        console.log('\n✅ Multi-bookmaker odds:');
        console.log(JSON.stringify(multiOddsData, null, 2).substring(0, 5000));
      }
    }

    // Step 4: Check available markets/bet types
    console.log('\n' + '='.repeat(70));
    console.log('Checking available bet markets...');
    console.log('='.repeat(70));

    const marketsUrl = `${BASE_URL}/markets?apiKey=${API_KEY}`;
    const marketsResponse = await fetch(marketsUrl);
    const markets = await marketsResponse.json();

    if (markets.error) {
      console.log('Markets endpoint not available or error:', markets.error);
    } else {
      console.log('\nAvailable markets:');
      console.log(JSON.stringify(markets, null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Testing complete!');
  console.log('='.repeat(70));
}

main();
