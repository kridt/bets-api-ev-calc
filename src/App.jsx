// src/App.jsx
import { Outlet, Link, useLocation } from "react-router-dom";

export default function App() {
  const location = useLocation();
  const isBasketball = location.pathname.startsWith('/basketball');
  const isToday = location.pathname === '/' || location.pathname === '/today';
  const isResults = location.pathname === '/results';

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
                {isBasketball ? "🏀" : "⚽"}
              </div>
              <div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                  Bets Stats
                </div>
                <div style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 500,
                }}>
                  {isBasketball ? "NBA Player Props" : "EPL Match & Player Props"}
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
                  background: isToday ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(100, 116, 139, 0.2)",
                  color: isToday ? "#fff" : "#94a3b8",
                  border: `1px solid ${isToday ? "rgba(16, 185, 129, 0.5)" : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.3s",
                }}
              >
                ⚽ EPL Bets
              </Link>
              <Link
                to="/basketball"
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  background: isBasketball ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "rgba(100, 116, 139, 0.2)",
                  color: isBasketball ? "#fff" : "#94a3b8",
                  border: `1px solid ${isBasketball ? "rgba(245, 158, 11, 0.5)" : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.3s",
                }}
              >
                🏀 NBA Props
              </Link>
              <Link
                to="/results"
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  background: isResults ? "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)" : "rgba(100, 116, 139, 0.2)",
                  color: isResults ? "#fff" : "#94a3b8",
                  border: `1px solid ${isResults ? "rgba(139, 92, 246, 0.5)" : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.3s",
                }}
              >
                📊 Results
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
            EPL data by balldontlie.io • NBA data by balldontlie.io • Real-time probability calculations
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
