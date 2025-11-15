// src/utils/resultVerifier.js - Automatic result verification using BetsAPI

import { fetchEventView, fetchStatsTrend } from "../api";
import {
  getPredictionsNeedingVerification,
  verifyPredictionWithStats,
  updatePredictionResult,
} from "./predictionTracker";

/**
 * Verify a single prediction by fetching match results from API
 * @param {Object} prediction - The prediction object from tracker
 * @returns {Promise<Object>} Verification result
 */
export async function verifyPrediction(prediction) {
  try {
    const eventId = prediction.match.eventId;
    console.log(`[ResultVerifier] Verifying prediction ${prediction.id} for event ${eventId}`);

    // Fetch event details
    const eventView = await fetchEventView(eventId);

    // Check if match is finished
    if (!eventView || eventView.time_status !== "3") {
      console.log(`[ResultVerifier] Match not finished yet`);
      return {
        success: false,
        reason: "Match not finished",
        status: eventView?.time_status,
      };
    }

    // Fetch stats
    const stats = await fetchStatsTrend(eventId);

    if (!stats || !stats.length) {
      console.log(`[ResultVerifier] No stats available`);
      return {
        success: false,
        reason: "No stats available",
      };
    }

    // Extract home and away stats
    const homeStats = stats.find(s => s.localteam_id === prediction.match.homeTeamId);
    const awayStats = stats.find(s => s.visitorteam_id === prediction.match.awayTeamId);

    if (!homeStats && !awayStats) {
      console.log(`[ResultVerifier] Stats not found for teams`);
      return {
        success: false,
        reason: "Stats not found",
      };
    }

    // Get the actual stat value (combined home + away)
    const marketKey = prediction.prediction.marketKey;
    const homeValue = parseInt(homeStats?.[marketKey] || 0);
    const awayValue = parseInt(awayStats?.[marketKey] || 0);
    const actualValue = homeValue + awayValue;

    // Determine if prediction won
    const line = prediction.prediction.line;
    const type = prediction.prediction.type;
    let won = false;

    if (type === "over") {
      won = actualValue > line;
    } else {
      won = actualValue < line;
    }

    // Update the prediction
    const result = {
      status: won ? "won" : "lost",
      actualValue: actualValue,
      finalScore: `${eventView.ss || "?-?"}`,
    };

    updatePredictionResult(prediction.id, result);

    console.log(`[ResultVerifier] ${won ? "✅ WON" : "❌ LOST"} - ${marketKey}: ${actualValue} vs ${type} ${line}`);

    return {
      success: true,
      won,
      actualValue,
      line,
      type,
      market: prediction.prediction.market,
      homeValue,
      awayValue,
    };

  } catch (error) {
    console.error(`[ResultVerifier] Error verifying prediction:`, error);
    return {
      success: false,
      reason: "Error fetching data",
      error: error.message,
    };
  }
}

/**
 * Verify all predictions that need verification
 * @returns {Promise<Object>} Summary of verification results
 */
export async function verifyAllPendingPredictions() {
  console.log(`[ResultVerifier] Starting bulk verification...`);

  const pending = getPredictionsNeedingVerification();

  if (pending.length === 0) {
    console.log(`[ResultVerifier] No predictions need verification`);
    return {
      total: 0,
      verified: 0,
      won: 0,
      lost: 0,
      errors: 0,
    };
  }

  console.log(`[ResultVerifier] Found ${pending.length} predictions to verify`);

  const results = {
    total: pending.length,
    verified: 0,
    won: 0,
    lost: 0,
    errors: 0,
    details: [],
  };

  // Process predictions in batches to avoid rate limiting
  const batchSize = 3;
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(pred => verifyPrediction(pred))
    );

    batchResults.forEach((result, idx) => {
      const pred = batch[idx];

      if (result.success) {
        results.verified++;
        if (result.won) {
          results.won++;
        } else {
          results.lost++;
        }

        results.details.push({
          match: `${pred.match.homeTeam} vs ${pred.match.awayTeam}`,
          prediction: `${result.type} ${result.line} ${result.market}`,
          actual: result.actualValue,
          result: result.won ? "WON" : "LOST",
        });
      } else {
        results.errors++;
      }
    });

    // Small delay between batches
    if (i + batchSize < pending.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[ResultVerifier] Verification complete:`, results);
  return results;
}

/**
 * Auto-verify predictions on page load (for finished matches)
 * Call this when the app loads to check for finished matches
 */
export async function autoVerifyOnLoad() {
  const pending = getPredictionsNeedingVerification();

  if (pending.length === 0) {
    return null;
  }

  console.log(`[ResultVerifier] Auto-verifying ${pending.length} predictions...`);

  // Run verification in background (non-blocking)
  verifyAllPendingPredictions()
    .then(results => {
      if (results.verified > 0) {
        console.log(
          `[ResultVerifier] ✅ Auto-verification complete: ${results.won} won, ${results.lost} lost`
        );

        // Optional: Show a toast notification
        // You can implement this if you add a toast library
      }
    })
    .catch(err => {
      console.error(`[ResultVerifier] Auto-verification error:`, err);
    });
}

/**
 * Get a summary of verified predictions for display
 * @returns {Object} Summary statistics
 */
export function getVerificationSummary() {
  // This would aggregate data from the prediction tracker
  // You can enhance this based on your needs
  return {
    message: "Use predictionTracker.getAccuracyStats() for detailed stats",
  };
}
