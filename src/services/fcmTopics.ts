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
 * Topic names come from `FbTopics` (functions/src/shared/football/model.ts) —
 * the same object the backend sends with — and carry API-Sports ids:
 *
 * Live event topics (with bucket):
 *   fb_team_{id}_goals_d{0|2|5|10}  — goals (both teams' followers)
 *   fb_team_{id}_cards_d{0|2|5|10}  — red cards
 *   fb_team_{id}_yellow_d{0|2|5|10} — yellow cards (only when that toggle is on)
 *   fb_team_{id}_live_d{0|2|5|10}   — halftime + matchEnd…
 *   fb_team_{id}_subs_d{0|2|5|10}   — substitutions (only when that toggle is on)
 * Every event of a match reaches the followers of both teams.
 *
 * Immediate-only topics (NO bucket — never delayed):
 *   fb_team_{id}_kickoff   — matchStart
 *   fb_team_{id}_lineups   — lineups published
 *   fb_team_{id}_reminders — pre-match reminder
 *
 * The un-prefixed `team_{id}_*` / `player_{id}_*` / `mute_{id}` topics belong
 * to the previous data provider's id space. Builds that still use them keep
 * receiving pushes from the backend's dual-send; this build leaves them once
 * (unsubscribeLegacyTopics) so nobody gets a push twice.
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
import { FbTopics } from '../../functions/src/shared/football/model';

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

/** Topic name builders — the backend's own (`FbTopics`), so the two can't drift. */
export const TopicNames = {
  // ── Live event topics (with delay bucket) ──────────────────────────────────
  teamGoals:    (teamId: string, bucket: DelayBucket) => FbTopics.goals(teamId, bucket),
  teamCards:    (teamId: string, bucket: DelayBucket) => FbTopics.cards(teamId, bucket),
  teamLive:     (teamId: string, bucket: DelayBucket) => FbTopics.live(teamId, bucket),
  teamYellow:   (teamId: string, bucket: DelayBucket) => FbTopics.yellow(teamId, bucket),
  teamSubs:     (teamId: string, bucket: DelayBucket) => FbTopics.subs(teamId, bucket),

  // ── Immediate-only topics (no bucket — never delayed) ──────────────────────
  teamKickoff:   (teamId: string)   => FbTopics.kickoff(teamId),
  teamLineups:   (teamId: string)   => FbTopics.lineups(teamId),
  teamReminders: (teamId: string)   => FbTopics.reminders(teamId),

  // ── Modo Rival topics (immediate, no bucket) ───────────────────────────────
  // "Bad news" about a team the user marked as a RIVAL. Delivered immediately
  // (the delay buckets of Modo Estadio don't apply — schadenfreude isn't a
  // spoiler-avoidance scenario).
  teamRivalLoss:    (teamId: string) => FbTopics.rivalLoss(teamId),
  teamRivalBigLoss: (teamId: string) => FbTopics.rivalBigLoss(teamId),
  teamRivalRedCard: (teamId: string) => FbTopics.rivalRedCard(teamId),
  teamRivalPenMiss: (teamId: string) => FbTopics.rivalPenMiss(teamId),

  // ── Player topics: goals, red cards and starting XI of a followed player.
  // The server excludes (FCM condition) devices that already follow the
  // player's team — no doubles.
  playerGoals:   (playerId: string)  => FbTopics.playerGoals(playerId),
  playerCards:   (playerId: string)  => FbTopics.playerCards(playerId),
  playerLineups: (playerId: string)  => FbTopics.playerLineups(playerId),

  // ── Per-match mute ─────────────────────────────────────────────────────────
  // Muting a match SUBSCRIBES the device to this topic; the server appends
  // "&& !('fb_mute_{matchId}' in topics)" to every send of that match. FCM
  // evaluates the condition per device → real silence with the app closed.
  // (Followed-PLAYER pushes ignore it on purpose: following the player is a
  // stronger explicit opt-in than muting the match.)
  matchMute: (matchId: string) => FbTopics.mute(matchId),
};

/** Sibling buckets for a given (teamId, event class). Used to defensively
 *  unsubscribe BEFORE subscribing to the new bucket to prevent a brief window
 *  where the device is in two buckets simultaneously. */
const ALL_BUCKETS: DelayBucket[] = ['d0', 'd2', 'd5', 'd10'];

// ── Clases de evento por equipo (auditoría 10 jul 2026) ─────────────────────
// La granularidad REAL que el servidor ofrece son estas 6 clases de topic.
// Antes el cliente se suscribía SIEMPRE a las 6 y los toggles de la UI eran
// decorativos (en background el OS pinta el banner sin preguntarle a la app).
// Ahora las prefs gatean la membresía — el único enforcement que existe.
export type TeamEventClass =
  | 'goals' | 'cards' | 'live' | 'kickoff' | 'lineups' | 'reminders'
  | 'yellow' | 'subs';

/** Classes a team gets when the caller doesn't say (yellow cards and
 *  substitutions are opt-in: only when their toggle is on). */
export const ALL_TEAM_EVENT_CLASSES: TeamEventClass[] =
  ['goals', 'cards', 'live', 'kickoff', 'lineups', 'reminders'];

/** Mapea las prefs del usuario → clases de topic habilitadas. Espejo de la
 *  taxonomía del servidor: goals={gol+VAR}, cards={rojas}, yellow={amarillas},
 *  live={MT+2T+final+prórroga+penales+suspendido}, subs={sustituciones},
 *  kickoff={inicio}, lineups, reminders. Master switch apagado → nada.
 *  Cada evento del partido llega por el equipo seguido, sea de quien sea. */
export function teamEventsFromPrefs(p: {
  notificationsEnabled: boolean;
  goals: boolean; yellowCards: boolean; redCards: boolean;
  matchStart: boolean; halftime: boolean; matchEnd: boolean;
  substitutions: boolean; lineups: boolean; matchReminder: boolean;
}): TeamEventClass[] {
  if (!p.notificationsEnabled) return [];
  const ev: TeamEventClass[] = [];
  if (p.goals)                                        ev.push('goals');
  if (p.redCards)                                     ev.push('cards');
  if (p.yellowCards)                                  ev.push('yellow');
  if (p.halftime || p.matchEnd)                       ev.push('live');
  if (p.substitutions)                                ev.push('subs');
  if (p.matchStart)                                   ev.push('kickoff');
  if (p.lineups)                                      ev.push('lineups');
  if (p.matchReminder)                                ev.push('reminders');
  return ev;
}

/** Minutos de retraso → bucket VÁLIDO del servidor. El server solo publica
 *  d0/d2/d5/d10 — un bucket inventado (p. ej. 'd1' cuando la UI ofrecía
 *  "1 min") suscribía a topics fantasma y silenciaba TODO para siempre
 *  (bug crítico de la auditoría del 10 jul 2026). */
export function bucketForDelay(minutes: number): DelayBucket {
  if (minutes >= 10) return 'd10';
  if (minutes >= 5)  return 'd5';
  return 'd2';
}

/** Topics for a team in a given delay bucket, gated by enabled event classes. */
function topicsForTeam(teamId: string, bucket: DelayBucket, events: TeamEventClass[]): string[] {
  const t: string[] = [];
  if (events.includes('goals'))     t.push(TopicNames.teamGoals(teamId, bucket));
  if (events.includes('cards'))     t.push(TopicNames.teamCards(teamId, bucket));
  if (events.includes('live'))      t.push(TopicNames.teamLive(teamId, bucket));
  if (events.includes('yellow'))    t.push(TopicNames.teamYellow(teamId, bucket));
  if (events.includes('subs'))      t.push(TopicNames.teamSubs(teamId, bucket));
  if (events.includes('kickoff'))   t.push(TopicNames.teamKickoff(teamId));
  if (events.includes('lineups'))   t.push(TopicNames.teamLineups(teamId));
  if (events.includes('reminders')) t.push(TopicNames.teamReminders(teamId));
  return t;
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
      TopicNames.teamYellow(teamId, b),
      TopicNames.teamSubs(teamId, b),
    );
  }
  return topics;
}

