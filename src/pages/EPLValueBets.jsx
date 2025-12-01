// src/pages/EPLValueBets.jsx - Multi-League Value Bets with Sorting & Filtering
import { useState, useEffect } from 'react';
import MatchCard from '../components/MatchCard.jsx';

// League configurations - All leagues now available via football-data.org
const LEAGUES = [
  { id: 'all', name: 'All Leagues', emoji: '🌍', code: null, available: true, useMultiLeague: true },
  { id: 'epl', name: 'Premier League', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', code: 'PL', available: true, useMultiLeague: false },
  { id: 'laliga', name: 'La Liga', emoji: '🇪🇸', code: 'PD', available: true, useMultiLeague: true },
  { id: 'bundesliga', name: 'Bundesliga', emoji: '🇩🇪', code: 'BL1', available: true, useMultiLeague: true },
  { id: 'seriea', name: 'Serie A', emoji: '🇮🇹', code: 'SA', available: true, useMultiLeague: true },
  { id: 'ligue1', name: 'Ligue 1', emoji: '🇫🇷', code: 'FL1', available: true, useMultiLeague: true },
  { id: 'ucl', name: 'Champions League', emoji: '🏆', code: 'CL', available: true, useMultiLeague: true },
  { id: 'uel', name: 'Europa League', emoji: '🌟', code: 'EL', available: true, useMultiLeague: true },
];

// Sort options
const SORT_OPTIONS = [
  { id: 'ev_high', label: 'EV% High → Low', icon: '📈' },
  { id: 'ev_low', label: 'EV% Low → High', icon: '📉' },
  { id: 'odds_low', label: 'Odds Low → High', icon: '🎯' },
  { id: 'odds_high', label: 'Odds High → Low', icon: '💰' },
  { id: 'prob_high', label: 'Probability High', icon: '📊' },
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
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [sortBy, setSortBy] = useState('ev_high');
  const [minEV, setMinEV] = useState(0);
  const [availableBookmakers, setAvailableBookmakers] = useState([]);
  const [selectedBookmakers, setSelectedBookmakers] = useState([]);

  useEffect(() => {
    fetchValueBets();
  }, [selectedLeague]);

  // Filter and sort matches when filters change
  useEffect(() => {
    if (matches.length > 0) {
      applyFiltersAndSort(matches);
    }
  }, [maxOdds, sortBy, minEV, selectedBookmakers]);

  function applyFiltersAndSort(matchList) {
    let processed = matchList.map(match => {
      // Filter value bets by odds, EV, and selected bookmakers
      const filteredBets = match.valueBets.filter(bet => {
        const odds = bet.bestOdds?.odds || bet.bestOdds;
        const ev = bet.bestOdds?.ev || 0;
        const bookmaker = bet.bestOdds?.bookmaker || '';

        // Check if bet passes basic filters
        if (odds > maxOdds || ev < minEV) return false;

        // If no bookmakers selected, show all. Otherwise filter by selected.
        if (selectedBookmakers.length > 0) {
          // Check if any of the bet's bookmakers match selected ones
          const betBookmakers = (bet.allBookmakers || []).map(b => b.bookmaker);
          const hasSelectedBookmaker = selectedBookmakers.some(sb =>
            betBookmakers.includes(sb) || bookmaker === sb
          );
          if (!hasSelectedBookmaker) return false;
        }

        return true;
      }).map(bet => {
        // If bookmakers are filtered, recalculate best odds from selected bookmakers only
        if (selectedBookmakers.length > 0 && bet.allBookmakers?.length > 0) {
          const filteredBookmakers = bet.allBookmakers.filter(b =>
            selectedBookmakers.includes(b.bookmaker)
          );
          if (filteredBookmakers.length > 0) {
            const best = filteredBookmakers.reduce((best, curr) =>
              curr.odds > best.odds ? curr : best
            );
            return {
              ...bet,
              bestOdds: {
                ...bet.bestOdds,
                bookmaker: best.bookmaker,
                odds: best.odds,
                ev: best.ev || bet.bestOdds.ev
              },
              filteredBookmakers
            };
          }
        }
        return { ...bet, filteredBookmakers: bet.allBookmakers };
      });

      if (filteredBets.length === 0) return null;

      // Sort bets within match based on sortBy
      const sortedBets = [...filteredBets].sort((a, b) => {
        const evA = a.bestOdds?.ev || 0;
        const evB = b.bestOdds?.ev || 0;
        const oddsA = a.bestOdds?.odds || 0;
        const oddsB = b.bestOdds?.odds || 0;
        const probA = a.prediction?.probability || 0;
        const probB = b.prediction?.probability || 0;

        switch (sortBy) {
          case 'ev_high': return evB - evA;
          case 'ev_low': return evA - evB;
          case 'odds_low': return oddsA - oddsB;
          case 'odds_high': return oddsB - oddsA;
          case 'prob_high': return probB - probA;
          default: return evB - evA;
        }
      });

      return {
        ...match,
        valueBets: sortedBets,
        totalEV: sortedBets.reduce((sum, bet) => sum + (bet.bestOdds?.ev || 0), 0),
        bestEV: Math.max(...sortedBets.map(bet => bet.bestOdds?.ev || 0))
      };
    }).filter(match => match !== null);

    // Sort matches by best EV
    processed.sort((a, b) => {
      switch (sortBy) {
        case 'ev_high': return b.bestEV - a.bestEV;
        case 'ev_low': return a.bestEV - b.bestEV;
        default: return b.bestEV - a.bestEV;
      }
    });

    console.log(`🎯 Filtered to ${processed.length} matches, ${processed.reduce((s, m) => s + m.valueBets.length, 0)} bets`);
    setFilteredMatches(processed);
  }

  async function fetchValueBets() {
    try {
      setLoading(true);
      setError(null);

      const league = LEAGUES.find(l => l.id === selectedLeague);
      if (league && !league.available && selectedLeague !== 'all') {
        setMatches([]);
        setFilteredMatches([]);
        setStats({ totalMatches: 0, valueBetsCount: 0, avgEV: 0 });
        setLoading(false);
        return;
      }

      // Determine which endpoint to use based on league
      // Premier League uses the original /api/ev-bets (balldontlie.io)
      // Other leagues use /api/football/value-bets (football-data.org)
      const useMultiLeague = league?.useMultiLeague ?? (selectedLeague !== 'epl');
      const baseEndpoint = useMultiLeague ? '/api/football/value-bets' : '/api/ev-bets';
      const leagueParam = selectedLeague === 'all' ? '' : `&league=${league?.code || 'PL'}`;
      const url = `${API_BASE_URL}${baseEndpoint}?minEV=0&maxOdds=10&limit=100${leagueParam}`;

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

      // Extract unique bookmakers from all bets
      const bookmakerSet = new Set();
      transformedMatches.forEach(match => {
        match.valueBets.forEach(bet => {
          if (bet.bestOdds?.bookmaker) bookmakerSet.add(bet.bestOdds.bookmaker);
          (bet.allBookmakers || []).forEach(b => {
            if (b.bookmaker) bookmakerSet.add(b.bookmaker);
          });
        });
      });
      const uniqueBookmakers = Array.from(bookmakerSet).sort();
      console.log(`📚 Found ${uniqueBookmakers.length} bookmakers:`, uniqueBookmakers);
      setAvailableBookmakers(uniqueBookmakers);

      setMatches(transformedMatches);
      applyFiltersAndSort(transformedMatches);
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
        console.log(`✅ Refresh complete`);
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
          Fetching pre-calculated EV bets from server
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
        <div style={{ fontSize: 14, color: '#94a3b8' }}>{error}</div>
        <button onClick={fetchValueBets} style={buttonStyle}>Retry</button>
      </div>
    );
  }

  const selectedLeagueData = LEAGUES.find(l => l.id === selectedLeague);

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: 24,
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
              Football Value Bets
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '4px 0 0 0' }}>
              Statistical edge finder • Updated every 2 hours
            </p>
          </div>
        </div>

        {/* League Selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
            ⚽ League
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {LEAGUES.map(league => (
              <button
                key={league.id}
                onClick={() => league.available && setSelectedLeague(league.id)}
                disabled={!league.available}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: selectedLeague === league.id
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : league.available ? 'rgba(100, 116, 139, 0.2)' : 'rgba(100, 116, 139, 0.1)',
                  color: selectedLeague === league.id ? 'white' : league.available ? '#94a3b8' : '#64748b',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: league.available ? 'pointer' : 'not-allowed',
                  opacity: league.available ? 1 : 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>{league.emoji}</span>
                <span>{league.name}</span>
                {!league.available && <span style={{ fontSize: 10, opacity: 0.7 }}>Soon</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Sort & Filter Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
          {/* Sort By */}
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
              📊 Sort By
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

          {/* Min EV Filter */}
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
              💰 Min EV%: {minEV}%
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={minEV}
              onChange={(e) => setMinEV(parseInt(e.target.value))}
              style={{
                width: '100%',
                height: 6,
                borderRadius: 3,
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${minEV * 10}%, rgba(100, 116, 139, 0.3) ${minEV * 10}%, rgba(100, 116, 139, 0.3) 100%)`,
                appearance: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* Max Odds Filter */}
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
              🎲 Max Odds: {maxOdds.toFixed(1)}
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
                height: 6,
                borderRadius: 3,
                background: `linear-gradient(to right, #10b981 0%, #10b981 ${((maxOdds - 1.5) / 8.5) * 100}%, rgba(100, 116, 139, 0.3) ${((maxOdds - 1.5) / 8.5) * 100}%, rgba(100, 116, 139, 0.3) 100%)`,
                appearance: 'none',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>

        {/* Quick Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Quick:</span>
          {[
            { label: 'Safe (1.5-2.0)', maxOdds: 2.0, minEV: 3 },
            { label: 'Balanced (2.0-3.0)', maxOdds: 3.0, minEV: 4 },
            { label: 'Value (3.0+)', maxOdds: 10, minEV: 5 },
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => { setMaxOdds(preset.maxOdds); setMinEV(preset.minEV); }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'rgba(100, 116, 139, 0.2)',
                color: '#94a3b8',
                fontWeight: 500,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Bookmaker Filter */}
        {availableBookmakers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10
            }}>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                🏢 Bookmakers {selectedBookmakers.length > 0 && `(${selectedBookmakers.length} selected)`}
              </div>
              {selectedBookmakers.length > 0 && (
                <button
                  onClick={() => setSelectedBookmakers([])}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    fontWeight: 500,
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableBookmakers.map(bookmaker => {
                const isSelected = selectedBookmakers.includes(bookmaker);
                return (
                  <button
                    key={bookmaker}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedBookmakers(prev => prev.filter(b => b !== bookmaker));
                      } else {
                        setSelectedBookmakers(prev => [...prev, bookmaker]);
                      }
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: isSelected ? '2px solid #10b981' : '1px solid rgba(100, 116, 139, 0.3)',
                      background: isSelected
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(30, 41, 59, 0.6)',
                      color: isSelected ? '#10b981' : '#94a3b8',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {isSelected && <span>✓</span>}
                    {bookmaker}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
            gap: 12
          }}>
            <StatBox label="Matches" value={filteredMatches.length} color="#667eea" />
            <StatBox label="Value Bets" value={filteredMatches.reduce((s, m) => s + m.valueBets.length, 0)} color="#f59e0b" />
            <StatBox label="Avg EV" value={`${stats.avgEV.toFixed(1)}%`} color="#ec4899" />
            {lastUpdated && (
              <StatBox
                label="Updated"
                value={new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                color="#10b981"
              />
            )}
          </div>
        )}
      </div>

      {/* League Info Message - shows when multi-league API needs to be configured */}
      {selectedLeagueData?.useMultiLeague && selectedLeague !== 'all' && filteredMatches.length === 0 && !loading && (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: 'rgba(59, 130, 246, 0.1)',
          borderRadius: 20,
          border: '1px solid rgba(59, 130, 246, 0.3)',
          marginBottom: 24
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>ℹ️</div>
          <div style={{ fontSize: 20, color: '#3b82f6', fontWeight: 700, marginBottom: 8 }}>
            {selectedLeagueData.name} Data Loading
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8' }}>
            Multi-league data requires a Football-Data.org API key. Check back soon or try Premier League.
          </div>
        </div>
      )}

      {/* Value Bets List */}
      {(selectedLeagueData?.available || selectedLeague === 'all') && (
        <>
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
                No value bets match your filters
              </div>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                Try adjusting Max Odds or Min EV%, or wait for new matches.
              </div>
              <button onClick={triggerRefresh} disabled={refreshing} style={buttonStyle}>
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
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <span>💰 {filteredMatches.reduce((s, m) => s + m.valueBets.length, 0)} value bets across {filteredMatches.length} matches</span>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                  Sorted by: {SORT_OPTIONS.find(s => s.id === sortBy)?.label}
                </span>
              </div>

              <div style={{ display: 'grid', gap: 24 }}>
                {filteredMatches.map((matchData, index) => (
                  <MatchCard key={`${matchData.match.home}-${matchData.match.away}-${index}`} matchData={matchData} rank={index + 1} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Action Buttons */}
      <div style={{ textAlign: 'center', marginTop: 32, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={fetchValueBets} style={buttonStyle}>🔄 Refresh Data</button>
        <button onClick={triggerRefresh} disabled={refreshing} style={{...buttonStyle, background: refreshing ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}}>
          {refreshing ? '🔄 Scanning...' : '⚡ Force New Scan'}
        </button>
      </div>
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

function mapMarketName(statKey) {
  const map = {
    'corners': 'Corners',
    'yellow_cards': 'Yellow Cards',
    'goals': 'Goals',
    'shots_on_target': 'Shots on Target',
    'tackles': 'Tackles',
    'offsides': 'Offsides',
    'assists': 'Assists',
    'btts': 'Both Teams To Score'
  };
  return map[statKey] || statKey;
}

function getMarketEmoji(statKey) {
  const map = {
    'corners': '🚩',
    'yellow_cards': '🟨',
    'goals': '⚽',
    'shots_on_target': '🎯',
    'tackles': '🦶',
    'offsides': '🚫',
    'assists': '🤝',
    'btts': '🥅'
  };
  return map[statKey] || '⚽';
}

function generateReasoning(bet) {
  const parts = [];
  if (bet.probability > 60) parts.push(`${bet.probability.toFixed(0)}% probability`);
  if (bet.bestEV > 5) parts.push(`+${bet.bestEV.toFixed(1)}% EV`);
  if (bet.bestBookmaker) parts.push(`@ ${bet.bestBookmaker}`);
  return parts.join(' • ') || 'Value opportunity';
}
