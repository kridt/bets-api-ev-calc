// src/pages/LSportsEV.jsx - LSports Multi-Bookmaker EV System
import { useState, useEffect, useMemo } from 'react';

// Backend URL - use environment variable in production
const LSPORTS_API_URL = import.meta.env.VITE_LSPORTS_API_URL || 'http://localhost:3001';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, AreaChart, ComposedChart, ReferenceLine, Legend
} from 'recharts';

// Market categories
const CATEGORIES = [
  { id: 'All', name: 'All Markets', emoji: '🎯' },
  { id: 'Main', name: 'Match Winner', emoji: '⚽' },
  { id: 'Goals', name: 'Goals', emoji: '🥅' },
  { id: 'Corners', name: 'Corners', emoji: '🚩' },
  { id: 'Cards', name: 'Cards', emoji: '🟨' },
  { id: 'Shots', name: 'Shots', emoji: '🎯' },
  { id: 'Throw-ins', name: 'Throw-ins', emoji: '🏃' },
  { id: 'Goal Kicks', name: 'Goal Kicks', emoji: '👟' },
  { id: 'Tackles', name: 'Tackles', emoji: '🦶' },
  { id: 'Asian', name: 'Asian', emoji: '🔢' },
  // Player Props
  { id: 'Player Shots', name: 'Player Shots', emoji: '🎯👤' },
  { id: 'Player Goals', name: 'Player Goals', emoji: '⚽👤' },
  { id: 'Player Cards', name: 'Player Cards', emoji: '🟨👤' },
];

