// src/pages/Results.jsx - Redesigned with vanilla CSS and Framer Motion
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAllNBAPredictions, updateNBAPredictionResult } from "../services/nbaTracking";
import { verifyNBAPrediction } from "../services/resultVerification";
import { getQuotaStatus } from "../services/rateLimiter";
import ConfirmResultModal from "../components/ConfirmResultModal";
import "./Results.css";

export default function Results() {
  const [nbaPredictions, setNbaPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState(null);

  // Tab state
  const [nbaTab, setNbaTab] = useState('pending');

  // Modal state for automated verification
  const [showModal, setShowModal] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [currentPrediction, setCurrentPrediction] = useState(null);
  const [saving, setSaving] = useState(false);

  // Bulk verification state
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  // Rate limit status
  const [quotaStatus, setQuotaStatus] = useState(null);

  useEffect(() => {
    loadPredictions();
    updateQuotaStatus();
    // Update quota every 10 seconds
    const interval = setInterval(updateQuotaStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  function updateQuotaStatus() {
    const status = getQuotaStatus();
    setQuotaStatus(status);
  }

  async function loadPredictions() {
    try {
      setLoading(true);
      const nba = await getAllNBAPredictions();

      console.log('[Results] Loaded NBA predictions:', nba.length);

      setNbaPredictions(nba.sort((a, b) =>
        new Date(b.trackedAt) - new Date(a.trackedAt)
      ));
    } catch (error) {
      console.error("Error loading predictions:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filter predictions by tab
  function getFilteredNBAPredictions() {
    switch (nbaTab) {
      case 'won':
        return nbaPredictions.filter(p => p.status === 'won');
      case 'lost':
        return nbaPredictions.filter(p => p.status === 'lost');
      case 'pending':
      default:
        return nbaPredictions.filter(p => p.status === 'pending');
    }
  }

  async function handleVerifyNBA(prediction) {
    setVerifyingId(prediction.id);
    setCurrentPrediction(prediction);

    try {
      const result = await verifyNBAPrediction(prediction);
      setVerificationResult(result);
      setShowModal(true);
    } catch (error) {
      console.error('Verification error:', error);
      alert(`Verification failed: ${error.message}`);
    } finally {
      setVerifyingId(null);
      updateQuotaStatus(); // Update quota after check
    }
  }

  async function handleConfirmResult() {
    if (!verificationResult || !verificationResult.success) return;

    setSaving(true);
    try {
      const { outcome, actualValue, prediction } = verificationResult;

      console.log('[Results] Saving result:', { outcome, actualValue, predictionId: prediction.id });

      await updateNBAPredictionResult(prediction.id, {
        actualValue: actualValue,
        outcome: outcome,
      });

      // Switch to the appropriate tab after saving
      if (outcome === 'won') setNbaTab('won');
      else if (outcome === 'lost') setNbaTab('lost');

      setShowModal(false);
      await loadPredictions();
      alert(`✅ Result saved! Prediction ${outcome.toUpperCase()}`);
    } catch (error) {
      console.error('Error saving result:', error);
      alert(`Failed to save result: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function handleRejectResult() {
    setShowModal(false);
    alert('Result marked as incorrect. You can verify manually or try again later.');
  }

  function handleCloseModal() {
    setShowModal(false);
    setVerificationResult(null);
    setCurrentPrediction(null);
  }

  async function handleCheckAll() {
    const pendingNBA = nbaPredictions.filter(p => p.status === 'pending');

    if (pendingNBA.length === 0) {
      alert('No pending predictions to verify!');
      return;
    }

    const confirmed = confirm(
      `This will automatically check ${pendingNBA.length} pending NBA predictions.\n\n` +
      `Results will be saved automatically if verification succeeds. Continue?`
    );

    if (!confirmed) return;

    setBulkChecking(true);
    setBulkProgress({ current: 0, total: pendingNBA.length });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < pendingNBA.length; i++) {
      const prediction = pendingNBA[i];
      setBulkProgress({ current: i + 1, total: pendingNBA.length });

      try {
        const result = await verifyNBAPrediction(prediction);

        if (result.success) {
          await updateNBAPredictionResult(prediction.id, {
            actualValue: result.actualValue,
            outcome: result.outcome,
          });
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error('Bulk verification error (NBA):', error);
        failedCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setBulkChecking(false);
    await loadPredictions();

    alert(
      `✅ Bulk Verification Complete!\n\n` +
      `• Successfully verified: ${successCount}\n` +
      `• Failed to verify: ${failedCount}\n` +
      `• Total checked: ${pendingNBA.length}`
    );
  }

  function getStatusColor(status) {
    return status;
  }

  function getStatusText(prediction) {
    return prediction.status || 'pending';
  }

  if (loading) {
    return (
      <div className="loading-container">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading predictions...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="results-container">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="results-header glass-effect-strong"
      >
        <h1 className="results-title">🏀 NBA Prediction Results</h1>
        <p className="results-subtitle">
          🤖 Automated result verification - Click "Auto-Check Result" to fetch actual game stats
        </p>
      </motion.div>

      {/* Bulk Verification Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bulk-verification glass-effect"
      >
        <div className="bulk-verification-content">
          <div className="bulk-verification-info">
            <div className="bulk-verification-title">
              <span>🚀</span>
              Bulk Verification
            </div>
            <div className="bulk-verification-desc">
              {bulkChecking ? (
                <>
                  <span className="pulse-dot"></span>
                  Checking {bulkProgress.current} of {bulkProgress.total} predictions...
                </>
              ) : (
                'Automatically check all pending predictions at once'
              )}
            </div>
            {quotaStatus && (
              <div className="quota-status">
                📊 API Quota: {quotaStatus.dailyRemaining}/{quotaStatus.dailyLimit} daily ({quotaStatus.hourlyRemaining}/{quotaStatus.hourlyLimit} hourly)
              </div>
            )}
          </div>

          {bulkChecking && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              className="bulk-progress-bar"
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                transition={{ duration: 0.3 }}
                className="bulk-progress-fill"
              />
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: bulkChecking ? 1 : 1.02 }}
            whileTap={{ scale: bulkChecking ? 1 : 0.98 }}
            onClick={handleCheckAll}
            disabled={bulkChecking || loading}
            className="bulk-check-btn"
          >
            {bulkChecking ? (
              <>🔄 Checking ({bulkProgress.current}/{bulkProgress.total})...</>
            ) : (
              <>✨ Check All Pending</>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Statistics Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="stats-grid"
      >
        <StatCard
          title="NBA Predictions"
          icon="🏀"
          total={nbaPredictions.length}
          won={nbaPredictions.filter(p => p.status === 'won').length}
          lost={nbaPredictions.filter(p => p.status === 'lost').length}
          pending={nbaPredictions.filter(p => p.status === 'pending').length}
        />
      </motion.div>

      {/* Predictions Grid */}
      <div className="predictions-grid">
        {/* NBA Predictions */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="predictions-section"
        >
          <h2 className="predictions-header">
            <span className="predictions-header-icon">🏀</span>
            NBA Predictions
            <span className="predictions-count">({nbaPredictions.length})</span>
          </h2>

          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${nbaTab === 'pending' ? 'active' : ''}`}
              onClick={() => setNbaTab('pending')}
            >
              ⏳ Pending ({nbaPredictions.filter(p => p.status === 'pending').length})
            </button>
            <button
              className={`tab ${nbaTab === 'won' ? 'active' : ''}`}
              onClick={() => setNbaTab('won')}
            >
              ✅ Won ({nbaPredictions.filter(p => p.status === 'won').length})
            </button>
            <button
              className={`tab ${nbaTab === 'lost' ? 'active' : ''}`}
              onClick={() => setNbaTab('lost')}
            >
              ❌ Lost ({nbaPredictions.filter(p => p.status === 'lost').length})
            </button>
          </div>

          <div className="predictions-list">
            <AnimatePresence mode="popLayout">
              {(() => {
                const filtered = getFilteredNBAPredictions();
                if (filtered.length === 0) {
                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="empty-state glass-effect"
                    >
                      No {nbaTab} NBA predictions
                    </motion.div>
                  );
                }
                return filtered.map((prediction, index) => (
                  <NBAPredictionCard
                    key={prediction.id}
                    prediction={prediction}
                    onVerify={handleVerifyNBA}
                    verifying={verifyingId === prediction.id}
                    getStatusText={getStatusText}
                    index={index}
                  />
                ));
              })()}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Automated Verification Confirmation Modal */}
      <ConfirmResultModal
        isOpen={showModal}
        onClose={handleCloseModal}
        verificationResult={verificationResult}
        onConfirm={handleConfirmResult}
        onReject={handleRejectResult}
        loading={saving}
      />
    </div>
  );
}

// Stat Card Component
function StatCard({ title, icon, total, won, lost, pending }) {
  const decided = won + lost;
  const winRate = decided > 0 ? ((won / decided) * 100).toFixed(1) : 0;

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="stat-card glass-effect"
    >
      <div className="stat-card-header">
        <span className="stat-card-icon">{icon}</span>
        <div className="stat-card-title">{title}</div>
      </div>
      <div className="stat-card-total">{total}</div>
      <div className="stat-card-breakdown">
        <div className="stat-won">✓ {won}</div>
        <div className="stat-lost">✗ {lost}</div>
        <div className="stat-pending">⏳ {pending}</div>
      </div>
      {decided > 0 && (
        <div className="stat-card-winrate">
          <div className="winrate-label">
            Win Rate: <span className="winrate-value">{winRate}%</span>
          </div>
          <div className="winrate-bar">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${winRate}%` }}
              transition={{ duration: 1, delay: 0.5 }}
              className="winrate-fill"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// NBA Prediction Card
function NBAPredictionCard({ prediction, onVerify, verifying, getStatusText, index }) {
  const status = getStatusText(prediction);
  const isVerified = status !== 'pending';

  const getTeamName = (team) => {
    if (!team) return 'Unknown';
    if (typeof team === 'string') return team;
    return team.full_name || team.name || team.abbreviation || 'Unknown';
  };

  const awayTeam = getTeamName(prediction.game?.awayTeam || prediction.game?.visitor_team);
  const homeTeam = getTeamName(prediction.game?.homeTeam || prediction.game?.home_team);
  const gameTime = prediction.game?.gameTimeISO || prediction.game?.datetime || prediction.game?.gameTime;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ y: -2, scale: 1.01 }}
      className={`prediction-card glass-effect status-${status}`}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, delay: index * 0.05 + 0.2 }}
        className={`status-badge ${status}`}
      >
        {status}
      </motion.div>

      <div className="prediction-match-info">
        <div className="prediction-teams">
          {prediction.player?.name || 'Unknown Player'}
        </div>
        <div className="prediction-meta">
          {awayTeam} @ {homeTeam}
        </div>
        {gameTime && (
          <div className="prediction-meta">
            {new Date(gameTime).toLocaleDateString()} • {new Date(gameTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      <div className="prediction-details">
        <div className="prediction-detail-row">
          Stat: <span className="prediction-detail-value">
            {prediction.prediction?.statType || prediction.prediction?.shortName || 'Unknown'}
          </span>
        </div>
        <div className="prediction-detail-row">
          Prediction: <span className="prediction-detail-value">
            {(prediction.prediction?.type || 'over').toUpperCase()} {prediction.prediction?.line || 0}
          </span>
        </div>
        <div className="prediction-detail-row">
          Probability: <span className="prediction-probability">
            {prediction.prediction?.percentage || prediction.prediction?.probability?.toFixed(1) || 'N/A'}%
          </span>
        </div>
        {isVerified && prediction.result?.actualValue !== null && prediction.result?.actualValue !== undefined && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="prediction-detail-row prediction-actual"
          >
            Actual Result: <span className="prediction-actual-value">
              {prediction.result.actualValue}
            </span>
          </motion.div>
        )}
      </div>

      {!isVerified && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onVerify(prediction)}
          disabled={verifying}
          className="verify-btn nba"
        >
          {verifying ? (
            <>
              <span className="verify-spinner"></span>
              Auto-Checking...
            </>
          ) : (
            '🤖 Auto-Check Result'
          )}
        </motion.button>
      )}
    </motion.div>
  );
}
