// src/services/autoTracker.js
// Automatic bet tracking service - saves qualifying bets to Supabase
// Criteria: odds < 4.0 AND EV > 4%
// Deduplication via unique bet_hash

import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Tracking criteria
const AUTO_TRACK_MAX_ODDS = 4.0;
const AUTO_TRACK_MIN_EV = 4.0;

// In-memory cache to avoid repeated DB checks for same bet
const checkedBetsCache = new Set();

/**
 * Generate a unique hash for a bet to prevent duplicates
 * Based on: match_id + player + market + line + bet_type + bookmaker
 */
const generateBetHash = (bet) => {
  const parts = [
    bet.matchId || bet.match_id || '',
    (bet.player || '').toLowerCase().trim(),
    (bet.market || '').toLowerCase().trim(),
    String(bet.line || 0),
    (bet.betType || bet.bet_type || '').toLowerCase().trim(),
    (bet.bookmaker || '').toLowerCase().trim(),
  ];
  return parts.join('|');
};

/**
 * Check if a bet meets auto-tracking criteria
 */
const meetsTrackingCriteria = (bet) => {
  const odds = parseFloat(bet.odds) || 0;
  const ev = parseFloat(bet.ev) || parseFloat(bet.evPercentage) || parseFloat(bet.ev_percentage) || 0;

  return odds > 1.0 && odds < AUTO_TRACK_MAX_ODDS && ev >= AUTO_TRACK_MIN_EV;
};

/**
 * Auto-track a single bet if it meets criteria
 * Returns: { tracked: boolean, reason: string }
 */
export const autoTrackBet = async (bet, matchInfo = {}, sport = 'nba') => {
  if (!isSupabaseConfigured) {
    return { tracked: false, reason: 'Supabase not configured' };
  }

  // Check criteria
  if (!meetsTrackingCriteria(bet)) {
    return { tracked: false, reason: 'Does not meet criteria' };
  }

  const betHash = generateBetHash({ ...bet, matchId: matchInfo.matchId });

  // Check in-memory cache first
  if (checkedBetsCache.has(betHash)) {
    return { tracked: false, reason: 'Already checked this session' };
  }

  // Mark as checked
  checkedBetsCache.add(betHash);

  try {
    // Try to insert - will fail silently if bet_hash already exists (unique constraint)
    const { data, error } = await supabase
      .from('auto_tracked_bets')
      .upsert({
        bet_hash: betHash,
        sport,
        match_id: matchInfo.matchId || matchInfo.match_id || bet.matchId || '',
        match_name: matchInfo.matchName || matchInfo.match_name || `${matchInfo.homeTeam || ''} vs ${matchInfo.awayTeam || ''}`,
        home_team: matchInfo.homeTeam || matchInfo.home_team || null,
        away_team: matchInfo.awayTeam || matchInfo.away_team || null,
        match_date: matchInfo.matchDate || matchInfo.match_date || null,
        league: matchInfo.league || sport.toUpperCase(),
        player: bet.player || '',
        market: bet.market || '',
        line: bet.line || null,
        bet_type: bet.betType || bet.bet_type || '',
        bookmaker: bet.bookmaker || '',
        odds: parseFloat(bet.odds) || 0,
        fair_odds: parseFloat(bet.fairOdds || bet.fair_odds) || null,
        fair_prob: parseFloat(bet.fairProb || bet.fair_prob) || null,
        ev_percentage: parseFloat(bet.ev || bet.evPercentage || bet.ev_percentage) || 0,
      }, {
        onConflict: 'bet_hash',
        ignoreDuplicates: true,  // Don't update if exists
      });

    if (error) {
      // Unique constraint violation is expected for duplicates
      if (error.code === '23505') {
        return { tracked: false, reason: 'Already tracked' };
      }
      console.error('[AutoTracker] Error:', error);
      return { tracked: false, reason: error.message };
    }

    console.log(`[AutoTracker] New bet tracked: ${bet.player} ${bet.market} ${bet.line} ${bet.betType} @ ${bet.bookmaker} (${bet.odds}, ${bet.ev}% EV)`);
    return { tracked: true, reason: 'Success' };

  } catch (err) {
    console.error('[AutoTracker] Exception:', err);
    return { tracked: false, reason: err.message };
  }
};

