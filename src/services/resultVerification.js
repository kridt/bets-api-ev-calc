// src/services/resultVerification.js - Automated result verification service

import { fetchEventView } from "../api/bets";

/**
 * Fetch completed soccer match statistics from BetsAPI
 * @param {string} eventId - The BetsAPI event ID
 * @returns {Promise<Object|null>} Match stats or null if not found
 */
export async function fetchSoccerMatchResult(eventId) {
  try {
    console.log('[Result Verification] Fetching soccer match:', eventId);
    const eventData = await fetchEventView(eventId);

    if (!eventData || !eventData.stats) {
      console.warn('[Result Verification] No stats found for event:', eventId);
      return null;
    }

    // Extract final statistics from the match
    const stats = eventData.stats;

    return {
      eventId: eventData.id,
      homeTeam: eventData.home?.name || 'Home',
      awayTeam: eventData.away?.name || 'Away',
      score: {
        home: eventData.ss ? parseInt(eventData.ss.split('-')[0]) : null,
        away: eventData.ss ? parseInt(eventData.ss.split('-')[1]) : null,
      },
      stats: {
        // Corners
        corners: {
          home: parseInt(stats.corners?.home) || 0,
          away: parseInt(stats.corners?.away) || 0,
          total: (parseInt(stats.corners?.home) || 0) + (parseInt(stats.corners?.away) || 0),
        },
        // Yellow cards
        yellowCards: {
          home: parseInt(stats.yellowcards?.home) || 0,
          away: parseInt(stats.yellowcards?.away) || 0,
          total: (parseInt(stats.yellowcards?.home) || 0) + (parseInt(stats.yellowcards?.away) || 0),
        },
        // Shots on target
        shotsOnTarget: {
          home: parseInt(stats.attacks?.home) || 0, // BetsAPI might use 'attacks' or 'shotstarget'
          away: parseInt(stats.attacks?.away) || 0,
          total: (parseInt(stats.attacks?.home) || 0) + (parseInt(stats.attacks?.away) || 0),
        },
        // Total shots
        shots: {
          home: parseInt(stats.shots_total?.home) || 0,
          away: parseInt(stats.shots_total?.away) || 0,
          total: (parseInt(stats.shots_total?.home) || 0) + (parseInt(stats.shots_total?.away) || 0),
        },
      },
      finished: eventData.time_status === '3' || eventData.time_status === 3, // 3 = finished
    };
  } catch (error) {
    console.error('[Result Verification] Error fetching soccer result:', error);
    throw new Error(`Failed to fetch soccer match result: ${error.message}`);
  }
}

/**
 * Fetch completed NBA game statistics from Ball Don't Lie API
 * Uses the backend NBA API server
 * @param {number} gameId - The Ball Don't Lie game ID
 * @param {number} playerId - The player ID
 * @returns {Promise<Object|null>} Player stats or null if not found
 */
export async function fetchNBAPlayerResult(gameId, playerId) {
  try {
    console.log('[Result Verification] Fetching NBA stats:', { gameId, playerId });

    // Use the NBA API backend (player-stats endpoint)
    const apiUrl = import.meta.env.DEV
      ? '/nba-api/player-stats' // Vite proxy in dev
      : 'https://basketball-ev-server.onrender.com/api/player-stats'; // Production

    // Build query params
    const params = new URLSearchParams({
      game_id: gameId,
      player_id: playerId,
    });

    const response = await fetch(`${apiUrl}?${params}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.details || errorData.error || `NBA API returned ${response.status}`;

      // Provide more helpful error messages
      if (response.status === 404) {
        throw new Error(`Game stats not found. The game may not have finished yet, or the stats haven't been updated in the database. (Game ID: ${gameId}, Player ID: ${playerId})`);
      }

      throw new Error(errorMsg);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      console.warn('[Result Verification] No stats found for player:', playerId, 'in game:', gameId);
      throw new Error('Stats not available yet. Please try again after the game has finished and stats have been updated.');
    }

    const playerData = result.data;

    return {
      gameId: playerData.gameId,
      playerId: playerData.playerId,
      playerName: playerData.playerName,
      stats: playerData.stats,
      minutesPlayed: playerData.minutesPlayed,
      gameDate: playerData.gameDate,
    };
  } catch (error) {
    console.error('[Result Verification] Error fetching NBA result:', error);
    throw new Error(`Failed to fetch NBA player stats: ${error.message}`);
  }
}

