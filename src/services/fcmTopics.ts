/**
 * fcmTopics.ts
 *
 * Manages Firebase Cloud Messaging topic subscriptions for push notifications.
 *
 * Architecture (Camino B — FCM topics direct):
 *   Cloud Function detects event (goal, red card, etc.)
 *        ↓
 *   Firebase Admin SDK: messaging.send({ topic, notification, data })
 *        ↓
 *   FCM fans out the push to every device subscribed to that topic
 *        ↓
 *   Client (this file): app received subscribed via subscribeToTopic()
 *        ↓
 *   expo-notifications (foreground handler) displays the notification
 *
 * Topic naming convention (server + client must agree):
 *   team_{id}_goals         — goals scored by/against the team
 *   team_{id}_cards         — red/yellow cards (yellow gated client-side by prefs)
 *   team_{id}_start         — kickoff + halftime + final
 *   team_{id}_lineups       — lineups published
 *   team_{id}_reminders     — 15 min before kickoff
 *   league_{id}_start       — every match start in the league
 *   league_{id}_finals      — every match final
 *   player_{id}_goals       — goals scored by the player
 *   player_{id}_cards       — red cards received by the player
 *
 * The CLIENT subscribes to one topic per (entity, event-class) pair when the
 * user follows the entity, and unsubscribes when they unfollow. The user's
 * per-event-type preferences (e.g. "I don't want yellow card alerts") are
 * enforced ON THE CLIENT at display time — every FCM push reaches the device
 * but expo-notifications' foreground handler decides whether to show it.
 *
 * Why client-side filtering instead of server-side topic granularity?
 *   1. Tens of thousands of topics (one per team × event type) is fine,
 *      but hundreds of thousands (per-user filtering) is not.
 *   2. The user can toggle prefs offline; we don't want to round-trip to
 *      Firestore on every toggle just to re-subscribe.
 *   3. Battery / bandwidth cost is negligible — the push is tiny.
 */

import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Persistent record of what topics we believe we're subscribed to, so that on
// app launch we can reconcile against the user's current follow list without
// touching FCM unnecessarily. FCM subscribe/unsubscribe calls are idempotent
// but they DO go through the network — skipping a no-op saves battery.
const SUBSCRIBED_TOPICS_KEY = 'analistas_fcm_subscribed_topics';

/** Topic name builders — keep server (functions/src/notifications.ts) in sync. */
export const TopicNames = {
  teamGoals:      (teamId: string)   => `team_${teamId}_goals`,
  teamCards:      (teamId: string)   => `team_${teamId}_cards`,
  teamStart:      (teamId: string)   => `team_${teamId}_start`,
  teamLineups:    (teamId: string)   => `team_${teamId}_lineups`,
  teamReminders:  (teamId: string)   => `team_${teamId}_reminders`,
  leagueStart:    (leagueId: string) => `league_${leagueId}_start`,
  leagueFinals:   (leagueId: string) => `league_${leagueId}_finals`,
  playerGoals:    (playerId: string) => `player_${playerId}_goals`,
  playerCards:    (playerId: string) => `player_${playerId}_cards`,
};

/** The complete list of topics a single team / league / player generates. */
function topicsForTeam(teamId: string): string[] {
  return [
    TopicNames.teamGoals(teamId),
    TopicNames.teamCards(teamId),
    TopicNames.teamStart(teamId),
    TopicNames.teamLineups(teamId),
    TopicNames.teamReminders(teamId),
  ];
}

function topicsForLeague(leagueId: string): string[] {
  return [
    TopicNames.leagueStart(leagueId),
    TopicNames.leagueFinals(leagueId),
  ];
}

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
 * Subscribe to every topic associated with a team. No-op if already subscribed.
 * Errors are swallowed — push notifications are a best-effort feature.
 */
export async function subscribeTeamTopics(teamId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForTeam(teamId);
  const toAdd = wanted.filter(t => !subscribed.has(t));
  if (toAdd.length === 0) return;

  await Promise.all(
    toAdd.map(t => messaging().subscribeToTopic(t).catch(() => {})),
  );
  toAdd.forEach(t => subscribed.add(t));
  await writeSubscribedTopics(subscribed);
}

