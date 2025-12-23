// server/services/telegramBetStorage.js
// Persistent storage for Telegram bets using Firebase/Firestore

const { db } = require('../config/firebase');

// Collection name for telegram bets
const COLLECTION = 'telegram_bets';

// In-memory cache for fast lookups
const sentBetsCache = new Map();
let cacheLoaded = false;

/**
 * Load sent bets from Firestore into cache
 */
const loadSentBetsCache = async () => {
  if (cacheLoaded) return;

  try {
    // Load bets from last 24 hours that aren't dismissed
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const snapshot = await db.collection(COLLECTION)
      .where('sentAt', '>=', cutoff)
      .where('status', '!=', 'dismissed')
      .get();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      sentBetsCache.set(data.betKey, {
        status: data.status,
        sentAt: data.sentAt?.toDate?.()?.getTime() || data.sentAt
      });
    });

    cacheLoaded = true;
    console.log(`[TelegramStorage] Loaded ${snapshot.size} bets into cache from Firebase`);
  } catch (err) {
    console.error('[TelegramStorage] Cache load error:', err.message);
    cacheLoaded = true; // Mark as loaded to prevent retry loops
  }
};

/**
 * Check if bet was already sent (and not dismissed)
 */
const wasBetSent = async (betKey, cooldownMinutes = 10) => {
  await loadSentBetsCache();

  const cached = sentBetsCache.get(betKey);
  if (!cached) return false;

  // Check if within cooldown period
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const timeSinceSent = Date.now() - cached.sentAt;

  // If tracked, always skip (user is monitoring it)
  if (cached.status === 'tracked') return true;

  // If just sent, check cooldown
  if (cached.status === 'sent' && timeSinceSent < cooldownMs) return true;

  return false;
};

/**
 * Check if bet was dismissed
 */
const wasBetDismissed = async (betKey) => {
  try {
    const snapshot = await db.collection(COLLECTION)
      .where('betKey', '==', betKey)
      .where('status', '==', 'dismissed')
      .limit(1)
      .get();

    return !snapshot.empty;
  } catch (err) {
    return false;
  }
};

/**
 * Save sent bet to Firestore
 */
