// src/pages/Dashboard.jsx
// Universal P&L Dashboard for all tracked bets

import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { BetTracker } from '../services/betTracker';
import { getUsername, setUsername as saveUsername, getDeviceId } from '../lib/supabase';
import { useSocket } from '../hooks/useSocket';
import ConnectionStatus from '../components/ConnectionStatus';

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
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#22c55e',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      color: '#fff',
      padding: '24px',
    }}>
      {/* Header */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 20,
        padding: '24px 32px',
        marginBottom: 24,
        border: '1px solid rgba(34, 197, 94, 0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              P&L Dashboard
            </h1>
            <p style={{ color: '#94a3b8', margin: '8px 0 0 0', fontSize: 14 }}>
              Universal bet tracking across all users
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <button
              onClick={loadStats}
              style={{
                padding: '10px 20px',
                borderRadius: 12,
                border: '1px solid rgba(34, 197, 94, 0.5)',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <select
            value={filter.sport || ''}
            onChange={(e) => setFilter(f => ({ ...f, sport: e.target.value || null }))}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(30, 41, 59, 0.8)',
              color: '#fff',
              fontSize: 14,
            }}
          >
            <option value="">All Sports</option>
            <option value="nba">NBA</option>
            <option value="football">Football</option>
          </select>

          <select
            value={filter.days}
            onChange={(e) => setFilter(f => ({ ...f, days: parseInt(e.target.value) }))}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(30, 41, 59, 0.8)',
              color: '#fff',
              fontSize: 14,
            }}
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}>
          {/* Total Profit */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: 16,
            padding: 20,
            border: `1px solid ${stats.totalProfit >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Total Profit</div>
            <div style={{
              fontSize: 32,
              fontWeight: 800,
              color: stats.totalProfit >= 0 ? '#22c55e' : '#ef4444',
            }}>
              {formatCurrency(stats.totalProfit)}
            </div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              ROI: {formatPercent(stats.roi)}
            </div>
          </div>

          {/* Win Rate */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Win Rate</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#3b82f6' }}>
              {formatPercent(stats.winRate)}
            </div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              {stats.won}W - {stats.lost}L ({stats.settled} settled)
            </div>
          </div>

          {/* Total Bets */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(168, 85, 247, 0.3)',
          }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Total Bets</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#a855f7' }}>
              {stats.totalBets}
            </div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              {stats.pending} pending
            </div>
          </div>

          {/* Avg EV */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(249, 115, 22, 0.3)',
          }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Avg EV</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#f97316' }}>
              {formatPercent(stats.avgEv)}
            </div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              per bet
            </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: 24,
          marginBottom: 24,
        }}>
          {/* Cumulative P&L Chart */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: 16,
            padding: 24,
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
              Cumulative P&L
            </h3>
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
              <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                No settled bets yet
              </div>
            )}
          </div>

          {/* Results Distribution */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: 16,
            padding: 24,
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
              Results Distribution
            </h3>
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
              <div style={{ flex: 1 }}>
                {pieData.map((entry) => (
                  <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: entry.color }} />
                    <span style={{ color: '#94a3b8', fontSize: 14 }}>{entry.name}</span>
                    <span style={{ color: '#fff', fontWeight: 600, marginLeft: 'auto' }}>{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* By Market Performance */}
      {stats && Object.keys(stats.byMarket).length > 0 && (
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
            Performance by Market
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Market</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Bets</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Won</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Lost</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Win%</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Avg EV</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.byMarket)
                  .sort((a, b) => b[1].total - a[1].total)
                  .slice(0, 10)
                  .map(([market, data]) => (
                    <tr key={market} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{market}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>{data.total}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#22c55e' }}>{data.won}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#ef4444' }}>{data.lost}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {data.won + data.lost > 0 ? formatPercent((data.won / (data.won + data.lost)) * 100) : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#f97316' }}>
                        {formatPercent(data.avgEv)}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: data.profit >= 0 ? '#22c55e' : '#ef4444',
                      }}>
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
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)',
          borderRadius: 16,
          padding: 24,
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
            Recent Bets
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Sport</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Bet</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Odds</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>EV</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Book</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Result</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentBets.map((bet) => (
                  <tr key={bet.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>
                      {new Date(bet.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: bet.sport === 'nba' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                        color: bet.sport === 'nba' ? '#f97316' : '#22c55e',
                      }}>
                        {bet.sport.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{bet.player}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {bet.bet_type} {bet.line} ({bet.market})
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                      {bet.actual_odds?.toFixed(2)}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontWeight: 600,
                      color: '#f97316',
                    }}>
                      +{(bet.actual_ev || bet.displayed_ev)?.toFixed(1)}%
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13 }}>
                      {bet.bookmaker}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          bet.result === 'won' ? 'rgba(34, 197, 94, 0.2)' :
                          bet.result === 'lost' ? 'rgba(239, 68, 68, 0.2)' :
                          bet.result === 'void' ? 'rgba(107, 114, 128, 0.2)' :
                          'rgba(245, 158, 11, 0.2)',
                        color:
                          bet.result === 'won' ? '#22c55e' :
                          bet.result === 'lost' ? '#ef4444' :
                          bet.result === 'void' ? '#6b7280' :
                          '#f59e0b',
                      }}>
                        {bet.result.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {bet.result === 'pending' ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button
                            onClick={() => handleResultUpdate(bet.id, 'won')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: 'none',
                              background: 'rgba(34, 197, 94, 0.2)',
                              color: '#22c55e',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Won
                          </button>
                          <button
                            onClick={() => handleResultUpdate(bet.id, 'lost')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: 'none',
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Lost
                          </button>
                          <button
                            onClick={() => handleResultUpdate(bet.id, 'void')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: 'none',
                              background: 'rgba(107, 114, 128, 0.2)',
                              color: '#6b7280',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            Void
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDelete(bet.id)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: 'none',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
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
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)',
          borderRadius: 16,
          padding: 48,
          textAlign: 'center',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>No bets tracked yet</h3>
          <p style={{ color: '#94a3b8', margin: 0 }}>
            Start tracking bets from the NBA or Football EV pages to see your performance here.
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