export async function unsubscribeTeamTopics(teamId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForTeam(teamId);
  const toRemove = wanted.filter(t => subscribed.has(t));
  if (toRemove.length === 0) return;

  await Promise.all(
    toRemove.map(t => messaging().unsubscribeFromTopic(t).catch(() => {})),
  );
  toRemove.forEach(t => subscribed.delete(t));
  await writeSubscribedTopics(subscribed);
}

export async function subscribeLeagueTopics(leagueId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForLeague(leagueId);
  const toAdd = wanted.filter(t => !subscribed.has(t));
  if (toAdd.length === 0) return;

  await Promise.all(
    toAdd.map(t => messaging().subscribeToTopic(t).catch(() => {})),
  );
  toAdd.forEach(t => subscribed.add(t));
  await writeSubscribedTopics(subscribed);
}

export async function unsubscribeLeagueTopics(leagueId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForLeague(leagueId);
  const toRemove = wanted.filter(t => subscribed.has(t));
  if (toRemove.length === 0) return;

  await Promise.all(
    toRemove.map(t => messaging().unsubscribeFromTopic(t).catch(() => {})),
  );
  toRemove.forEach(t => subscribed.delete(t));
  await writeSubscribedTopics(subscribed);
}

export async function subscribePlayerTopics(playerId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForPlayer(playerId);
  const toAdd = wanted.filter(t => !subscribed.has(t));
  if (toAdd.length === 0) return;

  await Promise.all(
    toAdd.map(t => messaging().subscribeToTopic(t).catch(() => {})),
  );
  toAdd.forEach(t => subscribed.add(t));
  await writeSubscribedTopics(subscribed);
}

export async function unsubscribePlayerTopics(playerId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted = topicsForPlayer(playerId);
  const toRemove = wanted.filter(t => subscribed.has(t));
  if (toRemove.length === 0) return;

  await Promise.all(
    toRemove.map(t => messaging().unsubscribeFromTopic(t).catch(() => {})),
  );
  toRemove.forEach(t => subscribed.delete(t));
  await writeSubscribedTopics(subscribed);
}

/**
 * Reconcile FCM subscriptions against the user's current follow list.
 * Called on app launch and whenever the favorites list changes substantially
 * (e.g. after a Firestore sync from another device).
 *
 * Logic:
 *   wantedTopics  = union of all teams/leagues/players the user follows
 *   currentTopics = what we believe we're subscribed to (AsyncStorage)
 *   subscribe   to (wanted - current)
 *   unsubscribe from (current - wanted)
 */
export async function reconcileSubscriptions(args: {
  teamIds:   string[];
  leagueIds: string[];
  playerIds: string[];
}): Promise<void> {
  const wanted = new Set<string>();
  for (const id of args.teamIds)   topicsForTeam(id).forEach(t => wanted.add(t));
  for (const id of args.leagueIds) topicsForLeague(id).forEach(t => wanted.add(t));
  for (const id of args.playerIds) topicsForPlayer(id).forEach(t => wanted.add(t));

  const current = await readSubscribedTopics();
  const toAdd:    string[] = [];
  const toRemove: string[] = [];
  for (const t of wanted)   if (!current.has(t)) toAdd.push(t);
  for (const t of current)  if (!wanted.has(t))  toRemove.push(t);

  if (toAdd.length === 0 && toRemove.length === 0) return;

  await Promise.all([
    ...toAdd.map(t    => messaging().subscribeToTopic(t).catch(() => {})),
    ...toRemove.map(t => messaging().unsubscribeFromTopic(t).catch(() => {})),
  ]);

  // Replace the persisted set entirely so it matches the new reality
  await writeSubscribedTopics(wanted);
}

/**
 * Clear all subscriptions (e.g. on logout). Doesn't actually try to unsubscribe
 * each topic — that'd be expensive and the user may not even have permission
 * anymore. Just wipes the local record so next reconcile starts fresh.
 */
export async function clearLocalSubscriptionRecord(): Promise<void> {
  await AsyncStorage.removeItem(SUBSCRIBED_TOPICS_KEY).catch(() => {});
}
