# Future Ideas & Development Roadmap

## 📊 Current Project State (As of 2025-11-12)

### Project Overview

**Bets Stats** is a React-based sports betting analytics platform that provides:

- Live countdown timers for upcoming matches
- Historical statistics analysis
- **Probability-based betting predictions (58-62% range)**
- Fair odds calculations using statistical methods
- Modern, beautiful UI with glassmorphism design

### Technology Stack

- **Frontend**: React 18.3.1 + Vite 5.4.8
- **Routing**: React Router DOM 6.27.0
- **API**: BetsAPI integration via custom Vite plugin
- **Deployment**: Vercel-ready with serverless functions
- **Styling**: Inline CSS with gradient themes (purple/blue/green)

---

## 🎯 Currently Implemented Features

### 1. Home Page (`src/pages/Home.jsx`)

**What it does:**

- Displays upcoming matches from Danish Superliga and Premier League
- Shows next 10 fixtures per league
- Live countdown timers for each match
- Responsive grid layout with modern card design

**Key Components:**

- `MatchCard` - Individual match display with countdown
- `Countdown` - Real-time timer component (updates every second)

### 2. Match Detail Page (`src/pages/Match.jsx`)

**What it does:**

- Comprehensive match analysis page
- Fetches last 10 matches for both teams
- Calculates averages, min/max for key statistics
- **NEW: Probability-based betting predictions**

**Statistics Analyzed:**

- Shots (total, on target, off target)
- Corners
- Yellow cards
- Red cards
- Offsides

**Data Flow:**

```
1. Fetch event details (fetchEventView)
2. Fetch match history (fetchEventHistory)
3. For each historic match:
   - Fetch stats_trend data
   - Fetch event view for offsides
4. Compute averages using weighted methods
5. Generate betting predictions
```

### 3. **Betting Predictions System** ⭐ NEW FEATURE

#### Algorithm Overview (`src/utils/probability.js`)

**Three-Pronged Approach:**

1. **Team Averages Combined**

   - Sums home team average + away team average
   - Example: Home team avg 5.2 corners + Away team avg 4.8 corners = 10.0 predicted

2. **Form-Weighted Analysis**

   - Recent matches weighted more heavily using exponential decay
   - Weight formula: `weight = decayFactor^index` (default decay = 0.9)
   - Most recent match: weight 1.0
   - 2nd most recent: weight 0.9
   - 3rd most recent: weight 0.81
   - Etc.

3. **Statistical Distribution Analysis**
   - Calculates standard deviation for variance
   - Uses normal distribution CDF (Cumulative Distribution Function)
   - Tests multiple betting lines (0.5 increments)
   - Finds lines where probability falls in 58-62% range

**Final Prediction:**

```javascript
finalPrediction = weightedAvg * 0.6 + simpleAvg * 0.4;
```

**Probability Calculation:**

```javascript
// For combined teams (sum of independent variables)
combinedStdDev = √(homeStdDev² + awayStdDev²)

// Probability that actual result > threshold
P(X > threshold) = 1 - CDF(z)
where z = (threshold - mean) / stdDev
```

**Fair Odds Calculation:**

```javascript
fairOdds = 1 / probability;

// Example:
// If probability = 60% (0.60)
// Fair odds = 1 / 0.60 = 1.67
```

#### Markets Analyzed

1. **🚩 Corners (Over/Under)**

   - Most reliable market (typically higher variance)
   - Good sample sizes

2. **🟨 Yellow Cards (Over/Under)**

   - Moderate reliability
   - More variance than corners

3. **⚽ Total Shots (Over/Under)**

   - High volume, good for analysis
   - Includes on-target + off-target

4. **🎯 Shots on Target (Over/Under)**
   - More consistent than total shots
   - Lower variance

#### Confidence Levels

- **High**: 8+ matches in sample, stdDev < 2
- **Medium**: 5+ matches in sample, stdDev < 3
- **Low**: Otherwise

#### Display Component (`src/components/BettingPredictions.jsx`)

Shows ranked predictions with:

