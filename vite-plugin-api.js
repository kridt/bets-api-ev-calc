// vite-plugin-api.js
import { loadEnv } from 'vite';

const ALLOWED = new Set([
  "/v1/events/upcoming",
  "/v1/event/view",
  "/v1/event/history",
  "/v1/event/stats_trend",
  "/v1/league",
]);

export default function apiPlugin() {
  let token;

  return {
    name: 'api-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), '');
      token = env.BETSAPI_TOKEN;
    },
    configureServer(server) {
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
