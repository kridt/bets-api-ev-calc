// server/services/footballProbabilityCalculator.js
// Advanced probability calculator for football betting markets

/**
 * PROBABILITY MODELS:
 *
 * 1. GOALS - Poisson Distribution
 *    Best for discrete count data (0, 1, 2, 3... goals)
 *    Uses team attacking/defensive strengths
 *
 * 2. CORNERS - Normal Distribution (with Poisson fallback)
 *    Corners are more variable, normal distribution captures this
 *    Uses team's attacking tempo and style
 *
 * 3. CARDS - Negative Binomial / Normal
 *    Cards are somewhat random but influenced by play style
 *    Uses team fouling rate and referee tendencies
 *
 * 4. SHOTS ON TARGET - Normal Distribution
 *    Continuous-ish data, well modeled by normal
 *    Uses team's attacking metrics
 */

// ============================================
// STATISTICAL HELPER FUNCTIONS
// ============================================

/**
 * Factorial with memoization for performance
 */
const factorialCache = [1, 1];
function factorial(n) {
  if (n < 0) return 1;
  if (n < factorialCache.length) return factorialCache[n];

  for (let i = factorialCache.length; i <= n; i++) {
    factorialCache[i] = factorialCache[i - 1] * i;
  }
  return factorialCache[n];
}

/**
 * Poisson probability: P(X = k) = (lambda^k * e^-lambda) / k!
 */
