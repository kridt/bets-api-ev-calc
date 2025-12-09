// src/App.jsx
import { Outlet, Link, useLocation } from "react-router-dom";

export default function App() {
  const location = useLocation();
  const isNbaEV = location.pathname === '/';
  const isFootballEV = location.pathname === '/football-ev';
  const isDashboard = location.pathname === '/dashboard';

  const getPageIcon = () => {
    if (isDashboard) return "📊";
    if (isFootballEV) return "⚽";
    return "🏀";
  };

  const getPageSubtitle = () => {
    if (isDashboard) return "P&L Dashboard";
    if (isFootballEV) return "Football EV Calculator";
    return "NBA EV Calculator";
  };

  return (
    <div className="app-container">
      <div className="app-content">
        {/* Header */}
        <header className="app-header">
          <div className="app-header-content">
            <Link to="/" className="app-logo">
              <div className="app-logo-icon">
                {getPageIcon()}
              </div>
              <div className="app-logo-text">
                <div className="app-logo-title">EV Betting</div>
                <div className="app-logo-subtitle">{getPageSubtitle()}</div>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="app-nav">
              <Link
                to="/"
                className={`nav-link ${isNbaEV ? 'active nba' : ''}`}
              >
                🏀 NBA
              </Link>
              <Link
                to="/football-ev"
                className={`nav-link ${isFootballEV ? 'active football' : ''}`}
              >
                ⚽ Football
              </Link>
              <Link
                to="/dashboard"
                className={`nav-link ${isDashboard ? 'active dashboard' : ''}`}
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
        <footer className="app-footer">
          <p>Odds data powered by The Odds API</p>
        </footer>
      </div>
    </div>
  );
}
