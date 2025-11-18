// src/components/ConfirmResultModal.jsx - Confirmation modal for auto-verified results

export default function ConfirmResultModal({
  isOpen,
  onClose,
  verificationResult,
  onConfirm,
  onReject,
  loading
}) {
  if (!isOpen || !verificationResult) return null;

  const { success, prediction, actualValue, outcome, error, matchResult, playerResult, market, statType, line, type } = verificationResult;

  // Get outcome color
  const getOutcomeColor = (outcome) => {
    switch (outcome) {
      case 'won': return '#10b981';
      case 'lost': return '#ef4444';
      case 'push': return '#f59e0b';
      default: return '#64748b';
    }
  };

  // Get outcome emoji
  const getOutcomeEmoji = (outcome) => {
    switch (outcome) {
      case 'won': return '✅';
      case 'lost': return '❌';
      case 'push': return '🟰';
      default: return '❓';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    }}
    onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 20,
          padding: 32,
          maxWidth: 600,
          width: '100%',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontSize: 24,
            fontWeight: 900,
            margin: 0,
            marginBottom: 8,
            color: '#e2e8f0',
          }}>
            🤖 Automated Result Verification
          </h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 14 }}>
            Please confirm if this automated result is correct
          </p>
        </div>

        {/* Error State */}
        {!success && (
          <div style={{
            padding: 20,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
              ⚠️ Verification Failed
            </div>
            <div style={{ fontSize: 14, color: '#fca5a5' }}>
              {error || 'Could not fetch match result. The game may not be finished yet.'}
            </div>
          </div>
        )}

        {/* Success State - Show Results */}
        {success && (
          <>
            {/* Outcome Badge */}
            <div style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 12,
              fontSize: 18,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              background: getOutcomeColor(outcome),
              color: '#fff',
              marginBottom: 24,
              boxShadow: `0 4px 12px ${getOutcomeColor(outcome)}40`,
            }}>
              {getOutcomeEmoji(outcome)} {outcome}
            </div>

            {/* Match/Game Info */}
            <div style={{
              padding: 20,
              background: 'rgba(30, 41, 59, 0.5)',
              borderRadius: 12,
              marginBottom: 20,
            }}>
              {matchResult && (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                    ⚽ {matchResult.homeTeam} vs {matchResult.awayTeam}
                  </div>
                  {matchResult.score.home !== null && (
                    <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>
                      Final Score: {matchResult.score.home} - {matchResult.score.away}
                    </div>
                  )}
                </>
              )}

              {playerResult && (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                    🏀 {playerResult.playerName}
                  </div>
                  <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>
                    {playerResult.minutesPlayed ? `${playerResult.minutesPlayed} minutes played` : 'Game Stats'}
                  </div>
                </>
              )}

              {/* Prediction Details */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                padding: 16,
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: 8,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Market/Stat</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                    {market || statType}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Your Prediction</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                    {type.toUpperCase()} {line}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Actual Result</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>
                    {actualValue}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Outcome</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: getOutcomeColor(outcome) }}>
                    {outcome.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>

            {/* Explanation */}
            <div style={{
              padding: 16,
              background: 'rgba(102, 126, 234, 0.1)',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              borderRadius: 12,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 14, color: '#cbd5e1' }}>
                <strong>Calculation:</strong> {type === 'over' ? `${actualValue} > ${line}` : `${actualValue} < ${line}`}
                {' = '}
                <span style={{ color: getOutcomeColor(outcome), fontWeight: 700 }}>
                  {outcome === 'won' ? 'TRUE (WON)' : outcome === 'lost' ? 'FALSE (LOST)' : 'EQUAL (PUSH)'}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          {success ? (
            <>
              <button
                onClick={onConfirm}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  borderRadius: 12,
                  border: 'none',
                  background: loading ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s',
                }}
              >
                {loading ? 'Saving...' : '✅ Confirm & Save'}
              </button>
              <button
                onClick={onReject}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  borderRadius: 12,
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s',
                }}
              >
                ❌ Incorrect
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '14px 24px',
                borderRadius: 12,
                border: '1px solid rgba(100, 116, 139, 0.5)',
                background: 'rgba(100, 116, 139, 0.2)',
                color: '#94a3b8',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
