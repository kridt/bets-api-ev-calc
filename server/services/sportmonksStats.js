// server/services/sportmonksStats.js
// Service to fetch historical match stats from Sportmonks API

const API_BASE = 'https://api.sportmonks.com/v3/football';
const API_KEY = process.env.SPORTMONKS_API_KEY || 'kskw99cYgXArHw6NvqxIbecZVmhssy7hw8iczlYxp9mufXHfGDMPoHaBKDcY';

// Caches
const teamCache = new Map();
const playerCache = new Map();

/**
 * Make an API request to SportMonks
 */
async function apiRequest(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  url.searchParams.set('api_token', API_KEY);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  console.log(`[Sportmonks] Fetching: ${endpoint}`);
  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`SportMonks API error: ${response.status} - ${error.message || 'Unknown error'}`);
  }

  return response.json();
}

/**
 * Check if this is a player prop market
 */
function isPlayerPropMarket(market, selection) {
  const marketLower = market.toLowerCase();

  // Explicit player prop markets
  const playerMarkets = [
    'player_shots', 'player_goals', 'player_assists', 'player_cards',
    'player_fouls', 'player_tackles', 'player_passes', 'player_offsides',
    'anytime_scorer', 'first_scorer', 'last_scorer', 'anytime_goalscorer',
    'first_goalscorer', 'last_goalscorer', 'to_score', 'player_to_score',
  ];

  if (playerMarkets.some(pm => marketLower.includes(pm))) {
    return true;
  }

  // If market contains "player" anywhere
  if (marketLower.includes('player')) {
    return true;
  }

  return false;
}

/**
 * Extract player name from selection string
 * e.g., "Phillip Tietz Over 0.5" -> "Phillip Tietz"
 */
function extractPlayerName(selection) {
  if (!selection) return null;

  // Remove common bet type suffixes
  let cleaned = selection
    .replace(/\s+(over|under|yes|no)\s+[\d.]+$/i, '')
    .replace(/\s+(over|under)\s*$/i, '')
    .replace(/\s+[\d.]+\+?$/i, '')
    .replace(/\s+(1\+|2\+|3\+)$/i, '')
    .trim();

  return cleaned;
}

/**
 * Search for a team by name
 */
async function searchTeam(name) {
  const cached = teamCache.get(name.toLowerCase());
  if (cached) return cached;

  try {
    const result = await apiRequest('/teams/search/' + encodeURIComponent(name), {
      include: 'country',
    });

    if (result.data && result.data.length > 0) {
      const team = result.data[0];
      teamCache.set(name.toLowerCase(), team);
      return team;
    }
    return null;
  } catch (error) {
    console.error(`[Sportmonks] Error searching team "${name}":`, error.message);
    return null;
  }
}

/**
 * Search for a player by name
 */
async function searchPlayer(name) {
  const cached = playerCache.get(name.toLowerCase());
  if (cached) return cached;

  try {
    const result = await apiRequest('/players/search/' + encodeURIComponent(name), {
      include: 'teams.team',
    });

    if (result.data && result.data.length > 0) {
      // Find the best match (exact name match preferred)
      let player = result.data.find(p =>
        p.display_name?.toLowerCase() === name.toLowerCase() ||
        p.name?.toLowerCase() === name.toLowerCase() ||
        p.common_name?.toLowerCase() === name.toLowerCase()
      ) || result.data[0];

      playerCache.set(name.toLowerCase(), player);
      console.log(`[Sportmonks] Found player: ${player.display_name || player.name} (ID: ${player.id})`);
      return player;
    }
    return null;
  } catch (error) {
    console.error(`[Sportmonks] Error searching player "${name}":`, error.message);
    return null;
  }
}

/**
 * Get player's recent fixtures with their individual statistics
 * Uses lineups include on team fixtures to get player stats per match
 */
