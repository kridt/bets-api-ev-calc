const ODDS_API_KEY = '811e5fb0efa75d2b92e800cb55b60b30f62af8c21da06c4b2952eb516bee0a2e';
const ODDS_API_BASE = 'https://api2.odds-api.io/v3';
const eventId = 62924957;

async function debug() {
  const url = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=DraftKings`;

  const res = await fetch(url);
  const d = await res.json();

  const markets = d.bookmakers?.DraftKings || [];
  console.log('Total markets:', markets.length);

  // Find "Player Props" market
  const playerPropsMarket = markets.find(m => m.name === 'Player Props');

  if (playerPropsMarket) {
    console.log('\nPlayer Props market found!');
    console.log('Structure:', Object.keys(playerPropsMarket));
    console.log('\nPlayer Props content (first 5000 chars):');
    console.log(JSON.stringify(playerPropsMarket, null, 2).substring(0, 5000));
  } else {
    console.log('No Player Props market found');
    console.log('\nAll markets:', markets.map(m => m.name));
  }
}

debug().catch(console.error);
