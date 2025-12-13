// server/services/nbaCacheBuilder.js
// Fetches NBA matches and calculates EV opportunities for caching
// Builds on autoEVTracker.js logic but returns all data for frontend

const evCache = require('./evCache');

// Configuration
const OPTIC_API_KEY = process.env.OPTIC_ODDS_API_KEY;
const OPTIC_API_BASE = 'https://api.opticodds.com/api/v3';

// All bookmakers to fetch for averaging
const ALL_BOOKMAKERS = [
  'pinnacle', 'bet365', 'unibet', 'unibet_denmark_', 'betano', 'draftkings', 'fanduel',
  'betmgm', 'caesars', 'betrivers', 'fanatics', 'prizepicks',
  'fliff', 'betway', 'bet99'
];

// Playable bookmakers (Danish market - where we can bet)
const PLAYABLE_BOOKMAKERS = ['bet365', 'unibet_denmark_', 'betano'];

// EV thresholds
const MIN_EV_PERCENT = 3.0;
const MIN_BOOKMAKERS = 1;
const LINE_TOLERANCE = 0.5;

// Time filter - only fixtures in next 24 hours
const HOURS_AHEAD = 24;

// Sportsbook name normalization
const SPORTSBOOK_MAP = {
  'Pinnacle': 'pinnacle',
  'DraftKings': 'draftkings',
  'FanDuel': 'fanduel',
  'BetMGM': 'betmgm',
  'Caesars': 'caesars',
  'BetRivers': 'betrivers',
  'Fanatics': 'fanatics',
  'PrizePicks': 'prizepicks',
  'Fliff': 'fliff',
  'Betway': 'betway',
  'Bet99': 'bet99',
  'bet365': 'bet365',
  'Unibet': 'unibet',
  'Unibet DK': 'unibet_denmark_',
  'unibet_denmark_': 'unibet_denmark_',
  'Betano': 'betano',
  'betano': 'betano',
};

// Display names
const SPORTSBOOK_DISPLAY = {
  'pinnacle': 'Pinnacle',
  'bet365': 'Bet365',
  'unibet': 'Unibet',
  'unibet_denmark_': 'Unibet DK',
  'betano': 'Betano',
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'betmgm': 'BetMGM',
  'caesars': 'Caesars',
  'betrivers': 'BetRivers',
  'fanatics': 'Fanatics',
  'prizepicks': 'PrizePicks',
  'fliff': 'Fliff',
  'betway': 'Betway',
  'bet99': 'Bet99',
};

// Market mapping for display
const MARKET_DISPLAY = {
  'player_points': 'Points',
  'player_assists': 'Assists',
  'player_rebounds': 'Rebounds',
  'player_made_threes': '3-Pointers',
  'player_steals': 'Steals',
  'player_blocks': 'Blocks',
  'player_turnovers': 'Turnovers',
  'player_points_+_assists': 'Pts+Asts',
  'player_points_+_rebounds': 'Pts+Rebs',
  'player_rebounds_+_assists': 'Rebs+Asts',
  'player_steals_+_blocks': 'Steals+Blocks',
  'player_points_+_rebounds_+_assists': 'Pts+Rebs+Asts',
  'player_double_double': 'Double Double',
  'player_triple_double': 'Triple Double',
};

// Convert American odds to decimal
const americanToDecimal = (american) => {
  if (!american || isNaN(american)) return null;
  const odds = parseFloat(american);
  if (odds > 0) return (odds / 100) + 1;
  if (odds < 0) return (100 / Math.abs(odds)) + 1;
  return null;
};

// De-vig functions (power method by default)
const devig = (overOdds, underOdds, method = 'multiplicative') => {
  if (!overOdds || !underOdds || overOdds <= 1 || underOdds <= 1) {
    return { fairProbOver: null, fairProbUnder: null, vig: null };
  }

  const impliedOver = 1 / overOdds;
  const impliedUnder = 1 / underOdds;
  const totalImplied = impliedOver + impliedUnder;
  const vig = (totalImplied - 1) * 100;

  let fairProbOver, fairProbUnder;

  if (method === 'power') {
    // Power method
    let low = 0.5, high = 2.0, k = 1;
    for (let i = 0; i < 50; i++) {
      k = (low + high) / 2;
      const sum = Math.pow(impliedOver, k) + Math.pow(impliedUnder, k);
      if (Math.abs(sum - 1) < 0.0001) break;
      if (sum > 1) low = k;
      else high = k;
    }
    fairProbOver = Math.pow(impliedOver, k);
    fairProbUnder = Math.pow(impliedUnder, k);
  } else {
    // Multiplicative (default)
    fairProbOver = impliedOver / totalImplied;
    fairProbUnder = impliedUnder / totalImplied;
  }

  return { fairProbOver, fairProbUnder, vig };
};

