/**
 * detect-changes.ts
 *
 * Compares current livescores against the previous snapshot in Firestore.
 * Detects goals (regular/penalty/own), goal cancellations (VAR), match starts,
 * halftime, full time, and red cards. Sends FCM topic pushes for each event.
 *
 * ── Modo Estadio: delay-bucket topic taxonomy ────────────────────────────────
 * Live (retrasable) events fan out to 4 topics per base, one per delay bucket:
 *   team_{id}_goals_d{0|2|5|10}   — goals (both teams' followers)
 *   team_{id}_cards_d{0|2|5|10}   — red cards
 *   team_{id}_live_d{0|2|5|10}    — halftime + matchEnd
 *
 * Pre-match events are always immediate (no bucket suffix):
 *   team_{id}_kickoff              — NEW: replaces _start for matchStart
 *   team_{id}_lineups              — (unchanged)
 *   team_{id}_reminders            — (unchanged)
 *
 * League topics REMOVED: following a league is display-only (spam fix, 2026-06-03).
 * No notifications are dispatched to league_{id}_* topics.
 *
 * DUAL-SEND (migration window): we also send to the legacy topics
 * (team_{id}_goals, team_{id}_start, etc.) so devices on old builds keep
 * receiving notifications. Stop dual-send once adoption of the new build
 * reaches ~90-95% (see rollout plan in docs/MODO_ESTADIO_ARQUITECTURA.md).
 *
 * ── Strategy C (hybrid) for goal+scorer:
 *   - When a score change is detected, we ALSO look at the events array on the
 *     same SMFixture payload for a matching goal event (same minute, same
 *     team). If we find it, the notification includes the scorer name.
 *   - If the scorer event isn't in the payload yet (SportMonks publishes the
 *     score before the event in ~5% of cases), we send the notification
 *     without a name. The client will see the name in-app when it shows up
 *     on the next poll. We do NOT send a second "follow-up" notification —
 *     two pushes for the same goal feels like spam.
 */

import { admin, db } from './admin-init';
import { getFunctions } from 'firebase-admin/functions';
import * as logger from 'firebase-functions/logger';
import { triggerLeagueSyncForChanges } from './sync-league-data';
import type { DelayedPushPayload } from './deliver-delayed-push';
import {
  SM_STATE_IDS, SM_EVENT_TYPES, LIVE_STATE_IDS, FINISHED_STATE_IDS,
} from './types';
import type {
  MatchDoc, LivescoresSnapshot, DetectedChange, SMFixture, SMFixtureEvent, TeamDoc,
} from './types';

// ── Snapshot helpers ────────────────────────────────────────────────────────

export async function loadSnapshot(): Promise<LivescoresSnapshot['matches']> {
  const snap = await db.doc('_meta/livescoresSnapshot').get();
  if (!snap.exists) return {};
  return (snap.data() as LivescoresSnapshot)?.matches ?? {};
}

/** Count red cards for a given side in the events array. */
function countRedCards(events: SMFixtureEvent[] | undefined, participantId: number | undefined): number {
  if (!events || !participantId) return 0;
  let count = 0;
  for (const ev of events) {
    if (ev.participant_id !== participantId) continue;
    if (ev.type_id === SM_EVENT_TYPES.RED_CARD || ev.type_id === SM_EVENT_TYPES.SECOND_YELLOW) {
      count++;
    }
  }
  return count;
}

