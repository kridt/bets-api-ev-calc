// src/utils/teamMatcher.js - Match teams between different APIs

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Normalize team name for matching
 */
function normalizeTeamName(name) {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes
    .replace(/\s+(fc|sc|cf|afc|bfc|united|city|town|athletic|rovers|wanderers|albion)$/i, '')
    // Remove special characters
    .replace(/[^a-z0-9\s]/g, ' ')
    // Remove extra spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity score between two team names (0-1)
 */
function calculateSimilarity(name1, name2) {
  const norm1 = normalizeTeamName(name1);
  const norm2 = normalizeTeamName(name2);

  // Exact match
  if (norm1 === norm2) return 1.0;

  // Check if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.9;
  }

  // Calculate Levenshtein distance
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 0;

  const distance = levenshteinDistance(norm1, norm2);
  const similarity = 1 - (distance / maxLen);

  return similarity;
}

/**
 * Match a single match between two sources
 * @param {Object} match1 - Match from source 1
 * @param {Object} match2 - Match from source 2
 * @param {Object} options - Matching options
 */
export function matchMatches(match1, match2, options = {}) {
  const {
    homeKey1 = 'home',
    awayKey1 = 'away',
    homeKey2 = 'home',
    awayKey2 = 'away',
    dateKey1 = 'date',
    dateKey2 = 'date',
    leagueKey1 = 'league',
    leagueKey2 = 'league',
    minSimilarity = 0.7,
    dateWindowHours = 24
  } = options;

  // Extract team names
  const home1 = typeof match1[homeKey1] === 'object' ? match1[homeKey1].name : match1[homeKey1];
  const away1 = typeof match1[awayKey1] === 'object' ? match1[awayKey1].name : match1[awayKey1];
  const home2 = typeof match2[homeKey2] === 'object' ? match2[homeKey2].name : match2[homeKey2];
  const away2 = typeof match2[awayKey2] === 'object' ? match2[awayKey2].name : match2[awayKey2];

  // Calculate team name similarities
  const homeSimilarity = calculateSimilarity(home1, home2);
  const awaySimilarity = calculateSimilarity(away1, away2);

  // Both teams must match reasonably well
  if (homeSimilarity < minSimilarity || awaySimilarity < minSimilarity) {
    return {
      matched: false,
      confidence: 0,
      reason: 'Team names do not match'
    };
  }

  // Check dates if available
  if (match1[dateKey1] && match2[dateKey2]) {
    const date1 = new Date(match1[dateKey1]);
    const date2 = new Date(match2[dateKey2]);
    const hoursDiff = Math.abs(date1 - date2) / (1000 * 60 * 60);

    if (hoursDiff > dateWindowHours) {
      return {
        matched: false,
        confidence: 0,
        reason: `Dates too far apart (${hoursDiff.toFixed(1)} hours)`
      };
    }
  }

  // Calculate overall confidence
  const teamConfidence = (homeSimilarity + awaySimilarity) / 2;

  // Check league if available
  let leagueMatch = true;
  if (match1[leagueKey1] && match2[leagueKey2]) {
    const league1 = typeof match1[leagueKey1] === 'object' ? match1[leagueKey1].name || match1[leagueKey1].slug : match1[leagueKey1];
    const league2 = typeof match2[leagueKey2] === 'object' ? match2[leagueKey2].name || match2[leagueKey2].slug : match2[leagueKey2];

    const leagueSimilarity = calculateSimilarity(league1, league2);
    leagueMatch = leagueSimilarity > 0.5;
  }

  if (!leagueMatch) {
    return {
      matched: false,
      confidence: teamConfidence,
      reason: 'Leagues do not match'
    };
  }

  return {
    matched: true,
    confidence: teamConfidence,
    homeSimilarity,
    awaySimilarity,
    details: {
      home1,
      away1,
      home2,
      away2
    }
  };
}

/**
 * Find matching event from a list of events
 * @param {Object} targetMatch - Match to find
 * @param {Array} eventsList - List of events to search
 * @param {Object} options - Matching options
 */
export function findMatchingEvent(targetMatch, eventsList, options = {}) {
  const {
    minConfidence = 0.8,
    returnAll = false
  } = options;

  const matches = [];

  for (const event of eventsList) {
    const matchResult = matchMatches(targetMatch, event, options);

    if (matchResult.matched && matchResult.confidence >= minConfidence) {
      matches.push({
        event,
        ...matchResult
      });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  return returnAll ? matches : matches[0];
}

/**
 * Match multiple matches against a list of events
 * @param {Array} matchesList - Matches to find
 * @param {Array} eventsList - Events to search
 * @param {Object} options - Matching options
 */
export function matchMultipleEvents(matchesList, eventsList, options = {}) {
  const results = [];

  for (const match of matchesList) {
    const matchedEvent = findMatchingEvent(match, eventsList, options);

    if (matchedEvent) {
      results.push({
        original: match,
        matched: matchedEvent.event,
        confidence: matchedEvent.confidence,
        details: matchedEvent.details
      });
    } else {
      results.push({
        original: match,
        matched: null,
        confidence: 0,
        reason: 'No matching event found'
      });
    }
  }

  return results;
}

/**
 * Common team name aliases (for manual mapping)
 */
export const TEAM_ALIASES = {
  // English Premier League
  'Man United': 'Manchester United',
  'Man City': 'Manchester City',
  'Spurs': 'Tottenham Hotspur',
  'Tottenham': 'Tottenham Hotspur',
  'Newcastle': 'Newcastle United',
  'West Ham': 'West Ham United',
  'Brighton': 'Brighton & Hove Albion',
  'Wolves': 'Wolverhampton Wanderers',
  'Nott\'m Forest': 'Nottingham Forest',

  // La Liga
  'Atlético': 'Atletico Madrid',
  'Atleti': 'Atletico Madrid',
  'Barça': 'Barcelona',
  'Sevilla FC': 'Sevilla',

  // Bundesliga
  'Bayern': 'Bayern Munich',
  'Dortmund': 'Borussia Dortmund',
  'Leverkusen': 'Bayer Leverkusen',
  'Gladbach': 'Borussia Monchengladbach',

  // Serie A
  'Inter': 'Inter Milan',
  'Milan': 'AC Milan',
  'Juve': 'Juventus',
  'Roma': 'AS Roma',

  // Add more as needed
};

/**
 * Resolve team alias
 */
export function resolveTeamAlias(teamName) {
  return TEAM_ALIASES[teamName] || teamName;
}
