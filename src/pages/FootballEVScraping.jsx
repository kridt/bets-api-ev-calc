// src/pages/FootballEVScraping.jsx
// Football EV Scraping - Fetches football matches and compares player props across bookmakers
// Now with real-time WebSocket updates!

import { useState, useEffect, useMemo, useCallback } from "react";
import footballLeagues from "../config/footballLeagues.json";
import InlinePlayerStats from "../components/InlinePlayerStats";
import { useSocket } from '../hooks/useSocket';
import ConnectionStatus from '../components/ConnectionStatus';
import { BetTracker } from '../services/betTracker';

const ODDS_API_KEY =
  "811e5fb0efa75d2b92e800cb55b60b30f62af8c21da06c4b2952eb516bee0a2e";
const ODDS_API_BASE = "https://api2.odds-api.io/v3";

// Cache server URL - reduces API calls by serving cached odds
const CACHE_SERVER_URL = import.meta.env.VITE_CACHE_SERVER_URL || 'https://odds-notifyer-server.onrender.com';

// Bookmakers for fetching odds - all bookmakers with football coverage
// Pinnacle is used as the sharp line for de-vigging
const ALL_BOOKMAKERS = [
  "Pinnacle",      // Sharp line (used for fair odds calculation)
  "Bet365",        // Full coverage
  "Kambi",         // Full coverage
  "DraftKings",    // Full coverage
  "FanDuel",       // ML & Totals
  "BetMGM",        // Full coverage
  "Caesars",       // Full coverage
  "BetOnline.ag",  // Full coverage
  "BetRivers",     // Full coverage
  "Bovada",        // Full coverage
  "Fanatics",      // Full coverage
  "Superbet",      // Full coverage
  "Bally Bet",     // Full coverage + player props
];

// Bookmakers we can bet on in Denmark (for display in "Show EV from" list)
const PLAYABLE_BOOKMAKERS = ["Bet365", "Kambi"];

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

