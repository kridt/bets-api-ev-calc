# EV Betting System - Implementation Guide

## 🎯 Overview

This system successfully integrates the Odds API with your statistics API to find **Expected Value (EV) betting opportunities** across 10 Danish bookmakers.

### ✅ Test Results

```
✨ Found 35% EV on Over 2.5 Goals!
- Predicted Probability: 60%
- Best Bookmaker: Betinia DK, Campobet DK, Expekt DK, LeoVegas DK
- Odds: 2.25
- Expected Value: +35%
```

## 📁 Files Created

### Core Modules

1. **src/utils/oddsApi.js** - Odds API client
   - Fetch events and odds
   - Filter by bookmakers
   - Extract market data

2. **src/utils/teamMatcher.js** - Team name matching
   - Fuzzy matching with Levenshtein distance
   - League and date verification
   - Team alias resolution

3. **src/utils/evCalculator.js** - EV calculations
   - Calculate Expected Value
   - Find best bookmaker odds
   - Compare predictions with markets

4. **src/services/evBettingService.js** - Main integration service
   - Match predictions with odds
   - Find value bets
   - Generate reports

### Test Scripts

- **test-odds-api.js** - API exploration
- **test-odds-detailed.js** - Detailed odds testing
- **test-ev-system.js** - Complete system test

### Documentation

- **ODDS_API_ANALYSIS.md** - API structure and strategy
- **IMPLEMENTATION_GUIDE.md** - This file

## 🚀 Quick Start

### 1. Install Dependencies (if needed)

```bash
npm install
```

### 2. Test the System

```bash
node test-ev-system.js
```

### 3. Integrate with Your Predictions

```javascript
import { findEVOpportunities } from './src/services/evBettingService.js';

// Your predicted matches (from stats API)
const predictedMatches = [
  {
    home: 'Arsenal',
    away: 'Chelsea',
    time: 1732912800, // Unix timestamp
    predictions: [
      {
        market: 'Corners',
        selection: 'over',
        line: 9.5,
        probability: 0.60, // 60% chance
        confidence: 'high'
      },
      {
        market: 'Goals',
        selection: 'over',
        line: 2.5,
        probability: 0.58,
        confidence: 'medium'
      }
    ]
  }
];

// Find EV opportunities
const results = await findEVOpportunities(predictedMatches, {
  minEV: 3,           // Minimum 3% EV
  minProbability: 0.58, // 58% min
  maxProbability: 0.62, // 62% max
  minConfidence: 0.8    // 80% team match confidence
});

// Display results
console.log(`Found ${results.summary.totalValueBets} value bets`);
results.matches.forEach(match => {
  console.log(`\n${match.match.home} vs ${match.match.away}`);
  match.valueBets.forEach(bet => {
    console.log(`  ${bet.market} ${bet.selection} ${bet.line}`);
    console.log(`  ${bet.odds.bookmaker}: ${bet.odds.odds} (EV: ${bet.odds.ev}%)`);
  });
});
```

## 🎲 How It Works

### 1. Prediction Flow

```
Stats API → Predictions → Match with Odds API → Calculate EV → Filter Value Bets
```

### 2. Team Matching

The system uses **fuzzy matching** to match teams between APIs:

- Normalizes team names (removes "FC", "United", etc.)
- Calculates Levenshtein distance
- Verifies league and date
- Returns confidence score (0-1)

Example:
```
"Man United" matches "Manchester United" (confidence: 0.9)
"Arsenal FC" matches "Arsenal" (confidence: 1.0)
```

### 3. EV Calculation

```javascript
EV = (Probability × Decimal_Odds) - 1

Example:
Probability: 60% (0.60)
Bookmaker Odds: 2.25
EV = (0.60 × 2.25) - 1 = 0.35 = +35%
```

### 4. Market Mapping

Your predictions → Odds API markets:

| Your Market | API Market |
|------------|-----------|
| Corners | Corners Totals |
| Goals | Totals |
| Yellow Cards | Totals* |
| Shots on Target | Totals* |

*Some markets may not be available

## 📊 Available Markets

The Odds API provides:

