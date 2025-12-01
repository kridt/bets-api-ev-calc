# Bets Stats Tracking Server

Automated tracking server for EPL value bets with automated stats scanning, odds monitoring, and result verification.

## Features

- **Stats Scanner**: Runs every 3 hours
  - Fetches upcoming EPL matches
  - Calculates probabilities using Poisson distribution
  - Generates predictions for goals, corners, cards, shots on target
  - Stores all predictions in Firebase

- **Odds Scanner**: Runs every 120 seconds (2 minutes)
  - Fetches current bookmaker odds
  - Compares odds with predictions
  - Detects value bets (EV > 3%)
  - Stores odds snapshots and value bets

- **Result Verifier**: Runs every hour
  - Fetches finished match results
  - Verifies value bet outcomes (win/loss/push)
  - Calculates actual profit/loss
  - Updates tracking statistics

## Architecture

```
server/
├── config/
│   ├── firebase.js          # Firebase admin SDK configuration
│   └── serviceAccountKey.json  # Firebase credentials (you need to add this)
├── services/
│   ├── statsScanner.js      # Stats and probability scanning
│   ├── oddsScanner.js       # Odds fetching and value bet detection
│   └── resultVerifier.js    # Result verification and tracking
├── schedulers/
│   └── index.js             # Cron job schedulers
├── routes/
│   └── api.js               # REST API endpoints
├── index.js                 # Main server file
└── package.json
```

## Firebase Data Structure

### Collections

**matches**
- Match information (teams, date, league, status)
- Updated when stats scanner runs

**predictions**
- Statistical predictions for each market
- Generated every 3 hours
- Includes probabilities calculated from Poisson distribution

**odds_snapshots**
- Bookmaker odds at a specific time
- Created every 120 seconds
- Shows historical odds movement

**value_bets**
- Detected value betting opportunities
- Links predictions with best available odds
- Tracks status (active/expired/settled)

**results**
- Final match results and statistics
- Verified value bet outcomes
- Used for performance tracking

**tracking_stats**
- Daily aggregated statistics
- ROI, win rate, total bets, profits
- Used for performance analysis

## Setup Instructions

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Go to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Save the JSON file as `server/config/serviceAccountKey.json`
6. Update the `databaseURL` in `config/firebase.js` with your Firebase project URL

### 3. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
- `BALLDONTLIE_API_KEY`: Your balldontlie.io API key
- `ODDS_API_KEY`: Your odds API key

### 4. Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on http://localhost:4000

## API Endpoints

### GET /api/value-bets
Get current active value bets

**Query Parameters:**
- `minEV` - Minimum EV percentage (e.g., `5`)
- `maxOdds` - Maximum odds (e.g., `3.0`)
- `limit` - Number of results (default: 50)

**Example:**
```
GET /api/value-bets?minEV=5&maxOdds=3.0&limit=20
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "match": {
        "id": "123",
        "home": "Arsenal",
        "away": "Chelsea",
        "date": "2025-01-15T20:00:00Z"
      },
      "valueBets": [
        {
          "market": "goals",
          "selection": "under",
          "line": 2.5,
          "probability": 65.3,
          "odds": 2.10,
          "ev": 8.5,
          "bookmaker": "Bet365"
        }
      ],
      "bestEV": 8.5
    }
  ]
}
```

### GET /api/tracking-stats
Get performance statistics

**Query Parameters:**
- `startDate` - Start date (YYYY-MM-DD)
- `endDate` - End date (YYYY-MM-DD)
- `days` - Number of days to look back (default: 30)

**Example:**
```
GET /api/tracking-stats?days=7
```

**Response:**
```json
{
  "success": true,
  "overall": {
    "totalMatches": 45,
    "totalValueBets": 123,
    "totalSettled": 98,
    "wins": 62,
    "losses": 31,
    "pushes": 5,
    "roi": 12.5,
    "winRate": 63.3,
    "avgProfit": 0.15
  },
  "daily": [...]
}
```

### GET /api/matches/:matchId
Get detailed information about a match

**Response:**
```json
{
  "success": true,
  "data": {
    "match": {...},
    "predictions": [...],
    "valueBets": [...],
    "latestOdds": {...},
    "result": {...}
  }
}
```

### GET /api/results
Get settled bet results

**Query Parameters:**
- `limit` - Number of results (default: 50)
- `days` - Days to look back (default: 7)

### GET /api/scheduler/status
Get status of all schedulers

### GET /api/health
Health check endpoint

## Scanner Schedule

| Scanner | Frequency | Description |
|---------|-----------|-------------|
| Stats Scanner | Every 3 hours | Fetches matches and calculates probabilities |
| Odds Scanner | Every 2 minutes | Scans bookmaker odds and detects value bets |
| Result Verifier | Every hour | Verifies finished matches and calculates results |

## Monitoring

The server logs all scanner activity with timestamps. You can monitor:

1. **Console Output**: See real-time scanner activity
2. **API Endpoint**: `/api/scheduler/status` shows last run times
3. **Firebase Console**: View all stored data

## Track Record

All value bets are automatically tracked:
- Initial prediction and odds
- Odds changes over time (snapshots every 2 minutes)
- Final result (win/loss/push)
- Actual profit/loss
- ROI calculation

This gives you a complete track record to prove the system's performance.

## Troubleshooting

**Firebase Permission Denied**
- Ensure your service account key is correct
- Check Firestore security rules

**No Data Being Scanned**
- Verify API keys are correct in `.env`
- Check API rate limits
- Look for errors in console output

**Schedulers Not Running**
- Check server logs for errors
- Verify node-cron is installed
- Ensure server is running continuously

## Production Deployment

For production:

1. Use a process manager like PM2
```bash
npm install -g pm2
pm2 start index.js --name bets-tracker
pm2 save
```

2. Set up log rotation
3. Configure firewall for port 4000
4. Use environment variables for all secrets
5. Set up monitoring alerts

## License

MIT
