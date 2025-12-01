// Test script to explore the Odds API
require('dotenv').config();

const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.odds-api.io/v3';

if (!API_KEY) {
  console.error('ERROR: ODDS_API_KEY not set in environment variables');
  console.error('Please set ODDS_API_KEY in your .env file');
  process.exit(1);
}

async function testEndpoint(name, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Error:', data.error);
      return;
    }

    console.log('\nResponse structure:');
    if (Array.isArray(data)) {
      console.log(`Array with ${data.length} items`);
      if (data.length > 0) {
        console.log('\nFirst item:');
        console.log(JSON.stringify(data[0], null, 2).substring(0, 2000));
      }
    } else {
      console.log('Object:');
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
    }
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

async function main() {
  console.log('🔍 Exploring Odds API Structure...\n');

  // Test 1: Get all sports
  await testEndpoint(
    'All Sports',
    `${BASE_URL}/sports?apiKey=${API_KEY}`
  );

  // Test 2: Get all bookmakers
  await testEndpoint(
    'All Bookmakers',
    `${BASE_URL}/bookmakers?apiKey=${API_KEY}`
  );

  // Test 3: Get football events (basic)
  await testEndpoint(
    'Football Events (basic)',
    `${BASE_URL}/events?apiKey=${API_KEY}&sport=football`
  );

  // Test 4: Try to get events with odds
  await testEndpoint(
    'Football Events with Bet365 odds',
    `${BASE_URL}/events?apiKey=${API_KEY}&sport=football&bookmaker=Bet365`
  );

  // Test 5: Try events endpoint with different parameters
  await testEndpoint(
    'Football Events with includeOdds',
    `${BASE_URL}/events?apiKey=${API_KEY}&sport=football&includeOdds=true`
  );

  // Test 6: Check if there's a separate odds endpoint
  await testEndpoint(
    'Check /odds endpoint',
    `${BASE_URL}/odds?apiKey=${API_KEY}&sport=football`
  );

  // Test 7: Check English Premier League specifically
  await testEndpoint(
    'EPL matches',
    `${BASE_URL}/events?apiKey=${API_KEY}&sport=football&league=english-premier-league`
  );

  console.log('\n' + '='.repeat(60));
  console.log('✅ API exploration complete!');
  console.log('='.repeat(60));
}

main();
