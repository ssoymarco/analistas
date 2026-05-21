/**
 * firestoreApi.ts
 *
 * Client-side Firestore reads for sports data populated by Cloud Functions.
 *
 * Architecture:
 *   SportMonks → Cloud Functions → Firestore  (background, server-side)
 *   Firestore  → this file        → app UI    (real-time, client-side)
 *
 * Why Firestore instead of the proxy:
 *   - Real-time push (onSnapshot) — when a goal hits, the app sees it
 *     in ~100ms with no polling.
 *   - Zero SportMonks tokens consumed per app open.
 *   - Multiple users hitting the same data = 1 Firestore read per change,
 *     not N SportMonks API calls.
 *
 * Coverage:
 *   ✅ matches    (livescores, fixtures by date in ±1 day window)
 *   ✅ standings  (per seasonId)
 *   ✅ topscorers (per seasonId)
 *   ❌ match detail (lineups, events, stats) — still SportMonks via proxy
 *   ❌ player detail, league detail, H2H — still SportMonks via proxy
 *
 * Auth requirement: every read needs `request.auth != null` (firestore.rules).
 * The app signs in anonymously on first launch via AuthContext, so this is
 * satisfied automatically.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Match,
  MatchStatus,
  LeagueStanding,
  Team,
} from '../data/types';

// ── Firestore document shapes (mirror Cloud Functions types.ts) ──────────────

interface TeamDoc {
  id: string;
  name: string;
  shortName: string;
  logo: string;
}

interface MatchDoc {
  id: string;
  homeTeam: TeamDoc;
  awayTeam: TeamDoc;
  homeScore: number;
  awayScore: number;
  homeScoreHT: number | null;
  awayScoreHT: number | null;
  status: MatchStatus;
  stateId: number;
  stateLabel: string | null;
  minute: number | null;
  time: string;
  league: string;
  leagueId: string;
  leagueLogo: string;
  date: string;            // local-day key, "YYYY-MM-DD"
  startingAtUtc: string;
  seasonId: number | null;
  updatedAt: unknown;       // Firestore Timestamp — we never reach into it client-side
}

interface StandingRowDoc {
  position: number;
  team: TeamDoc;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  groupId: number | null;
}

interface StandingsDoc {
  seasonId: number;
  leagueId: number;
  rows: StandingRowDoc[];
  updatedAt: unknown;
}

interface TopScorerDoc {
  playerId: string;
  playerName: string;
  playerImage: string;
  teamName: string;
  teamLogo: string;
  goals: number;
  assists: number;
  position: number;
}

interface TopScorersDoc {
  seasonId: number;
  leagueId: number;
  scorers: TopScorerDoc[];
  updatedAt: unknown;
}

// ── App-facing TopScorer shape (matches sportsApi.getTopScorers result) ──────

export interface FirestoreTopScorer {
  playerId: string;
  playerName: string;
  playerImage: string;
  teamName: string;
  teamLogo: string;
  goals: number;
  position: number;
}

// ── Doc → App-type mappers ───────────────────────────────────────────────────

function teamFromDoc(t: TeamDoc): Team {
  return {
    id:        t.id,
    name:      t.name,
    shortName: t.shortName,
    logo:      t.logo,
  };
}

function matchFromDoc(d: MatchDoc): Match {
  return {
    id:             d.id,
    homeTeam:       teamFromDoc(d.homeTeam),
    awayTeam:       teamFromDoc(d.awayTeam),
    homeScore:      d.homeScore,
    awayScore:      d.awayScore,
    status:         d.status,
    time:           d.time,
    minute:         d.minute ?? undefined,
    league:         d.league,
    leagueLogo:     d.leagueLogo || undefined,
    leagueId:       d.leagueId,
    date:           d.date,
    startingAtUtc:  d.startingAtUtc || undefined,
    seasonId:       d.seasonId ?? undefined,
    homeScoreHT:    d.homeScoreHT ?? undefined,
    awayScoreHT:    d.awayScoreHT ?? undefined,
    stateLabel:     d.stateLabel ?? undefined,
  };
}

function standingFromRow(r: StandingRowDoc): LeagueStanding {
  return {
    position:       r.position,
    team:           teamFromDoc(r.team),
    played:         r.played,
    won:            r.won,
    drawn:          r.drawn,
    lost:           r.lost,
    goalsFor:       r.goalsFor,
    goalsAgainst:   r.goalsAgainst,
    goalDifference: r.goalDifference,
    points:         r.points,
    groupId:        r.groupId,
  };
}

function topScorerFromDoc(t: TopScorerDoc): FirestoreTopScorer {
  return {
    playerId:    t.playerId,
    playerName:  t.playerName,
    playerImage: t.playerImage,
    teamName:    t.teamName,
    teamLogo:    t.teamLogo,
    goals:       t.goals,
    position:    t.position,
  };
}

// ── One-shot fetches (use when you don't need real-time) ─────────────────────

/**
 * Fetch all matches currently marked `status === 'live'`.
 * Returns an empty array on no live matches; throws on permission errors.
 */
export async function getLivescoresFromFirestore(): Promise<Match[]> {
  const q = query(collection(db, 'matches'), where('status', '==', 'live'));
  const snap = await getDocs(q);
  return snap.docs.map(d => matchFromDoc(d.data() as MatchDoc));
}

