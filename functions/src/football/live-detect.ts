/**
 * football/live-detect.ts
 *
 * Change detection for API-Sports live fixtures. Pure: takes the previous
 * per-match snapshot + current fixtures, returns detected changes and the next
 * snapshot. Same event vocabulary as the legacy detector (detect-changes.ts)
 * so notification copy, Modo Estadio and Modo Rival behave identically.
 *
 * Key differences from Sportmonks that this handles:
 *   - Finished matches DROP OUT of `/fixtures?live=all`. The poller re-fetches
 *     snapshot matches missing from the feed via `/fixtures?ids=` and passes
 *     them in here, so the FT transition is still observed.
 *   - Events have no ids. Scorer/card/sub details come from counting events
 *     per side (count-based diffing is naturally idempotent) and reading the
 *     newest matching event.
 *   - Own goals: API-Sports credits the event to the team that BENEFITS, so
 *     "latest goal event of the scoring side" also finds own goals.
 */

import type { FbTeamRef } from '../shared/football/model';
import type { AfEvent, AfFixtureCore } from './apisports-types';
import {
  countBy, isFinishedShort, isLiveShort, isMissedPenaltyEvent, isPlayingShort,
  isRedCardEvent, isScoredGoalEvent, isYellowCardEvent, mapFixtureToMatch,
} from './mapping';

export type FbChangeType =
  | 'goal' | 'goalCancelled' | 'matchStart' | 'halftime' | 'secondHalfStart'
  | 'matchEnd' | 'extraTimeStart' | 'penaltiesStart' | 'redCard' | 'yellowCard'
  | 'substitution' | 'matchSuspended' | 'matchReminder' | 'lineups'
  | 'rivalLoss' | 'rivalBigLoss' | 'rivalRedCard' | 'rivalPenMiss';

export interface FbChange {
  type: FbChangeType;
  matchId: string;
  homeTeam: FbTeamRef;
  awayTeam: FbTeamRef;
  homeScore: number;
  awayScore: number;
  league: string;
  leagueId: string;
  popularity: number;
  /** Side that caused the event (goal/card/sub) or that the bad news is about (rival). */
  side?: 'home' | 'away';
  goalKind?: 'normal' | 'penalty' | 'own';
  scorerName?: string;
  playerName?: string;
  /** Substitutions: player coming ON. */
  relatedPlayerName?: string;
  minute?: number | null;
  homePenScore?: number | null;
  awayPenScore?: number | null;
}

/** Compact per-match state persisted between polls (fb_meta/liveSnapshot). */
export interface SnapEntry {
  st: string;        // statusShort
  hs: number; as: number;
  rh: number; ra: number;
  yh: number; ya: number;
  sh: number; sa: number;
  ph: number; pa: number;
  /** Kickoff unix seconds (lets the poller drop stale entries). */
  ts: number;
  /** League popularity (drives poll cadence and enrichment priority). */
  pp?: number;
  /** Last live-clock anchor written for the row: [periodStartedAt, offset]. */
  lc?: [number, number];
  /** One-time latches. */
  f: {
    start?: true; ht?: true; h2?: true; et?: true; pen?: true; susp?: true;
    end?: true; rival?: true; rem?: true; lin?: true;
  };
}

export type Snapshot = Record<string, SnapEntry>;

type FixtureWithEvents = AfFixtureCore & { events?: AfEvent[] };

function latest(events: AfEvent[] | undefined, teamId: number, pred: (e: AfEvent) => boolean): AfEvent | undefined {
  if (!events) return undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.team?.id === teamId && pred(e)) return e;
  }
  return undefined;
}

function goalKindOf(e: AfEvent | undefined): 'normal' | 'penalty' | 'own' {
  if (!e) return 'normal';
  if (/own goal/i.test(e.detail)) return 'own';
  if (/penalty/i.test(e.detail)) return 'penalty';
  return 'normal';
}

function minuteOf(e: AfEvent | undefined, fallback: number | null): number | null {
  if (!e?.time?.elapsed) return fallback;
  return e.time.elapsed + (e.time.extra ?? 0);
}