- Market name and emoji
- Over/Under line (e.g., "Over 8.5")
- Probability percentage
- Fair decimal odds
- Team averages breakdown
- Predicted total
- Confidence badge
- Sample size

---

## 🔧 Technical Implementation Details

### API Integration

**Custom Vite Plugin** (`vite-plugin-api.js`)

```javascript
// Intercepts /api/bets requests during development
// Proxies to BetsAPI with token authentication
// Whitelisted endpoints:
- /v1/events/upcoming
- /v1/event/view
- /v1/event/history
- /v1/event/stats_trend
```

**Vercel Serverless Function** (`api/bets.js`)

```javascript
// Production API handler
// Same functionality as Vite plugin
// Deployed to Vercel Edge Network
```

### Data Processing

**Stats Calculation** (`src/utils/stats.js`)

- `computeAveragesForTeam()` - Main aggregation function
- Throttled parallel requests (4 concurrent for trends, 3 for views)
- Handles multiple data formats from BetsAPI
- Extracts offsides from event stats (not in stats_trend)

**Key Data Structures:**

```javascript
// Match details structure
{
  eventId: "12345",
  ok: true,
  side: "home", // which team we're analyzing
  opponent: "Team Name",
  dateISO: "2025-01-13T19:00:00Z",
  score: "2-1",
  corners: 8,
  shots_total: 14,
  shots_on_target: 6,
  shots_off_target: 8,
  yellowcards: 3,
  redcards: 0,
  offsides: 2
}

// Computed averages
{
  averages: { corners: 7.8, shots_total: 13.2, ... },
  mins: { corners: 4, shots_total: 8, ... },
  maxs: { corners: 12, shots_total: 19, ... },
  sample: 10,
  details: [array of match objects]
}
```

---

## 🚀 Future Development Roadmap

### **PRIORITY 1: Historical Results & Accuracy Tracking**

#### Phase 1A: Results Page

**Goal**: Show completed matches with prediction verification

**Prompt for Claude AI:**

```
Create a Results page at /results that shows finished matches from the last 7 days.

Requirements:
1. Fetch completed matches using BetsAPI (status = 3 or ended matches)
2. For each match, calculate what predictions would have been made
3. Compare predictions to actual final statistics
4. Display win/loss for each market prediction
5. Show accuracy metrics at the top

Technical approach:
- Create src/pages/Results.jsx
- Add new API endpoint for ended matches (might need BetsAPI /v3/events/ended)
- Reuse probability calculation functions
- Create ResultCard component showing:
  - Match details (teams, score, date)
  - Each prediction made
  - Actual result
  - Win/loss indicator (green checkmark or red X)
  - Example: "Over 8.5 corners (61% probability) ✅ Actual: 11 corners"

Styling:
- Use similar design language to current pages
- Green for wins, red for losses
- Show running accuracy percentage at top
- Filter by league, date range

Cache strategy:
- Store results in localStorage to avoid refetching
- Key: `results_${date}_${leagueId}`
- Expire after 24 hours
```

#### Phase 1B: Accuracy Dashboard

**Goal**: Comprehensive model performance tracking

**Prompt for Claude AI:**

```
Create an Accuracy Dashboard component that aggregates all historical prediction results.

Display these metrics:

1. Overall Accuracy by Probability Range
   - 58-59% predictions: X% hit rate (wins/total)
   - 59-60% predictions: Y% hit rate
   - 60-61% predictions: Z% hit rate
   - 61-62% predictions: W% hit rate

2. By Market Type
   - Corners: 62% accurate (47/76)
   - Shots: 58% accurate (32/55)
   - Yellow Cards: 56% accurate (28/50)
   - Shots on Target: 61% accurate (39/64)

3. By Confidence Level
   - High confidence: 67% win rate
   - Medium confidence: 59% win rate
   - Low confidence: 51% win rate

4. ROI Simulation
   - If betting $10 on every prediction: $X profit
   - Best performing market for ROI
   - Worst performing market

5. Rolling Windows
   - Last 20 predictions: X% accurate
   - Last 50 predictions: Y% accurate
   - All time: Z% accurate

6. Time-based Analysis
   - Accuracy by day of week
   - Accuracy by league
   - Accuracy trends over time (chart)

Implementation:
- Read from localStorage where results are cached
- Aggregate statistics
- Create visual charts (could use a lightweight chart library or CSS bars)
- Update in real-time as new results come in

Display as a new section on the Results page or as a dedicated /accuracy route.
```

