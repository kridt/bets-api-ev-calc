// Vercel Serverless Function - Player Stats via API-Football
// Keeps API key secure on server-side

// Major European leagues
const MAJOR_LEAGUES = [
  39,   // Premier League
  140,  // La Liga
  78,   // Bundesliga
  135,  // Serie A
  61,   // Ligue 1
  88,   // Eredivisie
  94,   // Liga Portugal
  179,  // Scottish Premiership
  40,   // Championship
  2,    // Champions League
  3,    // Europa League
];

// Current season (2025/2026)
const CURRENT_SEASON = 2025;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const API_KEY = process.env.RAPIDAPI_FOOTBALL_KEY;
  const BASE_URL = 'https://v3.football.api-sports.io';

  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'API key not configured'
    });
  }

  const { action, query, playerId, teamId, league, season = CURRENT_SEASON } = req.query;

  // Helper to fetch from API
  const fetchAPI = async (endpoint, params) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    const response = await fetch(url.toString(), {
      headers: { 'x-apisports-key': API_KEY }
    });
    return response.json();
  };

  try {
    if (action === 'search') {
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query required' });
      }

      // Clean up query
      let searchQuery = query.trim();

      // Skip if it's not a real player name
      if (searchQuery.toLowerCase().startsWith('line ') ||
          searchQuery.toLowerCase() === 'over' ||
          searchQuery.toLowerCase() === 'under') {
        return res.json({ success: true, players: [], message: 'Not a player name' });
      }

      // API requires minimum 4 characters
      if (searchQuery.length < 4) {
        return res.json({
          success: true,
          players: [],
          message: `Search term "${searchQuery}" is too short (min 4 chars)`
        });
      }

      // If league is specified, use it; otherwise search across major leagues
      let allPlayers = [];
      const leaguesToSearch = league ? [parseInt(league)] : MAJOR_LEAGUES.slice(0, 5); // Top 5 leagues

      for (const leagueId of leaguesToSearch) {
        const data = await fetchAPI('/players', {
          search: searchQuery,
          league: leagueId,
          season
        });

        if (data.response && data.response.length > 0) {
          const players = data.response.map(p => {
            const stats = p.statistics?.[0];
            return {
              id: p.player.id,
              name: p.player.name,
              photo: p.player.photo,
              team: stats?.team?.name || 'Unknown',
              teamLogo: stats?.team?.logo,
              position: stats?.games?.position || 'Unknown',
              appearances: stats?.games?.appearences || 0,
              goals: stats?.goals?.total || 0,
              assists: stats?.goals?.assists || 0,
              rating: stats?.games?.rating || null,
              league: stats?.league?.name || 'Unknown'
            };
          });
          allPlayers.push(...players);
        }

        // Stop if we found enough players
        if (allPlayers.length >= 10) break;
      }

      // Remove duplicates by player ID
      const uniquePlayers = [...new Map(allPlayers.map(p => [p.id, p])).values()].slice(0, 10);

      // If still no results and query has spaces, try with just the last name
      if (uniquePlayers.length === 0 && searchQuery.includes(' ')) {
        const lastName = searchQuery.split(' ').pop();
        if (lastName.length >= 4) {
          for (const leagueId of leaguesToSearch.slice(0, 3)) {
            const data = await fetchAPI('/players', {
              search: lastName,
              league: leagueId,
              season
            });

            if (data.response && data.response.length > 0) {
              const players = data.response.map(p => {
                const stats = p.statistics?.[0];
                return {
                  id: p.player.id,
                  name: p.player.name,
                  photo: p.player.photo,
                  team: stats?.team?.name || 'Unknown',
                  teamLogo: stats?.team?.logo,
                  position: stats?.games?.position || 'Unknown',
                  appearances: stats?.games?.appearences || 0,
                  goals: stats?.goals?.total || 0,
                  assists: stats?.goals?.assists || 0,
                  rating: stats?.games?.rating || null,
                  league: stats?.league?.name || 'Unknown'
                };
              });
              uniquePlayers.push(...players);
            }
            if (uniquePlayers.length >= 10) break;
          }
        }
      }

      return res.json({
        success: true,
        players: [...new Map(uniquePlayers.map(p => [p.id, p])).values()].slice(0, 10)
      });
    }

    if (action === 'player') {
      if (!playerId) {
        return res.status(400).json({ success: false, error: 'Player ID required' });
      }

      const data = await fetchAPI('/players', { id: playerId, season });

      if (data.errors && Object.keys(data.errors).length > 0) {
        return res.status(400).json({
          success: false,
          error: Object.values(data.errors).join(', ')
        });
      }

      const playerData = data.response?.[0];
      if (!playerData) {
        return res.status(404).json({ success: false, error: 'Player not found' });
      }

      const player = playerData.player;
      const stats = playerData.statistics || [];

      // Get the primary team (first in stats, usually main league)
      const primaryTeam = stats[0]?.team || null;

      // Aggregate stats across all competitions
      const totals = stats.reduce((acc, s) => ({
        appearances: acc.appearances + (s.games?.appearences || 0),
        minutes: acc.minutes + (s.games?.minutes || 0),
        goals: acc.goals + (s.goals?.total || 0),
        assists: acc.assists + (s.goals?.assists || 0),
        yellowCards: acc.yellowCards + (s.cards?.yellow || 0),
        redCards: acc.redCards + (s.cards?.red || 0),
        shots: acc.shots + (s.shots?.total || 0),
        shotsOnTarget: acc.shotsOnTarget + (s.shots?.on || 0),
        tackles: acc.tackles + (s.tackles?.total || 0),
        fouls: acc.fouls + (s.fouls?.committed || 0),
      }), {
        appearances: 0, minutes: 0, goals: 0, assists: 0,
        yellowCards: 0, redCards: 0, shots: 0, shotsOnTarget: 0,
        tackles: 0, fouls: 0
      });

      const gamesPlayed = totals.appearances;
      const averages = gamesPlayed > 0 ? {
        goalsPerGame: (totals.goals / gamesPlayed).toFixed(2),
        assistsPerGame: (totals.assists / gamesPlayed).toFixed(2),
        shotsPerGame: (totals.shots / gamesPlayed).toFixed(2),
        shotsOnTargetPerGame: (totals.shotsOnTarget / gamesPlayed).toFixed(2),
        tacklesPerGame: (totals.tackles / gamesPlayed).toFixed(2),
        foulsPerGame: (totals.fouls / gamesPlayed).toFixed(2),
        minutesPerGame: Math.round(totals.minutes / gamesPlayed),
      } : null;

      return res.json({
        success: true,
        player: {
          id: player.id,
          name: player.name,
          photo: player.photo,
          age: player.age,
          nationality: player.nationality,
          height: player.height,
          weight: player.weight,
        },
        team: primaryTeam ? {
          id: primaryTeam.id,
          name: primaryTeam.name,
          logo: primaryTeam.logo
        } : null,
        season,
        totals,
        averages,
        byCompetition: stats.map(s => ({
          league: s.league?.name,
          team: s.team?.name,
          teamId: s.team?.id,
          appearances: s.games?.appearences || 0,
          goals: s.goals?.total || 0,
          assists: s.goals?.assists || 0,
          shots: s.shots?.total || 0,
          tackles: s.tackles?.total || 0,
          rating: s.games?.rating
        }))
      });
    }

    // Get last 10 matches for a team with player participation
    if (action === 'recent-matches') {
      if (!playerId || !teamId) {
        return res.status(400).json({
          success: false,
          error: 'Player ID and Team ID required'
        });
      }

      // Get last 10 finished fixtures for the team
      const fixturesData = await fetchAPI('/fixtures', {
        team: teamId,
        last: 10,
        status: 'FT' // Finished matches only
      });

      if (fixturesData.errors && Object.keys(fixturesData.errors).length > 0) {
        return res.status(400).json({
          success: false,
          error: Object.values(fixturesData.errors).join(', ')
        });
      }

      const fixtures = fixturesData.response || [];

      // For each fixture, get player stats
      const matchesWithPlayerStats = await Promise.all(
        fixtures.map(async (fixture) => {
          try {
            const fixturePlayersData = await fetchAPI('/fixtures/players', {
              fixture: fixture.fixture.id
            });

            // Find the player in this fixture
            let playerStats = null;
            let played = false;

            if (fixturePlayersData.response) {
              for (const team of fixturePlayersData.response) {
                const foundPlayer = team.players?.find(p => p.player.id === parseInt(playerId));
                if (foundPlayer) {
                  played = foundPlayer.statistics?.[0]?.games?.minutes > 0;
                  playerStats = {
                    minutes: foundPlayer.statistics?.[0]?.games?.minutes || 0,
                    rating: foundPlayer.statistics?.[0]?.games?.rating || null,
                    goals: foundPlayer.statistics?.[0]?.goals?.total || 0,
                    assists: foundPlayer.statistics?.[0]?.goals?.assists || 0,
                    shots: foundPlayer.statistics?.[0]?.shots?.total || 0,
                    shotsOnTarget: foundPlayer.statistics?.[0]?.shots?.on || 0,
                    tackles: foundPlayer.statistics?.[0]?.tackles?.total || 0,
                    fouls: foundPlayer.statistics?.[0]?.fouls?.committed || 0,
                    yellowCard: foundPlayer.statistics?.[0]?.cards?.yellow || 0,
                    redCard: foundPlayer.statistics?.[0]?.cards?.red || 0,
                  };
                  break;
                }
              }
            }

            return {
              fixtureId: fixture.fixture.id,
              date: fixture.fixture.date,
              homeTeam: fixture.teams.home.name,
              homeLogo: fixture.teams.home.logo,
              awayTeam: fixture.teams.away.name,
              awayLogo: fixture.teams.away.logo,
              homeScore: fixture.goals.home,
              awayScore: fixture.goals.away,
              league: fixture.league.name,
              played,
              playerStats
            };
          } catch (err) {
            console.error(`Error fetching fixture ${fixture.fixture.id}:`, err);
            return {
              fixtureId: fixture.fixture.id,
              date: fixture.fixture.date,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              homeScore: fixture.goals.home,
              awayScore: fixture.goals.away,
              league: fixture.league.name,
              played: false,
              playerStats: null,
              error: true
            };
          }
        })
      );

      // Sort by date descending (most recent first)
      matchesWithPlayerStats.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Calculate summary
      const playedMatches = matchesWithPlayerStats.filter(m => m.played);
      const summary = {
        totalMatches: matchesWithPlayerStats.length,
        matchesPlayed: playedMatches.length,
        totalGoals: playedMatches.reduce((sum, m) => sum + (m.playerStats?.goals || 0), 0),
        totalAssists: playedMatches.reduce((sum, m) => sum + (m.playerStats?.assists || 0), 0),
        totalShots: playedMatches.reduce((sum, m) => sum + (m.playerStats?.shots || 0), 0),
        totalShotsOnTarget: playedMatches.reduce((sum, m) => sum + (m.playerStats?.shotsOnTarget || 0), 0),
        avgMinutes: playedMatches.length > 0
          ? Math.round(playedMatches.reduce((sum, m) => sum + (m.playerStats?.minutes || 0), 0) / playedMatches.length)
          : 0,
        avgRating: playedMatches.length > 0 && playedMatches.some(m => m.playerStats?.rating)
          ? (playedMatches.reduce((sum, m) => sum + (parseFloat(m.playerStats?.rating) || 0), 0) / playedMatches.filter(m => m.playerStats?.rating).length).toFixed(2)
          : null
      };

      return res.json({
        success: true,
        matches: matchesWithPlayerStats,
        summary
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid action. Use: search, player, recent-matches'
    });

  } catch (error) {
    console.error('API Football error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