/** Snapshot the relevant per-match state for next-poll diff detection. */
export async function saveSnapshot(matches: MatchDoc[], fixtures: SMFixture[]): Promise<void> {
  const snapshot: LivescoresSnapshot['matches'] = {};

  // Build a quick lookup of fixture by id so we can pull the events array
  // (red card count) for each MatchDoc without iterating the fixtures list
  // O(n²) times.
  const fixtureById = new Map<number, SMFixture>();
  for (const f of fixtures) fixtureById.set(f.id, f);

  for (const m of matches) {
    const fixture = fixtureById.get(Number(m.id));
    const home = fixture?.participants?.find(p => p.meta?.location === 'home');
    const away = fixture?.participants?.find(p => p.meta?.location === 'away');
    const redHome = countRedCards(fixture?.events, home?.id);
    const redAway = countRedCards(fixture?.events, away?.id);
    snapshot[m.id] = {
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status:    m.status,
      stateId:   m.stateId,
      redCardsHome: redHome,
      redCardsAway: redAway,
    };
  }
  await db.doc('_meta/livescoresSnapshot').set({
    matches: snapshot,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

// ── Goal scorer extraction ──────────────────────────────────────────────────

/** Find the most recent goal event for a given side, returning the scorer
 *  name + kind (normal/penalty/own). Returns null if no matching event yet. */
function findRecentGoalEvent(
  fixture: SMFixture | undefined,
  scoringSide: 'home' | 'away',
): { scorerName?: string; goalKind: 'normal' | 'penalty' | 'own' } | null {
  if (!fixture?.events?.length) return null;
  const home = fixture.participants?.find(p => p.meta?.location === 'home');
  const away = fixture.participants?.find(p => p.meta?.location === 'away');
  const scoringTeamId = scoringSide === 'home' ? home?.id : away?.id;
  if (!scoringTeamId) return null;

  // Iterate from the END of the events array because SportMonks orders by
  // minute ascending — the goal we just detected is the most recent matching event.
  for (let i = fixture.events.length - 1; i >= 0; i--) {
    const ev = fixture.events[i];
    const isGoalType =
      ev.type_id === SM_EVENT_TYPES.GOAL ||
      ev.type_id === SM_EVENT_TYPES.PENALTY_GOAL ||
      ev.type_id === SM_EVENT_TYPES.OWN_GOAL;
    if (!isGoalType) continue;
    if (ev.cancelled) continue; // VAR-overturned goals — handled separately.

    // For OWN_GOAL the credit lands on the OPPOSITE side from the scorer's
    // team, so we compare against the team that BENEFITED (scoringTeamId)
    // and the event's participant_id is the team that scored against itself.
    const eventCreditsTeam =
      ev.type_id === SM_EVENT_TYPES.OWN_GOAL
        ? (ev.participant_id === home?.id ? away?.id : home?.id)
        : ev.participant_id;
    if (eventCreditsTeam !== scoringTeamId) continue;

    const goalKind: 'normal' | 'penalty' | 'own' =
      ev.type_id === SM_EVENT_TYPES.PENALTY_GOAL ? 'penalty' :
      ev.type_id === SM_EVENT_TYPES.OWN_GOAL     ? 'own'     :
      'normal';

    return {
      scorerName: ev.player_name ?? undefined,
      goalKind,
    };
  }
  return null;
}

/** Find the most recent red-card event for a given side. */
function findRecentRedCard(
  fixture: SMFixture | undefined,
  side: 'home' | 'away',
): { playerName?: string; minute?: number | null } | null {
  if (!fixture?.events?.length) return null;
  const home = fixture.participants?.find(p => p.meta?.location === 'home');
  const away = fixture.participants?.find(p => p.meta?.location === 'away');
  const teamId = side === 'home' ? home?.id : away?.id;
  if (!teamId) return null;

  for (let i = fixture.events.length - 1; i >= 0; i--) {
    const ev = fixture.events[i];
    if (ev.participant_id !== teamId) continue;
    if (ev.type_id === SM_EVENT_TYPES.RED_CARD || ev.type_id === SM_EVENT_TYPES.SECOND_YELLOW) {
      return {
        playerName: ev.player_name ?? undefined,
        minute: ev.minute ?? null,
      };
    }
  }
  return null;
}

// ── Change detection ────────────────────────────────────────────────────────

export function detectChanges(
  currentMatches: MatchDoc[],
  previousSnapshot: LivescoresSnapshot['matches'],
  fixtures: SMFixture[],
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  // Quick lookup: matchId → SMFixture for event-array access during diffing
  const fixtureById = new Map<number, SMFixture>();
  for (const f of fixtures) fixtureById.set(f.id, f);

  for (const match of currentMatches) {
    const prev = previousSnapshot[match.id];
    const fixture = fixtureById.get(Number(match.id));
    const baseEvent: Omit<DetectedChange, 'type'> = {
      matchId:   match.id,
      homeTeam:  match.homeTeam,
      awayTeam:  match.awayTeam,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      league:    match.league,
      leagueId:  match.leagueId,
      minute:    match.minute,
    };

    if (!prev) {
      // Match not in previous snapshot. If it's live now, treat as kickoff.
      if (match.status === 'live' && match.stateId === SM_STATE_IDS.FIRST_HALF) {
        changes.push({ ...baseEvent, type: 'matchStart' });
      }
      continue;
    }

    // ── Goal detection ────────────────────────────────────────────────────
    const prevTotal = prev.homeScore + prev.awayScore;
    const newTotal  = match.homeScore + match.awayScore;
    const homeScored = match.homeScore > prev.homeScore;
    const awayScored = match.awayScore > prev.awayScore;

    if (newTotal > prevTotal) {
      if (homeScored) {
        const ev = findRecentGoalEvent(fixture, 'home');
        changes.push({
          ...baseEvent,
          type: 'goal',
          scoringTeamSide: 'home',
          goalKind:   ev?.goalKind ?? 'normal',
          scorerName: ev?.scorerName,
        });
      }
      if (awayScored) {
        const ev = findRecentGoalEvent(fixture, 'away');
        changes.push({
          ...baseEvent,
          type: 'goal',
          scoringTeamSide: 'away',
          goalKind:   ev?.goalKind ?? 'normal',
          scorerName: ev?.scorerName,
        });
      }
    } else if (newTotal < prevTotal) {
      // Total goals DECREASED → a goal was disallowed (VAR overturned).
      // Figure out which side lost the goal.
      const side: 'home' | 'away' = match.homeScore < prev.homeScore ? 'home' : 'away';
      changes.push({
        ...baseEvent,
        type: 'goalCancelled',
        scoringTeamSide: side,
      });
    }

    // ── Match start ───────────────────────────────────────────────────────
    if (prev.status === 'scheduled' && match.status === 'live' &&
        match.stateId === SM_STATE_IDS.FIRST_HALF) {
      changes.push({ ...baseEvent, type: 'matchStart' });
    }

    // ── Halftime ──────────────────────────────────────────────────────────
    if (prev.stateId !== SM_STATE_IDS.HALF_TIME &&
        match.stateId === SM_STATE_IDS.HALF_TIME) {
      changes.push({ ...baseEvent, type: 'halftime' });
    }

    // ── Match end ─────────────────────────────────────────────────────────
    if (prev.status === 'live' && match.status === 'finished') {
      changes.push({ ...baseEvent, type: 'matchEnd' });
    }

    // ── Red card detection ────────────────────────────────────────────────
    const home = fixture?.participants?.find(p => p.meta?.location === 'home');
    const away = fixture?.participants?.find(p => p.meta?.location === 'away');
    const redHome = countRedCards(fixture?.events, home?.id);
    const redAway = countRedCards(fixture?.events, away?.id);

    if (redHome > prev.redCardsHome) {
      const ev = findRecentRedCard(fixture, 'home');
      changes.push({
        ...baseEvent,
        type: 'redCard',
        scoringTeamSide: 'home',
        playerName: ev?.playerName,
        minute: ev?.minute ?? match.minute,
      });
    }
    if (redAway > prev.redCardsAway) {
      const ev = findRecentRedCard(fixture, 'away');
      changes.push({
        ...baseEvent,
        type: 'redCard',
        scoringTeamSide: 'away',
        playerName: ev?.playerName,
        minute: ev?.minute ?? match.minute,
      });
    }
  }

  return changes;
}

// ── Notification copy builders ──────────────────────────────────────────────
//
// These produce the (title, body) pair shown in the OS push UI. The format
// matches the spec the user approved on 2026-05-28 — most notably the brackets
// around the team that just scored so the user can tell at a glance "what
// changed since I last looked".
//
// All strings are Spanish for now; the i18n layer (Phase 5) will swap them
// based on the user's stored locale. We CAN'T translate per-recipient here
// because FCM topic sends one payload to all subscribers — so we either
// localize on the server based on the topic's primary audience (which we
// don't track), or we ship in Spanish and the app translates client-side via
// notification `data` payload. Going with Spanish-everywhere for the first
// release; i18n on the body is a follow-up.

interface FcmCopy { title: string; body: string }

function scoreWithBrackets(
  homeName: string, homeScore: number,
  awayName: string, awayScore: number,
  scoringSide: 'home' | 'away',
): string {
  const h = scoringSide === 'home' ? `[${homeScore}]` : `${homeScore}`;
  const a = scoringSide === 'away' ? `[${awayScore}]` : `${awayScore}`;
  return `${homeName} ${h}-${a} ${awayName}`;
}

function copyForGoal(c: DetectedChange): FcmCopy {
  const scoringTeamName = c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name;
  const score = scoreWithBrackets(
    c.homeTeam.name, c.homeScore,
    c.awayTeam.name, c.awayScore,
    c.scoringTeamSide ?? 'home',
  );
  const minute = c.minute != null ? `${c.minute}'` : '';
  const scorer = c.scorerName ? `${c.scorerName} · ` : '';

  // The user's spec differentiates "your team scored" (emotional, with !)
  // from "the rival scored" (neutral). The CLIENT decides which tone to
  // render based on the user's followed teams — we send the EMOTIONAL copy
  // tagged in `data.tone` and a NEUTRAL fallback so a properly i18n-ed
  // client can swap at display time. For this server-side baseline we ship
  // the emotional copy; the topic naming already guarantees recipients are
  // followers of the involved team.
  const goalKind = c.goalKind ?? 'normal';
  const title =
    goalKind === 'penalty' ? `⚽ ¡Gol de penal de ${scoringTeamName}!` :
    goalKind === 'own'     ? `⚽ Autogol de ${scoringTeamName === c.homeTeam.name ? c.awayTeam.name : c.homeTeam.name}` :
                             `⚽ ¡GOL de ${scoringTeamName}!`;
  const body = `${minute ? minute + ' ' : ''}${scorer}${score}`;
  return { title, body: body.trim() };
}

function copyForGoalCancelled(c: DetectedChange): FcmCopy {
  const cancelledFromTeam = c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name;
  const score = `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name}`;
  const minute = c.minute != null ? `${c.minute}' ` : '';
  return {
    title: `🚫 El VAR anula gol de ${cancelledFromTeam}`,
    body:  `${minute}${score}`.trim(),
  };
}

function copyForMatchStart(c: DetectedChange): FcmCopy {
  return {
    title: `⚽ ¡Empieza el partido!`,
    body:  `${c.homeTeam.name} vs ${c.awayTeam.name} · ${c.league}`,
  };
}

function copyForHalftime(c: DetectedChange): FcmCopy {
  return {
    title: `⏱️ Medio tiempo · Marcador:`,
    body:  `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name}`,
  };
}

function copyForMatchEnd(c: DetectedChange): FcmCopy {
  return {
    title: `🏁 Final del partido`,
    body:  `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name} · ${c.league}`,
  };
}

function copyForRedCard(c: DetectedChange): FcmCopy {
  const team = c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name;
  const minute = c.minute != null ? `${c.minute}' ` : '';
  const player = c.playerName ? `${c.playerName} ` : '';
  const score = `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name}`;
  return {
    title: `🟥 TARJETA ROJA`,
    body:  `${minute}${player}(${team}) · ${score}`.trim(),
  };
}

// ── FCM topic taxonomy (Modo Estadio) ─────────────────────────────────────────

/** Delay buckets used for Modo Estadio (minutes). 0 = immediate. */
const DELAY_BUCKETS = [0, 2, 5, 10] as const;
type DelayBucket = typeof DELAY_BUCKETS[number];

/**
 * For a retrasable live event, return the base topic names (WITHOUT bucket
 * suffix). dispatchNotifications() will fan out to <base>_d{0|2|5|10}.
 *
 * goalsBase   — both teams' followers care (yours + rival)
 * cardsBase   — only the team that received the card
 * liveBase    — halftime + matchEnd (score-update type events)
 * kickoff     — immediate only (matchStart), no bucket
 * legacy      — OLD topic names for the dual-send migration window
 */
interface TopicRouting {
  /** Retrasable base topics → will be sent as <base>_d0 + enqueued for d2/d5/d10 */
  retrasableBases: string[];
  /** Immediate-only topics (sent once, no delay enqueue) */
  immediateTopic:  string | null;
  /** Legacy topics for old-build dual-send — remove after adoption ~90% */
  legacyTopics:    string[];
}

function routeChange(c: DetectedChange): TopicRouting {
  const homeId   = c.homeTeam.id;
  const awayId   = c.awayTeam.id;
  const leagueId = c.leagueId;
  switch (c.type) {
    case 'goal':
      return {
        retrasableBases: [`team_${homeId}_goals`, `team_${awayId}_goals`],
        immediateTopic:  null,
        // DUAL-SEND legacy: goals + league start (old builds expect league topic)
        legacyTopics:    [`team_${homeId}_goals`, `team_${awayId}_goals`, `league_${leagueId}_start`],
      };
    case 'goalCancelled':
      // VAR: only send to _d0 (immediate). Devices on _d2/_d5/_d10 haven't seen
      // the goal yet → the VAR guard in deliverDelayedPush will suppress it.
      // No need to notify them that a goal they don't know about was cancelled.
      return {
        retrasableBases: [], // no delayed tasks for VAR
        immediateTopic:  null,
        // Still notify _d0 devices (they saw the goal, now see the correction)
        // by putting the bases in legacyTopics + _d0 handling below.
        legacyTopics:    [`team_${homeId}_goals`, `team_${awayId}_goals`, `league_${leagueId}_start`],
      };
    case 'matchStart':
      return {
        retrasableBases: [],
        immediateTopic:  null, // kickoff fan-out handled specially below
        legacyTopics:    [`team_${homeId}_start`, `team_${awayId}_start`, `league_${leagueId}_start`],
      };
    case 'halftime':
      return {
        retrasableBases: [`team_${homeId}_live`, `team_${awayId}_live`],
        immediateTopic:  null,
        legacyTopics:    [`team_${homeId}_start`, `team_${awayId}_start`],
      };
    case 'matchEnd':
      return {
        retrasableBases: [`team_${homeId}_live`, `team_${awayId}_live`],
        immediateTopic:  null,
        legacyTopics:    [`team_${homeId}_start`, `team_${awayId}_start`, `league_${leagueId}_finals`],
      };
    case 'redCard': {
      const side = c.scoringTeamSide === 'home' ? homeId : awayId;
      return {
        retrasableBases: [`team_${side}_cards`],
        immediateTopic:  null,
        legacyTopics:    [`team_${side}_cards`],
      };
    }
    default:
      return { retrasableBases: [], immediateTopic: null, legacyTopics: [] };
  }
}

// ── Notification payload builder ────────────────────────────────────────────

function buildFcmCopy(c: DetectedChange): FcmCopy {
  switch (c.type) {
    case 'goal':          return copyForGoal(c);
    case 'goalCancelled': return copyForGoalCancelled(c);
    case 'matchStart':    return copyForMatchStart(c);
    case 'halftime':      return copyForHalftime(c);
    case 'matchEnd':      return copyForMatchEnd(c);
    case 'redCard':       return copyForRedCard(c);
    default:              return { title: 'Analistas', body: 'Nueva actualización del partido' };
  }
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Whether to enqueue Cloud Tasks for Modo Estadio delayed delivery.
 * Set ESTADIO_DELAY_ENABLED=false in Cloud Functions env to disable without
 * a redeploy. Default: enabled.
 */
const ESTADIO_DELAY_ENABLED = process.env.ESTADIO_DELAY_ENABLED !== 'false';

/** Sanitise a string to be a valid Cloud Tasks task ID ([a-zA-Z0-9_-]). */
function toTaskId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 499);
}

/** Send one FCM alert push to a specific topic — shared helper. */
function sendToTopic(
  messaging: ReturnType<typeof admin.messaging>,
  topic: string,
  title: string,
  body: string,
  data: Record<string, string>,
  dedupId: string,
): Promise<unknown> {
  return messaging.send({
    topic,
    notification: { title, body },
    data,
    android: {
      priority: 'high',
      collapseKey: dedupId,
      notification: { channelId: 'analistas-live', sound: 'default', tag: dedupId },
    },
    apns: {
      headers: { 'apns-collapse-id': dedupId },
      payload: { aps: { sound: 'default', badge: 0 } },
    },
  }).catch(err => {
    const code = (err as { code?: string }).code;
    if (code !== 'messaging/invalid-argument' && code !== 'messaging/registration-token-not-registered') {
      logger.warn(`FCM send failed for topic ${topic}`, { err, code });
    }
  });
}

/** Send FCM topic pushes for each detected change. */
export async function dispatchNotifications(changes: DetectedChange[]): Promise<void> {
  if (changes.length === 0) return;

  const messaging = admin.messaging();
  const sendPromises: Promise<unknown>[] = [];

  for (const change of changes) {
    const { title, body } = buildFcmCopy(change);
    const { retrasableBases, legacyTopics } = routeChange(change);

    // ── Common data payload ────────────────────────────────────────────────
    const data: Record<string, string> = {
      type:      change.type,
      matchId:   change.matchId,
      homeTeam:  change.homeTeam.name,
      awayTeam:  change.awayTeam.name,
      homeScore: String(change.homeScore),
      awayScore: String(change.awayScore),
      leagueId:  change.leagueId,
    };
    if (change.scoringTeamSide) data.scoringTeamSide = change.scoringTeamSide;
    if (change.goalKind)        data.goalKind        = change.goalKind;
    if (change.scorerName)      data.scorerName      = change.scorerName;
    if (change.playerName)      data.playerName      = change.playerName;
    if (change.minute != null)  data.minute          = String(change.minute);

    // ── Deduplication key ──────────────────────────────────────────────────
    // Same dedupId is reused for _d0 and _dN pushes. iOS APNs uses it as
    // apns-collapse-id (collapses duplicates within the notification centre);
    // Android uses it as `tag` (replaces rather than stacks). Capped at 64 B.
    const dedupId = `${change.matchId}_${change.type}_${change.homeScore}-${change.awayScore}`.slice(0, 64);

    // ── Special handling for matchStart (kickoff) ──────────────────────────
    // matchStart goes to the new _kickoff topics (immediate only, no bucket).
    // Also dual-sent to legacy _start topics for old builds.
    if (change.type === 'matchStart') {
      const homeId = change.homeTeam.id;
      const awayId = change.awayTeam.id;
      for (const topic of [`team_${homeId}_kickoff`, `team_${awayId}_kickoff`]) {
        sendPromises.push(sendToTopic(messaging, topic, title, body, data, dedupId));
      }
      // Dual-send legacy (old builds subscribed to _start / league_start)
      for (const topic of legacyTopics) {
        sendPromises.push(sendToTopic(messaging, topic, title, body, data, dedupId));
      }
      logger.info(`📣 MATCHSTART — ${title}`, { matchId: change.matchId });
      continue;
    }

    // ── goalCancelled: only _d0 bucket + legacy (no delayed tasks) ─────────
    // Devices on _dN buckets haven't seen the goal yet; the VAR guard in
    // deliverDelayedPush will suppress the pending goal task at delivery time.
    // We don't notify them about a cancellation they never knew happened.
    if (change.type === 'goalCancelled') {
      // Send to _d0 bases (new devices on the immediate bucket)
      for (const base of [`team_${change.homeTeam.id}_goals`, `team_${change.awayTeam.id}_goals`]) {
        sendPromises.push(sendToTopic(messaging, `${base}_d0`, title, body, data, dedupId));
      }
      // Dual-send legacy
      for (const topic of legacyTopics) {
        sendPromises.push(sendToTopic(messaging, topic, title, body, data, dedupId));
      }
      logger.info(`📣 GOALCANCELLED (VAR) — ${title}`, { matchId: change.matchId });
      continue;
    }

    // ── Live retrasable events (goal, halftime, matchEnd, redCard) ─────────
    // 1. Send _d0 immediately.
    // 2. Enqueue Cloud Tasks for d2/d5/d10.
    // 3. Dual-send legacy topics for old-build compatibility.

    // 1. Immediate send to _d0 bucket
    for (const base of retrasableBases) {
      sendPromises.push(sendToTopic(messaging, `${base}_d0`, title, body, data, dedupId));
    }

    // 2. Cloud Tasks for delayed buckets
    if (ESTADIO_DELAY_ENABLED && retrasableBases.length > 0) {
      const queue = getFunctions().taskQueue('deliverDelayedPush');
      for (const base of retrasableBases) {
        for (const delayMin of [2, 5, 10] as const) {
          const taskId = toTaskId(`estadio_${base}_${dedupId}_d${delayMin}`);
          const payload: DelayedPushPayload = {
            topic:      `${base}_d${delayMin}`,
            title, body, data, dedupId,
            changeType: change.type,
            matchId:    change.matchId,
            homeScore:  change.homeScore,
            awayScore:  change.awayScore,
          };
          // Fire-and-forget; swallow ALREADY_EXISTS (idempotent re-enqueue)
          queue.enqueue(payload, {
            scheduleDelaySeconds: delayMin * 60,
            id: taskId,
          }).catch((err: unknown) => {
            const msg = String(err);
            if (!msg.includes('ALREADY_EXISTS') && !msg.includes('already exists')) {
              logger.warn(`Cloud Task enqueue failed: ${taskId}`, { err: msg });
            }
          });
        }
      }
    }

    // 3. Dual-send legacy topics (migration window)
    for (const topic of legacyTopics) {
      sendPromises.push(sendToTopic(messaging, topic, title, body, data, dedupId));
    }

    logger.info(`📣 ${change.type.toUpperCase()} — ${title} · ${body}`, {
      matchId:        change.matchId,
      retrasableBases,
      legacyTopics,
      estadioEnabled: ESTADIO_DELAY_ENABLED,
    });
  }

  await Promise.allSettled(sendPromises);

  logger.info(`📊 Total changes: ${changes.length}`, {
    goals:           changes.filter(c => c.type === 'goal').length,
    goalsCancelled:  changes.filter(c => c.type === 'goalCancelled').length,
    starts:          changes.filter(c => c.type === 'matchStart').length,
    halftimes:       changes.filter(c => c.type === 'halftime').length,
    ends:            changes.filter(c => c.type === 'matchEnd').length,
    redCards:        changes.filter(c => c.type === 'redCard').length,
  });

  // Event-driven sync: refresh standings/topscorers for affected leagues so
  // table-position swaps show up in seconds instead of waiting for the hourly cron.
  await triggerLeagueSyncForChanges(changes);
}

// Re-export the constants used by callers (keep public surface compact)
export { LIVE_STATE_IDS, FINISHED_STATE_IDS };