---

### **PRIORITY 2: Match Reminders System**

**Prompt for Claude AI:**

```
Implement a browser notification system for upcoming high-value bets.

Features:
1. Request notification permission on first visit
2. Settings panel for user preferences:
   - Enable/disable notifications
   - Timing: 30 min, 1 hour, 3 hours, 6 hours before match
   - Minimum confidence: Only notify for High/Medium/Low
   - Specific markets: Choose which markets to track

3. Storage:
   - Save user preferences in localStorage
   - Store upcoming matches with predictions
   - Check every 5 minutes if any matches are approaching

4. Notification Content:
   Title: "🎯 High Value Bet Alert!"
   Body: "FC Copenhagen vs Brondby in 1 hour"
   Detail: "Over 9.5 corners (60.2% @ 1.66 odds)"

5. Implementation:
   - Use Notifications API
   - Create src/utils/notifications.js for logic
   - Add settings toggle to header or dedicated settings page
   - Use setInterval to check upcoming matches
   - Clear notifications for past matches

Advanced (optional):
- Service Worker for background notifications
- Group notifications if multiple bets qualify
- "Snooze" functionality
- Link notification click to match detail page

Test with:
- Browser notification permission prompts
- localStorage persistence
- Time-based triggers (mock upcoming times for testing)
```

---

### **PRIORITY 3: Enhanced Features**

#### 3A: More Leagues

**Prompt for Claude AI:**

```
Expand the home page to include more football leagues.

Add these leagues (BetsAPI league IDs):
- La Liga (Spain): ID 564
- Bundesliga (Germany): ID 175
- Serie A (Italy): ID 207
- Ligue 1 (France): ID 168
- Champions League: ID 3

Changes needed:
1. Update src/pages/Home.jsx
   - Make league list configurable
   - Create a league config array with { id, name, colorGradient, icon }
   - Map over leagues to render sections

2. Add filtering/tabs
   - "All Leagues" view
   - Individual league tabs
   - Country-based grouping

3. Performance:
   - Fetch all leagues in parallel
   - Add loading skeletons per league
   - Consider pagination if too many matches

4. User preferences:
   - Let users favorite specific leagues
   - Store in localStorage
   - Show favorites first

Design:
- Different gradient colors per league
- League logos/flags (optional)
- Collapsible sections
```

#### 3B: Daily Predictions Digest

**Prompt for Claude AI:**

```
Create a "Today's Value Bets" page that shows all predictions for today across all leagues.

Features:
1. Route: /today
2. Fetch all matches starting in next 24 hours
3. Calculate predictions for all matches
4. Show only those with 58-62% probability
5. Sort by:
   - Highest probability
   - Earliest match time
   - Confidence level
   - Specific market

6. Quick stats at top:
   - Total value bets today: X
   - Matches analyzed: Y
   - Best market: Corners (Z bets)

7. Filters:
   - By league
   - By market type
   - By confidence
   - By time (next 2 hours, 2-6 hours, 6+ hours)

8. Export functionality:
   - Copy all predictions to clipboard
   - Download as CSV
   - Share link

Display:
- Compact card view (not full match detail)
- Quick summary: "Over 8.5 corners (60%) @ 1.67"
- Click to see full match analysis
- Mark predictions as "tracked" or "bet placed"

This becomes your daily betting sheet.
```

#### 3C: Live Match Tracking

**Prompt for Claude AI:**

