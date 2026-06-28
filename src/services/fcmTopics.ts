/**
 * fcmTopics.ts
 *
 * Manages Firebase Cloud Messaging topic subscriptions for push notifications.
 *
 * ── Modo Estadio delay-bucket taxonomy (2026-06-03) ─────────────────────────
 *
 * Live (retrasable) event classes each have 4 topics, one per delay bucket.
 * The device subscribes to EXACTLY ONE bucket per (team, event-class):
 *   _d0  → Modo Estadio OFF (immediate)
 *   _d2  → 2 min delay
 *   _d5  → 5 min delay
 *   _d10 → 10 min delay
 *
 * Live event topics (with bucket):
 *   team_{id}_goals_d{0|2|5|10}  — goals (both teams' followers)
 *   team_{id}_cards_d{0|2|5|10}  — red cards
 *   team_{id}_live_d{0|2|5|10}   — halftime + matchEnd
 *
 * Immediate-only topics (NO bucket — never delayed):
 *   team_{id}_kickoff   — matchStart (NEW; replaces _start for this event)
 *   team_{id}_lineups   — lineups published
 *   team_{id}_reminders — pre-match reminder
 *
 * League topics REMOVED: following a league is display-only.
 * Notifications are dispatched ONLY for followed teams.
 *
 * ── Why client-side filtering instead of server-side topic granularity? ──────
 *   1. Tens of thousands of topics (one per team × event type × bucket) is fine,
 *      but per-user filtering would require millions of topics.
 *   2. The user can toggle prefs offline; we don't want to round-trip to
 *      Firestore on every toggle just to re-subscribe.
 *   3. Battery / bandwidth cost is negligible — the push payload is tiny.
 */

import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fcmReady } from './fcmInit';
import { addBreadcrumb, Sentry } from './sentry';

/**
 * Wrapper around messaging().subscribeToTopic that:
 *   (1) waits for FCM to be initialised — without this, subscribes go to
 *       an unbound FCM token and silently no-op on the server. This was
 *       THE Build 13 bug that nuked all push delivery (see fcmInit.ts).
 *   (2) actually surfaces errors instead of swallowing them, so future
 *       regressions don't repeat the silent-failure pattern.
 */
async function safeSubscribe(topic: string): Promise<boolean> {
  const token = await fcmReady();
  if (!token) {
    addBreadcrumb('fcm', 'subscribe skipped — no token', { topic });
    return false;
  }
  try {
    await messaging().subscribeToTopic(topic);
    addBreadcrumb('fcm', 'subscribed', { topic });
    return true;
  } catch (err) {
    addBreadcrumb('fcm', 'subscribe failed', { topic, err: String(err) });
    Sentry.setContext('fcm_subscribe_failure', { topic, err: String(err) });
    return false;
  }
}

async function safeUnsubscribe(topic: string): Promise<boolean> {
  const token = await fcmReady();
  if (!token) return false;
  try {
    await messaging().unsubscribeFromTopic(topic);
    addBreadcrumb('fcm', 'unsubscribed', { topic });
    return true;
  } catch (err) {
    addBreadcrumb('fcm', 'unsubscribe failed', { topic, err: String(err) });
    return false;
  }
}

// Persistent record of what topics we believe we're subscribed to, so that on
// app launch we can reconcile against the user's current follow list without
// touching FCM unnecessarily. FCM subscribe/unsubscribe calls are idempotent
// but they DO go through the network — skipping a no-op saves battery.
const SUBSCRIBED_TOPICS_KEY = 'analistas_fcm_subscribed_topics';

// One-time flag: after the v1.1.0 migration window we stopped dual-sending
// to legacy topics (team_X_goals, team_X_cards, team_X_start). Devices that
// updated from v1.0.x may still be subscribed to these stale topics. This flag
// marks that we've already run the cleanup so we don't redo it on every launch.
const LEGACY_TOPICS_CLEANED_KEY = 'analistas_fcm_legacy_v110_cleaned';

