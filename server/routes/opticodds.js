// server/routes/opticodds.js
// Proxy routes for OpticOdds API to avoid CORS issues

const express = require('express');
const router = express.Router();

const OPTIC_API_KEY = process.env.OPTIC_ODDS_API_KEY;
const OPTIC_API_BASE = 'https://api.opticodds.com/api/v3';

// Check if API key is configured
if (!OPTIC_API_KEY) {
  console.warn('[OpticOdds] Warning: OPTIC_ODDS_API_KEY environment variable not set');
}

// Proxy endpoint for fixtures
// GET /api/opticodds/fixtures?sport=soccer&league=england_-_premier_league&status=unplayed
router.get('/fixtures', async (req, res) => {
  try {
    const { sport, league, status } = req.query;

    const url = new URL(`${OPTIC_API_BASE}/fixtures`);
    if (sport) url.searchParams.set('sport', sport);
    if (league) url.searchParams.set('league', league);
    if (status) url.searchParams.set('status', status);

    console.log(`[OpticOdds Proxy] Fetching fixtures: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': OPTIC_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`[OpticOdds Proxy] API error: ${response.status}`);
      return res.status(response.status).json({ error: `OpticOdds API error: ${response.status}` });
    }

    const data = await response.json();
    console.log(`[OpticOdds Proxy] Got ${data.data?.length || 0} fixtures`);
    res.json(data);
  } catch (err) {
    console.error('[OpticOdds Proxy] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint for fixture odds
// GET /api/opticodds/fixtures/odds?fixture_id=XXX&sportsbook=pinnacle&sportsbook=draftkings
// Note: OpticOdds API only allows 5 sportsbooks per request, so we batch automatically
router.get('/fixtures/odds', async (req, res) => {
  try {
    const { fixture_id, sportsbook } = req.query;

    if (!fixture_id) {
      return res.status(400).json({ error: 'fixture_id is required' });
    }

    // Handle multiple sportsbooks (can be string or array)
    const sportsbooks = Array.isArray(sportsbook) ? sportsbook : (sportsbook ? [sportsbook] : []);

    // OpticOdds API allows max 5 sportsbooks per request
    const MAX_BOOKS_PER_REQUEST = 5;
    const batches = [];
    for (let i = 0; i < sportsbooks.length; i += MAX_BOOKS_PER_REQUEST) {
      batches.push(sportsbooks.slice(i, i + MAX_BOOKS_PER_REQUEST));
    }

    console.log(`[OpticOdds Proxy] Fetching odds for fixture ${fixture_id} (${sportsbooks.length} books in ${batches.length} batches)`);

    // If no sportsbooks specified or only one batch, do single request
    if (batches.length <= 1) {
      const url = new URL(`${OPTIC_API_BASE}/fixtures/odds`);
      url.searchParams.set('fixture_id', fixture_id);
      for (const book of sportsbooks) {
        url.searchParams.append('sportsbook', book);
      }

      const response = await fetch(url.toString(), {
        headers: { 'x-api-key': OPTIC_API_KEY },
      });

      if (!response.ok) {
        console.error(`[OpticOdds Proxy] API error: ${response.status}`);
        return res.status(response.status).json({ error: `OpticOdds API error: ${response.status}` });
      }

      const data = await response.json();
      const oddsCount = data.data?.[0]?.odds?.length || 0;
      console.log(`[OpticOdds Proxy] Got ${oddsCount} odds for fixture ${fixture_id}`);
      return res.json(data);
    }

    // Multiple batches - fetch all in parallel and merge
    const fetchBatch = async (booksBatch) => {
      const url = new URL(`${OPTIC_API_BASE}/fixtures/odds`);
      url.searchParams.set('fixture_id', fixture_id);
      for (const book of booksBatch) {
        url.searchParams.append('sportsbook', book);
      }

      const response = await fetch(url.toString(), {
        headers: { 'x-api-key': OPTIC_API_KEY },
      });

      if (!response.ok) {
        console.warn(`[OpticOdds Proxy] Batch error: ${response.status} for books: ${booksBatch.join(', ')}`);
        return null;
      }

      return response.json();
    };

    // Fetch all batches in parallel
    const results = await Promise.all(batches.map(fetchBatch));

    // Merge results - combine odds from all batches
    let mergedData = null;
    let totalOdds = [];

    for (const result of results) {
      if (!result || !result.data || !result.data[0]) continue;

      if (!mergedData) {
        // Use first result as base
        mergedData = result;
        totalOdds = result.data[0].odds || [];
      } else {
        // Merge odds from subsequent results
        const newOdds = result.data[0].odds || [];
        totalOdds = totalOdds.concat(newOdds);
      }
    }

    if (!mergedData) {
      console.error(`[OpticOdds Proxy] All batches failed for fixture ${fixture_id}`);
      return res.status(400).json({ error: 'Failed to fetch odds from all batches' });
    }

    // Update merged data with combined odds
    mergedData.data[0].odds = totalOdds;

    console.log(`[OpticOdds Proxy] Got ${totalOdds.length} total odds for fixture ${fixture_id} (merged from ${batches.length} batches)`);
    res.json(mergedData);
  } catch (err) {
    console.error('[OpticOdds Proxy] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint for sports
router.get('/sports', async (req, res) => {
  try {
    const response = await fetch(`${OPTIC_API_BASE}/sports`, {
      headers: { 'x-api-key': OPTIC_API_KEY },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint for leagues
router.get('/leagues', async (req, res) => {
  try {
    const { sport } = req.query;
    const url = new URL(`${OPTIC_API_BASE}/leagues`);
    if (sport) url.searchParams.set('sport', sport);

    const response = await fetch(url.toString(), {
      headers: { 'x-api-key': OPTIC_API_KEY },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint for active sportsbooks
router.get('/sportsbooks/active', async (req, res) => {
  try {
    const { sport, league } = req.query;
    const url = new URL(`${OPTIC_API_BASE}/sportsbooks/active`);
    if (sport) url.searchParams.set('sport', sport);
    if (league) url.searchParams.set('league', league);

    const response = await fetch(url.toString(), {
      headers: { 'x-api-key': OPTIC_API_KEY },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
