// vite-plugin-api.js
import { loadEnv } from 'vite';

// Balldontlie API config
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

  // Special: double_double and triple_double
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

const ALLOWED = new Set([
  "/v1/events/upcoming",
  "/v1/event/view",
  "/v1/event/history",
  "/v1/event/stats_trend",
  "/v1/league",
]);

// LSports credentials
const LSPORTS_CREDS = {
  PackageId: 3454,
  UserName: 'chrnielsen2003@gmail.com',
  Password: 'Christian2025!'
};

export default function apiPlugin() {
  let token;

  return {
    name: 'api-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), '');
      token = env.BETSAPI_TOKEN;
    },
    configureServer(server) {
      // Handle Balldontlie API requests for hit rate
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/hitrate")) {
          return next();
        }

        try {
          const url = new URL(req.url, "http://localhost");
          const playerName = url.searchParams.get("player");
          const statType = url.searchParams.get("stat");
          const line = parseFloat(url.searchParams.get("line"));
          const numGames = parseInt(url.searchParams.get("games")) || 10;

          if (!playerName || !statType || isNaN(line)) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ success: false, error: "Missing player, stat, or line parameter" }));
            return;
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
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ success: false, error: `Player "${playerName}" not found` }));
            return;
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

          // Get current NBA season (season is labeled by start year, e.g., 2024-25 season = "2024")
          // Try current season first, then previous if no data
          const currentYear = new Date().getFullYear();
          const month = new Date().getMonth();
          // NBA season runs Oct-June. If Oct-Dec, we're in the first half of the new season
          // The season is named after the year it starts (Oct 2024 - June 2025 = "2024")
          const primarySeason = month >= 9 ? currentYear : currentYear - 1;
          const fallbackSeason = primarySeason - 1;

          // Helper function to filter to actually played games
          const filterPlayedGames = (data) => {
            if (!data || !Array.isArray(data)) return [];
            return data.filter(s => s.min && s.min !== '00:00' && parseInt(s.min) > 0);
          };

          // Try primary season first
          console.log(`[HitRate] Fetching stats for player ${playerId}, trying season ${primarySeason} first, fallback ${fallbackSeason}`);
          let statsRes = await fetch(`${BALLDONTLIE_BASE}/stats?player_ids[]=${playerId}&seasons[]=${primarySeason}&per_page=${numGames + 10}`, {
            headers: { 'Authorization': BALLDONTLIE_API_KEY }
          });
          let statsData = await statsRes.json();
          let playedGamesRaw = filterPlayedGames(statsData.data);
          console.log(`[HitRate] Season ${primarySeason} returned ${statsData.data?.length || 0} games, ${playedGamesRaw.length} actually played`);

          // If no PLAYED games, try fallback season (primary might have future/unplayed games)
          if (playedGamesRaw.length === 0) {
            console.log(`[HitRate] No played games in ${primarySeason}, trying fallback season ${fallbackSeason}`);
            statsRes = await fetch(`${BALLDONTLIE_BASE}/stats?player_ids[]=${playerId}&seasons[]=${fallbackSeason}&per_page=${numGames + 10}`, {
              headers: { 'Authorization': BALLDONTLIE_API_KEY }
            });
            statsData = await statsRes.json();
            playedGamesRaw = filterPlayedGames(statsData.data);
            console.log(`[HitRate] Season ${fallbackSeason} returned ${statsData.data?.length || 0} games, ${playedGamesRaw.length} actually played`);
          }

          if (playedGamesRaw.length === 0) {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ success: false, error: "No stats found for player in current or last season" }));
            return;
          }

          // Sort by date (most recent first) and take requested number of games
          const playedGames = playedGamesRaw
            .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
            .slice(0, numGames);

          // Calculate stat value for each game
          const statField = STAT_MAP[statType.toLowerCase()];
          if (!statField) {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ success: false, error: `Unknown stat type: ${statType}` }));
            return;
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
            overCount = values.filter(v => v === 1).length;
            underCount = values.filter(v => v === 0).length;
            pushCount = 0;
            hitRate = overCount / values.length;
            avg = hitRate;
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

          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
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
              trend: trend, // 'hot', 'cold', 'stable'
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
          }));

        } catch (err) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ success: false, error: err?.message || "Balldontlie API error" }));
        }
      });

      // Handle LSports API requests
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/lsports")) {
          return next();
        }

        try {
          const url = new URL(req.url, "http://localhost");

          // /api/lsports/fixtures - Get fixtures
          if (url.pathname === "/api/lsports/fixtures") {
            const leagueId = url.searchParams.get("leagueId");
            const body = { ...LSPORTS_CREDS };

            const response = await fetch('https://stm-snapshot.lsports.eu/PreMatch/GetFixtures', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            const data = await response.json();
            // Body is a flat array of fixtures
            const eventList = data?.Body || [];

            let fixtures = eventList.map(e => {
              const fixture = e.Fixture || e;
              const participants = fixture.Participants || [];
              const partList = Array.isArray(participants) ? participants : [participants];
              return {
                fixtureId: e.FixtureId,
                sport: fixture.Sport?.Name,
                league: fixture.League?.Name,
                leagueId: fixture.League?.Id,
                startDate: fixture.StartDate,
                home: partList.find(p => p.Position === "1" || p.Position === 1)?.Name,
                away: partList.find(p => p.Position === "2" || p.Position === 2)?.Name,
              };
            }).filter(f => f.fixtureId);

            // Filter by league if specified
            if (leagueId) {
              fixtures = fixtures.filter(f => f.leagueId === parseInt(leagueId));
            }

            // Sort by date
            fixtures.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ success: true, fixtures: fixtures.slice(0, 50) }));
            return;
          }

          // /api/lsports/markets - Get markets for fixtures
          if (url.pathname === "/api/lsports/markets") {
            const leagueId = url.searchParams.get("leagueId") || "67";
            const fixtureId = url.searchParams.get("fixtureId");

            const body = { ...LSPORTS_CREDS, Leagues: [parseInt(leagueId)] };

            const response = await fetch('https://stm-snapshot.lsports.eu/PreMatch/GetFixtureMarkets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            const data = await response.json();
            const events = data?.Body || [];

            // Find specific fixture if requested
            let targetEvent = fixtureId
              ? events.find(e => e.FixtureId === parseInt(fixtureId))
              : events[0];

            if (!targetEvent) {
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ success: false, error: "Fixture not found" }));
              return;
            }

            // Parse markets
            const markets = (targetEvent.Markets || []).map(m => ({
              marketId: m.Id,
              marketName: m.Name,
              mainLine: m.MainLine,
              bets: [
                ...(m.Bets || []).map(b => ({
                  name: b.Name,
                  price: parseFloat(b.Price),
                  line: b.Line,
                  providerId: b.ProviderBetId,
                  status: b.Status,
                })),
                ...(m.ProviderMarkets || []).flatMap(pm =>
                  (pm.Bets || []).map(b => ({
                    name: b.Name,
                    price: parseFloat(b.Price),
                    line: b.Line,
                    providerId: pm.Id,
                    providerName: pm.Name,
                    status: b.Status,
                  }))
                ),
              ],
            }));

            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
              success: true,
              fixtureId: targetEvent.FixtureId,
              markets,
            }));
            return;
          }

          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ success: false, error: "Unknown LSports endpoint" }));

        } catch (err) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ success: false, error: err?.message || "LSports API error" }));
        }
      });

      // Handle BetsAPI requests
      server.middlewares.use(async (req, res, next) => {
        // Only handle /api/bets requests
        if (!req.url || !req.url.startsWith("/api/bets")) {
          return next();
        }

        try {
          const url = new URL(req.url, "http://localhost");
          const path = url.searchParams.get("path") || "";

          // Health check
          if (path === "/health") {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, hasToken: Boolean(token) }));
            return;
          }

          if (!token) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
              success: 0,
              error: "Missing BETSAPI_TOKEN in .env.local",
            }));
            return;
          }

          if (!ALLOWED.has(path)) {
            res.statusCode = 403;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
              success: 0,
              error: "Endpoint not allowed in dev",
              path,
            }));
            return;
          }

          // Build upstream URL
          const upstream = new URL(`https://api.b365api.com${path}`);
          upstream.searchParams.set("token", token);
          for (const [k, v] of url.searchParams.entries()) {
            if (k === "path") continue;
            if (v != null && v !== "") upstream.searchParams.set(k, v);
          }

          const upstreamResp = await fetch(upstream.toString(), {
            headers: { "user-agent": "vite-dev-proxy/1.0" },
          });

          const ct = upstreamResp.headers.get("content-type") || "application/json";
          const text = await upstreamResp.text();

          res.statusCode = upstreamResp.status;
          res.setHeader("content-type", ct.includes("application/json") ? ct : "application/json");

          if (!ct.includes("application/json")) {
            res.end(JSON.stringify({
              success: 0,
              error: "Upstream non-JSON",
              status: upstreamResp.status,
              preview: text.slice(0, 200),
            }));
            return;
          }

          res.end(text);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({
            success: 0,
            error: err?.message || "Dev proxy error",
          }));
        }
      });
    },
  };
}
