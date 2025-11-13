// api/bets.js - Vercel Serverless Function
export default async function handler(req, res) {
  try {
    // Parse query params
    const { path, ...otherParams } = req.query;

    // Health check
    if (path === "/health") {
      return res.status(200).json({
        ok: true,
        hasToken: Boolean(process.env.BETSAPI_TOKEN)
      });
    }

    // Validate token
    const token = process.env.BETSAPI_TOKEN;
    if (!token) {
      return res.status(500).json({
        success: 0,
        error: "Missing BETSAPI_TOKEN environment variable",
      });
    }

    // Whitelist allowed endpoints
    const ALLOWED = new Set([
      "/v1/events/upcoming",
      "/v1/event/view",
      "/v1/event/history",
      "/v1/event/stats_trend",
      "/v1/league",
    ]);

    if (!ALLOWED.has(path)) {
      return res.status(403).json({
        success: 0,
        error: "Endpoint not allowed",
        path,
      });
    }

    // Build upstream URL
    const upstream = new URL(`https://api.b365api.com${path}`);
    upstream.searchParams.set("token", token);

    // Add other query params
    for (const [k, v] of Object.entries(otherParams)) {
      if (v != null && v !== "") {
        upstream.searchParams.set(k, v);
      }
    }

    // Fetch from upstream API
    const upstreamResp = await fetch(upstream.toString(), {
      headers: {
        "user-agent": "vercel-serverless/1.0"
      },
    });

    const ct = upstreamResp.headers.get("content-type") || "application/json";
    const text = await upstreamResp.text();

    // Check if response is JSON
    if (!ct.includes("application/json")) {
      return res.status(upstreamResp.status).json({
        success: 0,
        error: "Upstream returned non-JSON",
        status: upstreamResp.status,
        preview: text.slice(0, 200),
      });
    }

    // Return the response
    res.setHeader("content-type", "application/json");
    res.status(upstreamResp.status).send(text);

  } catch (err) {
    console.error("[api/bets] Error:", err);
    return res.status(500).json({
      success: 0,
      error: err?.message || "Serverless function error",
    });
  }
}
