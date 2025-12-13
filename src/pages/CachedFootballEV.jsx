// src/pages/CachedFootballEV.jsx
// Card-based Football EV page with match grouping

import { useState, useMemo } from 'react';
import { useCacheData } from '../hooks/useCacheSocket';

// Bookmakers we can actually bet on (Danish market)
const PLAYABLE_BOOKMAKERS = ['betano', 'unibet_denmark_', 'bet365'];

// All bookmakers used for fair odds calculation
const FAIR_ODDS_BOOKMAKERS = [
  'pinnacle', 'draftkings', 'fanduel', 'betmgm', 'caesars',
  'betrivers', 'superbet', 'betsson', 'betsafe', '888sport',
  'betway', 'william_hill', 'fanatics', 'bovada', 'betonline',
  'betfair', 'bwin'
];

// Display names for sportsbooks
const SPORTSBOOK_NAMES = {
  'pinnacle': 'Pinnacle',
  'betano': 'Betano',
  'unibet_denmark_': 'Unibet DK',
  'bet365': 'Bet365',
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'betmgm': 'BetMGM',
  'caesars': 'Caesars',
  'betrivers': 'BetRivers',
  'superbet': 'Superbet',
  'betsson': 'Betsson',
  'betsafe': 'Betsafe',
  '888sport': '888sport',
  'betway': 'Betway',
  'william_hill': 'William Hill',
  'fanatics': 'Fanatics',
  'bovada': 'Bovada',
  'betonline': 'BetOnline',
  'betfair': 'Betfair',
  'bwin': 'bwin',
};