### Match Markets
- ✅ ML (Match Result)
- ✅ Draw No Bet
- ✅ Spread (Asian Handicap)
- ✅ **Totals (Goals)**
- ✅ **Corners Totals**

### Player Props
- ✅ Anytime Goalscorer
- ✅ Player Shots On Target
- ✅ Player to Score or Assist

### Your Bookmakers

All 10 of your bookmakers are supported:

1. ✅ LeoVegas DK
2. ✅ Expekt DK
3. ✅ NordicBet
4. ✅ Campobet DK
5. ✅ Betano
6. ✅ Bet365
7. ✅ Unibet DK
8. ✅ Betinia DK
9. ✅ Betsson
10. ✅ Kambi

## 🎯 Usage Examples

### Example 1: Find All Value Bets

```javascript
import { findEVOpportunities } from './src/services/evBettingService.js';

const matches = await getYourPredictions(); // Your stats API

const results = await findEVOpportunities(matches, {
  minEV: 5,  // Only 5%+ EV
  minProbability: 0.58,
  maxProbability: 0.62
});

// Results include:
// - matches: Array of matches with value bets
// - stats: Overall statistics
// - summary: Count summaries
```

### Example 2: Single Match Analysis

```javascript
import { findEVForMatch } from './src/services/evBettingService.js';

const match = {
  home: 'Liverpool',
  away: 'Manchester United',
  predictions: [
    {
      market: 'Corners',
      selection: 'over',
      line: 10.5,
      probability: 0.61
    }
  ]
};

const result = await findEVForMatch(match, { minEV: 3 });

if (result) {
  console.log(`Found ${result.valueBets.length} value bets`);
}
```

### Example 3: Compare Single Prediction

```javascript
import { comparePredictionWithOdds } from './src/services/evBettingService.js';

const prediction = {
  market: 'Totals',
  selection: 'over',
  line: 2.5,
  probability: 0.60
};

const eventId = 62483902; // From odds API

const comparison = await comparePredictionWithOdds(prediction, eventId);

console.log(`Best: ${comparison.bestOpportunity.bookmaker}`);
console.log(`Odds: ${comparison.bestOpportunity.odds}`);
console.log(`EV: ${comparison.bestOpportunity.ev}%`);
```

## 🔧 Configuration

### API Key

Your API key is stored in `src/utils/oddsApi.js`:

```javascript
const API_KEY = '811e5fb0efa75d2b92e800cb55b60b30f62af8c21da06c4b2952eb516bee0a2e';
```

**Important:** In production, move this to environment variables:

```javascript
const API_KEY = process.env.ODDS_API_KEY || 'your-key';
```

### Bookmakers

To change bookmakers, edit `USER_BOOKMAKERS` in `src/utils/oddsApi.js`:

```javascript
export const USER_BOOKMAKERS = [
  "LeoVegas DK",
  "Bet365",
  // Add or remove bookmakers
];
```

## 📈 Real-World Integration

### Step 1: Get Your Predictions

Use your existing stats API (football API, NBA API, etc.):

```javascript
import { fetchTodaysEPLMatches } from './src/utils/footballApi.js';

const eplMatches = await fetchTodaysEPLMatches({
  minProb: 0.58,
  maxProb: 0.62
});
```

### Step 2: Convert to Standard Format

```javascript
const standardFormat = eplMatches.matches.map(match => ({
  home: match.home_team.name,
  away: match.away_team.name,
  time: new Date(match.kickoff).getTime() / 1000,
  league: 'English Premier League',
  predictions: match.predictions.map(pred => ({
    market: pred.statKey === 'corners' ? 'Corners' : 'Goals',
    selection: pred.side,
    line: pred.line,
    probability: pred.probability / 100 // Convert to 0-1
  }))
}));
```

### Step 3: Find Value Bets

```javascript
const valueBets = await findEVOpportunities(standardFormat);
```

### Step 4: Display Results