async function getPlayerFixturesWithStats(player, limit = 10) {
  const playerId = player.id;

  // Get player's current team
  let teamId = null;
  if (player.teams && player.teams.length > 0) {
    // Find current team (latest team with null end date or future end date)
    const currentTeam = player.teams.find(t =>
      !t.end || new Date(t.end) > new Date()
    ) || player.teams[0];
    teamId = currentTeam.team?.id || currentTeam.team_id;
  }

  if (!teamId) {
    // Try to get team from player details
    try {
      const playerDetails = await apiRequest(`/players/${playerId}`, {
        include: 'teams.team',
      });
      if (playerDetails.data?.teams?.length > 0) {
        const currentTeam = playerDetails.data.teams.find(t =>
          !t.end || new Date(t.end) > new Date()
        ) || playerDetails.data.teams[0];
        teamId = currentTeam.team?.id || currentTeam.team_id;
      }
    } catch (e) {
      console.error(`[Sportmonks] Could not get player team:`, e.message);
    }
  }

  if (!teamId) {
    console.log(`[Sportmonks] No team found for player ${playerId}`);
    return [];
  }

  console.log(`[Sportmonks] Getting fixtures for team ${teamId} to find player ${playerId} stats`);

  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 120);

  const startDate = pastDate.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  try {
    // Get team's fixtures with lineups (which contain player stats)
    const result = await apiRequest(`/fixtures/between/${startDate}/${endDate}/${teamId}`, {
      include: 'lineups.details.type;participants',
      per_page: 30,
    });

    if (!result.data) return [];

    const fixtureStats = [];

    for (const fixture of result.data) {
      // Only include finished matches
      if (fixture.state_id !== 5 && fixture.state_id !== 3) continue;

      // Find the player in lineups
      const lineups = fixture.lineups || [];
      const playerLineup = lineups.find(l => l.player_id === playerId);

      if (!playerLineup) continue; // Player didn't play in this match

      // Extract player stats from lineup details
      const details = playerLineup.details || [];
      const playerStats = {};

      for (const detail of details) {
        const typeName = detail.type?.name?.toLowerCase() || '';
        const typeId = detail.type_id;
        const value = detail.value?.total ?? detail.value ?? 0;

        // Map type IDs to stat names (common Sportmonks type IDs)
        // 86: Shots on target, 42: Shots total, 52: Goals, 79: Assists
        // 84: Fouls, 56: Yellow cards, 57: Red cards, 46: Tackles
        if (typeId === 86 || typeName.includes('shots on target')) {
          playerStats['shots_on_target'] = value;
        } else if (typeId === 42 || typeName.includes('shots') && !typeName.includes('on target')) {
          playerStats['shots_total'] = value;
        } else if (typeId === 52 || typeName.includes('goal') && !typeName.includes('assist')) {
          playerStats['goals'] = value;
        } else if (typeId === 79 || typeName.includes('assist')) {
          playerStats['assists'] = value;
        } else if (typeId === 84 || typeName.includes('foul')) {
          playerStats['fouls'] = value;
        } else if (typeId === 56 || typeName.includes('yellow')) {
          playerStats['yellow_cards'] = value;
        } else if (typeId === 57 || typeName.includes('red')) {
          playerStats['red_cards'] = value;
        } else if (typeId === 46 || typeName.includes('tackle')) {
          playerStats['tackles'] = value;
        } else if (typeName) {
          playerStats[typeName] = value;
        }
      }

      const participants = fixture.participants || [];
      const homeTeam = participants.find(p => p.meta?.location === 'home');
      const awayTeam = participants.find(p => p.meta?.location === 'away');

      fixtureStats.push({
        fixtureId: fixture.id,
        date: fixture.starting_at,
        playerStats,
        homeTeam: homeTeam?.name || 'Unknown',
        awayTeam: awayTeam?.name || 'Unknown',
        fixture,
      });
    }

    // Sort by date descending and limit
    const sortedStats = fixtureStats
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    console.log(`[Sportmonks] Found ${sortedStats.length} fixtures with player ${playerId} stats`);
    return sortedStats;

  } catch (error) {
    console.error(`[Sportmonks] Error fetching player fixtures:`, error.message);
    return [];
  }
}