// Calculate EV percentage
const calculateEV = (fairProb, oddsOffered) => {
  if (!fairProb || !oddsOffered || oddsOffered <= 1) return 0;
  return ((fairProb * oddsOffered) - 1) * 100;
};

// Fetch active NBA fixtures
const fetchNBAFixtures = async () => {
  try {
    const url = `${OPTIC_API_BASE}/fixtures/active?league=nba`;
    const response = await fetch(url, {
      headers: { 'x-api-key': OPTIC_API_KEY }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fixtures: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error('[NBACacheBuilder] Error fetching fixtures:', err.message);
    throw err;
  }
};

// Fetch odds for a fixture (batched for >5 sportsbooks)
const fetchFixtureOdds = async (fixtureId) => {
  try {
    const MAX_BOOKS_PER_REQUEST = 5;
    const batches = [];

    for (let i = 0; i < ALL_BOOKMAKERS.length; i += MAX_BOOKS_PER_REQUEST) {
      batches.push(ALL_BOOKMAKERS.slice(i, i + MAX_BOOKS_PER_REQUEST));
    }

    let allOdds = [];

    for (const batch of batches) {
      const url = new URL(`${OPTIC_API_BASE}/fixtures/odds`);
      url.searchParams.set('fixture_id', fixtureId);
      batch.forEach(book => url.searchParams.append('sportsbook', book));

      const response = await fetch(url.toString(), {
        headers: { 'x-api-key': OPTIC_API_KEY }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data?.[0]?.odds) {
          allOdds = allOdds.concat(data.data[0].odds);
        }
      }
    }

    return allOdds;
  } catch (err) {
    console.error(`[NBACacheBuilder] Error fetching odds for ${fixtureId}:`, err.message);
    return [];
  }
};

// Parse props from odds data
const parseProps = (oddsArray, matchId) => {
  const props = [];

  for (const odd of oddsArray) {
    // Only process player props
    if (!odd.market_id?.includes('player_')) continue;

    const bookmaker = SPORTSBOOK_MAP[odd.sportsbook] || odd.sportsbook?.toLowerCase();
    const playerName = odd.player || 'Unknown';
    const market = odd.market_id || odd.market || 'unknown';
    const marketDisplay = MARKET_DISPLAY[market] || market;
    const line = parseFloat(odd.selection_line) || parseFloat(odd.points) || 0;

    // Get over/under odds
    let overOdds = null;
    let underOdds = null;
    const selection = (odd.selection || odd.name || '').toLowerCase();

    if (selection.includes('over')) {
      overOdds = americanToDecimal(odd.price);
    } else if (selection.includes('under')) {
      underOdds = americanToDecimal(odd.price);
    }

    // Find or create prop entry
    let existingProp = props.find(p =>
      p.player === playerName &&
      p.market === market &&
      Math.abs(p.line - line) < 0.01 &&
      p.bookmaker === bookmaker
    );

    if (existingProp) {
      if (overOdds) existingProp.overOdds = overOdds;
      if (underOdds) existingProp.underOdds = underOdds;
    } else {
      props.push({
        matchId,
        player: playerName,
        playerId: odd.player_id,
        market,
        marketDisplay,
        line,
        bookmaker,
        bookmakerDisplay: SPORTSBOOK_DISPLAY[bookmaker] || bookmaker,
        overOdds,
        underOdds,
      });
    }
  }

  return props;
};

// Group props by player+market
const groupProps = (props) => {
  const groups = {};

  for (const prop of props) {
    const key = `${prop.player}|${prop.market}`;
    if (!groups[key]) {
      groups[key] = {
        player: prop.player,
        market: prop.market,
        marketDisplay: prop.marketDisplay,
        props: [],
      };
    }
    groups[key].props.push(prop);
  }

  return Object.values(groups);
};

// Find EV opportunities - groups all playable bookmakers for each bet
const findEVOpportunities = (groups, matchInfo) => {
  const opportunityMap = {}; // Key: player|market|line|betType
  const oddsUpdatedAt = new Date().toISOString();

  for (const group of groups) {
    // Get playable props
    const playableProps = group.props.filter(p =>
      PLAYABLE_BOOKMAKERS.includes(p.bookmaker) &&
      (p.overOdds || p.underOdds)
    );

    // Group playable props by line
    const lineGroups = {};
    for (const prop of playableProps) {
      const lineKey = Math.round(prop.line * 2) / 2; // Round to nearest 0.5
      if (!lineGroups[lineKey]) lineGroups[lineKey] = [];
      lineGroups[lineKey].push(prop);
    }

    for (const [lineKey, propsAtLine] of Object.entries(lineGroups)) {
      const propLine = parseFloat(lineKey);

      // Find comparable non-playable props for fair odds calculation
      const comparableProps = group.props.filter(p =>
        !PLAYABLE_BOOKMAKERS.includes(p.bookmaker) &&
        Math.abs(p.line - propLine) <= LINE_TOLERANCE &&
        p.overOdds && p.underOdds
      );

      if (comparableProps.length < MIN_BOOKMAKERS) continue;

      // Calculate fair probabilities
      const fairProbsOver = comparableProps.map(p => {
        const { fairProbOver } = devig(p.overOdds, p.underOdds);
        return fairProbOver;
      }).filter(Boolean);

      const fairProbsUnder = comparableProps.map(p => {
        const { fairProbUnder } = devig(p.overOdds, p.underOdds);
        return fairProbUnder;
      }).filter(Boolean);

      const avgFairProbOver = fairProbsOver.length > 0
        ? fairProbsOver.reduce((a, b) => a + b, 0) / fairProbsOver.length
        : null;
      const avgFairProbUnder = fairProbsUnder.length > 0
        ? fairProbsUnder.reduce((a, b) => a + b, 0) / fairProbsUnder.length
        : null;

      // OVER bets - collect all playable bookmakers with +EV
      if (avgFairProbOver) {
        const overBooks = [];
        for (const prop of propsAtLine) {
          if (prop.overOdds) {
            const ev = calculateEV(avgFairProbOver, prop.overOdds);
            if (ev >= MIN_EV_PERCENT) {
              overBooks.push({
                bookmaker: prop.bookmaker,
                bookmakerDisplay: prop.bookmakerDisplay,
                odds: prop.overOdds,
                evPercent: parseFloat(ev.toFixed(2)),
              });
            }
          }
        }

        if (overBooks.length > 0) {
          // Sort by EV descending
          overBooks.sort((a, b) => b.evPercent - a.evPercent);
          const bestBook = overBooks[0];
          const betKey = `${matchInfo.id}|${group.player}|${group.market}|${propLine}|OVER`;

          opportunityMap[betKey] = {
            matchId: matchInfo.id,
            matchName: matchInfo.matchName,
            homeTeam: matchInfo.home,
            awayTeam: matchInfo.away,
            matchDate: matchInfo.startDate,
            player: group.player,
            market: group.market,
            marketDisplay: group.marketDisplay,
            line: propLine,
            betType: 'OVER',
            // Best bookmaker info (for sorting/display)
            bookmaker: bestBook.bookmaker,
            bookmakerDisplay: bestBook.bookmakerDisplay,
            odds: bestBook.odds,
            evPercent: bestBook.evPercent,
            // Fair value info
            fairProb: avgFairProbOver,
            fairOdds: 1 / avgFairProbOver,
            comparableBooks: comparableProps.length,
            // All playable bookmakers with +EV
            allBookmakers: overBooks,
            oddsUpdatedAt,
          };
        }
      }

      // UNDER bets - collect all playable bookmakers with +EV
      if (avgFairProbUnder) {
        const underBooks = [];
        for (const prop of propsAtLine) {
          if (prop.underOdds) {
            const ev = calculateEV(avgFairProbUnder, prop.underOdds);
            if (ev >= MIN_EV_PERCENT) {
              underBooks.push({
                bookmaker: prop.bookmaker,
                bookmakerDisplay: prop.bookmakerDisplay,
                odds: prop.underOdds,
                evPercent: parseFloat(ev.toFixed(2)),
              });
            }
          }
        }

        if (underBooks.length > 0) {
          // Sort by EV descending
          underBooks.sort((a, b) => b.evPercent - a.evPercent);
          const bestBook = underBooks[0];
          const betKey = `${matchInfo.id}|${group.player}|${group.market}|${propLine}|UNDER`;

          opportunityMap[betKey] = {
            matchId: matchInfo.id,
            matchName: matchInfo.matchName,
            homeTeam: matchInfo.home,
            awayTeam: matchInfo.away,
            matchDate: matchInfo.startDate,
            player: group.player,
            market: group.market,
            marketDisplay: group.marketDisplay,
            line: propLine,
            betType: 'UNDER',
            // Best bookmaker info
            bookmaker: bestBook.bookmaker,
            bookmakerDisplay: bestBook.bookmakerDisplay,
            odds: bestBook.odds,
            evPercent: bestBook.evPercent,
            // Fair value info
            fairProb: avgFairProbUnder,
            fairOdds: 1 / avgFairProbUnder,
            comparableBooks: comparableProps.length,
            // All playable bookmakers with +EV
            allBookmakers: underBooks,
            oddsUpdatedAt,
          };
        }
      }
    }
  }

  // Convert map to array and sort by EV
  return Object.values(opportunityMap).sort((a, b) => b.evPercent - a.evPercent);
};

// Main build function - fetches all NBA data and calculates EV
const buildNBACache = async () => {
  if (!OPTIC_API_KEY) {
    throw new Error('OPTIC_ODDS_API_KEY not configured');
  }

  console.log('[NBACacheBuilder] Starting build...');
  evCache.setRefreshing('nba', true);
  evCache.setProgress('nba', { current: 0, total: 100, step: 'starting', message: 'Starting NBA cache build...' });

  const startTime = Date.now();

  try {
    // Fetch active NBA fixtures
    evCache.setProgress('nba', { current: 0, total: 100, step: 'fetching_fixtures', message: 'Fetching NBA fixtures...' });
    const allFixtures = await fetchNBAFixtures();
    console.log(`[NBACacheBuilder] Found ${allFixtures.length} active NBA fixtures`);

    // Filter to only fixtures in next 24 hours
    const now = new Date();
    const cutoff = new Date(now.getTime() + HOURS_AHEAD * 60 * 60 * 1000);
    const fixtures = allFixtures.filter(f => {
      const startDate = new Date(f.start_date);
      return startDate >= now && startDate <= cutoff;
    });
    console.log(`[NBACacheBuilder] Filtered to ${fixtures.length} fixtures in next ${HOURS_AHEAD} hours`);

    evCache.setProgress('nba', { current: 5, total: 100, step: 'processing', message: `Found ${fixtures.length} fixtures to process...` });

    const matches = [];
    const allEvBets = [];
    const totalFixtures = fixtures.length;
    let processedFixtures = 0;

    for (const fixture of fixtures) {
      const matchInfo = {
        id: fixture.id,
        home: fixture.home_team_display || fixture.home_competitors?.[0]?.name || 'Home',
        away: fixture.away_team_display || fixture.away_competitors?.[0]?.name || 'Away',
        startDate: fixture.start_date,
        matchName: `${fixture.home_team_display || 'Home'} vs ${fixture.away_team_display || 'Away'}`,
        league: 'NBA',
      };

      // Fetch odds
      const odds = await fetchFixtureOdds(fixture.id);
      if (odds.length === 0) {
        matches.push({ ...matchInfo, evBets: [], propsCount: 0 });
        continue;
      }

      // Parse and group props
      const props = parseProps(odds, fixture.id);
      const groups = groupProps(props);

      // Find EV opportunities
      const opportunities = findEVOpportunities(groups, matchInfo);

      matches.push({
        ...matchInfo,
        evBets: opportunities,
        propsCount: props.length,
        groupsCount: groups.length,
      });

      allEvBets.push(...opportunities);

      // Update progress
      processedFixtures++;
      const progressPercent = Math.min(95, 5 + Math.round((processedFixtures / totalFixtures) * 90));
      evCache.setProgress('nba', {
        current: progressPercent,
        total: 100,
        step: 'processing',
        message: `${matchInfo.home} vs ${matchInfo.away} (${processedFixtures}/${totalFixtures})`
      });

      // Small delay between fixtures to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    const duration = Date.now() - startTime;
    console.log(`[NBACacheBuilder] Build complete in ${duration}ms: ${matches.length} matches, ${allEvBets.length} EV bets`);

    // Progress complete
    evCache.setProgress('nba', { current: 100, total: 100, step: 'complete', message: `Complete: ${allEvBets.length} EV bets found` });

    // Update cache
    evCache.setNBACache({ matches, evBets: allEvBets });

    // Clear progress after short delay
    setTimeout(() => evCache.setProgress('nba', null), 2000);

    return { matches, evBets: allEvBets, duration };

  } catch (err) {
    console.error('[NBACacheBuilder] Build failed:', err.message);
    evCache.setProgress('nba', { current: 0, total: 100, step: 'error', message: `Error: ${err.message}` });
    evCache.setError('nba', err.message);
    throw err;
  }
};

module.exports = {
  buildNBACache,
  fetchNBAFixtures,
  fetchFixtureOdds,
  parseProps,
  groupProps,
  findEVOpportunities,
  PLAYABLE_BOOKMAKERS,
  ALL_BOOKMAKERS,
};
