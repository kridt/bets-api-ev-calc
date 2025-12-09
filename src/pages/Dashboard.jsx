// src/pages/Dashboard.jsx
// Universal P&L Dashboard for all tracked bets

import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { BetTracker } from '../services/betTracker';
import { getUsername, setUsername as saveUsername, getDeviceId } from '../lib/supabase';
import { useSocket } from '../hooks/useSocket';
import ConnectionStatus from '../components/ConnectionStatus';
import './Dashboard.css';

const COLORS = {
  won: '#22c55e',
  lost: '#ef4444',
  pending: '#f59e0b',
  void: '#6b7280',
  nba: '#f97316',
  football: '#22c55e',
};

export default function Dashboard() {
  const {
    connected,
    status: socketStatus,
    connectedClients,
    soundEnabled,
    notificationsEnabled,
    toggleSound,
    toggleNotifications,
  } = useSocket();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [username, setUsernameState] = useState(getUsername() || '');
  const [editingUsername, setEditingUsername] = useState(false);
  const [filter, setFilter] = useState({ sport: null, days: 30 });
  const [selectedBet, setSelectedBet] = useState(null);

  // Load stats
  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await BetTracker.getStats({
        sport: filter.sport,
        days: filter.days,
      });
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('[Dashboard] Error loading stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();

    // Subscribe to real-time updates
    const unsubscribe = BetTracker.subscribeToUpdates(() => {
      loadStats();
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [filter]);

  // Handle result update
  const handleResultUpdate = async (betId, result) => {
    try {
      const bet = stats.recentBets.find(b => b.id === betId);
      const stake = bet?.stake || bet?.units || 1;

      if (result === 'won') {
        await BetTracker.markWon(betId, stake);
      } else if (result === 'lost') {
        await BetTracker.markLost(betId, stake);
      } else if (result === 'void') {
        await BetTracker.markVoid(betId, stake);
      }

      await loadStats();
      setSelectedBet(null);
    } catch (err) {
      console.error('[Dashboard] Error updating result:', err);
    }
  };

  // Handle delete
  const handleDelete = async (betId) => {
    if (!confirm('Are you sure you want to delete this bet?')) return;
    try {
      await BetTracker.deleteBet(betId);
      await loadStats();
    } catch (err) {
      console.error('[Dashboard] Error deleting bet:', err);
    }
  };

  // Save username
  const handleSaveUsername = () => {
    saveUsername(username);
    setEditingUsername(false);
  };

  // Format currency
  const formatCurrency = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}u`;
  };

  // Format percentage
  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Pie chart data
  const pieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Won', value: stats.won, color: COLORS.won },
      { name: 'Lost', value: stats.lost, color: COLORS.lost },
      { name: 'Pending', value: stats.pending, color: COLORS.pending },
      { name: 'Void', value: stats.voided, color: COLORS.void },
    ].filter(d => d.value > 0);
  }, [stats]);

  // Sport distribution
  const sportData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'NBA', value: stats.nbaBets, color: COLORS.nba },
      { name: 'Football', value: stats.footballBets, color: COLORS.football },
    ].filter(d => d.value > 0);
  }, [stats]);

  if (loading && !stats) {
    return (
      <div className="dashboard-container loading-container">
        <div>
          <div className="loading-spinner" />
          <p className="loading-text">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="header-section">
        <div className="header-content">
          <div className="header-text">
            <h1>P&L Dashboard</h1>
            <p>Universal bet tracking across all users</p>
          </div>

          <div className="header-actions">
            <ConnectionStatus
              connected={connected}
              isRefreshing={loading}
              connectedClients={connectedClients}
              soundEnabled={soundEnabled}
              notificationsEnabled={notificationsEnabled}
              onToggleSound={toggleSound}
              onToggleNotifications={toggleNotifications}
              cacheStatus={socketStatus}
              sport="nba"
            />
            <button className="refresh-button" onClick={loadStats}>
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-row">
          <select
            className="filter-select"
            value={filter.sport || ''}
            onChange={(e) => setFilter(f => ({ ...f, sport: e.target.value || null }))}
          >
            <option value="">All Sports</option>
            <option value="nba">NBA</option>
            <option value="football">Football</option>
          </select>

          <select
            className="filter-select"
            value={filter.days}
            onChange={(e) => setFilter(f => ({ ...f, days: parseInt(e.target.value) }))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="stats-grid">
          {/* Total Profit */}
          <div className={`stat-card profit ${stats.totalProfit < 0 ? 'negative' : ''}`}>
            <div className="stat-label">Total Profit</div>
            <div className={`stat-value ${stats.totalProfit >= 0 ? 'green' : 'red'}`}>
              {formatCurrency(stats.totalProfit)}
            </div>
            <div className="stat-subtext">ROI: {formatPercent(stats.roi)}</div>
          </div>

          {/* Win Rate */}
          <div className="stat-card winrate">
            <div className="stat-label">Win Rate</div>
            <div className="stat-value blue">{formatPercent(stats.winRate)}</div>
            <div className="stat-subtext">{stats.won}W - {stats.lost}L ({stats.settled} settled)</div>
          </div>

          {/* Total Bets */}
          <div className="stat-card total">
            <div className="stat-label">Total Bets</div>
            <div className="stat-value purple">{stats.totalBets}</div>
            <div className="stat-subtext">{stats.pending} pending</div>
          </div>

          {/* Avg EV */}
          <div className="stat-card ev">
            <div className="stat-label">Avg EV</div>
            <div className="stat-value orange">{formatPercent(stats.avgEv)}</div>
            <div className="stat-subtext">per bet</div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      {stats && (
        <div className="charts-grid">
          {/* Cumulative P&L Chart */}
          <div className="chart-card">
            <h3>Cumulative P&L</h3>
            {stats.dailyPnL.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={stats.dailyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={12}
                    tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(30, 41, 59, 0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                    }}
                    formatter={(value) => [formatCurrency(value), 'Cumulative']}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">No settled bets yet</div>
            )}
          </div>

          {/* Results Distribution */}
          <div className="chart-card">
            <h3>Results Distribution</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {pieData.map((entry) => (
                  <div key={entry.name} className="pie-legend-item">
                    <div className="pie-legend-color" style={{ background: entry.color }} />
                    <span className="pie-legend-label">{entry.name}</span>
                    <span className="pie-legend-value">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* By Market Performance */}
      {stats && Object.keys(stats.byMarket).length > 0 && (
        <div className="table-card">
          <h3>Performance by Market</h3>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th className="center">Bets</th>
                  <th className="center">Won</th>
                  <th className="center">Lost</th>
                  <th className="center">Win%</th>
                  <th className="center">Avg EV</th>
                  <th className="right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.byMarket)
                  .sort((a, b) => b[1].total - a[1].total)
                  .slice(0, 10)
                  .map(([market, data]) => (
                    <tr key={market}>
                      <td className="market-name">{market}</td>
                      <td className="center muted">{data.total}</td>
                      <td className="center green">{data.won}</td>
                      <td className="center red">{data.lost}</td>
                      <td className="center">
                        {data.won + data.lost > 0 ? formatPercent((data.won / (data.won + data.lost)) * 100) : '-'}
                      </td>
                      <td className="center orange">{formatPercent(data.avgEv)}</td>
                      <td className={`right ${data.profit >= 0 ? 'green' : 'red'}`} style={{ fontWeight: 600 }}>
                        {formatCurrency(data.profit)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Bets */}
      {stats && stats.recentBets.length > 0 && (
        <div className="table-card">
          <h3>Recent Bets</h3>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sport</th>
                  <th>Bet</th>
                  <th className="center">Odds</th>
                  <th className="center">EV</th>
                  <th className="center">Book</th>
                  <th className="center">Result</th>
                  <th className="center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentBets.map((bet) => (
                  <tr key={bet.id}>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {new Date(bet.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <span className={`sport-badge ${bet.sport}`}>
                        {bet.sport.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{bet.player}</div>
                      <div style={{ fontSize: 12 }} className="muted">
                        {bet.bet_type} {bet.line} ({bet.market})
                      </div>
                    </td>
                    <td className="center" style={{ fontWeight: 600 }}>
                      {bet.actual_odds?.toFixed(2)}
                    </td>
                    <td className="center orange" style={{ fontWeight: 600 }}>
                      +{(bet.actual_ev || bet.displayed_ev)?.toFixed(1)}%
                    </td>
                    <td className="center" style={{ fontSize: 13 }}>
                      {bet.bookmaker}
                    </td>
                    <td className="center">
                      <span className={`result-badge ${bet.result}`}>
                        {bet.result.toUpperCase()}
                      </span>
                    </td>
                    <td className="center">
                      {bet.result === 'pending' ? (
                        <div className="action-buttons">
                          <button
                            className="action-btn won"
                            onClick={() => handleResultUpdate(bet.id, 'won')}
                          >
                            Won
                          </button>
                          <button
                            className="action-btn lost"
                            onClick={() => handleResultUpdate(bet.id, 'lost')}
                          >
                            Lost
                          </button>
                          <button
                            className="action-btn void"
                            onClick={() => handleResultUpdate(bet.id, 'void')}
                          >
                            Void
                          </button>
                        </div>
                      ) : (
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(bet.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {stats && stats.totalBets === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No bets tracked yet</h3>
          <p>Start tracking bets from the NBA or Football EV pages to see your performance here.</p>
        </div>
      )}
    </div>
  );
}