/** TODOS los topics posibles de un equipo (buckets + inmediatos).
 *  Base del sweep autoritativo y del unfollow blindado: se intenta desuscribir
 *  todo lo que no esté en `wanted`, SIN confiar en el caché local (que puede
 *  mentir tras un wipe/fallo). FCM unsubscribe es idempotente y barato. */
function allPossibleTopicsForTeam(teamId: string): string[] {
  return [
    ...allBucketTopicsForTeam(teamId),
    TopicNames.teamKickoff(teamId),
    TopicNames.teamLineups(teamId),
    TopicNames.teamReminders(teamId),
  ];
}

/** Topics for a player (no bucket — el servidor envía inmediato, como Modo Rival). */
function topicsForPlayer(playerId: string): string[] {
  return [
    TopicNames.playerGoals(playerId),
    TopicNames.playerCards(playerId),
    TopicNames.playerLineups(playerId),
  ];
}

/** Modo Rival event classes (v1). Maps a settings-toggle key → topic builder.
 *  Exported so the notification-settings screen can subscribe/unsubscribe a
 *  single event class across all rival teams. */
export type RivalEvent = 'loss' | 'bigLoss' | 'redCard' | 'penMiss';

export const RIVAL_EVENTS: RivalEvent[] = ['loss', 'bigLoss', 'redCard', 'penMiss'];

