// src/utils/evCalculator.js - Expected Value Calculator

/**
 * Calculate Expected Value (EV) for a bet
 * @param {number} probability - True probability (0-1)
 * @param {number} decimalOdds - Bookmaker odds in decimal format
 * @returns {number} Expected value as a percentage (-100 to infinity)
 */
export function calculateEV(probability, decimalOdds) {
  if (!probability || !decimalOdds || probability <= 0 || probability > 1 || decimalOdds <= 1) {
    return null;
  }

  // EV = (Probability × Decimal Odds) - 1
  const ev = (probability * decimalOdds) - 1;

  // Return as percentage
  return ev * 100;
}

/**
 * Calculate implied probability from decimal odds
 * @param {number} decimalOdds - Decimal odds
 * @returns {number} Implied probability (0-1)
 */
export function impliedProbability(decimalOdds) {
  if (!decimalOdds || decimalOdds <= 0) {
    return null;
  }

  return 1 / decimalOdds;
}

/**
 * Calculate edge (difference between true and implied probability)
 * @param {number} trueProbability - Your estimated probability (0-1)
 * @param {number} decimalOdds - Bookmaker odds
 * @returns {number} Edge as percentage
 */
export function calculateEdge(trueProbability, decimalOdds) {
  const implied = impliedProbability(decimalOdds);
  if (!implied || !trueProbability) {
    return null;
  }

  return (trueProbability - implied) * 100;
}

/**
 * Calculate Kelly Criterion stake
 * @param {number} probability - True probability (0-1)
 * @param {number} decimalOdds - Decimal odds
 * @param {number} bankroll - Total bankroll
 * @param {number} kellyFraction - Kelly fraction (0-1, default 0.25 for quarter-Kelly)
 * @returns {number} Recommended stake amount
 */
export function kellyStake(probability, decimalOdds, bankroll, kellyFraction = 0.25) {
  if (!probability || !decimalOdds || !bankroll) {
    return null;
  }

  // Kelly formula: f = (bp - q) / b
  // where b = decimal odds - 1, p = probability, q = 1 - p
  const b = decimalOdds - 1;
  const p = probability;
  const q = 1 - p;

  const f = (b * p - q) / b;

  // If Kelly is negative or zero, don't bet
  if (f <= 0) {
    return 0;
  }

  // Apply Kelly fraction for safety
  const stake = f * kellyFraction * bankroll;

  // Cap at reasonable maximum (10% of bankroll)
  return Math.min(stake, bankroll * 0.1);
}

/**
 * Evaluate a betting opportunity
 * @param {Object} opportunity - Betting opportunity
 * @param {number} opportunity.probability - True probability (0-1)
 * @param {number} opportunity.odds - Decimal odds
 * @param {number} opportunity.line - Line value (for totals/spreads)
 * @param {string} opportunity.market - Market name
 * @param {string} opportunity.selection - Selection (over/under/home/away)
 */
export function evaluateBet(opportunity) {
  const { probability, odds, line, market, selection } = opportunity;

  if (!probability || !odds) {
    return null;
  }

  const ev = calculateEV(probability, odds);
  const edge = calculateEdge(probability, odds);
  const implied = impliedProbability(odds);

  return {
    market,
    selection,
    line,
    probability: probability * 100, // as percentage
    impliedProbability: implied * 100,
    odds,
    ev: ev ? ev.toFixed(2) : null,
    edge: edge ? edge.toFixed(2) : null,
    isValueBet: ev && ev > 0,
    grade: gradeOpportunity(ev)
  };
}

/**
 * Grade betting opportunity based on EV
 */
function gradeOpportunity(ev) {
  if (!ev || ev <= 0) return 'poor';
  if (ev > 20) return 'excellent';
  if (ev > 10) return 'great';
  if (ev > 5) return 'good';
  return 'fair';
}

/**
 * Compare predicted probability with all available bookmaker odds
 * @param {number} probability - Predicted probability (0-1)
 * @param {Array} bookmakerOdds - Array of {bookmaker, odds, url}
 * @param {Object} details - Additional details (market, selection, line)
 */
export function compareWithBookmakers(probability, bookmakerOdds, details = {}) {
  const { market, selection, line } = details;

  const comparisons = bookmakerOdds.map(({ bookmaker, odds, url, updatedAt }) => {
    const ev = calculateEV(probability, odds);
    const edge = calculateEdge(probability, odds);

    return {
      bookmaker,
      odds,
      url,
      updatedAt,
      ev: ev ? parseFloat(ev.toFixed(2)) : null,
      edge: edge ? parseFloat(edge.toFixed(2)) : null,
      isValueBet: ev && ev > 0,
      grade: gradeOpportunity(ev)
    };
  });

  // Sort by EV (highest first)
  comparisons.sort((a, b) => (b.ev || 0) - (a.ev || 0));

  return {
    market,
    selection,
    line,
    probability: probability * 100,
    bestOpportunity: comparisons[0] || null,
    allBookmakers: comparisons,
    hasValueBet: comparisons.some(c => c.isValueBet)
  };
}

