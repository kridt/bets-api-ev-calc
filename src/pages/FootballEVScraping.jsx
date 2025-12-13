// src/pages/FootballEVScraping.jsx
// Football EV Scraping - Fetches football matches and compares player props across bookmakers
// Now with real-time WebSocket updates!
// Updated to use OpticOdds API for odds data

import { useState, useEffect, useMemo, useCallback } from "react";
import footballLeagues from "../config/footballLeagues.json";
import InlinePlayerStats from "../components/InlinePlayerStats";
import { useSocket } from '../hooks/useSocket';
import ConnectionStatus from '../components/ConnectionStatus';
import { BetTracker } from '../services/betTracker';
import { HelpTooltip } from '../components/Tooltip';
import './FootballEV.css';
import {
  americanToDecimal,
  SPORTSBOOK_MAP,
  SPORTSBOOK_DISPLAY,
  SOCCER_LEAGUES,
  getFixtures,
  getFixtureOdds,
} from '../services/opticOddsApi';

// OpticOdds API Configuration - Use Vercel serverless functions
// In production: uses window.location.origin + /api/opticodds
// In development with local server: http://localhost:4000/api/opticodds
const getOpticApiProxy = () => {
  if (import.meta.env.DEV && import.meta.env.VITE_FOOTBALL_API_URL) {
    return `${import.meta.env.VITE_FOOTBALL_API_URL}/api/opticodds`;
  }
  // In production, use current origin for full URL (needed for new URL())
  return typeof window !== 'undefined'
    ? `${window.location.origin}/api/opticodds`
    : '/api/opticodds';
};

// Cache server URL - reduces API calls by serving cached odds
const CACHE_SERVER_URL = import.meta.env.VITE_CACHE_SERVER_URL || 'https://odds-notifyer-server.onrender.com';

// Bookmakers for fetching odds - OpticOdds available bookmakers
// NOTE: bet365 is NOT available on OpticOdds (is_active: false)
// Pinnacle is used as the sharp line for de-vigging
// Verified against OpticOdds /sportsbooks/active endpoint
const ALL_BOOKMAKERS = [
  "Pinnacle",      // Sharp line (used for fair odds calculation)
  "Betano",        // European book - high coverage
  "Unibet DK",     // Danish Unibet
  "DraftKings",    // US book - high coverage
  "FanDuel",       // US book - high coverage
  "BetMGM",        // US book
  "Caesars",       // US book
  "BetRivers",     // US book
  "Superbet",      // European book
  "Betsson",       // European book
  "Betsafe",       // European book
  "888sport",      // European book
  "Betway",        // European book
  "William Hill",  // UK book
  "Fanatics",      // US book
  "Bovada",        // Offshore book
  "BetOnline",     // Offshore book
  "Betfair",       // European exchange
  "bwin",          // European book
];

// OpticOdds sportsbook IDs for API calls
const OPTIC_SPORTSBOOK_IDS = ALL_BOOKMAKERS.map(b => SPORTSBOOK_MAP[b] || b.toLowerCase().replace(/\s+/g, '_'));

// Bookmakers we can bet on (for display in "Show EV from" list)
// NOTE: bet365 removed - not available on OpticOdds
const PLAYABLE_BOOKMAKERS = ["Betano", "Unibet DK", "DraftKings", "FanDuel", "Pinnacle"];

