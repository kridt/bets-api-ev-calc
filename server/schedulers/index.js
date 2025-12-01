// server/schedulers/index.js
const cron = require('node-cron');
const { scanStats } = require('../services/statsScanner');
const { runEvBetFinder } = require('../services/evBetFinder');
const { verifyResults } = require('../services/resultVerifier');

/**
 * Scheduler for automated scanning and verification
 */

// Track last run times
const lastRuns = {
  stats: null,
  odds: null,
  results: null
};

/**
 * Stats Scanner - Runs every 3 hours
 * Schedule: At minute 0 past every 3rd hour (0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00)
 */
const scheduleStatsScanner = () => {
  console.log('📊 Scheduling stats scanner (every 3 hours)...');

  // Run every 3 hours
  cron.schedule('0 */3 * * *', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 STATS SCANNER TRIGGERED');
    console.log('='.repeat(60));

    lastRuns.stats = new Date();

    try {
      const result = await scanStats();
      if (result.success) {
        console.log(`✅ Stats scan completed successfully`);
        console.log(`   - Matches processed: ${result.matches}`);
        console.log(`   - Predictions generated: ${result.predictions}`);
      } else {
        console.error(`❌ Stats scan failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Stats scanner error:`, error);
    }

    console.log('='.repeat(60) + '\n');
  });

  // Also run immediately on startup
  console.log('Running initial stats scan...');
  scanStats().then(result => {
    if (result.success) {
      console.log(`✅ Initial stats scan complete: ${result.predictions} predictions generated`);
    }
  });
};

/**
 * EV Bet Finder - Runs every 2 minutes
 * Finds value bets by comparing predictions with live odds
 * Saves results to Firebase for quick frontend access
 */
const scheduleEvBetFinder = () => {
  console.log('💰 Scheduling EV bet finder (every 2 minutes)...');

  // Run every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    console.log(`\n[${new Date().toISOString()}] 💰 EV Bet Finder triggered`);

    lastRuns.odds = new Date();

    try {
      const result = await runEvBetFinder();
      if (result.success) {
        console.log(`✅ EV scan complete in ${result.duration}s`);
        console.log(`   - Value bets found: ${result.stats?.valueBetsFound || 0}`);
        console.log(`   - Saved: ${result.saveResult?.saved || 0}, Updated: ${result.saveResult?.updated || 0}`);
      } else {
        console.error(`❌ EV scan failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ EV bet finder error:`, error);
    }
  });

  // Run immediately on startup (after 45 seconds to let stats scanner finish)
  console.log('Running initial EV scan in 45 seconds...');
  setTimeout(() => {
    runEvBetFinder().then(result => {
      if (result.success) {
        console.log(`✅ Initial EV scan complete: ${result.stats?.valueBetsFound || 0} value bets found`);
      }
    });
  }, 45000);
};

/**
 * Result Verifier - Runs every hour
 * Schedule: At minute 0 past every hour
 */
const scheduleResultVerifier = () => {
  console.log('✔️  Scheduling result verifier (every hour)...');

  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('✔️  RESULT VERIFIER TRIGGERED');
    console.log('='.repeat(60));

    lastRuns.results = new Date();

    try {
      const result = await verifyResults();
      if (result.success) {
        console.log(`✅ Result verification completed`);
        console.log(`   - Matches verified: ${result.matches}`);
      } else {
        console.error(`❌ Result verification failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Result verifier error:`, error);
    }

    console.log('='.repeat(60) + '\n');
  });

  // Run immediately on startup (after 60 seconds)
  console.log('Running initial result verification in 60 seconds...');
  setTimeout(() => {
    verifyResults().then(result => {
      if (result.success) {
        console.log(`✅ Initial result verification complete: ${result.matches} matches verified`);
      }
    });
  }, 60000);
};

/**
 * Initialize all schedulers
 */
const initializeSchedulers = () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 INITIALIZING TRACKING SYSTEM SCHEDULERS');
  console.log('='.repeat(60));

  scheduleStatsScanner();
  scheduleEvBetFinder();
  scheduleResultVerifier();

  console.log('\n✅ All schedulers initialized successfully');
  console.log('='.repeat(60) + '\n');

  // Log scheduler status every 30 minutes
  setInterval(() => {
    console.log('\n📊 SCHEDULER STATUS:');
    console.log(`   Stats Scanner: Last run at ${lastRuns.stats || 'Never'}`);
    console.log(`   Odds Scanner: Last run at ${lastRuns.odds || 'Never'}`);
    console.log(`   Result Verifier: Last run at ${lastRuns.results || 'Never'}\n`);
  }, 30 * 60 * 1000);
};

/**
 * Get scheduler status
 */
const getStatus = () => {
  return {
    statsScanner: {
      lastRun: lastRuns.stats,
      nextRun: 'Every 3 hours at :00',
      status: 'active'
    },
    oddsScanner: {
      lastRun: lastRuns.odds,
      nextRun: 'Every 2 minutes',
      status: 'active'
    },
    resultVerifier: {
      lastRun: lastRuns.results,
      nextRun: 'Every hour at :00',
      status: 'active'
    }
  };
};

module.exports = {
  initializeSchedulers,
  getStatus
};
