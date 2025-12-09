// src/pages/NBAEVScraping.jsx
// NBA EV Scraping - Fetches NBA matches and compares player props across bookmakers
// Now with real-time WebSocket updates!

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import ConnectionStatus from '../components/ConnectionStatus';
import { BetTracker } from '../services/betTracker';

const ODDS_API_KEY = '811e5fb0efa75d2b92e800cb55b60b30f62af8c21da06c4b2952eb516bee0a2e';
const ODDS_API_BASE = 'https://api2.odds-api.io/v3';

// Cache server URL - reduces API calls by serving cached odds
const CACHE_SERVER_URL = import.meta.env.VITE_CACHE_SERVER_URL || 'https://odds-notifyer-server.onrender.com';

// ALL bookmakers for fetching and average calculation (includes sharp books)
const ALL_BOOKMAKERS = [
  'Kambi', 'Bet365', 'DraftKings', 'Pinnacle', 'BetMGM', 'Caesars', 'PrizePicks', 'FanDuel',
  'BetOnline.ag', 'BetPARX', 'BetRivers', 'Bovada', 'Fanatics', 'Fliff',
  'Superbet', 'Underdog', 'Bally Bet'
];

// Bookmakers we can actually bet on (not DraftKings/Pinnacle/US books)
const PLAYABLE_BOOKMAKERS = ['Kambi', 'Bet365'];

// Stat types we want to compare (from label like "Player Name (StatType)")
// Based on actual API responses from Pinnacle, DraftKings, FanDuel, Kambi
const TARGET_STATS = {
  // Single stats
  'Points': 'points',
  'Assists': 'assists',
  'Rebounds': 'rebounds',
  '3 Point FG': '3pointers',          // API uses "3 Point FG" not "3-Pointers Made"
  'Steals': 'steals',
  'Blocks': 'blocks',
  // 2-stat combos (DraftKings has these)
  'Pts+Asts': 'pts_asts',
  'Pts+Rebs': 'pts_rebs',
  'Rebs+Asts': 'rebs_asts',           // API uses "Rebs+Asts" not "Asts+Rebs"
  'Steals+Blocks': 'steals_blocks',
  // 3-stat combo
  'Pts+Rebs+Asts': 'pts_rebs_asts',
  // Double/Triple doubles
  'Double+Double': 'double_double',
};

// Bet365 uses separate market names with "&" instead of "+"
// Based on actual API response: "Points & Assists O/U", "Points, Assists & Rebounds O/U"
const BET365_MARKETS = {
  // Single stats
  'Points O/U': 'points',
  'Assists O/U': 'assists',
  'Rebounds O/U': 'rebounds',
  'Threes Made O/U': '3pointers',
  'Steals O/U': 'steals',
  'Blocks O/U': 'blocks',
  'Field Goals Made O/U': 'field_goals',
  'Free Throws Made O/U': 'free_throws',
  // 2-stat combos (uses "&" not "+")
  'Points & Assists O/U': 'pts_asts',
  'Points & Rebounds O/U': 'pts_rebs',
  'Assists & Rebounds O/U': 'rebs_asts',
  'Steals & Blocks O/U': 'steals_blocks',
  // 3-stat combo (uses "," and "&")
  'Points, Assists & Rebounds O/U': 'pts_rebs_asts',
  // Double/Triple doubles
  'Double Double': 'double_double',
  'Triple Double': 'triple_double',
};

// Line tolerance for matching - use 0.25 to avoid mixing 2.0 and 2.5 lines
// (2.0 = "2 or more", 2.5 = "3 or more" - these are different bets!)
const LINE_TOLERANCE = 0.25;
// Minimum EV percentage to show (3%+ for higher confidence)
const MIN_EV_PERCENT = 3;
// Minimum bookmakers with complete odds (over+under) for de-vigging
const MIN_BOOKMAKERS = 2;

// ============ DE-VIG METHODS ============
const DEVIG_METHODS = {
  multiplicative: {
    id: 'multiplicative',
    name: 'Multiplicative',
    description: 'Proportionally removes vig from each side. Most common method.',
  },
  power: {
    id: 'power',
    name: 'Power',
    description: 'Finds exponent k where P_over^k + P_under^k = 1. More accurate for lopsided lines.',
  },
  additive: {
    id: 'additive',
    name: 'Additive',
    description: 'Subtracts equal vig from each side. Simple but less accurate.',
  },
  worstCase: {
    id: 'worstCase',
    name: 'Worst Case',
    description: 'Uses the worst (lowest) fair probability. Most conservative.',
  },
};

// ============ DE-VIGGING FUNCTIONS ============
// Convert decimal odds to implied probability
const oddsToImpliedProb = (odds) => 1 / odds;

// Method 1: Multiplicative (default) - proportionally removes vig
const devigMultiplicative = (overOdds, underOdds) => {
  const pOver = oddsToImpliedProb(overOdds);
  const pUnder = oddsToImpliedProb(underOdds);
  const pTotal = pOver + pUnder;

  return {
    fairProbOver: pOver / pTotal,
    fairProbUnder: pUnder / pTotal,
    vig: (pTotal - 1) * 100,
  };
};

// Method 2: Power Method - finds k where P_over^k + P_under^k = 1
// Uses binary search to find the exponent
const devigPower = (overOdds, underOdds) => {
  const pOver = oddsToImpliedProb(overOdds);
  const pUnder = oddsToImpliedProb(underOdds);
  const pTotal = pOver + pUnder;

  // Binary search for k where pOver^k + pUnder^k = 1
  let low = 0.5;
  let high = 2.0;
  let k = 1;

  for (let i = 0; i < 50; i++) { // 50 iterations for precision
    k = (low + high) / 2;
    const sum = Math.pow(pOver, k) + Math.pow(pUnder, k);

    if (Math.abs(sum - 1) < 0.0001) break;

    if (sum > 1) {
      low = k;
    } else {
      high = k;
    }
  }

  return {
    fairProbOver: Math.pow(pOver, k),
    fairProbUnder: Math.pow(pUnder, k),
    vig: (pTotal - 1) * 100,
  };
};

// Method 3: Additive - subtracts equal amounts from each side
const devigAdditive = (overOdds, underOdds) => {
  const pOver = oddsToImpliedProb(overOdds);
  const pUnder = oddsToImpliedProb(underOdds);
  const pTotal = pOver + pUnder;
  const vigPerSide = (pTotal - 1) / 2;

  return {
    fairProbOver: Math.max(0.01, pOver - vigPerSide), // Ensure > 0
    fairProbUnder: Math.max(0.01, pUnder - vigPerSide),
    vig: (pTotal - 1) * 100,
  };
};

// Method 4: Worst Case - uses the more conservative fair probability
// Assumes all vig is on the side you're betting
const devigWorstCase = (overOdds, underOdds) => {
  const pOver = oddsToImpliedProb(overOdds);
  const pUnder = oddsToImpliedProb(underOdds);
  const pTotal = pOver + pUnder;
  const totalVig = pTotal - 1;

  // For OVER: assume all vig is on over side (worst case for over bet)
  // For UNDER: assume all vig is on under side (worst case for under bet)
  return {
    fairProbOver: pOver, // Keep implied prob (worst case for over bettor)
    fairProbUnder: pUnder, // Keep implied prob (worst case for under bettor)
    vig: totalVig * 100,
  };
};

// Master de-vig function that calls the appropriate method
const devig = (overOdds, underOdds, method = 'multiplicative') => {
  switch (method) {
    case 'power':
      return devigPower(overOdds, underOdds);
    case 'additive':
      return devigAdditive(overOdds, underOdds);
    case 'worstCase':
      return devigWorstCase(overOdds, underOdds);
    case 'multiplicative':
    default:
      return devigMultiplicative(overOdds, underOdds);
  }
};

// Convert fair probability back to fair odds
const fairProbToOdds = (fairProb) => 1 / fairProb;

// Calculate EV: (fair_probability * odds_offered) - 1
// Returns as percentage (multiply by 100)
const calculateEV = (fairProb, oddsOffered) => {
  return ((fairProb * oddsOffered) - 1) * 100;
};

// localStorage keys
const TRACKED_BETS_KEY = 'nba-ev-tracked-bets';
const REMOVED_BETS_KEY = 'nba-ev-removed-bets';

// ============ UNIT SIZE SYSTEM ============
// Calculate default unit size based on odds
const getDefaultUnits = (odds) => {
  if (odds <= 2.00) return 1.00;
  if (odds <= 2.75) return 0.75;
  if (odds <= 4.00) return 0.50;
  if (odds <= 7.00) return 0.25;
  return 0.10;
};

// ============ CONFIDENCE SCORE SYSTEM ============
// Calculate confidence score based on EV%, hit rate alignment, and B2B status
const calculateConfidence = (ev, hitRateData, isB2B, betType) => {
  let score = 0;
  let factors = [];

  // Factor 1: EV% (0-40 points)
  if (ev.evPercent >= 15) { score += 40; factors.push('EV 15%+'); }
  else if (ev.evPercent >= 10) { score += 30; factors.push('EV 10%+'); }
  else if (ev.evPercent >= 8) { score += 25; factors.push('EV 8%+'); }
  else if (ev.evPercent >= 5) { score += 15; factors.push('EV 5%+'); }
  else { score += 10; }

  // Factor 2: Hit rate alignment (0-40 points)
  if (hitRateData?.data) {
    const hitRate = betType === 'OVER' ? hitRateData.data.hitRate.over : hitRateData.data.hitRate.under;
    if (hitRate >= 0.70) { score += 40; factors.push('Hit 70%+'); }
    else if (hitRate >= 0.60) { score += 30; factors.push('Hit 60%+'); }
    else if (hitRate >= 0.50) { score += 20; factors.push('Hit 50%+'); }
    else if (hitRate >= 0.40) { score += 5; factors.push('Hit 40%+'); }
    else { score -= 10; factors.push('Low hit rate'); }
  }

  // Factor 3: Back-to-back consideration (±20 points)
  if (isB2B) {
    if (betType === 'UNDER') {
      score += 20; // Under bets are more valuable on B2B
      factors.push('B2B boost');
    } else {
      score -= 15; // Over bets are riskier on B2B
      factors.push('B2B risk');
    }
  }

  // Convert to grade
  let grade;
  if (score >= 80) grade = 'A+';
  else if (score >= 70) grade = 'A';
  else if (score >= 60) grade = 'B+';
  else if (score >= 50) grade = 'B';
  else if (score >= 40) grade = 'C+';
  else if (score >= 30) grade = 'C';
  else grade = 'D';

  return { score, grade, factors };
};

// Generate unique bet ID for tracking/removal
const generateBetId = (bet) => {
  const normalizedPlayer = bet.player.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  return `${normalizedPlayer}|${bet.market}|${bet.line}|${bet.betType}|${bet.bookmaker}`;
};

// Load from localStorage
const loadFromStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
};

// Save to localStorage
const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
};