/** Delay bucket type for Modo Estadio. */
export type DelayBucket = 'd0' | 'd2' | 'd5' | 'd10';

/** Topic name builders — must stay in sync with functions/src/detect-changes.ts. */
export const TopicNames = {
  // ── Live event topics (with delay bucket) ──────────────────────────────────
  teamGoals:    (teamId: string, bucket: DelayBucket) => `team_${teamId}_goals_${bucket}`,
  teamCards:    (teamId: string, bucket: DelayBucket) => `team_${teamId}_cards_${bucket}`,
  teamLive:     (teamId: string, bucket: DelayBucket) => `team_${teamId}_live_${bucket}`,

  // ── Immediate-only topics (no bucket — never delayed) ──────────────────────
  teamKickoff:   (teamId: string)   => `team_${teamId}_kickoff`,
  teamLineups:   (teamId: string)   => `team_${teamId}_lineups`,
  teamReminders: (teamId: string)   => `team_${teamId}_reminders`,

  // ── Modo Rival topics (immediate, no bucket) ───────────────────────────────
  // "Bad news" about a team the user marked as a RIVAL. Delivered immediately
  // (the delay buckets of Modo Estadio don't apply — schadenfreude isn't a
  // spoiler-avoidance scenario). Must stay in sync with detect-changes.ts.
  teamRivalLoss:       (teamId: string) => `team_${teamId}_rival_loss`,
  teamRivalBigLoss:    (teamId: string) => `team_${teamId}_rival_bigloss`,
  teamRivalRedCard:    (teamId: string) => `team_${teamId}_rival_redcard`,
  teamRivalPenMiss:    (teamId: string) => `team_${teamId}_rival_penmiss`,
  teamRivalEliminated: (teamId: string) => `team_${teamId}_rival_eliminated`,

  // ── Player topics (server currently dispatches nothing here — future use) ──
  playerGoals:  (playerId: string)  => `player_${playerId}_goals`,
  playerCards:  (playerId: string)  => `player_${playerId}_cards`,

  // ── Legacy topic builders (for reference / dual-send awareness) ────────────
  // NOTE: do NOT subscribe to these on new builds. The server dual-sends to them
  // during the migration window so old builds keep working. These are kept here
  // only as documentation and to support the FCM_INIT_VERSION wipe.
  _legacyTeamGoals:  (teamId: string)   => `team_${teamId}_goals`,
  _legacyTeamCards:  (teamId: string)   => `team_${teamId}_cards`,
  _legacyTeamStart:  (teamId: string)   => `team_${teamId}_start`,
  _legacyLeagueStart:(leagueId: string) => `league_${leagueId}_start`,
  _legacyLeagueFinals:(leagueId: string)=> `league_${leagueId}_finals`,
};

/** Sibling buckets for a given (teamId, event class). Used to defensively
 *  unsubscribe BEFORE subscribing to the new bucket to prevent a brief window
 *  where the device is in two buckets simultaneously. */
const ALL_BUCKETS: DelayBucket[] = ['d0', 'd2', 'd5', 'd10'];

/** All topics for a team in a given delay bucket. */
function topicsForTeam(teamId: string, bucket: DelayBucket): string[] {
  return [
    TopicNames.teamGoals(teamId, bucket),
    TopicNames.teamCards(teamId, bucket),
    TopicNames.teamLive(teamId, bucket),
    TopicNames.teamKickoff(teamId),
    TopicNames.teamLineups(teamId),
    TopicNames.teamReminders(teamId),
  ];
}

/** All topics for ALL buckets of a team (used during reconcile to unsubscribe
 *  from the buckets we're NOT targeting before subscribing to the right one). */