/**
 * Get player's fixtures for a specific team
 * Used as fallback when player's team data doesn't match
 */
async function getPlayerFixturesWithStatsForTeam(playerId, teamId, limit = 10) {
  console.log(`[Sportmonks] Getting fixtures for team ${teamId} to find player ${playerId} stats`);

  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 120);

  const startDate = pastDate.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  try {
    const result = await apiRequest(`/fixtures/between/${startDate}/${endDate}/${teamId}`, {
      include: 'lineups.details.type;participants',
      per_page: 30,
    });

    if (!result.data) return [];

    const fixtureStats = [];

    for (const fixture of result.data) {
      if (fixture.state_id !== 5 && fixture.state_id !== 3) continue;

      const lineups = fixture.lineups || [];
      const playerLineup = lineups.find(l => l.player_id === playerId);

      if (!playerLineup) continue;

      const details = playerLineup.details || [];
      const playerStats = {};

      for (const detail of details) {
        const typeName = detail.type?.name?.toLowerCase() || '';
        const typeId = detail.type_id;
        const value = detail.value?.total ?? detail.value ?? 0;

        if (typeId === 86 || typeName.includes('shots on target')) {
          playerStats['shots_on_target'] = value;
        } else if (typeId === 42 || typeName.includes('shots') && !typeName.includes('on target')) {
          playerStats['shots_total'] = value;
        } else if (typeId === 52 || typeName.includes('goal') && !typeName.includes('assist')) {
          playerStats['goals'] = value;
        } else if (typeId === 79 || typeName.includes('assist')) {
          playerStats['assists'] = value;
        } else if (typeId === 84 || typeName.includes('foul')) {
          playerStats['fouls'] = value;
        } else if (typeId === 56 || typeName.includes('yellow')) {
          playerStats['yellow_cards'] = value;
        } else if (typeId === 57 || typeName.includes('red')) {
          playerStats['red_cards'] = value;
        } else if (typeId === 46 || typeName.includes('tackle')) {
          playerStats['tackles'] = value;
        } else if (typeName) {
          playerStats[typeName] = value;
        }
      }

      const participants = fixture.participants || [];
      const homeTeam = participants.find(p => p.meta?.location === 'home');
      const awayTeam = participants.find(p => p.meta?.location === 'away');

      fixtureStats.push({
        fixtureId: fixture.id,
        date: fixture.starting_at,
        playerStats,
        homeTeam: homeTeam?.name || 'Unknown',
        awayTeam: awayTeam?.name || 'Unknown',
        fixture,
      });
    }

    const sortedStats = fixtureStats
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    console.log(`[Sportmonks] Found ${sortedStats.length} fixtures with player ${playerId} stats`);
    return sortedStats;

  } catch (error) {
    console.error(`[Sportmonks] Error fetching player fixtures for team:`, error.message);
    return [];
  }
}

/**
 * Get team's last N fixtures with full statistics
 */
async function getTeamLastFixtures(teamId, limit = 10) {
  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 120);

  const startDate = pastDate.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  try {
    const result = await apiRequest(`/fixtures/between/${startDate}/${endDate}/${teamId}`, {
      include: 'participants;scores;statistics.type',
      per_page: 50,
    });

    if (!result.data) return [];

    const fixtures = result.data
      .filter(f => f.state_id === 5 || f.state_id === 3)
      .sort((a, b) => new Date(b.starting_at) - new Date(a.starting_at))
      .slice(0, limit);

    return fixtures;
  } catch (error) {
    console.error(`[Sportmonks] Error fetching fixtures for team ${teamId}:`, error.message);
    return [];
  }
}

/**
 * Extract match statistics from a fixture
 */