```
Add live match tracking to see predictions play out in real-time.

Requirements:
1. Detect which matches are currently live
2. Fetch live statistics (BetsAPI has live endpoints)
3. Update statistics every 30-60 seconds
4. Show prediction progress:
   - "Over 8.5 corners" prediction
   - Current corners: 7
   - Time remaining: 23 minutes
   - Status: "On track" / "Needs 2 more" / "Already won"

4. Live page at /live showing all in-play matches
5. Visual indicators:
   - Green pulse for predictions already won
   - Yellow for still possible
   - Red for lost
   - Gray for uncertain

6. Push notifications when prediction hits
   - "✅ Your Over 8.5 corners bet hit! (Final: 11)"

Technical:
- Poll BetsAPI live endpoints
- Use WebSocket if available
- Efficient state management
- Auto-refresh without page reload
- Battery-efficient polling (stop when tab inactive)

This creates excitement and validates predictions in real-time.
```

---

### **PRIORITY 4: Bet Tracking & Portfolio**

**Prompt for Claude AI:**

```
Create a personal bet tracking system to monitor your betting performance.

Features:

1. Log Bets
   - Manually add bets placed
   - Fields: Match, Market, Line, Your Odds, Stake, Bookmaker
   - Auto-populate from predictions (click "I bet this" button)
   - Import from CSV

2. Bet Status
   - Pending (not started)
   - Live (in progress)
   - Won (green)
   - Lost (red)
   - Void/Cancelled

3. Portfolio Dashboard
   - Total bets: X
   - Win rate: Y%
   - Total staked: $Z
   - Total returned: $A
   - Profit/Loss: $B
   - ROI: C%

4. Analytics
   - Best performing market
   - Best performing league
   - Optimal stake size
   - Bankroll growth chart
   - Win rate by confidence level
   - Longest winning streak
   - Longest losing streak

5. Bankroll Management
   - Set starting bankroll
   - Track current bankroll
   - Suggested stake sizes (Kelly Criterion)
   - Warn if over-betting

6. Data Export
   - Export all bets to CSV
   - Share performance report
   - Backup to file

Storage:
- localStorage for persistence
- JSON structure for bets
- Could upgrade to IndexedDB for larger datasets
- Optional: Cloud sync (Firebase, Supabase)

This makes the app a complete betting workflow tool.
```

---

### **PRIORITY 5: Advanced Analytics**

#### 5A: Head-to-Head Analysis

**Prompt for Claude AI:**

```
When viewing a match between Team A and Team B, show historical head-to-head data.

Add to Match detail page:
1. Last 5 H2H matches
2. H2H averages for corners, cards, shots
3. Trends: "Team A averages 2 more corners when playing Team B"
4. Home vs Away splits in H2H

BetsAPI has H2H endpoints - integrate them.
```

#### 5B: Form Analysis

**Prompt for Claude AI:**

```
Add a "Form" section showing team momentum.

Show:
- Last 5 results: W-W-D-L-W
- Scoring form: Last 5 goals scored/conceded
- Stat trends: "Corners increasing 15% over last 3 matches"
- Hot/Cold indicators
- Form comparison: Home team in better form

Visual: Use color-coded form guides (green W, gray D, red L)
```

#### 5C: Weather & External Factors

**Prompt for Claude AI:**

```
Integrate weather data (OpenWeather API) to adjust predictions.

Considerations:
- Rain: More corners (harder to score), fewer cards
- Wind: More offsides, shots off target
- Cold: More cards (harder tackles)
- Stadium type: Indoor/outdoor

Add weather icons to match cards.
Adjust probability calculations based on conditions.
```

---

## 📁 File Structure Reference

```
betsapi-dk-next10/
├── src/
│   ├── components/
│   │   ├── MatchCard.jsx          # Match card with countdown
│   │   ├── Countdown.jsx          # Real-time countdown timer
│   │   ├── StatRow.jsx            # Statistics comparison row
│   │   ├── LastMatchesBox.jsx     # Team recent matches
│   │   ├── BettingPredictions.jsx # ⭐ Probability predictions display
│   │   └── Skeleton.jsx           # Loading skeletons
│   │
│   ├── pages/
│   │   ├── Home.jsx               # Landing page with matches
│   │   └── Match.jsx              # Match detail with predictions
│   │
│   ├── utils/
│   │   ├── stats.js               # Statistics calculation
│   │   ├── probability.js         # ⭐ Probability & odds calculation
│   │   └── ui.js                  # UI helper functions
│   │
│   ├── api.js                     # API client for BetsAPI
│   ├── App.jsx                    # Root component with routing
│   └── main.jsx                   # Entry point
│
├── api/
│   └── bets.js                    # Vercel serverless function
│
├── vite-plugin-api.js             # Custom Vite dev plugin
├── vite.config.js                 # Vite configuration
├── package.json                   # Dependencies
└── .env.local                     # BETSAPI_TOKEN=your_token
```

