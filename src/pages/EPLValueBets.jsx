// src/pages/EPLValueBets.jsx - Multi-League Value Bets from Firebase (Server-side calculated)
import { useState, useEffect } from 'react';
import MatchCard from '../components/MatchCard.jsx';

// League configurations - Only EPL is currently supported by the backend API
const LEAGUES = [
  { id: 'epl', name: 'Premier League', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', code: 'PL' }
];

// API base URL - must be set in Vercel env vars for production
const API_BASE_URL = import.meta.env.VITE_FOOTBALL_API_URL || 'http://localhost:4000';

export default function EPLValueBets() {
  const [matches, setMatches] = useState([]);
  const [filteredMatches, setFilteredMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [maxOdds, setMaxOdds] = useState(3.0);
  const [selectedLeague, setSelectedLeague] = useState('epl');

  useEffect(() => {
    fetchValueBets();
  }, [selectedLeague]);

  // Filter matches when maxOdds changes
  useEffect(() => {
    if (matches.length > 0) {
      filterMatchesByMaxOdds(matches, maxOdds);
    }
  }, [maxOdds]);

  function filterMatchesByMaxOdds(matchList, maxOddsThreshold) {
    const filtered = matchList.map(match => {
      // Filter value bets to only include those with odds <= maxOddsThreshold
      // Note: bestOdds is an object with { odds, bookmaker, ev, url }
      const filteredBets = match.valueBets.filter(bet => {
        const odds = bet.bestOdds?.odds || bet.bestOdds;
        return odds <= maxOddsThreshold;
      });

      if (filteredBets.length === 0) return null;

      return {
        ...match,
        valueBets: filteredBets,
        totalEV: filteredBets.reduce((sum, bet) => sum + (bet.bestOdds?.ev || 0), 0),
        bestEV: Math.max(...filteredBets.map(bet => bet.bestOdds?.ev || 0))
      };
    }).filter(match => match !== null);

    console.log(`🎯 Filtered to ${filtered.length} matches with odds <= ${maxOddsThreshold}`);
    setFilteredMatches(filtered);
  }

  async function fetchValueBets() {
    try {
      setLoading(true);
      setError(null);

      const leagueParam = `&league=${LEAGUES.find(l => l.id === selectedLeague)?.code || 'PL'}`;
      const url = `${API_BASE_URL}/api/ev-bets?minEV=0&maxOdds=${maxOdds}&limit=100${leagueParam}`;

      console.log(`📊 Fetching value bets from: ${url}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch value bets');
      }

      // Transform data for MatchCard component
      const transformedMatches = (data.matches || []).map(match => ({
        match: {
          home: match.homeTeam,
          away: match.awayTeam,
          date: match.kickoff,
          league: { name: match.league, id: match.leagueCode },
          kickoff: match.kickoff
        },
        valueBets: match.valueBets.map(bet => ({
          prediction: {
            market: bet.statKey,
            marketName: mapMarketName(bet.statKey),
            selection: bet.selection,
            line: bet.line,
            probability: bet.probability,
            predictedTotal: bet.predictedTotal,
            homeAvg: bet.homeAvg,
            awayAvg: bet.awayAvg,
            emoji: getMarketEmoji(bet.statKey),
            confidence: bet.confidence
          },
          bestOdds: {
            bookmaker: bet.bestBookmaker,
            odds: bet.bestOdds,
            ev: bet.bestEV,
            url: bet.bestUrl
          },
          allBookmakers: bet.allBookmakers || [],
          fairOdds: bet.fairOdds,
          aiReasoning: generateReasoning(bet)
        })),
        totalEV: match.totalEV,
        bestEV: match.bestEV
      }));

      console.log(`✅ Received ${transformedMatches.length} matches with value bets`);

      setMatches(transformedMatches);
      filterMatchesByMaxOdds(transformedMatches, maxOdds);
      setLastUpdated(data.generatedAt || new Date().toISOString());

      setStats({
        totalMatches: data.totalMatches || transformedMatches.length,
        valueBetsCount: data.totalBets || transformedMatches.reduce((sum, m) => sum + m.valueBets.length, 0),
        matchesWithValue: transformedMatches.length,
        avgEV: transformedMatches.length > 0
          ? transformedMatches.reduce((sum, m) => sum + m.bestEV, 0) / transformedMatches.length
          : 0
      });

    } catch (err) {
      console.error('Error fetching value bets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function triggerRefresh() {
    try {
      setRefreshing(true);
      console.log('🔄 Triggering manual EV refresh...');

      const response = await fetch(`${API_BASE_URL}/api/ev-bets/refresh`, { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        console.log(`✅ Refresh complete: ${data.stats?.valueBetsFound || 0} value bets found`);
        // Refetch the updated data
        await fetchValueBets();
      } else {
        console.error('Refresh failed:', data.error);
      }
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>⚽</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          Loading Value Bets...
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
          Fetching pre-calculated EV bets from database
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'center',
          fontSize: 13,
          color: '#64748b'
        }}>
          <div>📊 Getting active value bets...</div>
          <div>💾 Loading from Firebase...</div>
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
        <div style={{ fontSize: 18, color: '#ef4444', marginBottom: 8 }}>
          Error Loading Value Bets
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8' }}>
          {error}
        </div>
        <button
          onClick={fetchValueBets}
          style={{
            marginTop: 16,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: 12,
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 32,
        padding: 24,
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)',
        borderRadius: 20,
        border: '1px solid rgba(16, 185, 129, 0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 32 }}>🎯</div>
          <div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 900,
              margin: 0,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Premier League Value Bets
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '4px 0 0 0' }}>
              Server-calculated EV bets • Updated every 2 minutes
            </p>
          </div>
        </div>

        {/* Max Odds Filter */}
        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8
          }}>
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🎲 Max Odds Filter
            </div>
            <div style={{ fontSize: 14, color: '#10b981', fontWeight: 700 }}>
              ≤ {maxOdds.toFixed(1)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min="1.5"
              max="10.0"
              step="0.5"
              value={maxOdds}
              onChange={(e) => setMaxOdds(parseFloat(e.target.value))}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                outline: 'none',
                background: `linear-gradient(to right, #10b981 0%, #10b981 ${((maxOdds - 1.5) / (10 - 1.5)) * 100}%, rgba(100, 116, 139, 0.3) ${((maxOdds - 1.5) / (10 - 1.5)) * 100}%, rgba(100, 116, 139, 0.3) 100%)`,
                appearance: 'none',
                cursor: 'pointer'
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {[2.0, 3.0, 5.0].map(preset => (
                <button
                  key={preset}
                  onClick={() => setMaxOdds(preset)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: maxOdds === preset
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'rgba(100, 116, 139, 0.2)',
                    color: maxOdds === preset ? 'white' : '#94a3b8',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
            💡 Lower odds = higher probability but smaller payouts
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginTop: 16
          }}>
            <StatBox label="Matches" value={stats.totalMatches} color="#667eea" />
            <StatBox label="Value Bets" value={stats.valueBetsCount} color="#f59e0b" />
            <StatBox label="Avg EV" value={`${stats.avgEV.toFixed(1)}%`} color="#ec4899" />
            {lastUpdated && (
              <StatBox
                label="Last Update"
                value={new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                color="#10b981"
              />
            )}
          </div>
        )}
      </div>

      {/* Value Bets List */}
      {filteredMatches.length === 0 ? (
        <div style={{
          padding: 60,
          textAlign: 'center',
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
          <div style={{ fontSize: 18, color: '#94a3b8', marginBottom: 8 }}>
            No value bets found right now
          </div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
            The server scans for value bets every 2 minutes. Try refreshing or check back later.
          </div>
          <button
            onClick={triggerRefresh}
            disabled={refreshing}
            style={{
              padding: '12px 24px',
              background: refreshing
                ? 'rgba(100, 116, 139, 0.3)'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: 12,
              color: 'white',
              fontWeight: 600,
              cursor: refreshing ? 'wait' : 'pointer'
            }}
          >
            {refreshing ? '🔄 Scanning...' : '🔄 Trigger Scan'}
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
            <span>💰 Found {stats.valueBetsCount} value bets across {filteredMatches.length} matches</span>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
              Auto-updates every 2 minutes
            </span>
          </div>

          <div style={{ display: 'grid', gap: 24 }}>
            {filteredMatches.map((matchData, index) => (
              <MatchCard key={`${matchData.match.home}-${matchData.match.away}-${index}`} matchData={matchData} rank={index + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ textAlign: 'center', marginTop: 32, display: 'flex', gap: 16, justifyContent: 'center' }}>
        <button
          onClick={fetchValueBets}
          style={{
            padding: '12px 32px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: 12,
            color: 'white',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
          }}
        >
          🔄 Refresh Data
        </button>
        <button
          onClick={triggerRefresh}
          disabled={refreshing}
          style={{
            padding: '12px 32px',
            background: refreshing
              ? 'rgba(100, 116, 139, 0.3)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none',
            borderRadius: 12,
            color: 'white',
            fontWeight: 600,
            fontSize: 14,
            cursor: refreshing ? 'wait' : 'pointer',
            boxShadow: refreshing ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}
        >
          {refreshing ? '🔄 Scanning...' : '⚡ Force New Scan'}
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      padding: 16,
      background: 'rgba(30, 41, 59, 0.5)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color }}>
        {value}
      </div>
    </div>
  );
}

// Helper functions
function mapMarketName(statKey) {
  const map = {
    'corners': 'Corners',
    'yellow_cards': 'Yellow Cards',
    'goals': 'Goals',
    'shots_on_target': 'Shots on Target'
  };
  return map[statKey] || statKey;
}

function getMarketEmoji(statKey) {
  const map = {
    'corners': '🚩',
    'yellow_cards': '🟨',
    'goals': '⚽',
    'shots_on_target': '🎯'
  };
  return map[statKey] || '⚽';
}

function generateReasoning(bet) {
  const reasons = [];

  if (bet.probability > 65) {
    reasons.push(`high confidence (${bet.probability.toFixed(0)}%)`);
  } else if (bet.probability > 60) {
    reasons.push(`solid probability (${bet.probability.toFixed(0)}%)`);
  }

  if (bet.predictedTotal) {
    const margin = bet.selection === 'under'
      ? bet.line - bet.predictedTotal
      : bet.predictedTotal - bet.line;

    if (margin > 0.5) {
      reasons.push(`${margin.toFixed(1)} margin of safety`);
    }
  }

  if (bet.bestEV > 10) {
    reasons.push(`excellent value (${bet.bestEV.toFixed(1)}% EV)`);
  } else if (bet.bestEV > 5) {
    reasons.push(`good edge (${bet.bestEV.toFixed(1)}% EV)`);
  }

  if (reasons.length === 0) {
    return `${bet.bestEV.toFixed(1)}% edge at ${bet.bestBookmaker}`;
  }

  return reasons.join(' • ');
}