function extractMatchStats(fixture, teamId) {
  const participants = fixture.participants || [];
  const homeTeam = participants.find(p => p.meta?.location === 'home');
  const awayTeam = participants.find(p => p.meta?.location === 'away');

  const isHome = homeTeam?.id === teamId;
  const team = isHome ? homeTeam : awayTeam;
  const opponent = isHome ? awayTeam : homeTeam;

  const scores = fixture.scores || [];
  const homeScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'home');
  const awayScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'away');
  const htHomeScore = scores.find(s => s.description === '1ST_HALF' && s.score?.participant === 'home');
  const htAwayScore = scores.find(s => s.description === '1ST_HALF' && s.score?.participant === 'away');

  const teamGoals = isHome ? (homeScore?.score?.goals || 0) : (awayScore?.score?.goals || 0);
  const opponentGoals = isHome ? (awayScore?.score?.goals || 0) : (homeScore?.score?.goals || 0);
  const totalGoals = teamGoals + opponentGoals;

  const htTeamGoals = isHome ? (htHomeScore?.score?.goals || 0) : (htAwayScore?.score?.goals || 0);
  const htOpponentGoals = isHome ? (htAwayScore?.score?.goals || 0) : (htHomeScore?.score?.goals || 0);
  const htTotalGoals = htTeamGoals + htOpponentGoals;

  const statistics = fixture.statistics || [];
  const getStatValue = (typeId, participantId) => {
    const stat = statistics.find(s => s.type_id === typeId && s.participant_id === participantId);
    return stat?.data?.value || 0;
  };

  const STAT_IDS = {
    CORNERS: 34,
    YELLOW_CARDS: 56,
    RED_CARDS: 57,
    SHOTS_ON_TARGET: 42,
    SHOTS_TOTAL: 41,
    OFFSIDES: 37,
    FOULS: 36,
  };

  const teamCorners = getStatValue(STAT_IDS.CORNERS, team?.id);
  const opponentCorners = getStatValue(STAT_IDS.CORNERS, opponent?.id);
  const totalCorners = teamCorners + opponentCorners;

  const teamYellowCards = getStatValue(STAT_IDS.YELLOW_CARDS, team?.id);
  const opponentYellowCards = getStatValue(STAT_IDS.YELLOW_CARDS, opponent?.id);
  const teamRedCards = getStatValue(STAT_IDS.RED_CARDS, team?.id);
  const opponentRedCards = getStatValue(STAT_IDS.RED_CARDS, opponent?.id);
  const totalCards = teamYellowCards + opponentYellowCards + teamRedCards + opponentRedCards;
  const totalCardPoints = teamYellowCards + opponentYellowCards + (teamRedCards + opponentRedCards) * 2;

  const teamShotsOnTarget = getStatValue(STAT_IDS.SHOTS_ON_TARGET, team?.id);
  const opponentShotsOnTarget = getStatValue(STAT_IDS.SHOTS_ON_TARGET, opponent?.id);
  const totalShotsOnTarget = teamShotsOnTarget + opponentShotsOnTarget;

  const teamShots = getStatValue(STAT_IDS.SHOTS_TOTAL, team?.id);
  const opponentShots = getStatValue(STAT_IDS.SHOTS_TOTAL, opponent?.id);
  const totalShots = teamShots + opponentShots;

  const teamOffsides = getStatValue(STAT_IDS.OFFSIDES, team?.id);
  const opponentOffsides = getStatValue(STAT_IDS.OFFSIDES, opponent?.id);
  const totalOffsides = teamOffsides + opponentOffsides;

  return {
    fixtureId: fixture.id,
    date: fixture.starting_at,
    homeTeam: homeTeam?.name || 'Unknown',
    awayTeam: awayTeam?.name || 'Unknown',
    isHome,
    totalGoals, teamGoals, opponentGoals,
    bothScored: teamGoals > 0 && opponentGoals > 0,
    htTotalGoals, htTeamGoals, htOpponentGoals,
    htBothScored: htTeamGoals > 0 && htOpponentGoals > 0,
    totalCorners, teamCorners, opponentCorners,
    totalCards, totalCardPoints, teamYellowCards, opponentYellowCards,
    totalShotsOnTarget, teamShotsOnTarget, opponentShotsOnTarget,
    totalShots, teamShots, opponentShots,
    totalOffsides, teamOffsides, opponentOffsides,
  };
}