// Available leagues - Top 22
const LEAGUES = [
  { id: 'all', name: 'All Leagues', emoji: '🌍' },
  // Top 5 Leagues
  { id: 67, name: 'Premier League', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'England' },
  { id: 8363, name: 'LaLiga', emoji: '🇪🇸', country: 'Spain' },
  { id: 65, name: 'Bundesliga', emoji: '🇩🇪', country: 'Germany' },
  { id: 4, name: 'Serie A', emoji: '🇮🇹', country: 'Italy' },
  { id: 61, name: 'Ligue 1', emoji: '🇫🇷', country: 'France' },
  // Second Divisions
  { id: 58, name: 'Championship', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'England' },
  { id: 22263, name: 'LaLiga2', emoji: '🇪🇸', country: 'Spain' },
  { id: 66, name: '2.Bundesliga', emoji: '🇩🇪', country: 'Germany' },
  { id: 8, name: 'Serie B', emoji: '🇮🇹', country: 'Italy' },
  { id: 60, name: 'Ligue 2', emoji: '🇫🇷', country: 'France' },
  // Other Top Leagues
  { id: 2944, name: 'Eredivisie', emoji: '🇳🇱', country: 'Netherlands' },
  { id: 6603, name: 'Primeira Liga', emoji: '🇵🇹', country: 'Portugal' },
  { id: 63, name: 'Super Lig', emoji: '🇹🇷', country: 'Turkey' },
  { id: 30058, name: 'Premiership', emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', country: 'Scotland' },
  { id: 59, name: 'Jupiler League', emoji: '🇧🇪', country: 'Belgium' },
  { id: 32521, name: 'Ekstraklasa', emoji: '🇵🇱', country: 'Poland' },
  // English Lower
  { id: 68, name: 'League One', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'England' },
  { id: 70, name: 'League Two', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'England' },
  // European Competitions
  { id: 32644, name: 'Champions League', emoji: '🏆', country: 'Europe' },
  { id: 30444, name: 'Europa League', emoji: '🌟', country: 'Europe' },
  { id: 45863, name: 'Conference League', emoji: '🏅', country: 'Europe' },
];

// Sort options
const SORT_OPTIONS = [
  { id: 'ev_high', label: 'EV% High → Low', icon: '📈' },
  { id: 'ev_low', label: 'EV% Low → High', icon: '📉' },
  { id: 'odds_low', label: 'Odds Low → High', icon: '🎯' },
  { id: 'odds_high', label: 'Odds High → Low', icon: '💰' },
  { id: 'kickoff', label: 'Kickoff Time', icon: '⏰' },
];

// Tabs
const TABS = [
  { id: 'ev', label: 'Value Bets', icon: '💰' },
  { id: 'movers', label: 'Line Movers', icon: '📊' },
  { id: 'bets', label: 'My Bets', icon: '📋' },
];

// Unit size rules based on odds
const UNIT_RULES = [
  { maxOdds: 2.00, units: 1.00, label: '≤2.00' },
  { maxOdds: 2.75, units: 0.75, label: '2.00-2.75' },
  { maxOdds: 4.00, units: 0.50, label: '2.75-4.00' },
  { maxOdds: 7.00, units: 0.25, label: '4.00-7.00' },
  { maxOdds: Infinity, units: 0.10, label: '7.00+' },
];

function getUnitSize(odds) {
  for (const rule of UNIT_RULES) {
    if (odds <= rule.maxOdds) {
      return rule.units;
    }
  }
  return 0.10;
}

export default function LSportsEV() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Tabs
  const [activeTab, setActiveTab] = useState('ev');
  const [movers, setMovers] = useState([]);
  const [moversLoading, setMoversLoading] = useState(false);

  // Tracked Bets
  const [trackedBets, setTrackedBets] = useState([]);
  const [betsStats, setBetsStats] = useState(null);
  const [betsLoading, setBetsLoading] = useState(false);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(180); // 3 minutes
  const AUTO_REFRESH_INTERVAL = 180; // seconds

  // Bankroll Management
  const [bankroll, setBankroll] = useState(1000); // Default 1000
  const [unitValue, setUnitValue] = useState(40);  // 1 unit = 40 (4% of bankroll)
  const [showBankroll, setShowBankroll] = useState(true);

  // Filters
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('ev_high');
  const [minEV, setMinEV] = useState(5);
  const [maxOdds, setMaxOdds] = useState(5.0);
  const [availableBookmakers, setAvailableBookmakers] = useState([]);
  const [selectedBookmakers, setSelectedBookmakers] = useState([]); // All bookmakers for fair odds calculation
  const [playableBookmakers, setPlayableBookmakers] = useState(['Bet365', 'Unibet', 'GGBet']); // Bookmakers user can bet on
  const [showOnlyPositiveEV, setShowOnlyPositiveEV] = useState(true);
  const [leaguesInResults, setLeaguesInResults] = useState([]);

  // Expanded matches
  const [expandedMatches, setExpandedMatches] = useState(new Set());

  // Show info panel
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    fetchEVBets();
  }, [selectedLeague]);

  useEffect(() => {
    if (activeTab === 'movers') {
      fetchMovers();
    } else if (activeTab === 'bets') {
      fetchTrackedBets();
    }
  }, [activeTab]);

  // Auto-refresh countdown
  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchEVBets();
          return AUTO_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, selectedLeague]);

  const fetchMovers = async () => {
    try {
      setMoversLoading(true);
      const response = await fetch(`${LSPORTS_API_URL}/api/movers?minChange=1`);
      const data = await response.json();
      if (data.success) {
        setMovers(data.movers || []);
      }
    } catch (err) {
      console.error('Error fetching movers:', err);
    } finally {
      setMoversLoading(false);
    }
  };

  const fetchTrackedBets = async () => {
    try {
      setBetsLoading(true);
      const response = await fetch(`${LSPORTS_API_URL}/api/bets`);
      const data = await response.json();
      if (data.success) {
        setTrackedBets(data.bets || []);
        setBetsStats(data.stats || null);
      }
    } catch (err) {
      console.error('Error fetching tracked bets:', err);
    } finally {
      setBetsLoading(false);
    }
  };

  const trackBet = async (match, bet, stakeUnits, stakeAmount) => {
    try {
      const response = await fetch(`${LSPORTS_API_URL}/api/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: match.fixtureId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league,
          kickoff: match.kickoff,
          marketId: bet.marketId,
          marketName: bet.marketName,
          selection: bet.selection,
          line: bet.line,
          odds: bet.bestOdds,
          fairOdds: bet.fairOdds,
          ev: bet.bestEV,
          stakeUnits: stakeUnits,
          stakeAmount: stakeAmount,
          bookmaker: bet.bestBookmaker
        })
      });
      const data = await response.json();
      if (data.success) {
        // Refresh bets list
        fetchTrackedBets();
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      console.error('Error tracking bet:', err);
      return { success: false, error: err.message };
    }
  };

  const updateBetResult = async (betId, result) => {
    try {
      const response = await fetch(`${LSPORTS_API_URL}/api/bets/${betId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result })
      });
      const data = await response.json();
      if (data.success) {
        fetchTrackedBets();
      }
    } catch (err) {
      console.error('Error updating bet:', err);
    }
  };

  const deleteBet = async (betId) => {
    try {
      const response = await fetch(`${LSPORTS_API_URL}/api/bets/${betId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        fetchTrackedBets();
      }
    } catch (err) {
      console.error('Error deleting bet:', err);
    }
  };

  const fetchEVBets = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch from backend server (refreshes every 60s)
      let url = `${LSPORTS_API_URL}/api/ev-bets?minEV=0&maxOdds=10`;
      if (selectedLeague !== 'all') {
        url += `&leagues=${selectedLeague}`;
      }

      console.log('Fetching LSports EV bets from backend...', url);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch EV bets');
      }

      console.log(`Received ${data.matches?.length || 0} matches with ${data.totalBets || 0} bets`);

      setMatches(data.matches || []);
      setAvailableBookmakers(data.availableBookmakers || []);
      setLeaguesInResults(data.leaguesInResults || []);
      setLastUpdated(data.generatedAt);

      // If no bookmakers selected, select all
      if (selectedBookmakers.length === 0 && data.availableBookmakers?.length > 0) {
        setSelectedBookmakers(data.availableBookmakers);
      }

    } catch (err) {
      console.error('Error fetching EV bets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    // Force backend refresh then fetch
    try {
      await fetch(`${LSPORTS_API_URL}/api/refresh`, { method: 'POST' });
    } catch (e) {
      console.log('Backend refresh failed, using cached data');
    }
    await fetchEVBets();
    setRefreshing(false);
  };

  // Filter and sort matches
  const filteredMatches = useMemo(() => {
    if (!matches.length) return [];

    return matches
      .map(match => {
        // Filter value bets
        const filteredBets = match.valueBets.filter(bet => {
          // Category filter
          if (selectedCategory !== 'All' && bet.category !== selectedCategory) return false;

          // Must have at least one playable bookmaker with odds
          if (playableBookmakers.length > 0) {
            const hasPlayableBookmaker = bet.allBookmakers.some(b =>
              playableBookmakers.includes(b.bookmaker)
            );
            if (!hasPlayableBookmaker) return false;
          }

          // Get the best EV from playable bookmakers only
          const playableOdds = playableBookmakers.length > 0
            ? bet.allBookmakers.filter(b => playableBookmakers.includes(b.bookmaker))
            : bet.allBookmakers;

          if (playableOdds.length === 0) return false;

          const bestPlayableEV = Math.max(...playableOdds.map(o => o.ev));
          const bestPlayableOdds = Math.max(...playableOdds.map(o => o.odds));

          // EV filter - check against playable bookmaker EV
          if (showOnlyPositiveEV && bestPlayableEV <= 0) return false;
          if (bestPlayableEV < minEV) return false;

          // Max odds filter
          if (bestPlayableOdds > maxOdds) return false;

          return true;
        }).map(bet => {
          // Calculate best odds from PLAYABLE bookmakers only
          const playableOdds = playableBookmakers.length > 0
            ? bet.allBookmakers.filter(b => playableBookmakers.includes(b.bookmaker))
            : bet.allBookmakers;

          if (playableOdds.length > 0) {
            const best = playableOdds.reduce((best, curr) =>
              curr.odds > best.odds ? curr : best
            );
            return {
              ...bet,
              bestBookmaker: best.bookmaker,
              bestOdds: best.odds,
              bestEV: best.ev,
              playableOdds, // Only playable bookmaker odds
              filteredBookmakers: bet.allBookmakers // Still show all bookmakers for comparison
            };
          }
          return { ...bet, playableOdds: bet.allBookmakers, filteredBookmakers: bet.allBookmakers };
        });

        if (filteredBets.length === 0) return null;

        // Sort bets within match
        const sortedBets = [...filteredBets].sort((a, b) => {
          switch (sortBy) {
            case 'ev_high': return b.bestEV - a.bestEV;
            case 'ev_low': return a.bestEV - b.bestEV;
            case 'odds_low': return a.bestOdds - b.bestOdds;
            case 'odds_high': return b.bestOdds - a.bestOdds;
            default: return b.bestEV - a.bestEV;
          }
        });

        return {
          ...match,
          valueBets: sortedBets,
          bestEV: Math.max(...sortedBets.map(b => b.bestEV)),
          totalEV: sortedBets.reduce((sum, b) => sum + b.bestEV, 0),
          betCount: sortedBets.length
        };
      })
      .filter(match => match !== null)
      .sort((a, b) => {
        switch (sortBy) {
          case 'ev_high': return b.bestEV - a.bestEV;
          case 'ev_low': return a.bestEV - b.bestEV;
          case 'kickoff': return new Date(a.kickoff) - new Date(b.kickoff);
          default: return b.bestEV - a.bestEV;
        }
      });
  }, [matches, selectedCategory, sortBy, minEV, maxOdds, playableBookmakers, showOnlyPositiveEV]);

  // Stats
  const stats = useMemo(() => {
    const totalBets = filteredMatches.reduce((sum, m) => sum + m.valueBets.length, 0);
    const avgEV = totalBets > 0
      ? filteredMatches.reduce((sum, m) => sum + m.totalEV, 0) / totalBets
      : 0;
    const positiveEVBets = filteredMatches.reduce((sum, m) =>
      sum + m.valueBets.filter(b => b.bestEV > 0).length, 0
    );

    return { totalMatches: filteredMatches.length, totalBets, avgEV, positiveEVBets };
  }, [filteredMatches]);

  const toggleMatch = (fixtureId) => {
    setExpandedMatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fixtureId)) {
        newSet.delete(fixtureId);
      } else {
        newSet.add(fixtureId);
      }
      return newSet;
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>⚽</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          Loading LSports EV Data...
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8' }}>
          Fetching multi-bookmaker odds from LSports TRADE360
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: 24,
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 16,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 18, color: '#ef4444', marginBottom: 8 }}>Error</div>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>{error}</div>
        <button onClick={fetchEVBets} style={buttonStyle}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 24,
        padding: 24,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
        borderRadius: 20,
        border: '1px solid rgba(59, 130, 246, 0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 32 }}>🎯</div>
          <div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 900,
              margin: 0,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              LSports Multi-Bookmaker EV
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '4px 0 0 0' }}>
              Compare odds across {availableBookmakers.length} bookmakers • Median-based fair odds
            </p>
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              border: 'none',
              background: showInfo
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
          >
            {showInfo ? '✕ Close Guide' : '❓ How It Works'}
          </button>
        </div>

        {/* Info Panel */}
        {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}

        {/* Tab Selector */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 24px',
                borderRadius: 12,
                border: 'none',
                background: activeTab === tab.id
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : 'rgba(100, 116, 139, 0.2)',
                color: activeTab === tab.id ? 'white' : '#94a3b8',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: activeTab === tab.id ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.id === 'movers' && movers.length > 0 && (
                <span style={{
                  background: 'rgba(16, 185, 129, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 11,
                  color: '#10b981'
                }}>
                  {movers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* League Filter */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
            League
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {LEAGUES.map(league => (
              <button
                key={league.id}
                onClick={() => setSelectedLeague(league.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: selectedLeague === league.id
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : 'rgba(100, 116, 139, 0.2)',
                  color: selectedLeague === league.id ? 'white' : '#94a3b8',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>{league.emoji}</span>
                <span>{league.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
            Market Category
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: selectedCategory === cat.id
                    ? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
                    : 'rgba(100, 116, 139, 0.2)',
                  color: selectedCategory === cat.id ? 'white' : '#94a3b8',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>{cat.emoji}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filters Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
          {/* Sort By */}
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
              Sort By
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(100, 116, 139, 0.3)',
                background: 'rgba(30, 41, 59, 0.8)',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.icon} {opt.label}</option>
              ))}
            </select>
          </div>

          {/* Min EV */}
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
              Min EV: <span style={{ color: '#10b981' }}>{minEV}%</span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
              Only show bets with at least this edge
            </div>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={minEV}
              onChange={(e) => setMinEV(parseInt(e.target.value))}
              style={{
                width: '100%',
                height: 8,
                borderRadius: 4,
                appearance: 'none',
                cursor: 'pointer',
                background: `linear-gradient(to right, #10b981 0%, #10b981 ${(minEV / 15) * 100}%, rgba(100, 116, 139, 0.3) ${(minEV / 15) * 100}%, rgba(100, 116, 139, 0.3) 100%)`
              }}
            />
          </div>

          {/* Max Odds */}
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
              Max Odds: <span style={{ color: '#f59e0b' }}>{maxOdds.toFixed(1)}</span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
              Higher odds = riskier but bigger payouts
            </div>
            <input
              type="range"
              min="1.5"
              max="10.0"
              step="0.5"
              value={maxOdds}
              onChange={(e) => setMaxOdds(parseFloat(e.target.value))}
              style={{
                width: '100%',
                height: 8,
                borderRadius: 4,
                appearance: 'none',
                cursor: 'pointer',
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${((maxOdds - 1.5) / 8.5) * 100}%, rgba(100, 116, 139, 0.3) ${((maxOdds - 1.5) / 8.5) * 100}%, rgba(100, 116, 139, 0.3) 100%)`
              }}
            />
          </div>

          {/* +EV Only Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showOnlyPositiveEV}
                onChange={(e) => setShowOnlyPositiveEV(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>+EV Only</span>
            </label>
          </div>
        </div>

        {/* My Bookmakers - Sites you can actually bet on */}
        {availableBookmakers.length > 0 && (
          <div style={{
            marginBottom: 16,
            padding: 16,
            background: 'rgba(16, 185, 129, 0.05)',
            borderRadius: 12,
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>
                  My Bookmakers ({playableBookmakers.length} selected)
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Select the sites where you have accounts - only +EV bets at these sites will show
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setPlayableBookmakers([...availableBookmakers])}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#10b981',
                    fontWeight: 500,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setPlayableBookmakers(['Bet365', 'Unibet'])}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: '#3b82f6',
                    fontWeight: 500,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  Reset Default
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableBookmakers.map(bookmaker => {
                const isSelected = playableBookmakers.includes(bookmaker);
                const isPinnacle = bookmaker === 'Pinnacle';
                const isDefault = ['Bet365', 'Unibet'].includes(bookmaker);
                return (
                  <button
                    key={bookmaker}
                    onClick={() => {
                      if (isSelected) {
                        setPlayableBookmakers(prev => prev.filter(b => b !== bookmaker));
                      } else {
                        setPlayableBookmakers(prev => [...prev, bookmaker]);
                      }
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid #10b981' : '1px solid rgba(100, 116, 139, 0.3)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                      color: isSelected ? '#10b981' : '#94a3b8',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {isSelected && <span>✓</span>}
                    {bookmaker}
                    {isPinnacle && <span style={{ color: '#f59e0b' }}>★</span>}
                    {isDefault && !isPinnacle && <span style={{ color: '#3b82f6', fontSize: 10 }}>(default)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* All Bookmakers for Fair Odds - Used for calculating average odds */}
        {availableBookmakers.length > 0 && (
          <div style={{ marginBottom: 16, opacity: 0.7 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  All Bookmakers for Fair Odds ({availableBookmakers.length} total)
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  All bookmakers are used to calculate fair odds (using Pinnacle as primary benchmark)
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableBookmakers.map(bookmaker => {
                const isPinnacle = bookmaker === 'Pinnacle';
                return (
                  <span
                    key={bookmaker}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: isPinnacle ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                      color: isPinnacle ? '#f59e0b' : '#64748b',
                      fontWeight: 500,
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {bookmaker}
                    {isPinnacle && <span>★</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 12
        }}>
          <StatBox label="Matches" value={stats.totalMatches} color="#667eea" />
          <StatBox label="Value Bets" value={stats.totalBets} color="#f59e0b" />
          <StatBox label="+EV Bets" value={stats.positiveEVBets} color="#10b981" />
          <StatBox label="Avg EV" value={`${stats.avgEV.toFixed(1)}%`} color="#ec4899" />
          <StatBox label="My Books" value={playableBookmakers.length} color="#3b82f6" />
          {lastUpdated && (
            <StatBox
              label="Updated"
              value={new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              color="#8b5cf6"
            />
          )}
          {/* Auto-refresh indicator */}
          <div
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: 12,
              background: autoRefresh ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.2)',
              borderRadius: 12,
              border: autoRefresh ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(100, 116, 139, 0.3)',
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>
              {autoRefresh ? 'Auto-Refresh' : 'Paused'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: autoRefresh ? '#10b981' : '#64748b' }}>
              {autoRefresh ? `${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, '0')}` : 'OFF'}
            </div>
          </div>
        </div>

        {/* Bankroll Management */}
        <div style={{
          marginTop: 16,
          padding: 16,
          background: 'rgba(245, 158, 11, 0.1)',
          borderRadius: 12,
          border: '1px solid rgba(245, 158, 11, 0.3)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>💰</span>
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>Bankroll Management</span>
            </div>
            <button
              onClick={() => setShowBankroll(!showBankroll)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {showBankroll ? 'Hide' : 'Show'}
            </button>
          </div>

          {showBankroll && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>
                    BANKROLL
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#64748b' }}>$</span>
                    <input
                      type="number"
                      value={bankroll}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setBankroll(val);
                        setUnitValue(val * 0.04); // 1 unit = 4% of bankroll
                      }}
                      style={{
                        width: 100,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        background: 'rgba(30, 41, 59, 0.8)',
                        color: '#f59e0b',
                        fontSize: 16,
                        fontWeight: 700
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>
                    1 UNIT = 4% = ${unitValue.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Auto-calculated from bankroll
                  </div>
                </div>
              </div>

              <div style={{
                padding: 12,
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 8
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
                  UNIT SIZE BY ODDS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {UNIT_RULES.map((rule, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        borderRadius: 6,
                        fontSize: 11
                      }}
                    >
                      <span style={{ color: '#94a3b8' }}>{rule.label}: </span>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                        {rule.units}u = ${(unitValue * rule.units).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results - EV Tab */}
      {activeTab === 'ev' && (
        filteredMatches.length === 0 ? (
          <div style={{
            padding: 60,
            textAlign: 'center',
            background: 'rgba(30, 41, 59, 0.5)',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 18, color: '#94a3b8', marginBottom: 8 }}>
              No value bets match your filters
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
              Try adjusting filters or wait for new odds
            </div>
            <button onClick={refreshData} disabled={refreshing} style={buttonStyle}>
              {refreshing ? '🔄 Refreshing...' : '🔄 Refresh Data'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              marginBottom: 20,
              padding: 16,
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: 12,
              fontSize: 14,
              color: '#10b981',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>💰 {stats.totalBets} value bets across {stats.totalMatches} matches</span>
              <button onClick={refreshData} disabled={refreshing} style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer'
              }}>
                {refreshing ? '🔄...' : '🔄 Refresh'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {filteredMatches.map((match, idx) => (
                <MatchCard
                  key={match.fixtureId}
                  match={match}
                  rank={idx + 1}
                  expanded={expandedMatches.has(match.fixtureId)}
                  onToggle={() => toggleMatch(match.fixtureId)}
                  formatDate={formatDate}
                  playableBookmakers={playableBookmakers}
                  unitValue={unitValue}
                  onTrackBet={trackBet}
                />
              ))}
            </div>
          </div>
        )
      )}

      {/* Movers Tab */}
      {activeTab === 'movers' && (
        <div>
          <div style={{
            marginBottom: 20,
            padding: 20,
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: 16,
            border: '1px solid rgba(139, 92, 246, 0.3)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#8b5cf6', fontSize: 18 }}>
              Line Movement Tracker
            </h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
              Bets where the EV has changed significantly in the last hour.
              Data is collected every 20 minutes for bets with EV 3%+.
            </p>
          </div>

          {moversLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div style={{ color: '#94a3b8' }}>Loading line movements...</div>
            </div>
          ) : movers.length === 0 ? (
            <div style={{
              padding: 60,
              textAlign: 'center',
              background: 'rgba(30, 41, 59, 0.5)',
              borderRadius: 20,
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 18, color: '#94a3b8', marginBottom: 8 }}>
                No significant line movements yet
              </div>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>
                Snapshots are taken every 20 minutes. Check back soon!
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Line movements require at least 2 snapshots to compare.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {movers.map((mover, idx) => (
                <MoverCard key={idx} mover={mover} formatDate={formatDate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Bets Tab */}
      {activeTab === 'bets' && (
        <div>
          {/* Stats Cards */}
          {betsStats && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 12,
              marginBottom: 20
            }}>
              <StatBox label="Total Bets" value={betsStats.total} color="#667eea" />
              <StatBox label="Pending" value={betsStats.pending} color="#f59e0b" />
              <StatBox label="Won" value={betsStats.won} color="#10b981" />
              <StatBox label="Lost" value={betsStats.lost} color="#ef4444" />
              <StatBox label="Win Rate" value={`${betsStats.winRate}%`} color="#8b5cf6" />
              <StatBox label="Units P/L" value={`${parseFloat(betsStats.totalUnitsProfit) >= 0 ? '+' : ''}${betsStats.totalUnitsProfit}`} color={parseFloat(betsStats.totalUnitsProfit) >= 0 ? '#10b981' : '#ef4444'} />
              <StatBox label="$ P/L" value={`${parseFloat(betsStats.totalProfit) >= 0 ? '+' : ''}$${betsStats.totalProfit}`} color={parseFloat(betsStats.totalProfit) >= 0 ? '#10b981' : '#ef4444'} />
              <StatBox label="ROI" value={`${betsStats.roi}%`} color={parseFloat(betsStats.roi) >= 0 ? '#10b981' : '#ef4444'} />
              <StatBox label="Avg EV" value={`${betsStats.avgEV}%`} color="#3b82f6" />
            </div>
          )}

          {betsLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ color: '#94a3b8' }}>Loading tracked bets...</div>
            </div>
          ) : trackedBets.length === 0 ? (
            <div style={{
              padding: 60,
              textAlign: 'center',
              background: 'rgba(30, 41, 59, 0.5)',
              borderRadius: 20,
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <div style={{ fontSize: 18, color: '#94a3b8', marginBottom: 8 }}>
                No tracked bets yet
              </div>
              <div style={{ fontSize: 14, color: '#64748b' }}>
                Click "Track" on any value bet to start tracking your bets
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {trackedBets.map((bet) => (
                <TrackedBetCard
                  key={bet.id}
                  bet={bet}
                  onUpdateResult={updateBetResult}
                  onDelete={deleteBet}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tracked Bet Card Component
function TrackedBetCard({ bet, onUpdateResult, onDelete, formatDate }) {
  const resultColors = {
    pending: '#f59e0b',
    won: '#10b981',
    lost: '#ef4444',
    void: '#64748b',
    push: '#64748b'
  };

  const resultLabels = {
    pending: 'Pending',
    won: 'Won',
    lost: 'Lost',
    void: 'Void',
    push: 'Push'
  };

  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: bet.result === 'won' ? 'rgba(16, 185, 129, 0.1)' :
                  bet.result === 'lost' ? 'rgba(239, 68, 68, 0.1)' :
                  'rgba(30, 41, 59, 0.5)',
      border: `1px solid ${bet.result === 'won' ? 'rgba(16, 185, 129, 0.3)' :
                          bet.result === 'lost' ? 'rgba(239, 68, 68, 0.3)' :
                          'rgba(255, 255, 255, 0.1)'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            {bet.home_team} vs {bet.away_team}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            {bet.league} • {formatDate(bet.kickoff)}
          </div>
          <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 2 }}>
            {bet.market_name}: <span style={{ color: '#8b5cf6' }}>{bet.selection}</span>
            {bet.line && <span style={{ color: '#64748b' }}> ({bet.line})</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            padding: '4px 12px',
            borderRadius: 20,
            background: `${resultColors[bet.result]}20`,
            color: resultColors[bet.result],
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 4
          }}>
            {resultLabels[bet.result]}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {new Date(bet.placed_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: 16,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        fontSize: 12,
        marginBottom: 12
      }}>
        <div>
          <span style={{ color: '#64748b' }}>Odds: </span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>{bet.odds?.toFixed(2)}</span>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>EV: </span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>+{bet.ev_at_placement?.toFixed(1)}%</span>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Stake: </span>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>{bet.stake_units}u (${bet.stake_amount?.toFixed(2)})</span>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>@: </span>
          <span style={{ color: '#3b82f6' }}>{bet.bookmaker}</span>
        </div>
        {bet.result !== 'pending' && (
          <div>
            <span style={{ color: '#64748b' }}>P/L: </span>
            <span style={{ color: bet.profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
              {bet.profit >= 0 ? '+' : ''}${bet.profit?.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Result Buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {bet.result === 'pending' ? (
          <>
            <button
              onClick={() => onUpdateResult(bet.id, 'won')}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Won
            </button>
            <button
              onClick={() => onUpdateResult(bet.id, 'lost')}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Lost
            </button>
            <button
              onClick={() => onUpdateResult(bet.id, 'void')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(100, 116, 139, 0.3)',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Void
            </button>
            <button
              onClick={() => onUpdateResult(bet.id, 'push')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(100, 116, 139, 0.3)',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Push
            </button>
          </>
        ) : (
          <button
            onClick={() => onUpdateResult(bet.id, 'pending')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'rgba(100, 116, 139, 0.2)',
              color: '#64748b',
              fontWeight: 500,
              fontSize: 11,
              cursor: 'pointer'
            }}
          >
            Undo
          </button>
        )}
        <button
          onClick={() => {
            if (confirm('Delete this bet?')) onDelete(bet.id);
          }}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: '#64748b',
            fontWeight: 500,
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Match Card Component
function MatchCard({ match, rank, expanded, onToggle, formatDate, playableBookmakers, unitValue, onTrackBet }) {
  const topBets = expanded ? match.valueBets : match.valueBets.slice(0, 3);

  return (
    <div style={{
      background: 'rgba(30, 41, 59, 0.5)',
      borderRadius: 16,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      overflow: 'hidden'
    }}>
      {/* Match Header */}
      <div
        onClick={onToggle}
        style={{
          padding: 20,
          cursor: 'pointer',
          background: match.bestEV > 5
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
            : 'transparent'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700
              }}>
                #{rank}
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {formatDate(match.kickoff)}
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {match.homeTeam} vs {match.awayTeam}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {match.leagueEmoji} {match.league} • {match.betCount} value bets • <span style={{ color: '#8b5cf6', fontFamily: 'monospace' }}>ID: {match.fixtureId}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 28,
              fontWeight: 900,
              color: match.bestEV > 5 ? '#10b981' : match.bestEV > 0 ? '#f59e0b' : '#ef4444'
            }}>
              {match.bestEV > 0 ? '+' : ''}{match.bestEV.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Best EV</div>
          </div>
        </div>
      </div>

      {/* Value Bets */}
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {topBets.map((bet, idx) => (
            <BetCard key={idx} bet={bet} match={match} playableBookmakers={playableBookmakers} unitValue={unitValue} onTrackBet={onTrackBet} />
          ))}
        </div>

        {match.valueBets.length > 3 && !expanded && (
          <button
            onClick={onToggle}
            style={{
              width: '100%',
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: '1px dashed rgba(100, 116, 139, 0.3)',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Show {match.valueBets.length - 3} more bets
          </button>
        )}
      </div>
    </div>
  );
}

// Bet Card Component
function BetCard({ bet, match, playableBookmakers, unitValue, onTrackBet }) {
  const [showAll, setShowAll] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [tracked, setTracked] = useState(false);

  // Calculate default unit size based on odds
  const defaultUnits = getUnitSize(bet.bestOdds);
  const [customUnits, setCustomUnits] = useState(defaultUnits);

  // Calculate stake
  const stake = unitValue * customUnits;
  const potentialProfit = stake * (bet.bestOdds - 1);

  const handleTrackBet = async () => {
    if (!onTrackBet || tracked) return;
    setIsTracking(true);
    const result = await onTrackBet(match, bet, customUnits, stake);
    setIsTracking(false);
    if (result.success) {
      setTracked(true);
    } else {
      alert(`Failed to track bet: ${result.error || 'Unknown error'}`);
    }
  };

  // Separate playable and non-playable bookmakers
  const playableOdds = bet.allBookmakers.filter(b => playableBookmakers.includes(b.bookmaker));
  const otherOdds = bet.allBookmakers.filter(b => !playableBookmakers.includes(b.bookmaker));

  // Show playable first, then others
  const sortedBookmakers = [...playableOdds, ...otherOdds];
  const displayBookmakers = showAll ? sortedBookmakers : sortedBookmakers.slice(0, 6);

  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: bet.bestEV > 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.5)',
      border: bet.bestEV > 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      {/* Bet Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#8b5cf6',
              fontSize: 10,
              fontWeight: 600
            }}>
              {bet.category}
            </span>
            <span style={{
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(100, 116, 139, 0.2)',
              color: '#64748b',
              fontSize: 9,
              fontFamily: 'monospace'
            }}>
              M:{bet.marketId}
            </span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {bet.isPlayerProp && <span style={{ marginRight: 4 }}>👤</span>}
            {bet.marketName}
          </div>
          <div style={{ fontSize: 12, color: bet.isPlayerProp ? '#a78bfa' : '#94a3b8', fontWeight: bet.isPlayerProp ? 500 : 400 }}>
            {bet.selection}{bet.line ? ` (${bet.line})` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 20,
            fontWeight: 700,
            color: bet.bestEV > 0 ? '#10b981' : bet.bestEV > -2 ? '#f59e0b' : '#ef4444'
          }}>
            {bet.bestEV > 0 ? '+' : ''}{bet.bestEV.toFixed(2)}%
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>@ {bet.bestBookmaker}</div>
        </div>
      </div>

      {/* Stake Calculator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
        padding: '10px 12px',
        background: 'rgba(245, 158, 11, 0.1)',
        borderRadius: 8,
        border: '1px solid rgba(245, 158, 11, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Units:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0.10, 0.25, 0.50, 0.75, 1.00].map(u => (
              <button
                key={u}
                onClick={() => setCustomUnits(u)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: 'none',
                  background: customUnits === u
                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    : 'rgba(100, 116, 139, 0.2)',
                  color: customUnits === u ? 'white' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {u}
              </button>
            ))}
          </div>
          {customUnits !== defaultUnits && (
            <button
              onClick={() => setCustomUnits(defaultUnits)}
              style={{
                padding: '2px 6px',
                borderRadius: 4,
                border: 'none',
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#3b82f6',
                fontSize: 9,
                cursor: 'pointer'
              }}
            >
              Reset ({defaultUnits})
            </button>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
              Stake: ${stake.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              Profit: ${potentialProfit.toFixed(2)}
            </div>
          </div>
          <button
            onClick={handleTrackBet}
            disabled={isTracking || tracked}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: tracked
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              fontWeight: 700,
              fontSize: 12,
              cursor: tracked ? 'default' : 'pointer',
              opacity: isTracking ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {tracked ? '✓ Tracked' : isTracking ? '...' : '📋 Track'}
          </button>
        </div>
      </div>

      {/* Fair Odds Info */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginBottom: 12,
        padding: '8px 12px',
        background: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 8,
        fontSize: 11
      }}>
        <div>
          <span style={{ color: '#64748b' }}>Fair: </span>
          <span style={{ color: '#3b82f6', fontWeight: 600 }}>{bet.fairOdds}</span>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Prob: </span>
          <span style={{ color: '#3b82f6', fontWeight: 600 }}>{bet.fairProb}%</span>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Best: </span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>{bet.bestOdds.toFixed(2)}</span>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>At: </span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>{bet.bestBookmaker}</span>
        </div>
      </div>

      {/* Playable Bookmakers Section */}
      {playableOdds.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>
            Your Bookmakers ({playableOdds.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {playableOdds.map((o, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: o.isPositiveEV ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                  border: `2px solid ${o.isPositiveEV ? 'rgba(16, 185, 129, 0.5)' : 'rgba(100, 116, 139, 0.3)'}`,
                  minWidth: 100
                }}
              >
                <div style={{ fontSize: 10, color: o.isPositiveEV ? '#10b981' : '#94a3b8', marginBottom: 2, fontWeight: 600 }}>
                  {o.bookmaker}
                  {o.bookmaker === 'Pinnacle' && <span style={{ color: '#f59e0b' }}> ★</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: o.isPositiveEV ? '#10b981' : '#e2e8f0'
                  }}>
                    {o.odds.toFixed(2)}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: o.isPositiveEV ? '#10b981' : o.ev > -2 ? '#f59e0b' : '#ef4444'
                  }}>
                    {o.ev > 0 ? '+' : ''}{o.ev.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Bookmakers Section */}
      {otherOdds.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase' }}>
            Other Bookmakers ({otherOdds.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(showAll ? otherOdds : otherOdds.slice(0, 4)).map((o, i) => (
              <div
                key={i}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(100, 116, 139, 0.08)',
                  border: '1px solid rgba(100, 116, 139, 0.15)',
                  minWidth: 80,
                  opacity: 0.7
                }}
              >
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>
                  {o.bookmaker}
                  {o.bookmaker === 'Pinnacle' && <span style={{ color: '#f59e0b' }}> ★</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: o.isPositiveEV ? '#10b981' : '#94a3b8'
                  }}>
                    {o.odds.toFixed(2)}
                  </span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: o.isPositiveEV ? '#10b981' : o.ev > -2 ? '#f59e0b' : '#ef4444'
                  }}>
                    {o.ev > 0 ? '+' : ''}{o.ev.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherOdds.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            marginTop: 8,
            padding: '4px 8px',
            borderRadius: 4,
            border: 'none',
            background: 'transparent',
            color: '#64748b',
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          {showAll ? 'Show less' : `+${otherOdds.length - 4} more`}
        </button>
      )}
    </div>
  );
}

// Mover Card Component - Shows line movement
function MoverCard({ mover, formatDate }) {
  const [showChart, setShowChart] = useState(true);
  const isUp = mover.direction === 'up';
  const arrow = isUp ? '↑' : '↓';
  const color = isUp ? '#10b981' : '#ef4444';
  const bgColor = isUp ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
  const borderColor = isUp ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
  const gradientId = `gradient-${mover.fixtureId}-${mover.marketId}`;

  // Prepare chart data from history
  const chartData = useMemo(() => {
    if (!mover.history || mover.history.length === 0) return [];
    return mover.history.map((h, idx) => ({
      time: new Date(h.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      ev: h.ev,
      odds: h.odds,
      index: idx
    }));
  }, [mover.history]);

  const minEV = chartData.length > 0 ? Math.min(...chartData.map(d => d.ev)) - 1 : 0;
  const maxEV = chartData.length > 0 ? Math.max(...chartData.map(d => d.ev)) + 1 : 10;
  const minOdds = chartData.length > 0 ? Math.min(...chartData.map(d => d.odds)) - 0.2 : 1;
  const maxOdds = chartData.length > 0 ? Math.max(...chartData.map(d => d.odds)) + 0.2 : 10;

  // Custom tooltip for dual chart
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8,
          padding: '10px 14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{data.time}</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 9, marginBottom: 2 }}>EV%</div>
              <div style={{ color, fontSize: 16, fontWeight: 700 }}>{data.ev.toFixed(2)}%</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 9, marginBottom: 2 }}>ODDS</div>
              <div style={{ color: '#f59e0b', fontSize: 16, fontWeight: 700 }}>{data.odds.toFixed(2)}</div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: bgColor,
      border: `1px solid ${borderColor}`,
      transition: 'all 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 24,
              fontWeight: 900,
              color,
              animation: 'pulse 2s infinite'
            }}>
              {arrow}
            </span>
            <span style={{
              fontSize: 20,
              fontWeight: 800,
              color
            }}>
              {mover.evChange > 0 ? '+' : ''}{mover.evChange.toFixed(1)}% EV
            </span>
            <span style={{
              fontSize: 11,
              color: '#64748b',
              background: 'rgba(0,0,0,0.2)',
              padding: '2px 6px',
              borderRadius: 4
            }}>
              {mover.snapshotCount} snapshots
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            {mover.homeTeam} vs {mover.awayTeam}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
            {mover.league} • {formatDate(mover.kickoff)}
          </div>
          <div style={{
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            marginBottom: 8
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
              {mover.marketName}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {mover.selection}{mover.line ? ` (${mover.line})` : ''}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Current</div>
          <div style={{ fontSize: 24, fontWeight: 800, color }}>
            {mover.currentEV > 0 ? '+' : ''}{mover.currentEV.toFixed(1)}%
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
            @ {mover.currentOdds.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Was</div>
          <div style={{ fontSize: 14, color: '#94a3b8' }}>
            {mover.previousEV > 0 ? '+' : ''}{mover.previousEV.toFixed(1)}% @ {mover.previousOdds.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Animated Chart */}
      {chartData.length >= 2 && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 10,
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              EV% Movement Over Time
            </span>
            <button
              onClick={() => setShowChart(!showChart)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 10,
                color: '#94a3b8',
                cursor: 'pointer'
              }}
            >
              {showChart ? 'Hide' : 'Show'}
            </button>
          </div>
          {showChart && (
            <div style={{ height: 140, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id={`${gradientId}-ev`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id={`${gradientId}-odds`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fill: '#64748b', fontSize: 9 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="ev"
                    orientation="left"
                    domain={[minEV, maxEV]}
                    tick={{ fill: color, fontSize: 9 }}
                    axisLine={{ stroke: color, strokeOpacity: 0.3 }}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                  />
                  <YAxis
                    yAxisId="odds"
                    orientation="right"
                    domain={[minOdds, maxOdds]}
                    tick={{ fill: '#f59e0b', fontSize: 9 }}
                    axisLine={{ stroke: '#f59e0b', strokeOpacity: 0.3 }}
                    tickLine={false}
                    tickFormatter={(v) => v.toFixed(1)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine yAxisId="ev" y={mover.previousEV} stroke="#64748b" strokeDasharray="3 3" />
                  <Area
                    yAxisId="ev"
                    type="monotone"
                    dataKey="ev"
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#${gradientId}-ev)`}
                    dot={{ fill: color, strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, stroke: color, strokeWidth: 2, fill: '#0f172a' }}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    name="EV %"
                  />
                  <Line
                    yAxisId="odds"
                    type="monotone"
                    dataKey="odds"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ fill: '#f59e0b', strokeWidth: 0, r: 2 }}
                    activeDot={{ r: 4, stroke: '#f59e0b', strokeWidth: 2, fill: '#0f172a' }}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    name="Odds"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {showChart && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 16,
              marginTop: 6,
              fontSize: 10
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 3, background: color, borderRadius: 2 }}></span>
                <span style={{ color: '#94a3b8' }}>EV%</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 2, background: '#f59e0b', borderRadius: 2, borderTop: '1px dashed #f59e0b' }}></span>
                <span style={{ color: '#94a3b8' }}>Odds</span>
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{
        marginTop: 8,
        padding: '6px 10px',
        background: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 6,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11
      }}>
        <span style={{ color: '#3b82f6' }}>Best at: {mover.bookmaker}</span>
        <span style={{ color: '#64748b' }}>
          Odds {mover.oddsChange > 0 ? '+' : ''}{mover.oddsChange.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      padding: 12,
      background: 'rgba(30, 41, 59, 0.5)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

const buttonStyle = {
  padding: '12px 24px',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  border: 'none',
  borderRadius: 12,
  color: 'white',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
};

// Info Panel Component - Explains everything
function InfoPanel({ onClose }) {
  return (
    <div style={{
      background: 'rgba(30, 41, 59, 0.95)',
      borderRadius: 20,
      padding: 24,
      marginBottom: 24,
      border: '1px solid rgba(59, 130, 246, 0.3)',
      position: 'relative'
    }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(239, 68, 68, 0.2)',
          border: 'none',
          borderRadius: 8,
          padding: '8px 12px',
          color: '#ef4444',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        Close
      </button>

      <h2 style={{ margin: '0 0 20px 0', color: '#3b82f6', fontSize: 24 }}>
        How This Works - Complete Guide
      </h2>

      {/* What is EV */}
      <Section title="What is Expected Value (EV)?" emoji="📊">
        <p><strong>EV (Expected Value)</strong> tells you if a bet is profitable in the long run.</p>
        <ul>
          <li><strong>+EV (Positive EV)</strong> = You expect to MAKE money over time</li>
          <li><strong>-EV (Negative EV)</strong> = You expect to LOSE money over time</li>
          <li><strong>0% EV</strong> = Break even (fair odds)</li>
        </ul>
        <p style={{ background: 'rgba(16, 185, 129, 0.1)', padding: 12, borderRadius: 8, marginTop: 12 }}>
          <strong>Example:</strong> If you see <span style={{ color: '#10b981', fontWeight: 700 }}>+5% EV</span>,
          it means for every $100 you bet, you expect to profit $5 on average.
        </p>
      </Section>

      {/* How we calculate */}
      <Section title="How We Calculate EV" emoji="🧮">
        <p>We use the <strong>MEDIAN</strong> of all bookmaker odds as the "fair" benchmark:</p>
        <ul>
          <li><strong>Why Median?</strong> It's robust against outliers - one bookmaker with crazy odds won't skew results</li>
          <li><strong>More data = better accuracy</strong> - we use ALL available bookmakers (10-16) to find the true market price</li>
          <li><strong>Consensus pricing</strong> - the median represents what the market collectively thinks</li>
        </ul>
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: 16, borderRadius: 8, marginTop: 12, fontFamily: 'monospace' }}>
          <p style={{ margin: 0 }}><strong>Formula:</strong></p>
          <p style={{ margin: '8px 0 0 0' }}>Fair Odds = Median of all bookmaker odds</p>
          <p style={{ margin: '4px 0 0 0' }}>Fair Probability = 1 / Fair Odds</p>
          <p style={{ margin: '4px 0 0 0' }}>EV% = (Fair Probability × Your Odds - 1) × 100</p>
        </div>
        <p style={{ marginTop: 12 }}>
          <strong>Example:</strong> 10 bookmakers have odds: [2.80, 2.90, 3.00, 3.00, 3.05, 3.10, 3.15, 3.20, 3.25, 3.50]<br/>
          Median = (3.05 + 3.10) / 2 = <strong>3.075</strong> (fair odds, 32.5% probability)<br/>
          Bet365 has @ 3.50<br/>
          EV = (0.325 × 3.50 - 1) × 100 = <span style={{ color: '#10b981', fontWeight: 700 }}>+13.8%</span>
        </p>
      </Section>

      {/* What the colors mean */}
      <Section title="What The Colors Mean" emoji="🎨">
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <ColorRow color="#10b981" label="+EV (Green)" desc="Profitable bet - the odds are better than fair value" />
          <ColorRow color="#f59e0b" label="Near 0% (Yellow)" desc="Close to fair odds - small edge either way" />
          <ColorRow color="#ef4444" label="-EV (Red)" desc="Bad value - the odds are worse than fair value" />
        </div>
      </Section>

      {/* Two-Tier Bookmaker System */}
      <Section title="Two-Tier Bookmaker System" emoji="🏢">
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: 16, borderRadius: 8, marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 600, color: '#10b981' }}>MY BOOKMAKERS (Green Box)</p>
          <p style={{ margin: '8px 0 0 0' }}>
            <strong>What it is:</strong> Select the bookmakers where you actually have accounts and can place bets.
          </p>
          <p style={{ margin: '8px 0 0 0' }}>
            <strong>Default:</strong> Bet365 and Unibet are pre-selected as they're popular in most regions.
          </p>
          <p style={{ margin: '8px 0 0 0' }}>
            <strong>How it works:</strong> Only +EV opportunities at YOUR selected bookmakers will be shown. This filters out bets you can't actually place.
          </p>
        </div>

        <div style={{ background: 'rgba(100, 116, 139, 0.1)', padding: 16, borderRadius: 8, marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 600, color: '#94a3b8' }}>ALL BOOKMAKERS FOR FAIR ODDS (Gray Box)</p>
          <p style={{ margin: '8px 0 0 0' }}>
            <strong>What it is:</strong> All available bookmakers (10-16) are used to calculate the "fair odds" using the MEDIAN.
          </p>
          <p style={{ margin: '8px 0 0 0' }}>
            <strong>Why Median of all bookmakers:</strong> More data = more accurate fair odds. The median is robust against outliers - if one bookmaker has unusually high/low odds, it won't skew the fair price.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {['Pinnacle', 'Bet365', 'Unibet', 'BWin', 'Betsson', 'PaddyPower', 'Fanduel', 'DraftKings', 'Betano', 'GGBet', 'Ladbrokes', 'Coral', 'WilliamHill', '888Sport', 'Betfair', 'BoyleSports'].map(bm => (
            <span key={bm} style={{
              padding: '4px 10px',
              background: bm === 'Pinnacle' ? 'rgba(245, 158, 11, 0.2)' : ['Bet365', 'Unibet'].includes(bm) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              borderRadius: 6,
              fontSize: 11,
              color: bm === 'Pinnacle' ? '#f59e0b' : ['Bet365', 'Unibet'].includes(bm) ? '#10b981' : '#94a3b8'
            }}>
              {bm} {bm === 'Pinnacle' && '★'} {['Bet365', 'Unibet'].includes(bm) && '(default)'}
            </span>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
          Fair odds = MEDIAN of all available bookmaker odds (robust against outliers)
        </p>
      </Section>

      {/* Market types */}
      <Section title="Market Categories" emoji="⚽">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 8 }}>
          <MarketInfo name="Main" desc="Match Winner (1X2)" />
          <MarketInfo name="Goals" desc="Over/Under goals, BTTS" />
          <MarketInfo name="Corners" desc="Total corners, handicaps" />
          <MarketInfo name="Cards" desc="Yellow cards, total cards" />
          <MarketInfo name="Shots" desc="Shots on target" />
          <MarketInfo name="Throw-ins" desc="Total throw-ins" />
          <MarketInfo name="Goal Kicks" desc="Total goal kicks" />
          <MarketInfo name="Asian" desc="Asian handicaps, Asian O/U" />
        </div>
      </Section>

      {/* How to use */}
      <Section title="How To Use This Tool" emoji="🎯">
        <ol style={{ paddingLeft: 20 }}>
          <li><strong>Select a League</strong> - Or use "All Leagues" for maximum opportunities</li>
          <li><strong>Filter by Category</strong> - Focus on markets you understand</li>
          <li><strong>Set Min EV</strong> - Higher = fewer but better opportunities (recommend 3-5%)</li>
          <li><strong>Set Max Odds</strong> - Lower odds = more likely to win but smaller edge</li>
          <li><strong>Select Bookmakers</strong> - Only show bookmakers you have accounts with</li>
          <li><strong>Look for +EV bets</strong> - Green numbers = value!</li>
        </ol>
      </Section>

      {/* Important warnings */}
      <Section title="Important Notes" emoji="⚠️">
        <ul>
          <li><strong>Odds change fast</strong> - Verify odds before betting</li>
          <li><strong>Not every +EV bet wins</strong> - It's about long-term profit</li>
          <li><strong>Bankroll management</strong> - Never bet more than 1-5% of bankroll per bet</li>
          <li><strong>Sharp bookmakers</strong> - Pinnacle/Betfair may limit winning accounts</li>
          <li><strong>Line shopping</strong> - Having accounts at multiple bookmakers is essential</li>
        </ul>
      </Section>

      {/* Quick reference */}
      <Section title="Quick Reference" emoji="📋">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <QuickRef label="Great EV" value="+10% or more" color="#10b981" />
          <QuickRef label="Good EV" value="+5% to +10%" color="#10b981" />
          <QuickRef label="Decent EV" value="+2% to +5%" color="#f59e0b" />
          <QuickRef label="Marginal" value="0% to +2%" color="#f59e0b" />
          <QuickRef label="Bad Value" value="Below 0%" color="#ef4444" />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, emoji, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#e2e8f0', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{emoji}</span> {title}
      </h3>
      <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function ColorRow({ color, label, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 16, height: 16, borderRadius: 4, background: color }} />
      <span style={{ color, fontWeight: 600, minWidth: 120 }}>{label}</span>
      <span style={{ color: '#94a3b8' }}>{desc}</span>
    </div>
  );
}

function MarketInfo({ name, desc }) {
  return (
    <div style={{ background: 'rgba(100, 116, 139, 0.1)', padding: 10, borderRadius: 8 }}>
      <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{desc}</div>
    </div>
  );
}

function QuickRef({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