const saveSentBet = async (bet, messageId, chatId, stats = null, sport = 'NBA') => {
  const betKey = `${bet.matchId}|${bet.player}|${bet.market}|${bet.line}|${bet.betType}`;
  const now = new Date();

  // Update cache immediately
  sentBetsCache.set(betKey, {
    status: 'sent',
    sentAt: now.getTime()
  });

  try {
    const record = {
      betKey,
      messageId,
      chatId,
      matchId: bet.matchId,
      matchName: bet.matchName || `${bet.homeTeam} vs ${bet.awayTeam}`,
      matchDate: bet.matchDate ? new Date(bet.matchDate) : null,
      player: bet.player,
      market: bet.market,
      marketDisplay: bet.marketDisplay || bet.market,
      line: bet.line,
      betType: bet.betType,
      bookmaker: bet.bookmaker,
      bookmakerDisplay: bet.bookmakerDisplay || bet.bookmaker,
      odds: bet.odds,
      fairOdds: bet.fairOdds,
      fairProb: bet.fairProb,
      evPercent: bet.evPercent,
      last5Avg: stats?.last5Avg ? parseFloat(stats.last5Avg) : null,
      last10Avg: stats?.last10Avg ? parseFloat(stats.last10Avg) : null,
      seasonAvg: stats?.seasonAvg ? parseFloat(stats.seasonAvg) : null,
      hitRate: stats?.hitRate || null,
      status: 'sent',
      sport,
      sentAt: now,
      createdAt: now,
      updatedAt: now
    };

    // Use betKey as document ID for easy updates
    const docId = betKey.replace(/[/|]/g, '_');
    await db.collection(COLLECTION).doc(docId).set(record, { merge: true });

    console.log(`[TelegramStorage] Saved bet to Firebase: ${bet.player}`);
    return { success: true, source: 'firebase' };
  } catch (err) {
    console.error('[TelegramStorage] Save error:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Update bet status (track/dismiss/result)
 */
const updateBetStatus = async (betKey, status, additionalData = {}) => {
  // Update cache
  const cached = sentBetsCache.get(betKey);
  if (cached) {
    cached.status = status;
    sentBetsCache.set(betKey, cached);
  }

  try {
    const docId = betKey.replace(/[/|]/g, '_');
    const updateData = {
      betKey,
      status,
      updatedAt: new Date(),
      ...additionalData
    };

    if (status === 'tracked') {
      updateData.trackedAt = new Date();
    } else if (['won', 'lost', 'push', 'void'].includes(status)) {
      updateData.resultAt = new Date();
    }

    // Use set with merge to create doc if it doesn't exist
    await db.collection(COLLECTION).doc(docId).set(updateData, { merge: true });

    console.log(`[TelegramStorage] Updated bet status to ${status}: ${betKey}`);
    return { success: true };
  } catch (err) {
    console.error('[TelegramStorage] Update error:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Get bet by message ID
 */
const getBetByMessageId = async (messageId) => {
  try {
    const snapshot = await db.collection(COLLECTION)
      .where('messageId', '==', messageId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  } catch (err) {
    return null;
  }
};

/**
 * Get bet by bet key
 */
const getBetByKey = async (betKey) => {
  try {
    const docId = betKey.replace(/[/|]/g, '_');
    const doc = await db.collection(COLLECTION).doc(docId).get();

    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    return null;
  }
};

/**
 * Get tracked bets
 */
const getTrackedBets = async () => {
  try {
    const snapshot = await db.collection(COLLECTION)
      .where('status', '==', 'tracked')
      .orderBy('trackedAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('[TelegramStorage] Error fetching tracked bets:', err.message);
    return [];
  }
};

/**
 * Get recent bets (last N days)
 */
const getRecentBets = async (days = 7) => {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshot = await db.collection(COLLECTION)
      .where('sentAt', '>=', cutoff)
      .orderBy('sentAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('[TelegramStorage] Error fetching recent bets:', err.message);
    return [];
  }
};

/**
 * Get bet statistics
 */
const getBetStats = async () => {
  try {
    const snapshot = await db.collection(COLLECTION).get();
    const bets = snapshot.docs.map(doc => doc.data());

    const stats = {
      total: bets.length,
      sent: bets.filter(b => b.status === 'sent').length,
      tracked: bets.filter(b => b.status === 'tracked').length,
      dismissed: bets.filter(b => b.status === 'dismissed').length,
      won: bets.filter(b => b.status === 'won').length,
      lost: bets.filter(b => b.status === 'lost').length,
      avgEV: bets.length > 0 ? bets.reduce((s, b) => s + (b.evPercent || 0), 0) / bets.length : 0,
      avgOdds: bets.length > 0 ? bets.reduce((s, b) => s + (b.odds || 0), 0) / bets.length : 0,
    };

    // Calculate win rate for tracked bets
    const settled = stats.won + stats.lost;
    stats.winRate = settled > 0 ? (stats.won / settled * 100).toFixed(1) + '%' : 'N/A';

    return stats;
  } catch (err) {
    console.error('[TelegramStorage] Stats error:', err.message);
    return null;
  }
};

/**
 * Clean old dismissed bets (keep last 30 days)
 */
const cleanOldBets = async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const snapshot = await db.collection(COLLECTION)
      .where('status', '==', 'dismissed')
      .where('sentAt', '<', cutoff)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`[TelegramStorage] Cleaned ${snapshot.size} old dismissed bets`);
  } catch (err) {
    console.error('[TelegramStorage] Cleanup error:', err.message);
  }
};

console.log('[TelegramStorage] Firebase storage initialized');

module.exports = {
  loadSentBetsCache,
  wasBetSent,
  wasBetDismissed,
  saveSentBet,
  updateBetStatus,
  getBetByMessageId,
  getBetByKey,
  getTrackedBets,
  getRecentBets,
  getBetStats,
  cleanOldBets,
};
