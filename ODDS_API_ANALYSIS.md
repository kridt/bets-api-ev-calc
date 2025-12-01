# Odds API Integration Analysis

## API Structure Overview

### Base URL
```
https://api.odds-api.io/v3
```

### Key Endpoints

1. **GET /sports** - List all available sports
2. **GET /bookmakers** - List all available bookmakers
3. **GET /events** - Get events/matches
4. **GET /odds** - Get odds for a specific event

### Authentication
- Uses `apiKey` query parameter
- Your API Key: `811e5fb0efa75d2b92e800cb55b60b30f62af8c21da06c4b2952eb516bee0a2e`

## Supported Bookmakers

All of your bookmakers are available:
- ✅ LeoVegas DK
- ✅ Expekt DK
- ✅ NordicBet
- ✅ Campobet DK
- ✅ Betano
- ✅ Bet365
- ✅ Unibet DK
- ✅ Betinia DK
- ✅ Betsson
- ✅ Kambi

## Available Markets

The API provides comprehensive odds for:

### Match Markets
- **ML** (Moneyline/Match Result) - Home/Draw/Away
- **Draw No Bet** - Home/Away (no draw option)
- **Spread** (Asian Handicap) - With handicap value
- **Totals** (Over/Under Goals) - With line value
- **Goals Over/Under** - Alternative totals market

### Half-Time Markets
- **Spread HT** - First half handicap
- **Totals HT** - First half totals

### Team-Specific Markets
- **Team Total Home** - Home team goals over/under
- **Team Total Away** - Away team goals over/under

### Corners Markets
- **Corners Spread** - Corners handicap
- **Corners Totals** - Total corners over/under
- **Corners Totals HT** - First half corners

### Player Props
- **Anytime Goalscorer** - Player to score
- **Player to Score or Assist**
- **Player Shots On Target** - Various lines (0.5, 1.5, 2.5+)

## Data Structure

### Event Object
```json
{
  "id": 62483902,
  "home": "Palermo FC",
  "away": "Carrarese Calcio",
  "date": "2025-11-29T18:30:00Z",
  "sport": {
    "name": "Football",
    "slug": "football"
  },
  "league": {
    "name": "Italy - Serie B",
    "slug": "italy-serie-b"
  },
  "status": "pending" // or "settled", "live"
}
```

### Odds Object
```json
{
  "id": 62483902,
  "home": "Palermo FC",
  "away": "Carrarese Calcio",
  "urls": {
    "Bet365": "https://www.bet365.com/#/AC/B1/C1/...",
    "Betano": "https://www.betano.com/quoten/..."
  },
  "bookmakers": {
    "Bet365": [
      {
        "name": "ML",
        "updatedAt": "2025-11-29T18:10:38.489Z",
        "odds": [{
          "home": "1.727",
          "draw": "3.400",
          "away": "5.250"
        }]
      },
      {
        "name": "Totals",
        "odds": [{
          "hdp": 2.5,
          "over": "1.875",
          "under": "1.925"
        }]
      },
      {
        "name": "Corners Totals",
        "odds": [{
          "hdp": 9.5,
          "over": "1.825",
          "under": "1.975"
        }]
      }
    ]
  }
}
```

## Integration Strategy

### Challenge: Team Name Matching
The API doesn't use team IDs, only names. We need to:
1. Fetch events from both APIs (stats API + odds API)
2. Match teams by name using fuzzy matching
3. Handle name variations (e.g., "Man United" vs "Manchester United")

### Proposed Solution

#### Option 1: Match by Name + Date + League
- Pros: Most reliable, accounts for team name variations
- Cons: Requires league matching too
- Implementation: Use date window (same day) + league slug + fuzzy name match

#### Option 2: Pre-built Team Name Mapping
- Pros: Fast, accurate once set up
- Cons: Requires manual maintenance
- Implementation: Create mapping file for common teams

#### Option 3: Hybrid Approach (RECOMMENDED)
1. Try exact name match first
2. Fall back to fuzzy matching (Levenshtein distance)
3. Verify with league and date proximity
4. Cache successful matches

### EV Calculation Flow

```
1. Fetch upcoming matches from stats API
   ↓
2. Calculate predicted probabilities (existing logic)
   ↓
3. For each match:
   a. Match event with odds API (by name/date/league)
   b. Fetch bookmaker odds
   c. Calculate EV for each market
   ↓
4. Filter markets with positive EV
   ↓
5. Display to user with:
   - Predicted probability
   - Best bookmaker odds
   - Expected value %
   - Direct link to bookmaker
```

### EV Calculation Formula

```javascript
// For each market and bookmaker
EV = (Probability × Decimal_Odds) - 1

// Example:
// Predicted: 60% chance of over 2.5 goals
// Bet365 offers: 1.875 odds
EV = (0.60 × 1.875) - 1 = 0.125 = 12.5% positive EV
```

## Implementation Plan

### Phase 1: Basic Integration
1. Create odds API client
2. Implement team name matching
3. Fetch odds for predicted matches
4. Display side-by-side comparison

### Phase 2: EV Calculation
1. Calculate EV for each predicted market
2. Find best bookmaker for each bet
3. Filter for positive EV only
4. Sort by EV percentage

### Phase 3: Enhanced Features
1. Track odds changes over time
2. Alert on high-value opportunities
3. Multi-market comparison
4. Historical EV performance

## Rate Limits & Best Practices

- Cache odds data (refresh every 5-10 minutes)
- Batch requests where possible
- Store successful team matches
- Use league filtering to reduce API calls

## Available Leagues for Filtering

Major leagues that match your stats API:
- `english-premier-league`
- `spain-la-liga`
- `germany-bundesliga`
- `italy-serie-a`
- `france-ligue-1`

Use league parameter to reduce event count:
```
/events?apiKey=xxx&sport=football&league=english-premier-league
```
