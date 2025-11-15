// src/utils/predictionTracker.js - Prediction tracking and result verification system

import {
  savePredictionToFirebase,
  getAllPredictionsFromFirebase,
  getTodaysPredictionsFromFirebase,
  getPendingPredictionsFromFirebase,
  updatePredictionResult as updateResultInFirebase,
  generatePredictionKey,
  getBrowserFingerprint,
} from '../services/firebase';

/**
 * Saves a prediction to both Firebase and localStorage for later verification
 * Includes duplicate prevention via unique composite key
 *
 * @param {Object} prediction - The prediction object
 * @param {Object} matchInfo - Match details
 */
export async function savePrediction(prediction, matchInfo) {
  try {
    const timestamp = new Date().toISOString();
    const userId = getBrowserFingerprint();

    // Generate unique key for duplicate prevention
    const predictionId = generatePredictionKey(
      userId,
      matchInfo.eventId,
      prediction.market,
      prediction.line,
      prediction.type
    );

    const trackedPrediction = {
      // Unique identifier
      id: predictionId,

      // Timing information
      createdAt: timestamp,
      matchStartTime: matchInfo.kickoffISO,

      // Match details
      match: {
        eventId: matchInfo.eventId,
        homeTeam: matchInfo.homeName,
        homeTeamId: matchInfo.homeTeamId,
        awayTeam: matchInfo.awayName,
        awayTeamId: matchInfo.awayTeamId,
        league: matchInfo.leagueName,
        leagueId: matchInfo.leagueId,
      },

      // Prediction details
      prediction: {
        market: prediction.market, // "Corners", "Yellow Cards", etc.
        marketKey: prediction.marketKey, // "corners", "yellowcards", etc.
        emoji: prediction.emoji,
        line: prediction.line, // e.g., 8.5
        type: prediction.type, // "over" or "under"
        probability: prediction.probability, // 0.603
        percentage: prediction.percentage, // "60.3"
        fairOdds: prediction.odds, // 1.66
        confidence: prediction.confidence, // "high", "medium", "low"
        sampleSize: prediction.sampleSize,

        // Team breakdown
        homeTeamAvg: prediction.homeAvg,
        awayTeamAvg: prediction.awayAvg,
        combinedPrediction: prediction.prediction,
      },

      // Result tracking (filled in later)
      result: {
        status: "pending", // "pending", "won", "lost", "void"
        actualValue: null, // Actual stat value from match
        matchFinished: false,
        verifiedAt: null,
        finalScore: null,
      },

      // Metadata
      meta: {
        appVersion: "1.0.0",
        calculationMethod: "normal-distribution-cdf",
        targetProbabilityRange: "58-62%",
      }
    };

    // Check if prediction already exists in localStorage (use sync version)
    const existing = getAllPredictionsSync();
    const existingIndex = existing.findIndex(p => p.id === predictionId);

    if (existingIndex !== -1) {
      console.log('[PredictionTracker] Duplicate detected - skipping:', predictionId);
      return predictionId; // Already tracked, don't duplicate
    }

    // Save to Firebase (primary storage with duplicate prevention)
    try {
      await savePredictionToFirebase(trackedPrediction);
    } catch (firebaseError) {
      console.warn('[PredictionTracker] Firebase save failed, using localStorage only:', firebaseError);
    }

    // Also save to localStorage (backup/cache)
    existing.push(trackedPrediction);
    localStorage.setItem('predictions', JSON.stringify(existing));

    console.log('[PredictionTracker] Saved:', predictionId);
    return predictionId;

  } catch (error) {
    console.error('[PredictionTracker] Error saving prediction:', error);
    return null;
  }
}

/**
 * Get all tracked predictions (tries Firebase first, falls back to localStorage)
 * @returns {Promise<Array>} Array of prediction objects
 */
