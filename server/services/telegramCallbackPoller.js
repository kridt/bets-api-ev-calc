// server/services/telegramCallbackPoller.js
// Polls Telegram for callback button presses and handles them

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

let betStorage;
let isPolling = false;
let lastUpdateId = 0;
let pollInterval = null;
const processedCallbacks = new Set(); // Track processed callbacks to avoid duplicates

/**
 * Initialize dependencies
 */
const init = () => {
  try {
    betStorage = require('./telegramBetStorage');
    console.log('[TelegramPoller] Initialized');
  } catch (error) {
    console.error('[TelegramPoller] Failed to load storage:', error.message);
  }
};

/**
 * Answer callback query (stops the loading animation)
 */
const answerCallback = async (callbackQueryId, text) => {
  try {
    const response = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: false,
      }),
    });
    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error('[TelegramPoller] Answer callback error:', error.message);
    return false;
  }
};

/**
 * Delete a message
 */
const deleteMessage = async (chatId, messageId) => {
  try {
    console.log(`[TelegramPoller] Deleting message ${messageId}...`);
    const response = await fetch(`${TELEGRAM_API}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
      }),
    });
    const result = await response.json();
    console.log(`[TelegramPoller] Delete: ${result.ok ? 'SUCCESS' : result.description}`);
    return result.ok;
  } catch (error) {
    console.error('[TelegramPoller] Delete error:', error.message);
    return false;
  }
};

/**
 * Edit message to remove buttons
 */
const editMessage = async (chatId, messageId, text) => {
  try {
    const response = await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] },
      }),
    });
    const result = await response.json();
    console.log(`[TelegramPoller] Edit: ${result.ok ? 'SUCCESS' : result.description}`);
    return result.ok;
  } catch (error) {
    console.error('[TelegramPoller] Edit error:', error.message);
    return false;
  }
};

/**
 * Update storage with timeout (non-blocking)
 */
const updateStorageAsync = (betKey, action) => {
  if (!betStorage) return;

  // Fire and forget with timeout
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Storage timeout')), 5000)
  );

  Promise.race([
    betStorage.updateBetStatus(betKey, action),
    timeoutPromise
  ])
    .then(() => console.log(`[TelegramPoller] Storage: ${action} saved`))
    .catch(err => console.error(`[TelegramPoller] Storage failed: ${err.message}`));
};

/**
 * Handle a callback query
 */
const handleCallback = async (callbackQuery) => {
  const { id: callbackId, data, message } = callbackQuery;

  // Validate
  if (!data || !message) {
    console.error('[TelegramPoller] Invalid callback - missing data or message');
    return;
  }

  // Check if already processed (dedupe)
  if (processedCallbacks.has(callbackId)) {
    return; // Skip duplicate
  }
  processedCallbacks.add(callbackId);

  // Clean old entries (keep last 100)
  if (processedCallbacks.size > 100) {
    const arr = Array.from(processedCallbacks);
    arr.slice(0, 50).forEach(id => processedCallbacks.delete(id));
  }

  // Parse callback data: "action:betKey"
  const colonIndex = data.indexOf(':');
  if (colonIndex === -1) {
    console.error('[TelegramPoller] Invalid callback format:', data);
    return;
  }

  const action = data.substring(0, colonIndex);
  const betKey = data.substring(colonIndex + 1);
  const chatId = message.chat.id;
  const messageId = message.message_id;

  console.log(`[TelegramPoller] >>> ${action.toUpperCase()} | Msg ${messageId}`);

  // Response texts
  const responses = {
    track: '✅ Bet tracked!',
    dismiss: '❌ Dismissed',
    won: '🏆 Marked as WON!',
    lost: '💔 Marked as LOST',
    push: '➖ Marked as PUSH'
  };

  try {
    // 1. Answer callback immediately (stops loading)
    await answerCallback(callbackId, responses[action] || 'Done');

    // 2. Update storage in background (don't wait)
    updateStorageAsync(betKey, action);

    // 3. Handle message based on action
    if (action === 'track' || action === 'dismiss') {
      // DELETE the message
      const deleted = await deleteMessage(chatId, messageId);

      if (!deleted) {
        // Fallback: edit to minimal text
        const text = action === 'track' ? '✅ Tracked' : '❌ Dismissed';
        await editMessage(chatId, messageId, text);
      }
    } else {
      // Won/Lost/Push - append result to message
      const statusEmoji = { won: '🏆 WON', lost: '💔 LOST', push: '➖ PUSH' };
      const status = statusEmoji[action] || action.toUpperCase();
      const updatedText = message.text + `\n\n━━━ *RESULT: ${status}* ━━━`;
      await editMessage(chatId, messageId, updatedText);
    }

    console.log(`[TelegramPoller] <<< ${action.toUpperCase()} complete`);

  } catch (error) {
    console.error(`[TelegramPoller] Error handling ${action}:`, error.message);
  }
};

/**
 * Fetch updates from Telegram
 */
const getUpdates = async () => {
  if (!TELEGRAM_BOT_TOKEN) return [];

  try {
    const url = `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=10&allowed_updates=["callback_query"]`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const result = await response.json();

    if (!result.ok) {
      if (!result.description?.includes('Conflict')) {
        console.error('[TelegramPoller] getUpdates error:', result.description);
      }
      return [];
    }

    return result.result || [];
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('[TelegramPoller] Fetch error:', error.message);
    }
    return [];
  }
};

/**
 * Process updates
 */
const pollOnce = async () => {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const updates = await getUpdates();

    for (const update of updates) {
      // Update lastUpdateId FIRST before processing
      lastUpdateId = Math.max(lastUpdateId, update.update_id);

      if (update.callback_query) {
        // Process but don't await - allow parallel processing
        handleCallback(update.callback_query).catch(err => {
          console.error('[TelegramPoller] Callback error:', err.message);
        });
      }
    }
  } catch (error) {
    console.error('[TelegramPoller] Poll error:', error.message);
  }
};

/**
 * Start polling
 */
const startPolling = (intervalMs = 3000) => {
  if (isPolling) {
    console.log('[TelegramPoller] Already polling');
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[TelegramPoller] No bot token, skipping');
    return;
  }

  init();
  isPolling = true;
  console.log(`[TelegramPoller] Starting (every ${intervalMs}ms)`);

  pollOnce();
  pollInterval = setInterval(pollOnce, intervalMs);
};

/**
 * Stop polling
 */
const stopPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  isPolling = false;
  console.log('[TelegramPoller] Stopped');
};

/**
 * Get status
 */
const getStatus = () => ({
  isPolling,
  lastUpdateId,
  botConfigured: !!TELEGRAM_BOT_TOKEN
});

module.exports = {
  init,
  startPolling,
  stopPolling,
  pollOnce,
  getStatus,
};