/** Build a snapshot entry from a fixture, carrying latches over from `prev`. */
export function snapEntryFor(f: FixtureWithEvents, prev?: SnapEntry): SnapEntry {
  const h = f.teams.home.id;
  const a = f.teams.away.id;
  const ev = f.events;
  // Live-feed fixtures always carry events; re-fetched ones may not. When
  // events are missing keep the previous counts so we don't fake decreases.
  const has = Array.isArray(ev);
  return {
    st: f.fixture.status.short,
    hs: f.goals.home ?? 0,
    as: f.goals.away ?? 0,
    rh: has ? countBy(ev, h, isRedCardEvent) : (prev?.rh ?? 0),
    ra: has ? countBy(ev, a, isRedCardEvent) : (prev?.ra ?? 0),
    yh: has ? countBy(ev, h, isYellowCardEvent) : (prev?.yh ?? 0),
    ya: has ? countBy(ev, a, isYellowCardEvent) : (prev?.ya ?? 0),
    sh: has ? countBy(ev, h, e => e.type === 'subst') : (prev?.sh ?? 0),
    sa: has ? countBy(ev, a, e => e.type === 'subst') : (prev?.sa ?? 0),
    ph: has ? countBy(ev, h, isMissedPenaltyEvent) : (prev?.ph ?? 0),
    pa: has ? countBy(ev, a, isMissedPenaltyEvent) : (prev?.pa ?? 0),
    ts: f.fixture.timestamp,
    pp: prev?.pp,
    lc: prev?.lc,
    f: { ...(prev?.f ?? {}) },
  };
}

export interface DetectResult {
  changes: FbChange[];
  next: Snapshot;
}

/**
 * Diff current fixtures against the previous snapshot.
 *
 * @param fixtures  live-feed fixtures + re-fetched fixtures that left the feed
 * @param prev      previous snapshot
 * @param nowSec    clock (injected for tests)
 */
export function detectChanges(fixtures: FixtureWithEvents[], prev: Snapshot, nowSec: number): DetectResult {
  const changes: FbChange[] = [];
  const next: Snapshot = {};

  for (const f of fixtures) {
    const id = String(f.fixture.id);
    const p = prev[id];
    const cur = snapEntryFor(f, p);
    next[id] = cur;

    const row = mapFixtureToMatch(f, { nowSec });
    cur.pp = row.popularity;
    const base: Omit<FbChange, 'type'> = {
      matchId: id,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      league: row.league,
      leagueId: row.leagueId,
      popularity: row.popularity,
      minute: row.minute,
      homePenScore: row.homePenScore,
      awayPenScore: row.awayPenScore,
    };
    const push = (c: FbChange) => changes.push(c);
    const ev = f.events;
    const homeId = f.teams.home.id;
    const awayId = f.teams.away.id;

    // ── First sighting ──────────────────────────────────────────────────────
    if (!p) {
      // Only call it a kickoff if we caught the very start (poller restarts
      // mid-match must not fire "¡Empieza el partido!").
      if (cur.st === '1H' && (f.fixture.status.elapsed ?? 0) <= 5) {
        push({ ...base, type: 'matchStart' });
        cur.f.start = true;
      }
      continue;
    }

    // ── Kickoff ─────────────────────────────────────────────────────────────
    if (!cur.f.start && (p.st === 'NS' || p.st === 'TBD') && cur.st === '1H') {
      push({ ...base, type: 'matchStart' });
      cur.f.start = true;
    }

    // ── Goals / VAR ─────────────────────────────────────────────────────────
    const prevTotal = p.hs + p.as;
    const curTotal = cur.hs + cur.as;
    for (const side of ['home', 'away'] as const) {
      const scored = side === 'home' ? cur.hs > p.hs : cur.as > p.as;
      if (!scored) continue;
      const teamId = side === 'home' ? homeId : awayId;
      const g = latest(ev, teamId, isScoredGoalEvent);
      push({
        ...base, type: 'goal', side,
        goalKind: goalKindOf(g),
        scorerName: g?.player?.name ?? undefined,
        minute: minuteOf(g, row.minute),
      });
    }
    if (curTotal < prevTotal) {
      const side: 'home' | 'away' = cur.hs < p.hs ? 'home' : 'away';
      push({ ...base, type: 'goalCancelled', side });
    }

    // ── Phase transitions (latched so status flaps can't re-fire) ───────────
    if (p.st === '1H' && cur.st === 'HT' && !cur.f.ht) {
      push({ ...base, type: 'halftime' }); cur.f.ht = true;
    }
    if (p.st === 'HT' && cur.st === '2H' && !cur.f.h2) {
      push({ ...base, type: 'secondHalfStart' }); cur.f.h2 = true;
    }
    if (cur.st === 'ET' && p.st !== 'ET' && !cur.f.et) {
      push({ ...base, type: 'extraTimeStart' }); cur.f.et = true;
    }
    if (cur.st === 'P' && p.st !== 'P' && !cur.f.pen) {
      push({ ...base, type: 'penaltiesStart' }); cur.f.pen = true;
    }
    if (isPlayingShort(p.st) && (cur.st === 'SUSP' || cur.st === 'INT' || cur.st === 'ABD') && !cur.f.susp) {
      push({ ...base, type: 'matchSuspended' }); cur.f.susp = true;
    }

    // ── Full time (+ Modo Rival result) ─────────────────────────────────────
    if ((isLiveShort(p.st) || p.st === 'SUSP' || p.st === 'INT') && isFinishedShort(cur.st) && !cur.f.end) {
      push({ ...base, type: 'matchEnd', minute: null });
      cur.f.end = true;
      if (!cur.f.rival && cur.hs !== cur.as && cur.st !== 'AWD' && cur.st !== 'WO') {
        const homeLost = cur.hs < cur.as;
        const margin = Math.abs(cur.hs - cur.as);
        push({ ...base, type: margin >= 4 ? 'rivalBigLoss' : 'rivalLoss', side: homeLost ? 'home' : 'away', minute: null });
        cur.f.rival = true;
      }
      // Shootout winners: draw on goals, decided on penalties → loser gets the rival push.
      if (!cur.f.rival && cur.st === 'PEN' && row.homePenScore != null && row.awayPenScore != null &&
          row.homePenScore !== row.awayPenScore) {
        push({ ...base, type: 'rivalLoss', side: row.homePenScore < row.awayPenScore ? 'home' : 'away', minute: null });
        cur.f.rival = true;
      }
    }

    // ── Count-based events ──────────────────────────────────────────────────
    if (Array.isArray(ev)) {
      for (const side of ['home', 'away'] as const) {
        const teamId = side === 'home' ? homeId : awayId;
        const red = side === 'home' ? [p.rh, cur.rh] : [p.ra, cur.ra];
        if (red[1] > red[0]) {
          const e = latest(ev, teamId, isRedCardEvent);
          const c = { ...base, side, playerName: e?.player?.name ?? undefined, minute: minuteOf(e, row.minute) };
          push({ ...c, type: 'redCard' });
          push({ ...c, type: 'rivalRedCard' });
        }
        const yel = side === 'home' ? [p.yh, cur.yh] : [p.ya, cur.ya];
        if (yel[1] > yel[0]) {
          const e = latest(ev, teamId, isYellowCardEvent);
          push({ ...base, type: 'yellowCard', side, playerName: e?.player?.name ?? undefined, minute: minuteOf(e, row.minute) });
        }
        const sub = side === 'home' ? [p.sh, cur.sh] : [p.sa, cur.sa];
        if (sub[1] > sub[0]) {
          const e = latest(ev, teamId, x => x.type === 'subst');
          // API-Sports: player = OFF, assist = ON.
          push({
            ...base, type: 'substitution', side,
            playerName: e?.player?.name ?? undefined,
            relatedPlayerName: e?.assist?.name ?? undefined,
            minute: minuteOf(e, row.minute),
          });
        }
        const pm = side === 'home' ? [p.ph, cur.ph] : [p.pa, cur.pa];
        if (pm[1] > pm[0]) {
          const e = latest(ev, teamId, isMissedPenaltyEvent);
          push({ ...base, type: 'rivalPenMiss', side, playerName: e?.player?.name ?? undefined, minute: minuteOf(e, row.minute) });
        }
      }
    }
  }

  return { changes, next };
}