function allBucketTopicsForTeam(teamId: string): string[] {
  const topics: string[] = [];
  for (const b of ALL_BUCKETS) {
    topics.push(
      TopicNames.teamGoals(teamId, b),
      TopicNames.teamCards(teamId, b),
      TopicNames.teamLive(teamId, b),
    );
  }
  return topics;
}

/** Topics for a player (no bucket — server doesn't dispatch here yet). */
function topicsForPlayer(playerId: string): string[] {
  return [
    TopicNames.playerGoals(playerId),
    TopicNames.playerCards(playerId),
  ];
}

/** Modo Rival event classes (v1). Maps a settings-toggle key → topic builder.
 *  Exported so the notification-settings screen can subscribe/unsubscribe a
 *  single event class across all rival teams. */
export type RivalEvent = 'loss' | 'bigLoss' | 'redCard' | 'penMiss' | 'eliminated';

export const RIVAL_EVENTS: RivalEvent[] = ['loss', 'bigLoss', 'redCard', 'penMiss', 'eliminated'];

const RIVAL_TOPIC_BY_EVENT: Record<RivalEvent, (teamId: string) => string> = {
  loss:       TopicNames.teamRivalLoss,
  bigLoss:    TopicNames.teamRivalBigLoss,
  redCard:    TopicNames.teamRivalRedCard,
  penMiss:    TopicNames.teamRivalPenMiss,
  eliminated: TopicNames.teamRivalEliminated,
};

/** All rival "bad news" topics for a team. */
function topicsForRival(teamId: string): string[] {
  return RIVAL_EVENTS.map(ev => RIVAL_TOPIC_BY_EVENT[ev](teamId));
}

/** Map the user's 3 rival settings toggles to the rival event classes they
 *  subscribe to. "Result" covers both normal losses and goleadas. */
export function rivalEventsFromPrefs(
  p: { rivalResult: boolean; rivalRedCard: boolean; rivalPenMiss: boolean },
): RivalEvent[] {
  const events: RivalEvent[] = [];
  if (p.rivalResult)  events.push('loss', 'bigLoss');
  if (p.rivalRedCard) events.push('redCard');
  if (p.rivalPenMiss) events.push('penMiss');
  return events;
}

// ── Persistence helpers ─────────────────────────────────────────────────────

async function readSubscribedTopics(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SUBSCRIBED_TOPICS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function writeSubscribedTopics(topics: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SUBSCRIBED_TOPICS_KEY,
      JSON.stringify(Array.from(topics)),
    );
  } catch {
    // Best-effort. Worst case: on next launch we re-reconcile from scratch.
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Subscribe to topics for a team in the given delay bucket.
 * Defensively unsubscribes from sibling buckets first to guarantee exclusion
 * mutua — prevents a device from being in two buckets simultaneously.
 */
export async function subscribeTeamTopics(teamId: string, bucket: DelayBucket = 'd0'): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted     = new Set(topicsForTeam(teamId, bucket));

  // Sibling live-event topics across ALL buckets (includes the target bucket).
  // Unsubscribe from every sibling bucket — intentionally do NOT filter by
  // subscribed.has(t). The local tracking can be stale (a prior unsubscription
  // failed but was incorrectly removed from tracking), so we always try to
  // unsubscribe to guarantee mutual exclusion. FCM unsubscription is idempotent.
  const allBucketTopics = allBucketTopicsForTeam(teamId);
  const toUnsubFirst = allBucketTopics.filter(t => !wanted.has(t));
  if (toUnsubFirst.length > 0) {
    const unsubResults = await Promise.all(toUnsubFirst.map(t => safeUnsubscribe(t)));
    // Only remove from local tracking if the FCM call actually succeeded —
    // failed entries stay in SUBSCRIBED_TOPICS_KEY and get retried next reconcile.
    toUnsubFirst.forEach((t, i) => { if (unsubResults[i]) subscribed.delete(t); });
  }

  const toAdd = [...wanted].filter(t => !subscribed.has(t));
  if (toAdd.length === 0) {
    if (toUnsubFirst.length > 0) await writeSubscribedTopics(subscribed);
    return;
  }
  const results = await Promise.all(toAdd.map(t => safeSubscribe(t)));
  // Persist ONLY the topics where subscribe actually succeeded
  toAdd.forEach((t, i) => { if (results[i]) subscribed.add(t); });
  await writeSubscribedTopics(subscribed);
}