export default function NBAEVScraping() {
  // WebSocket connection for real-time updates
  const {
    connected,
    status: socketStatus,
    lastUpdate: socketLastUpdate,
    isRefreshing: socketRefreshing,
    connectedClients,
    nbaData,
    soundEnabled,
    notificationsEnabled,
    autoReanalyze,
    toggleSound,
    toggleNotifications,
    toggleAutoReanalyze,
    registerOnDataUpdate,
    addHighEvAlert,
    requestRefresh,
  } = useSocket('nba');

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [cacheStatus, setCacheStatus] = useState(null);
  // Store opportunities and all props per match: { matchId: { opportunities: [], allProps: [], analyzed: bool } }
  const [matchData, setMatchData] = useState({});
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '', matchIndex: 0, totalMatches: 0, source: '' });

  // Tracked bets for stat tracking: array of bet objects with tracking metadata
  const [trackedBets, setTrackedBets] = useState(() => loadFromStorage(TRACKED_BETS_KEY, []));
  // Removed bets: { betId: { removedOdds: number, removedAt: string } }
  // Bet stays hidden unless odds change from when it was removed
  const [removedBets, setRemovedBets] = useState(() => loadFromStorage(REMOVED_BETS_KEY, {}));
  // Track which bet is currently being edited for tracking (betId -> true)
  const [trackingBetId, setTrackingBetId] = useState(null);
  // Custom odds input value
  const [customOdds, setCustomOdds] = useState('');
  // Custom units input value
  const [customUnits, setCustomUnits] = useState('');
  // Back-to-back teams (teams that played yesterday)
  const [b2bTeams, setB2bTeams] = useState(new Set());
  // Filter: which playable bookmakers to show (all checked by default)
  const [selectedBookmakers, setSelectedBookmakers] = useState(
    PLAYABLE_BOOKMAKERS.reduce((acc, b) => ({ ...acc, [b]: true }), {})
  );
  // Selected de-vig method
  const [devigMethod, setDevigMethod] = useState('multiplicative');
  // Minimum EV% filter (user adjustable)
  const [minEVFilter, setMinEVFilter] = useState(MIN_EV_PERCENT);
  // Sub-navigation tab: 'new' | 'tracked' | 'removed'
  const [activeTab, setActiveTab] = useState('new');
  // Market type filter: which markets to show
  const [selectedMarkets, setSelectedMarkets] = useState({
    'Points': true,
    'Rebounds': true,
    'Assists': true,
    '3PT': true,
    'Combos': true,
    'Other': true,
  });
  // Sort option: 'ev' | 'confidence'
  const [sortBy, setSortBy] = useState('ev');
  // Show/hide tips guide
  const [showTips, setShowTips] = useState(false);

  // Hit rate data from balldontlie: { [betKey]: { loading, data, error } }
  const [hitRates, setHitRates] = useState({});

  // Helper: categorize market type
  const getMarketCategory = (market) => {
    if (!market) return 'Other';
    const m = market.toLowerCase();
    if (m.includes('point') && !m.includes('+') && !m.includes('&')) return 'Points';
    if (m.includes('rebound') && !m.includes('+') && !m.includes('&')) return 'Rebounds';
    if (m.includes('assist') && !m.includes('+') && !m.includes('&')) return 'Assists';
    if (m.includes('three') || m.includes('3 point') || m.includes('3pt')) return '3PT';
    if (m.includes('+') || m.includes('&') || m.includes(',')) return 'Combos';
    return 'Other';
  };

  // Helper: check if market passes filter
  const marketPassesFilter = (market) => {
    const category = getMarketCategory(market);
    return selectedMarkets[category] === true;
  };

  // Debug panel state
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [debugBookmaker, setDebugBookmaker] = useState(null);
  const [debugEventId, setDebugEventId] = useState('');
  const [debugResponse, setDebugResponse] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState(null);

  // Fetch debug data for a bookmaker
  const fetchDebugData = async () => {
    if (!debugBookmaker || !debugEventId) {
      setDebugError('Please select a bookmaker and enter an event ID');
      return;
    }

    setDebugLoading(true);
    setDebugError(null);
    setDebugResponse(null);

    try {
      const url = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${debugEventId}&bookmakers=${debugBookmaker}`;
      const response = await fetch(url);
      const data = await response.json();
      setDebugResponse(data);
    } catch (err) {
      setDebugError(err.message);
    } finally {
      setDebugLoading(false);
    }
  };

  // Map market names to balldontlie stat types
  const MARKET_TO_STAT = {
    // Single stats (standard names from DraftKings/Pinnacle)
    'Points': 'points',
    'Assists': 'assists',
    'Rebounds': 'rebounds',
    '3 Point FG': 'threes',
    'Steals': 'steals',
    'Blocks': 'blocks',
    'Turnovers': 'turnovers',

    // Bet365 single stats (without O/U - gets stripped in parser)
    'Threes Made': 'threes',
    'Field Goals Made': 'field_goals',
    'Free Throws Made': 'free_throws',

    // 2-stat combos (DraftKings/Pinnacle - uses "+")
    'Pts+Asts': 'pts_asts',
    'Pts+Rebs': 'pts_rebs',
    'Rebs+Asts': 'rebs_asts',
    'Steals+Blocks': 'steals_blocks',

    // 2-stat combos (Bet365 - uses "&", O/U stripped)
    'Points & Assists': 'pts_asts',
    'Points & Rebounds': 'pts_rebs',
    'Assists & Rebounds': 'rebs_asts',
    'Steals & Blocks': 'steals_blocks',

    // 3-stat combos
    'Pts+Rebs+Asts': 'pts_rebs_asts',
    'Points, Assists & Rebounds': 'pts_rebs_asts',

    // Double/Triple doubles
    'Double+Double': 'double_double',
    'Double Double': 'double_double',
    'Triple Double': 'triple_double',
  };

  // Fetch hit rate for a bet from balldontlie API
  const fetchHitRate = async (ev) => {
    const betKey = `${ev.player}_${ev.market}_${ev.line}`;

    // Skip if already loaded or loading
    if (hitRates[betKey]?.data || hitRates[betKey]?.loading) return;

    // Map market to stat type
    const statType = MARKET_TO_STAT[ev.market];
    if (!statType) {
      console.log(`[HitRate] Unknown market type: ${ev.market}`);
      return;
    }

    // Set loading state
    setHitRates(prev => ({ ...prev, [betKey]: { loading: true } }));

    try {
      const url = `/api/hitrate?player=${encodeURIComponent(ev.player)}&stat=${statType}&line=${ev.line}&games=15`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setHitRates(prev => ({ ...prev, [betKey]: { data, loading: false } }));
      } else {
        setHitRates(prev => ({ ...prev, [betKey]: { error: data.error, loading: false } }));
      }
    } catch (err) {
      setHitRates(prev => ({ ...prev, [betKey]: { error: err.message, loading: false } }));
    }
  };

  // Toggle bookmaker filter
  const toggleBookmakerFilter = (bookmaker) => {
    setSelectedBookmakers(prev => ({
      ...prev,
      [bookmaker]: !prev[bookmaker]
    }));
  };

  // Start tracking flow - show odds input
  const startTracking = (bet) => {
    const betId = generateBetId(bet);
    setTrackingBetId(betId);
    setCustomOdds(bet.odds.toFixed(2)); // Pre-fill with displayed odds
    setCustomUnits(getDefaultUnits(bet.odds).toFixed(2)); // Pre-fill with default units
  };

  // Cancel tracking flow
  const cancelTracking = () => {
    setTrackingBetId(null);
    setCustomOdds('');
    setCustomUnits('');
  };

  // Confirm and track a bet - save to localStorage and Supabase for stat tracking
  const confirmTrackBet = async (bet, match) => {
    const betId = generateBetId(bet);

    // Check if already tracked
    if (trackedBets.some(tb => tb.id === betId)) {
      console.log('[Track] Bet already tracked:', betId);
      cancelTracking();
      return;
    }

    // Parse custom odds (fallback to displayed odds if invalid)
    const actualOdds = parseFloat(customOdds) || bet.odds;
    // Parse custom units (fallback to default if invalid)
    const units = parseFloat(customUnits) || getDefaultUnits(actualOdds);

    // Recalculate EV based on actual odds obtained
    const actualEV = calculateEV(bet.fairProb, actualOdds);

    const trackedBet = {
      id: betId,
      player: bet.player,
      market: bet.market,
      line: bet.line,
      betType: bet.betType,
      bookmaker: bet.bookmaker,
      displayedOdds: bet.odds, // Original displayed odds
      actualOdds: actualOdds, // Odds user actually got
      fairOdds: bet.fairOdds,
      fairProb: bet.fairProb,
      displayedEV: bet.evPercent, // Original displayed EV
      actualEV: actualEV, // EV based on actual odds
      units: units, // Bet size in units
      trackedAt: new Date().toISOString(),
      matchId: match.id,
      matchName: `${match.home} vs ${match.away}`,
      matchDate: match.date,
    };

    // Save to localStorage for local display
    const newTrackedBets = [...trackedBets, trackedBet];
    setTrackedBets(newTrackedBets);
    saveToStorage(TRACKED_BETS_KEY, newTrackedBets);
    console.log('[Track] Bet tracked with actual odds:', trackedBet);

    // Save to Supabase for universal dashboard
    try {
      await BetTracker.trackBet({
        sport: 'nba',
        matchId: match.id,
        matchName: `${match.home} vs ${match.away}`,
        matchDate: match.date,
        league: 'NBA',
        player: bet.player,
        market: bet.market,
        line: bet.line,
        betType: bet.betType,
        bookmaker: bet.bookmaker,
        displayedOdds: bet.odds,
        actualOdds,
        fairOdds: bet.fairOdds,
        fairProb: bet.fairProb,
        displayedEv: bet.evPercent,
        actualEv: actualEV,
        stake: 0,
        units: units,
      });
      console.log('[NBA] Bet tracked to Supabase');
    } catch (err) {
      console.error('[NBA] Failed to track bet to Supabase:', err);
    }

    // Reset tracking state
    cancelTracking();
  };

  // Remove a bet - hide until odds change
  const removeBet = (bet) => {
    const betId = generateBetId(bet);

    const newRemovedBets = {
      ...removedBets,
      [betId]: {
        removedOdds: bet.odds,
        removedAt: new Date().toISOString(),
      },
    };

    setRemovedBets(newRemovedBets);
    saveToStorage(REMOVED_BETS_KEY, newRemovedBets);
    console.log('[Remove] Bet removed:', betId, 'at odds:', bet.odds);
  };

  // Untrack a bet
  const untrackBet = (betId) => {
    const newTrackedBets = trackedBets.filter(tb => tb.id !== betId);
    setTrackedBets(newTrackedBets);
    saveToStorage(TRACKED_BETS_KEY, newTrackedBets);
    console.log('[Untrack] Bet untracked:', betId);
  };

  // Check if a bet is tracked
  const isBetTracked = (bet) => {
    const betId = generateBetId(bet);
    return trackedBets.some(tb => tb.id === betId);
  };

  // Check if ANY bet for this player is tracked (we only want to bet on a player once)
  const isPlayerTracked = (bet) => {
    const normalizedPlayer = bet.player.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    return trackedBets.some(tb => {
      const trackedPlayer = tb.player.toLowerCase().replace(/[^a-z\s]/g, '').trim();
      return trackedPlayer === normalizedPlayer;
    });
  };

  // Check if a bet should be hidden (removed and odds haven't changed)
  const isBetRemoved = (bet) => {
    const betId = generateBetId(bet);
    const removed = removedBets[betId];

    if (!removed) return false;

    // If odds have changed since removal, show the bet again
    if (bet.odds !== removed.removedOdds) {
      // Clean up the removal since odds changed
      const newRemovedBets = { ...removedBets };
      delete newRemovedBets[betId];
      setRemovedBets(newRemovedBets);
      saveToStorage(REMOVED_BETS_KEY, newRemovedBets);
      console.log('[Remove] Bet odds changed, showing again:', betId, 'old:', removed.removedOdds, 'new:', bet.odds);
      return false;
    }

    return true;
  };

  // Filter opportunities to exclude removed bets
  const filterRemovedBets = (opportunities) => {
    return opportunities.filter(opp => !isBetRemoved(opp));
  };

  // Generate RFC3339 date 24 hours from now
  const getNext24HoursDate = () => {
    const date = new Date();
    date.setHours(date.getHours() + 24);
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };

  // Generate RFC3339 date for yesterday
  const getYesterdayDates = () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return {
      from: yesterday.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      to: yesterdayEnd.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
  };

  // Check if a match has B2B teams
  const isMatchB2B = (match) => {
    return b2bTeams.has(match.home) || b2bTeams.has(match.away);
  };

  // Get which team(s) are on B2B for a match
  const getB2BTeams = (match) => {
    const teams = [];
    if (b2bTeams.has(match.home)) teams.push(match.home);
    if (b2bTeams.has(match.away)) teams.push(match.away);
    return teams;
  };

  // Parse player props from API response (standard format)
  // Structure: bookmakers.{BookmakerName}[].name="Player Props", odds=[{label, hdp, over, under}]
  const parsePlayerProps = (bookmakerData, bookmaker, updatedAt) => {
    const props = [];

    // bookmakerData is an array of markets
    if (!Array.isArray(bookmakerData)) return props;

    // Find the Player Props market
    const playerPropsMarket = bookmakerData.find(m => m.name === 'Player Props');
    if (!playerPropsMarket || !playerPropsMarket.odds) return props;

    // Use market-level updatedAt if available
    const marketUpdatedAt = playerPropsMarket.updatedAt || updatedAt;

    for (const item of playerPropsMarket.odds) {
      // Parse label like "Jay Huff (Points)" or "Donovan Mitchell (Pts+Rebs+Asts)"
      const match = item.label?.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (!match) continue;

      const playerName = match[1].trim();
      const statType = match[2].trim();

      // Check if this is a stat type we care about
      const marketKey = TARGET_STATS[statType];
      if (!marketKey) continue;

      const line = parseFloat(item.hdp);
      const overOdds = parseFloat(item.over);
      const underOdds = parseFloat(item.under);

      if (isNaN(line) || isNaN(overOdds)) continue;

      props.push({
        player: playerName,
        market: marketKey,
        marketName: statType,
        line,
        overOdds,
        underOdds: isNaN(underOdds) ? null : underOdds,
        bookmaker,
        updatedAt: marketUpdatedAt,
      });
    }

    return props;
  };

  // Parse Bet365 player props - they use separate markets like "Points O/U", "Rebounds O/U"
  // Label format: "Player Name (TeamNumber) (Line)" e.g. "Cade Cunningham (2) (6.5)"
  const parseBet365Props = (bookmakerData, bookmaker, updatedAt) => {
    const props = [];

    if (!Array.isArray(bookmakerData)) return props;

    // Iterate through all markets looking for our target markets
    for (const market of bookmakerData) {
      const marketKey = BET365_MARKETS[market.name];
      if (!marketKey || !market.odds) continue;

      // Get readable stat name from market name (e.g., "Points O/U" -> "Points")
      const statName = market.name.replace(' O/U', '');
      // Use market-level updatedAt if available
      const marketUpdatedAt = market.updatedAt || updatedAt;

      for (const item of market.odds) {
        // Parse label like "Cade Cunningham (2) (6.5)" - extract player name, ignore team number
        // Format: "Player Name (TeamNum) (Line)" or sometimes just "Player Name (Line)"
        const match = item.label?.match(/^(.+?)\s*\(\d+\)\s*\([0-9.]+\)$/) ||
                      item.label?.match(/^(.+?)\s*\([0-9.]+\)$/);

        if (!match) continue;

        const playerName = match[1].trim();
        const line = parseFloat(item.hdp);
        const overOdds = parseFloat(item.over);
        const underOdds = parseFloat(item.under);

        if (isNaN(line) || isNaN(overOdds)) continue;

        props.push({
          player: playerName,
          market: marketKey,
          marketName: statName,
          line,
          overOdds,
          underOdds: isNaN(underOdds) ? null : underOdds,
          bookmaker,
          updatedAt: marketUpdatedAt,
        });
      }
    }

    return props;
  };

  // Fetch cache server status
  const fetchCacheStatus = async () => {
    try {
      const response = await fetch(`${CACHE_SERVER_URL}/api/status`, {
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        const data = await response.json();
        setCacheStatus(data);
        return data;
      }
    } catch (err) {
      console.log('[Cache] Could not fetch status');
    }
    return null;
  };

  // Try to fetch cached odds from the server
  const fetchCachedOdds = async (eventId) => {
    try {
      const response = await fetch(`${CACHE_SERVER_URL}/api/nba/odds/${eventId}`, {
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.bookmakers) {
          console.log(`[Cache] Got cached odds for event ${eventId}`);
          return data;
        }
      }
    } catch (err) {
      // Cache miss or timeout - fall back to direct API
      console.log(`[Cache] Miss for event ${eventId}, using direct API`);
    }
    return null;
  };

  // Fetch odds for a single bookmaker
  // Returns { props: [...], updatedAt: "ISO timestamp" }
  const fetchBookmakerOdds = async (eventId, bookmaker, cachedData = null) => {
    try {
      let data;

      // Use cached data if available, otherwise fetch from API
      if (cachedData && cachedData.bookmakers && cachedData.bookmakers[bookmaker]) {
        data = { bookmakers: { [bookmaker]: cachedData.bookmakers[bookmaker] } };
        console.log(`[${bookmaker}] Using cached data`);
      } else {
        const url = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${bookmaker}`;
        const response = await fetch(url);

        if (!response.ok) {
          console.warn(`[${bookmaker}] API error:`, response.status);
          return { props: [], updatedAt: null };
        }

        data = await response.json();
      }

      // Check for bookmaker data in the new structure
      if (!data || !data.bookmakers || !data.bookmakers[bookmaker]) {
        console.warn(`[${bookmaker}] No bookmaker data`);
        return { props: [], updatedAt: null };
      }

      // Get the updatedAt from the first market (they should all be similar)
      const markets = data.bookmakers[bookmaker];
      const updatedAt = Array.isArray(markets) && markets.length > 0 ? markets[0].updatedAt : null;

      // Use appropriate parser based on bookmaker, pass updatedAt
      let props;
      if (bookmaker === 'Bet365') {
        props = parseBet365Props(markets, bookmaker, updatedAt);
      } else {
        props = parsePlayerProps(markets, bookmaker, updatedAt);
      }

      return { props, updatedAt };
    } catch (err) {
      console.error(`[${bookmaker}] Fetch error:`, err);
      return { props: [], updatedAt: null };
    }
  };

  // Convert ISO timestamp to CET timezone HH:MM format
  const formatTimeCET = (isoString) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris', // CET timezone
    });
  };

  // Normalize player name for matching
  const normalizePlayerName = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Check if two lines are within tolerance
  const linesMatch = (line1, line2) => {
    return Math.abs(line1 - line2) <= LINE_TOLERANCE;
  };

  // Group props by player+market and find matching lines
  const groupAndMatchProps = (allProps) => {
    const groups = {};

    for (const prop of allProps) {
      const normalizedPlayer = normalizePlayerName(prop.player);
      const key = `${normalizedPlayer}|${prop.market}`;

      if (!groups[key]) {
        groups[key] = {
          player: prop.player,
          normalizedPlayer,
          market: prop.market,
          marketName: prop.marketName,
          props: [],
        };
      }

      // Deduplicate: only add if we don't already have this bookmaker with same line
      const existing = groups[key].props.find(
        p => p.bookmaker === prop.bookmaker && p.line === prop.line
      );
      if (!existing) {
        groups[key].props.push(prop);
      }
    }

    // For each group, cluster by similar lines
    const matched = [];
    for (const group of Object.values(groups)) {
      // Sort props by line
      const sorted = group.props.sort((a, b) => a.line - b.line);

      // Cluster props with similar lines
      // IMPORTANT: Only keep ONE entry per bookmaker per cluster to avoid duplicates
      const clusters = [];
      for (const prop of sorted) {
        let added = false;
        for (const cluster of clusters) {
          // Check if this prop's line matches the cluster's average line
          const avgLine = cluster.reduce((sum, p) => sum + p.line, 0) / cluster.length;
          if (linesMatch(prop.line, avgLine)) {
            // Only add if this bookmaker isn't already in the cluster
            const existingBookmaker = cluster.find(p => p.bookmaker === prop.bookmaker);
            if (!existingBookmaker) {
              cluster.push(prop);
            }
            added = true;
            break;
          }
        }
        if (!added) {
          clusters.push([prop]);
        }
      }

      // Keep clusters with at least MIN_BOOKMAKERS different bookmakers
      for (const cluster of clusters) {
        const uniqueBookmakers = new Set(cluster.map(p => p.bookmaker));
        if (uniqueBookmakers.size >= MIN_BOOKMAKERS) {
          const avgLine = cluster.reduce((sum, p) => sum + p.line, 0) / cluster.length;
          matched.push({
            player: group.player,
            market: group.market,
            marketName: group.marketName,
            avgLine: Math.round(avgLine * 2) / 2, // Round to nearest 0.5
            props: cluster,
            bookmakerCount: uniqueBookmakers.size,
          });
        }
      }
    }

    return matched;
  };

  // Calculate EV using DE-VIGGING method
  // 1. For each bookmaker with both over/under odds, calculate fair probabilities (remove vig)
  // 2. Average fair probabilities across ALL bookmakers
  // 3. Calculate EV = (fair_prob * odds_offered) - 1 for PLAYABLE bookmakers only
  // IMPORTANT: Directional line matching still applies
  // Returns: { opportunities: [...], allLines: [...] } where allLines includes all playable props with fair odds
  const findEVOpportunities = (matchedGroups, method = 'multiplicative') => {
    const opportunities = [];
    const allLines = []; // All playable lines with fair odds (even if not +EV)
    let debugStats = { totalPlayable: 0, withEnoughBooks: 0, positiveEV: 0, aboveThreshold: 0 };

    for (const group of matchedGroups) {
      // Only check PLAYABLE bookmakers for EV opportunities
      const playableProps = group.props.filter(p => PLAYABLE_BOOKMAKERS.includes(p.bookmaker));
      debugStats.totalPlayable += playableProps.length;

      for (const prop of playableProps) {
        const propLine = prop.line;

        // For OVER: Use props with same or HIGHER lines (within tolerance)
        // IMPORTANT: Only use NON-PLAYABLE bookmakers for fair odds calculation!
        const overComparableProps = group.props.filter(p =>
          !PLAYABLE_BOOKMAKERS.includes(p.bookmaker) && // Exclude playable books from fair calc
          p.line >= propLine && p.line <= propLine + LINE_TOLERANCE &&
          !isNaN(p.overOdds) && p.underOdds !== null && !isNaN(p.underOdds)
        );

        if (overComparableProps.length >= MIN_BOOKMAKERS) {
          debugStats.withEnoughBooks++;

          // De-vig each NON-PLAYABLE bookmaker to get fair probabilities
          const fairProbs = overComparableProps.map(p => {
            const { fairProbOver, fairProbUnder, vig } = devig(p.overOdds, p.underOdds, method);
            return { bookmaker: p.bookmaker, fairProbOver, fairProbUnder, vig, odds: p.overOdds, line: p.line };
          });

          // Average fair probability from SHARP/NON-PLAYABLE books only
          const avgFairProbOver = fairProbs.reduce((sum, fp) => sum + fp.fairProbOver, 0) / fairProbs.length;
          const fairOddsOver = fairProbToOdds(avgFairProbOver);

          // Calculate EV: Compare playable book's odds against external fair odds
          const evPercent = calculateEV(avgFairProbOver, prop.overOdds);

          if (evPercent > 0) debugStats.positiveEV++;

          // Get all playable bookmaker odds for this line (to show what each playable book offers)
          const playableOddsForLine = group.props
            .filter(p => PLAYABLE_BOOKMAKERS.includes(p.bookmaker) &&
                        p.line >= propLine - LINE_TOLERANCE && p.line <= propLine + LINE_TOLERANCE)
            .map(p => ({ bookmaker: p.bookmaker, odds: p.overOdds, line: p.line }));

          // Create line object for this playable prop
          const lineObj = {
            player: group.player,
            market: group.marketName,
            line: propLine,
            betType: 'OVER',
            bookmaker: prop.bookmaker,
            odds: prop.overOdds,
            fairOdds: fairOddsOver,
            fairProb: avgFairProbOver,
            evPercent: evPercent,
            updatedAt: prop.updatedAt,
            bookmakerCount: overComparableProps.length,
            // Sharp book odds used for de-vigging
            allOdds: fairProbs.map(fp => ({
              bookmaker: fp.bookmaker,
              odds: fp.odds,
              line: fp.line,
              fairProb: fp.fairProbOver,
              vig: fp.vig,
            })),
            // Playable bookmaker odds for comparison
            playableOdds: playableOddsForLine,
          };

          // Always add to allLines (shows all playable props)
          allLines.push(lineObj);

          // Only add to opportunities if above threshold
          if (evPercent >= MIN_EV_PERCENT) {
            debugStats.aboveThreshold++;
            opportunities.push(lineObj);
          }
        }

        // For UNDER: Use props with same or LOWER lines (within tolerance)
        // IMPORTANT: Only use NON-PLAYABLE bookmakers for fair odds calculation!
        if (prop.underOdds !== null) {
          const underComparableProps = group.props.filter(p =>
            !PLAYABLE_BOOKMAKERS.includes(p.bookmaker) && // Exclude playable books from fair calc
            p.line <= propLine && p.line >= propLine - LINE_TOLERANCE &&
            p.underOdds !== null && !isNaN(p.underOdds) && !isNaN(p.overOdds)
          );

          if (underComparableProps.length >= MIN_BOOKMAKERS) {
            // De-vig each NON-PLAYABLE bookmaker to get fair probabilities
            const fairProbs = underComparableProps.map(p => {
              const { fairProbOver, fairProbUnder, vig } = devig(p.overOdds, p.underOdds, method);
              return { bookmaker: p.bookmaker, fairProbOver, fairProbUnder, vig, odds: p.underOdds, line: p.line };
            });

            // Average fair probability from SHARP/NON-PLAYABLE books only
            const avgFairProbUnder = fairProbs.reduce((sum, fp) => sum + fp.fairProbUnder, 0) / fairProbs.length;
            const fairOddsUnder = fairProbToOdds(avgFairProbUnder);

            // Calculate EV: Compare playable book's odds against external fair odds
            const evPercent = calculateEV(avgFairProbUnder, prop.underOdds);

            if (evPercent > 0) debugStats.positiveEV++;

            // Get all playable bookmaker odds for this line (UNDER)
            const playableOddsForLineUnder = group.props
              .filter(p => PLAYABLE_BOOKMAKERS.includes(p.bookmaker) &&
                          p.line >= propLine - LINE_TOLERANCE && p.line <= propLine + LINE_TOLERANCE &&
                          p.underOdds !== null)
              .map(p => ({ bookmaker: p.bookmaker, odds: p.underOdds, line: p.line }));

            // Create line object for this playable prop
            const lineObj = {
              player: group.player,
              market: group.marketName,
              line: propLine,
              betType: 'UNDER',
              bookmaker: prop.bookmaker,
              odds: prop.underOdds,
              fairOdds: fairOddsUnder,
              fairProb: avgFairProbUnder,
              evPercent: evPercent,
              updatedAt: prop.updatedAt,
              bookmakerCount: underComparableProps.length,
              // Sharp book odds used for de-vigging
              allOdds: fairProbs.map(fp => ({
                bookmaker: fp.bookmaker,
                odds: fp.odds,
                line: fp.line,
                fairProb: fp.fairProbUnder,
                vig: fp.vig,
              })),
              // Playable bookmaker odds for comparison
              playableOdds: playableOddsForLineUnder,
            };

            // Always add to allLines (shows all playable props)
            allLines.push(lineObj);

            // Only add to opportunities if above threshold
            if (evPercent >= MIN_EV_PERCENT) {
              debugStats.aboveThreshold++;
              opportunities.push(lineObj);
            }
          }
        }
      }
    }

    console.log('[De-vig Debug]', debugStats);

    // Sort by EV percentage descending
    return {
      opportunities: opportunities.sort((a, b) => b.evPercent - a.evPercent),
      allLines: allLines.sort((a, b) => b.evPercent - a.evPercent),
    };
  };

  // Calculate EV opportunities for all matches when devigMethod or matchData changes
  const computedMatchData = useMemo(() => {
    const computed = {};
    for (const [matchId, data] of Object.entries(matchData)) {
      if (data.matchedGroups && data.matchedGroups.length > 0) {
        const { opportunities, allLines } = findEVOpportunities(data.matchedGroups, devigMethod);
        computed[matchId] = { ...data, opportunities, allLines };
      } else {
        computed[matchId] = { ...data, opportunities: [], allLines: [] };
      }
    }
    return computed;
  }, [matchData, devigMethod]);

  // Auto-fetch hit rates for all 10%+ EV bets
  useEffect(() => {
    if (!computedMatchData || Object.keys(computedMatchData).length === 0) return;

    // Collect all 10%+ EV bets that need hit rate data
    const highEvBets = [];
    for (const data of Object.values(computedMatchData)) {
      const lines = data.allLines || [];
      for (const ev of lines) {
        if (ev.evPercent >= 8) {
          const betKey = `${ev.player}_${ev.market}_${ev.line}`;
          const statType = MARKET_TO_STAT[ev.market];
          // Only queue if we have a valid stat type and haven't already fetched
          if (statType && !hitRates[betKey]?.data && !hitRates[betKey]?.loading) {
            highEvBets.push(ev);
          }
        }
      }
    }

    if (highEvBets.length === 0) return;

    console.log(`[HitRate] Auto-fetching hit rates for ${highEvBets.length} bets with 10%+ EV`);

    // Fetch with staggered delays to avoid rate limiting
    let delay = 0;
    for (const ev of highEvBets) {
      setTimeout(() => fetchHitRate(ev), delay);
      delay += 500; // 500ms between each request
    }
  }, [computedMatchData]); // Re-run when match data changes

  // Analyze a single match and return results (does not update state)
  const analyzeMatchInternal = async (match, onProgress) => {
    const allProps = [];

    // First, try to get cached odds for this event (saves API calls)
    const cachedData = await fetchCachedOdds(match.id);
    const usingCache = cachedData && cachedData.bookmakers && Object.keys(cachedData.bookmakers).length > 0;

    if (usingCache) {
      const cachedBookmakers = Object.keys(cachedData.bookmakers).length;
      console.log(`[Match ${match.id}] USING CACHE with ${cachedBookmakers} bookmakers`);
      // When using cache, process all bookmakers instantly
      if (onProgress) onProgress(ALL_BOOKMAKERS.length, 'Using cached data', 'CACHE');

      for (const bookmaker of ALL_BOOKMAKERS) {
        const { props } = await fetchBookmakerOdds(match.id, bookmaker, cachedData);
        allProps.push(...props);
      }
    } else {
      console.log(`[Match ${match.id}] NO CACHE - using direct API`);
      // No cache - fetch from API with progress animation
      for (let i = 0; i < ALL_BOOKMAKERS.length; i++) {
        const bookmaker = ALL_BOOKMAKERS[i];
        if (onProgress) onProgress(i + 1, `Fetching ${bookmaker}...`, 'API');

        const { props } = await fetchBookmakerOdds(match.id, bookmaker, null);
        allProps.push(...props);

        // Add delay between API requests
        if (i < ALL_BOOKMAKERS.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // Group and match props
    const matchedGroups = groupAndMatchProps(allProps);

    // Return matched groups - EV calculation happens on render based on selected de-vig method
    return { matchedGroups, analyzed: true };
  };

  // Analyze all matches automatically
  const analyzeAllMatches = async (matchList) => {
    if (!matchList || matchList.length === 0) return;

    setAnalyzing(true);
    const newMatchData = {};

    for (let mIdx = 0; mIdx < matchList.length; mIdx++) {
      const match = matchList[mIdx];

      setProgress({
        current: 0,
        total: ALL_BOOKMAKERS.length,
        status: 'Checking cache...',
        matchIndex: mIdx + 1,
        totalMatches: matchList.length,
        matchName: `${match.home} vs ${match.away}`,
        source: '',
      });

      try {
        const result = await analyzeMatchInternal(match, (bookIdx, statusText, source) => {
          setProgress({
            current: bookIdx,
            total: ALL_BOOKMAKERS.length,
            status: statusText,
            matchIndex: mIdx + 1,
            totalMatches: matchList.length,
            matchName: `${match.home} vs ${match.away}`,
            source: source || '',
          });
        });

        newMatchData[match.id] = result;
        console.log(`[Analysis] ${match.home} vs ${match.away}: ${result.matchedGroups?.length || 0} matched groups`);

        // Update state incrementally so user sees progress
        setMatchData(prev => ({ ...prev, [match.id]: result }));

      } catch (err) {
        console.error(`[Analysis] Error analyzing ${match.home} vs ${match.away}:`, err);
        newMatchData[match.id] = { matchedGroups: [], analyzed: true, error: err.message };
        setMatchData(prev => ({ ...prev, [match.id]: newMatchData[match.id] }));
      }

      // Delay between matches to avoid rate limiting
      if (mIdx < matchList.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setProgress({ current: 0, total: 0, status: '', matchIndex: 0, totalMatches: 0, source: '' });
    setAnalyzing(false);
  };

  // Check if match is live (started within last 30 minutes)
  const isMatchLive = (match) => {
    if (match.status === 'inprogress') return true;

    const now = new Date();
    const matchDate = new Date(match.date);
    const diffMs = now - matchDate;
    const diffMinutes = diffMs / (1000 * 60);

    // Match started within last 30 minutes
    return diffMinutes >= 0 && diffMinutes <= 30;
  };

  // Refresh and re-analyze all matches
  const refreshAll = async () => {
    setLoading(true);
    setMatchData({});
    setError(null);

    try {
      const toDate = getNext24HoursDate();
      const { from: yesterdayFrom, to: yesterdayTo } = getYesterdayDates();

      // Fetch pending, live, and yesterday's matches in parallel
      // Try both "completed" and "finished" statuses for yesterday's games
      const [pendingResponse, liveResponse, yesterdayResponse1, yesterdayResponse2] = await Promise.all([
        fetch(`${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=basketball&league=usa-nba&status=pending&to=${toDate}`),
        fetch(`${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=basketball&league=usa-nba&status=live`),
        fetch(`${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=basketball&league=usa-nba&status=completed&from=${yesterdayFrom}&to=${yesterdayTo}`),
        fetch(`${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=basketball&league=usa-nba&status=finished&from=${yesterdayFrom}&to=${yesterdayTo}`)
      ]);

      if (!pendingResponse.ok) {
        throw new Error(`API error: ${pendingResponse.status}`);
      }

      const pendingData = await pendingResponse.json();
      let liveData = [];

      // Live endpoint might fail if no live matches, that's ok
      if (liveResponse.ok) {
        liveData = await liveResponse.json();
        // Filter to only matches in first 20 minutes (player props still valuable early in game)
        liveData = liveData.filter(match => {
          const now = new Date();
          const matchDate = new Date(match.date);
          const diffMinutes = (now - matchDate) / (1000 * 60);
          return diffMinutes <= 20;
        });
        // Mark as live
        liveData = liveData.map(m => ({ ...m, isLive: true }));
      }

      // Detect back-to-back teams from yesterday's games
      const teamsPlayedYesterday = new Set();

      // Try completed status
      if (yesterdayResponse1.ok) {
        const data1 = await yesterdayResponse1.json();
        for (const match of data1) {
          teamsPlayedYesterday.add(match.home);
          teamsPlayedYesterday.add(match.away);
        }
        console.log('[NBA EV] Yesterday games (completed):', data1.length);
      }

      // Try finished status
      if (yesterdayResponse2.ok) {
        const data2 = await yesterdayResponse2.json();
        for (const match of data2) {
          teamsPlayedYesterday.add(match.home);
          teamsPlayedYesterday.add(match.away);
        }
        console.log('[NBA EV] Yesterday games (finished):', data2.length);
      }

      if (teamsPlayedYesterday.size > 0) {
        setB2bTeams(teamsPlayedYesterday);
        console.log('[NBA EV] Teams played yesterday:', Array.from(teamsPlayedYesterday));
      }

      // Combine: live matches first, then pending
      const allMatches = [...liveData, ...pendingData];
      console.log('[NBA EV] Received', pendingData.length, 'pending +', liveData.length, 'live matches');

      setMatches(allMatches);
      setLastUpdated(new Date());
      setLoading(false);

      // Auto-analyze all matches
      if (allMatches.length > 0) {
        await analyzeAllMatches(allMatches);
      }
    } catch (err) {
      console.error('[NBA EV] Error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Fetch all matches and auto-analyze on mount
  useEffect(() => {
    fetchCacheStatus();
    refreshAll();
  }, []);

  // Format date for display
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Calculate time until match
  const getTimeUntil = (dateStr) => {
    const now = new Date();
    const matchDate = new Date(dateStr);
    const diffMs = matchDate - now;

    if (diffMs < 0) return 'Started';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div>
      {/* CSS Animation for LIVE pulse + Confidence Tooltip */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .confidence-badge:hover .confidence-tooltip {
          opacity: 1 !important;
          visibility: visible !important;
        }
      `}</style>

      {/* Header Section */}
      <div style={{
        background: "linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.1) 100%)",
        borderRadius: 20,
        padding: "24px 32px",
        marginBottom: 24,
        border: "1px solid rgba(249, 115, 22, 0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 800,
              margin: 0,
              background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              NBA EV Scraping
            </h1>
            <p style={{ color: "#94a3b8", margin: "8px 0 0 0", fontSize: 14 }}>
              De-vigged EV calculation across {ALL_BOOKMAKERS.length} bookmakers - Find {MIN_EV_PERCENT}%+ EV on {PLAYABLE_BOOKMAKERS.join(', ')}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <ConnectionStatus
              connected={connected}
              isRefreshing={socketRefreshing || analyzing}
              lastUpdate={socketLastUpdate || lastUpdated}
              connectedClients={connectedClients}
              soundEnabled={soundEnabled}
              notificationsEnabled={notificationsEnabled}
              autoReanalyze={autoReanalyze}
              onToggleSound={toggleSound}
              onToggleNotifications={toggleNotifications}
              onToggleAutoReanalyze={toggleAutoReanalyze}
              cacheStatus={socketStatus || cacheStatus}
              sport="nba"
            />
            <button
              onClick={refreshAll}
              disabled={loading || analyzing}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                border: "1px solid rgba(249, 115, 22, 0.5)",
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: (loading || analyzing) ? "not-allowed" : "pointer",
                opacity: (loading || analyzing) ? 0.7 : 1,
              }}
            >
              {loading ? "Loading..." : analyzing ? "Analyzing..." : "Refresh All"}
            </button>
          </div>
        </div>

        {/* Bookmakers info */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: 12 }}>Playable:</span>
          {PLAYABLE_BOOKMAKERS.map(b => (
            <span key={b} style={{
              background: "rgba(34, 197, 94, 0.2)",
              color: "#22c55e",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
            }}>
              {b}
            </span>
          ))}
          <span style={{ color: "#64748b", fontSize: 12, marginLeft: 8 }}>For avg:</span>
          {ALL_BOOKMAKERS.filter(b => !PLAYABLE_BOOKMAKERS.includes(b)).map(b => (
            <span key={b} style={{
              background: "rgba(100, 116, 139, 0.2)",
              color: "#94a3b8",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
            }}>
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Debug Panel Toggle */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setDebugPanelOpen(!debugPanelOpen)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(100, 116, 139, 0.3)",
            background: debugPanelOpen ? "rgba(100, 116, 139, 0.2)" : "transparent",
            color: "#94a3b8",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ transform: debugPanelOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            ▶
          </span>
          API Debug Panel
        </button>

        {/* Debug Panel Content */}
        {debugPanelOpen && (
          <div style={{
            marginTop: 12,
            background: "rgba(30, 41, 59, 0.5)",
            border: "1px solid rgba(100, 116, 139, 0.3)",
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#e2e8f0" }}>
                Bookmaker API Inspector
              </h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                Click a bookmaker and enter an event ID to see the raw API response
              </p>
            </div>

            {/* Bookmaker Selection */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 8 }}>
                Select Bookmaker:
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ALL_BOOKMAKERS.map(bm => (
                  <button
                    key={bm}
                    onClick={() => setDebugBookmaker(bm)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: debugBookmaker === bm ? "1px solid #f97316" : "1px solid rgba(100, 116, 139, 0.3)",
                      background: debugBookmaker === bm ? "rgba(249, 115, 22, 0.2)" : "rgba(30, 41, 59, 0.5)",
                      color: debugBookmaker === bm ? "#f97316" : "#94a3b8",
                      fontSize: 12,
                      cursor: "pointer",
                      fontWeight: debugBookmaker === bm ? 600 : 400,
                    }}
                  >
                    {bm}
                  </button>
                ))}
              </div>
            </div>

            {/* Event ID Input */}
            <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div style={{ flex: 1, maxWidth: 300 }}>
                <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 8 }}>
                  Event ID:
                </label>
                <input
                  type="text"
                  value={debugEventId}
                  onChange={(e) => setDebugEventId(e.target.value)}
                  placeholder="e.g. 62924957"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(100, 116, 139, 0.3)",
                    background: "rgba(15, 23, 42, 0.8)",
                    color: "#e2e8f0",
                    fontSize: 14,
                  }}
                />
              </div>
              <button
                onClick={fetchDebugData}
                disabled={debugLoading || !debugBookmaker || !debugEventId}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: (!debugBookmaker || !debugEventId) ? "rgba(100, 116, 139, 0.3)" : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: (!debugBookmaker || !debugEventId || debugLoading) ? "not-allowed" : "pointer",
                  opacity: debugLoading ? 0.7 : 1,
                }}
              >
                {debugLoading ? "Loading..." : "Fetch Odds"}
              </button>
            </div>

            {/* Show URL being fetched */}
            {debugBookmaker && debugEventId && (
              <div style={{
                marginBottom: 16,
                padding: 10,
                background: "rgba(15, 23, 42, 0.5)",
                borderRadius: 6,
                fontFamily: "monospace",
                fontSize: 11,
                color: "#64748b",
                wordBreak: "break-all",
              }}>
                <span style={{ color: "#94a3b8" }}>GET </span>
                {ODDS_API_BASE}/odds?apiKey=***&eventId={debugEventId}&bookmakers={debugBookmaker}
              </div>
            )}

            {/* Available Event IDs from current matches */}
            {matches.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 8 }}>
                  Quick Select (Current Matches):
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {matches.slice(0, 8).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setDebugEventId(String(m.id))}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: debugEventId === String(m.id) ? "1px solid #22c55e" : "1px solid rgba(100, 116, 139, 0.2)",
                        background: debugEventId === String(m.id) ? "rgba(34, 197, 94, 0.2)" : "rgba(30, 41, 59, 0.3)",
                        color: debugEventId === String(m.id) ? "#22c55e" : "#64748b",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {m.id} - {m.away?.substring(0, 3)} @ {m.home?.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error Display */}
            {debugError && (
              <div style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                color: "#fca5a5",
                fontSize: 13,
              }}>
                {debugError}
              </div>
            )}

            {/* Response Display */}
            {debugResponse && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ color: "#94a3b8", fontSize: 13 }}>
                    Response for {debugBookmaker} (Event {debugEventId}):
                  </label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(debugResponse, null, 2));
                    }}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(100, 116, 139, 0.3)",
                      background: "transparent",
                      color: "#94a3b8",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Copy JSON
                  </button>
                </div>
                <pre style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(100, 116, 139, 0.2)",
                  borderRadius: 8,
                  padding: 16,
                  color: "#e2e8f0",
                  fontSize: 12,
                  overflow: "auto",
                  maxHeight: 500,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {JSON.stringify(debugResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          color: "#fca5a5",
        }}>
          Error: {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: "center",
          padding: 60,
          color: "#64748b",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏀</div>
          <p>Loading NBA matches...</p>
        </div>
      )}

      {/* Progress indicator when analyzing */}
      {analyzing && progress.total > 0 && (
        <div style={{
          background: "rgba(30, 41, 59, 0.8)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          border: "1px solid rgba(249, 115, 22, 0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "3px solid rgba(249, 115, 22, 0.3)",
              borderTopColor: "#f97316",
              animation: "spin 1s linear infinite",
            }} />
            <div>
              <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{progress.matchName}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>{progress.status}</span>
                {progress.source && (
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: progress.source === 'CACHE' ? "rgba(34, 197, 94, 0.2)" : "rgba(249, 115, 22, 0.2)",
                    color: progress.source === 'CACHE' ? "#22c55e" : "#f97316",
                    border: `1px solid ${progress.source === 'CACHE' ? "rgba(34, 197, 94, 0.3)" : "rgba(249, 115, 22, 0.3)"}`,
                  }}>
                    {progress.source}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Match progress */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>
              Match {progress.matchIndex} of {progress.totalMatches}
            </div>
            <div style={{
              background: "rgba(100, 116, 139, 0.2)",
              borderRadius: 8,
              height: 6,
              overflow: "hidden",
            }}>
              <div style={{
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                height: "100%",
                width: `${(progress.matchIndex / progress.totalMatches) * 100}%`,
                transition: "width 0.3s",
              }} />
            </div>
          </div>
          {/* Bookmaker progress */}
          <div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>
              {progress.current} / {progress.total} bookmakers
            </div>
            <div style={{
              background: "rgba(100, 116, 139, 0.2)",
              borderRadius: 8,
              height: 6,
              overflow: "hidden",
            }}>
              <div style={{
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                height: "100%",
                width: `${(progress.current / progress.total) * 100}%`,
                transition: "width 0.3s",
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Matches with inline EV opportunities */}
      {!loading && matches.length > 0 && (
        <div>
          {/* Summary stats */}
          {Object.keys(computedMatchData).length > 0 && (() => {
            // Calculate filtered counts (using allLines with minEVFilter, bookmaker filter, market filter, and removed bets)
            const visibleOpps = Object.values(computedMatchData).reduce((sum, d) => {
              const lines = d.allLines || [];
              return sum + lines.filter(o =>
                o.evPercent >= minEVFilter &&
                !isBetRemoved(o) &&
                selectedBookmakers[o.bookmaker] &&
                marketPassesFilter(o.market)
              ).length;
            }, 0);
            const totalOpps = Object.values(computedMatchData).reduce((sum, d) => {
              const lines = d.allLines || [];
              return sum + lines.filter(o => o.evPercent >= minEVFilter && marketPassesFilter(o.market)).length;
            }, 0);
            const hiddenCount = totalOpps - visibleOpps;

            return (
              <div style={{
                display: "flex",
                gap: 16,
                marginBottom: 24,
                flexWrap: "wrap",
              }}>
                <div style={{
                  background: "rgba(34, 197, 94, 0.15)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: 12,
                  padding: "12px 20px",
                }}>
                  <div style={{ color: "#22c55e", fontSize: 24, fontWeight: 800 }}>
                    {visibleOpps}
                    {hiddenCount > 0 && (
                      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500, marginLeft: 4 }}>
                        ({hiddenCount} hidden)
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>+EV Bets ({minEVFilter}%+)</div>
                </div>
                <div style={{
                  background: "rgba(59, 130, 246, 0.15)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: 12,
                  padding: "12px 20px",
                }}>
                  <div style={{ color: "#60a5fa", fontSize: 24, fontWeight: 800 }}>
                    {trackedBets.length}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>Tracked Bets</div>
                </div>
                <div style={{
                  background: "rgba(249, 115, 22, 0.15)",
                  border: "1px solid rgba(249, 115, 22, 0.3)",
                  borderRadius: 12,
                  padding: "12px 20px",
                }}>
                  <div style={{ color: "#f97316", fontSize: 24, fontWeight: 800 }}>
                    {Object.values(computedMatchData).reduce((sum, d) => sum + (d.allLines?.length || 0), 0)}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>Total Lines</div>
                </div>
                <div style={{
                  background: "rgba(100, 116, 139, 0.15)",
                  border: "1px solid rgba(100, 116, 139, 0.3)",
                  borderRadius: 12,
                  padding: "12px 20px",
                }}>
                  <div style={{ color: "#e2e8f0", fontSize: 24, fontWeight: 800 }}>
                    {Object.keys(computedMatchData).filter(id => computedMatchData[id].analyzed).length} / {matches.length}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>Matches</div>
                </div>
              </div>
            );
          })()}

          {/* Sub-navigation tabs */}
          <div style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
          }}>
            <button
              onClick={() => setActiveTab('new')}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                background: activeTab === 'new'
                  ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                  : "rgba(100, 116, 139, 0.2)",
                color: activeTab === 'new' ? "#fff" : "#94a3b8",
                transition: "all 0.2s",
              }}
            >
              New Bets
              {(() => {
                const newCount = Object.values(computedMatchData).reduce((sum, d) => {
                  const lines = d.allLines || [];
                  return sum + lines.filter(o =>
                    o.evPercent >= minEVFilter &&
                    !isBetRemoved(o) &&
                    !isPlayerTracked(o) &&
                    selectedBookmakers[o.bookmaker] &&
                    marketPassesFilter(o.market)
                  ).length;
                }, 0);
                return newCount > 0 ? ` (${newCount})` : '';
              })()}
            </button>
            <button
              onClick={() => setActiveTab('tracked')}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                background: activeTab === 'tracked'
                  ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
                  : "rgba(100, 116, 139, 0.2)",
                color: activeTab === 'tracked' ? "#fff" : "#94a3b8",
                transition: "all 0.2s",
              }}
            >
              Tracked ({trackedBets.length})
            </button>
            <button
              onClick={() => setActiveTab('removed')}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                background: activeTab === 'removed'
                  ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                  : "rgba(100, 116, 139, 0.2)",
                color: activeTab === 'removed' ? "#fff" : "#94a3b8",
                transition: "all 0.2s",
              }}
            >
              Removed ({Object.keys(removedBets).length})
            </button>
          </div>

          {/* Bookmaker Filter - only show on New Bets tab */}
          {activeTab === 'new' && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            padding: "12px 16px",
            background: "rgba(30, 41, 59, 0.6)",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}>
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>Show EV from:</span>
            {PLAYABLE_BOOKMAKERS.map(bookmaker => (
              <label
                key={bookmaker}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: selectedBookmakers[bookmaker]
                    ? "rgba(34, 197, 94, 0.2)"
                    : "rgba(100, 116, 139, 0.2)",
                  border: `1px solid ${selectedBookmakers[bookmaker]
                    ? "rgba(34, 197, 94, 0.4)"
                    : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.2s",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedBookmakers[bookmaker]}
                  onChange={() => toggleBookmakerFilter(bookmaker)}
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: "#22c55e",
                    cursor: "pointer",
                  }}
                />
                <span style={{
                  color: selectedBookmakers[bookmaker] ? "#22c55e" : "#94a3b8",
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  {bookmaker}
                </span>
              </label>
            ))}
          </div>
          )}

          {/* De-vig Method Selector - only show on New Bets tab */}
          {activeTab === 'new' && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            padding: "12px 16px",
            background: "rgba(30, 41, 59, 0.6)",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.08)",
            flexWrap: "wrap",
          }}>
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>De-vig Method:</span>
            {Object.values(DEVIG_METHODS).map(method => (
              <label
                key={method.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: devigMethod === method.id
                    ? "rgba(168, 85, 247, 0.2)"
                    : "rgba(100, 116, 139, 0.2)",
                  border: `1px solid ${devigMethod === method.id
                    ? "rgba(168, 85, 247, 0.4)"
                    : "rgba(100, 116, 139, 0.3)"}`,
                  transition: "all 0.2s",
                }}
                title={method.description}
              >
                <input
                  type="radio"
                  name="devigMethod"
                  checked={devigMethod === method.id}
                  onChange={() => setDevigMethod(method.id)}
                  style={{
                    width: 14,
                    height: 14,
                    accentColor: "#a855f7",
                    cursor: "pointer",
                  }}
                />
                <span style={{
                  color: devigMethod === method.id ? "#a855f7" : "#94a3b8",
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  {method.name}
                </span>
              </label>
            ))}
            <span style={{ color: "#64748b", fontSize: 11, marginLeft: "auto" }}>
              Hover for description
            </span>
          </div>
          )}

          {/* ========== TIPS GUIDE - Collapsible ========== */}
          {activeTab === 'new' && (
          <div style={{
            marginBottom: 20,
            background: "rgba(30, 41, 59, 0.6)",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.08)",
            overflow: "hidden",
          }}>
            <button
              onClick={() => setShowTips(!showTips)}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ color: "#fbbf24", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                📖 Betting Guide & Tips
              </span>
              <span style={{ color: "#64748b", fontSize: 18 }}>
                {showTips ? '▲' : '▼'}
              </span>
            </button>

            {showTips && (
              <div style={{ padding: "0 16px 16px 16px" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 12,
                }}>
                  {/* EV% */}
                  <div style={{ background: "rgba(34, 197, 94, 0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                    <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>📈 EV% (Expected Value)</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      Your mathematical edge over the bookmaker. <b style={{color:"#e2e8f0"}}>3-5%</b> = decent, <b style={{color:"#e2e8f0"}}>5-8%</b> = good, <b style={{color:"#e2e8f0"}}>8%+</b> = excellent.
                      Higher EV = more profit long-term. Always bet the highest EV opportunities first.
                    </div>
                  </div>

                  {/* Hit Rate */}
                  <div style={{ background: "rgba(59, 130, 246, 0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                    <div style={{ color: "#3b82f6", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🎯 Hit Rate</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      How often the player went OVER/UNDER this line in recent games. <b style={{color:"#e2e8f0"}}>60%+</b> aligns well with your bet.
                      <b style={{color:"#e2e8f0"}}> 50%</b> is neutral. Below 50% means history suggests the opposite outcome.
                    </div>
                  </div>

                  {/* Confidence Grade */}
                  <div style={{ background: "rgba(168, 85, 247, 0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(168, 85, 247, 0.2)" }}>
                    <div style={{ color: "#a855f7", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⭐ Confidence Grade (A+ to D)</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      Combines EV%, hit rate & B2B status. <b style={{color:"#e2e8f0"}}>A+/A</b> = high confidence, bet more.
                      <b style={{color:"#e2e8f0"}}> B+/B</b> = solid bet. <b style={{color:"#e2e8f0"}}>C</b> = proceed with caution. <b style={{color:"#e2e8f0"}}>D</b> = risky, consider skipping.
                    </div>
                  </div>

                  {/* Unit Size */}
                  <div style={{ background: "rgba(249, 115, 22, 0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(249, 115, 22, 0.2)" }}>
                    <div style={{ color: "#f97316", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>💰 Unit Size</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      Recommended bet size based on odds. Lower odds (safer) = bet more. Higher odds (riskier) = bet less.
                      <b style={{color:"#e2e8f0"}}> ≤2.00</b> → 1u, <b style={{color:"#e2e8f0"}}>≤2.75</b> → 0.75u, <b style={{color:"#e2e8f0"}}>≤4.00</b> → 0.5u, <b style={{color:"#e2e8f0"}}>≤7.00</b> → 0.25u, <b style={{color:"#e2e8f0"}}>7.00+</b> → 0.1u
                    </div>
                  </div>

                  {/* Home/Away Splits */}
                  <div style={{ background: "rgba(14, 165, 233, 0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(14, 165, 233, 0.2)" }}>
                    <div style={{ color: "#0ea5e9", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🏠 Home/Away Splits</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      Performance at home vs on the road. Some players perform <b style={{color:"#e2e8f0"}}>significantly better at home</b> (crowd energy, familiarity).
                      Check if today's game location matches their stronger split.
                    </div>
                  </div>

                  {/* Recent Form */}
                  <div style={{ background: "rgba(234, 179, 8, 0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(234, 179, 8, 0.2)" }}>
                    <div style={{ color: "#eab308", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🔥 Recent Form (L5)</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      Last 5 games vs overall. <b style={{color:"#22c55e"}}>🔥 Hot</b> = performing above average recently, good for OVER.
                      <b style={{color:"#ef4444"}}> ❄️ Cold</b> = struggling lately, might favor UNDER. Trends matter!
                    </div>
                  </div>

                  {/* B2B / Played Yesterday */}
                  <div style={{ background: "rgba(239, 68, 68, 0.1)", padding: 12, borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                    <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⚠️ Played Yesterday (B2B)</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      Back-to-back games = tired players. <b style={{color:"#e2e8f0"}}>UNDER bets are better</b> on B2B nights - fatigue reduces scoring.
                      Stars often rest or play fewer minutes. Be cautious with OVER bets!
                    </div>
                  </div>

                  {/* Market Types */}
                  <div style={{ background: "rgba(100, 116, 139, 0.15)", padding: 12, borderRadius: 8, border: "1px solid rgba(100, 116, 139, 0.3)" }}>
                    <div style={{ color: "#94a3b8", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>📊 Market Types</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>
                      <b style={{color:"#e2e8f0"}}>Points</b> = most liquid, easiest to predict.
                      <b style={{color:"#e2e8f0"}}> Combos</b> (Pts+Reb+Ast) = higher variance but often better value.
                      <b style={{color:"#e2e8f0"}}> 3PT</b> = volatile, shooters have hot/cold streaks.
                    </div>
                  </div>
                </div>

                {/* Quick Tips */}
                <div style={{ marginTop: 12, padding: 12, background: "rgba(34, 197, 94, 0.08)", borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.15)" }}>
                  <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>💡 Quick Decision Guide:</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                    <div>✅ <b style={{color:"#22c55e"}}>Bet confidently:</b> A+/A grade + 8%+ EV + 60%+ hit rate</div>
                    <div>⚠️ <b style={{color:"#fbbf24"}}>Proceed carefully:</b> B grade OR hit rate 40-60%</div>
                    <div>❌ <b style={{color:"#ef4444"}}>Skip or reduce:</b> C/D grade + low hit rate + B2B OVER</div>
                    <div>🎯 <b style={{color:"#3b82f6"}}>Best value:</b> High EV + Hot form + favorable split</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Minimum EV% Slider - only show on New Bets tab */}
          {activeTab === 'new' && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            padding: "12px 16px",
            background: "rgba(30, 41, 59, 0.6)",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}>
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, minWidth: 100 }}>
              Min EV%:
            </span>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={minEVFilter}
              onChange={(e) => setMinEVFilter(parseFloat(e.target.value))}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                appearance: "none",
                background: `linear-gradient(to right, #22c55e 0%, #22c55e ${(minEVFilter / 20) * 100}%, rgba(100, 116, 139, 0.3) ${(minEVFilter / 20) * 100}%, rgba(100, 116, 139, 0.3) 100%)`,
                cursor: "pointer",
              }}
            />
            <span style={{
              color: "#22c55e",
              fontSize: 16,
              fontWeight: 700,
              minWidth: 50,
              textAlign: "right",
            }}>
              {minEVFilter}%
            </span>
          </div>
          )}

          {/* Market Type Filter + Sort */}
          {activeTab === 'new' && (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
            padding: "12px 16px",
            background: "rgba(30, 41, 59, 0.6)",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}>
            {/* Market Filter Pills */}
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginRight: 4 }}>
              Markets:
            </span>
            {Object.keys(selectedMarkets).map(market => (
              <button
                key={market}
                onClick={() => setSelectedMarkets(prev => ({ ...prev, [market]: !prev[market] }))}
                style={{
                  padding: "5px 12px",
                  borderRadius: 20,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: selectedMarkets[market] ? "rgba(34, 197, 94, 0.25)" : "rgba(100, 116, 139, 0.2)",
                  color: selectedMarkets[market] ? "#22c55e" : "#64748b",
                }}
              >
                {market}
              </button>
            ))}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Sort Dropdown */}
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
              Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(30, 41, 59, 0.8)",
                color: "#e2e8f0",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <option value="ev">Highest EV%</option>
              <option value="confidence">Best Confidence</option>
            </select>
          </div>
          )}

          {/* ========== NEW BETS TAB ========== */}
          {activeTab === 'new' && (
          <div>
          <h2 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 700 }}>
            NBA Matches ({matches.length})
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {matches.map((match) => {
              const data = computedMatchData[match.id] || {};
              // Filter from allLines: exclude tracked bets, removed bets, apply filters
              const allLines = data.allLines || [];
              const opportunities = allLines.filter(opp =>
                opp.evPercent >= minEVFilter &&
                !isBetRemoved(opp) &&
                !isPlayerTracked(opp) &&  // Exclude ALL bets for players who have any tracked bet
                selectedBookmakers[opp.bookmaker] &&
                marketPassesFilter(opp.market)
              ).sort((a, b) => {
                if (sortBy === 'confidence') {
                  // Sort by confidence score (need to calculate)
                  const betKeyA = `${a.player}_${a.market}_${a.line}`;
                  const betKeyB = `${b.player}_${b.market}_${b.line}`;
                  const confA = calculateConfidence(a, hitRates[betKeyA], isMatchB2B(match), a.betType);
                  const confB = calculateConfidence(b, hitRates[betKeyB], isMatchB2B(match), b.betType);
                  return confB.score - confA.score;
                }
                // Default: sort by EV%
                return b.evPercent - a.evPercent;
              });
              const isAnalyzed = data.analyzed;
              const hasEV = opportunities.length > 0;

              return (
                <div
                  key={match.id}
                  style={{
                    background: hasEV ? "rgba(34, 197, 94, 0.08)" : "rgba(30, 41, 59, 0.6)",
                    borderRadius: 16,
                    padding: 20,
                    border: hasEV
                      ? "1px solid rgba(34, 197, 94, 0.3)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  {/* Match Header */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 16,
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <span style={{
                          background: "rgba(249, 115, 22, 0.2)",
                          color: "#f97316",
                          padding: "4px 10px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                        }}>
                          NBA
                        </span>
                        {match.isLive && (
                          <span style={{
                            background: "rgba(239, 68, 68, 0.3)",
                            color: "#ef4444",
                            padding: "4px 10px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            animation: "pulse 2s infinite",
                          }}>
                            LIVE
                          </span>
                        )}
                        <span style={{ color: "#64748b", fontSize: 12 }}>
                          {formatDate(match.date)}
                        </span>
                        {!match.isLive && (
                          <span style={{ color: "#64748b", fontSize: 12 }}>
                            Starts in <span style={{ color: "#f97316", fontWeight: 600 }}>{getTimeUntil(match.date)}</span>
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {match.home} <span style={{ color: "#64748b" }}>vs</span> {match.away}
                        {/* Played Yesterday Warning Badge */}
                        {isMatchB2B(match) && (
                          <span
                            title="⚠️ Back-to-back game! Players are tired. UNDER bets are safer - fatigue reduces scoring. Be careful with OVER bets."
                            style={{
                              background: "rgba(239, 68, 68, 0.25)",
                              color: "#ef4444",
                              padding: "4px 10px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "help",
                            }}
                          >
                            Played yesterday: {getB2BTeams(match).join(', ')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                        Event ID: <span style={{ color: "#a5b4fc", fontFamily: "monospace" }}>{match.id}</span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div>
                      {isAnalyzed ? (
                        hasEV ? (
                          <span style={{
                            background: "rgba(34, 197, 94, 0.2)",
                            color: "#22c55e",
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 700,
                          }}>
                            {opportunities.length} +EV Bet{opportunities.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{
                            background: "rgba(100, 116, 139, 0.2)",
                            color: "#94a3b8",
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                          }}>
                            No +EV ({allLines.length} lines)
                          </span>
                        )
                      ) : (
                        <span style={{
                          background: "rgba(249, 115, 22, 0.2)",
                          color: "#f97316",
                          padding: "6px 12px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                        }}>
                          Pending...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* EV Opportunities */}
                  {isAnalyzed && opportunities.length > 0 && (
                    <div style={{
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", marginBottom: 12 }}>
                        +EV Opportunities ({minEVFilter}%+ edge)
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {opportunities.map((ev, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: "16px 20px",
                              background: ev.evPercent >= 8 ? "rgba(34, 197, 94, 0.15)" : "rgba(34, 197, 94, 0.08)",
                              borderRadius: 12,
                              border: `1px solid ${ev.evPercent >= 8 ? "rgba(34, 197, 94, 0.3)" : "rgba(34, 197, 94, 0.15)"}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 15 }}>{ev.player}</span>
                                <span style={{
                                  background: "rgba(100, 116, 139, 0.3)",
                                  color: "#e2e8f0",
                                  padding: "3px 8px",
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}>
                                  {ev.market}
                                </span>
                                <span
                                  title={ev.betType === 'OVER'
                                    ? `OVER ${ev.line} = Bet that player scores MORE than ${ev.line}`
                                    : `UNDER ${ev.line} = Bet that player scores LESS than ${ev.line}`}
                                  style={{
                                    background: ev.betType === 'OVER' ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                                    color: ev.betType === 'OVER' ? "#22c55e" : "#ef4444",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "help",
                                  }}
                                >
                                  {ev.betType} {ev.line}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div
                                  title={`EV% = Your edge. ${ev.evPercent >= 8 ? 'Excellent opportunity!' : ev.evPercent >= 5 ? 'Good value bet' : 'Decent edge'}`}
                                  style={{
                                    fontSize: 18,
                                    fontWeight: 900,
                                    color: ev.evPercent >= 8 ? "#22c55e" : "#4ade80",
                                    cursor: "help",
                                  }}
                                >
                                  +{ev.evPercent.toFixed(1)}%
                                </div>
                                {/* Confidence Score Badge with Tooltip */}
                                {(() => {
                                  const betKey = `${ev.player}_${ev.market}_${ev.line}`;
                                  const hitRateData = hitRates[betKey];
                                  const confidence = calculateConfidence(ev, hitRateData, isMatchB2B(match), ev.betType);
                                  const gradeColors = {
                                    'A+': { bg: 'rgba(34, 197, 94, 0.3)', color: '#22c55e', label: 'Excellent' },
                                    'A': { bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', label: 'Very Good' },
                                    'B+': { bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', label: 'Good' },
                                    'B': { bg: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', label: 'Above Avg' },
                                    'C+': { bg: 'rgba(249, 115, 22, 0.2)', color: '#fb923c', label: 'Average' },
                                    'C': { bg: 'rgba(249, 115, 22, 0.15)', color: '#fdba74', label: 'Below Avg' },
                                    'D': { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', label: 'Poor' },
                                  };
                                  const style = gradeColors[confidence.grade] || gradeColors['C'];
                                  return (
                                    <span
                                      className="confidence-badge"
                                      style={{
                                        background: style.bg,
                                        color: style.color,
                                        padding: "4px 8px",
                                        borderRadius: 6,
                                        fontSize: 12,
                                        fontWeight: 800,
                                        position: 'relative',
                                        cursor: 'help',
                                      }}
                                    >
                                      {confidence.grade}
                                      <div className="confidence-tooltip" style={{
                                        position: 'absolute',
                                        bottom: '100%',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        marginBottom: 8,
                                        padding: '10px 14px',
                                        background: 'rgba(15, 23, 42, 0.98)',
                                        border: '1px solid rgba(100, 116, 139, 0.3)',
                                        borderRadius: 8,
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                                        whiteSpace: 'nowrap',
                                        zIndex: 1000,
                                        opacity: 0,
                                        visibility: 'hidden',
                                        transition: 'opacity 0.15s, visibility 0.15s',
                                        pointerEvents: 'none',
                                      }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: style.color, marginBottom: 6 }}>
                                          {confidence.grade} - {style.label} (Score: {confidence.score})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                          {confidence.factors.map((factor, i) => (
                                            <div key={i} style={{
                                              fontSize: 10,
                                              color: factor.includes('boost') || factor.includes('70%') || factor.includes('60%') || factor.includes('15%') || factor.includes('10%')
                                                ? '#4ade80'
                                                : factor.includes('risk') || factor.includes('Low')
                                                ? '#f87171'
                                                : '#94a3b8',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 4,
                                            }}>
                                              <span>{factor.includes('boost') || factor.includes('70%') || factor.includes('60%') ? '+' : factor.includes('risk') || factor.includes('Low') ? '-' : '•'}</span>
                                              {factor}
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{
                                          position: 'absolute',
                                          bottom: -6,
                                          left: '50%',
                                          transform: 'translateX(-50%)',
                                          width: 0,
                                          height: 0,
                                          borderLeft: '6px solid transparent',
                                          borderRight: '6px solid transparent',
                                          borderTop: '6px solid rgba(15, 23, 42, 0.98)',
                                        }} />
                                      </div>
                                    </span>
                                  );
                                })()}
                                {/* Played yesterday indicator on bet */}
                                {isMatchB2B(match) && (
                                  <span
                                    title={ev.betType === 'UNDER'
                                      ? "✅ FATIGUE EDGE: Team played yesterday. Tired players = lower stats. UNDER bet is boosted!"
                                      : "⚠️ FATIGUE RISK: Team played yesterday. Tired players = lower stats. OVER bet is riskier!"}
                                    style={{
                                      background: ev.betType === 'UNDER' ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                                      color: ev.betType === 'UNDER' ? "#22c55e" : "#ef4444",
                                      padding: "3px 8px",
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: "help",
                                    }}
                                  >
                                    {ev.betType === 'UNDER' ? 'FATIGUE EDGE' : 'FATIGUE RISK'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
                              <div style={{ fontSize: 13 }}>
                                <span style={{ color: "#64748b" }}>Bet: </span>
                                <span title="Odds offered by bookmaker. Lower = safer, higher = riskier" style={{ color: "#22c55e", fontWeight: 700, cursor: "help" }}>{ev.odds.toFixed(2)}</span>
                                <span style={{ color: "#94a3b8" }}> @ {ev.bookmaker}</span>
                                <span style={{ color: "#64748b", marginLeft: 12 }}>Fair: </span>
                                <span title="True odds based on sharp market. Your odds should be higher than this for +EV" style={{ color: "#a5b4fc", fontWeight: 600, cursor: "help" }}>{ev.fairOdds?.toFixed(2)}</span>
                                <span style={{ color: "#64748b", marginLeft: 12 }}>Units: </span>
                                <span title="Recommended bet size. Lower odds = bet more, higher odds = bet less" style={{ color: "#f97316", fontWeight: 600, cursor: "help" }}>{getDefaultUnits(ev.odds).toFixed(2)}</span>
                              </div>
                              {ev.updatedAt && (
                                <span style={{ fontSize: 11, color: "#64748b" }}>
                                  Updated: <span style={{ color: "#22c55e" }}>{formatTimeCET(ev.updatedAt)} CET</span>
                                </span>
                              )}
                            </div>

                            {/* Playable bookmaker odds */}
                            {ev.playableOdds && ev.playableOdds.length > 0 && (
                              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#64748b", marginRight: 6, fontWeight: 500 }}>Playable:</span>
                                {ev.playableOdds.map((o, i) => (
                                  <span
                                    key={i}
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 6,
                                      fontSize: 12,
                                      background: o.bookmaker === ev.bookmaker
                                        ? "rgba(34, 197, 94, 0.3)"
                                        : "rgba(59, 130, 246, 0.2)",
                                      color: o.bookmaker === ev.bookmaker ? "#22c55e" : "#60a5fa",
                                      fontWeight: o.bookmaker === ev.bookmaker ? 700 : 500,
                                    }}
                                  >
                                    {o.bookmaker}: {o.odds?.toFixed(2)}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Sharp book odds - shows all bookmakers contributing to average */}
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#64748b", marginRight: 6, fontWeight: 500 }}>
                                Average ({ev.allOdds.length} books):
                              </span>
                              {ev.allOdds.map((o, i) => (
                                <span
                                  key={i}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    background: "rgba(100, 116, 139, 0.2)",
                                    color: "#94a3b8",
                                  }}
                                  title={`Vig: ${o.vig?.toFixed(1)}%`}
                                >
                                  {o.bookmaker}: {o.odds?.toFixed(2)}
                                </span>
                              ))}
                            </div>

                            {/* Hit Rate Section - for 8%+ EV bets (auto-fetched) */}
                            {ev.evPercent >= 8 && (() => {
                              const betKey = `${ev.player}_${ev.market}_${ev.line}`;
                              const hitRate = hitRates[betKey];
                              const statType = MARKET_TO_STAT[ev.market];

                              return (
                                <div style={{
                                  marginTop: 12,
                                  padding: "12px 14px",
                                  background: "rgba(59, 130, 246, 0.1)",
                                  borderRadius: 8,
                                  border: "1px solid rgba(59, 130, 246, 0.2)",
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                    <span style={{ fontSize: 12, color: "#60a5fa", fontWeight: 600 }}>
                                      Historical Hit Rate (Last 15 games)
                                    </span>
                                    {!hitRate && statType && (
                                      <button
                                        onClick={() => fetchHitRate(ev)}
                                        style={{
                                          padding: "4px 12px",
                                          borderRadius: 6,
                                          border: "1px solid rgba(59, 130, 246, 0.5)",
                                          background: "rgba(59, 130, 246, 0.2)",
                                          color: "#60a5fa",
                                          fontSize: 11,
                                          fontWeight: 600,
                                          cursor: "pointer",
                                        }}
                                      >
                                        Load Stats
                                      </button>
                                    )}
                                  </div>

                                  {hitRate?.loading && (
                                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                                      Loading player stats...
                                    </div>
                                  )}

                                  {hitRate?.error && (
                                    <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>
                                      {hitRate.error}
                                    </div>
                                  )}

                                  {hitRate?.data && (
                                    <div style={{ marginTop: 10 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                        <div style={{
                                          padding: "8px 14px",
                                          borderRadius: 8,
                                          background: ev.betType === 'OVER'
                                            ? (hitRate.data.hitRate.over >= 0.5 ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)")
                                            : (hitRate.data.hitRate.under >= 0.5 ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"),
                                          border: `1px solid ${ev.betType === 'OVER'
                                            ? (hitRate.data.hitRate.over >= 0.5 ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)")
                                            : (hitRate.data.hitRate.under >= 0.5 ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)")}`,
                                        }}>
                                          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                                            {ev.betType} {ev.line}
                                          </div>
                                          <div style={{
                                            fontSize: 18,
                                            fontWeight: 800,
                                            color: ev.betType === 'OVER'
                                              ? (hitRate.data.hitRate.over >= 0.5 ? "#22c55e" : "#ef4444")
                                              : (hitRate.data.hitRate.under >= 0.5 ? "#22c55e" : "#ef4444"),
                                          }}>
                                            {ev.betType === 'OVER' ? hitRate.data.results.over : hitRate.data.results.under}/{hitRate.data.gamesAnalyzed}
                                            <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                                              ({ev.betType === 'OVER' ? hitRate.data.hitRate.overPct : hitRate.data.hitRate.underPct})
                                            </span>
                                          </div>
                                        </div>

                                        <div title={`Player's average in last ${hitRate.data.gamesAnalyzed} games. Compare to line: ${parseFloat(hitRate.data.average) > ev.line ? 'Above line = favors OVER' : parseFloat(hitRate.data.average) < ev.line ? 'Below line = favors UNDER' : 'Right at line = 50/50'}`} style={{ cursor: "help" }}>
                                          <div style={{ fontSize: 11, color: "#64748b" }}>Average</div>
                                          <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>
                                            {hitRate.data.average}
                                          </div>
                                        </div>

                                        <div title="The betting line. You're betting player goes OVER or UNDER this number" style={{ cursor: "help" }}>
                                          <div style={{ fontSize: 11, color: "#64748b" }}>Line</div>
                                          <div style={{ fontSize: 16, fontWeight: 700, color: "#a5b4fc" }}>
                                            {ev.line}
                                          </div>
                                        </div>

                                        <div title="If bookmaker offered odds based purely on historical hit rate, this is what they'd be. Compare to actual odds - if actual odds are higher, that's good value!" style={{ cursor: "help" }}>
                                          <div style={{ fontSize: 11, color: "#64748b" }}>Hit Rate Odds</div>
                                          <div style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>
                                            {(() => {
                                              const rate = ev.betType === 'OVER' ? hitRate.data.hitRate.over : hitRate.data.hitRate.under;
                                              return rate > 0 ? (1 / rate).toFixed(2) : '-';
                                            })()}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Home/Away Splits + Recent Form */}
                                      {hitRate.data.splits && hitRate.data.recentForm && (
                                        <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                                          {/* Home Split */}
                                          <div
                                            title="Hit rate in HOME games. Players often perform better at home (crowd energy, familiarity)"
                                            style={{
                                              padding: "4px 10px",
                                              borderRadius: 6,
                                              background: "rgba(59, 130, 246, 0.15)",
                                              border: "1px solid rgba(59, 130, 246, 0.3)",
                                              cursor: "help",
                                            }}
                                          >
                                            <span style={{ fontSize: 10, color: "#93c5fd" }}>Home: </span>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6" }}>
                                              {hitRate.data.splits.home.hitRatePct}
                                            </span>
                                            <span style={{ fontSize: 10, color: "#64748b", marginLeft: 4 }}>
                                              ({hitRate.data.splits.home.games}g)
                                            </span>
                                          </div>

                                          {/* Away Split */}
                                          <div
                                            title="Hit rate in AWAY games. Road games can be tougher (travel fatigue, hostile crowd)"
                                            style={{
                                              padding: "4px 10px",
                                              borderRadius: 6,
                                              background: "rgba(168, 85, 247, 0.15)",
                                              border: "1px solid rgba(168, 85, 247, 0.3)",
                                              cursor: "help",
                                            }}
                                          >
                                            <span style={{ fontSize: 10, color: "#d8b4fe" }}>Away: </span>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: "#a855f7" }}>
                                              {hitRate.data.splits.away.hitRatePct}
                                            </span>
                                            <span style={{ fontSize: 10, color: "#64748b", marginLeft: 4 }}>
                                              ({hitRate.data.splits.away.games}g)
                                            </span>
                                          </div>

                                          {/* Recent Form / Trend */}
                                          <div
                                            title={`Last 5 games trend. ${hitRate.data.recentForm.trend === 'hot' ? '🔥 HOT = performing above average, good for OVER' : hitRate.data.recentForm.trend === 'cold' ? '❄️ COLD = struggling lately, might favor UNDER' : 'STABLE = consistent with season average'}`}
                                            style={{
                                              padding: "4px 10px",
                                              borderRadius: 6,
                                              cursor: "help",
                                              background: hitRate.data.recentForm.trend === 'hot'
                                                ? "rgba(34, 197, 94, 0.15)"
                                                : hitRate.data.recentForm.trend === 'cold'
                                                ? "rgba(239, 68, 68, 0.15)"
                                                : "rgba(100, 116, 139, 0.15)",
                                              border: `1px solid ${
                                                hitRate.data.recentForm.trend === 'hot'
                                                  ? "rgba(34, 197, 94, 0.3)"
                                                  : hitRate.data.recentForm.trend === 'cold'
                                                  ? "rgba(239, 68, 68, 0.3)"
                                                  : "rgba(100, 116, 139, 0.3)"
                                              }`,
                                            }}
                                          >
                                            <span style={{ fontSize: 10, color: "#94a3b8" }}>L5: </span>
                                            <span style={{
                                              fontSize: 12,
                                              fontWeight: 700,
                                              color: hitRate.data.recentForm.trend === 'hot'
                                                ? "#22c55e"
                                                : hitRate.data.recentForm.trend === 'cold'
                                                ? "#ef4444"
                                                : "#94a3b8",
                                            }}>
                                              {hitRate.data.recentForm.last5.hitRatePct}
                                            </span>
                                            {hitRate.data.recentForm.trend !== 'stable' && (
                                              <span style={{
                                                fontSize: 10,
                                                marginLeft: 4,
                                                color: hitRate.data.recentForm.trend === 'hot' ? "#22c55e" : "#ef4444",
                                              }}>
                                                {hitRate.data.recentForm.trend === 'hot' ? '🔥' : '❄️'}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* Recent values */}
                                      <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 11, color: "#64748b", marginRight: 4 }}>Recent:</span>
                                        {hitRate.data.values.slice(0, 10).map((v, i) => (
                                          <span
                                            key={i}
                                            style={{
                                              padding: "2px 6px",
                                              borderRadius: 4,
                                              fontSize: 11,
                                              fontWeight: 600,
                                              background: (ev.betType === 'OVER' && v > ev.line) || (ev.betType === 'UNDER' && v < ev.line)
                                                ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.15)",
                                              color: (ev.betType === 'OVER' && v > ev.line) || (ev.betType === 'UNDER' && v < ev.line)
                                                ? "#22c55e" : "#f87171",
                                            }}
                                          >
                                            {v}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {!statType && (
                                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                                      Hit rate not available for {ev.market}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Hit Rate Button - for <8% EV bets (manual load) */}
                            {ev.evPercent < 8 && (() => {
                              const betKey = `${ev.player}_${ev.market}_${ev.line}`;
                              const hitRate = hitRates[betKey];
                              const statType = MARKET_TO_STAT[ev.market];

                              if (!statType) return null;

                              return (
                                <div style={{ marginTop: 8 }}>
                                  {!hitRate && (
                                    <button
                                      onClick={() => fetchHitRate(ev)}
                                      style={{
                                        padding: "6px 12px",
                                        borderRadius: 6,
                                        border: "1px solid rgba(100, 116, 139, 0.4)",
                                        background: "rgba(100, 116, 139, 0.15)",
                                        color: "#94a3b8",
                                        fontSize: 11,
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                      }}
                                    >
                                      <span style={{ fontSize: 13 }}>📊</span> Load Hit Rate
                                    </button>
                                  )}
                                  {hitRate?.loading && (
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Loading...</span>
                                  )}
                                  {hitRate?.error && (
                                    <span style={{ fontSize: 11, color: "#f87171" }}>{hitRate.error}</span>
                                  )}
                                  {hitRate?.data && (
                                    <div style={{
                                      padding: "8px 12px",
                                      background: "rgba(59, 130, 246, 0.1)",
                                      borderRadius: 6,
                                      border: "1px solid rgba(59, 130, 246, 0.2)",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
                                      flexWrap: "wrap",
                                    }}>
                                      <span style={{ fontSize: 11, color: "#60a5fa" }}>
                                        Hit Rate ({hitRate.data.gamesAnalyzed}g):
                                      </span>
                                      <span style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: ev.betType === 'OVER'
                                          ? (hitRate.data.hitRate.over >= 0.5 ? "#22c55e" : "#ef4444")
                                          : (hitRate.data.hitRate.under >= 0.5 ? "#22c55e" : "#ef4444"),
                                      }}>
                                        {ev.betType === 'OVER' ? hitRate.data.hitRate.overPct : hitRate.data.hitRate.underPct}
                                      </span>
                                      <span style={{ fontSize: 11, color: "#64748b" }}>
                                        Avg: {hitRate.data.average}
                                      </span>
                                      <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
                                        Odds: {(() => {
                                          const rate = ev.betType === 'OVER' ? hitRate.data.hitRate.over : hitRate.data.hitRate.under;
                                          return rate > 0 ? (1 / rate).toFixed(2) : '-';
                                        })()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Track and Remove buttons */}
                            <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
                              {trackingBetId === generateBetId(ev) ? (
                                // Inline odds + units input form
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ color: "#94a3b8", fontSize: 12 }}>Odds:</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={customOdds}
                                    onChange={(e) => {
                                      setCustomOdds(e.target.value);
                                      // Auto-update units when odds change
                                      const newOdds = parseFloat(e.target.value);
                                      if (!isNaN(newOdds)) {
                                        setCustomUnits(getDefaultUnits(newOdds).toFixed(2));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') confirmTrackBet(ev, match);
                                      if (e.key === 'Escape') cancelTracking();
                                    }}
                                    autoFocus
                                    style={{
                                      width: 65,
                                      padding: "6px 10px",
                                      borderRadius: 6,
                                      border: "1px solid rgba(59, 130, 246, 0.5)",
                                      background: "rgba(30, 41, 59, 0.8)",
                                      color: "#e2e8f0",
                                      fontSize: 13,
                                      fontWeight: 600,
                                      textAlign: "center",
                                    }}
                                  />
                                  <span style={{ color: "#94a3b8", fontSize: 12 }}>Units:</span>
                                  <input
                                    type="number"
                                    step="0.05"
                                    min="0.05"
                                    max="5"
                                    value={customUnits}
                                    onChange={(e) => setCustomUnits(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') confirmTrackBet(ev, match);
                                      if (e.key === 'Escape') cancelTracking();
                                    }}
                                    style={{
                                      width: 55,
                                      padding: "6px 10px",
                                      borderRadius: 6,
                                      border: "1px solid rgba(249, 115, 22, 0.5)",
                                      background: "rgba(30, 41, 59, 0.8)",
                                      color: "#f97316",
                                      fontSize: 13,
                                      fontWeight: 600,
                                      textAlign: "center",
                                    }}
                                  />
                                  <button
                                    onClick={() => confirmTrackBet(ev, match)}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 6,
                                      border: "1px solid rgba(34, 197, 94, 0.5)",
                                      background: "rgba(34, 197, 94, 0.2)",
                                      color: "#22c55e",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={cancelTracking}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 6,
                                      border: "1px solid rgba(100, 116, 139, 0.5)",
                                      background: "rgba(100, 116, 139, 0.15)",
                                      color: "#94a3b8",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  {customOdds && parseFloat(customOdds) !== ev.odds && (
                                    <span style={{ fontSize: 11, color: "#f97316" }}>
                                      EV: {((ev.fairProb * parseFloat(customOdds) - 1) * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              ) : (
                                // Normal buttons
                                <div style={{ display: "flex", gap: 8 }}>
                                  {isBetTracked(ev) ? (
                                    <button
                                      onClick={() => untrackBet(generateBetId(ev))}
                                      style={{
                                        padding: "6px 14px",
                                        borderRadius: 6,
                                        border: "1px solid rgba(34, 197, 94, 0.5)",
                                        background: "rgba(34, 197, 94, 0.2)",
                                        color: "#22c55e",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      Tracked
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => startTracking(ev)}
                                      style={{
                                        padding: "6px 14px",
                                        borderRadius: 6,
                                        border: "1px solid rgba(59, 130, 246, 0.5)",
                                        background: "rgba(59, 130, 246, 0.15)",
                                        color: "#60a5fa",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Track
                                    </button>
                                  )}
                                  <button
                                    onClick={() => removeBet(ev)}
                                    style={{
                                      padding: "6px 14px",
                                      borderRadius: 6,
                                      border: "1px solid rgba(239, 68, 68, 0.5)",
                                      background: "rgba(239, 68, 68, 0.15)",
                                      color: "#f87171",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All playable lines (show even without +EV) */}
                  {isAnalyzed && allLines.length > 0 && (
                    <div style={{
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    }}>
                      <details>
                        <summary style={{
                          cursor: "pointer",
                          fontSize: 13,
                          color: "#94a3b8",
                          marginBottom: 8,
                          userSelect: "none",
                        }}>
                          View all {allLines.length} playable lines (including non +EV)
                        </summary>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                          gap: 8,
                          marginTop: 12,
                          maxHeight: 400,
                          overflowY: "auto",
                        }}>
                          {allLines.map((line, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: "8px 12px",
                                background: line.evPercent >= minEVFilter
                                  ? "rgba(34, 197, 94, 0.1)"
                                  : line.evPercent >= 0
                                    ? "rgba(249, 115, 22, 0.05)"
                                    : "rgba(100, 116, 139, 0.1)",
                                borderRadius: 8,
                                border: `1px solid ${line.evPercent >= minEVFilter
                                  ? "rgba(34, 197, 94, 0.2)"
                                  : "rgba(100, 116, 139, 0.15)"}`,
                                fontSize: 12,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{line.player}</span>
                                <span style={{
                                  fontWeight: 700,
                                  color: line.evPercent >= minEVFilter ? "#22c55e"
                                    : line.evPercent >= 0 ? "#f97316" : "#ef4444",
                                }}>
                                  {line.evPercent >= 0 ? '+' : ''}{line.evPercent.toFixed(1)}%
                                </span>
                              </div>
                              <div style={{ color: "#94a3b8", marginTop: 4 }}>
                                {line.market} {line.betType} {line.line} @ {line.odds.toFixed(2)} ({line.bookmaker})
                              </div>
                              <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                                Fair: {line.fairOdds?.toFixed(2)} | Sharp avg: {(line.fairProb * 100).toFixed(1)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}

                  {/* Analyzing indicator */}
                  {!isAnalyzed && (
                    <div style={{
                      marginTop: 12,
                      padding: 12,
                      background: "rgba(249, 115, 22, 0.1)",
                      borderRadius: 8,
                      color: "#f97316",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border: "2px solid rgba(249, 115, 22, 0.3)",
                        borderTopColor: "#f97316",
                        animation: "spin 1s linear infinite",
                      }} />
                      Waiting to analyze...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
          )}


          {/* ========== TRACKED BETS TAB ========== */}
          {activeTab === 'tracked' && (
          <div>
            <h2 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 700 }}>
              Tracked Bets ({trackedBets.length})
            </h2>

            {trackedBets.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: 60,
                color: "#64748b",
                background: "rgba(30, 41, 59, 0.6)",
                borderRadius: 16,
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <p>No tracked bets yet</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Track bets from the New Bets tab to see them here</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {trackedBets.map((bet) => (
                  <div
                    key={bet.id}
                    style={{
                      background: "rgba(59, 130, 246, 0.08)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#e2e8f0", marginBottom: 4 }}>
                          {bet.player}
                        </div>
                        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>
                          {bet.market} {bet.betType} {bet.line} @ <span style={{ color: "#60a5fa" }}>{bet.bookmaker}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {bet.matchName}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: bet.actualEV >= 5 ? "#22c55e" : bet.actualEV >= 3 ? "#84cc16" : "#eab308",
                        }}>
                          +{bet.actualEV.toFixed(1)}% EV
                        </div>
                        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                          Odds: <span style={{ color: "#60a5fa", fontWeight: 600 }}>{bet.actualOdds.toFixed(2)}</span>
                          {bet.actualOdds !== bet.displayedOdds && (
                            <span style={{ color: "#64748b", fontSize: 11 }}> (was {bet.displayedOdds.toFixed(2)})</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                          Fair: {bet.fairOdds.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        Tracked: {new Date(bet.trackedAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => untrackBet(bet.id)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 6,
                          border: "1px solid rgba(239, 68, 68, 0.5)",
                          background: "rgba(239, 68, 68, 0.15)",
                          color: "#f87171",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Untrack
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* ========== REMOVED BETS TAB ========== */}
          {activeTab === 'removed' && (
          <div>
            <h2 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 700 }}>
              Removed Bets ({Object.keys(removedBets).length})
            </h2>

            {Object.keys(removedBets).length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: 60,
                color: "#64748b",
                background: "rgba(30, 41, 59, 0.6)",
                borderRadius: 16,
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🗑️</div>
                <p>No removed bets</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Bets you remove will appear here</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Object.entries(removedBets).map(([betId, data]) => {
                  // Parse bet ID: player|market|line|betType|bookmaker
                  const parts = betId.split('|');
                  const [player, market, line, betType, bookmaker] = parts;

                  return (
                    <div
                      key={betId}
                      style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#e2e8f0", marginBottom: 4, textTransform: "capitalize" }}>
                            {player}
                          </div>
                          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>
                            {market} {betType} {line} @ <span style={{ color: "#f87171" }}>{bookmaker}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, color: "#94a3b8" }}>
                            Removed at odds: <span style={{ color: "#f87171", fontWeight: 600 }}>{data.removedOdds.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          Removed: {new Date(data.removedAt).toLocaleString()}
                        </span>
                        <button
                          onClick={() => {
                            const newRemovedBets = { ...removedBets };
                            delete newRemovedBets[betId];
                            setRemovedBets(newRemovedBets);
                            saveToStorage(REMOVED_BETS_KEY, newRemovedBets);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 6,
                            border: "1px solid rgba(34, 197, 94, 0.5)",
                            background: "rgba(34, 197, 94, 0.15)",
                            color: "#22c55e",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Clear all button */}
                <button
                  onClick={() => {
                    setRemovedBets({});
                    saveToStorage(REMOVED_BETS_KEY, {});
                  }}
                  style={{
                    marginTop: 12,
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: "1px solid rgba(239, 68, 68, 0.5)",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#f87171",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  Clear All Removed
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* No Matches State */}
      {!loading && matches.length === 0 && !error && (
        <div style={{
          textAlign: "center",
          padding: 60,
          color: "#64748b",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏀</div>
          <p>No NBA matches found in the next 24 hours</p>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
