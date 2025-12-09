// src/services/betTracker.js
// Universal bet tracking service with Supabase

import { supabase, getDeviceId, getUsername } from '../lib/supabase';

export const BetTracker = {
  // Track a new bet
  async trackBet(bet) {
    const deviceId = getDeviceId();
    const username = getUsername();

    const { data, error } = await supabase
      .from('tracked_bets')
      .insert({
        device_id: deviceId,
        username: username,
        sport: bet.sport,
        match_id: bet.matchId,
        match_name: bet.matchName,
        match_date: bet.matchDate,
        league: bet.league || null,
        player: bet.player,
        market: bet.market,
        line: bet.line,
        bet_type: bet.betType,
        bookmaker: bet.bookmaker,
        displayed_odds: bet.displayedOdds,
        actual_odds: bet.actualOdds,
        fair_odds: bet.fairOdds,
        fair_prob: bet.fairProb,
        displayed_ev: bet.displayedEv,
        actual_ev: bet.actualEv,
        stake: bet.stake || 0,
        units: bet.units || 1,
        result: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[BetTracker] Error tracking bet:', error);
      throw error;
    }

    console.log('[BetTracker] Bet tracked:', data);
    return data;
  },

  // Update bet result
  async updateResult(betId, result, payout = null) {
    const profit = payout !== null ? payout : (result === 'won' ? null : result === 'lost' ? null : 0);

    const { data, error } = await supabase
      .from('tracked_bets')
      .update({
        result,
        result_updated_at: new Date().toISOString(),
        payout,
        profit,
      })
      .eq('id', betId)
      .select()
      .single();

    if (error) {
      console.error('[BetTracker] Error updating result:', error);
      throw error;
    }

    return data;
  },

  // Calculate profit for a bet
  calculateProfit(bet, result) {
    if (result === 'won') {
      return (bet.actual_odds - 1) * bet.stake;
    } else if (result === 'lost') {
      return -bet.stake;
    } else if (result === 'push' || result === 'void') {
      return 0;
    }
    return null;
  },

  // Mark bet as won
  async markWon(betId, stake) {
    const { data: bet } = await supabase
      .from('tracked_bets')
      .select('actual_odds')
      .eq('id', betId)
      .single();

    const profit = (bet.actual_odds - 1) * stake;
    const payout = stake + profit;

    return this.updateResult(betId, 'won', payout);
  },

  // Mark bet as lost
  async markLost(betId, stake) {
    return this.updateResult(betId, 'lost', 0);
  },

  // Mark bet as void/push
  async markVoid(betId, stake) {
    return this.updateResult(betId, 'void', stake);
  },

  // Delete a bet
  async deleteBet(betId) {
    const { error } = await supabase
      .from('tracked_bets')
      .delete()
      .eq('id', betId);

    if (error) {
      console.error('[BetTracker] Error deleting bet:', error);
      throw error;
    }

    return true;
  },

  // Get all bets for current device
  async getMyBets(options = {}) {
    const deviceId = getDeviceId();
    let query = supabase
      .from('tracked_bets')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false });

    if (options.sport) {
      query = query.eq('sport', options.sport);
    }
    if (options.result) {
      query = query.eq('result', options.result);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Get all bets (public dashboard)
  async getAllBets(options = {}) {
    let query = supabase
      .from('tracked_bets')
      .select('*')
      .order('created_at', { ascending: false });

    if (options.sport) {
      query = query.eq('sport', options.sport);
    }
    if (options.result) {
      query = query.eq('result', options.result);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.days) {
      const since = new Date();
      since.setDate(since.getDate() - options.days);
      query = query.gte('created_at', since.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Get stats summary
  async getStats(options = {}) {
    const bets = await this.getAllBets(options);

    const totalBets = bets.length;
    const pending = bets.filter(b => b.result === 'pending').length;
    const won = bets.filter(b => b.result === 'won').length;
    const lost = bets.filter(b => b.result === 'lost').length;
    const voided = bets.filter(b => b.result === 'void' || b.result === 'push').length;
    const settled = won + lost;

    const winRate = settled > 0 ? (won / settled) * 100 : 0;

    // Calculate P&L
    const settledBets = bets.filter(b => b.result === 'won' || b.result === 'lost');
    let totalStaked = 0;
    let totalProfit = 0;

    settledBets.forEach(bet => {
      const stake = bet.stake || bet.units || 1;
      totalStaked += stake;
      if (bet.result === 'won') {
        totalProfit += (bet.actual_odds - 1) * stake;
      } else if (bet.result === 'lost') {
        totalProfit -= stake;
      }
    });

    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;

    // Average EV
    const avgEv = bets.length > 0
      ? bets.reduce((sum, b) => sum + (b.actual_ev || b.displayed_ev || 0), 0) / bets.length
      : 0;

    // By sport
    const nbaBets = bets.filter(b => b.sport === 'nba');
    const footballBets = bets.filter(b => b.sport === 'football');

    // By bookmaker
    const byBookmaker = {};
    bets.forEach(bet => {
      if (!byBookmaker[bet.bookmaker]) {
        byBookmaker[bet.bookmaker] = { total: 0, won: 0, lost: 0, profit: 0 };
      }
      byBookmaker[bet.bookmaker].total++;
      if (bet.result === 'won') {
        byBookmaker[bet.bookmaker].won++;
        byBookmaker[bet.bookmaker].profit += (bet.actual_odds - 1) * (bet.stake || 1);
      } else if (bet.result === 'lost') {
        byBookmaker[bet.bookmaker].lost++;
        byBookmaker[bet.bookmaker].profit -= (bet.stake || 1);
      }
    });

    // By market type
    const byMarket = {};
    bets.forEach(bet => {
      const market = bet.market || 'Unknown';
      if (!byMarket[market]) {
        byMarket[market] = { total: 0, won: 0, lost: 0, profit: 0, avgEv: 0, evSum: 0 };
      }
      byMarket[market].total++;
      byMarket[market].evSum += bet.actual_ev || bet.displayed_ev || 0;
      byMarket[market].avgEv = byMarket[market].evSum / byMarket[market].total;
      if (bet.result === 'won') {
        byMarket[market].won++;
        byMarket[market].profit += (bet.actual_odds - 1) * (bet.stake || 1);
      } else if (bet.result === 'lost') {
        byMarket[market].lost++;
        byMarket[market].profit -= (bet.stake || 1);
      }
    });

    // Daily P&L for chart
    const dailyPnL = {};
    settledBets.forEach(bet => {
      const date = new Date(bet.result_updated_at || bet.created_at).toISOString().split('T')[0];
      if (!dailyPnL[date]) {
        dailyPnL[date] = { date, profit: 0, bets: 0, won: 0, lost: 0 };
      }
      dailyPnL[date].bets++;
      const stake = bet.stake || bet.units || 1;
      if (bet.result === 'won') {
        dailyPnL[date].profit += (bet.actual_odds - 1) * stake;
        dailyPnL[date].won++;
      } else if (bet.result === 'lost') {
        dailyPnL[date].profit -= stake;
        dailyPnL[date].lost++;
      }
    });

    // Convert to array and sort
    const dailyPnLArray = Object.values(dailyPnL).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate cumulative profit
    let cumulative = 0;
    dailyPnLArray.forEach(day => {
      cumulative += day.profit;
      day.cumulative = cumulative;
    });

    return {
      totalBets,
      pending,
      won,
      lost,
      voided,
      settled,
      winRate,
      totalStaked,
      totalProfit,
      roi,
      avgEv,
      nbaBets: nbaBets.length,
      footballBets: footballBets.length,
      byBookmaker,
      byMarket,
      dailyPnL: dailyPnLArray,
      recentBets: bets.slice(0, 20),
    };
  },

  // Subscribe to real-time updates
  subscribeToUpdates(callback) {
    const subscription = supabase
      .channel('tracked_bets_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tracked_bets' },
        (payload) => {
          console.log('[BetTracker] Real-time update:', payload);
          callback(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  },
};

export default BetTracker;
