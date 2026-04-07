// ── SportMonks API Service Layer ─────────────────────────────────────────────
//
// This file is the ONLY place that touches external data. All screens and
// components import from here — never from mockData directly.
//
// To connect SportMonks:
//   1. Set SPORTMONKS_API_TOKEN in your .env (via expo-constants or similar)
//   2. Replace each function body with the real fetch call
//   3. Map the API response to the existing types — no component changes needed
//
// SportMonks v3 docs: https://docs.sportmonks.com/football
// Base URL: https://api.sportmonks.com/v3/football

import { matches as mockMatches, news as mockNews, leagues as mockLeagues } from '../data/mockData';
import type { Match, League, NewsArticle } from '../data/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Returns all fixtures for a given date (ISO "YYYY-MM-DD").
 * SportMonks endpoint: GET /fixtures/date/{date}?include=participants;scores;state
 */
export async function getFixturesByDate(_date: string): Promise<Match[]> {
  // TODO: replace with SportMonks call
  return mockMatches;
}

/**
 * Returns a single fixture by its SportMonks fixture ID.
 * SportMonks endpoint: GET /fixtures/{id}?include=participants;scores;events;statistics;lineups;odds
 */
export async function getFixtureById(id: string): Promise<Match | undefined> {
  // TODO: replace with SportMonks call
  return mockMatches.find(m => m.id === id);
}

/**
 * Returns live fixtures.
 * SportMonks endpoint: GET /livescores?include=participants;scores;state
 */
export async function getLiveFixtures(): Promise<Match[]> {
  // TODO: replace with SportMonks call
  return mockMatches.filter(m => m.status === 'live');
}

// ── Leagues ───────────────────────────────────────────────────────────────────

/**
 * Returns the list of leagues / competitions.
 * SportMonks endpoint: GET /leagues?include=country
 */
export async function getLeagues(): Promise<League[]> {
  // TODO: replace with SportMonks call
  return mockLeagues;
}

// ── News ──────────────────────────────────────────────────────────────────────

/**
 * Returns news articles.
 * SportMonks has a news endpoint: GET /news/football
 */
export async function getNews(): Promise<NewsArticle[]> {
  // TODO: replace with SportMonks call
  return mockNews;
}
