// server/services/autoEVTracker.js
// Automated EV bet tracking - runs every 2 minutes
// Fetches NBA matches, analyzes odds, saves qualifying bets to Supabase

const { createClient } = require('@supabase/supabase-js');

// Configuration
const OPTIC_API_KEY = process.env.OPTIC_ODDS_API_KEY;
const OPTIC_API_BASE = 'https://api.opticodds.com/api/v3';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Tracking criteria
const AUTO_TRACK_MAX_ODDS = 4.0;
const AUTO_TRACK_MIN_EV = 4.0;
const MIN_BOOKMAKERS = 2;
const LINE_TOLERANCE = 0.5;

// Playable bookmakers (where we bet)
const PLAYABLE_BOOKMAKERS = ['bet365', 'unibet'];

// All bookmakers to fetch
const ALL_BOOKMAKERS = [
  'pinnacle', 'bet365', 'unibet', 'draftkings', 'fanduel',
  'betmgm', 'caesars', 'betrivers', 'fanatics', 'prizepicks',
  'fliff', 'betway', 'bet99'
];

// Initialize Supabase client
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[AutoEVTracker] Supabase initialized');
} else {
  console.warn('[AutoEVTracker] Supabase not configured - tracking disabled');
}

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
};

// Convert American odds to decimal
const americanToDecimal = (american) => {
  if (!american || isNaN(american)) return null;
  const odds = parseFloat(american);
  if (odds > 0) return (odds / 100) + 1;
  if (odds < 0) return (100 / Math.abs(odds)) + 1;
  return null;
};

// De-vig functions
const devig = (overOdds, underOdds, method = 'power') => {
  if (!overOdds || !underOdds || overOdds <= 1 || underOdds <= 1) {
    return { fairProbOver: null, fairProbUnder: null, vig: null };
  }

  const impliedOver = 1 / overOdds;
  const impliedUnder = 1 / underOdds;
  const totalImplied = impliedOver + impliedUnder;
  const vig = (totalImplied - 1) * 100;

  let fairProbOver, fairProbUnder;

  if (method === 'multiplicative') {
    fairProbOver = impliedOver / totalImplied;
    fairProbUnder = impliedUnder / totalImplied;
  } else {
    // Power method (default)
    const k = Math.log(impliedOver) / Math.log(impliedOver * impliedUnder);
    fairProbOver = Math.pow(impliedOver, k);
    fairProbUnder = 1 - fairProbOver;
  }

  return { fairProbOver, fairProbUnder, vig };
};

// Calculate EV
const calculateEV = (fairProb, oddsOffered) => {
  if (!fairProb || !oddsOffered || oddsOffered <= 1) return 0;
  const payout = oddsOffered - 1;
  const ev = (fairProb * payout - (1 - fairProb)) * 100;
  return ev;
};

// Generate unique bet hash
const generateBetHash = (matchId, player, market, line, betType, bookmaker) => {
  const parts = [
    matchId || '',
    (player || '').toLowerCase().trim(),
    (market || '').toLowerCase().trim(),
    String(line || 0),
    (betType || '').toLowerCase().trim(),
    (bookmaker || '').toLowerCase().trim(),
  ];
  return parts.join('|');
};