/**
 * Fetch all matches for a given local date ("YYYY-MM-DD"). The Cloud Functions
 * keep yesterday/today/tomorrow synced — dates outside that window will return
 * an empty array (caller should fall back to the SportMonks proxy).
 */
export async function getFixturesByDateFromFirestore(date: string): Promise<Match[]> {
  const q = query(collection(db, 'matches'), where('date', '==', date));
  const snap = await getDocs(q);
  return snap.docs.map(d => matchFromDoc(d.data() as MatchDoc));
}

/**
 * Fetch standings for a season. Returns an empty array if not yet synced.
 */
export async function getStandingsFromFirestore(seasonId: number): Promise<LeagueStanding[]> {
  const ref = doc(db, 'standings', String(seasonId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];
  const data = snap.data() as StandingsDoc;
  return (data.rows ?? []).map(standingFromRow);
}

/**
 * Fetch top scorers for a season. Returns an empty array if not yet synced.
 */
export async function getTopScorersFromFirestore(seasonId: number): Promise<FirestoreTopScorer[]> {
  const ref = doc(db, 'topscorers', String(seasonId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];
  const data = snap.data() as TopScorersDoc;
  return (data.scorers ?? []).map(topScorerFromDoc);
}

// ── Real-time subscriptions (onSnapshot — push updates from server) ──────────

/**
 * Subscribe to currently-live matches. Callback fires immediately with the
 * current snapshot, then again on every server-side write that affects the
 * query result (goal scored, status change, new live match, etc.).
 *
 * Returns an unsubscribe function — call it on cleanup (useEffect return).
 */
export function subscribeLivescores(
  onChange: (matches: Match[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'matches'), where('status', '==', 'live'));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => matchFromDoc(d.data() as MatchDoc))),
    err => onError?.(err),
  );
}

/**
 * Subscribe to all matches for a given local date. Returns unsubscribe.
 */
export function subscribeFixturesByDate(
  date: string,
  onChange: (matches: Match[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'matches'), where('date', '==', date));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => matchFromDoc(d.data() as MatchDoc))),
    err => onError?.(err),
  );
}

/**
 * Subscribe to standings for a season. Returns unsubscribe.
 */
export function subscribeStandings(
  seasonId: number,
  onChange: (rows: LeagueStanding[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const ref = doc(db, 'standings', String(seasonId));
  return onSnapshot(
    ref,
    snap => {
      if (!snap.exists()) { onChange([]); return; }
      const data = snap.data() as StandingsDoc;
      onChange((data.rows ?? []).map(standingFromRow));
    },
    err => onError?.(err),
  );
}

/**
 * Subscribe to top scorers for a season. Returns unsubscribe.
 */
export function subscribeTopScorers(
  seasonId: number,
  onChange: (scorers: FirestoreTopScorer[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const ref = doc(db, 'topscorers', String(seasonId));
  return onSnapshot(
    ref,
    snap => {
      if (!snap.exists()) { onChange([]); return; }
      const data = snap.data() as TopScorersDoc;
      onChange((data.scorers ?? []).map(topScorerFromDoc));
    },
    err => onError?.(err),
  );
}

// ── Season index (powers the season-picker dropdown) ────────────────────────

/** One available season for a league — element of SeasonIndexDoc.seasons */
export interface AvailableSeason {
  id:       number;
  name:     string;     // "2025/2026", "2014", "Apertura 2026" — directly from SportMonks
  year:     number;     // primary sort key (newest first)
  current:  boolean;    // true when SportMonks marks the season as is_current
  finished: boolean;
  pending:  boolean;
}

interface SeasonIndexDoc {
  leagueId:   number;
  leagueName: string;
  seasons:    AvailableSeason[];
  updatedAt:  unknown;
}

/**
 * One-shot fetch of the list of seasons available for a league. Returns an
 * empty array when the league has never been crawled (caller should fall
 * back to a single-season UI in that case).
 */
export async function getAvailableSeasons(leagueId: number): Promise<AvailableSeason[]> {
  const snap = await getDoc(doc(db, 'season_index', String(leagueId)));
  if (!snap.exists()) return [];
  const data = snap.data() as SeasonIndexDoc;
  return Array.isArray(data.seasons) ? data.seasons : [];
}

/**
 * Subscribe to the season list for a league. Fires immediately with the
 * current list and again whenever the season_index doc is rewritten (e.g.
 * after a new crawl pass that adds a fresh season).
 */
export function subscribeAvailableSeasons(
  leagueId: number,
  onChange: (seasons: AvailableSeason[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'season_index', String(leagueId)),
    snap => {
      if (!snap.exists()) { onChange([]); return; }
      const data = snap.data() as SeasonIndexDoc;
      onChange(Array.isArray(data.seasons) ? data.seasons : []);
    },
    err => onError?.(err),
  );
}

// ── Internal helpers (exported for tests / advanced use) ─────────────────────

/** Whether a given date is within the Cloud Functions sync window (±1 day). */
export function isWithinFirestoreSyncWindow(date: string): boolean {
  const today = new Date();
  const targetDay = new Date(`${date}T00:00:00Z`);
  const diffDays = Math.round(
    (targetDay.getTime() - today.setUTCHours(0, 0, 0, 0)) / (24 * 3600 * 1000),
  );
  return diffDays >= -1 && diffDays <= 1;
}
