// src/components/BettingPredictions.jsx
import { useMemo } from 'react';
import { calculateBettingPredictions } from '../utils/probability';

export default function BettingPredictions({ homeDetails, awayDetails, homeName, awayName }) {
  const predictions = useMemo(() => {
    if (!homeDetails?.length || !awayDetails?.length) return [];

    return calculateBettingPredictions(homeDetails, awayDetails, {
      targetProbability: 0.60,
      minProbability: 0.58,
      maxProbability: 0.62
    });
  }, [homeDetails, awayDetails]);

  if (!predictions || predictions.length === 0) {
    return null;
  }

  return (
    <div style={{
      padding: 24,
      borderRadius: 20,
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.3)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{
          width: 4,
          height: 24,
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          borderRadius: 4,
        }} />
        <h3 style={{
          fontSize: 20,
          fontWeight: 800,
          margin: 0,
        }}>
          Value Bet Predictions
        </h3>
        <div style={{
          marginLeft: 'auto',
          fontSize: 12,
          color: '#94a3b8',
          background: 'rgba(100, 116, 139, 0.2)',
          padding: '4px 12px',
          borderRadius: 8,
          fontWeight: 600,
        }}>
          58-62% Probability Range
        </div>
      </div>

      <div style={{
        marginBottom: 16,
        padding: 12,
        background: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 12,
        fontSize: 13,
        color: '#94a3b8',
        lineHeight: 1.6,
      }}>
        <div style={{ marginBottom: 4, fontWeight: 600, color: '#10b981' }}>
          🎯 Smart Betting Strategy
        </div>
        These predictions combine team averages, recent form, and statistical distribution analysis
        to find markets with ~60% probability. Fair odds are calculated based on true probability.
      </div>

      <div style={{
        display: 'grid',
        gap: 16,
      }}>
        {predictions.map((pred, index) => (
          <PredictionCard
            key={`${pred.statKey}-${pred.type}`}
            prediction={pred}
            rank={index + 1}
            homeName={homeName}
            awayName={awayName}
          />
        ))}
      </div>

      <div style={{
        marginTop: 16,
        padding: 12,
        background: 'rgba(100, 116, 139, 0.1)',
        borderRadius: 8,
        fontSize: 11,
        color: '#94a3b8',
        lineHeight: 1.5,
      }}>
        💡 <strong>How to use:</strong> Fair odds represent true probability.
        Compare with bookmaker odds - if their odds are higher, you have an edge.
        Example: 60% probability = 1.67 fair odds. If bookmaker offers 1.80+, it's value.
      </div>
    </div>
  );
}

function PredictionCard({ prediction, rank, homeName, awayName }) {
  const {
    emoji,
    market,
    line,
    type,
    probability,
    decimalOdds,
    percentage,
    homeAvg,
    awayAvg,
    prediction: predictedTotal,
    sampleSize,
    confidence
  } = prediction;

  const isOver = type === 'over';

  const confidenceColors = {
    high: { bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', text: '#10b981' },
    medium: { bg: 'rgba(251, 191, 36, 0.2)', border: '#fbbf24', text: '#fbbf24' },
    low: { bg: 'rgba(148, 163, 184, 0.2)', border: '#94a3b8', text: '#94a3b8' }
  };

  const colors = confidenceColors[confidence] || confidenceColors.medium;

  return (
    <div style={{
      padding: 20,
      borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Rank Badge */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 800,
        color: 'white',
      }}>
        {rank}
      </div>

      {/* Market Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 28,
        }}>
          {emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 4,
          }}>
            {market}
          </div>
          <div style={{
            fontSize: 14,
            color: '#94a3b8',
          }}>
            {isOver ? 'Over' : 'Under'} {line}
          </div>
        </div>
      </div>

      {/* Main Prediction */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 16,
        padding: 16,
        background: 'rgba(102, 126, 234, 0.1)',
        borderRadius: 12,
        border: '1px solid rgba(102, 126, 234, 0.2)',
      }}>
        <div>
          <div style={{
            fontSize: 12,
            color: '#94a3b8',
            marginBottom: 6,
            fontWeight: 600,
          }}>
            Probability
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 900,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {percentage}%
          </div>
        </div>
        <div>
          <div style={{
            fontSize: 12,
            color: '#94a3b8',
            marginBottom: 6,
            fontWeight: 600,
          }}>
            Fair Odds
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 900,
            color: '#e2e8f0',
          }}>
            {decimalOdds}
          </div>
        </div>
      </div>

      {/* Team Averages */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 12,
        marginBottom: 12,
      }}>
        <StatBox
          label={homeName || 'Home'}
          value={homeAvg}
          color='#10b981'
        />
        <StatBox
          label="Predicted Total"
          value={predictedTotal}
          color='#667eea'
        />
        <StatBox
          label={awayName || 'Away'}
          value={awayAvg}
          color='#f59e0b'
        />
      </div>

      {/* Confidence Badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        color: colors.text,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        <span>●</span>
        {confidence} Confidence
        <span style={{ marginLeft: 4, color: '#94a3b8' }}>
          ({sampleSize} matches)
        </span>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      padding: 12,
      borderRadius: 10,
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 10,
        color: '#94a3b8',
        marginBottom: 6,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 20,
        fontWeight: 800,
        color: color,
      }}>
        {value}
      </div>
    </div>
  );
}
