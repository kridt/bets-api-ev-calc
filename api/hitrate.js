// api/hitrate.js - Vercel Serverless Function for NBA player hit rates

const BALLDONTLIE_API_KEY = '4ff9fe15-7d31-408f-9a08-401d207e193e';
const BALLDONTLIE_BASE = 'https://api.balldontlie.io/v1';

// Map odds API stat names to balldontlie stat fields
const STAT_MAP = {
  // Single stats
  'points': 'pts',
  'rebounds': 'reb',
  'assists': 'ast',
  '3pointers': 'fg3m',
  'threes': 'fg3m',
  'steals': 'stl',
  'blocks': 'blk',
  'turnovers': 'turnover',
  'field_goals': 'fgm',
  'free_throws': 'ftm',

  // 2-stat combos
  'pts_asts': ['pts', 'ast'],
  'pts_rebs': ['pts', 'reb'],
  'rebs_asts': ['reb', 'ast'],
  'steals_blocks': ['stl', 'blk'],

  // 3-stat combo
  'pts_rebs_asts': ['pts', 'reb', 'ast'],

  // Special: double_double and triple_double use special calculation
  'double_double': 'DOUBLE_DOUBLE',
  'triple_double': 'TRIPLE_DOUBLE',
};

// Calculate double-double: 10+ in at least 2 of: pts, reb, ast, stl, blk
const isDoubleDouble = (game) => {
  const categories = [game.pts, game.reb, game.ast, game.stl, game.blk];
  return categories.filter(v => v >= 10).length >= 2;
};