/**
 * Find value bets from predictions and odds
 * @param {Array} predictions - Predictions with probability
 * @param {Object} oddsData - Odds data from API
 * @param {Object} options - Options
 * @returns {Array} Array of value bets sorted by EV
 */
export function findValueBets(predictions, oddsData, options = {}) {
  // Input validation
  if (!predictions || !Array.isArray(predictions)) {
    console.warn('[evCalculator] findValueBets: predictions must be an array');
    return [];
  }

  if (!oddsData) {
    console.warn('[evCalculator] findValueBets: oddsData is required');
    return [];
  }

  const {
    minEV = 0,
    minProbability = 0.55,
    maxProbability = 0.65,
    markets = ['Totals', 'Corners Totals']
  } = options;

  const valueBets = [];

  for (const prediction of predictions) {
    try {
      // Skip null/undefined predictions
      if (!prediction) {
        continue;
      }

      const { probability, market, selection, line, statKey } = prediction;

      // Validate required fields
      if (typeof probability !== 'number' || isNaN(probability)) {
        continue;
      }

      // Skip if probability is outside range
      if (probability < minProbability || probability > maxProbability) {
        continue;
      }

      // Map market name to API market name
      const apiMarketName = mapMarketName(market, statKey);

      if (!markets.includes(apiMarketName)) {
        continue;
      }

      // Get all bookmaker odds for this market
      const bookmakerOdds = extractBookmakerOddsForMarket(
        oddsData,
        apiMarketName,
        selection,
        line
      );

      if (!bookmakerOdds || bookmakerOdds.length === 0) {
        continue;
      }

      // Compare with bookmakers
      const comparison = compareWithBookmakers(probability, bookmakerOdds, {
        market: apiMarketName,
        selection,
        line
      });

      // Filter for positive EV
      if (comparison && comparison.bestOpportunity && comparison.bestOpportunity.ev >= minEV) {
        valueBets.push({
          ...prediction,
          odds: comparison.bestOpportunity,
          allBookmakers: comparison.allBookmakers
        });
      }
    } catch (error) {
      console.error('[evCalculator] Error processing prediction:', error.message);
      continue;
    }
  }

  // Sort by EV (highest first)
  valueBets.sort((a, b) => (b.odds?.ev || 0) - (a.odds?.ev || 0));

  return valueBets;
}

/**
 * Map prediction market to API market name
 */
function mapMarketName(market, statKey) {
  const marketMap = {
    'Corners': 'Corners Totals',
    'Total Shots': 'Totals', // Approximation
    'Goals': 'Totals',
    'Shots on Target': 'Totals', // Approximation
    'Yellow Cards': 'Totals' // Not typically available
  };

  return marketMap[market] || 'Totals';
}

/**
 * Extract bookmaker odds for a specific market
 */
function extractBookmakerOddsForMarket(oddsData, marketName, selection, targetLine) {
  if (!oddsData || !oddsData.bookmakers) {
    return [];
  }

  const bookmakerOdds = [];

  for (const [bookmaker, markets] of Object.entries(oddsData.bookmakers)) {
    const market = markets.find(m => m.name === marketName);

    if (!market || !market.odds) {
      continue;
    }

    // Find odds with matching line (if applicable)
    for (const oddsEntry of market.odds) {
      // Check if line matches (for totals/spreads)
      if (targetLine !== undefined && oddsEntry.hdp !== undefined) {
        if (Math.abs(oddsEntry.hdp - targetLine) > 0.1) {
          continue; // Line doesn't match
        }
      }

      // Get the odds value for the selection
      const oddsValue = parseFloat(oddsEntry[selection]);

      if (oddsValue) {
        bookmakerOdds.push({
          bookmaker,
          odds: oddsValue,
          url: oddsData.urls?.[bookmaker] || null,
          updatedAt: market.updatedAt,
          line: oddsEntry.hdp
        });
        break; // Only take first matching odds entry per bookmaker
      }
    }
  }

  return bookmakerOdds;
}

/**
 * Calculate overall statistics for value bets
 */
export function calculateValueBetStats(valueBets) {
  if (!valueBets || valueBets.length === 0) {
    return {
      count: 0,
      avgEV: 0,
      avgEdge: 0,
      avgOdds: 0,
      avgProbability: 0,
      gradeDistribution: {}
    };
  }

  const evValues = valueBets.map(vb => vb.odds.ev).filter(Boolean);
  const edgeValues = valueBets.map(vb => vb.odds.edge).filter(Boolean);
  const oddsValues = valueBets.map(vb => vb.odds.odds).filter(Boolean);
  const probValues = valueBets.map(vb => vb.probability).filter(Boolean);

  const grades = {};
  valueBets.forEach(vb => {
    const grade = vb.odds.grade;
    grades[grade] = (grades[grade] || 0) + 1;
  });

  return {
    count: valueBets.length,
    avgEV: evValues.reduce((a, b) => a + b, 0) / evValues.length,
    avgEdge: edgeValues.reduce((a, b) => a + b, 0) / edgeValues.length,
    avgOdds: oddsValues.reduce((a, b) => a + b, 0) / oddsValues.length,
    avgProbability: probValues.reduce((a, b) => a + b, 0) / probValues.length,
    gradeDistribution: grades
  };
}