const RIVAL_TOPIC_BY_EVENT: Record<RivalEvent, (teamId: string) => string> = {
  loss:       TopicNames.teamRivalLoss,
  bigLoss:    TopicNames.teamRivalBigLoss,
  redCard:    TopicNames.teamRivalRedCard,
  penMiss:    TopicNames.teamRivalPenMiss,
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
export async function subscribeTeamTopics(
  teamId: string,
  bucket: DelayBucket = 'd0',
  events: TeamEventClass[] = ALL_TEAM_EVENT_CLASSES,
): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const wanted     = new Set(topicsForTeam(teamId, bucket, events));

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
  // BLINDADO (auditoría 10 jul 2026): NO filtrar por el caché local. Si el
  // caché se perdió sin desuscribir (wipe de FCM_INIT_VERSION, fallo de
  // escritura), filtrar dejaba toRemove vacío → CERO llamadas FCM → el
  // usuario dejaba de seguir al equipo y los pushes seguían PARA SIEMPRE.
  // FCM unsubscribe es idempotente: intentar todo, siempre.
  const allTopics = allPossibleTopicsForTeam(teamId);
  const results = await Promise.all(allTopics.map(t => safeUnsubscribe(t)));
  // Solo sacar del caché lo que FCM confirmó — un fallo (offline) se queda
  // registrado y el próximo reconcile/unfollow lo reintenta.
  allTopics.forEach((t, i) => { if (results[i]) subscribed.delete(t); });
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

/**
 * PURGA ÚNICA de topics de liga (4-ago-2026). Builds viejos suscribían
 * league_{id}_start/_finals al seguir una liga; el subscribe se volvió no-op
 * en la auditoría, pero las suscripciones FCM PERSISTEN server-side — el
 * dueño recibió el kickoff de Levski Sofia vs Kairat por seguir Champions.
 * El server ya no envía a esos topics (fix principal); esto limpia el
 * device para siempre. Corre una vez por instalación (flag AsyncStorage),
 * en fondo, sobre TODOS los ids de liga del catálogo (~70×2 topics) porque
 * no sabemos qué ligas siguió el usuario en el pasado.
 */
const LEAGUE_TOPICS_PURGED_KEY = 'league_topics_purged_v1';

export async function purgeLegacyLeagueTopics(leagueIds: number[]): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(LEAGUE_TOPICS_PURGED_KEY);
    if (done) return;
    const token = await fcmReady();
    if (!token) return; // sin permiso de notifs — nada que purgar (reintenta luego)
    for (const id of leagueIds) {
      // Secuencial y sin prisa: es mantenimiento de fondo.
      await safeUnsubscribe(`league_${id}_start`);
      await safeUnsubscribe(`league_${id}_finals`);
    }
    await AsyncStorage.setItem(LEAGUE_TOPICS_PURGED_KEY, '1');
    addBreadcrumb('fcm', 'legacy league topics purged', { count: leagueIds.length });
  } catch { /* reintenta en el próximo arranque */ }
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
  // Blindado: sin filtro por caché (ver unsubscribeTeamTopics).
  const topics = topicsForPlayer(playerId);
  const results = await Promise.all(topics.map(t => safeUnsubscribe(t)));
  topics.forEach((t, i) => { if (results[i]) subscribed.delete(t); });
  await writeSubscribedTopics(subscribed);
}

// ── Mute por partido ─────────────────────────────────────────────────────────

/** Silenciar un partido = suscribirse a su topic de mute (el servidor excluye
 *  con condición FCM a los suscritos). Fire-and-forget desde toggleMatchMute. */
export async function subscribeMatchMute(matchId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const topic = TopicNames.matchMute(matchId);
  if (subscribed.has(topic)) return;
  if (await safeSubscribe(topic)) {
    subscribed.add(topic);
    await writeSubscribedTopics(subscribed);
  }
}

export async function unsubscribeMatchMute(matchId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  const topic = TopicNames.matchMute(matchId);
  // Blindado: intentar siempre (el caché puede mentir); idempotente.
  if (await safeUnsubscribe(topic)) {
    subscribed.delete(topic);
    await writeSubscribedTopics(subscribed);
  }
}

