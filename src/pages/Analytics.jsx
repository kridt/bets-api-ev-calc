// src/pages/Analytics.jsx - Analytics Dashboard
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getAllPredictionsFromFirebase } from "../services/firebase";
import { getAllNBAPredictions } from "../services/nbaTracking";
import "./Analytics.css";

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    calculateStats();
  }, []);

  async function calculateStats() {
    try {
      setLoading(true);
      const [soccer, nba] = await Promise.all([
        getAllPredictionsFromFirebase(),
        getAllNBAPredictions()
      ]);

      // Overall stats
      const allPredictions = [...soccer, ...nba];
      const verified = allPredictions.filter(p =>
        (p.result?.status === 'won' || p.result?.status === 'lost') ||
        (p.status === 'won' || p.status === 'lost')
      );

      const won = verified.filter(p =>
        p.result?.status === 'won' || p.status === 'won'
      ).length;
      const lost = verified.filter(p =>
        p.result?.status === 'lost' || p.status === 'lost'
      ).length;

      const winRate = verified.length > 0 ? ((won / verified.length) * 100).toFixed(1) : 0;

      // Soccer stats
      const soccerVerified = soccer.filter(p => p.result?.status === 'won' || p.result?.status === 'lost');
      const soccerWon = soccer.filter(p => p.result?.status === 'won').length;
      const soccerWinRate = soccerVerified.length > 0 ? ((soccerWon / soccerVerified.length) * 100).toFixed(1) : 0;

      // NBA stats
      const nbaVerified = nba.filter(p => p.status === 'won' || p.status === 'lost');
      const nbaWon = nba.filter(p => p.status === 'won').length;
      const nbaWinRate = nbaVerified.length > 0 ? ((nbaWon / nbaVerified.length) * 100).toFixed(1) : 0;

      // Performance by market (Soccer)
      const marketStats = {};
      soccer.forEach(p => {
        if (p.result?.status === 'won' || p.result?.status === 'lost') {
          const market = p.prediction?.market || 'Unknown';
          if (!marketStats[market]) {
            marketStats[market] = { total: 0, won: 0, lost: 0 };
          }
          marketStats[market].total++;
          if (p.result.status === 'won') marketStats[market].won++;
          else marketStats[market].lost++;
        }
      });

      const marketStatsArray = Object.keys(marketStats).map(market => ({
        market,
        total: marketStats[market].total,
        won: marketStats[market].won,
        lost: marketStats[market].lost,
        winRate: ((marketStats[market].won / marketStats[market].total) * 100).toFixed(1)
      })).sort((a, b) => b.total - a.total);

      // Performance by stat type (NBA)
      const statTypeStats = {};
      nba.forEach(p => {
        if (p.status === 'won' || p.status === 'lost') {
          const statType = p.prediction?.statType || 'Unknown';
          if (!statTypeStats[statType]) {
            statTypeStats[statType] = { total: 0, won: 0, lost: 0 };
          }
          statTypeStats[statType].total++;
          if (p.status === 'won') statTypeStats[statType].won++;
          else statTypeStats[statType].lost++;
        }
      });

      const statTypeStatsArray = Object.keys(statTypeStats).map(statType => ({
        statType,
        total: statTypeStats[statType].total,
        won: statTypeStats[statType].won,
        lost: statTypeStats[statType].lost,
        winRate: ((statTypeStats[statType].won / statTypeStats[statType].total) * 100).toFixed(1)
      })).sort((a, b) => b.total - a.total);

      // Recent performance (last 10 verified)
      const recentVerified = verified.slice(0, 10);
      const recentWon = recentVerified.filter(p =>
        p.result?.status === 'won' || p.status === 'won'
      ).length;
      const recentWinRate = recentVerified.length > 0 ? ((recentWon / recentVerified.length) * 100).toFixed(1) : 0;

      setStats({
        overall: {
          total: allPredictions.length,
          verified: verified.length,
          pending: allPredictions.length - verified.length,
          won,
          lost,
          winRate
        },
        soccer: {
          total: soccer.length,
          verified: soccerVerified.length,
          won: soccerWon,
          lost: soccerVerified.length - soccerWon,
          winRate: soccerWinRate
        },
        nba: {
          total: nba.length,
          verified: nbaVerified.length,
          won: nbaWon,
          lost: nbaVerified.length - nbaWon,
          winRate: nbaWinRate
        },
        byMarket: marketStatsArray,
        byStatType: statTypeStatsArray,
        recent: {
          total: recentVerified.length,
          won: recentWon,
          winRate: recentWinRate
        }
      });

    } catch (error) {
      console.error('[Analytics] Error calculating stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p className="loading-text">Calculating analytics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="analytics-container">
        <div className="empty-state">No data available</div>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="analytics-header glass-effect-strong"
      >
        <h1 className="analytics-title">📊 Performance Analytics</h1>
        <p className="analytics-subtitle">
          Data-driven insights from your betting predictions
        </p>
      </motion.div>

      {/* Overall Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="analytics-section"
      >
        <h2 className="section-title">📈 Overall Performance</h2>
        <div className="stats-grid">
          <StatCard
            icon="🎯"
            title="Total Predictions"
            value={stats.overall.total}
            subtitle={`${stats.overall.verified} verified, ${stats.overall.pending} pending`}
          />
          <StatCard
            icon="✅"
            title="Win Rate"
            value={`${stats.overall.winRate}%`}
            subtitle={`${stats.overall.won} won, ${stats.overall.lost} lost`}
            highlight={parseFloat(stats.overall.winRate) >= 60}
          />
          <StatCard
            icon="⚡"
            title="Recent Form"
            value={`${stats.recent.winRate}%`}
            subtitle={`Last ${stats.recent.total} verified predictions`}
            highlight={parseFloat(stats.recent.winRate) >= 60}
          />
        </div>
      </motion.div>

      {/* Sport Comparison */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="analytics-section"
      >
        <h2 className="section-title">⚽🏀 Performance by Sport</h2>
        <div className="comparison-grid">
          <ComparisonCard
            icon="⚽"
            sport="Soccer"
            stats={stats.soccer}
          />
          <ComparisonCard
            icon="🏀"
            sport="NBA"
            stats={stats.nba}
          />
        </div>
      </motion.div>

      {/* Market Performance */}
      {stats.byMarket.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="analytics-section"
        >
          <h2 className="section-title">🎲 Performance by Market (Soccer)</h2>
          <div className="market-list">
            {stats.byMarket.map((market, index) => (
              <MarketRow key={index} {...market} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Stat Type Performance */}
      {stats.byStatType.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="analytics-section"
        >
          <h2 className="section-title">🏀 Performance by Stat Type (NBA)</h2>
          <div className="market-list">
            {stats.byStatType.map((stat, index) => (
              <StatTypeRow key={index} {...stat} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="insights-section glass-effect"
      >
        <h2 className="section-title">💡 Key Insights</h2>
        <div className="insights-list">
          {parseFloat(stats.overall.winRate) >= 60 && (
            <Insight
              icon="🎉"
              text={`Excellent performance! You're hitting ${stats.overall.winRate}% accuracy`}
              type="success"
            />
          )}
          {parseFloat(stats.overall.winRate) < 50 && stats.overall.verified >= 10 && (
            <Insight
              icon="⚠️"
              text="Win rate below 50%. Consider reviewing your prediction criteria"
              type="warning"
            />
          )}
          {stats.byMarket.length > 0 && (
            <Insight
              icon="⭐"
              text={`Best market: ${stats.byMarket[0].market} (${stats.byMarket[0].winRate}% win rate)`}
              type="info"
            />
          )}
          {stats.soccer.verified >= 5 && stats.nba.verified >= 5 && (
            <Insight
              icon="🔥"
              text={`${parseFloat(stats.soccer.winRate) > parseFloat(stats.nba.winRate) ? 'Soccer' : 'NBA'} predictions performing better`}
              type="info"
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon, title, value, subtitle, highlight }) {
  return (
    <div className={`stat-card glass-effect ${highlight ? 'highlight' : ''}`}>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-title">{title}</div>
      <div className="stat-card-subtitle">{subtitle}</div>
    </div>
  );
}

// Comparison Card Component
function ComparisonCard({ icon, sport, stats }) {
  return (
    <div className="comparison-card glass-effect">
      <div className="comparison-header">
        <span className="comparison-icon">{icon}</span>
        <span className="comparison-sport">{sport}</span>
      </div>
      <div className="comparison-stats">
        <div className="comparison-row">
          <span>Total:</span>
          <span>{stats.total}</span>
        </div>
        <div className="comparison-row">
          <span>Verified:</span>
          <span>{stats.verified}</span>
        </div>
        <div className="comparison-row">
          <span>Won:</span>
          <span className="stat-won">{stats.won}</span>
        </div>
        <div className="comparison-row">
          <span>Lost:</span>
          <span className="stat-lost">{stats.lost}</span>
        </div>
      </div>
      <div className="comparison-winrate">
        <div className="winrate-label">Win Rate</div>
        <div className="winrate-value">{stats.winRate}%</div>
        <div className="winrate-bar">
          <div
            className="winrate-fill"
            style={{ width: `${stats.winRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Market Row Component
function MarketRow({ market, total, won, lost, winRate }) {
  return (
    <div className="market-row glass-effect">
      <div className="market-info">
        <div className="market-name">{market}</div>
        <div className="market-counts">
          {total} total • {won} won • {lost} lost
        </div>
      </div>
      <div className="market-winrate">
        <div className="market-percentage">{winRate}%</div>
        <div className="market-bar">
          <div
            className="market-bar-fill"
            style={{ width: `${winRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Stat Type Row Component
function StatTypeRow({ statType, total, won, lost, winRate }) {
  return (
    <div className="market-row glass-effect">
      <div className="market-info">
        <div className="market-name">{statType}</div>
        <div className="market-counts">
          {total} total • {won} won • {lost} lost
        </div>
      </div>
      <div className="market-winrate">
        <div className="market-percentage">{winRate}%</div>
        <div className="market-bar">
          <div
            className="market-bar-fill"
            style={{ width: `${winRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Insight Component
function Insight({ icon, text, type }) {
  return (
    <div className={`insight insight-${type}`}>
      <span className="insight-icon">{icon}</span>
      <span className="insight-text">{text}</span>
    </div>
  );
}
