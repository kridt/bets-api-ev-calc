# Prediction Tracking System - User Guide

## 🎯 Overview

The prediction tracking system automatically saves all betting predictions to localStorage and provides tools to verify results using the BetsAPI. This allows you to track the accuracy of your model over time.

---

## 📊 Today's Value Bets Page

### Accessing the Page

Navigate to **http://localhost:5174/today** or click the **"📊 Today's Bets"** tab in the navigation.

### Features

1. **Automatic Match Analysis**
   - Fetches all matches happening in the next 24 hours
   - Analyzes each match using team statistics
   - Displays only predictions with 58-62% probability

2. **Quick Stats Dashboard**
   - Total value bets found today
   - Number of matches analyzed
   - High confidence bets count
   - Historical accuracy percentage

3. **Filtering & Sorting**
   - Filter by market type: All, Corners, Shots, Cards
   - Sort by: Earliest Match, Highest Probability, Highest Confidence

4. **Tracking Actions**
   - **"Track All"** button: Saves all predictions for a match to localStorage
   - **"View Full Analysis"**: Opens detailed match statistics page
   - **"Export JSON"**: Downloads all tracked predictions to a JSON file

---

## 💾 How Predictions Are Stored

### Data Structure

Each tracked prediction contains:

```json
{
  "id": "unique_prediction_id",
  "createdAt": "2025-11-14T03:00:00.000Z",
  "matchStartTime": "2025-11-14T15:00:00.000Z",

  "match": {
    "eventId": "12345",
    "homeTeam": "FC Copenhagen",
    "homeTeamId": "1234",
    "awayTeam": "Brondby IF",
    "awayTeamId": "5678",
    "league": "Danish Superliga",
    "leagueId": "49"
  },

  "prediction": {
    "market": "Corners",
    "marketKey": "corners",
    "emoji": "🚩",
    "line": 8.5,
    "type": "over",
    "probability": 0.603,
    "percentage": "60.3",
    "fairOdds": 1.66,
    "confidence": "high",
    "sampleSize": 20,
    "homeTeamAvg": "5.2",
    "awayTeamAvg": "4.8",
    "combinedPrediction": "10.0"
  },

  "result": {
    "status": "pending",
    "actualValue": null,
    "matchFinished": false,
    "verifiedAt": null,
    "finalScore": null
  }
}
```

### Storage Location

- **Browser**: `localStorage.predictions`
- **Export**: Click "Export JSON" to download a `.json` file

---

## ✅ Verifying Predictions (Checking Results)

### Method 1: Using the Browser Console

After matches finish (2+ hours after kickoff), open the browser console and run:

```javascript
// Import the verification utility
import { verifyAllPendingPredictions } from './src/utils/resultVerifier.js';

// Verify all predictions that need checking
const results = await verifyAllPendingPredictions();

console.log(results);
// Output:
// {
//   total: 15,
//   verified: 15,
//   won: 9,
//   lost: 6,
//   errors: 0,
//   details: [...]
// }
```

### Method 2: Programmatic Verification

You can add a verification button to the UI or run it automatically:

```javascript
import { verifyAllPendingPredictions } from '../utils/resultVerifier';

// In a React component
async function handleVerify() {
  setLoading(true);
  const results = await verifyAllPendingPredictions();
  alert(`Verified: ${results.won} won, ${results.lost} lost`);
  setLoading(false);
}
```

### Method 3: Manual API Check

For each prediction, you can manually check results using BetsAPI:

1. Get the `eventId` from the prediction
2. Fetch match results: `GET /v1/event/view?token=YOUR_TOKEN&event_id=EVENT_ID`
3. Check if `time_status` is `"3"` (finished)
4. Fetch stats: `GET /v1/event/stats_trend?token=YOUR_TOKEN&event_id=EVENT_ID`
5. Sum home + away values for the market (e.g., `corners`)
6. Compare actual value to prediction line

---

## 📈 Tracking Accuracy

### Getting Overall Stats

```javascript
import { getAccuracyStats } from './src/utils/predictionTracker.js';

const stats = getAccuracyStats();

console.log(stats);
// Output:
// {
//   total: 50,
//   won: 32,
//   lost: 18,
//   accuracy: "64.0",
//   byMarket: [
//     { market: "Corners", total: 20, won: 14, lost: 6, accuracy: "70.0" },
//     { market: "Yellow Cards", total: 15, won: 8, lost: 7, accuracy: "53.3" },
//     ...
//   ],
//   byConfidence: [
//     { confidence: "high", total: 15, won: 11, lost: 4, accuracy: "73.3" },
//     { confidence: "medium", total: 25, won: 15, lost: 10, accuracy: "60.0" },
//     ...
//   ]
// }
```

### Export Data for External Analysis

1. Go to **Today's Bets** page
2. Click **"Export JSON"**
3. Open the downloaded file in Excel, Python, or R

Example Python analysis:

```python
import json
import pandas as pd

# Load predictions
with open('predictions-2025-11-14.json', 'r') as f:
    predictions = json.load(f)

df = pd.DataFrame(predictions)

# Filter verified predictions
verified = df[df['result'].apply(lambda x: x['status'] in ['won', 'lost'])]

# Calculate accuracy
accuracy = (verified['result'].apply(lambda x: x['status'] == 'won').sum() / len(verified)) * 100
print(f"Overall Accuracy: {accuracy:.1f}%")

# Accuracy by market
market_accuracy = verified.groupby(
    verified['prediction'].apply(lambda x: x['market'])
).apply(lambda g: (g['result'].apply(lambda x: x['status'] == 'won').sum() / len(g)) * 100)
print(market_accuracy)
```