// Calculate triple-double: 10+ in at least 3 of: pts, reb, ast, stl, blk
const isTripleDouble = (game) => {
  const categories = [game.pts, game.reb, game.ast, game.stl, game.blk];
  return categories.filter(v => v >= 10).length >= 3;
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { player: playerName, stat: statType, line: lineStr, games: gamesStr } = req.query;
    const line = parseFloat(lineStr);
    const numGames = parseInt(gamesStr) || 10;

    if (!playerName || !statType || isNaN(line)) {
      return res.status(400).json({
        success: false,
        error: "Missing player, stat, or line parameter"
      });
    }

    // Search for player - balldontlie API works better with last name only
    const nameParts = playerName.trim().split(/\s+/);
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : playerName;
    const firstName = nameParts.length > 1 ? nameParts[0] : '';

    // Try searching by last name first (more reliable)
    let searchRes = await fetch(`${BALLDONTLIE_BASE}/players?search=${encodeURIComponent(lastName)}`, {
      headers: { 'Authorization': BALLDONTLIE_API_KEY }
    });
    let searchData = await searchRes.json();

    // If no results, try first name
    if (!searchData.data || searchData.data.length === 0) {
      searchRes = await fetch(`${BALLDONTLIE_BASE}/players?search=${encodeURIComponent(firstName)}`, {
        headers: { 'Authorization': BALLDONTLIE_API_KEY }
      });
      searchData = await searchRes.json();
    }

    if (!searchData.data || searchData.data.length === 0) {
      return res.status(200).json({
        success: false,
        error: `Player "${playerName}" not found`
      });
    }

    // Find best match - prefer exact first+last name match
    let player = searchData.data[0];
    const playerNameLower = playerName.toLowerCase();
    for (const p of searchData.data) {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (fullName === playerNameLower) {
        player = p;
        break;
      }
      // Also check if first name matches (for cases like "LeBron" vs "Lebron")
      if (firstName && p.first_name.toLowerCase() === firstName.toLowerCase() &&
          p.last_name.toLowerCase() === lastName.toLowerCase()) {
        player = p;
        break;
      }
    }
    const playerId = player.id;

    // Get current NBA season
    const currentYear = new Date().getFullYear();
    const month = new Date().getMonth();
    const primarySeason = month >= 9 ? currentYear : currentYear - 1;
    const fallbackSeason = primarySeason - 1;

    // Helper function to filter to actually played games
    const filterPlayedGames = (data) => {
      if (!data || !Array.isArray(data)) return [];
      return data.filter(s => s.min && s.min !== '00:00' && parseInt(s.min) > 0);
    };

    // Try primary season first
    let statsRes = await fetch(`${BALLDONTLIE_BASE}/stats?player_ids[]=${playerId}&seasons[]=${primarySeason}&per_page=${numGames + 10}`, {
      headers: { 'Authorization': BALLDONTLIE_API_KEY }
    });
    let statsData = await statsRes.json();
    let playedGamesRaw = filterPlayedGames(statsData.data);

    // If no PLAYED games, try fallback season
    if (playedGamesRaw.length === 0) {
      statsRes = await fetch(`${BALLDONTLIE_BASE}/stats?player_ids[]=${playerId}&seasons[]=${fallbackSeason}&per_page=${numGames + 10}`, {
        headers: { 'Authorization': BALLDONTLIE_API_KEY }
      });
      statsData = await statsRes.json();
      playedGamesRaw = filterPlayedGames(statsData.data);
    }

    if (playedGamesRaw.length === 0) {
      return res.status(200).json({
        success: false,
        error: "No stats found for player in current or last season"
      });
    }

    // Sort by date (most recent first) and take requested number of games
    const playedGames = playedGamesRaw
      .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
      .slice(0, numGames);

    // Calculate stat value for each game
    const statField = STAT_MAP[statType.toLowerCase()];
    if (!statField) {
      return res.status(200).json({
        success: false,
        error: `Unknown stat type: ${statType}`
      });
    }

    // Special handling for double/triple doubles
    const isDoubleDoubleMarket = statField === 'DOUBLE_DOUBLE';
    const isTripleDoubleMarket = statField === 'TRIPLE_DOUBLE';

    let values;
    let overCount, underCount, pushCount, hitRate, avg;

    if (isDoubleDoubleMarket || isTripleDoubleMarket) {
      // For double/triple double, values are 1 (yes) or 0 (no)
      values = playedGames.map(g => {
        if (isDoubleDoubleMarket) {
          return isDoubleDouble(g) ? 1 : 0;
        } else {
          return isTripleDouble(g) ? 1 : 0;
        }
      });

      // For these markets, line is typically 0.5
      // Over 0.5 = yes (got double/triple double), Under 0.5 = no
      overCount = values.filter(v => v === 1).length;
      underCount = values.filter(v => v === 0).length;
      pushCount = 0;
      hitRate = overCount / values.length;
      avg = hitRate; // Average is just the percentage for these markets

      // Calculate detailed stats for display
      const ddDetails = playedGames.map((g, i) => ({
        pts: g.pts,
        reb: g.reb,
        ast: g.ast,
        stl: g.stl,
        blk: g.blk,
        achieved: values[i] === 1
      }));
    } else {
      // Normal stat calculation
      values = playedGames.map(g => {
        if (Array.isArray(statField)) {
          // Combined stat (e.g., pts + ast)
          return statField.reduce((sum, f) => sum + (g[f] || 0), 0);
        }
        return g[statField] || 0;
      });

      overCount = values.filter(v => v > line).length;
      underCount = values.filter(v => v < line).length;
      pushCount = values.filter(v => v === line).length;
      hitRate = overCount / values.length;

      // Calculate average
      avg = values.reduce((a, b) => a + b, 0) / values.length;
    }

    // Calculate Home/Away splits
    const playerTeamId = player.team?.id;
    const homeGames = [];
    const awayGames = [];

    playedGames.forEach((g, i) => {
      const isHome = g.game.home_team_id === playerTeamId;
      if (isHome) {
        homeGames.push({ game: g, value: values[i] });
      } else {
        awayGames.push({ game: g, value: values[i] });
      }
    });

    const homeOverCount = homeGames.filter(h => h.value > line).length;
    const awayOverCount = awayGames.filter(a => a.value > line).length;
    const homeHitRate = homeGames.length > 0 ? homeOverCount / homeGames.length : 0;
    const awayHitRate = awayGames.length > 0 ? awayOverCount / awayGames.length : 0;

    // Calculate Last 5 vs Last 15 trend
    const last5Values = values.slice(0, Math.min(5, values.length));
    const last5OverCount = last5Values.filter(v => v > line).length;
    const last5HitRate = last5Values.length > 0 ? last5OverCount / last5Values.length : 0;

    // Determine trend: compare last 5 to overall
    let trend = 'stable';
    if (last5HitRate > hitRate + 0.1) trend = 'hot';
    else if (last5HitRate < hitRate - 0.1) trend = 'cold';

    // Calculate last 5 average
    const last5Avg = last5Values.length > 0
      ? last5Values.reduce((a, b) => a + b, 0) / last5Values.length
      : 0;

    return res.status(200).json({
      success: true,
      player: {
        id: player.id,
        name: `${player.first_name} ${player.last_name}`,
        team: player.team?.full_name,
        teamId: playerTeamId
      },
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
        overPct: (hitRate * 100).toFixed(1) + '%',
        underPct: ((1 - hitRate) * 100).toFixed(1) + '%'
      },
      // Home/Away splits
      splits: {
        home: {
          games: homeGames.length,
          overCount: homeOverCount,
          hitRate: homeHitRate,
          hitRatePct: (homeHitRate * 100).toFixed(0) + '%'
        },
        away: {
          games: awayGames.length,
          overCount: awayOverCount,
          hitRate: awayHitRate,
          hitRatePct: (awayHitRate * 100).toFixed(0) + '%'
        }
      },
      // Recent form
      recentForm: {
        last5: {
          games: last5Values.length,
          overCount: last5OverCount,
          hitRate: last5HitRate,
          hitRatePct: (last5HitRate * 100).toFixed(0) + '%',
          average: last5Avg.toFixed(1)
        },
        trend: trend,
        trendDescription: trend === 'hot' ? 'On fire lately' : trend === 'cold' ? 'Struggling recently' : 'Consistent form'
      },
      average: avg.toFixed(1),
      values,
      gameDetails: playedGames.map((g, i) => ({
        date: g.game.date,
        value: values[i],
        hit: values[i] > line ? 'OVER' : (values[i] < line ? 'UNDER' : 'PUSH'),
        isHome: g.game.home_team_id === playerTeamId
      }))
    });

  } catch (err) {
    console.error("[api/hitrate] Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Balldontlie API error"
    });
  }
}