// Line tolerance for matching
const LINE_TOLERANCE = 0.5;
// Minimum EV percentage to show (3%+ for higher confidence)
const MIN_EV_PERCENT = 3;
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
    if (bet.odds !== removed.removedOdds) {
      const newRemovedBets = { ...removedBets };
      delete newRemovedBets[betId];
      setRemovedBets(newRemovedBets);
      saveToStorage(REMOVED_BETS_KEY, newRemovedBets);
      return false;
    }
    return true;
  };

  const getNext48HoursDate = () => {
    const date = new Date();
    date.setHours(date.getHours() + 48);
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  };

  // Parse all markets from API (both player props and match markets)
  const parseAllMarkets = (
    bookmakerData,
    bookmaker,
    updatedAt,
    targetMarkets
  ) => {
    const props = [];
    if (!Array.isArray(bookmakerData)) {
      console.warn(
        `[${bookmaker}] parseAllMarkets: bookmakerData is not an array`,
        typeof bookmakerData
      );
      return props;
    }

    // Log all market names we receive
    const allMarketNames = bookmakerData.map((m) => m.name);
    console.log(`[${bookmaker}] All market names from API:`, allMarketNames);
    console.log(
      `[${bookmaker}] Target markets we're looking for:`,
      Object.keys(targetMarkets)
    );

    for (const market of bookmakerData) {
      const marketInfo = targetMarkets[market.name];
      if (!marketInfo) {
        continue;
      }
      if (!market.odds) {
        console.log(`[${bookmaker}] Market "${market.name}" has no odds`);
        continue;
      }

      const marketUpdatedAt = market.updatedAt || updatedAt;
      const { key: marketKey, marketType, oneWay, category } = marketInfo;

      for (const item of market.odds) {
        // PLAYER PROPS - have 'label' field (player name)
        if (marketType === "player") {
          if (!item.label) continue;

          let playerName = item.label;
          playerName = playerName.replace(/\s*\([^)]*\)\s*/g, " ").trim();
          if (!playerName) continue;

          const line = parseFloat(item.hdp) || 0.5;
          const overOdds = parseFloat(item.over);
          const underOdds =
            item.under && item.under !== "N/A" && item.under !== "NaN"
              ? parseFloat(item.under)
              : null;

          if (isNaN(overOdds)) continue;

          props.push({
            player: playerName,
            market: marketKey,
            marketName: market.name,
            marketType,
            category,
            line,
            overOdds,
            underOdds,
            bookmaker,
            updatedAt: marketUpdatedAt,
          });
        }
        // TOTALS MARKETS - have 'over' and 'under' fields
        else if (marketType === "totals") {
          const line = parseFloat(item.hdp);
          if (isNaN(line)) continue;

          const overOdds = parseFloat(item.over);
          const underOdds =
            item.under && item.under !== "N/A" && item.under !== "NaN"
              ? parseFloat(item.under)
              : null;

          if (isNaN(overOdds)) continue;

          props.push({
            player: market.name, // Use market name for match markets (e.g., "Corners Totals")
            market: marketKey,
            marketName: market.name,
            marketType,
            category,
            line,
            overOdds,
            underOdds,
            bookmaker,
            updatedAt: marketUpdatedAt,
          });
        }
        // SPREAD MARKETS - have 'home' and 'away' fields
        else if (marketType === "spread") {
          const line = parseFloat(item.hdp);
          if (isNaN(line)) continue;

          const homeOdds = parseFloat(item.home);
          const awayOdds = parseFloat(item.away);

          if (isNaN(homeOdds) || isNaN(awayOdds)) continue;

          // For spreads, we treat home as "over" and away as "under" for consistency
          props.push({
            player: market.name, // Use market name for match markets (e.g., "Match Spread")
            market: marketKey,
            marketName: market.name,
            marketType,
            category,
            line,
            overOdds: homeOdds, // Home team
            underOdds: awayOdds, // Away team
            bookmaker,
            updatedAt: marketUpdatedAt,
          });
        }
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

  const fetchBookmakerOdds = async (eventId, bookmaker, targetMarkets, cachedData = null) => {
    try {
      let data;

      // Use cached data if available, otherwise fetch from API
      if (cachedData && cachedData.bookmakers && cachedData.bookmakers[bookmaker]) {
        data = { bookmakers: { [bookmaker]: cachedData.bookmakers[bookmaker] } };
        console.log(`[${bookmaker}] Using cached data`);
      } else {
        const url = `${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${bookmaker}`;
        console.log(`[${bookmaker}] Fetching: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
          console.warn(`[${bookmaker}] Response not OK: ${response.status}`);
          return { props: [], updatedAt: null };
        }

        data = await response.json();
      }

      if (!data?.bookmakers) {
        console.warn(`[${bookmaker}] No bookmakers object in response`);
        return { props: [], updatedAt: null };
      }

      if (!data.bookmakers[bookmaker]) {
        console.warn(
          `[${bookmaker}] Bookmaker not found in response. Available:`,
          Object.keys(data.bookmakers)
        );
        return { props: [], updatedAt: null };
      }

      const markets = data.bookmakers[bookmaker];

      const updatedAt =
        Array.isArray(markets) && markets.length > 0
          ? markets[0].updatedAt
          : null;
      const props = parseAllMarkets(
        markets,
        bookmaker,
        updatedAt,
        targetMarkets
      );
      console.log(
        `[${bookmaker}] Parsed ${props.length} props (player + match)`
      );

      return { props, updatedAt };
    } catch (err) {
      console.error(`[${bookmaker}] Fetch error:`, err);
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

  const linesMatch = (line1, line2) =>
    Math.abs(line1 - line2) <= LINE_TOLERANCE;

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
          if (linesMatch(prop.line, avgLine)) {
            cluster.push(prop);
            added = true;
            break;
          }
        }
        if (!added) clusters.push([prop]);
      }
      for (const cluster of clusters) {
        const uniqueBookmakers = new Set(cluster.map((p) => p.bookmaker));
        if (uniqueBookmakers.size >= MIN_BOOKMAKERS) {
          const avgLine =
            cluster.reduce((sum, p) => sum + p.line, 0) / cluster.length;
          matched.push({
            player: group.player,
            market: group.market,
            marketName: group.marketName,
            marketType: group.marketType,
            category: group.category,
            avgLine: Math.round(avgLine * 2) / 2,
            props: cluster,
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

        // IMPROVED: Check if any book has both over AND under (Kambi often does)
        // Prioritize Kambi, then Pinnacle, then any book with both sides
        const sharpBookPriority = ["Kambi", "Pinnacle"];
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
          if (evPercent >= MIN_EV_PERCENT) opportunities.push(lineObj);
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

        // De-vig each bookmaker and average
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

        const avgFairProbOver =
          devigged.reduce((sum, d) => sum + d.fairProbOver, 0) /
          devigged.length;
        const avgFairProbUnder =
          devigged.reduce((sum, d) => sum + d.fairProbUnder, 0) /
          devigged.length;

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
          if (evPercent >= MIN_EV_PERCENT) opportunities.push(lineObj);
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
          if (evPercent >= MIN_EV_PERCENT) opportunities.push(lineObj);
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

  const analyzeMatchInternal = async (match, onProgress) => {
    console.log(
      `\n========== ANALYZING MATCH: ${match.home} vs ${match.away} ==========`
    );
    console.log(`[Match] ID: ${match.id}, League: ${match.league?.name}`);
    console.log(`[Match] Selected markets:`, selectedMarkets);

    // Build target markets from current selection
    const targetMarkets = buildTargetMarkets(selectedMarkets);
    console.log(`[Match] Target markets built:`, Object.keys(targetMarkets));

    // First, try to get cached odds for this event (saves API calls)
    const cachedData = await fetchCachedOdds(match.id);
    const usingCache = cachedData && cachedData.bookmakers && Object.keys(cachedData.bookmakers).length > 0;

    const allProps = [];

    if (usingCache) {
      const cachedBookmakers = Object.keys(cachedData.bookmakers).length;
      console.log(`[Match ${match.id}] USING CACHE with ${cachedBookmakers} bookmakers`);
      // When using cache, process all bookmakers instantly
      if (onProgress) onProgress(ALL_BOOKMAKERS.length, 'Using cached data', 'CACHE');

      for (const bookmaker of ALL_BOOKMAKERS) {
        const { props } = await fetchBookmakerOdds(
          match.id,
          bookmaker,
          targetMarkets,
          cachedData
        );
        allProps.push(...props);
      }
    } else {
      console.log(`[Match ${match.id}] NO CACHE - using direct API`);
      // No cache - fetch from API with progress animation
      for (let i = 0; i < ALL_BOOKMAKERS.length; i++) {
        const bookmaker = ALL_BOOKMAKERS[i];
        if (onProgress) onProgress(i + 1, `Fetching ${bookmaker}...`, 'API');
        const { props } = await fetchBookmakerOdds(
          match.id,
          bookmaker,
          targetMarkets,
          null
        );
        allProps.push(...props);
        // Add delay between API requests
        if (i < ALL_BOOKMAKERS.length - 1)
          await new Promise((r) => setTimeout(r, 200));
      }
    }

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
      const toDate = getNext48HoursDate();
      const allMatches = [];

      // Fetch matches from all selected leagues
      for (const leagueSlug of selectedLeagues) {
        const url = `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${leagueSlug}&status=pending&to=${toDate}`;
        try {
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            allMatches.push(...data);
          }
        } catch (err) {
          console.warn(`Failed to fetch ${leagueSlug}:`, err);
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
        "leagues"
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
    <div>
      {/* Header Section */}
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)",
          borderRadius: 20,
          padding: "24px 32px",
          marginBottom: 24,
          border: "1px solid rgba(34, 197, 94, 0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                margin: 0,
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Football EV Scraping
            </h1>
            <p style={{ color: "#94a3b8", margin: "8px 0 0 0", fontSize: 14 }}>
              De-vigged EV calculation across {ALL_BOOKMAKERS.length} bookmakers
              - {selectedLeagues.length} leagues selected
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
              sport="football"
            />
            <button
              onClick={refreshAll}
              disabled={loading || analyzing}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                border: "1px solid rgba(34, 197, 94, 0.5)",
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
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
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    marginBottom: 24,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(34, 197, 94, 0.15)",
                      border: "1px solid rgba(34, 197, 94, 0.3)",
                      borderRadius: 12,
                      padding: "12px 20px",
                    }}
                  >
                    <div
                      style={{
                        color: "#22c55e",
                        fontSize: 24,
                        fontWeight: 800,
                      }}
                    >
                      {visibleOpps}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>
                      +EV Bets ({minEVFilter}%+)
                    </div>
                  </div>
                  <div
                    style={{
                      background: "rgba(59, 130, 246, 0.15)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      borderRadius: 12,
                      padding: "12px 20px",
                    }}
                  >
                    <div
                      style={{
                        color: "#60a5fa",
                        fontSize: 24,
                        fontWeight: 800,
                      }}
                    >
                      {trackedBets.length}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>
                      Tracked Bets
                    </div>
                  </div>
                  <div
                    style={{
                      background: "rgba(100, 116, 139, 0.15)",
                      border: "1px solid rgba(100, 116, 139, 0.3)",
                      borderRadius: 12,
                      padding: "12px 20px",
                    }}
                  >
                    <div
                      style={{
                        color: "#e2e8f0",
                        fontSize: 24,
                        fontWeight: 800,
                      }}
                    >
                      {
                        Object.keys(computedMatchData).filter(
                          (id) => computedMatchData[id].analyzed
                        ).length
                      }{" "}
                      / {matches.length}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>
                      Matches
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Bookmaker Filter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 20,
              padding: "12px 16px",
              background: "rgba(30, 41, 59, 0.6)",
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
              Show EV from:
            </span>
            {PLAYABLE_BOOKMAKERS.map((bookmaker) => (
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
                  border: `1px solid ${
                    selectedBookmakers[bookmaker]
                      ? "rgba(34, 197, 94, 0.4)"
                      : "rgba(100, 116, 139, 0.3)"
                  }`,
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
                <span
                  style={{
                    color: selectedBookmakers[bookmaker]
                      ? "#22c55e"
                      : "#94a3b8",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {bookmaker}
                </span>
              </label>
            ))}
          </div>

          {/* Market Filter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              padding: "12px 16px",
              background: "rgba(30, 41, 59, 0.6)",
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
              Markets:
            </span>
            {AVAILABLE_MARKETS.map((market) => (
              <label
                key={market.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  padding: "5px 10px",
                  borderRadius: 8,
                  background: selectedMarkets.includes(market.key)
                    ? "rgba(59, 130, 246, 0.2)"
                    : "rgba(100, 116, 139, 0.2)",
                  border: `1px solid ${
                    selectedMarkets.includes(market.key)
                      ? "rgba(59, 130, 246, 0.4)"
                      : "rgba(100, 116, 139, 0.3)"
                  }`,
                }}
                title={
                  market.oneWay ? "One-way bet (no under)" : "Over/Under market"
                }
              >
                <input
                  type="checkbox"
                  checked={selectedMarkets.includes(market.key)}
                  onChange={() => toggleMarketFilter(market.key)}
                  style={{
                    width: 14,
                    height: 14,
                    accentColor: "#3b82f6",
                    cursor: "pointer",
                  }}
                />
                <span
                  style={{
                    color: selectedMarkets.includes(market.key)
                      ? "#60a5fa"
                      : "#94a3b8",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {market.label}
                </span>
              </label>
            ))}
          </div>

          {/* De-vig Method Selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 20,
              padding: "12px 16px",
              background: "rgba(30, 41, 59, 0.6)",
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
              De-vig Method:
            </span>
            {Object.values(DEVIG_METHODS).map((method) => (
              <label
                key={method.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "6px 12px",
                  borderRadius: 8,
                  background:
                    devigMethod === method.id
                      ? "rgba(168, 85, 247, 0.2)"
                      : "rgba(100, 116, 139, 0.2)",
                  border: `1px solid ${
                    devigMethod === method.id
                      ? "rgba(168, 85, 247, 0.4)"
                      : "rgba(100, 116, 139, 0.3)"
                  }`,
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
                <span
                  style={{
                    color: devigMethod === method.id ? "#a855f7" : "#94a3b8",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {method.name}
                </span>
              </label>
            ))}
          </div>

          {/* Min EV Slider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 20,
              padding: "12px 16px",
              background: "rgba(30, 41, 59, 0.6)",
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <span
              style={{
                color: "#94a3b8",
                fontSize: 13,
                fontWeight: 600,
                minWidth: 100,
              }}
            >
              Min EV%:
            </span>
            <input
              type="range"
              min="1"
              max="50"
              step="0.5"
              value={minEVFilter}
              onChange={(e) => setMinEVFilter(parseFloat(e.target.value))}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                appearance: "none",
                background: `linear-gradient(to right, #22c55e 0%, #22c55e ${
                  ((minEVFilter - 1) / 49) * 100
                }%, rgba(100, 116, 139, 0.3) ${
                  ((minEVFilter - 1) / 49) * 100
                }%, rgba(100, 116, 139, 0.3) 100%)`,
                cursor: "pointer",
              }}
            />
            <span
              style={{
                color: "#22c55e",
                fontSize: 16,
                fontWeight: 700,
                minWidth: 50,
                textAlign: "right",
              }}
            >
              {minEVFilter}%
            </span>
          </div>

          {/* Max Odds Slider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 20,
              padding: "12px 16px",
              background: "rgba(30, 41, 59, 0.6)",
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <span
              style={{
                color: "#94a3b8",
                fontSize: 13,
                fontWeight: 600,
                minWidth: 100,
              }}
            >
              Max Odds:
            </span>
            <input
              type="range"
              min="1.5"
              max="10"
              step="0.5"
              value={maxOddsFilter}
              onChange={(e) => setMaxOddsFilter(parseFloat(e.target.value))}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                appearance: "none",
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${
                  ((maxOddsFilter - 1.5) / 8.5) * 100
                }%, rgba(100, 116, 139, 0.3) ${
                  ((maxOddsFilter - 1.5) / 8.5) * 100
                }%, rgba(100, 116, 139, 0.3) 100%)`,
                cursor: "pointer",
              }}
            />
            <span
              style={{
                color: "#f59e0b",
                fontSize: 16,
                fontWeight: 700,
                minWidth: 50,
                textAlign: "right",
              }}
            >
              {maxOddsFilter}
            </span>
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
                  style={{
                    background: hasEV
                      ? "rgba(34, 197, 94, 0.08)"
                      : "rgba(30, 41, 59, 0.6)",
                    borderRadius: 16,
                    padding: 20,
                    border: hasEV
                      ? "1px solid rgba(34, 197, 94, 0.3)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <span
                          style={{
                            background: "rgba(34, 197, 94, 0.2)",
                            color: "#22c55e",
                            padding: "4px 10px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {match.league?.name || "Football"}
                        </span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>
                          {formatDate(match.date)}
                        </span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>
                          Starts in{" "}
                          <span style={{ color: "#22c55e", fontWeight: 600 }}>
                            {getTimeUntil(match.date)}
                          </span>
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#e2e8f0",
                        }}
                      >
                        {match.home}{" "}
                        <span style={{ color: "#64748b" }}>vs</span>{" "}
                        {match.away}
                      </div>
                      <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
                        Event ID: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{match.id}</span>
                      </div>
                    </div>
                    <div>
                      {isAnalyzed ? (
                        hasEV ? (
                          <span
                            style={{
                              background: "rgba(34, 197, 94, 0.2)",
                              color: "#22c55e",
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            {opportunities.length} +EV
                          </span>
                        ) : (
                          <span
                            style={{
                              background: "rgba(100, 116, 139, 0.2)",
                              color: "#94a3b8",
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontSize: 13,
                            }}
                          >
                            No +EV
                          </span>
                        )
                      ) : (
                        <span
                          style={{
                            background: "rgba(34, 197, 94, 0.2)",
                            color: "#22c55e",
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: 13,
                          }}
                        >
                          Pending...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* EV Opportunities */}
                  {isAnalyzed && opportunities.length > 0 && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#22c55e",
                          marginBottom: 12,
                        }}
                      >
                        +EV Opportunities ({minEVFilter}%+ edge)
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
                            style={{
                              padding: "16px 20px",
                              background:
                                ev.evPercent >= 10
                                  ? "rgba(34, 197, 94, 0.15)"
                                  : "rgba(34, 197, 94, 0.08)",
                              borderRadius: 12,
                              border: `1px solid ${
                                ev.evPercent >= 10
                                  ? "rgba(34, 197, 94, 0.3)"
                                  : "rgba(34, 197, 94, 0.15)"
                              }`,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "#e2e8f0",
                                    fontSize: 15,
                                  }}
                                >
                                  {ev.player}
                                </span>
                                <span
                                  style={{
                                    background: "rgba(100, 116, 139, 0.3)",
                                    color: "#e2e8f0",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  {ev.market}
                                </span>
                                <span
                                  style={{
                                    background:
                                      ev.betType === "OVER"
                                        ? "rgba(34, 197, 94, 0.2)"
                                        : "rgba(239, 68, 68, 0.2)",
                                    color:
                                      ev.betType === "OVER"
                                        ? "#22c55e"
                                        : "#ef4444",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  {ev.betType} {ev.line}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: 18,
                                  fontWeight: 900,
                                  color:
                                    ev.evPercent >= 10 ? "#22c55e" : "#4ade80",
                                }}
                              >
                                +{ev.evPercent.toFixed(1)}%
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginTop: 8,
                                flexWrap: "wrap",
                                gap: 8,
                              }}
                            >
                              <div style={{ fontSize: 13 }}>
                                <span style={{ color: "#64748b" }}>Bet: </span>
                                <span
                                  style={{ color: "#22c55e", fontWeight: 700 }}
                                >
                                  {ev.odds.toFixed(2)}
                                </span>
                                <span style={{ color: "#94a3b8" }}>
                                  {" "}
                                  @ {ev.bookmaker}
                                </span>
                                <span
                                  style={{ color: "#64748b", marginLeft: 12 }}
                                >
                                  Fair:{" "}
                                </span>
                                <span
                                  style={{ color: "#a5b4fc", fontWeight: 600 }}
                                >
                                  {ev.fairOdds?.toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {/* Sharp book odds - deduplicated by bookmaker */}
                            <div
                              style={{
                                marginTop: 8,
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6,
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  marginRight: 6,
                                  fontWeight: 500,
                                }}
                              >
                                Sharp:
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
                                  <span
                                    key={i}
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 6,
                                      fontSize: 12,
                                      background: "rgba(100, 116, 139, 0.2)",
                                      color: "#94a3b8",
                                    }}
                                  >
                                    {o.bookmaker}: {o.odds?.toFixed(2)}
                                  </span>
                                ));
                              })()}
                            </div>

                            {/* Track/Remove buttons */}
                            <div
                              style={{
                                marginTop: 10,
                                borderTop: "1px solid rgba(255,255,255,0.1)",
                                paddingTop: 10,
                              }}
                            >
                              {trackingBetId === generateBetId(ev) ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span
                                    style={{ color: "#94a3b8", fontSize: 12 }}
                                  >
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
                                    style={{
                                      width: 70,
                                      padding: "6px 10px",
                                      borderRadius: 6,
                                      border:
                                        "1px solid rgba(59, 130, 246, 0.5)",
                                      background: "rgba(30, 41, 59, 0.8)",
                                      color: "#e2e8f0",
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
                                      border:
                                        "1px solid rgba(34, 197, 94, 0.5)",
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
                                      border:
                                        "1px solid rgba(100, 116, 139, 0.5)",
                                      background: "rgba(100, 116, 139, 0.15)",
                                      color: "#94a3b8",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 8 }}>
                                  {isBetTracked(ev) ? (
                                    <button
                                      onClick={() =>
                                        untrackBet(generateBetId(ev))
                                      }
                                      style={{
                                        padding: "6px 14px",
                                        borderRadius: 6,
                                        border:
                                          "1px solid rgba(34, 197, 94, 0.5)",
                                        background: "rgba(34, 197, 94, 0.2)",
                                        color: "#22c55e",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: "pointer",
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
                                        border:
                                          "1px solid rgba(59, 130, 246, 0.5)",
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
                                      border:
                                        "1px solid rgba(239, 68, 68, 0.5)",
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
      `}</style>
    </div>
  );
}