export async function unsubscribeTeamTopics(teamId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  // Unsubscribe from ALL buckets of this team's live events + immediate topics
  const allTopics = [
    ...allBucketTopicsForTeam(teamId),
    TopicNames.teamKickoff(teamId),
    TopicNames.teamLineups(teamId),
    TopicNames.teamReminders(teamId),
  ];
  const toRemove = allTopics.filter(t => subscribed.has(t));
  if (toRemove.length === 0) return;

  await Promise.all(toRemove.map(t => safeUnsubscribe(t)));
  toRemove.forEach(t => subscribed.delete(t));
  await writeSubscribedTopics(subscribed);
}

/**
 * League following is DISPLAY-ONLY (2026-06-03 decision).
 * Following/unfollowing a league only affects which matches are shown on screen —
 * no FCM topic subscriptions. These stubs exist so call-sites in FavoritesContext
 * compile without changes; they intentionally do nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function subscribeLeagueTopics(_leagueId: string): Promise<void> {
  // No-op: leagues are display-only, notifications come from followed teams.
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function unsubscribeLeagueTopics(_leagueId: string): Promise<void> {
  // No-op: leagues are display-only.
}

export async function subscribePlayerTopics(playerId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForPlayer(playerId);
  const toAdd = wanted.filter(t => !subscribed.has(t));
  if (toAdd.length === 0) return;

  const results = await Promise.all(toAdd.map(t => safeSubscribe(t)));
  toAdd.forEach((t, i) => { if (results[i]) subscribed.add(t); });
  await writeSubscribedTopics(subscribed);
}

export async function unsubscribePlayerTopics(playerId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForPlayer(playerId);
  const toRemove = wanted.filter(t => subscribed.has(t));
  if (toRemove.length === 0) return;

  await Promise.all(toRemove.map(t => safeUnsubscribe(t)));
  toRemove.forEach(t => subscribed.delete(t));
  await writeSubscribedTopics(subscribed);
}

// ── Modo Rival ──────────────────────────────────────────────────────────────

/** Subscribe to a rival team's "bad news" topics. `events` defaults to all
 *  five; pass a subset to honour the user's per-event settings toggles. */
export async function subscribeRivalTopics(
  teamId: string,
  events: RivalEvent[] = RIVAL_EVENTS,
): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = events.map(ev => RIVAL_TOPIC_BY_EVENT[ev](teamId));
  const toAdd = wanted.filter(t => !subscribed.has(t));
  if (toAdd.length === 0) return;

  const results = await Promise.all(toAdd.map(t => safeSubscribe(t)));
  toAdd.forEach((t, i) => { if (results[i]) subscribed.add(t); });
  await writeSubscribedTopics(subscribed);
}

/** Unsubscribe from a rival team's bad-news topics (all five). */
export async function unsubscribeRivalTopics(teamId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const toRemove = topicsForRival(teamId).filter(t => subscribed.has(t));
  if (toRemove.length === 0) return;

  await Promise.all(toRemove.map(t => safeUnsubscribe(t)));
  toRemove.forEach(t => subscribed.delete(t));
  await writeSubscribedTopics(subscribed);
}

/** Subscribe/unsubscribe a SINGLE rival event class across many rival teams.
 *  Used when the user flips a per-event toggle in notification settings. */
