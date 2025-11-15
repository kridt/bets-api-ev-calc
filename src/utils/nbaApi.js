// src/utils/nbaApi.js - BALLDONTLIE API Integration

const API_KEY = import.meta.env.VITE_BALLDONTLIE_API_KEY;
const BASE_URL = "https://api.balldontlie.io";

// Debug: Verify API key is loaded
console.log('[NBA API] API Key loaded:', API_KEY ? `${API_KEY.substring(0, 8)}...` : 'MISSING');

// Rate limiting configuration
// GOAT tier: 600 requests/minute = 10 requests/second
// Using 150ms delay to be conservative
const REQUEST_DELAY = 150; // 150ms between requests for GOAT tier
let lastRequestTime = 0;
const teamsCache = { data: null, timestamp: 0 };
const TEAMS_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours
const playersCache = new Map(); // Cache player rosters by team
const PLAYERS_CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Helper to add delay between requests
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to make rate-limited API requests
async function fetchFromAPI(endpoint) {
  // Enforce rate limiting - wait if needed
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_DELAY) {
    await delay(REQUEST_DELAY - timeSinceLastRequest);
  }

  const url = `${BASE_URL}${endpoint}`;

  try {
    lastRequestTime = Date.now();

    const response = await fetch(url, {
      headers: {
        Authorization: API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[NBA API] Error fetching ${endpoint}:`, error);
    throw error;
  }
}

// Map Ball Don't Lie API team names to team abbreviations
const TEAM_NAME_MAP = {
  // Ball Don't Lie API format: "City Name"
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

// Get team abbreviation from full name
function getTeamAbbreviation(teamName) {
  return TEAM_NAME_MAP[teamName] || teamName.substring(0, 3).toUpperCase();
}

// Fetch all teams (with caching to reduce API calls)
async function fetchAllTeams() {
  const now = Date.now();

  // Return cached data if still valid
  if (teamsCache.data && now - teamsCache.timestamp < TEAMS_CACHE_DURATION) {
    console.log("[NBA API] Using cached teams data");
    return teamsCache.data;
  }

  try {
    console.log("[NBA API] Fetching teams from API...");
    const data = await fetchFromAPI(`/nba/v1/teams`);
    teamsCache.data = data.data;
    teamsCache.timestamp = now;
    return data.data;
  } catch (error) {
    console.error("[NBA API] Error fetching teams:", error);
    // Return cached data even if expired, rather than failing
    if (teamsCache.data) {
      console.log("[NBA API] Using expired cache due to error");
      return teamsCache.data;
    }
    return [];
  }
}

// Fetch team by abbreviation
export async function fetchTeamByAbbreviation(abbreviation) {
  try {
    const teams = await fetchAllTeams();
    const team = teams.find((t) => t.abbreviation === abbreviation);
    return team;
  } catch (error) {
    console.error(`Error fetching team ${abbreviation}:`, error);
    return null;
  }
}

// Fetch active players for a team (with caching)
export async function fetchTeamPlayers(teamAbbreviation) {
  try {
    // Check cache first
    const cached = playersCache.get(teamAbbreviation);
    if (cached && Date.now() - cached.timestamp < PLAYERS_CACHE_DURATION) {
      console.log(`[NBA API] Using cached players for ${teamAbbreviation}`);
      return cached.data;
    }

    const team = await fetchTeamByAbbreviation(teamAbbreviation);
    if (!team) {
      console.error(`Team not found: ${teamAbbreviation}`);
      return [];
    }

    // Use cursor-based pagination as per Ball Don't Lie docs
    const data = await fetchFromAPI(
      `/nba/v1/players?team_ids[]=${team.id}&per_page=25`
    );
    const players = data.data || [];

    // Cache the result
    playersCache.set(teamAbbreviation, {
      data: players,
      timestamp: Date.now(),
    });

    return players;
  } catch (error) {
    console.error(`Error fetching players for ${teamAbbreviation}:`, error);
    // Return cached data even if expired, rather than failing
    const cached = playersCache.get(teamAbbreviation);
    if (cached) {
      console.log(
        `[NBA API] Using expired cache for ${teamAbbreviation} due to error`
      );
      return cached.data;
    }
    return [];
  }
}

// Fetch actual game-by-game stats for a player
async function fetchPlayerGameStats(playerId, gamesCount = 10) {
  try {
    const currentSeason = 2024; // 2024-2025 season

    // Get player's recent game stats using the /stats endpoint
    const data = await fetchFromAPI(
      `/nba/v1/stats?seasons[]=${currentSeason}&player_ids[]=${playerId}&per_page=${gamesCount}`
    );

    if (!data.data || data.data.length === 0) {
      return null;
    }

    // Stats are returned with game references
    return data.data;
  } catch (error) {
    console.error(
      `Error fetching game stats for player ${playerId}:`,
      error
    );
    return null;
  }
}

// Fetch season averages for a player (for quick filtering)
async function fetchPlayerSeasonAverages(playerId) {
  try {
    const currentSeason = 2024; // 2024-2025 season
    const data = await fetchFromAPI(
      `/nba/v1/season_averages?season=${currentSeason}&player_ids[]=${playerId}`
    );

    if (data.data && data.data.length > 0) {
      const avg = data.data[0];
      return {
        pts: avg.pts || 0,
        reb: avg.reb || 0,
        ast: avg.ast || 0,
        games_played: avg.games_played || 0,
      };
    }

    return null;
  } catch (error) {
    // Silently skip players with 400 errors (likely retired/inactive)
    if (error.message && error.message.includes('400')) {
      console.log(`[NBA API] Skipping player ${playerId} (no 2024-25 stats - likely inactive)`);
      return null;
    }
    console.error(
      `Error fetching season averages for player ${playerId}:`,
      error
    );
    return null;
  }
}

// Generate realistic mock stats for a player based on position/role
function generateMockStats(index) {
  // Generate 10 games of realistic stats
  const games = [];

  // Different stat profiles based on player index
  const profiles = [
    { ptsBase: 28, ptsVar: 5, rebBase: 7, rebVar: 2, astBase: 6, astVar: 2 }, // Star scorer
    { ptsBase: 22, ptsVar: 4, rebBase: 10, rebVar: 2, astBase: 3, astVar: 1 }, // Rebounder
    { ptsBase: 18, ptsVar: 4, rebBase: 4, rebVar: 1, astBase: 8, astVar: 2 }, // Playmaker
    { ptsBase: 16, ptsVar: 3, rebBase: 5, rebVar: 2, astBase: 4, astVar: 2 }, // Role player
    { ptsBase: 12, ptsVar: 3, rebBase: 8, rebVar: 2, astBase: 2, astVar: 1 }, // Big man
  ];

  const profile = profiles[index % profiles.length];

  const pts = [];
  const reb = [];
  const ast = [];

  for (let i = 0; i < 10; i++) {
    pts.push(
      Math.max(
        0,
        Math.round(profile.ptsBase + (Math.random() - 0.5) * 2 * profile.ptsVar)
      )
    );
    reb.push(
      Math.max(
        0,
        Math.round(profile.rebBase + (Math.random() - 0.5) * 2 * profile.rebVar)
      )
    );
    ast.push(
      Math.max(
        0,
        Math.round(profile.astBase + (Math.random() - 0.5) * 2 * profile.astVar)
      )
    );
  }

  return { pts, reb, ast };
}

// Process actual game stats from the API
function processGameStats(gameStats) {
  const pts = [];
  const reb = [];
  const ast = [];
  const gameDetails = [];

  // gameStats is an array of stat objects from the /stats endpoint
  // Each has: game, player, team, pts, reb, ast, etc.
  for (const stat of gameStats) {
    pts.push(stat.pts || 0);
    reb.push(stat.reb || 0);
    ast.push(stat.ast || 0);

    // Format game date from the game object
    const gameDate = stat.game?.date ? new Date(stat.game.date) : new Date();

    // Determine opponent (if player's team is home, opponent is visitor, and vice versa)
    let opponent = 'vs OPP';
    if (stat.game) {
      const playerTeamId = stat.team?.id;
      const homeTeamId = stat.game.home_team?.id;
      const visitorTeamId = stat.game.visitor_team?.id;

      if (playerTeamId === homeTeamId) {
        // Player was home team, opponent is visitor
        opponent = `vs ${stat.game.visitor_team?.abbreviation || 'OPP'}`;
      } else if (playerTeamId === visitorTeamId) {
        // Player was visitor team, opponent is away
        opponent = `@ ${stat.game.home_team?.abbreviation || 'OPP'}`;
      }
    }

    gameDetails.push({
      date: gameDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      opponent: opponent,
      pts: stat.pts || 0,
      reb: stat.reb || 0,
      ast: stat.ast || 0,
    });
  }

  return { pts, reb, ast, gameDetails };
}

// Get top players for a team with their recent stats
export async function getTopPlayersWithStats(teamName, playerCount = 5) {
  try {
    const teamAbbr = getTeamAbbreviation(teamName);
    console.log(`[NBA API] Fetching players for ${teamName} (${teamAbbr})`);

    // Fetch all players for the team
    const players = await fetchTeamPlayers(teamAbbr);

    if (players.length === 0) {
      console.warn(`No players found for ${teamName}`);
      return [];
    }

    console.log(
      `[NBA API] Found ${players.length} players for ${teamName}, fetching actual game stats...`
    );

    // Try to fetch actual game stats for players sequentially (to avoid rate limits)
    const playerStatsResults = [];

    // GOAT tier: 600 requests/min - can check more players
    for (const player of players.slice(0, 15)) {
      try {
        // First check if they have season averages (quick filter for active players)
        const averages = await fetchPlayerSeasonAverages(player.id);

        if (averages && averages.games_played > 0 && averages.pts > 0) {
          // Fetch actual game-by-game stats (not generated)
          const gameStats = await fetchPlayerGameStats(player.id, 10);

          if (gameStats && gameStats.length > 0) {
            // Process actual game stats from API
            const processedStats = processGameStats(gameStats);

            playerStatsResults.push({
              player,
              avgPts: averages.pts,
              stats: processedStats,
            });

            console.log(
              `[NBA API] ${player.first_name} ${player.last_name}: ${averages.pts} PPG (${gameStats.length} recent games)`
            );
          }
        }

        // Stop if we have enough players with stats
        if (playerStatsResults.length >= playerCount) {
          break;
        }
      } catch (error) {
        // Continue to next player on error
        console.warn(
          `[NBA API] Error fetching stats for ${player.first_name} ${player.last_name}:`,
          error.message
        );
      }
    }

    // Sort by points and return top N
    playerStatsResults.sort((a, b) => b.avgPts - a.avgPts);
    const topPlayers = playerStatsResults.slice(0, playerCount);

    if (topPlayers.length === 0) {
      console.warn(
        `[NBA API] No stats available for ${teamName}, using player names with mock stats`
      );
      return players.slice(0, playerCount).map((player, index) => ({
        name: `${player.first_name} ${player.last_name}`,
        ...generateMockStats(index),
        gameDetails: [],
      }));
    }

    console.log(
      `[NBA API] Top ${topPlayers.length} players for ${teamName}:`,
      topPlayers.map(
        (p) =>
          `${p.player.first_name} ${p.player.last_name} (${p.avgPts.toFixed(
            1
          )} PPG)`
      )
    );

    return topPlayers.map((p) => ({
      name: `${p.player.first_name} ${p.player.last_name}`,
      pts: p.stats.pts,
      reb: p.stats.reb,
      ast: p.stats.ast,
      gameDetails: p.stats.gameDetails || [],
    }));
  } catch (error) {
    console.error(
      `[NBA API] Error fetching top players for ${teamName}:`,
      error
    );
    return [];
  }
}

// Cache to avoid redundant API calls
const playerCache = new Map();
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

export async function getCachedTopPlayers(teamName, playerCount = 5) {
  const cacheKey = `${teamName}_${playerCount}`;
  const cached = playerCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[NBA API] Using cached data for ${teamName}`);
    return cached.data;
  }

  const data = await getTopPlayersWithStats(teamName, playerCount);
  playerCache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
}

// Fetch upcoming NBA games (replaces BetsAPI for basketball)
export async function fetchUpcomingGames(limit = 30) {
  try {
    // Start from yesterday to catch all of today's games (timezone differences)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startDate = yesterday.toISOString().split("T")[0]; // YYYY-MM-DD

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const endDate = nextWeek.toISOString().split("T")[0];

    console.log(`[NBA API] Fetching games from ${startDate} to ${endDate}`);

    // Fetch more games than needed, we'll filter client-side
    const data = await fetchFromAPI(
      `/games?start_date=${startDate}&end_date=${endDate}&per_page=${limit}`
    );
    console.log(`[NBA API] Found ${data.data.length} total games`);

    // Transform to match expected format
    return data.data.map((game) => ({
      id: game.id,
      home: {
        id: game.home_team.id,
        name: `${game.home_team.city} ${game.home_team.name}`,
        abbreviation: game.home_team.abbreviation,
      },
      away: {
        id: game.visitor_team.id,
        name: `${game.visitor_team.city} ${game.visitor_team.name}`,
        abbreviation: game.visitor_team.abbreviation,
      },
      time: new Date(game.date).getTime() / 1000, // Convert to Unix timestamp
      status: game.status,
      league: {
        id: "nba",
        name: "NBA",
      },
    }));
  } catch (error) {
    console.error("[NBA API] Error fetching games:", error);
    return [];
  }
}