export async function getAllPredictions() {
  try {
    // Try Firebase first
    const firebasePredictions = await getAllPredictionsFromFirebase();

    if (firebasePredictions.length > 0) {
      // Cache in localStorage for offline access
      localStorage.setItem('predictions', JSON.stringify(firebasePredictions));
      return firebasePredictions;
    }

    // Fall back to localStorage if Firebase is empty or fails
    const data = localStorage.getItem('predictions');
    return data ? JSON.parse(data) : [];

  } catch (error) {
    console.error('[PredictionTracker] Error reading predictions, using localStorage:', error);
    const data = localStorage.getItem('predictions');
    return data ? JSON.parse(data) : [];
  }
}

/**
 * Get all tracked predictions synchronously (localStorage only)
 * Use this for immediate access without waiting for Firebase
 * @returns {Array} Array of prediction objects
 */
export function getAllPredictionsSync() {
  try {
    const data = localStorage.getItem('predictions');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[PredictionTracker] Error reading predictions:', error);
    return [];
  }
}

/**
 * Get predictions for today (last 24 hours)
 * @returns {Array} Array of today's predictions
 */
export function getTodaysPredictions() {
  const all = getAllPredictions();
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  return all.filter(p => {
    const createdTime = new Date(p.createdAt).getTime();
    return createdTime >= oneDayAgo;
  });
}

/**
 * Get predictions for a specific match
 * @param {string} eventId - The match event ID
 * @returns {Array} Array of predictions for this match
 */
export function getPredictionsByMatch(eventId) {
  const all = getAllPredictions();
  return all.filter(p => p.match.eventId === eventId);
}

/**
 * Get pending predictions (not yet verified)
 * @returns {Array} Array of pending predictions
 */
export function getPendingPredictions() {
  const all = getAllPredictions();
  return all.filter(p => p.result.status === 'pending' && !p.result.matchFinished);
}

/**
 * Get predictions that need verification (match finished but not verified)
 * @returns {Array} Array of predictions needing verification
 */
export function getPredictionsNeedingVerification() {
  const all = getAllPredictions();
  const now = Date.now();

  return all.filter(p => {
    // If already verified, skip
    if (p.result.status !== 'pending') return false;

    // Check if match should have finished (2+ hours past kickoff)
    const kickoffTime = new Date(p.match.matchStartTime).getTime();
    const twoHoursAfterKickoff = kickoffTime + (2 * 60 * 60 * 1000);

    return now >= twoHoursAfterKickoff;
  });
}

/**
 * Update prediction result after verification (updates both Firebase and localStorage)
 * @param {string} predictionId - The prediction ID
 * @param {Object} result - Result object with actualValue, status, finalScore
 */
export async function updatePredictionResult(predictionId, result) {
  try {
    const resultData = {
      status: result.status,
      actualValue: result.actualValue,
      matchFinished: true,
      verifiedAt: new Date().toISOString(),
      finalScore: result.finalScore,
    };

    // Update in Firebase
    try {
      await updateResultInFirebase(predictionId, resultData);
    } catch (firebaseError) {
      console.warn('[PredictionTracker] Firebase update failed:', firebaseError);
    }

    // Update in localStorage
    const all = getAllPredictionsSync();
    const index = all.findIndex(p => p.id === predictionId);

    if (index === -1) {
      console.error('[PredictionTracker] Prediction not found in localStorage:', predictionId);
      return false;
    }

    all[index].result = {
      ...all[index].result,
      ...resultData,
    };

    localStorage.setItem('predictions', JSON.stringify(all));
    console.log('[PredictionTracker] Updated:', predictionId, result.status);
    return true;

  } catch (error) {
    console.error('[PredictionTracker] Error updating result:', error);
    return false;
  }
}

/**
 * Verify prediction result using API data
 * @param {string} predictionId - The prediction ID
 * @param {Object} matchStats - Stats object from BetsAPI
 */
