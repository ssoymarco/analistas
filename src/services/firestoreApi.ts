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
  // ── Timezone fix ──
  // The mapper on the Cloud Function stores `time` as the raw UTC HH:MM
  // because the server doesn't know the user's timezone. For scheduled
  // matches we recompute the display time from `startingAtUtc` here so the
  // client renders the kickoff in the device's local time (matches the
  // proxy-path behaviour, where `getTimeDisplay` does the same conversion).
  // Live ('45'', 'HT') and finished ('FT') strings are left untouched.
  let time = d.time;
  if (d.status === 'scheduled' && d.startingAtUtc) {
    try {
      const iso = d.startingAtUtc.replace(' ', 'T').replace(/Z?$/, 'Z');
      const dt = new Date(iso);
      if (!isNaN(dt.getTime())) {
        const hh = dt.getHours().toString().padStart(2, '0');
        const mm = dt.getMinutes().toString().padStart(2, '0');
        time = `${hh}:${mm}`;
      }
    } catch { /* keep stored value as best-effort fallback */ }
  }

  // Derive the LOCAL date from the kickoff timestamp. The doc's `d.date` is
  // the UTC date written by the Cloud Function (used to query Firestore in
  // bulk), but for client filtering ("does this match belong to local
  // today?") we need the local-tz date. This keeps Match.date semantically
  // identical to what the proxy path produces.
  let date = d.date;
  if (d.startingAtUtc) {
    try {
      const dt = new Date(d.startingAtUtc.replace(' ', 'T').replace(/Z?$/, 'Z'));
      if (!isNaN(dt.getTime())) {
        const y  = dt.getFullYear();
        const mo = (dt.getMonth() + 1).toString().padStart(2, '0');
        const da = dt.getDate().toString().padStart(2, '0');
        date = `${y}-${mo}-${da}`;
      }
    } catch { /* keep d.date as fallback */ }
  }

  return {
    id:             d.id,
    homeTeam:       teamFromDoc(d.homeTeam),
    awayTeam:       teamFromDoc(d.awayTeam),
    homeScore:      d.homeScore,
    awayScore:      d.awayScore,
    status:         d.status,
    time,
    minute:         d.minute ?? undefined,
    league:         d.league,
    leagueLogo:     d.leagueLogo || undefined,
    leagueId:       d.leagueId,
    date,
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
 * Compute the UTC dates that overlap with a local-tz calendar day. For users
 * in west-of-UTC timezones (the Americas) the local day always spans 2 UTC
 * dates (e.g. local Wed 21 May in Mexico City = UTC 21 May 06:00 → UTC 22 May
 * 05:59). Mirrors `getUtcDatesForLocalDay` in sportsApi.ts; duplicated here to
 * keep this module free of circular imports.
 */
function getUtcDatesForLocalDay(localDateStr: string): string[] {
  // Parsing without 'Z' uses the device's local timezone (intentional).
  const startOfDay = new Date(`${localDateStr}T00:00:00`);
  const endOfDay   = new Date(`${localDateStr}T23:59:59`);
  const utcStart = startOfDay.toISOString().slice(0, 10);
  const utcEnd   = endOfDay.toISOString().slice(0, 10);
  return utcStart === utcEnd ? [utcStart] : [utcStart, utcEnd];
}

/**
 * Fetch all matches for a given local date ("YYYY-MM-DD"). The Cloud Functions
 * keep yesterday/today/tomorrow synced — dates outside that window will return
 * an empty array (caller should fall back to the SportMonks proxy).
 *
 * Queries every UTC date that overlaps with the local day (1 or 2 depending on
 * timezone), then filters client-side back to the local date. Without this,
 * matches whose UTC date differs from the local date (e.g. 8pm CDMX kickoffs,
 * which are stored as UTC date +1) would be missed.
 */
export async function getFixturesByDateFromFirestore(localDate: string): Promise<Match[]> {
  const utcDates = getUtcDatesForLocalDay(localDate);
  const seen = new Set<string>();
  const results: Match[] = [];
  await Promise.all(utcDates.map(async utcDate => {
    const q = query(collection(db, 'matches'), where('date', '==', utcDate));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const m = matchFromDoc(d.data() as MatchDoc);
      if (m.date !== localDate) continue;       // outside the local day
      if (seen.has(m.id)) continue;             // dedupe (rare overlap)
      seen.add(m.id);
      results.push(m);
    }
  }));
  return results;
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
 * Subscribe to all matches for a given LOCAL date (device timezone).
 *
 * Because the Cloud Function indexes match documents by their UTC date and a
 * single local day spans up to 2 UTC dates (in any non-UTC zone), this fans
 * out to one onSnapshot per UTC date that overlaps and merges the results.
 * The combined set is then filtered client-side to the matches whose KICKOFF
 * actually falls on the user's local day.
 *
 * Returns a single unsubscribe that tears down all underlying listeners.
 */
export function subscribeFixturesByDate(
  localDate: string,
  onChange: (matches: Match[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const utcDates = getUtcDatesForLocalDay(localDate);
  // Per-UTC-date snapshot cache keyed by docId, so each listener only owns
  // its own slice of the merged view.
  const buckets: Record<string, Map<string, Match>> = {};
  for (const d of utcDates) buckets[d] = new Map();

  const emit = () => {
    const seen = new Set<string>();
    const out: Match[] = [];
    for (const d of utcDates) {
      for (const m of buckets[d].values()) {
        if (m.date !== localDate) continue;  // outside the local day
        if (seen.has(m.id)) continue;        // rare overlap (race conditions)
        seen.add(m.id);
        out.push(m);
      }
    }
    onChange(out);
  };

  const unsubs = utcDates.map(utcDate => {
    const q = query(collection(db, 'matches'), where('date', '==', utcDate));
    return onSnapshot(
      q,
      snap => {
        const bucket = buckets[utcDate];
        bucket.clear();
        for (const doc of snap.docs) {
          const m = matchFromDoc(doc.data() as MatchDoc);
          bucket.set(m.id, m);
        }
        emit();
      },
      err => onError?.(err),
    );
  });

  return () => unsubs.forEach(u => u());
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
