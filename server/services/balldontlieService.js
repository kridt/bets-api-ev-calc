// server/services/balldontlieService.js
// NBA Stats Service using Ball Don't Lie API
// Provides historical stats for player prop analysis and fair odds calculation

const axios = require('axios');

const API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALLDONTLIE_API_KEY || '4ff9fe15-7d31-408f-9a08-401d207e193e';
const BASE_URL = 'https://api.balldontlie.io/v1';

/**
 * Make API request to balldontlie
 */
async function makeRequest(endpoint, params = {}) {
  try {
    const response = await axios.get(`${BASE_URL}/${endpoint}`, {
      headers: { 'Authorization': API_KEY },
      params
    });
    return response.data;
  } catch (error) {
    console.error(`[Balldontlie] API Error (${endpoint}):`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Search for a player by name
 */
async function searchPlayer(name) {
  const data = await makeRequest('players', { search: name });
  return data.data;
}

/**
 * Get player stats for specific criteria
 */
async function getPlayerStats(playerId, options = {}) {
  const params = {
    player_ids: [playerId],
    per_page: options.per_page || 100
  };

  if (options.season) params.seasons = [options.season];
  if (options.start_date) params.start_date = options.start_date;
  if (options.end_date) params.end_date = options.end_date;

  const data = await makeRequest('stats', params);
  return data.data;
}

/**
 * Parse minutes string to number
 */
function parseMinutes(minStr) {
  if (!minStr || minStr === '0' || minStr === '00:00') return 0;
  if (minStr.includes(':')) {
    const parts = minStr.split(':');
    return parseInt(parts[0]) + (parseInt(parts[1] || 0) / 60);
  }
  return parseInt(minStr) || 0;
}

/**
 * Get opponent name from stat object
 */
function getOpponentName(stat) {
  const game = stat.game;
  if (stat.team?.id === game.home_team_id) {
    return game.visitor_team?.full_name || 'Unknown';
  }
  return game.home_team?.full_name || 'Unknown';
}

/**
 * Parse game stats into standardized format
 */
function parseGameStats(stat) {
  const pts = stat.pts || 0;
  const reb = stat.reb || 0;
  const ast = stat.ast || 0;
  const stl = stat.stl || 0;
  const blk = stat.blk || 0;
  const fg3m = stat.fg3m || 0;

  return {
    gameId: stat.game.id,
    date: stat.game.date,
    opponent: getOpponentName(stat),
    home: stat.game.home_team_id === stat.team?.id,
    // Main stats
    points: pts,
    rebounds: reb,
    assists: ast,
    steals: stl,
    blocks: blk,
    threes: fg3m,
    turnovers: stat.turnover || 0,
    // Combined stats
    pra: pts + reb + ast,
    points_assists: pts + ast,
    points_rebounds: pts + reb,
    rebounds_assists: reb + ast,
    steals_blocks: stl + blk,
    // Minutes
    minutes: parseMinutes(stat.min),
    // Shooting
    fgm: stat.fgm || 0,
    fga: stat.fga || 0,
    fg_pct: stat.fg_pct,
    fg3m: fg3m,
    fg3a: stat.fg3a || 0,
    fg3_pct: stat.fg3_pct,
    ftm: stat.ftm || 0,
    fta: stat.fta || 0,
    ft_pct: stat.ft_pct
  };
}

/**
 * Get player's last N games stats
 */
async function getLastNGamesStats(playerName, numGames = 10) {
  // Find the player
  const players = await searchPlayer(playerName);
  if (!players || players.length === 0) {
    throw new Error(`Player "${playerName}" not found`);
  }

  const player = players[0];
  console.log(`[Balldontlie] Found: ${player.first_name} ${player.last_name} (ID: ${player.id})`);

  // Get current season stats
  const currentYear = new Date().getFullYear();
  const season = new Date().getMonth() >= 9 ? currentYear : currentYear - 1;

  const stats = await getPlayerStats(player.id, {
    season,
    per_page: numGames + 10
  });

  // Filter to games where player actually played and sort by date (most recent first)
  const playedGames = stats
    .filter(s => s.min && s.min !== '00:00' && parseInt(s.min) > 0)
    .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
    .slice(0, numGames);

  return {
    player: {
      id: player.id,
      name: `${player.first_name} ${player.last_name}`,
      team: player.team?.full_name || 'Unknown'
    },
    games: playedGames.map(s => parseGameStats(s)),
    gamesAnalyzed: playedGames.length
  };
}

/**
 * Get player's season stats
 */
async function getSeasonStats(playerName, season = null) {
  const players = await searchPlayer(playerName);
  if (!players || players.length === 0) {
    throw new Error(`Player "${playerName}" not found`);
  }

  const player = players[0];

  if (!season) {
    const currentYear = new Date().getFullYear();
    season = new Date().getMonth() >= 9 ? currentYear : currentYear - 1;
  }

  const stats = await getPlayerStats(player.id, {
    season,
    per_page: 100
  });

  const playedGames = stats
    .filter(s => s.min && s.min !== '00:00' && parseInt(s.min) > 0)
    .sort((a, b) => new Date(b.game.date) - new Date(a.game.date));

  return {
    player: {
      id: player.id,
      name: `${player.first_name} ${player.last_name}`,
      team: player.team?.full_name || 'Unknown'
    },
    season,
    games: playedGames.map(s => parseGameStats(s)),
    gamesPlayed: playedGames.length
  };
}

/**
 * Convert probability to American odds
 */
function probabilityToAmericanOdds(probability) {
  if (probability <= 0) return '+9999';
  if (probability >= 1) return '-9999';

  if (probability >= 0.5) {
    return Math.round(-100 * probability / (1 - probability));
  } else {
    return '+' + Math.round(100 * (1 - probability) / probability);
  }
}

/**
 * Convert American odds to probability
 */
function americanOddsToProbability(odds) {
  if (typeof odds === 'string') {
    odds = parseInt(odds.replace('+', ''));
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Calculate hit rate for a prop line
 * "How many times has player scored over X in last N games?"
 */
async function calculateHitRate(playerName, statType, line, numGames = 10) {
  const data = await getLastNGamesStats(playerName, numGames);

  const values = data.games.map(g => g[statType]);
  const overCount = values.filter(v => v > line).length;
  const underCount = values.filter(v => v < line).length;
  const pushCount = values.filter(v => v === line).length;

  const hitRate = overCount / values.length;
  const fairOddsOver = probabilityToAmericanOdds(hitRate);
  const fairOddsUnder = probabilityToAmericanOdds(1 - hitRate);

  // Calculate average and standard deviation
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    player: data.player,
    statType,
    line,
    gamesAnalyzed: values.length,
    results: {
      over: overCount,
      under: underCount,
      push: pushCount
    },
    hitRate: {
      over: hitRate,
      under: 1 - hitRate,
      overPercentage: (hitRate * 100).toFixed(1) + '%',
      underPercentage: ((1 - hitRate) * 100).toFixed(1) + '%'
    },
    fairOdds: {
      over: fairOddsOver,
      under: fairOddsUnder
    },
    statistics: {
      average: avg.toFixed(1),
      median: values.sort((a, b) => a - b)[Math.floor(values.length / 2)],
      min: Math.min(...values),
      max: Math.max(...values),
      stdDev: stdDev.toFixed(2)
    },
    values: values,
    gameDetails: data.games.map(g => ({
      date: g.date,
      opponent: g.opponent,
      home: g.home,
      value: g[statType],
      hit: g[statType] > line ? 'OVER' : (g[statType] < line ? 'UNDER' : 'PUSH')
    }))
  };
}

/**
 * Calculate season hit rate
 */
async function calculateSeasonHitRate(playerName, statType, line, season = null) {
  const data = await getSeasonStats(playerName, season);

  const values = data.games.map(g => g[statType]);
  if (values.length === 0) {
    throw new Error(`No games found for ${playerName} in season ${season || 'current'}`);
  }

  const overCount = values.filter(v => v > line).length;
  const underCount = values.filter(v => v < line).length;
  const pushCount = values.filter(v => v === line).length;

  const hitRate = overCount / values.length;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    player: data.player,
    season: data.season,
    statType,
    line,
    gamesAnalyzed: values.length,
    results: {
      over: overCount,
      under: underCount,
      push: pushCount
    },
    hitRate: {
      over: hitRate,
      under: 1 - hitRate,
      overPercentage: (hitRate * 100).toFixed(1) + '%',
      underPercentage: ((1 - hitRate) * 100).toFixed(1) + '%'
    },
    fairOdds: {
      over: probabilityToAmericanOdds(hitRate),
      under: probabilityToAmericanOdds(1 - hitRate)
    },
    average: avg.toFixed(1)
  };
}

/**
 * Calculate EV for a bet
 */
function calculateEV(probability, bookOdds) {
  const impliedProb = americanOddsToProbability(bookOdds);
  const edge = probability - impliedProb;

  let payout;
  if (typeof bookOdds === 'string') {
    bookOdds = parseInt(bookOdds.replace('+', ''));
  }

  if (bookOdds > 0) {
    payout = bookOdds / 100;
  } else {
    payout = 100 / Math.abs(bookOdds);
  }

  const ev = (probability * payout) - (1 - probability);

  return {
    fairProbability: (probability * 100).toFixed(1) + '%',
    impliedProbability: (impliedProb * 100).toFixed(1) + '%',
    edge: (edge * 100).toFixed(2) + '%',
    ev: (ev * 100).toFixed(2) + '%',
    recommendation: ev > 0.02 ? 'VALUE BET' : (ev > 0 ? 'SLIGHT VALUE' : 'NO VALUE'),
    kellyBet: ev > 0 ? ((edge / (payout)) * 100).toFixed(1) + '%' : '0%'
  };
}

/**
 * Full prop analysis with EV calculation
 */
async function analyzePlayerProp(playerName, statType, line, bookOddsOver, numGames = 15) {
  const hitRateData = await calculateHitRate(playerName, statType, line, numGames);

  const evOver = calculateEV(hitRateData.hitRate.over, bookOddsOver);

  // Calculate implied under odds
  let bookOddsUnder;
  if (typeof bookOddsOver === 'string') {
    const overOdds = parseInt(bookOddsOver.replace('+', ''));
    bookOddsUnder = overOdds > 0 ? -overOdds : '+' + Math.abs(overOdds);
  } else {
    bookOddsUnder = bookOddsOver > 0 ? -bookOddsOver : Math.abs(bookOddsOver);
  }

  const evUnder = calculateEV(hitRateData.hitRate.under, bookOddsUnder);

  // Determine best bet
  let bestBet = null;
  const evOverNum = parseFloat(evOver.ev);
  const evUnderNum = parseFloat(evUnder.ev);

  if (evOverNum > 2) {
    bestBet = { side: 'OVER', ev: evOver.ev, edge: evOver.edge };
  } else if (evUnderNum > 2) {
    bestBet = { side: 'UNDER', ev: evUnder.ev, edge: evUnder.edge };
  }

  return {
    ...hitRateData,
    analysis: {
      over: {
        bookOdds: bookOddsOver,
        ...evOver
      },
      under: {
        bookOdds: bookOddsUnder,
        ...evUnder
      }
    },
    bestBet,
    summary: `${hitRateData.player.name} has gone OVER ${line} ${statType} in ${hitRateData.results.over}/${hitRateData.gamesAnalyzed} games (${hitRateData.hitRate.overPercentage}). Fair odds: ${hitRateData.fairOdds.over}`
  };
}

/**
 * Get available stat types
 */
function getStatTypes() {
  return {
    main: ['points', 'rebounds', 'assists', 'steals', 'blocks', 'threes', 'turnovers'],
    combined: ['pra', 'points_assists', 'points_rebounds', 'rebounds_assists', 'steals_blocks'],
    descriptions: {
      points: 'Points scored',
      rebounds: 'Total rebounds',
      assists: 'Assists',
      steals: 'Steals',
      blocks: 'Blocks',
      threes: '3-pointers made',
      turnovers: 'Turnovers',
      pra: 'Points + Rebounds + Assists',
      points_assists: 'Points + Assists',
      points_rebounds: 'Points + Rebounds',
      rebounds_assists: 'Rebounds + Assists',
      steals_blocks: 'Steals + Blocks'
    }
  };
}

module.exports = {
  searchPlayer,
  getLastNGamesStats,
  getSeasonStats,
  calculateHitRate,
  calculateSeasonHitRate,
  calculateEV,
  analyzePlayerProp,
  probabilityToAmericanOdds,
  americanOddsToProbability,
  getStatTypes
};