/**
 * Check player prop bet history
 */
async function checkPlayerBetHistory(bet) {
  const { market, betType, line, selection, homeTeam, awayTeam } = bet;

  const playerName = extractPlayerName(selection);
  if (!playerName) {
    return {
      error: 'Could not extract player name from selection',
      isPlayerProp: true,
      hits: 0,
      total: 0,
      matches: [],
      percentage: 0
    };
  }

  console.log(`[Sportmonks] Checking player bet: ${playerName} - ${market} ${betType} ${line}`);

  const player = await searchPlayer(playerName);
  if (!player) {
    return {
      error: `Player not found: ${playerName}`,
      isPlayerProp: true,
      hits: 0,
      total: 0,
      matches: [],
      percentage: 0
    };
  }

  // Try getting fixtures for the player's team from their data
  let fixtures = await getPlayerFixturesWithStats(player, 10);

  // If no fixtures found, try using the team names from the bet
  if (fixtures.length === 0 && (homeTeam || awayTeam)) {
    console.log(`[Sportmonks] No fixtures from player's team, trying bet teams: ${homeTeam} / ${awayTeam}`);

    // Try home team first
    if (homeTeam) {
      const team = await searchTeam(homeTeam);
      if (team) {
        console.log(`[Sportmonks] Trying home team: ${team.name} (${team.id})`);
        fixtures = await getPlayerFixturesWithStatsForTeam(player.id, team.id, 10);
      }
    }

    // If still no fixtures, try away team
    if (fixtures.length === 0 && awayTeam) {
      const team = await searchTeam(awayTeam);
      if (team) {
        console.log(`[Sportmonks] Trying away team: ${team.name} (${team.id})`);
        fixtures = await getPlayerFixturesWithStatsForTeam(player.id, team.id, 10);
      }
    }
  }

  if (fixtures.length === 0) {
    return {
      error: 'No recent fixtures found for player',
      isPlayerProp: true,
      playerName: player.display_name || player.name,
      playerId: player.id,
      hits: 0,
      total: 0,
      matches: [],
      percentage: 0
    };
  }

  const marketLower = market.toLowerCase();
  const type = betType?.toUpperCase();
  const lineNum = parseFloat(line) || 0;

  let hits = 0;
  const matchResults = [];

  for (const f of fixtures) {
    const stats = f.playerStats;
    console.log(`[Sportmonks] Match ${f.homeTeam} vs ${f.awayTeam}: Player stats:`, JSON.stringify(stats));
    let statValue = null;
    let statName = '';
    let betWon = null;

    // Determine which stat to check based on market
    if (marketLower.includes('shots_on_target') || marketLower.includes('shots on target')) {
      statValue = stats['shots_on_target'] || stats['shots on target'] || 0;
      statName = 'SoT';
    } else if (marketLower.includes('shots') || marketLower.includes('shot')) {
      statValue = stats['shots_total'] || stats['shots'] || 0;
      statName = 'shots';
    } else if (marketLower.includes('goal') || marketLower.includes('scorer')) {
      statValue = stats['goals'] || 0;
      statName = 'goals';
    } else if (marketLower.includes('assist')) {
      statValue = stats['assists'] || 0;
      statName = 'assists';
    } else if (marketLower.includes('card')) {
      statValue = (stats['yellow_cards'] || 0) + (stats['red_cards'] || 0);
      statName = 'cards';
    } else if (marketLower.includes('foul')) {
      statValue = stats['fouls'] || 0;
      statName = 'fouls';
    } else if (marketLower.includes('tackle')) {
      statValue = stats['tackles'] || 0;
      statName = 'tackles';
    } else if (marketLower.includes('pass')) {
      statValue = stats['passes'] || 0;
      statName = 'passes';
    }

    if (statValue !== null) {
      if (type === 'OVER') {
        betWon = statValue > lineNum;
      } else if (type === 'UNDER') {
        betWon = statValue < lineNum;
      } else if (type === 'YES' || marketLower.includes('scorer') || marketLower.includes('to_score')) {
        betWon = statValue > 0;
      } else if (type === 'NO') {
        betWon = statValue === 0;
      }

      if (betWon) hits++;
    }

    matchResults.push({
      date: f.date,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      betWon,
      relevantStat: statValue !== null ? `${statValue} ${statName}` : 'N/A',
    });
  }

  return {
    isPlayerProp: true,
    playerName: player.display_name || player.name,
    playerId: player.id,
    hits,
    total: fixtures.length,
    percentage: fixtures.length > 0 ? Math.round((hits / fixtures.length) * 100) : 0,
    matches: matchResults,
  };
}