export function verifyPredictionWithStats(predictionId, matchStats) {
  try {
    const all = getAllPredictions();
    const pred = all.find(p => p.id === predictionId);

    if (!pred) {
      console.error('[PredictionTracker] Prediction not found:', predictionId);
      return null;
    }

    const marketKey = pred.prediction.marketKey;
    const actualValue = matchStats[marketKey];

    if (actualValue === undefined || actualValue === null) {
      console.warn('[PredictionTracker] No data for market:', marketKey);
      return null;
    }

    // Determine if prediction won or lost
    let won = false;
    if (pred.prediction.type === 'over') {
      won = actualValue > pred.prediction.line;
    } else {
      won = actualValue < pred.prediction.line;
    }

    const result = {
      status: won ? 'won' : 'lost',
      actualValue: actualValue,
      finalScore: matchStats.finalScore || null,
    };

    updatePredictionResult(predictionId, result);

    return {
      predictionId,
      won,
      actualValue,
      predictedLine: pred.prediction.line,
      type: pred.prediction.type,
    };

  } catch (error) {
    console.error('[PredictionTracker] Error verifying:', error);
    return null;
  }
}

/**
 * Get accuracy statistics (async version using Firebase)
 * @returns {Promise<Object>} Accuracy stats
 */
export async function getAccuracyStats() {
  const all = await getAllPredictions();
  const verified = all.filter(p => p.result.status === 'won' || p.result.status === 'lost');

  if (verified.length === 0) {
    return {
      total: 0,
      won: 0,
      lost: 0,
      accuracy: 0,
      byMarket: {},
      byConfidence: {},
    };
  }

  const won = verified.filter(p => p.result.status === 'won').length;
  const lost = verified.filter(p => p.result.status === 'lost').length;

  // By market
  const byMarket = {};
  verified.forEach(p => {
    const market = p.prediction.market;
    if (!byMarket[market]) {
      byMarket[market] = { total: 0, won: 0, lost: 0 };
    }
    byMarket[market].total++;
    if (p.result.status === 'won') byMarket[market].won++;
    else byMarket[market].lost++;
  });

  // By confidence
  const byConfidence = {};
  verified.forEach(p => {
    const conf = p.prediction.confidence;
    if (!byConfidence[conf]) {
      byConfidence[conf] = { total: 0, won: 0, lost: 0 };
    }
    byConfidence[conf].total++;
    if (p.result.status === 'won') byConfidence[conf].won++;
    else byConfidence[conf].lost++;
  });

  return {
    total: verified.length,
    won,
    lost,
    accuracy: (won / verified.length * 100).toFixed(1),
    byMarket: Object.keys(byMarket).map(market => ({
      market,
      ...byMarket[market],
      accuracy: (byMarket[market].won / byMarket[market].total * 100).toFixed(1),
    })),
    byConfidence: Object.keys(byConfidence).map(conf => ({
      confidence: conf,
      ...byConfidence[conf],
      accuracy: (byConfidence[conf].won / byConfidence[conf].total * 100).toFixed(1),
    })),
  };
}

/**
 * Export all predictions to JSON file
 * @returns {string} JSON string of all predictions
 */
export function exportPredictionsToJSON() {
  const all = getAllPredictions();
  return JSON.stringify(all, null, 2);
}

/**
 * Export all predictions and trigger download
 */
export function downloadPredictionsJSON() {
  try {
    const json = exportPredictionsToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[PredictionTracker] Downloaded predictions JSON');
  } catch (error) {
    console.error('[PredictionTracker] Error downloading JSON:', error);
  }
}

/**
 * Clear all predictions (use with caution!)
 */
export function clearAllPredictions() {
  if (confirm('Are you sure you want to delete all predictions? This cannot be undone.')) {
    localStorage.removeItem('predictions');
    console.log('[PredictionTracker] Cleared all predictions');
    return true;
  }
  return false;
}

/**
 * Get mapping of market keys to BetsAPI stat keys
 */
export function getMarketToStatKeyMapping() {
  return {
    'Corners': 'corners',
    'Yellow Cards': 'yellowcards',
    'Total Shots': 'shots_total',
    'Shots on Target': 'shots_on_target',
    'Red Cards': 'redcards',
    'Offsides': 'offsides',
  };
}

/**
 * Migrate all localStorage predictions to Firebase
 * Call this once to move your data to the cloud
 * @returns {Promise<Object>} Migration stats
 */
export { migrateLocalStorageToFirebase } from '../services/firebase';
