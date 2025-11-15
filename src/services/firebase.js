// src/services/firebase.js - Firebase Firestore configuration and initialization

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";

// Firebase configuration - using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Debug: Log config to verify env vars are loaded
console.log('[Firebase] Config loaded:', {
  hasApiKey: !!firebaseConfig.apiKey,
  hasAuthDomain: !!firebaseConfig.authDomain,
  hasProjectId: !!firebaseConfig.projectId,
  projectId: firebaseConfig.projectId // Safe to log project ID
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Collection reference
const PREDICTIONS_COLLECTION = "predictions";

/**
 * Generate a unique browser fingerprint for anonymous user identification
 * This persists across sessions but is unique per browser
 */
function getBrowserFingerprint() {
  let fingerprint = localStorage.getItem('browser_fingerprint');

  if (!fingerprint) {
    // Generate a simple fingerprint based on browser characteristics
    fingerprint = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('browser_fingerprint', fingerprint);
  }

  return fingerprint;
}

/**
 * Generate a unique composite key for a prediction to prevent duplicates
 * Format: userId_eventId_market_line_type
 */
export function generatePredictionKey(userId, eventId, market, line, type) {
  const sanitize = (str) => String(str).toLowerCase().replace(/\s+/g, '_');
  return `${userId}_${eventId}_${sanitize(market)}_${line}_${type}`;
}

/**
 * Save a prediction to Firestore (with duplicate prevention)
 * @param {Object} prediction - The prediction object
 * @returns {Promise<string>} The prediction document ID
 */
export async function savePredictionToFirebase(prediction) {
  try {
    const userId = getBrowserFingerprint();

    // Generate unique key for duplicate detection
    const uniqueKey = generatePredictionKey(
      userId,
      prediction.match.eventId,
      prediction.prediction.market,
      prediction.prediction.line,
      prediction.prediction.type
    );

    // Check if prediction already exists
    const docRef = doc(db, PREDICTIONS_COLLECTION, uniqueKey);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      console.log(`[Firebase] Prediction already exists: ${uniqueKey}`);
      return uniqueKey; // Return existing ID, don't create duplicate
    }

    // Add userId and Firebase server timestamp
    const predictionWithMeta = {
      ...prediction,
      id: uniqueKey,
      userId,
      createdAtServer: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Save to Firestore
    await setDoc(docRef, predictionWithMeta);
    console.log(`[Firebase] Saved prediction: ${uniqueKey}`);

    return uniqueKey;

  } catch (error) {
    console.error('[Firebase] Error saving prediction:', error);
    throw error;
  }
}

/**
 * Get all predictions for the current user
 * @returns {Promise<Array>} Array of prediction objects
 */
export async function getAllPredictionsFromFirebase() {
  try {
    const userId = getBrowserFingerprint();

    const q = query(
      collection(db, PREDICTIONS_COLLECTION),
      where("userId", "==", userId)
    );

    const querySnapshot = await getDocs(q);
    const predictions = [];

    querySnapshot.forEach((doc) => {
      predictions.push({
        ...doc.data(),
        id: doc.id,
      });
    });

    console.log(`[Firebase] Loaded ${predictions.length} predictions`);
    return predictions;

  } catch (error) {
    console.error('[Firebase] Error loading predictions:', error);
    return [];
  }
}

/**
 * Get predictions for today (last 24 hours)
 * @returns {Promise<Array>} Array of today's predictions
 */
export async function getTodaysPredictionsFromFirebase() {
  try {
    const userId = getBrowserFingerprint();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const q = query(
      collection(db, PREDICTIONS_COLLECTION),
      where("userId", "==", userId),
      where("createdAt", ">=", oneDayAgo)
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
    console.error('[Firebase] Error loading today\'s predictions:', error);
    return [];
  }
}

/**
 * Update a prediction's result after verification
 * @param {string} predictionId - The prediction document ID
 * @param {Object} result - Result object with status, actualValue, etc.
 * @returns {Promise<boolean>} Success status
 */
export async function updatePredictionResult(predictionId, result) {
  try {
    const docRef = doc(db, PREDICTIONS_COLLECTION, predictionId);

    await setDoc(docRef, {
      result: {
        ...result,
        matchFinished: true,
        verifiedAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log(`[Firebase] Updated prediction result: ${predictionId}`);
    return true;

  } catch (error) {
    console.error('[Firebase] Error updating result:', error);
    return false;
  }
}

/**
 * Get pending predictions (not yet verified)
 * @returns {Promise<Array>} Array of pending predictions
 */
export async function getPendingPredictionsFromFirebase() {
  try {
    const userId = getBrowserFingerprint();

    const q = query(
      collection(db, PREDICTIONS_COLLECTION),
      where("userId", "==", userId),
      where("result.status", "==", "pending")
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
    console.error('[Firebase] Error loading pending predictions:', error);
    return [];
  }
}

/**
 * Migrate predictions from localStorage to Firebase
 * @returns {Promise<Object>} Migration statistics
 */
export async function migrateLocalStorageToFirebase() {
  try {
    console.log('[Firebase] Starting migration from localStorage...');

    const localData = localStorage.getItem('predictions');
    if (!localData) {
      console.log('[Firebase] No localStorage data to migrate');
      return { total: 0, migrated: 0, skipped: 0, errors: 0 };
    }

    const predictions = JSON.parse(localData);
    console.log(`[Firebase] Found ${predictions.length} predictions in localStorage`);

    const stats = {
      total: predictions.length,
      migrated: 0,
      skipped: 0,
      errors: 0,
    };

    // Migrate in batches to avoid overwhelming Firestore
    const batchSize = 10;
    for (let i = 0; i < predictions.length; i += batchSize) {
      const batch = predictions.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (pred) => {
          try {
            await savePredictionToFirebase(pred);
            stats.migrated++;
          } catch (error) {
            if (error.message?.includes('already exists')) {
              stats.skipped++;
            } else {
              stats.errors++;
              console.error('[Firebase] Migration error:', error);
            }
          }
        })
      );

      // Small delay between batches
      if (i + batchSize < predictions.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('[Firebase] Migration complete:', stats);
    return stats;

  } catch (error) {
    console.error('[Firebase] Migration failed:', error);
    throw error;
  }
}

/**
 * Check if Firebase is connected and working
 * @returns {Promise<boolean>} Connection status
 */
export async function testFirebaseConnection() {
  try {
    const testDoc = doc(db, 'system', 'connection_test');
    await setDoc(testDoc, {
      timestamp: serverTimestamp(),
      test: true,
    });
    console.log('[Firebase] Connection test: SUCCESS');
    return true;
  } catch (error) {
    console.error('[Firebase] Connection test: FAILED', error);
    return false;
  }
}

export { db, getBrowserFingerprint };