/**
 * Check team-level bet history
 */
async function checkTeamBetHistory(bet) {
  const { market, betType, line, homeTeam, awayTeam, selection } = bet;

  let teamToAnalyze = homeTeam;
  let isTeamSpecific = false;

  if (market.includes('team_total') || (selection && !isPlayerPropMarket(market, selection))) {
    isTeamSpecific = true;
    if (selection) {
      const selLower = selection.toLowerCase();
      if (awayTeam && selLower.includes(awayTeam.toLowerCase().split(' ')[0])) {
        teamToAnalyze = awayTeam;
      }
    }
  }

  const team = await searchTeam(teamToAnalyze);
  if (!team) {
    return {
      error: `Team not found: ${teamToAnalyze}`,
      hits: 0,
      total: 0,
      matches: [],
      percentage: 0
    };
  }

  const fixtures = await getTeamLastFixtures(team.id, 10);
  if (fixtures.length === 0) {
    return {
      error: 'No recent fixtures found',
      hits: 0,
      total: 0,
      matches: [],
      percentage: 0
    };
  }

  const matches = fixtures.map(f => extractMatchStats(f, team.id));
  let hits = 0;

  matches.forEach(match => {
    const betWon = checkBetResult(market, betType, line, match, isTeamSpecific);
    if (betWon === true) hits++;
    match.betWon = betWon;
  });

  return {
    teamName: team.name,
    teamId: team.id,
    hits,
    total: matches.length,
    percentage: Math.round((hits / matches.length) * 100),
    matches: matches.map(m => ({
      date: m.date,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      betWon: m.betWon,
      relevantStat: getRelevantStat(market, m, isTeamSpecific),
    })),
  };
}

/**
 * Main entry point - Check how many times a bet would have won
 */
async function checkBetHistory(bet) {
  const { market, selection } = bet;

  // Check if this is a player prop market
  if (isPlayerPropMarket(market, selection)) {
    console.log(`[Sportmonks] Detected player prop market: ${market}`);
    return checkPlayerBetHistory(bet);
  }

  // Otherwise, check team-level stats
  return checkTeamBetHistory(bet);
}

/**
 * Check if a team-level bet would have won based on match stats
 */
