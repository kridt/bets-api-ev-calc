// server/services/telegramNotifier.js
// Sends comprehensive EV bet alerts to Telegram with full player stats
// Now with inline buttons for tracking/dismissing and persistent storage

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Import services
let balldontlieService;
let betStorage;

try {
  balldontlieService = require('./balldontlieService');
} catch (error) {
  console.warn('[Telegram] Balldontlie service not available:', error.message);
}

try {
  betStorage = require('./telegramBetStorage');
} catch (error) {
  console.warn('[Telegram] Bet storage not available:', error.message);
}

// Notification criteria
const config = {
  minEV: parseFloat(process.env.TELEGRAM_MIN_EV) || 8.0,
  maxOdds: parseFloat(process.env.TELEGRAM_MAX_ODDS) || 3.5,
  bookmakers: (process.env.TELEGRAM_BOOKMAKERS || 'bet365').split(',').map(s => s.trim().toLowerCase()),
  sports: (process.env.TELEGRAM_SPORTS || 'NBA').split(',').map(s => s.trim()),
  enabled: process.env.TELEGRAM_ENABLED !== 'false',
  cooldownMinutes: parseInt(process.env.TELEGRAM_COOLDOWN) || 10,
  includeStats: process.env.TELEGRAM_INCLUDE_STATS !== 'false',
};

// Map market names to balldontlie stat types
const MARKET_TO_STAT = {
  'player_points': 'points',
  'points': 'points',
  'Points': 'points',
  'player_assists': 'assists',
  'assists': 'assists',
  'Assists': 'assists',
  'player_rebounds': 'rebounds',
  'rebounds': 'rebounds',
  'Rebounds': 'rebounds',
  'player_made_threes': 'threes',
  '3-Pointers': 'threes',
  '3-pointers': 'threes',
  'player_steals': 'steals',
  'steals': 'steals',
  'Steals': 'steals',
  'player_blocks': 'blocks',
  'blocks': 'blocks',
  'Blocks': 'blocks',
  'player_turnovers': 'turnovers',
  'turnovers': 'turnovers',
  'player_points_+_assists': 'points_assists',
  'Pts+Asts': 'points_assists',
  'player_points_+_rebounds': 'points_rebounds',
  'Pts+Rebs': 'points_rebounds',
  'player_rebounds_+_assists': 'rebounds_assists',
  'Rebs+Asts': 'rebounds_assists',
  'player_points_+_rebounds_+_assists': 'pra',
  'Pts+Rebs+Asts': 'pra',
  'player_steals_+_blocks': 'steals_blocks',
  'Steals+Blocks': 'steals_blocks',
};

/**
 * Generate unique key for a bet
 */
const getBetKey = (bet) => {
  return `${bet.matchId}|${bet.player}|${bet.market}|${bet.line}|${bet.betType}`;
};

/**
 * Fetch player stats for the bet
 */
const fetchPlayerStats = async (playerName, market, line, betType) => {
  if (!balldontlieService || !config.includeStats) {
    return null;
  }

  const statType = MARKET_TO_STAT[market] || MARKET_TO_STAT[market?.toLowerCase()];
  if (!statType) {
    console.log(`[Telegram] Unknown stat type for market: ${market}`);
    return null;
  }

  try {
    const hitRateData = await balldontlieService.calculateHitRate(playerName, statType, line, 10);

    const last5 = hitRateData.values.slice(0, 5);
    const last5Avg = last5.length > 0 ? last5.reduce((a, b) => a + b, 0) / last5.length : 0;
    const last10Avg = parseFloat(hitRateData.statistics.average);

    const recent3 = hitRateData.values.slice(0, 3);
    const prev3 = hitRateData.values.slice(3, 6);
    const recent3Avg = recent3.length > 0 ? recent3.reduce((a, b) => a + b, 0) / recent3.length : 0;
    const prev3Avg = prev3.length > 0 ? prev3.reduce((a, b) => a + b, 0) / prev3.length : 0;
    const trend = recent3Avg - prev3Avg;

    return {
      statType,
      last5Avg: last5Avg.toFixed(1),
      last10Avg: last10Avg.toFixed(1),
      seasonAvg: hitRateData.statistics.average,
      min: hitRateData.statistics.min,
      max: hitRateData.statistics.max,
      stdDev: hitRateData.statistics.stdDev,
      hitRate: betType === 'OVER' ? hitRateData.hitRate.overPercentage : hitRateData.hitRate.underPercentage,
      overCount: hitRateData.results.over,
      underCount: hitRateData.results.under,
      gamesAnalyzed: hitRateData.gamesAnalyzed,
      trend: trend > 0 ? `📈 +${trend.toFixed(1)}` : trend < 0 ? `📉 ${trend.toFixed(1)}` : '➡️ Stable',
      trendValue: trend,
      recentGames: hitRateData.gameDetails.slice(0, 5),
      values: hitRateData.values,
    };
  } catch (error) {
    console.error(`[Telegram] Error fetching stats for ${playerName}:`, error.message);
    return null;
  }
};

