// server/services/footballCacheBuilder.js
// Fetches Football matches and calculates EV opportunities for caching
// Covers Top 5 European leagues with all markets

const evCache = require('./evCache');

// Configuration
const OPTIC_API_KEY = process.env.OPTIC_ODDS_API_KEY;
const OPTIC_API_BASE = 'https://api.opticodds.com/api/v3';

// Top 5 leagues to cache (user selected)
const SOCCER_LEAGUES = {
  'england-premier-league': 'england_-_premier_league',
  'spain-laliga': 'spain_-_la_liga',
  'germany-bundesliga': 'germany_-_bundesliga',
  'italy-serie-a': 'italy_-_serie_a',
  'france-ligue-1': 'france_-_ligue_1',
};

// All bookmakers for averaging
const ALL_BOOKMAKERS = [
  'pinnacle', 'bet365', 'betano', 'unibet_denmark_', 'draftkings', 'fanduel',
  'betmgm', 'caesars', 'betrivers', 'superbet', 'betsson',
  'betsafe', '888sport', 'betway', 'william_hill', 'fanatics',
  'bovada', 'betonline', 'betfair', 'bwin'
];

// Playable bookmakers (Danish market - where we can bet)
const PLAYABLE_BOOKMAKERS = ['betano', 'unibet_denmark_', 'bet365'];

// EV thresholds
const MIN_EV_PERCENT = 3.0;
const MIN_BOOKMAKERS = 1;
const LINE_TOLERANCE = 0.5;

// Time filter - only fixtures in next 24 hours
const HOURS_AHEAD = 24;

// Sportsbook display names
const SPORTSBOOK_DISPLAY = {
  'pinnacle': 'Pinnacle',
  'bet365': 'Bet365',
  'betano': 'Betano',
  'unibet_denmark_': 'Unibet DK',
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'betmgm': 'BetMGM',
  'caesars': 'Caesars',
  'betrivers': 'BetRivers',
  'fanatics': 'Fanatics',
  'superbet': 'Superbet',
  'betsson': 'Betsson',
  'betsafe': 'Betsafe',
  '888sport': '888sport',
  'betway': 'Betway',
  'william_hill': 'William Hill',
  'bovada': 'Bovada',
  'betonline': 'BetOnline',
  'betfair': 'Betfair',
  'bwin': 'bwin',
};

// Market display names
const MARKET_DISPLAY = {
  'total_goals': 'Match Total',
  'asian_total_goals': 'Asian Total',
  'asian_handicap': 'Asian Handicap',
  'goal_spread': 'Goal Spread',
  'total_corners': 'Corners Total',
  'total_shots_on_target': 'Shots on Target',
  'team_total_goals': 'Team Total',
  'anytime_goal_scorer': 'Anytime Goalscorer',
  'first_goal_scorer': 'First Goalscorer',
  'player_shots': 'Player Shots',
  'player_shots_on_target': 'Player Shots on Target',
  'player_assists': 'Player Assists',
  'player_tackles': 'Player Tackles',
  'player_cards': 'Player Cards',
  'player_passes': 'Player Passes',
  'player_fouls': 'Player Fouls',
  'player_saves': 'Player Saves',
};

// League display names
const LEAGUE_DISPLAY = {
  'england_-_premier_league': 'Premier League',
  'spain_-_la_liga': 'La Liga',
  'germany_-_bundesliga': 'Bundesliga',
  'italy_-_serie_a': 'Serie A',
  'france_-_ligue_1': 'Ligue 1',
};

// Convert American odds to decimal
const americanToDecimal = (american) => {
  if (!american || isNaN(american)) return null;
  const odds = parseFloat(american);
  if (odds > 0) return (odds / 100) + 1;
  if (odds < 0) return (100 / Math.abs(odds)) + 1;
  return null;
};

// De-vig function
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

