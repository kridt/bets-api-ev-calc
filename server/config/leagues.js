// server/config/leagues.js

/**
 * Supported Football Leagues Configuration
 * Each league has an Odds API slug and display information
 */

const LEAGUES = [
  {
    id: 'epl',
    name: 'England - Premier League',
    country: 'England',
    slug: 'england-premier-league',
    tier: 1,
    active: true
  },
  {
    id: 'laliga',
    name: 'Spain - La Liga',
    country: 'Spain',
    slug: 'spain-laliga',
    tier: 1,
    active: true
  },
  {
    id: 'bundesliga',
    name: 'Germany - Bundesliga',
    country: 'Germany',
    slug: 'germany-bundesliga',
    tier: 1,
    active: true
  },
  {
    id: 'seriea',
    name: 'Italy - Serie A',
    country: 'Italy',
    slug: 'italy-serie-a',
    tier: 1,
    active: true
  },
  {
    id: 'ligue1',
    name: 'France - Ligue 1',
    country: 'France',
    slug: 'france-ligue-1',
    tier: 1,
    active: true
  },
  {
    id: 'eredivisie',
    name: 'Netherlands - Eredivisie',
    country: 'Netherlands',
    slug: 'netherlands-eredivisie',
    tier: 1,
    active: true
  },
  {
    id: 'ligaportugal',
    name: 'Portugal - Liga Portugal',
    country: 'Portugal',
    slug: 'portugal-liga-portugal',
    tier: 1,
    active: true
  },
  {
    id: 'championship',
    name: 'England - Championship',
    country: 'England',
    slug: 'england-championship',
    tier: 2,
    active: true
  },
  {
    id: 'brasileirao',
    name: 'Brazil - Brasileiro Série A',
    country: 'Brazil',
    slug: 'brazil-brasileiro-serie-a',
    tier: 1,
    active: true
  },
  {
    id: 'superliga',
    name: 'Denmark - Superliga',
    country: 'Denmark',
    slug: 'denmark-superliga',
    tier: 1,
    active: true
  }
];

/**
 * Get all active leagues
 */
function getActiveLeagues() {
  return LEAGUES.filter(league => league.active);
}

/**
 * Get league by slug
 */
function getLeagueBySlug(slug) {
  return LEAGUES.find(league => league.slug === slug);
}

/**
 * Get league by ID
 */
function getLeagueById(id) {
  return LEAGUES.find(league => league.id === id);
}

module.exports = {
  LEAGUES,
  getActiveLeagues,
  getLeagueBySlug,
  getLeagueById
};