/**
 * Verify a soccer prediction automatically
 * @param {Object} prediction - The soccer prediction object from Firebase
 * @returns {Promise<Object>} Verification result with outcome
 */
export async function verifySoccerPrediction(prediction) {
  try {
    // Fetch match result from API
    const matchResult = await fetchSoccerMatchResult(prediction.match.eventId);

    if (!matchResult) {
      throw new Error(`Match result not found. The match may not have finished yet or the stats are not available. (Event ID: ${prediction.match.eventId})`);
    }

    if (!matchResult.finished) {
      throw new Error(`Match is still in progress or hasn't started yet. Please wait until the match has finished. (${matchResult.homeTeam} vs ${matchResult.awayTeam})`);
    }

    // Determine which stat to check based on prediction market
    const market = prediction.prediction.market.toLowerCase();
    let actualValue = null;

    if (market.includes('corner')) {
      actualValue = matchResult.stats.corners.total;
    } else if (market.includes('yellow') || market.includes('card')) {
      actualValue = matchResult.stats.yellowCards.total;
    } else if (market.includes('shot on target') || market.includes('shots on target')) {
      actualValue = matchResult.stats.shotsOnTarget.total;
    } else if (market.includes('shot')) {
      actualValue = matchResult.stats.shots.total;
    } else {
      throw new Error(`Unsupported market type: ${market}`);
    }

    // Calculate outcome
    const line = prediction.prediction.line;
    const type = prediction.prediction.type; // 'over' or 'under'

    let outcome;
    if (type === 'over') {
      if (actualValue > line) outcome = 'won';
      else if (actualValue === line) outcome = 'push';
      else outcome = 'lost';
    } else { // under
      if (actualValue < line) outcome = 'won';
      else if (actualValue === line) outcome = 'push';
      else outcome = 'lost';
    }

    return {
      success: true,
      prediction: prediction,
      matchResult: matchResult,
      actualValue: actualValue,
      outcome: outcome,
      market: prediction.prediction.market,
      line: line,
      type: type,
    };

  } catch (error) {
    console.error('[Result Verification] Soccer verification failed:', error);
    return {
      success: false,
      prediction: prediction,
      error: error.message,
    };
  }
}

/**
 * Verify an NBA prediction automatically
 * @param {Object} prediction - The NBA prediction object from Firebase
 * @returns {Promise<Object>} Verification result with outcome
 */
export async function verifyNBAPrediction(prediction) {
  try {
    // Extract game ID and player ID from prediction
    const gameId = prediction.game?.id;
    const playerId = prediction.player?.playerId;

    if (!gameId || !playerId) {
      throw new Error('Missing game ID or player ID in prediction');
    }

    // Fetch player stats from API
    const playerResult = await fetchNBAPlayerResult(gameId, playerId);

    if (!playerResult) {
      throw new Error('Player stats not found for this game');
    }

    // Get the stat type (pts, reb, ast, pra, etc.)
    const statType = prediction.prediction.shortName.toLowerCase();
    const actualValue = playerResult.stats[statType];

    if (actualValue === null || actualValue === undefined) {
      throw new Error(`Stat type ${statType} not found in results`);
    }

    // Calculate outcome
    const line = prediction.prediction.line;
    const type = prediction.prediction.type; // 'over' or 'under'

    let outcome;
    if (type === 'over') {
      if (actualValue > line) outcome = 'won';
      else if (actualValue === line) outcome = 'push';
      else outcome = 'lost';
    } else { // under
      if (actualValue < line) outcome = 'won';
      else if (actualValue === line) outcome = 'push';
      else outcome = 'lost';
    }

    return {
      success: true,
      prediction: prediction,
      playerResult: playerResult,
      actualValue: actualValue,
      outcome: outcome,
      statType: prediction.prediction.statType,
      line: line,
      type: type,
    };

  } catch (error) {
    console.error('[Result Verification] NBA verification failed:', error);
    return {
      success: false,
      prediction: prediction,
      error: error.message,
    };
  }
}