// Fetch fixtures for a league
const fetchLeagueFixtures = async (opticLeague) => {
  try {
    const url = new URL(`${OPTIC_API_BASE}/fixtures`);
    url.searchParams.set('sport', 'soccer');
    url.searchParams.set('league', opticLeague);
    url.searchParams.set('status', 'unplayed');

    const response = await fetch(url.toString(), {
      headers: { 'x-api-key': OPTIC_API_KEY }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fixtures: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error(`[FootballCacheBuilder] Error fetching ${opticLeague}:`, err.message);
    return [];
  }
};

// Fetch odds for a fixture (batched)
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

      // Small delay between batches
      await new Promise(r => setTimeout(r, 100));
    }

    return allOdds;
  } catch (err) {
    console.error(`[FootballCacheBuilder] Error fetching odds for ${fixtureId}:`, err.message);
    return [];
  }
};

// Parse props from odds data
const parseProps = (oddsArray, matchId) => {
  const props = [];

  for (const odd of oddsArray) {
    const bookmaker = odd.sportsbook?.toLowerCase() || 'unknown';
    const market = odd.market_id || odd.market || 'unknown';
    const marketDisplay = MARKET_DISPLAY[market] || odd.market || market;
    const line = parseFloat(odd.points) || parseFloat(odd.selection_line) || 0;
    const selection = (odd.selection || odd.name || '').toLowerCase();

    // Determine over/under
    let overOdds = null;
    let underOdds = null;

    const isOver = selection.includes('over') || odd.selection_line === 'over';
    const isUnder = selection.includes('under') || odd.selection_line === 'under';

    if (isOver) {
      overOdds = americanToDecimal(odd.price);
    } else if (isUnder) {
      underOdds = americanToDecimal(odd.price);
    }

    // Skip if no valid odds
    if (!overOdds && !underOdds) continue;

    // Get player name for player props
    const playerName = odd.player_id ? (odd.name?.split(/\s+(over|under)\s*/i)[0]?.trim() || odd.player) : null;

    // Extract selection name (team/player) from the selection field for non-player markets
    // For team_total markets, the API returns team name directly in selection field (e.g., "Liverpool FC")
    // For other markets, selection might be in format "Team Over X.5" or just "Over"
    let selectionName = null;
    if (!playerName) {
      const rawSelection = odd.selection || '';
      const selectionLine = odd.selection_line || '';

      // If selection_line exists (over/under), then selection is likely the subject (team name)
      // Example: selection="Liverpool FC", selection_line="over", name="Liverpool FC Over 1.5"
      if (selectionLine && rawSelection && !rawSelection.toLowerCase().match(/^(over|under)$/)) {
        selectionName = rawSelection.trim();
      } else {
        // Try extracting from name field (format: "Team Over X.5" or "Player Over X.5")
        const nameMatch = (odd.name || '').match(/^(.+?)\s+(over|under)/i);
        if (nameMatch && nameMatch[1]) {
          selectionName = nameMatch[1].trim();
          // Skip generic selections
          if (['over', 'under', 'home', 'away', 'yes', 'no'].includes(selectionName.toLowerCase())) {
            selectionName = null;
          }
        }
      }

      // Fallback to team field if available
      if (!selectionName && odd.team) {
        selectionName = odd.team;
      }
    }

    // Create unique key - include selection name for team props
    const key = `${playerName || selectionName || 'match'}|${market}|${line}|${bookmaker}`;

    // The subject is player name OR selection name (for team props)
    const subject = playerName || selectionName;

    // Find or create prop entry
    let existingProp = props.find(p =>
      (p.player || p.selection || 'match') === (subject || 'match') &&
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
        selection: selectionName, // Team name or other selection subject
        playerId: odd.player_id,
        market,
        marketDisplay,
        line,
        bookmaker,
        bookmakerDisplay: SPORTSBOOK_DISPLAY[bookmaker] || bookmaker,
        overOdds,
        underOdds,
        isPlayerProp: !!odd.player_id,
        isTeamProp: !odd.player_id && !!selectionName,
      });
    }
  }

  return props;
};