---

## 🔑 Key Functions to Understand

### Probability Calculation

```javascript
// src/utils/probability.js

// Main function - finds best betting lines
calculateBettingPredictions(homeDetails, awayDetails, options)

// Returns predictions array with structure:
{
  market: "Corners",
  emoji: "🚩",
  line: 8.5,
  type: "over", // or "under"
  probability: 0.603,
  odds: 1.66,
  percentage: "60.3",
  homeAvg: "5.2",
  awayAvg: "4.8",
  prediction: "10.0",
  sampleSize: 20,
  confidence: "high"
}
```

### Statistics Computation

```javascript
// src/utils/stats.js

// Main aggregation function
computeAveragesForTeam(prevEvents, fetchTrend, fetchViewForOffsides, opts)

// Options:
{
  ourName: "FC Copenhagen",
  ourId: "12345"
}

// Returns:
{
  averages: { corners: 7.8, ... },
  mins: { corners: 4, ... },
  maxs: { corners: 12, ... },
  sample: 10,
  details: [array of match objects]
}
```

---

## 🎨 Design System

### Color Palette

- **Primary Purple**: `#667eea` to `#764ba2`
- **Success Green**: `#10b981` to `#059669`
- **Warning Orange**: `#f59e0b` to `#d97706`
- **Info Cyan**: `#06b6d4` to `#3b82f6`
- **Background**: `#0f172a` to `#1e293b`
- **Text**: `#e2e8f0` (light), `#94a3b8` (muted)

### Typography

- **Headings**: 900 weight, gradient text
- **Body**: 400-600 weight
- **Small**: 11-13px, uppercase with letter-spacing

### Components

- **Cards**: Glassmorphism with backdrop-filter blur
- **Gradients**: Linear 135deg
- **Borders**: 1px solid rgba(255,255,255,0.1)
- **Border Radius**: 12-20px
- **Shadows**: Layered box-shadows for depth
- **Hover**: translateY(-4px) with enhanced shadow

---

## 🐛 Known Issues & Considerations

1. **API Rate Limits**: BetsAPI has rate limits - be mindful of concurrent requests
2. **Data Freshness**: Stats may be 1-2 hours delayed
3. **Missing Data**: Not all matches have complete stats_trend data
4. **Timezone**: All times should be converted to user's local timezone
5. **Mobile**: Current design is desktop-first, needs mobile optimization
6. **Browser Support**: Notifications API not supported in all browsers

---

## 💡 Quick Start Commands

```bash
# Development
npm run dev        # Start Vite dev server on :5173

# Production Build
npm run build      # Build for Vercel deployment
vercel deploy      # Deploy to Vercel

# Environment
# Add to .env.local:
BETSAPI_TOKEN=your_token_here
```

---

## 📚 Resources

- **BetsAPI Docs**: https://betsapi.com/docs/
- **React Router**: https://reactrouter.com/
- **Vite Docs**: https://vitejs.dev/
- **Vercel Deployment**: https://vercel.com/docs

---

## 🎯 Next Session Start Prompt

**Copy this to Claude when you continue tomorrow:**

```
I'm continuing work on my football betting analytics React app.

Current state:
- Match listings with countdown timers
- Detailed match statistics
- Probability-based betting predictions (58-62% range)
- Fair odds calculation using statistical methods

See FUTURE_IDEAS.md for full context.

I want to implement: [choose from priorities above]

The project is at: C:\Users\chrni\Desktop\projects\ev-calculation\betsapi-dk-next10

Dev server: npm run dev (runs on :5173)
```

---

**Last Updated**: 2025-11-13
**Created By**: Claude AI
**Project**: Bets Stats - Football Analytics Platform