// Fetch active NBA fixtures
const fetchNBAFixtures = async () => {
  try {
    const url = `${OPTIC_API_BASE}/fixtures/active?league=nba`;
    const response = await fetch(url, {
      headers: { 'x-api-key': OPTIC_API_KEY }
    });

    if (!response.ok) {
      console.error(`[AutoEVTracker] Failed to fetch fixtures: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error('[AutoEVTracker] Error fetching fixtures:', err.message);
    return [];
  }
};

// Fetch odds for a fixture (with batching for >5 sportsbooks)
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
    console.error(`[AutoEVTracker] Error fetching odds for ${fixtureId}:`, err.message);
    return [];
  }
};

// Parse props from odds data
const parseProps = (oddsArray) => {
  const props = [];

  for (const odd of oddsArray) {
    // Only process player props
    if (!odd.market_id?.includes('player_')) continue;
    if (!odd.player_id) continue;

    const bookmaker = SPORTSBOOK_MAP[odd.sportsbook] || odd.sportsbook?.toLowerCase();
    const playerName = odd.player || 'Unknown';
    const market = odd.market || odd.market_id;
    const line = parseFloat(odd.selection_line) || 0;

    // Get over/under odds
    let overOdds = null;
    let underOdds = null;

    if (odd.selection?.toLowerCase().includes('over')) {
      overOdds = americanToDecimal(odd.price);
    } else if (odd.selection?.toLowerCase().includes('under')) {
      underOdds = americanToDecimal(odd.price);
    }

    // Find or create prop entry
    const key = `${playerName}|${market}|${line}|${bookmaker}`;
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
        player: playerName,
        market,
        line,
        bookmaker,
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
        props: [],
      };
    }
    groups[key].props.push(prop);
  }

  return Object.values(groups);
};

// Find EV opportunities
const findEVOpportunities = (groups) => {
  const opportunities = [];

  for (const group of groups) {
    // Get playable props (from bet365, unibet)
    const playableProps = group.props.filter(p =>
      PLAYABLE_BOOKMAKERS.includes(p.bookmaker) &&
      (p.overOdds || p.underOdds)
    );

    for (const prop of playableProps) {
      const propLine = prop.line;

      // OVER bets
      if (prop.overOdds) {
        const comparableProps = group.props.filter(p =>
          !PLAYABLE_BOOKMAKERS.includes(p.bookmaker) &&
          p.line >= propLine && p.line <= propLine + LINE_TOLERANCE &&
          p.overOdds && p.underOdds
        );

        if (comparableProps.length >= MIN_BOOKMAKERS) {
          const fairProbs = comparableProps.map(p => {
            const { fairProbOver } = devig(p.overOdds, p.underOdds, 'power');
            return fairProbOver;
          }).filter(Boolean);

          if (fairProbs.length > 0) {
            const avgFairProb = fairProbs.reduce((a, b) => a + b, 0) / fairProbs.length;
            const evPercent = calculateEV(avgFairProb, prop.overOdds);

            if (evPercent >= AUTO_TRACK_MIN_EV && prop.overOdds < AUTO_TRACK_MAX_ODDS) {
              opportunities.push({
                player: group.player,
                market: group.market,
                line: propLine,
                betType: 'OVER',
                bookmaker: prop.bookmaker,
                odds: prop.overOdds,
                fairProb: avgFairProb,
                fairOdds: 1 / avgFairProb,
                evPercent,
              });
            }
          }
        }
      }

      // UNDER bets
      if (prop.underOdds) {
        const comparableProps = group.props.filter(p =>
          !PLAYABLE_BOOKMAKERS.includes(p.bookmaker) &&
          p.line <= propLine && p.line >= propLine - LINE_TOLERANCE &&
          p.overOdds && p.underOdds
        );

        if (comparableProps.length >= MIN_BOOKMAKERS) {
          const fairProbs = comparableProps.map(p => {
            const { fairProbUnder } = devig(p.overOdds, p.underOdds, 'power');
            return fairProbUnder;
          }).filter(Boolean);

          if (fairProbs.length > 0) {
            const avgFairProb = fairProbs.reduce((a, b) => a + b, 0) / fairProbs.length;
            const evPercent = calculateEV(avgFairProb, prop.underOdds);

            if (evPercent >= AUTO_TRACK_MIN_EV && prop.underOdds < AUTO_TRACK_MAX_ODDS) {
              opportunities.push({
                player: group.player,
                market: group.market,
                line: propLine,
                betType: 'UNDER',
                bookmaker: prop.bookmaker,
                odds: prop.underOdds,
                fairProb: avgFairProb,
                fairOdds: 1 / avgFairProb,
                evPercent,
              });
            }
          }
        }
      }
    }
  }

  return opportunities;
};

// Save bet to Supabase (with deduplication)
const saveBet = async (bet, matchInfo) => {
  if (!supabase) return false;

  const betHash = generateBetHash(
    matchInfo.id,
    bet.player,
    bet.market,
    bet.line,
    bet.betType,
    bet.bookmaker
  );

  try {
    const { error } = await supabase
      .from('auto_tracked_bets')
      .upsert({
        bet_hash: betHash,
        sport: 'nba',
        match_id: matchInfo.id,
        match_name: `${matchInfo.home} vs ${matchInfo.away}`,
        home_team: matchInfo.home,
        away_team: matchInfo.away,
        match_date: matchInfo.startDate,
        league: 'NBA',
        player: bet.player,
        market: bet.market,
        line: bet.line,
        bet_type: bet.betType,
        bookmaker: bet.bookmaker,
        odds: bet.odds,
        fair_odds: bet.fairOdds,
        fair_prob: bet.fairProb,
        ev_percentage: bet.evPercent,
      }, {
        onConflict: 'bet_hash',
        ignoreDuplicates: true,
      });

    if (error && error.code !== '23505') {
      console.error('[AutoEVTracker] Save error:', error.message);
      return false;
    }

    return !error;
  } catch (err) {
    console.error('[AutoEVTracker] Exception:', err.message);
    return false;
  }
};

// Main scan function
const scanForEVBets = async () => {
  if (!OPTIC_API_KEY) {
    console.error('[AutoEVTracker] OPTIC_ODDS_API_KEY not configured');
    return { scanned: 0, found: 0, saved: 0 };
  }

  console.log('[AutoEVTracker] Starting scan...');

  // Fetch active NBA fixtures
  const fixtures = await fetchNBAFixtures();
  console.log(`[AutoEVTracker] Found ${fixtures.length} active NBA fixtures`);

  let totalFound = 0;
  let totalSaved = 0;

  for (const fixture of fixtures) {
    const matchInfo = {
      id: fixture.id,
      home: fixture.home_team_display || fixture.home_competitors?.[0]?.name || 'Home',
      away: fixture.away_team_display || fixture.away_competitors?.[0]?.name || 'Away',
      startDate: fixture.start_date,
    };

    // Fetch odds
    const odds = await fetchFixtureOdds(fixture.id);
    if (odds.length === 0) continue;

    // Parse and group props
    const props = parseProps(odds);
    const groups = groupProps(props);

    // Find EV opportunities
    const opportunities = findEVOpportunities(groups);
    totalFound += opportunities.length;

    // Save each opportunity
    for (const opp of opportunities) {
      const saved = await saveBet(opp, matchInfo);
      if (saved) totalSaved++;
    }

    // Small delay between fixtures
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[AutoEVTracker] Scan complete: ${totalFound} opportunities found, ${totalSaved} new bets saved`);

  return {
    scanned: fixtures.length,
    found: totalFound,
    saved: totalSaved,
  };
};

// Scheduler
let scanInterval = null;

const startAutoTracker = (intervalMs = 2 * 60 * 1000) => {
  if (scanInterval) {
    console.log('[AutoEVTracker] Already running');
    return;
  }

  console.log(`[AutoEVTracker] Starting auto-tracker (interval: ${intervalMs / 1000}s)`);

  // Run immediately
  scanForEVBets();

  // Then run on interval
  scanInterval = setInterval(scanForEVBets, intervalMs);
};

const stopAutoTracker = () => {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log('[AutoEVTracker] Stopped');
  }
};

module.exports = {
  scanForEVBets,
  startAutoTracker,
  stopAutoTracker,
};