/**
 * Format comprehensive bet message
 */
const formatBetMessage = async (bet, sport = 'NBA', includeButtons = true) => {
  const evEmoji = bet.evPercent >= 15 ? '🔥🔥' : bet.evPercent >= 10 ? '🔥' : '⚡';
  const sportEmoji = sport === 'NBA' ? '🏀' : '⚽';

  const gameTime = new Date(bet.matchDate);
  const now = new Date();
  const hoursUntil = Math.round((gameTime - now) / (1000 * 60 * 60));
  const timeUntil = hoursUntil > 24 ? `${Math.round(hoursUntil/24)}d` : `${hoursUntil}h`;

  const lines = [
    `${evEmoji} *${bet.evPercent.toFixed(1)}% EV* ${sportEmoji}`,
    ``,
    `👤 *${bet.player}*`,
    `📊 ${bet.marketDisplay || bet.market} *${bet.betType} ${bet.line}*`,
    ``,
    `💰 *Odds: ${bet.odds.toFixed(2)}* @ ${bet.bookmakerDisplay || bet.bookmaker}`,
    `📈 Fair Odds: ${bet.fairOdds.toFixed(2)} (${(bet.fairProb * 100).toFixed(1)}% prob)`,
    `📚 Based on ${bet.comparableBooks || 'N/A'} sharp books`,
  ];

  const stats = await fetchPlayerStats(bet.player, bet.market, bet.line, bet.betType);

  if (stats) {
    lines.push(``);
    lines.push(`━━━ *PLAYER STATS* ━━━`);
    lines.push(`📊 L5 Avg: *${stats.last5Avg}* | L10 Avg: *${stats.last10Avg}*`);
    lines.push(`📈 Season Avg: ${stats.seasonAvg}`);
    lines.push(`📉 Range: ${stats.min} - ${stats.max} (σ ${stats.stdDev})`);
    lines.push(``);
    lines.push(`🎯 *Hit Rate: ${stats.hitRate}* (${stats.overCount}/${stats.gamesAnalyzed} over)`);
    lines.push(`${stats.trend} vs prev 3 games`);

    if (stats.recentGames && stats.recentGames.length > 0) {
      lines.push(``);
      lines.push(`━━━ *LAST 5 GAMES* ━━━`);
      stats.recentGames.forEach((game) => {
        const hitEmoji = game.hit === 'OVER' ? '✅' : game.hit === 'UNDER' ? '❌' : '➖';
        const homeAway = game.home ? 'vs' : '@';
        const shortOpp = game.opponent.split(' ').pop();
        lines.push(`${hitEmoji} ${game.value} ${homeAway} ${shortOpp}`);
      });
    }

    const diff = parseFloat(stats.last10Avg) - bet.line;
    const edgeEmoji = (bet.betType === 'OVER' && diff > 0) || (bet.betType === 'UNDER' && diff < 0) ? '✅' : '⚠️';
    lines.push(``);
    lines.push(`${edgeEmoji} Avg vs Line: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}`);
  }

  lines.push(``);
  lines.push(`━━━ *MATCH INFO* ━━━`);
  lines.push(`🏟️ ${bet.matchName || `${bet.homeTeam} vs ${bet.awayTeam}`}`);
  lines.push(`⏰ ${gameTime.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen'
  })} (${timeUntil})`);

  if (bet.allBookmakers && bet.allBookmakers.length > 1) {
    lines.push(``);
    lines.push(`━━━ *OTHER BOOKS* ━━━`);
    bet.allBookmakers.slice(0, 4).forEach(b => {
      lines.push(`• ${b.bookmakerDisplay}: ${b.odds.toFixed(2)} (${b.evPercent.toFixed(1)}%)`);
    });
  }

  lines.push(``);
  lines.push(`🕐 Found: ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Copenhagen' })}`);

  return { text: lines.join('\n'), stats };
};

/**
 * Create inline keyboard for bet actions
 */
const createInlineKeyboard = (betKey) => {
  return {
    inline_keyboard: [
      [
        { text: '✅ Track Bet', callback_data: `track:${betKey}` },
        { text: '❌ Dismiss', callback_data: `dismiss:${betKey}` }
      ],
      [
        { text: '🏆 Won', callback_data: `won:${betKey}` },
        { text: '💔 Lost', callback_data: `lost:${betKey}` },
        { text: '➖ Push', callback_data: `push:${betKey}` }
      ]
    ]
  };
};

