// src/pages/Results.jsx - View and verify prediction results
import { useState, useEffect } from "react";
import { getAllPredictionsFromFirebase, updatePredictionResult } from "../services/firebase";
import { getAllNBAPredictions, updateNBAPredictionResult } from "../services/nbaTracking";
import { verifySoccerPrediction, verifyNBAPrediction } from "../services/resultVerification";
import ConfirmResultModal from "../components/ConfirmResultModal";

export default function Results() {
  const [soccerPredictions, setSoccerPredictions] = useState([]);
  const [nbaPredictions, setNbaPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState(null);

  // Modal state for automated verification
  const [showModal, setShowModal] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [currentPrediction, setCurrentPrediction] = useState(null);
  const [isSoccerPrediction, setIsSoccerPrediction] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bulk verification state
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState({ success: 0, failed: 0, pending: 0 });

  useEffect(() => {
    loadPredictions();
  }, []);

  async function loadPredictions() {
    try {
      setLoading(true);
      const [soccer, nba] = await Promise.all([
        getAllPredictionsFromFirebase(),
        getAllNBAPredictions()
      ]);

      setSoccerPredictions(soccer.sort((a, b) =>
        new Date(b.createdAt || b.trackedAt) - new Date(a.createdAt || a.trackedAt)
      ));
      setNbaPredictions(nba.sort((a, b) =>
        new Date(b.trackedAt) - new Date(a.trackedAt)
      ));
    } catch (error) {
      console.error("Error loading predictions:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySoccer(prediction) {
    setVerifyingId(prediction.id);
    setCurrentPrediction(prediction);
    setIsSoccerPrediction(true);

    try {
      // Call automated verification
      const result = await verifySoccerPrediction(prediction);

      // Show modal with result
      setVerificationResult(result);
      setShowModal(true);
    } catch (error) {
      console.error('Verification error:', error);
      alert(`Verification failed: ${error.message}`);
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleVerifyNBA(prediction) {
    setVerifyingId(prediction.id);
    setCurrentPrediction(prediction);
    setIsSoccerPrediction(false);

    try {
      // Call automated verification
      const result = await verifyNBAPrediction(prediction);

      // Show modal with result
      setVerificationResult(result);
      setShowModal(true);
    } catch (error) {
      console.error('Verification error:', error);
      alert(`Verification failed: ${error.message}`);
    } finally {
      setVerifyingId(null);
    }
  }

  // Handle confirmation from modal
  async function handleConfirmResult() {
    if (!verificationResult || !verificationResult.success) return;

    setSaving(true);
    try {
      const { outcome, actualValue, prediction } = verificationResult;

      if (isSoccerPrediction) {
        await updatePredictionResult(prediction.id, {
          status: outcome,
          actualValue: actualValue,
          outcome: outcome,
        });
      } else {
        await updateNBAPredictionResult(prediction.id, {
          actualValue: actualValue,
          outcome: outcome,
        });
      }

      // Close modal and reload
      setShowModal(false);
      await loadPredictions();
    } catch (error) {
      console.error('Error saving result:', error);
      alert(`Failed to save result: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  // Handle rejection from modal
  function handleRejectResult() {
    setShowModal(false);
    alert('Result marked as incorrect. You can verify manually or try again later.');
  }

  // Handle modal close
  function handleCloseModal() {
    setShowModal(false);
    setVerificationResult(null);
    setCurrentPrediction(null);
  }

  // Bulk verification function
  async function handleCheckAll() {
    // Get all pending predictions
    const pendingSoccer = soccerPredictions.filter(p => !p.result?.status || p.result?.status === 'pending');
    const pendingNBA = nbaPredictions.filter(p => p.status === 'pending');

    const totalPending = pendingSoccer.length + pendingNBA.length;

    if (totalPending === 0) {
      alert('No pending predictions to verify!');
      return;
    }

    const confirmed = confirm(
      `This will automatically check ${totalPending} pending predictions:\n\n` +
      `• ${pendingSoccer.length} Soccer predictions\n` +
      `• ${pendingNBA.length} NBA predictions\n\n` +
      `Results will be saved automatically if verification succeeds. Continue?`
    );

    if (!confirmed) return;

    setBulkChecking(true);
    setBulkProgress({ current: 0, total: totalPending });
    setBulkResults({ success: 0, failed: 0, pending: 0 });

    let successCount = 0;
    let failedCount = 0;
    let current = 0;

    // Verify soccer predictions
    for (const prediction of pendingSoccer) {
      current++;
      setBulkProgress({ current, total: totalPending });

      try {
        const result = await verifySoccerPrediction(prediction);

        if (result.success) {
          // Auto-save successful verification
          await updatePredictionResult(prediction.id, {
            status: result.outcome,
            actualValue: result.actualValue,
            outcome: result.outcome,
          });
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error('Bulk verification error (soccer):', error);
        failedCount++;
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Verify NBA predictions
    for (const prediction of pendingNBA) {
      current++;
      setBulkProgress({ current, total: totalPending });

      try {
        const result = await verifyNBAPrediction(prediction);

        if (result.success) {
          // Auto-save successful verification
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

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setBulkResults({ success: successCount, failed: failedCount, pending: 0 });
    setBulkChecking(false);

    // Reload predictions to show updated results
    await loadPredictions();

    // Show summary
    alert(
      `✅ Bulk Verification Complete!\n\n` +
      `• Successfully verified: ${successCount}\n` +
      `• Failed to verify: ${failedCount}\n` +
      `• Total checked: ${totalPending}`
    );
  }

  function getStatusColor(status) {
    switch (status) {
      case 'won': return '#10b981';
      case 'lost': return '#ef4444';
      case 'push': return '#f59e0b';
      case 'pending': return '#64748b';
      default: return '#64748b';
    }
  }

  function getStatusText(prediction, isSoccer) {
    if (isSoccer) {
      return prediction.result?.status || 'pending';
    } else {
      return prediction.status || 'pending';
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{
          display: 'inline-block',
          width: 40,
          height: 40,
          border: '4px solid rgba(102, 126, 234, 0.2)',
          borderTop: '4px solid #667eea',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ marginTop: 20, color: '#94a3b8' }}>Loading predictions...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        marginBottom: 32,
        padding: '24px 28px',
        background: 'rgba(30, 41, 59, 0.5)',
        backdropFilter: 'blur(12px)',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 900,
          margin: 0,
          marginBottom: 8,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          📋 Prediction Results
        </h1>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: 15 }}>
          🤖 Automated result verification - Click "Auto-Check Result" to fetch actual game stats
        </p>
      </div>

      {/* Check All Button */}
      <div style={{
        marginBottom: 32,
        padding: '20px 24px',
        background: 'rgba(30, 41, 59, 0.5)',
        backdropFilter: 'blur(12px)',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
            🚀 Bulk Verification
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            {bulkChecking ? (
              <>
                Checking {bulkProgress.current} of {bulkProgress.total} predictions...
              </>
            ) : (
              <>
                Automatically check all pending predictions at once
              </>
            )}
          </div>
        </div>

        {bulkChecking && (
          <div style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 8,
            height: 8,
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              height: '100%',
              width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        )}

        <button
          onClick={handleCheckAll}
          disabled={bulkChecking || loading}
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            border: 'none',
            background: bulkChecking
              ? 'rgba(100, 116, 139, 0.3)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: bulkChecking ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            whiteSpace: 'nowrap',
            boxShadow: bulkChecking ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)',
          }}
        >
          {bulkChecking ? (
            <>🔄 Checking ({bulkProgress.current}/{bulkProgress.total})...</>
          ) : (
            <>✨ Check All Pending</>
          )}
        </button>
      </div>

      {/* Statistics Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        {/* Soccer Stats */}
        <StatCard
          title="Soccer Predictions"
          total={soccerPredictions.length}
          won={soccerPredictions.filter(p => p.result?.status === 'won').length}
          lost={soccerPredictions.filter(p => p.result?.status === 'lost').length}
          pending={soccerPredictions.filter(p => !p.result?.status || p.result?.status === 'pending').length}
        />

        {/* NBA Stats */}
        <StatCard
          title="NBA Predictions"
          total={nbaPredictions.length}
          won={nbaPredictions.filter(p => p.status === 'won').length}
          lost={nbaPredictions.filter(p => p.status === 'lost').length}
          pending={nbaPredictions.filter(p => p.status === 'pending').length}
        />
      </div>

      {/* Side by Side Lists */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
        gap: 24,
      }}>
        {/* Soccer Predictions */}
        <div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 16,
            color: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            ⚽ Soccer Predictions ({soccerPredictions.length})
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {soccerPredictions.length === 0 ? (
              <div style={{
                padding: 40,
                textAlign: 'center',
                background: 'rgba(30, 41, 59, 0.3)',
                borderRadius: 16,
                border: '1px solid rgba(255, 255, 255, 0.05)',
                color: '#64748b',
              }}>
                No soccer predictions yet
              </div>
            ) : (
              soccerPredictions.map((prediction) => (
                <SoccerPredictionCard
                  key={prediction.id}
                  prediction={prediction}
                  onVerify={handleVerifySoccer}
                  verifying={verifyingId === prediction.id}
                  getStatusColor={getStatusColor}
                  getStatusText={getStatusText}
                />
              ))
            )}
          </div>
        </div>

        {/* NBA Predictions */}
        <div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 16,
            color: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            🏀 NBA Predictions ({nbaPredictions.length})
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {nbaPredictions.length === 0 ? (
              <div style={{
                padding: 40,
                textAlign: 'center',
                background: 'rgba(30, 41, 59, 0.3)',
                borderRadius: 16,
                border: '1px solid rgba(255, 255, 255, 0.05)',
                color: '#64748b',
              }}>
                No NBA predictions yet
              </div>
            ) : (
              nbaPredictions.map((prediction) => (
                <NBAPredictionCard
                  key={prediction.id}
                  prediction={prediction}
                  onVerify={handleVerifyNBA}
                  verifying={verifyingId === prediction.id}
                  getStatusColor={getStatusColor}
                  getStatusText={getStatusText}
                />
              ))
            )}
          </div>
        </div>
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
function StatCard({ title, total, won, lost, pending }) {
  const decided = won + lost;
  const winRate = decided > 0 ? ((won / decided) * 100).toFixed(1) : 0;

  return (
    <div style={{
      padding: 20,
      background: 'rgba(30, 41, 59, 0.5)',
      backdropFilter: 'blur(12px)',
      borderRadius: 16,
      border: '1px solid rgba(255, 255, 255, 0.1)',
    }}>
      <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: '#e2e8f0', marginBottom: 12 }}>
        {total}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
        <div style={{ color: '#10b981' }}>✓ {won}</div>
        <div style={{ color: '#ef4444' }}>✗ {lost}</div>
        <div style={{ color: '#64748b' }}>⏳ {pending}</div>
      </div>
      {decided > 0 && (
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          fontSize: 13,
          color: '#94a3b8',
        }}>
          Win Rate: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{winRate}%</span>
        </div>
      )}
    </div>
  );
}

// Soccer Prediction Card
function SoccerPredictionCard({ prediction, onVerify, verifying, getStatusColor, getStatusText }) {
  const status = getStatusText(prediction, true);
  const isVerified = status !== 'pending';

  return (
    <div style={{
      padding: 16,
      background: 'rgba(30, 41, 59, 0.5)',
      backdropFilter: 'blur(12px)',
      borderRadius: 12,
      border: `1px solid ${isVerified ? getStatusColor(status) : 'rgba(255, 255, 255, 0.1)'}`,
      transition: 'all 0.3s',
    }}>
      {/* Status Badge */}
      <div style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        background: getStatusColor(status),
        color: '#fff',
        marginBottom: 12,
      }}>
        {status}
      </div>

      {/* Match Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
          {prediction.match?.homeTeam || 'Home'} vs {prediction.match?.awayTeam || 'Away'}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          {prediction.match?.league || 'League'} • {prediction.match?.time ? new Date(prediction.match.time).toLocaleDateString() : 'TBD'}
        </div>
      </div>

      {/* Prediction Details */}
      <div style={{
        padding: 12,
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 8,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
          Market: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{prediction.prediction?.market || 'Unknown'}</span>
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
          Prediction: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
            {(prediction.prediction?.type || 'over').toUpperCase()} {prediction.prediction?.line || 0}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          Probability: <span style={{ color: '#10b981', fontWeight: 600 }}>
            {prediction.prediction?.probability?.toFixed(1) || 'N/A'}%
          </span>
        </div>
        {isVerified && prediction.result?.actualValue !== null && prediction.result?.actualValue !== undefined && (
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            Actual Result: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
              {prediction.result.actualValue}
            </span>
          </div>
        )}
      </div>

      {/* Verify Button */}
      {!isVerified && (
        <button
          onClick={() => onVerify(prediction)}
          disabled={verifying}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: verifying ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: verifying ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
          }}
        >
          {verifying ? '🔄 Auto-Checking...' : '🤖 Auto-Check Result'}
        </button>
      )}
    </div>
  );
}

// NBA Prediction Card
function NBAPredictionCard({ prediction, onVerify, verifying, getStatusColor, getStatusText }) {
  const status = getStatusText(prediction, false);
  const isVerified = status !== 'pending';

  // Handle different data structures for team names
  const getTeamName = (team) => {
    if (!team) return 'Unknown';
    if (typeof team === 'string') return team;
    return team.full_name || team.name || team.abbreviation || 'Unknown';
  };

  const awayTeam = getTeamName(prediction.game?.awayTeam || prediction.game?.visitor_team);
  const homeTeam = getTeamName(prediction.game?.homeTeam || prediction.game?.home_team);
  const gameTime = prediction.game?.gameTimeISO || prediction.game?.datetime || prediction.game?.gameTime;

  return (
    <div style={{
      padding: 16,
      background: 'rgba(30, 41, 59, 0.5)',
      backdropFilter: 'blur(12px)',
      borderRadius: 12,
      border: `1px solid ${isVerified ? getStatusColor(status) : 'rgba(255, 255, 255, 0.1)'}`,
      transition: 'all 0.3s',
    }}>
      {/* Status Badge */}
      <div style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        background: getStatusColor(status),
        color: '#fff',
        marginBottom: 12,
      }}>
        {status}
      </div>

      {/* Game Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
          {prediction.player?.name || 'Unknown Player'}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          {awayTeam} @ {homeTeam}
        </div>
        {gameTime && (
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {new Date(gameTime).toLocaleDateString()} • {new Date(gameTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Prediction Details */}
      <div style={{
        padding: 12,
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 8,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
          Stat: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
            {prediction.prediction?.statType || prediction.prediction?.shortName || 'Unknown'}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
          Prediction: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
            {(prediction.prediction?.type || 'over').toUpperCase()} {prediction.prediction?.line || 0}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          Probability: <span style={{ color: '#10b981', fontWeight: 600 }}>
            {prediction.prediction?.percentage || prediction.prediction?.probability?.toFixed(1) || 'N/A'}%
          </span>
        </div>
        {isVerified && prediction.result?.actualValue !== null && prediction.result?.actualValue !== undefined && (
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            Actual Result: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
              {prediction.result.actualValue}
            </span>
          </div>
        )}
      </div>

      {/* Verify Button */}
      {!isVerified && (
        <button
          onClick={() => onVerify(prediction)}
          disabled={verifying}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: verifying ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: verifying ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
          }}
        >
          {verifying ? '🔄 Auto-Checking...' : '🤖 Auto-Check Result'}
        </button>
      )}
    </div>
  );
}
