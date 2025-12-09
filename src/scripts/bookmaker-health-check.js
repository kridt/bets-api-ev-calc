// Bookmaker Health Check - Checks which bookmakers have player props available
// Run with: node src/scripts/bookmaker-health-check.js

const ODDS_API_KEY = '811e5fb0efa75d2b92e800cb55b60b30f62af8c21da06c4b2952eb516bee0a2e';
const ODDS_API_BASE = 'https://api2.odds-api.io/v3';

const ALL_BOOKMAKERS = [
  'Kambi', 'Bet365', 'DraftKings', 'Pinnacle', 'BetMGM', 'Caesars', 'PrizePicks', 'FanDuel',
  'BetOnline.ag', 'BetPARX', 'BetRivers', 'Bovada', 'Fanatics', 'Fliff', 'Sporttrade',
  'Superbet', 'Underdog', 'Bally Bet', 'ESPN BET', 'Hard Rock Bet', 'PointsBet', 'WynnBET'
];

async function fetchEvents() {
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 2);
  const toDateStr = toDate.toISOString();

  const url = `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=basketball&league=usa-nba&status=pending&to=${toDateStr}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }

  return response.json();
}

async function fetchOddsForBookmaker(eventId, bookmaker) {
  const url = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${bookmaker}`;
  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function parsePlayerProps(markets) {
  // Find Player Props market
  const playerPropsMarket = markets.find(m => m.name === 'Player Props');

  if (!playerPropsMarket || !playerPropsMarket.odds) {
    return { count: 0, marketTypes: new Set(), players: new Set() };
  }

  const marketTypes = new Set();
  const players = new Set();
  let count = 0;

  for (const prop of playerPropsMarket.odds) {
    if (!prop.label) continue;

    // Parse "Player Name (Market Type)" format
    const match = prop.label.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      players.add(match[1].trim());
      marketTypes.add(match[2].trim());
      count++;
    }
  }

  return {
    count,
    marketTypes,
    players,
    updatedAt: playerPropsMarket.updatedAt
  };
}

async function runHealthCheck() {
  console.log('🏀 NBA Bookmaker Health Check');
  console.log('='.repeat(70));
  console.log('');

  const bookmakerStats = {};

  try {
    console.log('📅 Fetching NBA events...');
    const events = await fetchEvents();

    if (!events || events.length === 0) {
      console.log('❌ No NBA events found');
      return;
    }

    console.log(`✅ Found ${events.length} events\n`);

    // Check first 2 events
    const eventsToCheck = events.slice(0, 2);

    for (const event of eventsToCheck) {
      console.log(`\n🎮 ${event.away} @ ${event.home}`);
      console.log(`   ${new Date(event.date).toLocaleString()}`);
      console.log('-'.repeat(70));

      for (const bookmaker of ALL_BOOKMAKERS) {
        if (!bookmakerStats[bookmaker]) {
          bookmakerStats[bookmaker] = {
            name: bookmaker,
            totalProps: 0,
            marketTypes: new Set(),
            players: new Set(),
            eventsWithData: 0,
            lastUpdated: null
          };
        }

        process.stdout.write(`   ${bookmaker.padEnd(15)}... `);

        try {
          const data = await fetchOddsForBookmaker(event.id, bookmaker);

          if (data && data.bookmakers && data.bookmakers[bookmaker]) {
            const markets = data.bookmakers[bookmaker];
            const propData = parsePlayerProps(markets);

            if (propData.count > 0) {
              bookmakerStats[bookmaker].totalProps += propData.count;
              bookmakerStats[bookmaker].eventsWithData++;
              bookmakerStats[bookmaker].lastUpdated = propData.updatedAt;

              propData.marketTypes.forEach(m => bookmakerStats[bookmaker].marketTypes.add(m));
              propData.players.forEach(p => bookmakerStats[bookmaker].players.add(p));

              console.log(`✅ ${propData.count} props | ${propData.marketTypes.size} markets | ${propData.players.size} players`);
            } else {
              console.log('⚠️  no player props');
            }
          } else {
            console.log('❌ no data');
          }
        } catch (err) {
          console.log(`❌ error: ${err.message}`);
        }

        // Delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 250));
      }
    }

    // Print report
    console.log('\n\n');
    console.log('='.repeat(70));
    console.log('📊 BOOKMAKER HEALTH REPORT');
    console.log('='.repeat(70));

    const sortedStats = Object.values(bookmakerStats)
      .sort((a, b) => b.totalProps - a.totalProps);

    // Active bookmakers
    console.log('\n✅ ACTIVE BOOKMAKERS (have player props):');
    console.log('-'.repeat(70));

    let activeCount = 0;
    for (const stat of sortedStats) {
      if (stat.totalProps > 0) {
        activeCount++;
        const markets = Array.from(stat.marketTypes).sort();

        console.log(`\n  📗 ${stat.name}`);
        console.log(`     Total Props: ${stat.totalProps} across ${stat.eventsWithData} event(s)`);
        console.log(`     Unique Players: ${stat.players.size}`);
        console.log(`     Market Types (${stat.marketTypes.size}):`);

        // Group markets
        const singleStats = markets.filter(m => !m.includes('+'));
        const combos = markets.filter(m => m.includes('+'));
        const other = markets.filter(m => !singleStats.includes(m) && !combos.includes(m));

        if (singleStats.length > 0) {
          console.log(`       Singles: ${singleStats.join(', ')}`);
        }
        if (combos.length > 0) {
          console.log(`       Combos:  ${combos.join(', ')}`);
        }
        if (other.length > 0) {
          console.log(`       Other:   ${other.join(', ')}`);
        }
      }
    }

    if (activeCount === 0) {
      console.log('  (none found)');
    }

    // Inactive bookmakers
    console.log('\n\n❌ INACTIVE BOOKMAKERS (no player props):');
    console.log('-'.repeat(70));

    const inactive = sortedStats.filter(s => s.totalProps === 0);
    if (inactive.length > 0) {
      console.log('  ' + inactive.map(s => s.name).join(', '));
    } else {
      console.log('  (all bookmakers are active!)');
    }

    // Summary
    console.log('\n\n📈 SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Total bookmakers checked: ${ALL_BOOKMAKERS.length}`);
    console.log(`  Active with player props: ${activeCount}`);
    console.log(`  Inactive: ${ALL_BOOKMAKERS.length - activeCount}`);
    console.log(`  Events checked: ${eventsToCheck.length}`);

    // All unique market types
    const allMarketTypes = new Set();
    for (const stat of sortedStats) {
      stat.marketTypes.forEach(m => allMarketTypes.add(m));
    }

    console.log(`\n\n📋 ALL MARKET TYPES FOUND (${allMarketTypes.size}):`);
    console.log('-'.repeat(70));
    const sortedMarkets = Array.from(allMarketTypes).sort();
    sortedMarkets.forEach(m => console.log(`  • ${m}`));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

runHealthCheck();