---

## 🛠 API Functions Reference

### Prediction Tracker (`src/utils/predictionTracker.js`)

| Function | Description |
|----------|-------------|
| `savePrediction(prediction, matchInfo)` | Saves a prediction to localStorage |
| `getAllPredictions()` | Returns all tracked predictions |
| `getTodaysPredictions()` | Returns predictions from last 24 hours |
| `getPendingPredictions()` | Returns unverified predictions |
| `getPredictionsNeedingVerification()` | Returns predictions for finished matches |
| `updatePredictionResult(id, result)` | Updates a prediction with actual results |
| `getAccuracyStats()` | Returns overall accuracy statistics |
| `exportPredictionsToJSON()` | Returns JSON string of all predictions |
| `downloadPredictionsJSON()` | Triggers JSON file download |
| `clearAllPredictions()` | Deletes all predictions (with confirmation) |

### Result Verifier (`src/utils/resultVerifier.js`)

| Function | Description |
|----------|-------------|
| `verifyPrediction(prediction)` | Verifies a single prediction using BetsAPI |
| `verifyAllPendingPredictions()` | Verifies all predictions needing verification |
| `autoVerifyOnLoad()` | Auto-verify finished matches on page load |

---

## 🔄 Workflow Example

### Day 1: Track Predictions

1. Go to **Today's Bets** page at 10:00 AM
2. See 15 matches with 45 value bets
3. Click **"Track All"** for each match you're interested in
4. Predictions are saved to localStorage with status: `"pending"`

### Day 2: Check Results

1. Open browser console
2. Run verification script:
   ```javascript
   import { verifyAllPendingPredictions } from './src/utils/resultVerifier.js';
   await verifyAllPendingPredictions();
   ```
3. Predictions are updated with:
   - `status`: "won" or "lost"
   - `actualValue`: Actual match statistic
   - `matchFinished`: true
   - `verifiedAt`: Timestamp

### Day 3: Analyze Performance

1. Go to **Today's Bets** page
2. Check "Historical Accuracy" stat in dashboard
3. Click **"Export JSON"** to download data
4. Analyze in Excel/Python/R

---

## 📱 Market Key Mapping

When verifying results, these market names map to BetsAPI stat keys:

| Market Name | API Key | Example |
|-------------|---------|---------|
| Corners | `corners` | Home: 5, Away: 6 → Total: 11 |
| Yellow Cards | `yellowcards` | Home: 2, Away: 3 → Total: 5 |
| Total Shots | `shots_total` | Home: 12, Away: 10 → Total: 22 |
| Shots on Target | `shots_on_target` | Home: 6, Away: 5 → Total: 11 |
| Red Cards | `redcards` | Home: 0, Away: 1 → Total: 1 |
| Offsides | `offsides` | Home: 3, Away: 2 → Total: 5 |

---

## ⚠️ Important Notes

### Rate Limiting

BetsAPI has rate limits. When verifying many predictions:
- The system processes in batches of 3
- Adds 1-second delay between batches
- Avoids overwhelming the API

### Match Timing

- Predictions are only verified for matches 2+ hours past kickoff
- This ensures the match has finished and stats are available
- `time_status === "3"` confirms match is finished

### Data Persistence

- Predictions are stored in browser localStorage
- Data persists across page refreshes
- Clearing browser data will delete predictions
- Always export JSON backups for long-term storage

### Privacy

- All data is stored locally in your browser
- No data is sent to external servers (except BetsAPI calls)
- Exporting JSON keeps you in control of your data

---

## 🚀 Future Enhancements

Potential improvements you can add:

1. **Auto-verification Dashboard**
   - Create a `/results` page that auto-verifies and displays results
   - Add charts showing accuracy trends over time

2. **ROI Tracking**
   - Add stake amount input
   - Calculate profit/loss for each prediction
   - Show bankroll growth chart

3. **Notification System**
   - Browser notifications when matches finish
   - Email/SMS integration for important results

4. **Cloud Backup**
   - Sync predictions to Firebase/Supabase
   - Access from multiple devices

5. **Machine Learning**
   - Export data to train ML models
   - Identify which markets/leagues are most profitable
   - Optimize probability thresholds

---

## 🐛 Troubleshooting

### "No predictions need verification"

- Wait at least 2 hours after match kickoff
- Check that predictions were tracked (click "Track All")
- Verify matches have finished (check BetsAPI)

### "Error fetching data"

- Check BetsAPI token in `.env.local`
- Verify internet connection
- Check browser console for detailed errors

### "Stats not found for teams"

- Some matches may not have complete stats data
- This is a BetsAPI limitation
- The prediction will remain "pending" until data is available

### Predictions not saving

- Check browser console for errors
- Verify localStorage is enabled (not in incognito mode)
- Check storage quota (should be fine unless you have 10,000+ predictions)

---

## 📞 Support

For issues or questions:
1. Check browser console for error messages
2. Review `FUTURE_IDEAS.md` for planned features
3. Check BetsAPI documentation: https://betsapi.com/docs/

---

**Happy tracking! 📊🎯**