/** Upcoming-match row the poller passes for pre-match reminders. */
export interface UpcomingMatch {
  id: string;
  timestamp: number;
  homeTeam: FbTeamRef;
  awayTeam: FbTeamRef;
  league: string;
  leagueId: string;
  popularity: number;
}

/**
 * Pre-match reminders (~15 min before kickoff). Creates/updates snapshot
 * entries for upcoming matches so the later NS → 1H transition is a proper
 * kickoff and the reminder latch survives across polls.
 */
export function detectReminders(upcoming: UpcomingMatch[], snap: Snapshot, nowSec: number): FbChange[] {
  const out: FbChange[] = [];
  for (const m of upcoming) {
    const mins = (m.timestamp - nowSec) / 60;
    if (mins <= 0 || mins > 16) continue;
    const e = snap[m.id] ?? {
      st: 'NS', hs: 0, as: 0, rh: 0, ra: 0, yh: 0, ya: 0, sh: 0, sa: 0, ph: 0, pa: 0,
      ts: m.timestamp, pp: m.popularity, f: {},
    };
    snap[m.id] = e;
    if (e.f.rem) continue;
    e.f.rem = true;
    out.push({
      type: 'matchReminder', matchId: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      homeScore: 0, awayScore: 0, league: m.league, leagueId: m.leagueId, popularity: m.popularity,
    });
  }
  return out;
}