/**
 * Borra del registro local el mute de un partido SIN tocar FCM. Lo usa Modo
 * Estadio por partido: ahí el servidor administra ese topic, y si el registro
 * siguiera diciendo "suscrito", un mute posterior del usuario no haría nada.
 */
export async function forgetMatchMuteRecord(matchId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  if (subscribed.delete(TopicNames.matchMute(matchId))) await writeSubscribedTopics(subscribed);
}

// ── Modo Rival ──────────────────────────────────────────────────────────────

/** Subscribe to a rival team's "bad news" topics. `events` defaults to all
 *  of them; pass a subset to honour the user's per-event settings toggles. */
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

/** Unsubscribe from a rival team's bad-news topics (all of them). */
export async function unsubscribeRivalTopics(teamId: string): Promise<void> {
  const subscribed = await readSubscribedTopics();
  // Blindado: sin filtro por caché (ver unsubscribeTeamTopics).
  const topics = topicsForRival(teamId);
  const results = await Promise.all(topics.map(t => safeUnsubscribe(t)));
  topics.forEach((t, i) => { if (results[i]) subscribed.delete(t); });
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

// ── Legacy topics (previous data provider's id space) ────────────────────────

/** Set once this device has left every legacy topic. */
const LEGACY_FB_TOPICS_MIGRATED_KEY = 'analistas_fb_topics_migrated_v1';

const LEGACY_BUCKETS = ['d0', 'd2', 'd5', 'd10'];

/** Every topic an old build could have subscribed for a team (followed or rival). */
function legacyTopicsForTeam(id: string): string[] {
  const t: string[] = [];
  for (const b of LEGACY_BUCKETS) t.push(`team_${id}_goals_${b}`, `team_${id}_cards_${b}`, `team_${id}_live_${b}`);
  t.push(
    `team_${id}_kickoff`, `team_${id}_lineups`, `team_${id}_reminders`,
    // pre-bucket builds
    `team_${id}_goals`, `team_${id}_cards`, `team_${id}_start`,
    // Modo Rival
    `team_${id}_rival_loss`, `team_${id}_rival_bigloss`, `team_${id}_rival_redcard`,
    `team_${id}_rival_penmiss`, `team_${id}_rival_eliminated`,
  );
  return t;
}

export interface LegacySubscriptions {
  teamIds: string[];
  rivalTeamIds: string[];
  playerIds: string[];
  muteMatchIds: string[];
}

/**
 * Leave every topic of the previous id space, once per install. The backend
 * still sends to `team_{oldId}_*` for devices on old builds; a device that also
 * holds the new `fb_*` subscriptions would get those pushes twice.
 *
 * `legacy` are the ids this device had saved before the favorites migration.
 * Topics recorded in the local subscription cache are swept too, whatever
 * entity they belong to. Returns false (and will run again next time) when
 * FCM isn't ready or some unsubscribe failed.
 */
export async function unsubscribeLegacyTopics(legacy: LegacySubscriptions): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(LEGACY_FB_TOPICS_MIGRATED_KEY)) return true;
    const token = await fcmReady();
    if (!token) return false; // no token → nothing is subscribed with it; retry when there is one

    const cached = await readSubscribedTopics();
    const topics = new Set<string>();
    for (const t of cached) if (!t.startsWith('fb_')) topics.add(t);
    for (const id of new Set([...legacy.teamIds, ...legacy.rivalTeamIds])) {
      legacyTopicsForTeam(id).forEach(t => topics.add(t));
    }
    for (const id of legacy.playerIds) {
      topics.add(`player_${id}_goals`); topics.add(`player_${id}_cards`); topics.add(`player_${id}_lineups`);
    }
    for (const id of legacy.muteMatchIds) topics.add(`mute_${id}`);

    let allOk = true;
    await runInBatches([...topics], async t => {
      if (await safeUnsubscribe(t)) cached.delete(t);
      else allOk = false;
    });
    await writeSubscribedTopics(cached);
    if (allOk) {
      await AsyncStorage.setItem(LEGACY_FB_TOPICS_MIGRATED_KEY, '1');
      addBreadcrumb('fcm', 'legacy topics left', { count: topics.size });
    }
    return allOk;
  } catch {
    return false; // retried on the next launch
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
  /** Clases de evento de equipo habilitadas por las prefs del usuario.
   *  Default: todas (compat con callers viejos). */
  teamEvents?: TeamEventClass[];
  /** Master switch "Recibir notificaciones". false → wanted vacío: el sweep
   *  desuscribe TODO (equipos, jugadores y rivales) de verdad, en FCM. */
  enabled?: boolean;
  /** Partidos silenciados por el usuario — sus topics mute_{id} se preservan
   *  en wanted para que el sweep (current − wanted) no los desuscriba. */
  muteMatchIds?: string[];
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
  const teamEvents  = args.teamEvents ?? ALL_TEAM_EVENT_CLASSES;
  const enabled     = args.enabled !== false;

  // ── Desired ("wanted") topic set ──────────────────────────────────────────
  // Gateado por las prefs (auditoría 10 jul 2026): las clases de evento de
  // equipo y el master switch por fin gobiernan la membresía real de topics —
  // antes se suscribía SIEMPRE el paquete completo y los toggles eran
  // decorativos. Con el master apagado, wanted queda vacío y el sweep de
  // abajo desuscribe todo.
  const wanted = new Set<string>();
  if (enabled) {
    for (const id of args.teamIds)   topicsForTeam(id, bucket, teamEvents).forEach(t => wanted.add(t));
    // leagueIds intentionally skipped — display-only.
    for (const id of args.playerIds) topicsForPlayer(id).forEach(t => wanted.add(t));
    for (const id of args.rivalTeamIds ?? []) {
      for (const ev of rivalEvents) wanted.add(RIVAL_TOPIC_BY_EVENT[ev](id));
    }
  }
  // Los mutes por partido se preservan SIEMPRE (incluso con el master switch
  // apagado — silenciar es lo contrario de recibir): si no estuvieran en
  // wanted, el diff current − wanted los desuscribiría en cada reconcile.
  for (const id of args.muteMatchIds ?? []) wanted.add(TopicNames.matchMute(id));

  const current = await readSubscribedTopics();

  // ── Removals — AUTHORITATIVE, not a pure cache diff ───────────────────────
  // (1) Anything cached that's no longer wanted (unfollowed team/player/rival,
  //     or a stale delay bucket left in the cache).
  // (2) CRITICAL FIX: every possible topic of a KNOWN entity (equipo, jugador,
  //     rival) that isn't wanted — INCLUDING topics absent from the local
  //     cache. The cache can diverge from FCM's real membership (an
  //     FCM_INIT_VERSION wipe cleared the cache WITHOUT unsubscribing
  //     server-side, orphaning old topics). A pure `current - wanted` diff can
  //     never remove what it doesn't know about — the device stayed in stale
  //     buckets (double push / spoiler) or in event classes the user disabled.
  //     This sweep covers buckets, immediate topics, player and rival topics
  //     uniformly. FCM unsubscribe is idempotent and cheap.
  const removeSet = new Set<string>();
  for (const t of current) if (!wanted.has(t)) removeSet.add(t);
  for (const id of args.teamIds) {
    for (const t of allPossibleTopicsForTeam(id)) if (!wanted.has(t)) removeSet.add(t);
  }
  for (const id of args.playerIds) {
    for (const t of topicsForPlayer(id)) if (!wanted.has(t)) removeSet.add(t);
  }
  for (const id of args.rivalTeamIds ?? []) {
    for (const t of topicsForRival(id)) if (!wanted.has(t)) removeSet.add(t);
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

// ── Invalidación por cambio de token ─────────────────────────────────────────
// La membresía de topics en FCM vive POR TOKEN. Si el token cambió (reinstalación
// con Android Auto Backup que restaura AsyncStorage, rotación de token), el
// caché local describe las suscripciones del token MUERTO: el reconcile creería
// que todo está suscrito y no re-suscribiría nada → silencio total (síntoma A
// de la auditoría 10 jul 2026). Guardamos el token junto al caché; si difiere,
// se borra el caché y el próximo reconcile re-suscribe todo desde cero.
const CACHE_TOKEN_KEY = 'analistas_fcm_cache_token';

export async function invalidateSubscriptionCacheOnTokenChange(currentToken: string): Promise<void> {
  try {
    const cachedToken = await AsyncStorage.getItem(CACHE_TOKEN_KEY);
    if (cachedToken === currentToken) return;
    if (cachedToken) {
      // Token distinto al que construyó el caché → el caché miente.
      await AsyncStorage.removeItem(SUBSCRIBED_TOPICS_KEY);
      addBreadcrumb('fcm', 'subscription cache invalidated (token changed)');
    }
    await AsyncStorage.setItem(CACHE_TOKEN_KEY, currentToken);
  } catch {
    // Best-effort — el próximo arranque lo reintenta.
  }
}
