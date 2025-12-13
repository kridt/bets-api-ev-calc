// Vercel Serverless Function - OpticOdds API Proxy
// Handles all /api/opticodds/* requests

const OPTIC_API_KEY = process.env.OPTIC_ODDS_API_KEY;
const OPTIC_API_BASE = 'https://api.opticodds.com/api/v3';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!OPTIC_API_KEY) {
    return res.status(500).json({ error: 'OPTIC_ODDS_API_KEY not configured' });
  }

  try {
    // Get the path from the catch-all route
    const { path } = req.query;
    const endpoint = Array.isArray(path) ? path.join('/') : path;

    // Build the OpticOdds URL
    const url = new URL(`${OPTIC_API_BASE}/${endpoint}`);

    // Forward query parameters (except 'path')
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== 'path') {
        if (Array.isArray(value)) {
          value.forEach(v => url.searchParams.append(key, v));
        } else {
          url.searchParams.set(key, value);
        }
      }
    });

    console.log(`[OpticOdds Proxy] Fetching: ${url.toString()}`);

    // Special handling for fixtures/odds with multiple sportsbooks (max 5 per request)
    if (endpoint === 'fixtures/odds') {
      const sportsbooks = req.query.sportsbook;
      if (sportsbooks && Array.isArray(sportsbooks) && sportsbooks.length > 5) {
        // Batch requests
        const MAX_BOOKS_PER_REQUEST = 5;
        const batches = [];
        for (let i = 0; i < sportsbooks.length; i += MAX_BOOKS_PER_REQUEST) {
          batches.push(sportsbooks.slice(i, i + MAX_BOOKS_PER_REQUEST));
        }

        const fetchBatch = async (booksBatch) => {
          const batchUrl = new URL(`${OPTIC_API_BASE}/fixtures/odds`);
          batchUrl.searchParams.set('fixture_id', req.query.fixture_id);
          booksBatch.forEach(book => batchUrl.searchParams.append('sportsbook', book));

          const response = await fetch(batchUrl.toString(), {
            headers: { 'x-api-key': OPTIC_API_KEY },
          });

          if (!response.ok) return null;
          return response.json();
        };

        const results = await Promise.all(batches.map(fetchBatch));

        // Merge results
        let mergedData = null;
        let totalOdds = [];

        for (const result of results) {
          if (!result || !result.data || !result.data[0]) continue;
          if (!mergedData) {
            mergedData = result;
            totalOdds = result.data[0].odds || [];
          } else {
            totalOdds = totalOdds.concat(result.data[0].odds || []);
          }
        }

        if (!mergedData) {
          return res.status(400).json({ error: 'Failed to fetch odds from all batches' });
        }

        mergedData.data[0].odds = totalOdds;
        console.log(`[OpticOdds Proxy] Got ${totalOdds.length} total odds (merged from ${batches.length} batches)`);
        return res.status(200).json(mergedData);
      }
    }

    // Standard request
    const response = await fetch(url.toString(), {
      headers: { 'x-api-key': OPTIC_API_KEY },
    });

    if (!response.ok) {
      console.error(`[OpticOdds Proxy] API error: ${response.status}`);
      return res.status(response.status).json({ error: `OpticOdds API error: ${response.status}` });
    }

    const data = await response.json();
    console.log(`[OpticOdds Proxy] Success: ${endpoint}`);
    return res.status(200).json(data);

  } catch (error) {
    console.error('[OpticOdds Proxy] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