/**
 * Auto-track multiple bets from a list of EV opportunities
 * Filters and tracks only qualifying bets
 */
export const autoTrackBets = async (opportunities, matchInfo = {}, sport = 'nba') => {
  if (!isSupabaseConfigured || !opportunities || opportunities.length === 0) {
    return { tracked: 0, skipped: 0, total: opportunities?.length || 0 };
  }

  let tracked = 0;
  let skipped = 0;

  for (const opp of opportunities) {
    const result = await autoTrackBet(opp, matchInfo, sport);
    if (result.tracked) {
      tracked++;
    } else {
      skipped++;
    }
  }

  if (tracked > 0) {
    console.log(`[AutoTracker] Tracked ${tracked} new bets from ${opportunities.length} opportunities`);
  }

  return { tracked, skipped, total: opportunities.length };
};

/**
 * Get auto-tracking stats
 */
export const getAutoTrackingStats = async (sport = null) => {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    let query = supabase.from('auto_tracked_bets').select('*');

    if (sport) {
      query = query.eq('sport', sport);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AutoTracker] Error fetching stats:', error);
      return null;
    }

    const stats = {
      total: data.length,
      pending: data.filter(b => b.result === 'pending').length,
      won: data.filter(b => b.result === 'won').length,
      lost: data.filter(b => b.result === 'lost').length,
      void: data.filter(b => b.result === 'void' || b.result === 'push').length,
      avgEv: data.length > 0 ? (data.reduce((sum, b) => sum + parseFloat(b.ev_percentage || 0), 0) / data.length).toFixed(2) : 0,
      avgOdds: data.length > 0 ? (data.reduce((sum, b) => sum + parseFloat(b.odds || 0), 0) / data.length).toFixed(3) : 0,
    };

    const decided = stats.won + stats.lost;
    stats.winRate = decided > 0 ? ((stats.won / decided) * 100).toFixed(1) : null;

    // Group by bookmaker
    const byBookmaker = {};
    data.forEach(bet => {
      if (!byBookmaker[bet.bookmaker]) {
        byBookmaker[bet.bookmaker] = { total: 0, won: 0, lost: 0, pending: 0 };
      }
      byBookmaker[bet.bookmaker].total++;
      byBookmaker[bet.bookmaker][bet.result] = (byBookmaker[bet.bookmaker][bet.result] || 0) + 1;
    });
    stats.byBookmaker = byBookmaker;

    return stats;

  } catch (err) {
    console.error('[AutoTracker] Exception:', err);
    return null;
  }
};

/**
 * Get recent auto-tracked bets
 */
export const getRecentAutoBets = async (limit = 50, sport = null) => {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    let query = supabase
      .from('auto_tracked_bets')
      .select('*')
      .order('found_at', { ascending: false })
      .limit(limit);

    if (sport) {
      query = query.eq('sport', sport);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AutoTracker] Error fetching recent bets:', error);
      return [];
    }

    return data || [];

  } catch (err) {
    console.error('[AutoTracker] Exception:', err);
    return [];
  }
};

/**
 * Update bet result (for manual verification or automated result checking)
 */
export const updateBetResult = async (betId, result, actualStat = null) => {
  if (!isSupabaseConfigured) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('auto_tracked_bets')
      .update({
        result,
        actual_stat: actualStat,
        result_verified_at: new Date().toISOString(),
      })
      .eq('id', betId);

    if (error) {
      console.error('[AutoTracker] Error updating result:', error);
      return false;
    }

    return true;

  } catch (err) {
    console.error('[AutoTracker] Exception:', err);
    return false;
  }
};

/**
 * Clear the in-memory cache (call when switching pages or refreshing)
 */
export const clearBetCache = () => {
  checkedBetsCache.clear();
};

// Export constants for reference
export const TRACKING_CRITERIA = {
  maxOdds: AUTO_TRACK_MAX_ODDS,
  minEv: AUTO_TRACK_MIN_EV,
};
