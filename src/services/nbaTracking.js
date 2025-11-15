// src/services/nbaTracking.js - NBA Prediction Tracking with Firebase

import { getFirestore, collection, doc, setDoc, getDocs, query, where, serverTimestamp, orderBy } from "firebase/firestore";
import { db, getBrowserFingerprint } from "./firebase";

const NBA_PREDICTIONS_COLLECTION = "nba_predictions";

/**
 * Generate unique key for NBA prediction
 */
function generateNBAPredictionKey(userId, gameId, playerName, statType, line, type) {
  const sanitize = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${userId}_${gameId}_${sanitize(playerName)}_${sanitize(statType)}_${line}_${type}`;
}

/**
 * Save NBA prediction to Firebase for tracking
 * @param {Object} predictionData - NBA prediction data
 * @returns {Promise<string>} Prediction document ID
 */
export async function trackNBAPrediction(predictionData) {
  try {
    const userId = getBrowserFingerprint();

    // Generate unique key
    const uniqueKey = generateNBAPredictionKey(
      userId,
      predictionData.gameId,
      predictionData.playerName,
      predictionData.statType,
      predictionData.line,
      predictionData.type
    );

    // Check if already tracked
    const docRef = doc(db, NBA_PREDICTIONS_COLLECTION, uniqueKey);

    // Create prediction document
    const predictionDoc = {
      // Unique identifier
      id: uniqueKey,
      userId,

      // Game details
      game: {
        id: predictionData.gameId,
        homeTeam: predictionData.homeTeam,
        awayTeam: predictionData.awayTeam,
        gameTime: predictionData.gameTime,
        gameTimeISO: predictionData.gameTimeISO,
      },

      // Player details
      player: {
        name: predictionData.playerName,
        team: predictionData.playerTeam,
        playerId: predictionData.playerId || null, // For API lookup later
      },

      // Prediction details
      prediction: {
        statType: predictionData.statType, // 'Points', 'Rebounds', 'Assists', 'Pts+Reb+Ast', etc.
        shortName: predictionData.shortName, // 'PTS', 'REB', 'AST', 'PRA', etc.
        propType: predictionData.propType, // 'individual' or 'combined'
        line: predictionData.line,
        type: predictionData.type, // 'over' or 'under'
        probability: predictionData.probability,
        percentage: predictionData.percentage,
        odds: predictionData.odds,
      },

      // Tracking metadata
      status: 'pending', // 'pending', 'won', 'lost', 'push', 'void'
      trackedAt: new Date().toISOString(),
      createdAtServer: serverTimestamp(),

      // Result (to be filled later by API check)
      result: {
        checked: false,
        actualValue: null,
        outcome: null, // 'won', 'lost', 'push'
        checkedAt: null,
      },
    };

    // Save to Firestore
    await setDoc(docRef, predictionDoc);
    console.log(`[NBA Tracking] Saved prediction: ${uniqueKey}`);

    return uniqueKey;

  } catch (error) {
    console.error('[NBA Tracking] Error saving prediction:', error);
    throw error;
  }
}

/**
 * Get all tracked NBA predictions for current user
 */
export async function getAllNBAPredictions() {
  try {
    const userId = getBrowserFingerprint();

    const q = query(
      collection(db, NBA_PREDICTIONS_COLLECTION),
      where("userId", "==", userId),
      orderBy("createdAtServer", "desc")
    );

    const querySnapshot = await getDocs(q);
    const predictions = [];

    querySnapshot.forEach((doc) => {
      predictions.push({
        ...doc.data(),
        id: doc.id,
      });
    });

    console.log(`[NBA Tracking] Loaded ${predictions.length} predictions`);
    return predictions;

  } catch (error) {
    console.error('[NBA Tracking] Error loading predictions:', error);
    return [];
  }
}

/**
 * Get pending NBA predictions (not yet checked)
 */
export async function getPendingNBAPredictions() {
  try {
    const userId = getBrowserFingerprint();

    const q = query(
      collection(db, NBA_PREDICTIONS_COLLECTION),
      where("userId", "==", userId),
      where("status", "==", "pending")
    );

    const querySnapshot = await getDocs(q);
    const predictions = [];

    querySnapshot.forEach((doc) => {
      predictions.push({
        ...doc.data(),
        id: doc.id,
      });
    });

    return predictions;

  } catch (error) {
    console.error('[NBA Tracking] Error loading pending predictions:', error);
    return [];
  }
}

/**
 * Update prediction result after game completion
 */
export async function updateNBAPredictionResult(predictionId, resultData) {
  try {
    const docRef = doc(db, NBA_PREDICTIONS_COLLECTION, predictionId);

    await setDoc(docRef, {
      status: resultData.outcome, // 'won', 'lost', 'push'
      result: {
        checked: true,
        actualValue: resultData.actualValue,
        outcome: resultData.outcome,
        checkedAt: new Date().toISOString(),
        apiResponse: resultData.apiResponse || null,
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log(`[NBA Tracking] Updated result for: ${predictionId}`);
    return true;

  } catch (error) {
    console.error('[NBA Tracking] Error updating result:', error);
    return false;
  }
}

/**
 * Get NBA predictions for a specific game
 */
export async function getNBAPredictionsByGame(gameId) {
  try {
    const userId = getBrowserFingerprint();

    const q = query(
      collection(db, NBA_PREDICTIONS_COLLECTION),
      where("userId", "==", userId),
      where("game.id", "==", gameId)
    );

    const querySnapshot = await getDocs(q);
    const predictions = [];

    querySnapshot.forEach((doc) => {
      predictions.push({
        ...doc.data(),
        id: doc.id,
      });
    });

    return predictions;

  } catch (error) {
    console.error('[NBA Tracking] Error loading game predictions:', error);
    return [];
  }
}

/**
 * Get statistics for tracked predictions
 */
export async function getNBATrackingStats() {
  try {
    const userId = getBrowserFingerprint();

    const q = query(
      collection(db, NBA_PREDICTIONS_COLLECTION),
      where("userId", "==", userId)
    );

    const querySnapshot = await getDocs(q);

    const stats = {
      total: 0,
      pending: 0,
      won: 0,
      lost: 0,
      push: 0,
      winRate: 0,
    };

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      stats.total++;

      if (data.status === 'pending') stats.pending++;
      else if (data.status === 'won') stats.won++;
      else if (data.status === 'lost') stats.lost++;
      else if (data.status === 'push') stats.push++;
    });

    // Calculate win rate (excluding pending and push)
    const decided = stats.won + stats.lost;
    stats.winRate = decided > 0 ? ((stats.won / decided) * 100).toFixed(1) : 0;

    return stats;

  } catch (error) {
    console.error('[NBA Tracking] Error getting stats:', error);
    return null;
  }
}
