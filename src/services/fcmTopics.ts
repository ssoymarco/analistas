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
  // Unsubscribe from any bucket we're not targeting before subscribing.
  const allBucketTopics = allBucketTopicsForTeam(teamId);
  const toUnsubFirst = allBucketTopics.filter(t => !wanted.has(t) && subscribed.has(t));
  if (toUnsubFirst.length > 0) {
    await Promise.all(toUnsubFirst.map(t => safeUnsubscribe(t)));
    toUnsubFirst.forEach(t => subscribed.delete(t));
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

/**
 * Reconcile FCM subscriptions against the user's current follow list and
 * current Modo Estadio delay bucket.
 *
 * Called on:
 *   - App cold start (AsyncStorage load)
 *   - Auth state change (Firestore sync of favorites)
 *   - estadioMode or estadioDelay change (via FavoritesContext useEffect)
 *   - App foreground (AppState 'active' — heals any mid-flip desync)
 *
 * Logic:
 *   wantedTopics  = union of all teams (in the correct bucket) + players
 *   currentTopics = what we believe we're subscribed to (AsyncStorage)
 *   unsubscribe from (current - wanted)  ← BEFORE subscribing (avoids dual-bucket)
 *   subscribe   to   (wanted - current)
 *
 * Leagues are intentionally excluded — display-only, no FCM subscriptions.
 */
export async function reconcileSubscriptions(args: {
  teamIds:    string[];
  leagueIds:  string[];  // kept in signature for call-site compatibility; ignored
  playerIds:  string[];
  delayBucket?: DelayBucket;  // defaults to 'd0' (Modo Estadio OFF)
}): Promise<void> {
  const bucket: DelayBucket = args.delayBucket ?? 'd0';

  const wanted = new Set<string>();
  for (const id of args.teamIds) {
    topicsForTeam(id, bucket).forEach(t => wanted.add(t));
  }
  // Note: leagueIds intentionally skipped — display-only
  for (const id of args.playerIds) {
    topicsForPlayer(id).forEach(t => wanted.add(t));
  }

  const current = await readSubscribedTopics();
  const toRemove: string[] = [];
  const toAdd:    string[] = [];

  for (const t of current) if (!wanted.has(t)) toRemove.push(t);
  for (const t of wanted)  if (!current.has(t)) toAdd.push(t);

  if (toAdd.length === 0 && toRemove.length === 0) return;

  // Unsubscribe first to ensure no brief window with two active buckets
  if (toRemove.length > 0) {
    await Promise.all(toRemove.map(t => safeUnsubscribe(t)));
    toRemove.forEach(t => current.delete(t));
  }

  if (toAdd.length > 0) {
    const results = await Promise.all(toAdd.map(t => safeSubscribe(t)));
    // Persist only successfully subscribed topics (not the full wanted set)
    // so a transient network failure doesn't pollute the persisted record.
    const successSet = new Set(current);
    toAdd.forEach((t, i) => { if (results[i]) successSet.add(t); });
    await writeSubscribedTopics(successSet);
  } else {
    await writeSubscribedTopics(current);
  }
}

/**
 * Clear all subscriptions (e.g. on logout). Doesn't actually try to unsubscribe
 * each topic — that'd be expensive and the user may not even have permission
 * anymore. Just wipes the local record so next reconcile starts fresh.
 */
export async function clearLocalSubscriptionRecord(): Promise<void> {
  await AsyncStorage.removeItem(SUBSCRIBED_TOPICS_KEY).catch(() => {});
}
