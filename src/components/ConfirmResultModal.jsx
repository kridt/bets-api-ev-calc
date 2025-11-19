// src/components/ConfirmResultModal.jsx
import { motion, AnimatePresence } from "framer-motion";
import "./ConfirmResultModal.css";

export default function ConfirmResultModal({
  isOpen,
  onClose,
  verificationResult,
  onConfirm,
  onReject,
  loading
}) {
  if (!verificationResult) return null;

  const { success, prediction, actualValue, outcome, error, matchResult, playerResult, market, statType, line, type } = verificationResult;

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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="modal-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header">
              <motion.h2
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="modal-title"
              >
                <span className="modal-title-icon">🤖</span>
                Automated Result Verification
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="modal-subtitle"
              >
                Please confirm if this automated result is correct
              </motion.p>
            </div>

            {/* Error State */}
            {!success && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="modal-error"
              >
                <span className="modal-error-icon">⚠️</span>
                <div className="modal-error-content">
                  <div className="modal-error-title">
                    Verification Failed
                  </div>
                  <div className="modal-error-message">
                    {error || 'Could not fetch match result. The game may not be finished yet.'}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Success State - Show Results */}
            {success && (
              <>
                {/* Outcome Badge */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
                  className={`modal-outcome-badge ${outcome}`}
                >
                  <span className="modal-outcome-badge-icon">{getOutcomeEmoji(outcome)}</span>
                  {outcome}
                </motion.div>

                {/* Match/Game Info */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="modal-game-info"
                >
                  {matchResult && (
                    <>
                      <div className="modal-game-title">
                        <span className="modal-game-icon">⚽</span>
                        {matchResult.homeTeam} vs {matchResult.awayTeam}
                      </div>
                      {matchResult.score.home !== null && (
                        <div className="modal-game-meta">
                          Final Score: <span className="modal-game-meta-value">{matchResult.score.home} - {matchResult.score.away}</span>
                        </div>
                      )}
                    </>
                  )}

                  {playerResult && (
                    <>
                      <div className="modal-game-title">
                        <span className="modal-game-icon">🏀</span>
                        {playerResult.playerName}
                      </div>
                      <div className="modal-game-meta">
                        {playerResult.minutesPlayed ? `${playerResult.minutesPlayed} minutes played` : 'Game Stats'}
                      </div>
                    </>
                  )}

                  {/* Prediction Details Grid */}
                  <div className="modal-details-grid">
                    <div className="modal-detail-item">
                      <div className="modal-detail-label">Market/Stat</div>
                      <div className="modal-detail-value">
                        {market || statType}
                      </div>
                    </div>
                    <div className="modal-detail-item">
                      <div className="modal-detail-label">Your Prediction</div>
                      <div className="modal-detail-value">
                        {type.toUpperCase()} {line}
                      </div>
                    </div>
                    <div className="modal-detail-item">
                      <div className="modal-detail-label">Actual Result</div>
                      <div className="modal-detail-value large">
                        {actualValue}
                      </div>
                    </div>
                    <div className="modal-detail-item">
                      <div className="modal-detail-label">Outcome</div>
                      <div className={`modal-detail-value outcome-${outcome}`}>
                        {outcome.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Explanation */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className={`modal-explanation ${outcome}`}
                >
                  <div className="modal-explanation-text">
                    <span className="modal-explanation-label">Calculation:</span> {type === 'over' ? `${actualValue} > ${line}` : `${actualValue} < ${line}`}
                    {' = '}
                    <span className={`modal-explanation-result ${outcome}`}>
                      {outcome === 'won' ? 'TRUE (WON)' : outcome === 'lost' ? 'FALSE (LOST)' : 'EQUAL (PUSH)'}
                    </span>
                  </div>
                </motion.div>
              </>
            )}

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="modal-actions"
            >
              {success ? (
                <>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onConfirm}
                    disabled={loading}
                    className="modal-btn modal-btn-confirm"
                  >
                    {loading ? (
                      <>
                        <span className="modal-btn-spinner"></span>
                        Saving...
                      </>
                    ) : (
                      <>✅ Confirm & Save</>
                    )}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onReject}
                    disabled={loading}
                    className="modal-btn modal-btn-reject"
                  >
                    ❌ Incorrect
                  </motion.button>
                </>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="modal-btn modal-btn-close"
                >
                  Close
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