/**
 * Send message to Telegram with optional inline keyboard
 */
const sendTelegramMessage = async (text, keyboard = null) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] Bot token or chat ID not configured');
    return { success: false, messageId: null };
  }

  try {
    const body = {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };

    if (keyboard) {
      body.reply_markup = keyboard;
    }

    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('[Telegram] Failed to send message:', result.description);
      return { success: false, messageId: null, error: result.description };
    }

    return { success: true, messageId: result.result.message_id };
  } catch (error) {
    console.error('[Telegram] Error sending message:', error.message);
    return { success: false, messageId: null, error: error.message };
  }
};

/**
 * Edit existing message (for updating status)
 */
const editTelegramMessage = async (messageId, text, keyboard = null) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { success: false };
  }

  try {
    const body = {
      chat_id: TELEGRAM_CHAT_ID,
      message_id: messageId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };

    if (keyboard) {
      body.reply_markup = keyboard;
    }

    const response = await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    return { success: result.ok };
  } catch (error) {
    console.error('[Telegram] Error editing message:', error.message);
    return { success: false };
  }
};

/**
 * Answer callback query (acknowledge button press)
 */
const answerCallback = async (callbackQueryId, text = '') => {
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: false,
      }),
    });
  } catch (error) {
    console.error('[Telegram] Error answering callback:', error.message);
  }
};

/**
 * Check if bet meets notification criteria
 */
const meetsCriteria = (bet, sport) => {
  if (!config.enabled) return false;
  if (bet.evPercent < config.minEV) return false;
  if (bet.odds > config.maxOdds) return false;
  if (!config.sports.includes(sport)) return false;

  const betBookmaker = (bet.bookmaker || '').toLowerCase();
  if (!config.bookmakers.some(b => betBookmaker.includes(b))) {
    return false;
  }

  return true;
};

/**
 * Process EV bets and send notifications for qualifying ones
 */
const processEVBets = async (evBets, sport = 'NBA') => {
  if (!config.enabled || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { sent: 0, skipped: 0, filtered: 0 };
  }

  // Load cache from storage
  if (betStorage) {
    await betStorage.loadSentBetsCache();
  }

  let sent = 0;
  let skipped = 0;
  let filtered = 0;

  const sortedBets = [...evBets].sort((a, b) => b.evPercent - a.evPercent);

  for (const bet of sortedBets) {
    if (!meetsCriteria(bet, sport)) {
      filtered++;
      continue;
    }

    const betKey = getBetKey(bet);

    // Check if already sent or dismissed (from persistent storage)
    if (betStorage) {
      const wasSent = await betStorage.wasBetSent(betKey, config.cooldownMinutes);
      const wasDismissed = await betStorage.wasBetDismissed(betKey);

      if (wasSent || wasDismissed) {
        skipped++;
        continue;
      }
    }

    console.log(`[Telegram] Preparing alert: ${bet.player} ${bet.market} ${bet.betType} ${bet.line} (${bet.evPercent.toFixed(1)}% EV)`);

    const { text, stats } = await formatBetMessage(bet, sport);
    const keyboard = createInlineKeyboard(betKey);
    const { success, messageId } = await sendTelegramMessage(text, keyboard);

    if (success) {
      // Save to persistent storage
      if (betStorage && messageId) {
        await betStorage.saveSentBet(bet, messageId, TELEGRAM_CHAT_ID, stats, sport);
      }

      sent++;
      console.log(`[Telegram] ✅ Sent alert for ${bet.player} (msg: ${messageId})`);

      await new Promise(r => setTimeout(r, 2000));
    }

    if (sent >= 5) {
      console.log(`[Telegram] Rate limit: stopping at 5 alerts per cycle`);
      break;
    }
  }

  if (sent > 0 || filtered > 0) {
    console.log(`[Telegram] Processed: ${sent} sent, ${skipped} skipped, ${filtered} filtered (need ${config.minEV}%+ EV @ ${config.bookmakers.join('/')})`);
  }

  return { sent, skipped, filtered };
};

/**
 * Handle callback from button press
 */
