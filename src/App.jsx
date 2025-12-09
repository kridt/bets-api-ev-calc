// src/App.jsx
import { Outlet, Link, useLocation } from "react-router-dom";

export default function App() {
  const location = useLocation();
  const isNbaEV = location.pathname === '/';
  const isFootballEV = location.pathname === '/football-ev';
  const isDashboard = location.pathname === '/dashboard';

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        color: "#e2e8f0",
        fontFamily: "Inter, ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial",
      }}
    >
      {/* Background Pattern */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(118, 75, 162, 0.1) 0%, transparent 50%)
        `,
        pointerEvents: "none",
        zIndex: 0,
      }} />

      <div style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1400,
        margin: "0 auto",
        padding: "24px 24px 80px 24px",
      }}>
        {/* Header */}
        <header style={{
          marginBottom: 40,
          padding: "20px 24px",
          background: "rgba(30, 41, 59, 0.5)",
          backdropFilter: "blur(12px)",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link
              to="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 900,
                boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
              }}>
                {isDashboard ? "📊" : isFootballEV ? "⚽" : "🏀"}
              </div>
              <div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                  EV Betting
                </div>
                <div style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 500,
                }}>
                  {isDashboard ? "P&L Dashboard" : isFootballEV ? "Football EV Calculator" : "NBA EV Calculator"}
                </div>
              </div>
            </Link>

            {/* Navigation Tabs */}
            <nav style={{ display: "flex", gap: 8 }}>
              <Link
                to="/"
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  background: isNbaEV ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" : "rgba(100, 116, 139, 0.2)",
                  color: isNbaEV ? "#fff" : "#94a3b8",
                  border: `1px solid ${isNbaEV ? "rgba(249, 115, 22, 0.5)" : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.3s",
                }}
              >
                🏀 NBA EV
              </Link>
              <Link
                to="/football-ev"
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  background: isFootballEV ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.2)",
                  color: isFootballEV ? "#fff" : "#94a3b8",
                  border: `1px solid ${isFootballEV ? "rgba(16, 185, 129, 0.5)" : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.3s",
                }}
              >
                ⚽ Football EV
              </Link>
              <Link
                to="/dashboard"
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  background: isDashboard ? "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)" : "rgba(100, 116, 139, 0.2)",
                  color: isDashboard ? "#fff" : "#94a3b8",
                  border: `1px solid ${isDashboard ? "rgba(139, 92, 246, 0.5)" : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.3s",
                }}
              >
                📊 Dashboard
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main>
          <Outlet />
        </main>

        {/* Footer */}
        <footer style={{
          marginTop: 60,
          padding: "24px 0",
          textAlign: "center",
          color: "#64748b",
          fontSize: 14,
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
        }}>
          <p style={{ margin: 0 }}>
            Odds data by The Odds API
          </p>
        </footer>
      </div>

      {/* Pulse animation for LIVE badges */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
