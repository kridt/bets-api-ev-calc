import { useState } from 'react';

export default function MatchCard({ matchData, rank }) {
  const [expandedBet, setExpandedBet] = useState(null);
  const [showAllBets, setShowAllBets] = useState(false);

  // Check if this is odds-only mode (no predictions/value bets)
  const isOddsOnly = matchData.isOddsOnly || matchData.valueBets.length === 0;

  // For odds-only mode, use a default style
  const bestBet = isOddsOnly ? null : matchData.valueBets[0];
  const evGrade = isOddsOnly
    ? { color: '#667eea', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
    : getEVGrade(bestBet.bestOdds.ev);
  const displayedBets = showAllBets ? matchData.valueBets : matchData.valueBets.slice(0, 3);

  return (
    <div style={{
      padding: 24,
      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)',
      borderRadius: 20,
      border: `2px solid ${evGrade.color}`,
      boxShadow: `0 4px 12px ${evGrade.color}40`,
      position: 'relative'
    }}>
      {/* Rank Badge */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        padding: '8px 16px',
        borderRadius: 12,
        background: evGrade.gradient,
        fontSize: 14,
        fontWeight: 800,
        color: 'white',
        boxShadow: `0 2px 8px ${evGrade.color}60`
      }}>
        #{rank} {!isOddsOnly && `• ${matchData.valueBets.length} Bets`}
      </div>

      {/* Match Header */}
      <div style={{ marginBottom: 20, paddingRight: 140 }}>
        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: '#e2e8f0' }}>
          {matchData.match.home} vs {matchData.match.away}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#94a3b8', flexWrap: 'wrap' }}>
          <span>🏆 {matchData.match.league?.name}</span>
          <span>📅 {new Date(matchData.match.date).toLocaleString('en-GB', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</span>
          {!isOddsOnly && <span style={{ color: evGrade.color, fontWeight: 600 }}>⚡ Best: +{matchData.bestEV.toFixed(1)}% EV</span>}
        </div>
      </div>

      {isOddsOnly ? (
        // === ODDS-ONLY MODE ===
        <div>
          <div style={{
            padding: 20,
            background: 'rgba(102, 126, 234, 0.1)',
            borderRadius: 12,
            border: '1px solid rgba(102, 126, 234, 0.2)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#667eea', marginBottom: 8 }}>
              📊 Live Odds Available
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Statistical predictions not available for this league yet
            </div>
          </div>
        </div>
      ) : (
        // === VALUE BETS MODE ===
        <>
          {/* Team Stats Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 20
          }}>
            <div style={{
              padding: 16,
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: 12,
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginBottom: 8 }}>
                🏠 HOME: {matchData.match.home}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Season averages loaded for all markets
              </div>
            </div>
            <div style={{
              padding: 16,
              background: 'rgba(245, 158, 11, 0.1)',
              borderRadius: 12,
              border: '1px solid rgba(245, 158, 11, 0.2)'
            }}>
              <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginBottom: 8 }}>
                ✈️ AWAY: {matchData.match.away}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Recent form and stats analyzed
              </div>
            </div>
          </div>

          {/* Value Bets Header */}
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 16,
            color: evGrade.color,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            💰 {matchData.valueBets.length} VALUE BETTING OPPORTUNITIES
          </div>

          {/* Value Bets List */}
          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            {displayedBets.map((bet, index) => (
              <ValueBetItem
                key={index}
                bet={bet}
                matchData={matchData}
                isExpanded={expandedBet === index}
                onToggle={() => setExpandedBet(expandedBet === index ? null : index)}
              />
            ))}
          </div>

          {/* Show More Button */}
          {matchData.valueBets.length > 3 && (
            <button
              onClick={() => setShowAllBets(!showAllBets)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(100, 116, 139, 0.2)',
                border: '1px solid rgba(100, 116, 139, 0.3)',
                borderRadius: 12,
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              {showAllBets ? 'Show Less' : `Show ${matchData.valueBets.length - 3} More Bets`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ValueBetItem({ bet, matchData, isExpanded, onToggle }) {
  const [showAllBookmakers, setShowAllBookmakers] = useState(false);
  const displayBookmakers = showAllBookmakers ? bet.allBookmakers : bet.allBookmakers.slice(0, 3);

  const impliedProbability = (1 / bet.bestOdds.odds) * 100;
  const probabilityDifference = bet.prediction.probability - impliedProbability;

  return (
    <div style={{
      padding: 16,
      background: 'rgba(15, 23, 42, 0.6)',
      borderRadius: 12,
      border: `1px solid ${getEVGrade(bet.bestOdds.ev).color}40`
    }}>
      {/* Bet Header - Always Visible */}
      <div
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          marginBottom: 12
        }}
      >
        {/* Main bet info row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          marginBottom: 12
        }}>
          {/* Left: Market & Selection */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
              {bet.prediction.emoji} {bet.prediction.marketName}
            </div>
            <div style={{ fontSize: 14, color: '#10b981', fontWeight: 600, marginBottom: 4 }}>
              {bet.prediction.selection.toUpperCase()} {formatLine(bet.prediction.line)}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Our probability: {bet.prediction.probability.toFixed(1)}% • <span style={{ color: '#10b981', fontWeight: 600 }}>{bet.bestOdds.bookmaker || 'Best Available'}</span> @ {bet.bestOdds.odds?.toFixed(2)}
            </div>
          </div>

          {/* Right: EV Badge */}
          <div style={{
            padding: '12px 16px',
            background: getEVGrade(bet.bestOdds.ev).gradient,
            borderRadius: 12,
            textAlign: 'center',
            minWidth: 80
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', marginBottom: 2, fontWeight: 600 }}>EV</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'white' }}>
              +{bet.bestOdds.ev.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Prominent Bookmaker Display */}
        <div style={{
          padding: 12,
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)',
          border: '2px solid rgba(16, 185, 129, 0.4)',
          borderRadius: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
              Play at
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>
              {bet.bestOdds.bookmaker || 'Best Available'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
              Best Odds
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b' }}>
              {bet.bestOdds.odds?.toFixed(2) || 'N/A'}
            </div>
          </div>
          <div style={{ fontSize: 18, color: '#667eea' }}>
            {isExpanded ? '▼' : '▶'}
          </div>
        </div>

        {/* Additional Bookmakers - if any */}
        {bet.allBookmakers.length > 1 && (
          <div style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 10
          }}>
            <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>Also available:</span>
            {displayBookmakers.slice(1, 4).map((bookie, i) => (
              <div
                key={i}
                style={{
                  padding: '4px 10px',
                  background: 'rgba(100, 116, 139, 0.15)',
                  border: '1px solid rgba(100, 116, 139, 0.2)',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ color: '#94a3b8' }}>{bookie.bookmaker}</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>{bookie.odds}</span>
              </div>
            ))}
            {bet.allBookmakers.length > 4 && !isExpanded && (
              <div style={{
                padding: '4px 10px',
                background: 'rgba(139, 92, 246, 0.15)',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                color: '#c4b5fd'
              }}>
                +{bet.allBookmakers.length - 4} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div>
          {/* Stats */}
          {bet.prediction.predictedTotal && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              padding: 16,
              background: 'rgba(102, 126, 234, 0.1)',
              borderRadius: 12,
              marginBottom: 16
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#10b981', marginBottom: 4, fontWeight: 600 }}>HOME AVG</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>
                  {bet.prediction.homeAvg?.toFixed(1)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#667eea', marginBottom: 4, fontWeight: 600 }}>PREDICTED</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#667eea' }}>
                  {bet.prediction.predictedTotal?.toFixed(1)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4, fontWeight: 600 }}>AWAY AVG</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>
                  {bet.prediction.awayAvg?.toFixed(1)}
                </div>
              </div>
            </div>
          )}

          {/* Analysis */}
          <div style={{
            padding: 16,
            background: 'rgba(236, 72, 153, 0.1)',
            borderRadius: 12,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.6
          }}>
            <div style={{ fontWeight: 700, color: '#ec4899', marginBottom: 8 }}>
              💡 WHY THIS IS A VALUE BET
            </div>
            <div style={{ color: '#94a3b8', marginBottom: 6 }}>
              • Statistical probability: <strong style={{ color: '#e2e8f0' }}>{bet.prediction.probability.toFixed(1)}%</strong> <span style={{ color: '#64748b' }}>({calculateDecimalOdds(bet.prediction.probability)} odds)</span>
            </div>
            <div style={{ color: '#94a3b8', marginBottom: 6 }}>
              • <span style={{ color: '#10b981', fontWeight: 600 }}>{bet.bestOdds.bookmaker || 'Bookmaker'}</span> probability: <strong style={{ color: '#e2e8f0' }}>{impliedProbability.toFixed(1)}%</strong> <span style={{ color: '#64748b' }}>({bet.bestOdds.odds.toFixed(2)} odds)</span>
            </div>
            <div style={{ color: '#10b981', fontWeight: 600 }}>
              ✅ You have a +{probabilityDifference.toFixed(1)}% edge
            </div>
          </div>

          {/* AI Reasoning - if available */}
          {bet.aiReasoning && (
            <div style={{
              padding: 16,
              background: 'rgba(139, 92, 246, 0.1)',
              borderRadius: 12,
              marginBottom: 16,
              fontSize: 13,
              lineHeight: 1.6,
              border: '1px solid rgba(139, 92, 246, 0.2)'
            }}>
              <div style={{ fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>
                🤖 AI LINE SELECTION
              </div>
              <div style={{ color: '#c4b5fd' }}>
                {bet.aiReasoning}
              </div>
            </div>
          )}

          {/* Bookmakers */}
          <div style={{
            padding: 16,
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: 12
          }}>
            <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginBottom: 12 }}>
              📊 BEST BOOKMAKER ODDS
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {displayBookmakers.map((bookie, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 8
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{bookie.bookmaker}</div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 6 }}>Odds:</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>{bookie.odds}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 6 }}>EV:</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: getEVGrade(bookie.ev).color }}>
                        +{bookie.ev.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {bet.allBookmakers.length > 3 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllBookmakers(!showAllBookmakers);
                }}
                style={{
                  marginTop: 8,
                  width: '100%',
                  padding: '8px',
                  background: 'rgba(100, 116, 139, 0.2)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {showAllBookmakers ? 'Show Less' : `Show ${bet.allBookmakers.length - 3} More Bookmakers`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Format line to always show .5 for totals markets
 * e.g., 10 -> 10.5, 2 -> 2.5, 10.5 -> 10.5
 */
function formatLine(line) {
  if (line === null || line === undefined) return '';

  // If already has .5, return as is
  if (line % 1 === 0.5) {
    return line.toFixed(1);
  }

  // If whole number, add .5
  if (Number.isInteger(line)) {
    return `${line}.5`;
  }

  // Otherwise show with 1 decimal
  return line.toFixed(1);
}

/**
 * Calculate decimal odds from probability percentage
 * e.g., 65% probability = 1.54 odds
 */
function calculateDecimalOdds(probabilityPercent) {
  const probability = probabilityPercent / 100;
  const odds = 1 / probability;
  return odds.toFixed(2);
}

function getEVGrade(ev) {
  if (ev >= 15) {
    return {
      label: 'EXCELLENT',
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    };
  } else if (ev >= 10) {
    return {
      label: 'VERY GOOD',
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
    };
  } else if (ev >= 5) {
    return {
      label: 'GOOD',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    };
  } else {
    return {
      label: 'FAIR',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
    };
  }
}
