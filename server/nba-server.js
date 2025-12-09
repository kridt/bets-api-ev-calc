// server/nba-server.js
// Simple NBA stats server - no Firebase, no schedulers
// Just answers "how many times has X happened in the last N games?"

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const balldontlieService = require('./services/balldontlieService');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NBA Stats API' });
});

// Get available stat types
app.get('/api/nba/stat-types', (req, res) => {
  res.json({
    success: true,
    data: balldontlieService.getStatTypes()
  });
});

// Search player
app.get('/api/nba/player/search', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const players = await balldontlieService.searchPlayer(name);
    res.json({ success: true, count: players.length, data: players });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get player's last N games
app.get('/api/nba/player/stats', async (req, res) => {
  try {
    const { name, games = 10 } = req.query;
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const stats = await balldontlieService.getLastNGamesStats(name, parseInt(games));
    res.json({ success: true, ...stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// HIT RATE - "How many times has player gone over X in last N games?"
app.get('/api/nba/hit-rate', async (req, res) => {
  try {
    const { name, stat, line, games = 10 } = req.query;

    if (!name || !stat || line === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required: name, stat, line. Example: ?name=Giannis&stat=points&line=30.5&games=10'
      });
    }

    const result = await balldontlieService.calculateHitRate(name, stat, parseFloat(line), parseInt(games));

    // Simplified response
    res.json({
      success: true,
      player: result.player.name,
      team: result.player.team,
      stat: stat,
      line: parseFloat(line),
      gamesAnalyzed: result.gamesAnalyzed,
      timesOver: result.results.over,
      timesUnder: result.results.under,
      hitRateOver: result.hitRate.overPercentage,
      hitRateUnder: result.hitRate.underPercentage,
      fairOddsOver: result.fairOdds.over,
      fairOddsUnder: result.fairOdds.under,
      average: result.statistics.average,
      min: result.statistics.min,
      max: result.statistics.max,
      recentValues: result.values,
      games: result.gameDetails
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SEASON HIT RATE
app.get('/api/nba/season-hit-rate', async (req, res) => {
  try {
    const { name, stat, line, season } = req.query;

    if (!name || !stat || line === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required: name, stat, line'
      });
    }

    const result = await balldontlieService.calculateSeasonHitRate(name, stat, parseFloat(line), season ? parseInt(season) : null);

    res.json({
      success: true,
      player: result.player.name,
      season: result.season,
      stat: stat,
      line: parseFloat(line),
      gamesAnalyzed: result.gamesAnalyzed,
      timesOver: result.results.over,
      timesUnder: result.results.under,
      hitRateOver: result.hitRate.overPercentage,
      hitRateUnder: result.hitRate.underPercentage,
      fairOddsOver: result.fairOdds.over,
      fairOddsUnder: result.fairOdds.under,
      average: result.average
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// FULL PROP ANALYSIS with EV
app.get('/api/nba/analyze-prop', async (req, res) => {
  try {
    const { name, stat, line, odds, games = 15 } = req.query;

    if (!name || !stat || line === undefined || odds === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required: name, stat, line, odds. Example: ?name=Giannis&stat=points&line=30.5&odds=-110&games=15'
      });
    }

    const result = await balldontlieService.analyzePlayerProp(name, stat, parseFloat(line), odds, parseInt(games));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Calculate EV from probability and odds
app.post('/api/nba/calculate-ev', (req, res) => {
  try {
    const { probability, bookOdds } = req.body;
    if (probability === undefined || bookOdds === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Required: probability (0-1), bookOdds (American format like -110 or +150)'
      });
    }
    const ev = balldontlieService.calculateEV(parseFloat(probability), bookOdds);
    res.json({ success: true, ...ev });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n='.repeat(50));
  console.log('🏀 NBA STATS API SERVER');
  console.log('='.repeat(50));
  console.log(`Running on http://localhost:${PORT}`);
  console.log('\nEndpoints:');
  console.log('  GET /api/nba/hit-rate?name=Giannis&stat=points&line=30.5&games=10');
  console.log('  GET /api/nba/season-hit-rate?name=LeBron&stat=pra&line=45.5');
  console.log('  GET /api/nba/analyze-prop?name=Curry&stat=threes&line=4.5&odds=-110');
  console.log('  GET /api/nba/player/stats?name=LeBron&games=15');
  console.log('  GET /api/nba/player/search?name=James');
  console.log('  GET /api/nba/stat-types');
  console.log('='.repeat(50) + '\n');
});
