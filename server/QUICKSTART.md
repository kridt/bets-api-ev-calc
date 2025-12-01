# Quick Start Guide - EPL Tracking Server

Get your tracking system running in 5 minutes!

## Step 1: Install Dependencies

```bash
cd server
npm install
```

## Step 2: Configure Firebase

**You need to get your Firebase service account key:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Open your project (the same one you use for NBA)
3. Click ⚙️ → Project settings → Service accounts
4. Click "Generate new private key" → Download
5. Save the file as `server/config/serviceAccountKey.json`

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for detailed instructions.

## Step 3: Add API Keys

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```bash
# Required for EPL stats
BALLDONTLIE_API_KEY=your-key-here

# Required for odds
ODDS_API_KEY=your-key-here
```

**Where to get API keys:**
- BallDontLie: https://epl.balldontlie.io/
- Odds API: https://api.odds-api.io/ (or your preferred odds provider)

## Step 4: Start the Server

```bash
npm run dev
```

You should see:

```
🚀 BETS STATS TRACKING SERVER
Server running on http://localhost:4000
====================================================
📊 Scheduling stats scanner (every 3 hours)...
💰 Scheduling odds scanner (every 120 seconds)...
✔️  Scheduling result verifier (every hour)...
✅ All schedulers initialized successfully
```

## Step 5: Verify It's Working

Open your browser and visit:

**Health Check:**
```
http://localhost:4000/api/health
```

Should return:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-01-15T..."
}
```

**Scheduler Status:**
```
http://localhost:4000/api/scheduler/status
```

**Value Bets (after first scan):**
```
http://localhost:4000/api/value-bets
```

## What Happens Next?

The server automatically:

1. **Immediately**: Runs initial stats scan
   - Fetches upcoming EPL matches
   - Calculates probabilities
   - Stores predictions in Firebase

2. **After 30 seconds**: Runs initial odds scan
   - Fetches bookmaker odds
   - Detects value bets
   - Creates odds snapshots

3. **Every 3 hours**: Stats scanner runs
   - Updates match list
   - Recalculates probabilities

4. **Every 2 minutes**: Odds scanner runs
   - Updates odds snapshots
   - Finds new value bets

5. **Every hour**: Result verifier runs
   - Checks finished matches
   - Verifies bet outcomes
   - Updates ROI stats

## View Your Data

Go to Firebase Console → Firestore Database:

- `epl_matches` - Upcoming matches
- `epl_predictions` - Statistical predictions
- `epl_odds_snapshots` - Historical odds
- `epl_value_bets` - Value betting opportunities
- `epl_results` - Verified outcomes
- `epl_tracking_stats` - Daily performance

## API Endpoints

All endpoints return JSON:

- `GET /api/value-bets` - Current value bets
- `GET /api/tracking-stats` - Performance statistics
- `GET /api/results` - Historical results
- `GET /api/matches/:id` - Match details
- `GET /api/scheduler/status` - System status

## Console Output

The server logs all activity:

```
[2025-01-15T...] 🔍 STATS SCANNER TRIGGERED
✅ Stats scan completed successfully
   - Matches processed: 15
   - Predictions generated: 240

[2025-01-15T...] 💰 Odds scanner triggered
✅ Odds scan complete: 45 value bets found
```

## Troubleshooting

**"Firebase error: Permission denied"**
- Make sure you have the service account key file
- Check it's in the correct location: `server/config/serviceAccountKey.json`

**"No data being scanned"**
- Verify your API keys in `.env`
- Check the console for error messages
- Make sure the API URLs are correct

**"Collections not appearing in Firebase"**
- Collections are only created when data is first written
- Wait a few minutes for the initial scan to complete
- Refresh Firebase Console

## Next Steps

1. **Let it run** - The server builds your track record automatically
2. **Monitor the logs** - Watch value bets being detected
3. **Check Firebase** - See data accumulating
4. **Test the API** - Try the endpoints listed above
5. **Connect frontend** - Update your React app to use the API

## Production Deployment

For production, use PM2:

```bash
npm install -g pm2
pm2 start index.js --name epl-tracker
pm2 save
pm2 startup
```

This ensures the server runs 24/7 and restarts automatically.

## Need Help?

- Check [README.md](./README.md) for full documentation
- Check [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for Firebase details
- Look at the console logs for specific errors
- All scanners log their activity with timestamps