function checkBetResult(market, betType, line, stats, isTeamSpecific) {
  const marketLower = market.toLowerCase();
  const type = betType?.toUpperCase();
  const lineNum = parseFloat(line) || 0;

  // Goals markets
  if (marketLower.includes('total_goals') || marketLower.includes('asian_total_goals')) {
    if (marketLower.includes('1st_half')) {
      const value = isTeamSpecific ? stats.htTeamGoals : stats.htTotalGoals;
      return type === 'OVER' ? value > lineNum : value < lineNum;
    } else if (marketLower.includes('2nd_half')) {
      const ftValue = isTeamSpecific ? stats.teamGoals : stats.totalGoals;
      const htValue = isTeamSpecific ? stats.htTeamGoals : stats.htTotalGoals;
      const shValue = ftValue - htValue;
      return type === 'OVER' ? shValue > lineNum : shValue < lineNum;
    } else {
      const value = isTeamSpecific ? stats.teamGoals : stats.totalGoals;
      return type === 'OVER' ? value > lineNum : value < lineNum;
    }
  }

  // Corners markets (team-level only)
  if (marketLower.includes('corners') && !marketLower.includes('player')) {
    if (marketLower.includes('1st_half')) {
      return null; // Not tracked separately
    }
    const value = isTeamSpecific ? stats.teamCorners : stats.totalCorners;
    return type === 'OVER' ? value > lineNum : value < lineNum;
  }

  // Cards markets (team-level only)
  if (marketLower.includes('card') && !marketLower.includes('player')) {
    if (marketLower.includes('point')) {
      return type === 'OVER' ? stats.totalCardPoints > lineNum : stats.totalCardPoints < lineNum;
    } else if (marketLower.includes('red')) {
      const value = stats.teamRedCards + stats.opponentRedCards;
      return type === 'OVER' ? value > lineNum : value < lineNum;
    }
    return type === 'OVER' ? stats.totalCards > lineNum : stats.totalCards < lineNum;
  }

  // Team shots markets (not player)
  if (marketLower.includes('shots') && !marketLower.includes('player')) {
    if (marketLower.includes('on_target')) {
      const value = isTeamSpecific ? stats.teamShotsOnTarget : stats.totalShotsOnTarget;
      return type === 'OVER' ? value > lineNum : value < lineNum;
    }
    const value = isTeamSpecific ? stats.teamShots : stats.totalShots;
    return type === 'OVER' ? value > lineNum : value < lineNum;
  }

  // Offsides markets
  if (marketLower.includes('offside') && !marketLower.includes('player')) {
    const value = isTeamSpecific ? stats.teamOffsides : stats.totalOffsides;
    return type === 'OVER' ? value > lineNum : value < lineNum;
  }

  // Both teams to score
  if (marketLower.includes('btts') || marketLower.includes('both_teams')) {
    return type === 'YES' ? stats.bothScored : !stats.bothScored;
  }

  return null; // Unknown market
}

/**
 * Get the relevant stat value for display
 */
function getRelevantStat(market, stats, isTeamSpecific) {
  const marketLower = market.toLowerCase();

  if (marketLower.includes('total_goals') || marketLower.includes('asian_total_goals')) {
    if (marketLower.includes('1st_half')) {
      return isTeamSpecific ? `${stats.htTeamGoals} goals (HT)` : `${stats.htTotalGoals} goals (HT)`;
    }
    return isTeamSpecific ? `${stats.teamGoals} goals` : `${stats.totalGoals} goals`;
  }

  if (marketLower.includes('corners')) {
    return isTeamSpecific ? `${stats.teamCorners} corners` : `${stats.totalCorners} corners`;
  }

  if (marketLower.includes('card')) {
    if (marketLower.includes('point')) {
      return `${stats.totalCardPoints} card pts`;
    }
    return `${stats.totalCards} cards`;
  }

  if (marketLower.includes('shots')) {
    if (marketLower.includes('on_target')) {
      return isTeamSpecific ? `${stats.teamShotsOnTarget} SoT` : `${stats.totalShotsOnTarget} SoT`;
    }
    return isTeamSpecific ? `${stats.teamShots} shots` : `${stats.totalShots} shots`;
  }

  if (marketLower.includes('offside')) {
    return isTeamSpecific ? `${stats.teamOffsides} offsides` : `${stats.totalOffsides} offsides`;
  }

  if (marketLower.includes('btts') || marketLower.includes('both_teams')) {
    return stats.bothScored ? 'BTTS: Yes' : 'BTTS: No';
  }

  return `${stats.totalGoals} goals`;
}

module.exports = {
  searchTeam,
  searchPlayer,
  getTeamLastFixtures,
  getPlayerFixturesWithStats,
  extractMatchStats,
  checkBetHistory,
  isPlayerPropMarket,
};
