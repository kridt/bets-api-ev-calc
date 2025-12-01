// server/config/firebase.js
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin SDK
let isInitialized = false;

function initializeFirebase() {
  if (isInitialized) {
    return;
  }

  try {
    // Priority 1: Environment variables (recommended for production)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      console.log('[Firebase] Initialized with environment variables');
      isInitialized = true;
      return;
    }

    // Priority 2: Service account key file (for local development only)
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('[Firebase] Initialized with service account key');
      console.warn('[Firebase] WARNING: Using serviceAccountKey.json - ensure this file is in .gitignore!');
      isInitialized = true;
      return;
    }

    // Priority 3: Application default credentials (GCP environments)
    console.log('[Firebase] No explicit credentials found, trying application default credentials...');
    admin.initializeApp();
    console.log('[Firebase] Initialized with application default credentials');
    isInitialized = true;

  } catch (error) {
    console.error('[Firebase] Initialization failed:', error.message);
    console.error('[Firebase] Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables');
    console.error('[Firebase] Or provide a serviceAccountKey.json file in server/config/');
    throw new Error('Firebase initialization failed - check credentials');
  }
}

// Initialize on module load
initializeFirebase();

const db = admin.firestore();

// Configure Firestore settings to ignore undefined values
db.settings({
  ignoreUndefinedProperties: true
});

// Firebase Collections Structure
// Using EPL-specific collection names to avoid conflicts with existing NBA collections
const collections = {
  // EPL Collections
  MATCHES: 'epl_matches',
  PREDICTIONS: 'epl_predictions',
  ODDS_SNAPSHOTS: 'epl_odds_snapshots',
  VALUE_BETS: 'epl_value_bets',
  RESULTS: 'epl_results',
  TRACKING_STATS: 'epl_tracking_stats',

  // Existing NBA Collections (for reference - not used by EPL server)
  // 'predictions' - NBA predictions (already exists)
  // Add more NBA collections here as needed
};

/**
 * EPL Data Schema (all collections prefixed with 'epl_'):
 *
 * epl_matches/{matchId}
 *   - id: string
 *   - home: string
 *   - away: string
 *   - date: timestamp
 *   - league: { id, name }
 *   - status: 'upcoming' | 'live' | 'finished'
 *   - result: { homeScore, awayScore }
 *   - createdAt: timestamp
 *   - updatedAt: timestamp
 *
 * epl_predictions/{predictionId}
 *   - matchId: string
 *   - market: string (goals, corners, cards, etc.)
 *   - selection: 'over' | 'under'
 *   - line: number
 *   - probability: number
 *   - predictedTotal: number
 *   - homeAvg: number
 *   - awayAvg: number
 *   - reasoning: string
 *   - scannedAt: timestamp
 *
 * epl_odds_snapshots/{snapshotId}
 *   - matchId: string
 *   - market: string
 *   - bookmakers: [{
 *       name: string,
 *       odds: { over, under },
 *       line: number,
 *       updatedAt: timestamp
 *     }]
 *   - scannedAt: timestamp
 *
 * epl_value_bets/{valueBetId}
 *   - matchId: string
 *   - predictionId: string
 *   - market: string
 *   - selection: string
 *   - line: number
 *   - probability: number
 *   - bestOdds: number
 *   - bestBookmaker: string
 *   - ev: number
 *   - allBookmakers: array
 *   - detectedAt: timestamp
 *   - status: 'active' | 'expired' | 'settled'
 *   - result: 'win' | 'loss' | 'push' | null
 *
 * epl_results/{resultId}
 *   - matchId: string
 *   - valueBetIds: array
 *   - finalScore: { home, away }
 *   - marketResults: {
 *       goals: number,
 *       corners: number,
 *       cards: number,
 *       shotsOnTarget: number
 *     }
 *   - verifiedAt: timestamp
 *
 * epl_tracking_stats/{date}
 *   - date: string (YYYY-MM-DD)
 *   - totalMatches: number
 *   - totalPredictions: number
 *   - totalValueBets: number
 *   - totalSettled: number
 *   - wins: number
 *   - losses: number
 *   - pushes: number
 *   - totalStake: number (assuming unit stakes)
 *   - totalReturn: number
 *   - roi: number
 *   - avgEV: number
 *
 * NOTE: Existing 'predictions' collection is used for NBA data and remains unchanged
 */

module.exports = {
  admin,
  db,
  collections
};