```javascript
valueBets.matches.forEach(match => {
  console.log(`\n🎯 ${match.match.home} vs ${match.match.away}`);
  console.log(`📅 ${new Date(match.match.date).toLocaleString()}`);
  console.log(`🏆 ${match.match.league.name}\n`);

  match.valueBets.forEach((bet, i) => {
    console.log(`${i + 1}. ${bet.market} ${bet.selection} ${bet.line}`);
    console.log(`   Probability: ${bet.probability.toFixed(1)}%`);
    console.log(`   Best Odds: ${bet.odds.bookmaker} @ ${bet.odds.odds}`);
    console.log(`   Expected Value: +${bet.odds.ev}%`);
    console.log(`   Grade: ${bet.odds.grade.toUpperCase()}`);
    console.log(`   URL: ${bet.odds.url}`);
    console.log('');
  });
});
```

## 🎨 Frontend Integration

Create a React component to display value bets:

```jsx
import { useState, useEffect } from 'react';
import { findEVOpportunities } from '../services/evBettingService';

export function ValueBetsDisplay() {
  const [valueBets, setValueBets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchValueBets() {
      const predictions = await getYourPredictions();
      const results = await findEVOpportunities(predictions);
      setValueBets(results.matches);
      setLoading(false);
    }
    fetchValueBets();
  }, []);

  if (loading) return <div>Loading value bets...</div>;

  return (
    <div>
      <h2>💰 Value Bets Found: {valueBets.length}</h2>
      {valueBets.map((match, i) => (
        <div key={i} className="match-card">
          <h3>{match.match.home} vs {match.match.away}</h3>
          {match.valueBets.map((bet, j) => (
            <div key={j} className="value-bet">
              <div className="market">
                {bet.market} {bet.selection} {bet.line}
              </div>
              <div className="probability">
                {bet.probability.toFixed(1)}% probability
              </div>
              <div className="best-odds">
                <strong>{bet.odds.bookmaker}</strong>: {bet.odds.odds}
              </div>
              <div className="ev">
                EV: <span className="positive">+{bet.odds.ev}%</span>
              </div>
              <a href={bet.odds.url} target="_blank" rel="noopener">
                Place Bet →
              </a>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

## 🔍 Troubleshooting

### No Matches Found

- Check that team names are similar enough
- Lower `minConfidence` parameter (default 0.8)
- Check date alignment (events should be on same day)

### No Value Bets Found

- Lower `minEV` parameter (try 0 or 1)
- Widen probability range (`minProbability: 0.55, maxProbability: 0.65`)
- Check that markets exist in odds API

### API Errors

- Verify API key is correct
- Check rate limits (cache results)
- Ensure event IDs are valid

## 📚 Best Practices

### 1. Caching

Cache odds data to avoid excessive API calls:

```javascript
const cache = new Map();

async function getCachedOdds(eventId) {
  const cached = cache.get(eventId);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data; // Return if less than 5 mins old
  }

  const data = await getEventOdds(eventId);
  cache.set(eventId, { data, timestamp: Date.now() });
  return data;
}
```

### 2. Error Handling

Always wrap API calls in try-catch:

```javascript
try {
  const results = await findEVOpportunities(matches);
} catch (error) {
  console.error('Failed to find value bets:', error);
  // Handle error gracefully
}
```

### 3. Rate Limiting

Implement rate limiting to respect API limits:

```javascript
import pLimit from 'p-limit';

const limit = pLimit(5); // Max 5 concurrent requests

const results = await Promise.all(
  events.map(event =>
    limit(() => getEventOdds(event.id))
  )
);
```

## 🎯 Next Steps

1. ✅ **Integrate with existing predictions** - Connect your stats API
2. ⏰ **Set up automation** - Run every hour to find new opportunities
3. 📱 **Add notifications** - Alert on high-EV bets (>10%)
4. 📊 **Track performance** - Log bets and calculate ROI
5. 🎨 **Build UI** - Create dashboard for value bets

## ⚠️ Important Notes

- **Responsible Gambling**: Only bet what you can afford to lose
- **Bankroll Management**: Use Kelly Criterion or fixed percentage
- **Track Results**: Keep detailed records of all bets
- **API Costs**: Monitor API usage and costs
- **Odds Changes**: Odds can change quickly, always verify before betting

## 🆘 Support

If you encounter issues:

1. Check test scripts work: `node test-ev-system.js`
2. Verify API key is valid
3. Check console for detailed error messages
4. Review ODDS_API_ANALYSIS.md for API details

## 📄 License

This implementation is provided as-is for educational and personal use.
