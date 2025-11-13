// src/utils/probability.js

/**
 * Calculate standard deviation of an array of numbers
 */
function standardDeviation(values) {
  if (!values || values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate weighted average with exponential decay (recent matches weighted more)
 * Most recent match gets weight 1.0, previous gets 0.9, then 0.81, etc.
 */
function weightedAverage(values, decayFactor = 0.9) {
  if (!values || values.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  // Reverse so most recent is first
  const reversed = [...values].reverse();

  reversed.forEach((value, index) => {
    const weight = Math.pow(decayFactor, index);
    weightedSum += value * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate probability using cumulative distribution function (normal distribution)
 * Returns probability that a value will be OVER the threshold
 */
function calculateProbabilityOver(threshold, mean, stdDev) {
  if (stdDev === 0) {
    // If no variance, it's binary: either always over or always under
    return mean > threshold ? 1 : 0;
  }

  // Calculate z-score
  const z = (threshold - mean) / stdDev;

  // Approximate CDF using error function approximation
  // P(X > threshold) = 1 - CDF(z)
  const cdf = 0.5 * (1 + erf(z / Math.sqrt(2)));
  return 1 - cdf;
}

/**
 * Error function approximation (needed for normal distribution CDF)
 */
function erf(x) {
  // Save the sign of x
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  // Constants
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // Abramowitz and Stegun formula 7.1.26
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Extract numeric values from match details for a specific stat
 */
function extractValues(details, statKey) {
  if (!details || !Array.isArray(details)) return [];

  return details
    .map(match => match[statKey])
    .filter(val => typeof val === 'number' && Number.isFinite(val));
}

/**
 * Calculate combined team statistics (both home and away)
 * Returns predicted total for the match
 */
function calculateCombinedPrediction(homeDetails, awayDetails, statKey) {
  const homeValues = extractValues(homeDetails, statKey);
  const awayValues = extractValues(awayDetails, statKey);

  if (homeValues.length === 0 && awayValues.length === 0) {
    return null;
  }

  // 1. Simple averages
  const homeAvg = homeValues.length > 0
    ? homeValues.reduce((a, b) => a + b, 0) / homeValues.length
    : 0;
  const awayAvg = awayValues.length > 0
    ? awayValues.reduce((a, b) => a + b, 0) / awayValues.length
    : 0;

  // 2. Weighted averages (form-based)
  const homeWeighted = weightedAverage(homeValues);
  const awayWeighted = weightedAverage(awayValues);

  // 3. Combine both teams
  const simplePrediction = homeAvg + awayAvg;
  const weightedPrediction = homeWeighted + awayWeighted;

  // Use weighted average of both methods (60% weighted, 40% simple)
  const finalPrediction = (weightedPrediction * 0.6) + (simplePrediction * 0.4);

  // 4. Calculate combined standard deviation
  const homeStd = standardDeviation(homeValues);
  const awayStd = standardDeviation(awayValues);
  // For sum of independent variables: σ_total = √(σ_home² + σ_away²)
  const combinedStd = Math.sqrt(homeStd * homeStd + awayStd * awayStd);

  return {
    prediction: finalPrediction,
    stdDev: combinedStd,
    homeAvg,
    awayAvg,
    sampleSize: homeValues.length + awayValues.length,
    homeValues,
    awayValues
  };
}

/**
 * Find the best over/under line for a given stat that has probability closest to target
 */
function findBestLine(prediction, targetProbability = 0.60, minProb = 0.58, maxProb = 0.62) {
  if (!prediction) return null;

  const { prediction: mean, stdDev } = prediction;

  // Test common betting lines
  const possibleLines = [];

  // Generate lines from mean-2σ to mean+2σ in 0.5 increments
  const minLine = Math.max(0, Math.floor((mean - 2 * stdDev) * 2) / 2);
  const maxLine = Math.ceil((mean + 2 * stdDev) * 2) / 2;

  for (let line = minLine; line <= maxLine; line += 0.5) {
    const probOver = calculateProbabilityOver(line, mean, stdDev);
    const probUnder = 1 - probOver;

    // Check if either over or under falls in our target range
    if (probOver >= minProb && probOver <= maxProb) {
      possibleLines.push({
        line,
        type: 'over',
        probability: probOver,
        odds: 1 / probOver,
        distance: Math.abs(probOver - targetProbability)
      });
    }

    if (probUnder >= minProb && probUnder <= maxProb) {
      possibleLines.push({
        line,
        type: 'under',
        probability: probUnder,
        odds: 1 / probUnder,
        distance: Math.abs(probUnder - targetProbability)
      });
    }
  }

  // Sort by distance from target probability
  possibleLines.sort((a, b) => a.distance - b.distance);

  return possibleLines[0] || null;
}

/**
 * Calculate all betting predictions for a match
 */
export function calculateBettingPredictions(homeDetails, awayDetails, options = {}) {
  const {
    targetProbability = 0.60,
    minProbability = 0.58,
    maxProbability = 0.62
  } = options;

  const markets = [
    { key: 'corners', label: 'Corners', emoji: '🚩' },
    { key: 'yellowcards', label: 'Yellow Cards', emoji: '🟨' },
    { key: 'shots_total', label: 'Total Shots', emoji: '⚽' },
    { key: 'shots_on_target', label: 'Shots on Target', emoji: '🎯' }
  ];

  const predictions = [];

  for (const market of markets) {
    const prediction = calculateCombinedPrediction(homeDetails, awayDetails, market.key);

    if (!prediction || prediction.sampleSize < 3) {
      continue; // Skip if insufficient data
    }

    const bestLine = findBestLine(prediction, targetProbability, minProbability, maxProbability);

    if (bestLine) {
      predictions.push({
        market: market.label,
        emoji: market.emoji,
        statKey: market.key,
        line: bestLine.line,
        type: bestLine.type,
        probability: bestLine.probability,
        odds: bestLine.odds,
        decimalOdds: bestLine.odds.toFixed(2),
        percentage: (bestLine.probability * 100).toFixed(1),
        prediction: prediction.prediction.toFixed(1),
        homeAvg: prediction.homeAvg.toFixed(1),
        awayAvg: prediction.awayAvg.toFixed(1),
        sampleSize: prediction.sampleSize,
        confidence: getConfidenceLevel(prediction.sampleSize, prediction.stdDev)
      });
    }
  }

  // Sort by probability (closest to target first)
  predictions.sort((a, b) => {
    const aDist = Math.abs(a.probability - targetProbability);
    const bDist = Math.abs(b.probability - targetProbability);
    return aDist - bDist;
  });

  return predictions;
}

/**
 * Get confidence level based on sample size and variability
 */
function getConfidenceLevel(sampleSize, stdDev) {
  // More samples and lower variance = higher confidence
  if (sampleSize >= 8 && stdDev < 2) return 'high';
  if (sampleSize >= 5 && stdDev < 3) return 'medium';
  return 'low';
}

/**
 * Format odds for display
 */
export function formatOdds(decimalOdds) {
  const odds = parseFloat(decimalOdds);

  // Also show fractional for reference
  const fractional = decimalToFractional(odds);

  return {
    decimal: odds.toFixed(2),
    fractional: fractional,
    american: decimalToAmerican(odds)
  };
}

/**
 * Convert decimal odds to fractional
 */
function decimalToFractional(decimal) {
  const fraction = decimal - 1;

  // Find closest simple fraction
  const fractions = [
    [1, 10], [1, 9], [1, 8], [1, 7], [1, 6], [1, 5], [2, 9], [1, 4], [2, 7],
    [3, 10], [1, 3], [4, 11], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7], [8, 13],
    [4, 6], [10, 11], [1, 1], [11, 10], [6, 5], [5, 4], [11, 8], [7, 5],
    [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1],
    [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1]
  ];

  let closest = fractions[0];
  let minDiff = Math.abs(fraction - (fractions[0][0] / fractions[0][1]));

  for (const frac of fractions) {
    const diff = Math.abs(fraction - (frac[0] / frac[1]));
    if (diff < minDiff) {
      minDiff = diff;
      closest = frac;
    }
  }

  return `${closest[0]}/${closest[1]}`;
}

/**
 * Convert decimal odds to American odds
 */
function decimalToAmerican(decimal) {
  if (decimal >= 2) {
    return '+' + Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1)).toString();
  }
}