function poissonProbability(lambda, k) {
  if (lambda <= 0 || k < 0) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Poisson CDF: P(X <= k)
 */
function poissonCDF(lambda, k) {
  let prob = 0;
  for (let i = 0; i <= Math.floor(k); i++) {
    prob += poissonProbability(lambda, i);
  }
  return prob;
}

/**
 * Normal CDF approximation (Abramowitz and Stegun)
 */
function normalCDF(z) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate mean of array
 */
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate standard deviation
 */
function stdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

// ============================================
// GOALS PROBABILITY (Poisson Distribution)
// ============================================

/**
 * Calculate goal expectation using attacking/defensive strengths
 *
 * @param {Object} homeTeam - Home team statistics
 * @param {Object} awayTeam - Away team statistics
 * @param {Object} leagueAvg - League average statistics
 * @returns {Object} Expected goals for each team and total
 */
function calculateExpectedGoals(homeTeam, awayTeam, leagueAvg = { homeGoals: 1.5, awayGoals: 1.2 }) {
  // Calculate attacking and defensive strengths
  const homeAttackStrength = (homeTeam.goals?.homeAvg || homeTeam.goals?.avg || 1.35) / leagueAvg.homeGoals;
  const homeDefenseStrength = (homeTeam.goals?.avgConceded || 1.2) / leagueAvg.awayGoals;

  const awayAttackStrength = (awayTeam.goals?.awayAvg || awayTeam.goals?.avg || 1.15) / leagueAvg.awayGoals;
  const awayDefenseStrength = (awayTeam.goals?.avgConceded || 1.3) / leagueAvg.homeGoals;

  // Expected goals = attack strength * defense weakness * league average
  const homeExpectedGoals = homeAttackStrength * awayDefenseStrength * leagueAvg.homeGoals;
  const awayExpectedGoals = awayAttackStrength * homeDefenseStrength * leagueAvg.awayGoals;

  return {
    homeExpected: Math.max(0.5, Math.min(4, homeExpectedGoals)), // Clamp between 0.5 and 4
    awayExpected: Math.max(0.3, Math.min(3.5, awayExpectedGoals)),
    totalExpected: homeExpectedGoals + awayExpectedGoals,
    homeAttackStrength,
    homeDefenseStrength,
    awayAttackStrength,
    awayDefenseStrength
  };
}

/**
 * Calculate probability for total goals over/under
 *
 * @param {number} homeExpected - Expected goals for home team
 * @param {number} awayExpected - Expected goals for away team
 * @param {number} line - Betting line (e.g., 2.5)
 * @param {string} selection - 'over' or 'under'
 * @returns {number} Probability (0-100)
 */
function calculateGoalsProbability(homeExpected, awayExpected, line, selection) {
  const totalLambda = homeExpected + awayExpected;

  // For total goals, we need to consider all score combinations
  // Simplified approach using sum of independent Poissons
  // More accurate: bivariate Poisson, but this is good enough for betting

  if (selection === 'under') {
    // P(total <= line) using Poisson CDF
    return poissonCDF(totalLambda, line) * 100;
  } else {
    // P(total > line) = 1 - P(total <= line)
    return (1 - poissonCDF(totalLambda, line)) * 100;
  }
}

// ============================================
// CORNERS PROBABILITY (Normal Distribution)
// ============================================

/**
 * Calculate expected corners
 *
 * Corners correlate with:
 * - Team's attacking style (possession, crosses)
 * - Goals scored (more attacks = more corners)
 * - Opposition's defensive style
 */
function calculateExpectedCorners(homeTeam, awayTeam) {
  const homeCorners = homeTeam.corners?.homeAvg || homeTeam.corners?.avg || 5.5;
  const awayCorners = awayTeam.corners?.awayAvg || awayTeam.corners?.avg || 5.0;

  // Home advantage: teams get ~10% more corners at home
  const adjustedHomeCorners = homeCorners * 1.05;
  const adjustedAwayCorners = awayCorners * 0.95;

  return {
    homeExpected: adjustedHomeCorners,
    awayExpected: adjustedAwayCorners,
    totalExpected: adjustedHomeCorners + adjustedAwayCorners,
    // Variance for corners is typically ~2.5 per team
    totalStdDev: Math.sqrt(2.5 * 2.5 + 2.5 * 2.5) // Combined std dev
  };
}

/**
 * Calculate corners probability using Normal distribution
 */
function calculateCornersProbability(homeExpected, awayExpected, line, selection) {
  const totalMu = homeExpected + awayExpected;
  const totalSigma = 3.5; // Typical std dev for total corners

  // Use continuity correction for discrete data
  const correctedLine = selection === 'under' ? line + 0.5 : line - 0.5;
  const z = (correctedLine - totalMu) / totalSigma;

  if (selection === 'under') {
    return normalCDF(z) * 100;
  } else {
    return (1 - normalCDF(z)) * 100;
  }
}

// ============================================
// CARDS PROBABILITY (Normal Distribution)
// ============================================

/**
 * Calculate expected yellow cards
 *
 * Cards influenced by:
 * - Team's fouling rate
 * - Match importance/rivalry
 * - Referee tendencies
 */
function calculateExpectedCards(homeTeam, awayTeam, referee = null) {
  const homeCards = homeTeam.yellow_cards?.homeAvg || homeTeam.yellow_cards?.avg || 1.6;
  const awayCards = awayTeam.yellow_cards?.awayAvg || awayTeam.yellow_cards?.avg || 1.9;

  // Away teams typically get ~15% more cards
  const adjustedAwayCards = awayCards * 1.05;

  // If referee data available, adjust for strictness
  let refMultiplier = 1.0;
  if (referee?.avgCards) {
    const leagueAvgCards = 3.5;
    refMultiplier = referee.avgCards / leagueAvgCards;
  }

  const totalExpected = (homeCards + adjustedAwayCards) * refMultiplier;

  return {
    homeExpected: homeCards * refMultiplier,
    awayExpected: adjustedAwayCards * refMultiplier,
    totalExpected,
    totalStdDev: 1.8 // Typical std dev for total cards
  };
}

/**
 * Calculate cards probability using Normal distribution
 */
function calculateCardsProbability(homeExpected, awayExpected, line, selection) {
  const totalMu = homeExpected + awayExpected;
  const totalSigma = 1.8;

  const correctedLine = selection === 'under' ? line + 0.5 : line - 0.5;
  const z = (correctedLine - totalMu) / totalSigma;

  if (selection === 'under') {
    return normalCDF(z) * 100;
  } else {
    return (1 - normalCDF(z)) * 100;
  }
}

// ============================================
// SHOTS ON TARGET PROBABILITY
// ============================================

/**
 * Calculate expected shots on target
 */
function calculateExpectedShots(homeTeam, awayTeam) {
  const homeShots = homeTeam.shots_on_target?.homeAvg || homeTeam.shots_on_target?.avg || 4.5;
  const awayShots = awayTeam.shots_on_target?.awayAvg || awayTeam.shots_on_target?.avg || 4.0;

  // Home advantage for shots
  const adjustedHomeShots = homeShots * 1.08;
  const adjustedAwayShots = awayShots * 0.95;

  return {
    homeExpected: adjustedHomeShots,
    awayExpected: adjustedAwayShots,
    totalExpected: adjustedHomeShots + adjustedAwayShots,
    totalStdDev: 3.0
  };
}

/**
 * Calculate shots probability
 */
function calculateShotsProbability(homeExpected, awayExpected, line, selection) {
  const totalMu = homeExpected + awayExpected;
  const totalSigma = 3.0;

  const correctedLine = selection === 'under' ? line + 0.5 : line - 0.5;
  const z = (correctedLine - totalMu) / totalSigma;

  if (selection === 'under') {
    return normalCDF(z) * 100;
  } else {
    return (1 - normalCDF(z)) * 100;
  }
}

// ============================================
// MAIN PREDICTION GENERATOR
// ============================================

/**
 * Common betting lines for each market
 */
const MARKET_LINES = {
  goals: [0.5, 1.5, 2.5, 3.5, 4.5],
  corners: [7.5, 8.5, 9.5, 10.5, 11.5, 12.5],
  yellow_cards: [2.5, 3.5, 4.5, 5.5, 6.5],
  shots_on_target: [7.5, 8.5, 9.5, 10.5, 11.5]
};

/**
 * Generate all predictions for a match
 *
 * @param {Object} homeTeamStats - Home team statistics from footballDataApi
 * @param {Object} awayTeamStats - Away team statistics from footballDataApi
 * @param {Object} matchInfo - Match information (teams, date, etc.)
 * @param {Object} options - Generation options
 * @returns {Array} Array of prediction objects
 */
function generateMatchPredictions(homeTeamStats, awayTeamStats, matchInfo, options = {}) {
  const {
    minProbability = 52,  // Minimum probability to include
    maxProbability = 72,  // Maximum probability to include
    markets = ['goals', 'corners', 'yellow_cards', 'shots_on_target']
  } = options;

  const predictions = [];

  // Calculate expected values for each market
  const goalsExpected = calculateExpectedGoals(homeTeamStats, awayTeamStats);
  const cornersExpected = calculateExpectedCorners(homeTeamStats, awayTeamStats);
  const cardsExpected = calculateExpectedCards(homeTeamStats, awayTeamStats);
  const shotsExpected = calculateExpectedShots(homeTeamStats, awayTeamStats);

  // Generate predictions for each market
  for (const market of markets) {
    const lines = MARKET_LINES[market] || [];

    for (const line of lines) {
      for (const selection of ['over', 'under']) {
        let probability;
        let homeAvg, awayAvg, predictedTotal;

        switch (market) {
          case 'goals':
            probability = calculateGoalsProbability(
              goalsExpected.homeExpected,
              goalsExpected.awayExpected,
              line,
              selection
            );
            homeAvg = goalsExpected.homeExpected;
            awayAvg = goalsExpected.awayExpected;
            predictedTotal = goalsExpected.totalExpected;
            break;

          case 'corners':
            probability = calculateCornersProbability(
              cornersExpected.homeExpected,
              cornersExpected.awayExpected,
              line,
              selection
            );
            homeAvg = cornersExpected.homeExpected;
            awayAvg = cornersExpected.awayExpected;
            predictedTotal = cornersExpected.totalExpected;
            break;

          case 'yellow_cards':
            probability = calculateCardsProbability(
              cardsExpected.homeExpected,
              cardsExpected.awayExpected,
              line,
              selection
            );
            homeAvg = cardsExpected.homeExpected;
            awayAvg = cardsExpected.awayExpected;
            predictedTotal = cardsExpected.totalExpected;
            break;

          case 'shots_on_target':
            probability = calculateShotsProbability(
              shotsExpected.homeExpected,
              shotsExpected.awayExpected,
              line,
              selection
            );
            homeAvg = shotsExpected.homeExpected;
            awayAvg = shotsExpected.awayExpected;
            predictedTotal = shotsExpected.totalExpected;
            break;

          default:
            continue;
        }

        // Only include predictions within probability range
        if (probability >= minProbability && probability <= maxProbability) {
          const fairOdds = 100 / probability;

          predictions.push({
            matchId: matchInfo.id,
            homeTeam: matchInfo.homeTeam,
            awayTeam: matchInfo.awayTeam,
            kickoff: matchInfo.kickoff,

            // Prediction details
            statKey: market,
            market: getMarketDisplayName(market),
            side: selection,
            line,

            // Probabilities
            probability: parseFloat(probability.toFixed(2)),
            fairOdds: parseFloat(fairOdds.toFixed(3)),

            // Statistics used
            homeAvg: parseFloat(homeAvg.toFixed(2)),
            awayAvg: parseFloat(awayAvg.toFixed(2)),
            matchPrediction: parseFloat(predictedTotal.toFixed(2)),

            // Metadata
            type: 'match',
            confidence: getConfidenceLevel(probability),
            model: getModelType(market),
            dataQuality: homeTeamStats.dataQuality?.isDefault ? 'estimated' : 'calculated',

            generatedAt: new Date().toISOString()
          });
        }
      }
    }
  }

  // Sort by probability (most confident first)
  predictions.sort((a, b) => {
    // Prioritize predictions closer to 60% (sweet spot)
    const aDistance = Math.abs(60 - a.probability);
    const bDistance = Math.abs(60 - b.probability);
    return aDistance - bDistance;
  });

  return predictions;
}

/**
 * Get display name for market
 */
function getMarketDisplayName(market) {
  const names = {
    goals: 'Total Goals',
    corners: 'Corners',
    yellow_cards: 'Yellow Cards',
    shots_on_target: 'Shots on Target'
  };
  return names[market] || market;
}

/**
 * Get confidence level from probability
 */
function getConfidenceLevel(probability) {
  if (probability >= 65 || probability <= 35) return 'high';
  if (probability >= 58 || probability <= 42) return 'medium';
  return 'low';
}

/**
 * Get model type used for market
 */
function getModelType(market) {
  switch (market) {
    case 'goals':
      return 'poisson';
    case 'corners':
    case 'yellow_cards':
    case 'shots_on_target':
      return 'normal';
    default:
      return 'unknown';
  }
}

/**
 * Calculate Kelly stake recommendation
 *
 * @param {number} probability - True probability (0-100)
 * @param {number} odds - Decimal odds
 * @param {number} bankroll - Total bankroll
 * @param {number} kellyFraction - Kelly fraction (default 0.25 for quarter-Kelly)
 */
function calculateKellyStake(probability, odds, bankroll, kellyFraction = 0.25) {
  const p = probability / 100;
  const q = 1 - p;
  const b = odds - 1;

  // Kelly formula: f = (bp - q) / b
  const f = (b * p - q) / b;

  if (f <= 0) return 0;

  // Apply Kelly fraction and cap at 5% of bankroll
  const stake = f * kellyFraction * bankroll;
  return Math.min(stake, bankroll * 0.05);
}

// Export all functions
module.exports = {
  // Main functions
  generateMatchPredictions,
  calculateKellyStake,

  // Market-specific calculators
  calculateExpectedGoals,
  calculateGoalsProbability,
  calculateExpectedCorners,
  calculateCornersProbability,
  calculateExpectedCards,
  calculateCardsProbability,
  calculateExpectedShots,
  calculateShotsProbability,

  // Statistical helpers
  poissonProbability,
  poissonCDF,
  normalCDF,
  mean,
  stdDev,

  // Constants
  MARKET_LINES
};