// Group props by player/selection/market
const groupProps = (props) => {
  const groups = {};

  for (const prop of props) {
    // Use player OR selection as the subject
    const subject = prop.player || prop.selection || 'match';
    const key = `${subject}|${prop.market}`;
    if (!groups[key]) {
      groups[key] = {
        player: prop.player,
        selection: prop.selection, // Team name for team props
        market: prop.market,
        marketDisplay: prop.marketDisplay,
        isPlayerProp: prop.isPlayerProp,
        isTeamProp: prop.isTeamProp,
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
        const overBooksMap = new Map(); // Dedupe by bookmaker, keep best odds
        for (const prop of propsAtLine) {
          if (prop.overOdds) {
            const ev = calculateEV(avgFairProbOver, prop.overOdds);
            if (ev >= MIN_EV_PERCENT) {
              const existing = overBooksMap.get(prop.bookmaker);
              // Keep the entry with better odds (higher EV)
              if (!existing || ev > existing.evPercent) {
                overBooksMap.set(prop.bookmaker, {
                  bookmaker: prop.bookmaker,
                  bookmakerDisplay: prop.bookmakerDisplay,
                  odds: prop.overOdds,
                  evPercent: parseFloat(ev.toFixed(2)),
                });
              }
            }
          }
        }
        const overBooks = Array.from(overBooksMap.values());

        if (overBooks.length > 0) {
          // Sort by EV descending
          overBooks.sort((a, b) => b.evPercent - a.evPercent);
          const bestBook = overBooks[0];
          const subject = group.player || group.selection || 'match';
          const betKey = `${matchInfo.id}|${subject}|${group.market}|${propLine}|OVER`;

          opportunityMap[betKey] = {
            matchId: matchInfo.id,
            matchName: matchInfo.matchName,
            homeTeam: matchInfo.home,
            awayTeam: matchInfo.away,
            matchDate: matchInfo.startDate,
            league: matchInfo.league,
            leagueDisplay: matchInfo.leagueDisplay,
            player: group.player,
            selection: group.selection, // Team name for team props
            market: group.market,
            marketDisplay: group.marketDisplay,
            isPlayerProp: group.isPlayerProp,
            isTeamProp: group.isTeamProp,
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
        const underBooksMap = new Map(); // Dedupe by bookmaker, keep best odds
        for (const prop of propsAtLine) {
          if (prop.underOdds) {
            const ev = calculateEV(avgFairProbUnder, prop.underOdds);
            if (ev >= MIN_EV_PERCENT) {
              const existing = underBooksMap.get(prop.bookmaker);
              // Keep the entry with better odds (higher EV)
              if (!existing || ev > existing.evPercent) {
                underBooksMap.set(prop.bookmaker, {
                  bookmaker: prop.bookmaker,
                  bookmakerDisplay: prop.bookmakerDisplay,
                  odds: prop.underOdds,
                  evPercent: parseFloat(ev.toFixed(2)),
                });
              }
            }
          }
        }
        const underBooks = Array.from(underBooksMap.values());

        if (underBooks.length > 0) {
          // Sort by EV descending
          underBooks.sort((a, b) => b.evPercent - a.evPercent);
          const bestBook = underBooks[0];
          const subjectUnder = group.player || group.selection || 'match';
          const betKey = `${matchInfo.id}|${subjectUnder}|${group.market}|${propLine}|UNDER`;

          opportunityMap[betKey] = {
            matchId: matchInfo.id,
            matchName: matchInfo.matchName,
            homeTeam: matchInfo.home,
            awayTeam: matchInfo.away,
            matchDate: matchInfo.startDate,
            league: matchInfo.league,
            leagueDisplay: matchInfo.leagueDisplay,
            player: group.player,
            selection: group.selection, // Team name for team props
            market: group.market,
            marketDisplay: group.marketDisplay,
            isPlayerProp: group.isPlayerProp,
            isTeamProp: group.isTeamProp,
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

// Main build function
const buildFootballCache = async () => {
  if (!OPTIC_API_KEY) {
    throw new Error('OPTIC_ODDS_API_KEY not configured');
  }

  console.log('[FootballCacheBuilder] Starting build for Top 5 leagues...');
  evCache.setRefreshing('football', true);
  evCache.setProgress('football', { current: 0, total: 100, step: 'starting', message: 'Starting Football cache build...' });

  const startTime = Date.now();

  try {
    const matches = [];
    const allEvBets = [];

    // Time filter setup
    const now = new Date();
    const cutoff = new Date(now.getTime() + HOURS_AHEAD * 60 * 60 * 1000);

    // First pass: count all fixtures to calculate total
    const leagueEntries = Object.entries(SOCCER_LEAGUES);
    let totalFixtures = 0;
    let processedFixtures = 0;
    const leagueFixturesMap = {};

    evCache.setProgress('football', { current: 0, total: 100, step: 'fetching_fixtures', message: 'Fetching fixtures from all leagues...' });

    // Fetch all fixtures first
    for (const [leagueSlug, opticLeague] of leagueEntries) {
      const allFixtures = await fetchLeagueFixtures(opticLeague);
      const fixtures = allFixtures.filter(f => {
        const startDate = new Date(f.start_date);
        return startDate >= now && startDate <= cutoff;
      });
      leagueFixturesMap[leagueSlug] = { fixtures, opticLeague };
      totalFixtures += fixtures.length;
    }

    evCache.setProgress('football', { current: 5, total: 100, step: 'processing', message: `Found ${totalFixtures} fixtures to process...` });

    // Process each league
    for (const [leagueSlug, opticLeague] of leagueEntries) {
      const leagueDisplay = LEAGUE_DISPLAY[opticLeague] || leagueSlug;
      console.log(`[FootballCacheBuilder] Processing ${leagueDisplay}...`);

      const { fixtures } = leagueFixturesMap[leagueSlug];
      console.log(`[FootballCacheBuilder] Found ${fixtures.length} fixtures in next ${HOURS_AHEAD}h in ${leagueSlug}`);

      for (const fixture of fixtures) {
        const matchInfo = {
          id: fixture.id,
          home: fixture.home_team_display || fixture.home_competitors?.[0]?.name || 'Home',
          away: fixture.away_team_display || fixture.away_competitors?.[0]?.name || 'Away',
          startDate: fixture.start_date,
          matchName: `${fixture.home_team_display || 'Home'} vs ${fixture.away_team_display || 'Away'}`,
          league: opticLeague,
          leagueDisplay: LEAGUE_DISPLAY[opticLeague] || leagueSlug,
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
        evCache.setProgress('football', {
          current: progressPercent,
          total: 100,
          step: 'processing',
          message: `${leagueDisplay}: ${matchInfo.home} vs ${matchInfo.away} (${processedFixtures}/${totalFixtures})`
        });

        // Delay between fixtures
        await new Promise(r => setTimeout(r, 300));
      }

      // Delay between leagues
      await new Promise(r => setTimeout(r, 500));
    }

    const duration = Date.now() - startTime;
    console.log(`[FootballCacheBuilder] Build complete in ${duration}ms: ${matches.length} matches, ${allEvBets.length} EV bets`);

    // Progress complete
    evCache.setProgress('football', { current: 100, total: 100, step: 'complete', message: `Complete: ${allEvBets.length} EV bets found` });

    // Update cache
    evCache.setFootballCache({ matches, evBets: allEvBets });

    // Clear progress after short delay
    setTimeout(() => evCache.setProgress('football', null), 2000);

    return { matches, evBets: allEvBets, duration };

  } catch (err) {
    console.error('[FootballCacheBuilder] Build failed:', err.message);
    evCache.setProgress('football', { current: 0, total: 100, step: 'error', message: `Error: ${err.message}` });
    evCache.setError('football', err.message);
    throw err;
  }
};

module.exports = {
  buildFootballCache,
  fetchLeagueFixtures,
  fetchFixtureOdds,
  SOCCER_LEAGUES,
  PLAYABLE_BOOKMAKERS,
  ALL_BOOKMAKERS,
};