export async function setRivalEventForTeams(
  event: RivalEvent,
  teamIds: string[],
  enabled: boolean,
): Promise<void> {
  if (teamIds.length === 0) return;
  const subscribed = await readSubscribedTopics();
  const topics = teamIds.map(id => RIVAL_TOPIC_BY_EVENT[event](id));

  if (enabled) {
    const toAdd = topics.filter(t => !subscribed.has(t));
    if (toAdd.length === 0) return;
    const results = await Promise.all(toAdd.map(t => safeSubscribe(t)));
    toAdd.forEach((t, i) => { if (results[i]) subscribed.add(t); });
  } else {
    const toRemove = topics.filter(t => subscribed.has(t));
    if (toRemove.length === 0) return;
    await Promise.all(toRemove.map(t => safeUnsubscribe(t)));
    toRemove.forEach(t => subscribed.delete(t));
  }
  await writeSubscribedTopics(subscribed);
}

/**
 * One-time migration: unsubscribe from legacy topics (no bucket suffix) that
 * were subscribed on v1.0.x builds. The server stopped dual-sending to these
 * in v1.1.0 (June 2026), so they are now dead — but devices that updated from
 * v1.0.x may still be subscribed. Called from reconcileSubscriptions on first
 * run after update; subsequent calls are instant no-ops via the flag key.
 */
async function migrateFromLegacyTopics(teamIds: string[]): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(LEGACY_TOPICS_CLEANED_KEY);
    if (done) return;

    const legacyTopics = teamIds.flatMap(id => [
      TopicNames._legacyTeamGoals(id),
      TopicNames._legacyTeamCards(id),
      TopicNames._legacyTeamStart(id),
    ]);

    await Promise.all(legacyTopics.map(t => safeUnsubscribe(t)));
    await AsyncStorage.setItem(LEGACY_TOPICS_CLEANED_KEY, '1');
    addBreadcrumb('fcm', 'legacy topics cleaned', { count: legacyTopics.length });
  } catch {
    // Non-fatal — will retry on next app launch.
  }
}

/** Run an async op over items in small concurrent batches, so cold start never
 *  fires 100+ simultaneous native FCM topic calls (a heavy user × all buckets
 *  can be ~135 ops). Keeps the native bridge / FCM SDK from being hammered. */
async function runInBatches<T>(
  items: T[],
  op: (item: T) => Promise<void>,
  batchSize = 10,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(op));
  }
}

interface ReconcileArgs {
  teamIds:    string[];
  leagueIds:  string[];  // kept for call-site compatibility; ignored (display-only)
  playerIds:  string[];
  rivalTeamIds?: string[];      // Modo Rival teams
  rivalEvents?:  RivalEvent[];  // enabled rival event classes (defaults to all)
  delayBucket?: DelayBucket;    // defaults to 'd0' (Modo Estadio OFF)
}

// ── Coalescing scheduler ────────────────────────────────────────────────────
// Several triggers (cold start, Modo Estadio toggle, rival-event toggle, app
// foreground, auth sync) can call reconcile near-simultaneously. Each does a
// non-atomic read-modify-write of the AsyncStorage subscription record; two
// overlapping runs read the same `current`, both write at the end, and the last
// write wins — re-creating duplicate/mixed bucket state. We serialize: if a pass
// is in-flight, the newest args overwrite a single pending slot and we run
// exactly once more when the current pass finishes, so the user's latest action
// always wins without racing the on-disk record.
let reconcileInFlight: Promise<void> | null = null;
let reconcilePending: ReconcileArgs | null = null;

export async function reconcileSubscriptions(args: ReconcileArgs): Promise<void> {
  reconcilePending = args; // newest request wins
  if (reconcileInFlight) return reconcileInFlight;
  reconcileInFlight = (async () => {
    try {
      while (reconcilePending) {
        const next = reconcilePending;
        reconcilePending = null;
        // Guard each pass so one failure never aborts draining a queued request.
        try { await doReconcileSubscriptions(next); } catch { /* swallowed */ }
      }
    } finally {
      reconcileInFlight = null;
    }
  })();
  return reconcileInFlight;
}