const handleCallback = async (callbackQuery) => {
  const { id: callbackId, data, message } = callbackQuery;
  const [action, ...betKeyParts] = data.split(':');
  const betKey = betKeyParts.join(':');

  console.log(`[Telegram] Callback: ${action} for ${betKey}`);

  let responseText = '';
  let newStatus = '';

  switch (action) {
    case 'track':
      newStatus = 'tracked';
      responseText = '✅ Bet tracked! You\'ll see results later.';
      break;
    case 'dismiss':
      newStatus = 'dismissed';
      responseText = '❌ Bet dismissed. Won\'t show again.';
      break;
    case 'won':
      newStatus = 'won';
      responseText = '🏆 Marked as WON!';
      break;
    case 'lost':
      newStatus = 'lost';
      responseText = '💔 Marked as LOST.';
      break;
    case 'push':
      newStatus = 'push';
      responseText = '➖ Marked as PUSH.';
      break;
    default:
      responseText = 'Unknown action';
  }

  // Update storage
  if (betStorage && newStatus) {
    await betStorage.updateBetStatus(betKey, newStatus);
  }

  // Answer the callback
  await answerCallback(callbackId, responseText);

  // Update the message to show new status
  if (message && newStatus) {
    const statusEmoji = {
      tracked: '📌 TRACKED',
      dismissed: '🚫 DISMISSED',
      won: '🏆 WON',
      lost: '💔 LOST',
      push: '➖ PUSH'
    };

    // Add status to the message
    const updatedText = message.text + `\n\n━━━ *STATUS: ${statusEmoji[newStatus]}* ━━━`;

    // Remove buttons for final states, keep result buttons for tracked
    let newKeyboard = null;
    if (newStatus === 'tracked') {
      newKeyboard = {
        inline_keyboard: [
          [
            { text: '🏆 Won', callback_data: `won:${betKey}` },
            { text: '💔 Lost', callback_data: `lost:${betKey}` },
            { text: '➖ Push', callback_data: `push:${betKey}` }
          ]
        ]
      };
    }

    await editTelegramMessage(message.message_id, updatedText, newKeyboard);
  }

  return { success: true, action, betKey };
};

/**
 * Send a test message with current config
 */
const sendTestMessage = async () => {
  const stats = betStorage ? await betStorage.getBetStats() : null;

  const lines = [
    `🧪 *Test Message*`,
    ``,
    `Telegram notifications are working!`,
    ``,
    `📊 *Current Settings:*`,
    `• Min EV: ${config.minEV}%`,
    `• Max Odds: ${config.maxOdds}`,
    `• Bookmakers: ${config.bookmakers.join(', ')}`,
    `• Sports: ${config.sports.join(', ')}`,
    `• Cooldown: ${config.cooldownMinutes} min`,
    `• Include Stats: ${config.includeStats}`,
  ];

  if (stats) {
    lines.push(``);
    lines.push(`📈 *Bet Statistics:*`);
    lines.push(`• Total Sent: ${stats.total}`);
    lines.push(`• Tracked: ${stats.tracked}`);
    lines.push(`• Won/Lost: ${stats.won}/${stats.lost} (${stats.winRate})`);
    lines.push(`• Avg EV: ${stats.avgEV.toFixed(1)}%`);
  }

  lines.push(``);
  lines.push(`🔔 Alerts when: EV ≥ ${config.minEV}% @ ${config.bookmakers.join('/')}`);

  const { success } = await sendTelegramMessage(lines.join('\n'));
  return success;
};

/**
 * Get current configuration
 */
const getConfig = () => ({
  ...config,
  configured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
  chatId: TELEGRAM_CHAT_ID ? `${TELEGRAM_CHAT_ID.slice(0, 8)}...` : null,
});

/**
 * Update configuration at runtime
 */
const updateConfig = (newConfig) => {
  if (newConfig.minEV !== undefined) config.minEV = parseFloat(newConfig.minEV);
  if (newConfig.maxOdds !== undefined) config.maxOdds = parseFloat(newConfig.maxOdds);
  if (newConfig.bookmakers !== undefined) {
    config.bookmakers = Array.isArray(newConfig.bookmakers)
      ? newConfig.bookmakers.map(b => b.toLowerCase())
      : newConfig.bookmakers.split(',').map(b => b.trim().toLowerCase());
  }
  if (newConfig.sports !== undefined) {
    config.sports = Array.isArray(newConfig.sports) ? newConfig.sports : newConfig.sports.split(',').map(s => s.trim());
  }
  if (newConfig.enabled !== undefined) config.enabled = newConfig.enabled;
  if (newConfig.cooldownMinutes !== undefined) config.cooldownMinutes = parseInt(newConfig.cooldownMinutes);
  if (newConfig.includeStats !== undefined) config.includeStats = newConfig.includeStats;

  console.log('[Telegram] Config updated:', config);
  return config;
};

module.exports = {
  processEVBets,
  sendTelegramMessage,
  editTelegramMessage,
  sendTestMessage,
  getConfig,
  updateConfig,
  meetsCriteria,
  fetchPlayerStats,
  handleCallback,
  answerCallback,
  getBetKey,
};