// All available markets - both player props and match markets
// marketType: 'player' (has label), 'totals' (over/under), 'spread' (home/away handicap)
const AVAILABLE_MARKETS = [
  // ===== MATCH MARKETS =====
  {
    key: "totals",
    label: "Match Totals",
    apiNames: ["Totals", "Goals Over/Under"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "spread",
    label: "Match Spread",
    apiNames: ["Spread"],
    marketType: "spread",
    enabled: true,
    category: "match",
  },
  {
    key: "team_total_home",
    label: "Team Total Home",
    apiNames: ["Team Total Home"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "team_total_away",
    label: "Team Total Away",
    apiNames: ["Team Total Away"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "totals_ht",
    label: "Totals 1st Half",
    apiNames: ["Totals HT"],
    marketType: "totals",
    enabled: false,
    category: "match",
  },
  {
    key: "spread_ht",
    label: "Spread 1st Half",
    apiNames: ["Spread HT"],
    marketType: "spread",
    enabled: false,
    category: "match",
  },
  {
    key: "corners_totals",
    label: "Corners Totals",
    apiNames: ["Corners Totals"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "corners_spread",
    label: "Corners Spread",
    apiNames: ["Corners Spread"],
    marketType: "spread",
    enabled: false,
    category: "match",
  },
  {
    key: "bookings_totals",
    label: "Cards Totals",
    apiNames: ["Bookings Totals", "Total Cards"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "bookings_spread",
    label: "Cards Spread",
    apiNames: ["Bookings Spread"],
    marketType: "spread",
    enabled: false,
    category: "match",
  },
  // ===== SHOTS MARKETS =====
  {
    key: "shots_on_target_totals",
    label: "Shots on Target",
    apiNames: ["Match Shots on Target", "Total Shots on Target"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "shots_on_target_home",
    label: "Shots on Target Home",
    apiNames: ["Team Shots on Target Home", "Total Shots on Target Home"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "shots_on_target_away",
    label: "Shots on Target Away",
    apiNames: ["Team Shots on Target Away", "Total Shots on Target Away"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "shots_totals",
    label: "Total Shots",
    apiNames: ["Match Shots", "Total Shots"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "shots_home",
    label: "Total Shots Home",
    apiNames: ["Team Shots Home", "Total Shots Home"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  {
    key: "shots_away",
    label: "Total Shots Away",
    apiNames: ["Team Shots Away", "Total Shots Away"],
    marketType: "totals",
    enabled: true,
    category: "match",
  },
  // ===== PLAYER PROP MARKETS =====
  {
    key: "goalscorer",
    label: "Anytime Goalscorer",
    apiNames: ["Anytime Goalscorer"],
    marketType: "player",
    oneWay: true,
    enabled: true,
    category: "player",
  },
  {
    key: "score_or_assist",
    label: "Score or Assist",
    apiNames: ["Player to Score or Assist", "Player To Score or Assist"],
    marketType: "player",
    oneWay: true,
    enabled: false, // Has sub-markets that can mix up
    category: "player",
  },
  {
    key: "player_shots",
    label: "Player Shots",
    apiNames: ["Player Shots"],
    marketType: "player",
    oneWay: true,
    enabled: true,
    category: "player",
  },
  {
    key: "player_sot",
    label: "Player Shots on Target",
    apiNames: ["Player Shots On Target", "Player Shots on Target"],
    marketType: "player",
    oneWay: true,
    enabled: true,
    category: "player",
  },
  {
    key: "player_tackles",
    label: "Player Tackles",
    apiNames: ["Player Tackles"],
    marketType: "player",
    oneWay: true,
    enabled: false, // Disabled - only Bet365 has this, Kambi doesn't
    category: "player",
  },
  {
    key: "player_fouls",
    label: "Player Fouls",
    apiNames: ["Player Fouls Committed", "Player Fouls"], // Both Bet365 and Kambi variants
    marketType: "player",
    oneWay: true,
    enabled: true, // Enabled - both books have this
    category: "player",
  },
  {
    key: "player_cards",
    label: "Player Cards",
    apiNames: ["Player Cards"],
    marketType: "player",
    oneWay: true,
    enabled: false,
    category: "player",
  },
  {
    key: "goalkeeper_saves",
    label: "Goalkeeper Saves",
    apiNames: ["Goalkeeper Saves"],
    marketType: "player",
    oneWay: false, // Kambi has both over/under
    enabled: true, // Enabled - both books have this
    category: "player",
  },
];

// Build TARGET_MARKETS dynamically based on enabled markets
// Returns map of apiName -> { key, marketType, oneWay, category }
const buildTargetMarkets = (enabledMarkets) => {
  const markets = {};
  for (const market of AVAILABLE_MARKETS) {
    if (enabledMarkets.includes(market.key)) {
      for (const apiName of market.apiNames) {
        markets[apiName] = {
          key: market.key,
          marketType: market.marketType,
          oneWay: market.oneWay || false,
          category: market.category,
        };
      }
    }
  }
  return markets;
};

// Get market info by key
const getMarketInfo = (key) => AVAILABLE_MARKETS.find((m) => m.key === key);

// Get one-way market keys (player props without under odds)
const getOneWayMarkets = () =>
  AVAILABLE_MARKETS.filter((m) => m.oneWay).map((m) => m.key);

// Get player market keys
const getPlayerMarkets = () =>
  AVAILABLE_MARKETS.filter((m) => m.marketType === "player").map((m) => m.key);

// Get match market keys
const getMatchMarkets = () =>
  AVAILABLE_MARKETS.filter((m) => m.category === "match").map((m) => m.key);

// Line tolerance for matching (tighter now since we normalize)
const LINE_TOLERANCE = 0.25;
// Stricter tolerance for spread markets (must be nearly exact to avoid 1st half/full match mixing)
const SPREAD_LINE_TOLERANCE = 0.1;
// Minimum EV percentage to show (3%+ for higher confidence)
const MIN_EV_PERCENT = 3;
// Maximum EV percentage before flagging as suspicious (likely data error)
const MAX_REASONABLE_EV = 35;

// Normalize lines to .5 increments for consistent matching
// Over 10 and Over 10.5 are nearly equivalent (10 pushes vs loses)
// By normalizing, we can properly group and compare across bookmakers
const normalizeLine = (line) => {
  // If line is a whole number (10, 11, etc.), convert to .5 (10.5, 11.5)
  // If line is already .5 or .25/.75, keep as is
  const decimal = line % 1;
  if (decimal === 0) {
    // Whole number like 10 → 10.5
    return line + 0.5;
  } else if (Math.abs(decimal - 0.5) < 0.01 || Math.abs(decimal + 0.5) < 0.01) {
    // Already .5 like 10.5 → keep as 10.5
    return line;
  } else if (Math.abs(decimal - 0.25) < 0.01 || Math.abs(decimal - 0.75) < 0.01) {
    // Asian lines like 10.25 or 10.75 → keep as is
    return line;
  }
  // Default: round to nearest .5
  return Math.round(line * 2) / 2;
};
// Minimum bookmakers with complete odds for calculation
// Note: Only 2 bookmakers (Bet365, Kambi) have football player props
const MIN_BOOKMAKERS = 2;
// Default max odds filter (1.5 to 10 range for player props)
const DEFAULT_MAX_ODDS = 10;

// ============ DE-VIG METHODS ============
const DEVIG_METHODS = {
  multiplicative: {
    id: "multiplicative",
    name: "Multiplicative",
    description:
      "Proportionally removes vig from each side. Most common method.",
  },
  power: {
    id: "power",
    name: "Power",
    description:
      "Finds exponent k where P_over^k + P_under^k = 1. More accurate for lopsided lines.",
  },
  additive: {
    id: "additive",
    name: "Additive",
    description:
      "Subtracts equal vig from each side. Simple but less accurate.",
  },
  worstCase: {
    id: "worstCase",
    name: "Worst Case",
    description: "Uses the worst (lowest) fair probability. Most conservative.",
  },
};

// ============ DE-VIGGING FUNCTIONS ============
const oddsToImpliedProb = (odds) => 1 / odds;

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

const devigPower = (overOdds, underOdds) => {
  const pOver = oddsToImpliedProb(overOdds);
  const pUnder = oddsToImpliedProb(underOdds);
  const pTotal = pOver + pUnder;
  let low = 0.5,
    high = 2.0,
    k = 1;
  for (let i = 0; i < 50; i++) {
    k = (low + high) / 2;
    const sum = Math.pow(pOver, k) + Math.pow(pUnder, k);
    if (Math.abs(sum - 1) < 0.0001) break;
    if (sum > 1) low = k;
    else high = k;
  }
  return {
    fairProbOver: Math.pow(pOver, k),
    fairProbUnder: Math.pow(pUnder, k),
    vig: (pTotal - 1) * 100,
  };
};

const devigAdditive = (overOdds, underOdds) => {
  const pOver = oddsToImpliedProb(overOdds);
  const pUnder = oddsToImpliedProb(underOdds);
  const pTotal = pOver + pUnder;
  const vigPerSide = (pTotal - 1) / 2;
  return {
    fairProbOver: Math.max(0.01, pOver - vigPerSide),
    fairProbUnder: Math.max(0.01, pUnder - vigPerSide),
    vig: (pTotal - 1) * 100,
  };
};

const devigWorstCase = (overOdds, underOdds) => {
  const pOver = oddsToImpliedProb(overOdds);
  const pUnder = oddsToImpliedProb(underOdds);
  const pTotal = pOver + pUnder;
  return {
    fairProbOver: pOver,
    fairProbUnder: pUnder,
    vig: (pTotal - 1) * 100,
  };
};

const devig = (overOdds, underOdds, method = "multiplicative") => {
  switch (method) {
    case "power":
      return devigPower(overOdds, underOdds);
    case "additive":
      return devigAdditive(overOdds, underOdds);
    case "worstCase":
      return devigWorstCase(overOdds, underOdds);
    default:
      return devigMultiplicative(overOdds, underOdds);
  }
};

const fairProbToOdds = (fairProb) => 1 / fairProb;
const calculateEV = (fairProb, oddsOffered) =>
  (fairProb * oddsOffered - 1) * 100;

// localStorage keys
const TRACKED_BETS_KEY = "football-ev-tracked-bets";
const REMOVED_BETS_KEY = "football-ev-removed-bets";

const generateBetId = (bet) => {
  const normalizedPlayer = bet.player
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim();
  return `${normalizedPlayer}|${bet.market}|${bet.line}|${bet.betType}|${bet.bookmaker}`;
};

const loadFromStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("Failed to save to localStorage:", err);
  }
};

export default function FootballEVScraping() {
  // WebSocket connection for real-time updates
  const {
    connected,
    status: socketStatus,
    lastUpdate: socketLastUpdate,
    isRefreshing: socketRefreshing,
    connectedClients,
    footballData,
    soundEnabled,
    notificationsEnabled,
    autoReanalyze,
    toggleSound,
    toggleNotifications,
    toggleAutoReanalyze,
    registerOnDataUpdate,
    addHighEvAlert,
    requestRefresh,
  } = useSocket('football');

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [matchData, setMatchData] = useState({});
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    status: "",
    matchIndex: 0,
    totalMatches: 0,
    source: "",
  });
  const [trackedBets, setTrackedBets] = useState(() =>
    loadFromStorage(TRACKED_BETS_KEY, [])
  );
  const [removedBets, setRemovedBets] = useState(() =>
    loadFromStorage(REMOVED_BETS_KEY, {})
  );
  const [trackingBetId, setTrackingBetId] = useState(null);
  const [customOdds, setCustomOdds] = useState("");
  const [selectedBookmakers, setSelectedBookmakers] = useState(
    PLAYABLE_BOOKMAKERS.reduce((acc, b) => ({ ...acc, [b]: true }), {})
  );
  const [devigMethod, setDevigMethod] = useState("multiplicative");
  const [minEVFilter, setMinEVFilter] = useState(MIN_EV_PERCENT);
  const [maxOddsFilter, setMaxOddsFilter] = useState(DEFAULT_MAX_ODDS);
  // Market filter - which markets to include
  const [selectedMarkets, setSelectedMarkets] = useState(
    AVAILABLE_MARKETS.filter((m) => m.enabled).map((m) => m.key)
  );
  // League filter - which leagues to fetch
  const [selectedLeagues, setSelectedLeagues] = useState(
    footballLeagues.leagues.filter((l) => l.enabled).map((l) => l.slug)
  );

  const toggleMarketFilter = (key) => {
    setSelectedMarkets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleBookmakerFilter = (bookmaker) => {
    setSelectedBookmakers((prev) => ({
      ...prev,
      [bookmaker]: !prev[bookmaker],
    }));
  };

  const toggleLeagueFilter = (slug) => {
    setSelectedLeagues((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const startTracking = (bet) => {
    const betId = generateBetId(bet);
    setTrackingBetId(betId);
    setCustomOdds(bet.odds.toFixed(2));
  };

  const cancelTracking = () => {
    setTrackingBetId(null);
    setCustomOdds("");
  };

  const confirmTrackBet = async (bet, match) => {
    const betId = generateBetId(bet);
    if (trackedBets.some((tb) => tb.id === betId)) {
      cancelTracking();
      return;
    }
    const actualOdds = parseFloat(customOdds) || bet.odds;
    const actualEV = calculateEV(bet.fairProb, actualOdds);
    const trackedBet = {
      id: betId,
      player: bet.player,
      market: bet.market,
      line: bet.line,
      betType: bet.betType,
      bookmaker: bet.bookmaker,
      displayedOdds: bet.odds,
      actualOdds,
      fairOdds: bet.fairOdds,
      fairProb: bet.fairProb,
      displayedEV: bet.evPercent,
      actualEV,
      trackedAt: new Date().toISOString(),
      matchId: match.id,
      matchName: `${match.home} vs ${match.away}`,
      matchDate: match.date,
      league: match.league?.name,
    };

    // Save to localStorage for local display
    const newTrackedBets = [...trackedBets, trackedBet];
    setTrackedBets(newTrackedBets);
    saveToStorage(TRACKED_BETS_KEY, newTrackedBets);

    // Save to Supabase for universal dashboard
    try {
      await BetTracker.trackBet({
        sport: 'football',
        matchId: match.id,
        matchName: `${match.home} vs ${match.away}`,
        matchDate: match.date,
        league: match.league?.name,
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
        units: 1,
      });
      console.log('[Football] Bet tracked to Supabase');
    } catch (err) {
      console.error('[Football] Failed to track bet to Supabase:', err);
    }

    cancelTracking();
  };

  const removeBet = (bet) => {
    const betId = generateBetId(bet);
    const newRemovedBets = {
      ...removedBets,
      [betId]: { removedOdds: bet.odds, removedAt: new Date().toISOString() },
    };
    setRemovedBets(newRemovedBets);
    saveToStorage(REMOVED_BETS_KEY, newRemovedBets);
  };

  const untrackBet = (betId) => {
    const newTrackedBets = trackedBets.filter((tb) => tb.id !== betId);
    setTrackedBets(newTrackedBets);
    saveToStorage(TRACKED_BETS_KEY, newTrackedBets);
  };

  const isBetTracked = (bet) => {
    const betId = generateBetId(bet);
    return trackedBets.some((tb) => tb.id === betId);
  };

  const isBetRemoved = (bet) => {
    const betId = generateBetId(bet);
    const removed = removedBets[betId];
    if (!removed) return false;
    // Simply check if bet was removed - don't modify state during render
    // The bet stays removed until user manually un-removes it or clears storage
    return true;
  };

  // Optional: Clear old removed bets periodically (e.g., older than 24 hours)
  useEffect(() => {
    const now = new Date();
    const cleanedBets = {};
    let changed = false;

    for (const [betId, data] of Object.entries(removedBets)) {
      const removedAt = new Date(data.removedAt);
      const hoursSinceRemoved = (now - removedAt) / (1000 * 60 * 60);

      // Keep bets removed within the last 24 hours
      if (hoursSinceRemoved < 24) {
        cleanedBets[betId] = data;
      } else {
        changed = true;
      }
    }

    if (changed) {
      setRemovedBets(cleanedBets);
      saveToStorage(REMOVED_BETS_KEY, cleanedBets);
    }
  }, []); // Run once on mount

  const getNext48HoursDate = () => {
    const date = new Date();
    date.setHours(date.getHours() + 48);
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  };

  // OpticOdds market mapping - maps OpticOdds market IDs to our internal market keys
  const OPTIC_MARKET_MAP = {
    // Match totals
    'total_goals': { key: 'totals', label: 'Match Totals', marketType: 'totals', category: 'match' },
    'asian_total_goals': { key: 'totals', label: 'Match Totals', marketType: 'totals', category: 'match' },
    // Spreads
    'asian_handicap': { key: 'spread', label: 'Match Spread', marketType: 'spread', category: 'match' },
    'goal_spread': { key: 'spread', label: 'Match Spread', marketType: 'spread', category: 'match' },
    // Team totals
    'team_total_goals': { key: 'team_total', label: 'Team Total', marketType: 'totals', category: 'match' },
    // Corners
    'total_corners': { key: 'corners_totals', label: 'Corners Totals', marketType: 'totals', category: 'match' },
    'corner_handicap': { key: 'corners_spread', label: 'Corners Spread', marketType: 'spread', category: 'match' },
    // Shots
    'total_shots': { key: 'shots_totals', label: 'Total Shots', marketType: 'totals', category: 'match' },
    'total_shots_on_target': { key: 'shots_on_target_totals', label: 'Shots on Target', marketType: 'totals', category: 'match' },
    'team_total_shots': { key: 'shots_home', label: 'Team Shots', marketType: 'totals', category: 'match' },
    'team_total_shots_on_target': { key: 'shots_on_target_home', label: 'Team Shots on Target', marketType: 'totals', category: 'match' },
    // Cards
    'total_cards': { key: 'bookings_totals', label: 'Cards Totals', marketType: 'totals', category: 'match' },
    // Player props
    'anytime_goal_scorer': { key: 'goalscorer', label: 'Anytime Goalscorer', marketType: 'player', oneWay: true, category: 'player' },
    'first_goal_scorer': { key: 'first_goalscorer', label: 'First Goalscorer', marketType: 'player', oneWay: true, category: 'player' },
    'player_shots': { key: 'player_shots', label: 'Player Shots', marketType: 'player', oneWay: true, category: 'player' },
    'player_shots_on_target': { key: 'player_sot', label: 'Player Shots on Target', marketType: 'player', oneWay: true, category: 'player' },
    'player_assists': { key: 'player_assists', label: 'Player Assists', marketType: 'player', oneWay: true, category: 'player' },
    'player_tackles': { key: 'player_tackles', label: 'Player Tackles', marketType: 'player', oneWay: true, category: 'player' },
    'player_passes': { key: 'player_passes', label: 'Player Passes', marketType: 'player', oneWay: true, category: 'player' },
    'player_fouls': { key: 'player_fouls', label: 'Player Fouls', marketType: 'player', oneWay: true, category: 'player' },
    'player_saves': { key: 'goalkeeper_saves', label: 'Goalkeeper Saves', marketType: 'player', oneWay: false, category: 'player' },
    'anytime_card_receiver': { key: 'player_cards', label: 'Player Cards', marketType: 'player', oneWay: true, category: 'player' },
  };

  // Parse OpticOdds API response format
  const parseOpticOdds = (oddsData, targetMarkets) => {
    const props = [];
    if (!oddsData || !oddsData.odds || !Array.isArray(oddsData.odds)) {
      console.warn('[OpticOdds] No odds data or invalid format');
      return props;
    }

    console.log(`[OpticOdds] Parsing ${oddsData.odds.length} odds entries`);

    // Group odds by market and line for easier processing
    const oddsByGroup = {};

    for (const odd of oddsData.odds) {
      // Get bookmaker display name
      const bookmaker = SPORTSBOOK_DISPLAY[odd.sportsbook] || odd.sportsbook;

      // Get market info from our mapping
      const marketInfo = OPTIC_MARKET_MAP[odd.market];
      if (!marketInfo) continue; // Skip unmapped markets

      // Check if this market is in our target markets
      if (!targetMarkets.includes(marketInfo.key)) continue;

      // Convert American odds to decimal
      const decimalOdds = americanToDecimal(odd.price);
      if (!decimalOdds || decimalOdds <= 1) continue;

      const rawLine = odd.points !== null ? parseFloat(odd.points) : 0.5;
      const line = normalizeLine(rawLine);
      const isOver = odd.selection_line === 'over' || odd.name?.toLowerCase().includes('over');
      const isUnder = odd.selection_line === 'under' || odd.name?.toLowerCase().includes('under');
      const isHome = odd.normalized_selection?.includes('home') || odd.selection?.toLowerCase().includes('home');
      const isAway = odd.normalized_selection?.includes('away') || odd.selection?.toLowerCase().includes('away');

      // Extract player name for player props
      let playerName = null;
      if (marketInfo.marketType === 'player' && odd.player_id) {
        // Extract player name from the odd name (e.g., "M. Salah Over 0.5")
        const nameParts = odd.name?.split(/\s+(over|under)\s*/i);
        if (nameParts && nameParts[0]) {
          playerName = nameParts[0].trim();
        }
      }

      // Create a grouping key for matching props
      const groupKey = playerName
        ? `${playerName}|${marketInfo.key}|${line}|${bookmaker}`
        : `${marketInfo.label}|${marketInfo.key}|${line}|${bookmaker}`;

      if (!oddsByGroup[groupKey]) {
        oddsByGroup[groupKey] = {
          player: playerName || marketInfo.label,
          market: marketInfo.key,
          marketName: odd.market,
          marketType: marketInfo.marketType,
          category: marketInfo.category,
          line,
          rawLine,
          overOdds: null,
          underOdds: null,
          bookmaker,
          updatedAt: odd.timestamp ? new Date(odd.timestamp * 1000).toISOString() : null,
        };
      }

      // Assign odds based on type
      if (isOver || (marketInfo.marketType === 'spread' && isHome)) {
        oddsByGroup[groupKey].overOdds = decimalOdds;
      } else if (isUnder || (marketInfo.marketType === 'spread' && isAway)) {
        oddsByGroup[groupKey].underOdds = decimalOdds;
      } else if (marketInfo.oneWay) {
        // One-way markets (like goalscorer) - just use overOdds
        oddsByGroup[groupKey].overOdds = decimalOdds;
      }
    }

    // Convert grouped odds to props array
    for (const data of Object.values(oddsByGroup)) {
      // Skip entries with no valid odds
      if (data.overOdds === null && data.underOdds === null) continue;
      props.push(data);
    }

    console.log(`[OpticOdds] Parsed ${props.length} props from odds data`);
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
      const response = await fetch(`${CACHE_SERVER_URL}/api/football/odds/${eventId}`, {
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.bookmakers && Object.keys(data.bookmakers).length > 0) {
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

  // Fetch odds for a fixture from OpticOdds API (via proxy)
  // Note: OpticOdds fetches all requested sportsbooks in one call
  const fetchFixtureOdds = async (fixtureId, targetMarkets) => {
    try {
      // Build URL with all sportsbooks
      const url = new URL(`${getOpticApiProxy()}/fixtures/odds`);
      url.searchParams.set('fixture_id', fixtureId);

      // Add all sportsbook IDs as separate parameters
      for (const bookId of OPTIC_SPORTSBOOK_IDS) {
        url.searchParams.append('sportsbook', bookId);
      }

      console.log(`[OpticOdds] Fetching odds for fixture ${fixtureId}`);

      const response = await fetch(url.toString());

      if (!response.ok) {
        console.warn(`[OpticOdds] Response not OK: ${response.status}`);
        return { props: [], updatedAt: null };
      }

      const result = await response.json();
      const oddsData = result.data?.[0] || null;

      if (!oddsData || !oddsData.odds) {
        console.warn(`[OpticOdds] No odds in response for fixture ${fixtureId}`);
        return { props: [], updatedAt: null };
      }

      console.log(`[OpticOdds] Got ${oddsData.odds.length} odds for fixture ${fixtureId}`);

      // Parse odds using our OpticOdds parser
      const props = parseOpticOdds(oddsData, targetMarkets);
      const updatedAt = oddsData.odds?.[0]?.timestamp
        ? new Date(oddsData.odds[0].timestamp * 1000).toISOString()
        : new Date().toISOString();

      return { props, updatedAt };
    } catch (err) {
      console.error(`[OpticOdds] Fetch error for fixture ${fixtureId}:`, err);
      return { props: [], updatedAt: null };
    }
  };

  const formatTimeCET = (isoString) => {
    if (!isoString) return null;
    return new Date(isoString).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });
  };

  const normalizePlayerName = (name) => {
    // Remove team indicators like (1), (2)
    let normalized = name.replace(/\s*\(\d+\)\s*/g, "");
    // Convert to lowercase
    normalized = normalized.toLowerCase();
    // Remove accents (normalize to NFD and remove diacritics)
    normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Remove non-alphanumeric except spaces
    normalized = normalized.replace(/[^a-z\s]/g, "");
    // Collapse multiple spaces and trim
    normalized = normalized.replace(/\s+/g, " ").trim();
    return normalized;
  };

  const linesMatch = (line1, line2, marketType = 'totals') => {
    // Use stricter tolerance for spread markets to avoid mixing 1st half with full match
    const tolerance = marketType === 'spread' ? SPREAD_LINE_TOLERANCE : LINE_TOLERANCE;
    return Math.abs(line1 - line2) <= tolerance;
  };

  // Check if odds are an outlier (likely wrong market like 1st half vs full match)
  // Returns true if odds should be excluded
  const isOddsOutlier = (odds, allOdds) => {
    if (allOdds.length < 2) return false;

    // Calculate median odds
    const sortedOdds = [...allOdds].sort((a, b) => a - b);
    const midIdx = Math.floor(sortedOdds.length / 2);
    const median = sortedOdds.length % 2 === 0
      ? (sortedOdds[midIdx - 1] + sortedOdds[midIdx]) / 2
      : sortedOdds[midIdx];

    // If odds differ from median by more than 80%, it's likely a different market
    const ratio = odds / median;
    return ratio > 1.8 || ratio < 0.55;
  };

  const groupAndMatchProps = (allProps) => {
    console.log(`[Grouping] Starting with ${allProps.length} total props`);

    // Log props by bookmaker
    const propsByBookmaker = {};
    for (const prop of allProps) {
      if (!propsByBookmaker[prop.bookmaker])
        propsByBookmaker[prop.bookmaker] = 0;
      propsByBookmaker[prop.bookmaker]++;
    }
    console.log(`[Grouping] Props by bookmaker:`, propsByBookmaker);

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
          marketType: prop.marketType,
          category: prop.category,
          props: [],
        };
      }
      const existing = groups[key].props.find(
        (p) => p.bookmaker === prop.bookmaker && p.line === prop.line
      );
      if (!existing) groups[key].props.push(prop);
    }

    console.log(
      `[Grouping] Created ${Object.keys(groups).length} player/market groups`
    );

    // Log a few groups
    const groupEntries = Object.entries(groups).slice(0, 5);
    for (const [key, group] of groupEntries) {
      console.log(`[Grouping] Group "${key}":`, {
        player: group.player,
        market: group.market,
        propsCount: group.props.length,
        bookmakers: group.props.map((p) => `${p.bookmaker}(${p.line})`),
      });
    }

    const matched = [];
    for (const group of Object.values(groups)) {
      const sorted = group.props.sort((a, b) => a.line - b.line);
      const clusters = [];
      for (const prop of sorted) {
        let added = false;
        for (const cluster of clusters) {
          const avgLine =
            cluster.reduce((sum, p) => sum + p.line, 0) / cluster.length;
          // Pass marketType to use stricter tolerance for spread markets
          if (linesMatch(prop.line, avgLine, group.marketType)) {
            cluster.push(prop);
            added = true;
            break;
          }
        }
        if (!added) clusters.push([prop]);
      }
      for (const cluster of clusters) {
        // Filter out odds outliers (likely 1st half vs full match mix-up)
        const allOdds = cluster.map(p => p.overOdds).filter(o => o && !isNaN(o));
        const filteredCluster = cluster.filter(p => {
          if (!p.overOdds || isNaN(p.overOdds)) return true;
          const outlier = isOddsOutlier(p.overOdds, allOdds);
          if (outlier) {
            console.log(`[Grouping] Excluding outlier: ${p.bookmaker} ${p.marketName} line ${p.line} @ ${p.overOdds} (median odds: ${allOdds.sort((a,b)=>a-b)[Math.floor(allOdds.length/2)]})`);
          }
          return !outlier;
        });

        const uniqueBookmakers = new Set(filteredCluster.map((p) => p.bookmaker));
        if (uniqueBookmakers.size >= MIN_BOOKMAKERS) {
          const avgLine =
            filteredCluster.reduce((sum, p) => sum + p.line, 0) / filteredCluster.length;
          matched.push({
            player: group.player,
            market: group.market,
            marketName: group.marketName,
            marketType: group.marketType,
            category: group.category,
            avgLine: Math.round(avgLine * 2) / 2,
            props: filteredCluster,
            bookmakerCount: uniqueBookmakers.size,
          });
        }
      }
    }

    console.log(
      `[Grouping] Found ${matched.length} groups with ${MIN_BOOKMAKERS}+ bookmakers`
    );
    if (matched.length > 0) {
      console.log(
        `[Grouping] Sample matched groups:`,
        matched.slice(0, 3).map((g) => ({
          player: g.player,
          market: g.market,
          avgLine: g.avgLine,
          bookmakerCount: g.bookmakerCount,
          bookmakers: g.props.map((p) => p.bookmaker),
        }))
      );
    }

    return matched;
  };

  const findEVOpportunities = (matchedGroups, method = "multiplicative") => {
    console.log(
      `[EV] Starting EV calculation for ${matchedGroups.length} matched groups using ${method} method`
    );

    const opportunities = [];
    const allLines = [];
    let oneWayCount = 0;
    let twoWayCount = 0;

    // Get one-way market keys dynamically
    const oneWayMarkets = getOneWayMarkets();

    for (const group of matchedGroups) {
      const isOneWayMarket = oneWayMarkets.includes(group.market);

      if (isOneWayMarket) {
        // ONE-WAY MARKET (Goalscorer, etc.) - Compare odds across bookmakers
        // Strategy: Use Kambi (or any sharp book with both sides) as the fair benchmark
        // If no book has both sides, fall back to median with vig reduction
        oneWayCount++;

        const propsWithOdds = group.props.filter(
          (p) => p.overOdds && !isNaN(p.overOdds)
        );
        if (propsWithOdds.length < MIN_BOOKMAKERS) continue;

        // IMPROVED: Check if any book has both over AND under
        // Prioritize Pinnacle as the sharp line (OpticOdds has Pinnacle but not Kambi)
        const sharpBookPriority = ["Pinnacle", "Betano", "DraftKings", "FanDuel"];
        const propsWithBothSides = group.props.filter(
          (p) => p.overOdds && !isNaN(p.overOdds) && p.underOdds && !isNaN(p.underOdds)
        );

        let fairProb, fairOdds, usedSharpBook = null;

        // Try to find a sharp book with both sides for de-vigging
        let sharpProp = null;
        for (const sharpBook of sharpBookPriority) {
          sharpProp = propsWithBothSides.find(p => p.bookmaker === sharpBook);
          if (sharpProp) {
            usedSharpBook = sharpBook;
            break;
          }
        }
        // Fallback to any book with both sides
        if (!sharpProp && propsWithBothSides.length > 0) {
          sharpProp = propsWithBothSides[0];
          usedSharpBook = sharpProp.bookmaker;
        }

        if (sharpProp) {
          // USE SHARP BOOK'S DE-VIGGED ODDS as fair value
          const devigged = devig(sharpProp.overOdds, sharpProp.underOdds, method);
          fairProb = devigged.fairProbOver;
          fairOdds = 1 / fairProb;
        } else {
          // FALLBACK: No book has both sides, use median with vig reduction
          const impliedProbs = propsWithOdds
            .map((p) => ({
              bookmaker: p.bookmaker,
              odds: p.overOdds,
              impliedProb: 1 / p.overOdds,
              line: p.line,
            }))
            .sort((a, b) => a.odds - b.odds);

          const midIdx = Math.floor(impliedProbs.length / 2);
          const medianImpliedProb =
            impliedProbs.length % 2 === 0
              ? (impliedProbs[midIdx - 1].impliedProb +
                  impliedProbs[midIdx].impliedProb) /
                2
              : impliedProbs[midIdx].impliedProb;

          // Goalscorer markets typically have 10-15% total vig, so reduce by ~8%
          const estimatedVigReduction = 0.08;
          fairProb = medianImpliedProb * (1 - estimatedVigReduction);
          fairOdds = 1 / fairProb;
        }

        // Calculate implied probability for display
        const impliedProbs = propsWithOdds
          .map((p) => ({
            bookmaker: p.bookmaker,
            odds: p.overOdds,
            impliedProb: 1 / p.overOdds,
            line: p.line,
            hasUnder: p.underOdds && !isNaN(p.underOdds),
          }))
          .sort((a, b) => a.odds - b.odds);

        // Also track the best available odds for reference
        const bestOdds = Math.max(...propsWithOdds.map((p) => p.overOdds));

        // Check each bookmaker for EV
        for (const prop of propsWithOdds) {
          const evPercent = calculateEV(fairProb, prop.overOdds);

          const lineObj = {
            player: group.player,
            market: group.marketName,
            marketKey: group.market, // Key for filtering (e.g., 'goalscorer')
            category: group.category, // 'player' or 'match'
            line: prop.line,
            betType: "YES", // One-way bet
            bookmaker: prop.bookmaker,
            odds: prop.overOdds,
            fairOdds: fairOdds,
            fairProb: fairProb,
            evPercent,
            updatedAt: prop.updatedAt,
            bookmakerCount: propsWithOdds.length,
            sharpBook: usedSharpBook, // Which book was used for fair value (null = median)
            allOdds: impliedProbs.map((ip) => ({
              bookmaker: ip.bookmaker,
              odds: ip.odds,
              line: ip.line,
              fairProb: ip.impliedProb,
              vig: 0,
              hasUnder: ip.hasUnder, // Show which books have both sides
            })),
            playableOdds: impliedProbs.map((ip) => ({
              bookmaker: ip.bookmaker,
              odds: ip.odds,
              line: ip.line,
            })),
          };

          allLines.push(lineObj);
          // Filter: must meet min EV and not exceed max reasonable EV (likely data error)
          if (evPercent >= MIN_EV_PERCENT && evPercent <= MAX_REASONABLE_EV) {
            opportunities.push(lineObj);
          } else if (evPercent > MAX_REASONABLE_EV) {
            console.log(`[EV] Skipping suspicious EV: ${group.player} ${group.marketName} @ ${prop.bookmaker} - ${evPercent.toFixed(1)}% EV (>35% is likely data error)`);
          }
        }
      } else {
        // TWO-WAY MARKET (Over/Under) - Traditional de-vigging
        twoWayCount++;

        // Get all props with both over and under odds
        const propsWithBothSides = group.props.filter(
          (p) =>
            p.overOdds &&
            !isNaN(p.overOdds) &&
            p.underOdds &&
            !isNaN(p.underOdds)
        );

        if (propsWithBothSides.length < MIN_BOOKMAKERS) {
          // Not enough bookmakers with both sides, skip
          continue;
        }

        // De-vig each bookmaker
        const devigged = propsWithBothSides.map((p) => {
          const result = devig(p.overOdds, p.underOdds, method);
          return {
            bookmaker: p.bookmaker,
            overOdds: p.overOdds,
            underOdds: p.underOdds,
            fairProbOver: result.fairProbOver,
            fairProbUnder: result.fairProbUnder,
            vig: result.vig,
            line: p.line,
          };
        });

        // Check if we have a sharp book (Pinnacle)
        const hasPinnacle = devigged.some(d => d.bookmaker === "Pinnacle");

        let avgFairProbOver, avgFairProbUnder, usedSharpBook = null;

        if (hasPinnacle) {
          // Use Pinnacle as the sharp reference
          const pinnacleData = devigged.find(d => d.bookmaker === "Pinnacle");
          avgFairProbOver = pinnacleData.fairProbOver;
          avgFairProbUnder = pinnacleData.fairProbUnder;
          usedSharpBook = "Pinnacle";
        } else if (devigged.length === 2) {
          // NO SHARP BOOK - Use the lowest-vig book as reference
          // This allows finding edge between two soft books (e.g., Bet365 vs Kambi for shots)
          const sortedByVig = [...devigged].sort((a, b) => a.vig - b.vig);
          const lowestVigBook = sortedByVig[0];
          avgFairProbOver = lowestVigBook.fairProbOver;
          avgFairProbUnder = lowestVigBook.fairProbUnder;
          usedSharpBook = lowestVigBook.bookmaker + " (lowest vig)";
        } else {
          // Multiple books but no Pinnacle - use average
          avgFairProbOver =
            devigged.reduce((sum, d) => sum + d.fairProbOver, 0) /
            devigged.length;
          avgFairProbUnder =
            devigged.reduce((sum, d) => sum + d.fairProbUnder, 0) /
            devigged.length;
          usedSharpBook = "Average";
        }

        // Check OVER bets
        for (const prop of group.props.filter(
          (p) => p.overOdds && !isNaN(p.overOdds)
        )) {
          const evPercent = calculateEV(avgFairProbOver, prop.overOdds);

          // For spread markets, use HOME/AWAY instead of OVER/UNDER
          const betType = group.marketType === "spread" ? "HOME" : "OVER";

          const lineObj = {
            player: group.player,
            market: group.marketName,
            marketKey: group.market, // Key for filtering
            category: group.category, // 'player' or 'match'
            line: prop.line,
            betType,
            bookmaker: prop.bookmaker,
            odds: prop.overOdds,
            fairOdds: fairProbToOdds(avgFairProbOver),
            fairProb: avgFairProbOver,
            evPercent,
            updatedAt: prop.updatedAt,
            bookmakerCount: devigged.length,
            sharpBook: usedSharpBook, // Which book was used for fair value
            allOdds: devigged.map((d) => ({
              bookmaker: d.bookmaker,
              odds: d.overOdds,
              line: d.line,
              fairProb: d.fairProbOver,
              vig: d.vig,
            })),
            playableOdds: group.props
              .filter((p) => p.overOdds && !isNaN(p.overOdds))
              .map((p) => ({
                bookmaker: p.bookmaker,
                odds: p.overOdds,
                line: p.line,
              })),
          };

          allLines.push(lineObj);
          // Filter: must meet min EV and not exceed max reasonable EV (likely data error)
          if (evPercent >= MIN_EV_PERCENT && evPercent <= MAX_REASONABLE_EV) {
            opportunities.push(lineObj);
          } else if (evPercent > MAX_REASONABLE_EV) {
            console.log(`[EV] Skipping suspicious EV: ${group.player} ${group.marketName} OVER @ ${prop.bookmaker} - ${evPercent.toFixed(1)}% EV (>35% is likely data error)`);
          }
        }

        // Check UNDER bets
        for (const prop of group.props.filter(
          (p) => p.underOdds && !isNaN(p.underOdds)
        )) {
          const evPercent = calculateEV(avgFairProbUnder, prop.underOdds);

          // For spread markets, use HOME/AWAY instead of OVER/UNDER
          const betType = group.marketType === "spread" ? "AWAY" : "UNDER";

          const lineObj = {
            player: group.player,
            market: group.marketName,
            marketKey: group.market, // Key for filtering
            category: group.category, // 'player' or 'match'
            line: prop.line,
            betType,
            bookmaker: prop.bookmaker,
            odds: prop.underOdds,
            fairOdds: fairProbToOdds(avgFairProbUnder),
            fairProb: avgFairProbUnder,
            evPercent,
            updatedAt: prop.updatedAt,
            bookmakerCount: devigged.length,
            sharpBook: usedSharpBook, // Which book was used for fair value
            allOdds: devigged.map((d) => ({
              bookmaker: d.bookmaker,
              odds: d.underOdds,
              line: d.line,
              fairProb: d.fairProbUnder,
              vig: d.vig,
            })),
            playableOdds: group.props
              .filter((p) => p.underOdds && !isNaN(p.underOdds))
              .map((p) => ({
                bookmaker: p.bookmaker,
                odds: p.underOdds,
                line: p.line,
              })),
          };

          allLines.push(lineObj);
          // Filter: must meet min EV and not exceed max reasonable EV (likely data error)
          if (evPercent >= MIN_EV_PERCENT && evPercent <= MAX_REASONABLE_EV) {
            opportunities.push(lineObj);
          } else if (evPercent > MAX_REASONABLE_EV) {
            console.log(`[EV] Skipping suspicious EV: ${group.player} ${group.marketName} UNDER @ ${prop.bookmaker} - ${evPercent.toFixed(1)}% EV (>35% is likely data error)`);
          }
        }
      }
    }

    console.log(`[EV] Summary:`, {
      totalGroups: matchedGroups.length,
      oneWayMarkets: oneWayCount,
      twoWayMarkets: twoWayCount,
      totalAllLines: allLines.length,
      totalOpportunities: opportunities.length,
    });

    if (allLines.length > 0) {
      console.log(
        `[EV] Top 5 EV lines (before filtering):`,
        allLines.slice(0, 5).map((l) => ({
          player: l.player,
          market: l.market,
          line: l.line,
          betType: l.betType,
          bookmaker: l.bookmaker,
          odds: l.odds,
          fairOdds: l.fairOdds,
          evPercent: l.evPercent,
        }))
      );
    }

    return {
      opportunities: opportunities.sort((a, b) => b.evPercent - a.evPercent),
      allLines: allLines.sort((a, b) => b.evPercent - a.evPercent),
    };
  };

  const computedMatchData = useMemo(() => {
    const computed = {};
    for (const [matchId, data] of Object.entries(matchData)) {
      if (data.matchedGroups && data.matchedGroups.length > 0) {
        const { opportunities, allLines } = findEVOpportunities(
          data.matchedGroups,
          devigMethod
        );
        computed[matchId] = { ...data, opportunities, allLines };
      } else {
        computed[matchId] = { ...data, opportunities: [], allLines: [] };
      }
    }
    return computed;
  }, [matchData, devigMethod]);

  // Count bets per market (for display in filter)
  const betCountsByMarket = useMemo(() => {
    const counts = {};
    AVAILABLE_MARKETS.forEach(m => { counts[m.key] = 0; });

    Object.values(computedMatchData).forEach(data => {
      if (data.allLines) {
        data.allLines.forEach(opp => {
          if (
            opp.evPercent >= minEVFilter &&
            opp.odds <= maxOddsFilter &&
            !isBetRemoved(opp) &&
            selectedBookmakers[opp.bookmaker]
          ) {
            if (counts[opp.marketKey] !== undefined) {
              counts[opp.marketKey]++;
            }
          }
        });
      }
    });
    return counts;
  }, [computedMatchData, minEVFilter, maxOddsFilter, selectedBookmakers]);

  const analyzeMatchInternal = async (match, onProgress) => {
    console.log(
      `\n========== ANALYZING MATCH: ${match.home} vs ${match.away} ==========`
    );
    console.log(`[Match] ID: ${match.id}, League: ${match.league}`);
    console.log(`[Match] Selected markets:`, selectedMarkets);

    // OpticOdds fetches all bookmakers in one API call
    if (onProgress) onProgress(1, 'Fetching odds from OpticOdds...', 'API');

    // Fetch all odds for this fixture from OpticOdds
    const { props: allProps } = await fetchFixtureOdds(match.id, selectedMarkets);

    console.log(`[Match] Total props collected: ${allProps.length}`);

    const matchedGroups = groupAndMatchProps(allProps);
    console.log(`[Match] Matched groups: ${matchedGroups.length}`);
    console.log(
      `========== END MATCH: ${match.home} vs ${match.away} ==========\n`
    );

    return { matchedGroups, analyzed: true };
  };

  const analyzeAllMatches = async (matchList) => {
    if (!matchList || matchList.length === 0) return;
    setAnalyzing(true);

    for (let mIdx = 0; mIdx < matchList.length; mIdx++) {
      const match = matchList[mIdx];
      setProgress({
        current: 0,
        total: ALL_BOOKMAKERS.length,
        status: "Checking cache...",
        matchIndex: mIdx + 1,
        totalMatches: matchList.length,
        matchName: `${match.home} vs ${match.away}`,
        source: "",
      });

      try {
        const result = await analyzeMatchInternal(
          match,
          (bookIdx, statusText, source) => {
            setProgress({
              current: bookIdx,
              total: ALL_BOOKMAKERS.length,
              status: statusText,
              matchIndex: mIdx + 1,
              totalMatches: matchList.length,
              matchName: `${match.home} vs ${match.away}`,
              source: source || "",
            });
          }
        );
        setMatchData((prev) => ({ ...prev, [match.id]: result }));
      } catch (err) {
        console.error(`[Analysis] Error:`, err);
        setMatchData((prev) => ({
          ...prev,
          [match.id]: { matchedGroups: [], analyzed: true, error: err.message },
        }));
      }

      if (mIdx < matchList.length - 1)
        await new Promise((r) => setTimeout(r, 500));
    }

    setProgress({
      current: 0,
      total: 0,
      status: "",
      matchIndex: 0,
      totalMatches: 0,
      source: "",
    });
    setAnalyzing(false);
  };

  const refreshAll = async () => {
    setLoading(true);
    setMatchData({});
    setError(null);

    try {
      const allMatches = [];

      // Fetch fixtures from all selected leagues using OpticOdds API (via proxy)
      for (const leagueSlug of selectedLeagues) {
        // Convert our league slug to OpticOdds format
        const opticLeague = SOCCER_LEAGUES[leagueSlug] || leagueSlug;

        try {
          const url = new URL(`${getOpticApiProxy()}/fixtures`);
          url.searchParams.set('sport', 'soccer');
          url.searchParams.set('league', opticLeague);
          url.searchParams.set('status', 'unplayed');

          console.log(`[OpticOdds] Fetching fixtures for ${opticLeague}`);

          const response = await fetch(url.toString());

          if (response.ok) {
            const result = await response.json();
            const fixtures = result.data || [];

            // Only include matches in the next 24 hours
            const now = new Date();
            const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            // Transform OpticOdds fixtures to our internal format
            for (const fixture of fixtures) {
              const fixtureDate = new Date(fixture.start_date);

              // Skip fixtures not within next 24 hours
              if (fixtureDate < now || fixtureDate > next24Hours) {
                continue;
              }

              allMatches.push({
                id: fixture.id,
                home: fixture.home_team_display || fixture.home_team,
                away: fixture.away_team_display || fixture.away_team,
                date: fixture.start_date,
                league: opticLeague,
                leagueName: fixture.league,
                status: fixture.status,
                isLive: fixture.is_live,
              });
            }

            console.log(`[OpticOdds] Got ${fixtures.length} fixtures for ${opticLeague}, ${allMatches.length} within 24h`);
          } else {
            console.warn(`[OpticOdds] Failed to fetch ${opticLeague}: ${response.status}`);
          }
        } catch (err) {
          console.warn(`[OpticOdds] Failed to fetch ${leagueSlug}:`, err);
        }
        await new Promise((r) => setTimeout(r, 100)); // Rate limit
      }

      // Sort by date
      allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));

      console.log(
        "[Football EV] Received",
        allMatches.length,
        "matches from",
        selectedLeagues.length,
        "leagues via OpticOdds"
      );

      setMatches(allMatches);
      setLastUpdated(new Date());
      setLoading(false);

      if (allMatches.length > 0) {
        await analyzeAllMatches(allMatches);
      }
    } catch (err) {
      console.error("[Football EV] Error:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCacheStatus();
    refreshAll();
  }, []);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getTimeUntil = (dateStr) => {
    const diffMs = new Date(dateStr) - new Date();
    if (diffMs < 0) return "Started";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  return (
    <div className="football-ev-container">
      {/* Header Section */}
      <div className="header-section">
        <div className="header-content">
          <div className="header-text">
            <h1>
              Football EV Scraping
            </h1>
            <p>
              De-vigged EV calculation across {ALL_BOOKMAKERS.length} bookmakers
              - {selectedLeagues.length} leagues selected
            </p>
          </div>

          <div className="header-actions">
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
              sport="football"
            />
            <button
              onClick={refreshAll}
              disabled={loading || analyzing}
              className="refresh-button"
              style={{
                cursor: loading || analyzing ? "not-allowed" : "pointer",
                opacity: loading || analyzing ? 0.7 : 1,
              }}
            >
              {loading
                ? "Loading..."
                : analyzing
                ? "Analyzing..."
                : "Refresh All"}
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            color: "#fca5a5",
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚽</div>
          <p>Loading football matches...</p>
        </div>
      )}

      {/* Progress */}
      {analyzing && progress.total > 0 && (
        <div
          style={{
            background: "rgba(30, 41, 59, 0.8)",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            border: "1px solid rgba(34, 197, 94, 0.3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "3px solid rgba(34, 197, 94, 0.3)",
                borderTopColor: "#22c55e",
                animation: "spin 1s linear infinite",
              }}
            />
            <div>
              <div style={{ color: "#e2e8f0", fontWeight: 600 }}>
                {progress.matchName}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>
                  {progress.status}
                </span>
                {progress.source && (
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: progress.source === 'CACHE' ? "rgba(34, 197, 94, 0.2)" : "rgba(249, 115, 22, 0.2)",
                    color: progress.source === 'CACHE' ? "#22c55e" : "#f97316",
                  }}>
                    {progress.source}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>
              Match {progress.matchIndex} of {progress.totalMatches}
            </div>
            <div
              style={{
                background: "rgba(100, 116, 139, 0.2)",
                borderRadius: 8,
                height: 6,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background:
                    "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                  height: "100%",
                  width: `${
                    (progress.matchIndex / progress.totalMatches) * 100
                  }%`,
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && matches.length > 0 && (
        <div>
          {/* Summary Stats */}
          {Object.keys(computedMatchData).length > 0 &&
            (() => {
              const visibleOpps = Object.values(computedMatchData).reduce(
                (sum, d) => {
                  const lines = d.allLines || [];
                  return (
                    sum +
                    lines.filter(
                      (o) =>
                        o.evPercent >= minEVFilter &&
                        o.odds <= maxOddsFilter &&
                        !isBetRemoved(o) &&
                        selectedBookmakers[o.bookmaker] &&
                        selectedMarkets.includes(o.marketKey)
                    ).length
                  );
                },
                0
              );
              const totalOpps = Object.values(computedMatchData).reduce(
                (sum, d) => {
                  const lines = d.allLines || [];
                  return (
                    sum +
                    lines.filter(
                      (o) =>
                        o.evPercent >= minEVFilter &&
                        o.odds <= maxOddsFilter &&
                        selectedMarkets.includes(o.marketKey)
                    ).length
                  );
                },
                0
              );

              return (
                <div className="stats-container">
                  <div className="stat-card">
                    <div className="stat-value">
                      {visibleOpps}
                    </div>
                    <div className="stat-label">
                      +EV Bets ({minEVFilter}%+)
                    </div>
                  </div>
                  <div className="stat-card blue">
                    <div className="stat-value blue">
                      {trackedBets.length}
                    </div>
                    <div className="stat-label">
                      Tracked Bets
                    </div>
                  </div>
                  <div className="stat-card gray">
                    <div className="stat-value gray">
                      {
                        Object.keys(computedMatchData).filter(
                          (id) => computedMatchData[id].analyzed
                        ).length
                      }{" "}
                      / {matches.length}
                    </div>
                    <div className="stat-label">
                      Matches
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Bookmaker Filter */}
          <div className="filter-section">
            <span className="filter-label">
              Show EV from:
              <HelpTooltip text="Bookmakers you can actually bet on. We compare their odds to calculate your edge." />
            </span>
            <div className="filter-options">
              {PLAYABLE_BOOKMAKERS.map((bookmaker) => (
                <label
                  key={bookmaker}
                  className={`filter-checkbox-label ${selectedBookmakers[bookmaker] ? 'selected-green' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedBookmakers[bookmaker]}
                    onChange={() => toggleBookmakerFilter(bookmaker)}
                    className="filter-checkbox"
                    style={{ accentColor: "#22c55e" }}
                  />
                  <span className={`filter-checkbox-text ${selectedBookmakers[bookmaker] ? 'green' : ''}`}>
                    {bookmaker}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Market Filter */}
          <div className="filter-section">
            <span className="filter-label">
              Markets:
              <HelpTooltip text="Types of bets to analyze. Player props (shots, goals) and match markets (corners, cards)." />
            </span>
            <div className="filter-options">
              {AVAILABLE_MARKETS.map((market) => {
                const count = betCountsByMarket[market.key] || 0;
                return (
                  <label
                    key={market.key}
                    className={`filter-checkbox-label ${selectedMarkets.includes(market.key) ? 'selected-blue' : ''}`}
                    title={market.oneWay ? "One-way bet (no under)" : "Over/Under market"}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMarkets.includes(market.key)}
                      onChange={() => toggleMarketFilter(market.key)}
                      className="filter-checkbox"
                      style={{ accentColor: "#3b82f6" }}
                    />
                    <span className={`filter-checkbox-text ${selectedMarkets.includes(market.key) ? 'blue' : ''}`}>
                      {market.label}
                      {count > 0 && (
                        <span className="market-bet-count">{count}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* De-vig Method Selector */}
          <div className="filter-section">
            <span className="filter-label">
              De-vig Method:
              <HelpTooltip text="How we remove the bookmaker's profit margin to find the 'true' fair odds. Multiplicative is most common. Hover each method for details." />
            </span>
            <div className="filter-options">
              {Object.values(DEVIG_METHODS).map((method) => (
                <label
                  key={method.id}
                  className={`filter-checkbox-label ${devigMethod === method.id ? 'selected-purple' : ''}`}
                  title={method.description}
                >
                  <input
                    type="radio"
                    name="devigMethod"
                    checked={devigMethod === method.id}
                    onChange={() => setDevigMethod(method.id)}
                    className="filter-checkbox"
                    style={{ accentColor: "#a855f7" }}
                  />
                  <span className={`filter-checkbox-text ${devigMethod === method.id ? 'purple' : ''}`}>
                    {method.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Min EV Slider */}
          <div className="slider-container">
            <div className="slider-label-row">
              <span className="slider-label">
                Min EV%:
                <HelpTooltip text="Expected Value - your long-term profit edge. 5% EV means you profit $5 per $100 bet on average. Higher = safer but fewer bets." />
              </span>
              <span className="slider-value green">
                {minEVFilter}%
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="0.5"
              value={minEVFilter}
              onChange={(e) => setMinEVFilter(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #22c55e 0%, #22c55e ${
                  ((minEVFilter - 1) / 49) * 100
                }%, rgba(100, 116, 139, 0.3) ${
                  ((minEVFilter - 1) / 49) * 100
                }%, rgba(100, 116, 139, 0.3) 100%)`,
              }}
            />
          </div>

          {/* Max Odds Slider */}
          <div className="slider-container">
            <div className="slider-label-row">
              <span className="slider-label">
                Max Odds:
                <HelpTooltip text="Filter out longshots. Odds of 3.0 = 33% win chance. Lower odds = more likely to win but smaller payouts." />
              </span>
              <span className="slider-value orange">
                {maxOddsFilter}
              </span>
            </div>
            <input
              type="range"
              min="1.5"
              max="10"
              step="0.5"
              value={maxOddsFilter}
              onChange={(e) => setMaxOddsFilter(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${
                  ((maxOddsFilter - 1.5) / 8.5) * 100
                }%, rgba(100, 116, 139, 0.3) ${
                  ((maxOddsFilter - 1.5) / 8.5) * 100
                }%, rgba(100, 116, 139, 0.3) 100%)`,
              }}
            />
          </div>

          <h2 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 700 }}>
            Football Matches ({matches.length})
          </h2>

          {/* Match Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {matches
              .filter((match) => {
                const data = computedMatchData[match.id] || {};
                const allLines = data.allLines || [];
                const opportunities = allLines.filter(
                  (opp) =>
                    opp.evPercent >= minEVFilter &&
                    opp.odds <= maxOddsFilter &&
                    !isBetRemoved(opp) &&
                    selectedBookmakers[opp.bookmaker] &&
                    selectedMarkets.includes(opp.marketKey)
                );
                // Only show matches with +EV opportunities (or still being analyzed)
                return opportunities.length > 0 || !data.analyzed;
              })
              .map((match) => {
              const data = computedMatchData[match.id] || {};
              const allLines = data.allLines || [];
              const opportunities = allLines
                .filter(
                  (opp) =>
                    opp.evPercent >= minEVFilter &&
                    opp.odds <= maxOddsFilter &&
                    !isBetRemoved(opp) &&
                    selectedBookmakers[opp.bookmaker] &&
                    selectedMarkets.includes(opp.marketKey)
                )
                .sort((a, b) => b.evPercent - a.evPercent);
              const isAnalyzed = data.analyzed;
              const hasEV = opportunities.length > 0;

              return (
                <div
                  key={match.id}
                  className={`match-card ${hasEV ? 'has-ev' : ''}`}
                >
                  <div className="match-header">
                    <div className="match-meta">
                      <div className="match-badges">
                        <span className="badge league">
                          {match.league?.name || "Football"}
                        </span>
                        <span className="badge time">
                          {formatDate(match.date)}
                        </span>
                        <span className="badge time">
                          Starts in{" "}
                          <span style={{ color: "#22c55e", fontWeight: 600 }}>
                            {getTimeUntil(match.date)}
                          </span>
                        </span>
                      </div>
                      <div className="match-teams">
                        {match.home}{" "}
                        <span className="match-vs">vs</span>{" "}
                        {match.away}
                      </div>
                      <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
                        Event ID: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{match.id}</span>
                      </div>
                    </div>
                    <div className="match-status">
                      {isAnalyzed ? (
                        hasEV ? (
                          <span className="status-badge ev">
                            {opportunities.length} +EV
                          </span>
                        ) : (
                          <span className="status-badge no-ev">
                            No +EV
                          </span>
                        )
                      ) : (
                        <span className="status-badge ev">
                          Pending...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* EV Opportunities */}
                  {isAnalyzed && opportunities.length > 0 && (
                    <div className="ev-opportunities">
                      <div className="ev-opportunities-title">
                        +EV Opportunities ({minEVFilter}%+ edge)
                        <HelpTooltip text="Bets where the offered odds are higher than the fair odds. These have positive Expected Value - profitable in the long run!" position="right" />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        {opportunities.map((ev, idx) => (
                          <div
                            key={idx}
                            className={`ev-card ${ev.evPercent >= 10 ? 'high-ev' : ''}`}
                          >
                            <div className="ev-header">
                              <div className="ev-player-info">
                                <span className="ev-player-name">
                                  {ev.player}
                                </span>
                                <span className="ev-market-badge">
                                  {ev.market}
                                </span>
                                <span className={`ev-bet-type ${ev.betType === "OVER" ? 'over' : 'under'}`}>
                                  {ev.betType} {ev.line}
                                </span>
                              </div>
                              <div
                                className="ev-percentage"
                                style={{
                                  color: ev.evPercent >= 10 ? "#22c55e" : "#4ade80",
                                }}
                              >
                                +{ev.evPercent.toFixed(1)}%
                              </div>
                            </div>

                            <div className="ev-odds-info">
                              <div className="ev-odds-row">
                                <span className="odds-label">
                                  Bet:
                                  <HelpTooltip text="The odds you can get at this bookmaker. Higher odds = bigger potential payout." position="bottom" />
                                </span>
                                <span className="odds-value bet">
                                  {ev.odds.toFixed(2)}
                                </span>
                                <span className="odds-bookmaker">
                                  @ {ev.bookmaker}
                                </span>
                              </div>
                              <div className="ev-odds-row">
                                <span className="odds-label">
                                  Fair:
                                  <HelpTooltip text="The 'true' odds after removing bookmaker profit. If Bet odds > Fair odds, you have an edge!" position="bottom" />
                                </span>
                                <span className="odds-value fair">
                                  {ev.fairOdds?.toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {/* Sharp book odds - deduplicated by bookmaker */}
                            <div className="sharp-odds-container">
                              <span className="sharp-label">
                                Sharp:
                                <HelpTooltip text="Odds from professional bookmakers (Pinnacle, Kambi). These are used to calculate fair value." position="bottom" />
                              </span>
                              {(() => {
                                // Deduplicate by bookmaker - keep closest line to bet line
                                const seen = {};
                                for (const o of ev.allOdds) {
                                  if (
                                    !seen[o.bookmaker] ||
                                    Math.abs(o.line - ev.line) <
                                      Math.abs(seen[o.bookmaker].line - ev.line)
                                  ) {
                                    seen[o.bookmaker] = o;
                                  }
                                }
                                return Object.values(seen).map((o, i) => (
                                  <span key={i} className="sharp-chip">
                                    <span className="sharp-chip-bookmaker">
                                      {o.bookmaker}
                                    </span>
                                    <span className="sharp-chip-odds">
                                      {o.odds?.toFixed(2)}
                                    </span>
                                    <span className="sharp-chip-line">
                                      Line {o.line}
                                    </span>
                                  </span>
                                ));
                              })()}
                            </div>

                            {/* Track/Remove buttons */}
                            {trackingBetId === generateBetId(ev) ? (
                              <div className="tracking-form">
                                <span style={{ color: "#94a3b8", fontSize: 12 }}>
                                  Actual odds:
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={customOdds}
                                  onChange={(e) =>
                                    setCustomOdds(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      confirmTrackBet(ev, match);
                                    if (e.key === "Escape") cancelTracking();
                                  }}
                                  autoFocus
                                  className="tracking-input"
                                />
                                <div className="tracking-buttons">
                                  <button
                                    onClick={() => confirmTrackBet(ev, match)}
                                    className="action-button tracked"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={cancelTracking}
                                    style={{
                                      padding: "10px 14px",
                                      borderRadius: 6,
                                      border: "1px solid rgba(100, 116, 139, 0.5)",
                                      background: "rgba(100, 116, 139, 0.15)",
                                      color: "#94a3b8",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      minHeight: "44px",
                                      flex: 1,
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="ev-actions">
                                {isBetTracked(ev) ? (
                                  <button
                                    onClick={() =>
                                      untrackBet(generateBetId(ev))
                                    }
                                    className="action-button tracked"
                                  >
                                    Tracked
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => startTracking(ev)}
                                    className="action-button track"
                                  >
                                    Track
                                  </button>
                                )}
                                <button
                                  onClick={() => removeBet(ev)}
                                  className="action-button remove"
                                >
                                  Remove
                                </button>
                              </div>
                            )}

                            {/* Inline Player Stats */}
                            {ev.category === "player" && (
                              <InlinePlayerStats
                                playerName={ev.player}
                                market={ev.market}
                                leagueName={match.league?.name}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Matches */}
      {!loading && matches.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚽</div>
          <p>No football matches found in the next 48 hours</p>
        </div>
      )}

      {/* All matches analyzed but no +EV found */}
      {!loading && !analyzing && matches.length > 0 && (() => {
        const allAnalyzed = matches.every((m) => computedMatchData[m.id]?.analyzed);
        const anyWithEV = matches.some((m) => {
          const data = computedMatchData[m.id] || {};
          const allLines = data.allLines || [];
          return allLines.some(
            (opp) =>
              opp.evPercent >= minEVFilter &&
              opp.odds <= maxOddsFilter &&
              !isBetRemoved(opp) &&
              selectedBookmakers[opp.bookmaker] &&
              selectedMarkets.includes(opp.marketKey)
          );
        });
        if (allAnalyzed && !anyWithEV) {
          return (
            <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚽</div>
              <p>No +EV opportunities found in {matches.length} matches</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Try adjusting filters or check back later</p>
            </div>
          );
        }
        return null;
      })()}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* MOBILE-RESPONSIVE STYLES */
        * {
          box-sizing: border-box;
        }

        .football-ev-container {
          padding: 12px;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
        }

        /* Header Section - Mobile First */
        .header-section {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .header-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .header-text h1 {
          font-size: 20px;
          font-weight: 800;
          margin: 0;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-text p {
          color: #94a3b8;
          margin: 6px 0 0 0;
          font-size: 12px;
          line-height: 1.4;
        }

        .header-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }

        .refresh-button {
          width: 100%;
          padding: 12px 20px;
          border-radius: 12px;
          border: 1px solid rgba(34, 197, 94, 0.5);
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: #fff;
          font-weight: 600;
          font-size: 14px;
          min-height: 44px;
          touch-action: manipulation;
        }

        /* Stats Cards - Mobile Stack */
        .stats-container {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .stat-card {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 12px;
          padding: 12px 16px;
        }

        .stat-card.blue {
          background: rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.3);
        }

        .stat-card.gray {
          background: rgba(100, 116, 139, 0.15);
          border-color: rgba(100, 116, 139, 0.3);
        }

        .stat-value {
          color: #22c55e;
          font-size: 24px;
          font-weight: 800;
        }

        .stat-value.blue {
          color: #60a5fa;
        }

        .stat-value.gray {
          color: #e2e8f0;
        }

        .stat-label {
          color: #94a3b8;
          font-size: 12px;
        }

        /* Filter Controls - Mobile Optimized */
        .filter-section {
          padding: 12px;
          background: rgba(30, 41, 59, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 16px;
        }

        .filter-label {
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          margin-bottom: 10px;
        }

        .filter-options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .filter-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 10px 12px;
          border-radius: 8px;
          background: rgba(100, 116, 139, 0.2);
          border: 1px solid rgba(100, 116, 139, 0.3);
          min-height: 44px;
          touch-action: manipulation;
          flex: 1 1 auto;
          min-width: 120px;
        }

        .filter-checkbox-label.selected-green {
          background: rgba(34, 197, 94, 0.2);
          border-color: rgba(34, 197, 94, 0.4);
        }

        .filter-checkbox-label.selected-blue {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .filter-checkbox-label.selected-purple {
          background: rgba(168, 85, 247, 0.2);
          border-color: rgba(168, 85, 247, 0.4);
        }

        .filter-checkbox {
          width: 18px;
          height: 18px;
          min-width: 18px;
          min-height: 18px;
          cursor: pointer;
        }

        .filter-checkbox-text {
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8;
        }

        .filter-checkbox-text.green {
          color: #22c55e;
        }

        .filter-checkbox-text.blue {
          color: #60a5fa;
        }

        .filter-checkbox-text.purple {
          color: #a855f7;
        }

        /* Slider Controls - Touch Friendly */
        .slider-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          background: rgba(30, 41, 59, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 16px;
        }

        .slider-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .slider-label {
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
        }

        .slider-value {
          font-size: 16px;
          font-weight: 700;
          min-width: 50px;
          text-align: right;
        }

        .slider-value.green {
          color: #22c55e;
        }

        .slider-value.orange {
          color: #f59e0b;
        }

        input[type="range"] {
          width: 100%;
          height: 40px;
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }

        input[type="range"]::-webkit-slider-track {
          height: 8px;
          border-radius: 4px;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: currentColor;
          cursor: pointer;
          margin-top: -8px;
        }

        input[type="range"]::-moz-range-track {
          height: 8px;
          border-radius: 4px;
        }

        input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: currentColor;
          cursor: pointer;
          border: none;
        }

        /* Specific slider colors */
        .slider-container:has(.slider-value.green) input[type="range"]::-webkit-slider-thumb,
        .slider-container:has(.slider-value.green) input[type="range"]::-moz-range-thumb {
          background: #22c55e;
        }

        .slider-container:has(.slider-value.orange) input[type="range"]::-webkit-slider-thumb,
        .slider-container:has(.slider-value.orange) input[type="range"]::-moz-range-thumb {
          background: #f59e0b;
        }

        /* Match Cards - Mobile Layout */
        .match-card {
          background: rgba(30, 41, 59, 0.6);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 16px;
        }

        .match-card.has-ev {
          background: rgba(34, 197, 94, 0.08);
          border-color: rgba(34, 197, 94, 0.3);
        }

        .match-header {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 12px;
        }

        .match-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .match-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }

        .badge {
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }

        .badge.league {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .badge.time {
          color: #64748b;
          background: rgba(100, 116, 139, 0.2);
        }

        .match-teams {
          font-size: 16px;
          font-weight: 700;
          color: #e2e8f0;
          line-height: 1.4;
        }

        .match-vs {
          color: #64748b;
          font-weight: 400;
        }

        .match-status {
          align-self: flex-start;
        }

        .status-badge {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          min-height: 36px;
          display: inline-flex;
          align-items: center;
        }

        .status-badge.ev {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .status-badge.no-ev {
          background: rgba(100, 116, 139, 0.2);
          color: #94a3b8;
        }

        /* EV Opportunity Cards - Mobile */
        .ev-opportunities {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .ev-opportunities-title {
          font-size: 14px;
          font-weight: 700;
          color: #22c55e;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
        }

        .ev-card {
          padding: 14px;
          background: rgba(34, 197, 94, 0.08);
          border-radius: 12px;
          border: 1px solid rgba(34, 197, 94, 0.15);
          margin-bottom: 12px;
        }

        .ev-card.high-ev {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.3);
        }

        .ev-header {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 10px;
        }

        .ev-player-info {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }

        .ev-player-name {
          font-weight: 700;
          color: #e2e8f0;
          font-size: 14px;
          word-break: break-word;
        }

        .ev-market-badge {
          background: rgba(100, 116, 139, 0.3);
          color: #e2e8f0;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
        }

        .ev-bet-type {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
        }

        .ev-bet-type.over {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .ev-bet-type.under {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }

        .ev-percentage {
          font-size: 18px;
          font-weight: 900;
          color: #22c55e;
          align-self: flex-start;
        }

        .ev-odds-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .ev-odds-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px;
        }

        .odds-label {
          color: #64748b;
          display: flex;
          align-items: center;
        }

        .odds-value {
          font-weight: 700;
        }

        .odds-value.bet {
          color: #22c55e;
        }

        .odds-value.fair {
          color: #a5b4fc;
        }

        .odds-bookmaker {
          color: #94a3b8;
        }

        /* Sharp odds chips */
        .sharp-odds-container {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }

        .sharp-label {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        .sharp-chip {
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid rgba(100, 116, 139, 0.4);
          background: rgba(30, 41, 59, 0.8);
          font-size: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 70px;
        }

        .sharp-chip-bookmaker {
          color: #60a5fa;
          font-weight: 700;
          margin-bottom: 2px;
        }

        .sharp-chip-odds {
          color: #e2e8f0;
          font-weight: 600;
        }

        .sharp-chip-line {
          color: #94a3b8;
          font-size: 9px;
        }

        /* Action Buttons - Touch Friendly */
        .ev-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 10px;
        }

        .action-button {
          flex: 1;
          min-width: 100px;
          padding: 10px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          min-height: 44px;
          touch-action: manipulation;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-button.track {
          border: 1px solid rgba(59, 130, 246, 0.5);
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
        }

        .action-button.tracked {
          border: 1px solid rgba(34, 197, 94, 0.5);
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .action-button.remove {
          border: 1px solid rgba(239, 68, 68, 0.5);
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
        }

        /* Tracking Input Form */
        .tracking-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px;
          background: rgba(59, 130, 246, 0.1);
          border-radius: 8px;
          margin-top: 8px;
        }

        .tracking-input {
          width: 100%;
          padding: 10px;
          border-radius: 6px;
          border: 1px solid rgba(59, 130, 246, 0.5);
          background: rgba(30, 41, 59, 0.8);
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 600;
          min-height: 44px;
        }

        .tracking-buttons {
          display: flex;
          gap: 8px;
        }

        .tracking-buttons button {
          flex: 1;
          min-height: 44px;
        }

        /* Tablet Breakpoint - 768px */
        @media (min-width: 768px) {
          .football-ev-container {
            padding: 16px;
          }

          .header-section {
            border-radius: 16px;
            padding: 20px 24px;
            margin-bottom: 20px;
          }

          .header-content {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }

          .header-text h1 {
            font-size: 24px;
          }

          .header-text p {
            font-size: 13px;
          }

          .header-actions {
            flex-direction: row;
            width: auto;
            align-items: center;
          }

          .refresh-button {
            width: auto;
          }

          .stats-container {
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 20px;
          }

          .filter-section {
            padding: 12px 16px;
            margin-bottom: 20px;
          }

          .filter-options {
            gap: 10px;
          }

          .filter-checkbox-label {
            flex: 0 1 auto;
            min-width: auto;
          }

          .slider-container {
            flex-direction: row;
            align-items: center;
            padding: 12px 16px;
            margin-bottom: 20px;
          }

          .slider-label-row {
            flex: 1;
            gap: 16px;
          }

          .match-card {
            padding: 20px;
            margin-bottom: 20px;
          }

          .match-header {
            flex-direction: row;
            justify-content: space-between;
            align-items: flex-start;
          }

          .match-meta {
            flex: 1;
          }

          .match-badges {
            gap: 8px;
          }

          .badge {
            font-size: 12px;
          }

          .match-teams {
            font-size: 18px;
          }

          .ev-card {
            padding: 16px 20px;
          }

          .ev-header {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }

          .ev-player-info {
            gap: 8px;
          }

          .ev-player-name {
            font-size: 15px;
          }

          .ev-market-badge {
            font-size: 12px;
          }

          .ev-bet-type {
            font-size: 12px;
          }

          .ev-odds-info {
            flex-direction: row;
            gap: 12px;
          }

          .action-button {
            flex: 0;
            min-width: auto;
          }
        }

        /* Desktop Breakpoint - 1024px */
        @media (min-width: 1024px) {
          .football-ev-container {
            padding: 24px;
          }

          .header-section {
            border-radius: 20px;
            padding: 24px 32px;
            margin-bottom: 24px;
          }

          .header-text h1 {
            font-size: 28px;
          }

          .header-text p {
            font-size: 14px;
          }

          .stats-container {
            margin-bottom: 24px;
          }

          .match-card {
            border-radius: 16px;
            margin-bottom: 24px;
          }

          .ev-opportunities {
            margin-top: 16px;
            padding-top: 16px;
          }
        }

        /* Large Desktop - 1440px */
        @media (min-width: 1440px) {
          .football-ev-container {
            max-width: 1400px;
            margin: 0 auto;
          }
        }
      `}</style>
    </div>
  );
}