async function doReconcileSubscriptions(args: ReconcileArgs): Promise<void> {
  const bucket: DelayBucket = args.delayBucket ?? 'd0';
  const rivalEvents = args.rivalEvents ?? RIVAL_EVENTS;

  // One-time cleanup of v1.0.x legacy (un-bucketed) topic subscriptions.
  migrateFromLegacyTopics(args.teamIds).catch(() => {});

  // ── Desired ("wanted") topic set ──────────────────────────────────────────
  const wanted = new Set<string>();
  for (const id of args.teamIds)   topicsForTeam(id, bucket).forEach(t => wanted.add(t));
  // leagueIds intentionally skipped — display-only.
  for (const id of args.playerIds) topicsForPlayer(id).forEach(t => wanted.add(t));
  for (const id of args.rivalTeamIds ?? []) {
    for (const ev of rivalEvents) wanted.add(RIVAL_TOPIC_BY_EVENT[ev](id));
  }

  const current = await readSubscribedTopics();

  // ── Removals — AUTHORITATIVE, not a pure cache diff ───────────────────────
  // (1) Anything cached that's no longer wanted (unfollowed team/player/rival,
  //     or a stale delay bucket left in the cache).
  // (2) CRITICAL FIX: every delay-bucket SIBLING of a still-followed team that
  //     isn't the target bucket — INCLUDING topics absent from the local cache.
  //     The cache can diverge from FCM's real membership (an FCM_INIT_VERSION
  //     wipe cleared the cache WITHOUT unsubscribing server-side, orphaning the
  //     old _d0 topics). The old `current - wanted` diff could never remove what
  //     it didn't know about, leaving devices subscribed to BOTH the immediate
  //     (_d0) and delayed (_dN) bucket → every event arrived twice (spoiler now
  //     + duplicate after the Modo Estadio delay). Mirrors subscribeTeamTopics's
  //     defensive sibling cleanup so both paths behave identically.
  const removeSet = new Set<string>();
  for (const t of current) if (!wanted.has(t)) removeSet.add(t);
  for (const id of args.teamIds) {
    for (const t of allBucketTopicsForTeam(id)) if (!wanted.has(t)) removeSet.add(t);
  }
  const toRemove = [...removeSet];
  const toAdd    = [...wanted].filter(t => !current.has(t));

  if (toRemove.length === 0 && toAdd.length === 0) return;

  // Observability: count removals the local cache didn't know about — the
  // fingerprint of the dual-subscription bug being healed in production.
  const orphanRemovals = toRemove.filter(t => !current.has(t)).length;
  if (orphanRemovals > 0) {
    addBreadcrumb('fcm', 'reconcile healed orphan subscriptions', { orphanRemovals, bucket });
    Sentry.setContext('fcm_reconcile', { orphanRemovals, bucket });
  }

  // Mutated as ops succeed; persisted to AsyncStorage exactly ONCE at the end
  // (no per-team I/O thrashing). Topics whose FCM call failed stay as-is so the
  // next reconcile retries them instead of losing track.
  const nextCache = new Set(current);

  // Unsubscribe FIRST (avoid a dual-bucket window), then subscribe — both in
  // small batches to spare the native bridge / FCM SDK on cold start.
  await runInBatches(toRemove, async t => {
    if (await safeUnsubscribe(t)) nextCache.delete(t);
  });
  await runInBatches(toAdd, async t => {
    if (await safeSubscribe(t)) nextCache.add(t);
  });

  await writeSubscribedTopics(nextCache);
}

/**
 * Clear all subscriptions (e.g. on logout). Doesn't actually try to unsubscribe
 * each topic — that'd be expensive and the user may not even have permission
 * anymore. Just wipes the local record so next reconcile starts fresh.
 */
export async function clearLocalSubscriptionRecord(): Promise<void> {
  await AsyncStorage.removeItem(SUBSCRIBED_TOPICS_KEY).catch(() => {});
}