// League display with flags
const LEAGUE_INFO = {
  'england_-_premier_league': { name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#3d195b' },
  'spain_-_la_liga': { name: 'La Liga', flag: '🇪🇸', color: '#ee8707' },
  'germany_-_bundesliga': { name: 'Bundesliga', flag: '🇩🇪', color: '#d20515' },
  'italy_-_serie_a': { name: 'Serie A', flag: '🇮🇹', color: '#008c45' },
  'france_-_ligue_1': { name: 'Ligue 1', flag: '🇫🇷', color: '#091c3e' },
};

const formatTimeAgo = (isoString) => {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
};

const formatMatchTime = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CachedFootballEV() {
  const { evBets, stats, isConnected, isRefreshing, lastUpdated, isLoading, error, triggerServerRefresh, progress } = useCacheData('football');

  // Filters
  const [minEV, setMinEV] = useState(3);
  const [maxOdds, setMaxOdds] = useState(10);
  const [selectedBookmakers, setSelectedBookmakers] = useState(
    Object.fromEntries(PLAYABLE_BOOKMAKERS.map(b => [b, true]))
  );
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [searchTeam, setSearchTeam] = useState('');

  // Get unique leagues from bets
  const availableLeagues = useMemo(() => {
    if (!evBets?.length) return [];
    const leagues = [...new Set(evBets.map(b => b.league))];
    return leagues.sort();
  }, [evBets]);

  // Filter bets and group by match
  const groupedMatches = useMemo(() => {
    if (!evBets?.length) return [];

    // Filter bets - check if ANY bookmaker in allBookmakers is selected
    const filtered = evBets.filter(bet => {
      if (bet.evPercent < minEV) return false;
      if (bet.odds > maxOdds) return false;

      // Check if any of the bookmakers for this bet are selected
      const bookmakers = bet.allBookmakers || [{ bookmaker: bet.bookmaker }];
      const hasSelectedBookmaker = bookmakers.some(b => selectedBookmakers[b.bookmaker]);
      if (!hasSelectedBookmaker) return false;

      if (selectedLeague !== 'all' && bet.league !== selectedLeague) return false;
      if (searchTeam) {
        const search = searchTeam.toLowerCase();
        if (!bet.homeTeam?.toLowerCase().includes(search) &&
            !bet.awayTeam?.toLowerCase().includes(search)) {
          return false;
        }
      }
      return true;
    }).map(bet => {
      // Filter allBookmakers to only show selected bookmakers
      if (bet.allBookmakers) {
        const filteredBookmakers = bet.allBookmakers.filter(b => selectedBookmakers[b.bookmaker]);
        return { ...bet, allBookmakers: filteredBookmakers };
      }
      return bet;
    });

    // Group by match
    const matchGroups = {};
    filtered.forEach(bet => {
      const key = bet.matchId;
      if (!matchGroups[key]) {
        matchGroups[key] = {
          matchId: bet.matchId,
          homeTeam: bet.homeTeam,
          awayTeam: bet.awayTeam,
          league: bet.league,
          matchTime: bet.matchDate,
          bets: [],
        };
      }
      matchGroups[key].bets.push(bet);
    });

    // Sort bets within each match by EV% descending
    Object.values(matchGroups).forEach(match => {
      match.bets.sort((a, b) => b.evPercent - a.evPercent);
      match.bestEV = match.bets[0]?.evPercent || 0;
    });

    // Sort matches by best EV descending
    return Object.values(matchGroups).sort((a, b) => b.bestEV - a.bestEV);
  }, [evBets, minEV, maxOdds, selectedBookmakers, selectedLeague, searchTeam]);

  const totalBets = groupedMatches.reduce((sum, m) => sum + m.bets.length, 0);

  const toggleBookmaker = (bookmaker) => {
    setSelectedBookmakers(prev => ({
      ...prev,
      [bookmaker]: !prev[bookmaker]
    }));
  };

  const getEVColor = (ev) => {
    if (ev >= 10) return '#22c55e';
    if (ev >= 7) return '#84cc16';
    if (ev >= 5) return '#eab308';
    return '#9ca3af';
  };

  const getEVBarWidth = (ev) => {
    return Math.min(ev * 5, 100);
  };

  return (
    <div className="ev-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Football EV Bets</h1>
            <div className="status-bar">
              <span className={`status-indicator ${isConnected ? 'connected' : ''}`}>
                <span className="status-dot"></span>
                {isConnected ? 'Live' : 'Offline'}
              </span>
              <span className="divider">|</span>
              <span className="last-update">Updated {formatTimeAgo(lastUpdated)}</span>
              {(isRefreshing || progress) && (
                <span className="refreshing">
                  {progress ? (
                    <span className="progress-indicator">
                      <span className="progress-bar-container">
                        <span className="progress-bar-fill" style={{ width: `${progress.current}%` }} />
                      </span>
                      <span className="progress-text">{progress.current}% - {progress.message || 'Building...'}</span>
                    </span>
                  ) : (
                    'Refreshing...'
                  )}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={triggerServerRefresh}
            disabled={isRefreshing}
            className="refresh-button"
          >
            Refresh
          </button>
        </div>

        {/* Stats Bar */}
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{groupedMatches.length}</span>
            <span className="stat-label">Matches</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totalBets}</span>
            <span className="stat-label">EV Bets</span>
          </div>
          <div className="stat">
            <span className="stat-value" style={{ color: '#22c55e' }}>
              {groupedMatches[0]?.bestEV?.toFixed(1) || '0'}%
            </span>
            <span className="stat-label">Best EV</span>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="filters">
        <div className="filter-row">
          <div className="filter-group">
            <label>Min EV%</label>
            <input
              type="number"
              value={minEV}
              onChange={(e) => setMinEV(Number(e.target.value))}
              min="0"
              max="50"
              step="0.5"
            />
          </div>

          <div className="filter-group">
            <label>Max Odds</label>
            <input
              type="number"
              value={maxOdds}
              onChange={(e) => setMaxOdds(Number(e.target.value))}
              min="1"
              max="20"
              step="0.5"
            />
          </div>

          <div className="filter-group">
            <label>League</label>
            <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)}>
              <option value="all">All Leagues</option>
              {availableLeagues.map(league => (
                <option key={league} value={league}>
                  {LEAGUE_INFO[league]?.name || league}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              value={searchTeam}
              onChange={(e) => setSearchTeam(e.target.value)}
              placeholder="Team name..."
            />
          </div>
        </div>

        <div className="bookmaker-section">
          <div className="bookmaker-group">
            <span className="bookmaker-label">Playable books:</span>
            <div className="bookmaker-toggles">
              {PLAYABLE_BOOKMAKERS.map(bm => (
                <button
                  key={bm}
                  onClick={() => toggleBookmaker(bm)}
                  className={`book-toggle ${selectedBookmakers[bm] ? 'active' : ''}`}
                >
                  {SPORTSBOOK_NAMES[bm] || bm}
                </button>
              ))}
            </div>
          </div>
          <div className="fair-odds-group">
            <span className="bookmaker-label">Fair odds from:</span>
            <div className="fair-odds-books">
              {FAIR_ODDS_BOOKMAKERS.map(bm => (
                <span key={bm} className="fair-book-tag">
                  {SPORTSBOOK_NAMES[bm] || bm}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="main-content">
        {isLoading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading EV bets...</p>
          </div>
        )}

        {error && (
          <div className="error">
            <p>Error: {error}</p>
            <button onClick={triggerServerRefresh}>Retry</button>
          </div>
        )}

        {!isLoading && !error && groupedMatches.length === 0 && (
          <div className="empty">
            <p>No EV bets found matching your filters.</p>
          </div>
        )}

        {!isLoading && !error && groupedMatches.length > 0 && (
          <div className="match-cards">
            {groupedMatches.map(match => {
              const leagueInfo = LEAGUE_INFO[match.league] || { name: match.league, flag: '⚽', color: '#374151' };

              return (
                <div key={match.matchId} className="match-card">
                  {/* Card Header */}
                  <div className="card-header" style={{ borderLeftColor: leagueInfo.color }}>
                    <div className="header-info">
                      <div className="league-info">
                        <span className="league-flag">{leagueInfo.flag}</span>
                        <span className="league-name">{leagueInfo.name}</span>
                      </div>
                      <div className="match-time">{formatMatchTime(match.matchTime)}</div>
                    </div>
                    <div className="teams">
                      <span className="home-team">{match.homeTeam}</span>
                      <span className="vs">vs</span>
                      <span className="away-team">{match.awayTeam}</span>
                    </div>
                    <div className="card-stats">
                      <span className="bet-count">{match.bets.length} bets</span>
                      <span className="best-ev" style={{ color: getEVColor(match.bestEV) }}>
                        Best: {match.bestEV.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Bets Table */}
                  <div className="bets-container">
                    <table className="bets-table">
                      <thead>
                        <tr>
                          <th className="col-ev">EV%</th>
                          <th className="col-market">Market</th>
                          <th className="col-selection">Selection</th>
                          <th className="col-fair">Fair</th>
                          <th className="col-books">Bookmakers</th>
                          <th className="col-updated">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {match.bets.map((bet, idx) => {
                          const bookmakers = bet.allBookmakers || [{
                            bookmaker: bet.bookmaker,
                            bookmakerDisplay: SPORTSBOOK_NAMES[bet.bookmaker] || bet.bookmaker,
                            odds: bet.odds,
                            evPercent: bet.evPercent
                          }];

                          return (
                            <tr key={`${bet.market}-${bet.betType}-${bet.line}-${idx}`}>
                              <td className="col-ev">
                                <div className="ev-cell">
                                  <div
                                    className="ev-bar"
                                    style={{
                                      width: `${getEVBarWidth(bet.evPercent)}%`,
                                      backgroundColor: getEVColor(bet.evPercent)
                                    }}
                                  ></div>
                                  <span className="ev-value" style={{ color: getEVColor(bet.evPercent) }}>
                                    {bet.evPercent.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                              <td className="col-market">
                                {bet.marketDisplay || bet.market}
                                {(bet.selection || bet.player) && (
                                  <span className="selection-subject"> ({bet.selection || bet.player})</span>
                                )}
                              </td>
                              <td className="col-selection">
                                <span className={`selection-badge ${bet.betType?.toLowerCase()}`}>
                                  {bet.betType} {bet.line ? bet.line : ''}
                                </span>
                              </td>
                              <td className="col-fair">{bet.fairOdds.toFixed(2)}</td>
                              <td className="col-books">
                                <div className="bookmakers-list">
                                  {bookmakers.map((b, bIdx) => (
                                    <div key={bIdx} className="bookmaker-item">
                                      <span className="book-badge">{b.bookmakerDisplay || SPORTSBOOK_NAMES[b.bookmaker] || b.bookmaker}</span>
                                      <span className="book-odds">{b.odds.toFixed(2)}</span>
                                      <span className="book-ev" style={{ color: getEVColor(b.evPercent) }}>
                                        +{b.evPercent.toFixed(1)}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="col-updated">
                                <span className="updated-time">{formatTimeAgo(bet.oddsUpdatedAt)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <style>{`
        * {
          box-sizing: border-box;
        }

        .ev-page {
          min-height: 100vh;
          background: #0f0f0f;
          color: #e5e5e5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* Header */
        .page-header {
          background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
          border-bottom: 1px solid #262626;
          padding: 20px 24px;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          max-width: 1400px;
          margin: 0 auto;
        }

        .header-left h1 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #fff;
        }

        .status-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          color: #737373;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
        }

        .status-indicator.connected .status-dot {
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }

        .divider {
          color: #404040;
        }

        .refreshing {
          color: #eab308;
          font-weight: 500;
        }

        .progress-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .progress-bar-container {
          width: 100px;
          height: 6px;
          background: #262626;
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #eab308, #22c55e);
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 11px;
          color: #a3a3a3;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .refresh-button {
          padding: 8px 16px;
          background: #262626;
          border: 1px solid #404040;
          border-radius: 6px;
          color: #e5e5e5;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-button:hover:not(:disabled) {
          background: #333;
          border-color: #525252;
        }

        .refresh-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Stats Bar */
        .stats-bar {
          display: flex;
          gap: 32px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #262626;
          max-width: 1400px;
          margin-left: auto;
          margin-right: auto;
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat-value {
          font-size: 20px;
          font-weight: 600;
          color: #fff;
        }

        .stat-label {
          font-size: 12px;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Filters */
        .filters {
          background: #171717;
          border-bottom: 1px solid #262626;
          padding: 16px 24px;
        }

        .filter-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          max-width: 1400px;
          margin: 0 auto 12px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .filter-group label {
          font-size: 11px;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .filter-group input,
        .filter-group select {
          padding: 8px 12px;
          background: #262626;
          border: 1px solid #404040;
          border-radius: 6px;
          color: #e5e5e5;
          font-size: 14px;
          min-width: 120px;
        }

        .filter-group input:focus,
        .filter-group select:focus {
          outline: none;
          border-color: #22c55e;
        }

        .bookmaker-section {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bookmaker-group,
        .fair-odds-group {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .bookmaker-label {
          font-size: 11px;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          min-width: 100px;
          padding-top: 8px;
        }

        .bookmaker-toggles {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .book-toggle {
          padding: 6px 12px;
          background: #262626;
          border: 1px solid #404040;
          border-radius: 20px;
          color: #737373;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .book-toggle:hover {
          border-color: #525252;
          color: #a3a3a3;
        }

        .book-toggle.active {
          background: #22c55e20;
          border-color: #22c55e;
          color: #22c55e;
        }

        .fair-odds-books {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .fair-book-tag {
          padding: 4px 8px;
          background: #1f1f1f;
          border: 1px solid #333;
          border-radius: 4px;
          font-size: 11px;
          color: #6b7280;
        }

        /* Main Content */
        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px;
        }

        .loading, .error, .empty {
          text-align: center;
          padding: 60px 20px;
          color: #737373;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #262626;
          border-top-color: #22c55e;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error button {
          margin-top: 12px;
          padding: 8px 16px;
          background: #22c55e;
          border: none;
          border-radius: 6px;
          color: #000;
          cursor: pointer;
        }

        /* Match Cards */
        .match-cards {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .match-card {
          background: #171717;
          border: 1px solid #262626;
          border-radius: 12px;
          overflow: hidden;
        }

        .card-header {
          padding: 16px 20px;
          background: #1a1a1a;
          border-left: 4px solid #374151;
          border-bottom: 1px solid #262626;
        }

        .header-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .league-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .league-flag {
          font-size: 16px;
        }

        .league-name {
          font-size: 12px;
          color: #a3a3a3;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .match-time {
          font-size: 12px;
          color: #737373;
        }

        .teams {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .home-team, .away-team {
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }

        .vs {
          font-size: 12px;
          color: #525252;
          text-transform: uppercase;
        }

        .card-stats {
          display: flex;
          gap: 16px;
          font-size: 13px;
        }

        .bet-count {
          color: #737373;
        }

        .best-ev {
          font-weight: 600;
        }

        /* Bets Table */
        .bets-container {
          overflow-x: auto;
        }

        .bets-table {
          width: 100%;
          border-collapse: collapse;
        }

        .bets-table th {
          padding: 10px 16px;
          text-align: left;
          font-size: 11px;
          font-weight: 500;
          color: #525252;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: #141414;
          border-bottom: 1px solid #262626;
        }

        .bets-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #1f1f1f;
        }

        .bets-table tr:last-child td {
          border-bottom: none;
        }

        .bets-table tr:hover {
          background: #1a1a1a;
        }

        .col-ev { width: 100px; }
        .col-market { width: auto; }
        .col-selection { width: 120px; }
        .col-fair { width: 70px; text-align: right; color: #737373; }
        .col-books { width: auto; min-width: 200px; }
        .col-updated { width: 80px; text-align: right; }

        .ev-cell {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ev-bar {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 4px;
          border-radius: 2px;
          opacity: 0.3;
        }

        .ev-value {
          font-weight: 700;
          font-size: 14px;
          position: relative;
          z-index: 1;
        }

        .col-market {
          color: #a3a3a3;
          font-size: 13px;
        }

        .selection-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .selection-badge.over {
          background: #22c55e15;
          color: #22c55e;
        }

        .selection-badge.under {
          background: #ef444415;
          color: #ef4444;
        }

        .selection-badge.home, .selection-badge.yes {
          background: #3b82f615;
          color: #3b82f6;
        }

        .selection-badge.away, .selection-badge.no {
          background: #f59e0b15;
          color: #f59e0b;
        }

        .col-odds {
          font-weight: 600;
          color: #fff;
        }

        .book-badge {
          display: inline-block;
          padding: 4px 8px;
          background: #262626;
          border-radius: 4px;
          font-size: 11px;
          color: #a3a3a3;
        }

        .bookmakers-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .bookmaker-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .bookmaker-item .book-badge {
          min-width: 70px;
          text-align: center;
        }

        .book-odds {
          font-weight: 600;
          color: #fff;
          min-width: 45px;
          text-align: right;
        }

        .book-ev {
          font-size: 12px;
          font-weight: 600;
          min-width: 50px;
          text-align: right;
        }

        .updated-time {
          font-size: 11px;
          color: #737373;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            gap: 12px;
          }

          .filter-row {
            flex-direction: column;
          }

          .filter-group input,
          .filter-group select {
            width: 100%;
          }

          .teams {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }

          .vs {
            display: none;
          }

          .away-team::before {
            content: 'vs ';
            color: #525252;
          }

          .bets-table th,
          .bets-table td {
            padding: 8px 12px;
            font-size: 12px;
          }

          .col-fair {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
