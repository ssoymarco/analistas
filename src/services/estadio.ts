/**
 * estadio.ts — Modo Estadio for one match (client side).
 *
 * The mode used to be a global switch that re-subscribed every followed team
 * to another set of FCM topics from the phone. Now it belongs to a single
 * match and the server does the work: one call to `fbEstadio` and the device
 * is taken out of that match's regular pushes and served by token, a few
 * minutes late (functions/src/football/estadio.ts).
 *
 * This module is plain (no React): the match screen uses it through
 * NotificationPrefsContext, and the notification buttons ("Activar Modo
 * Estadio", "Me spoileó", "Apagar") call it directly — iOS delivers those with
 * the app in the background, sometimes without a mounted React tree. So it
 * reads what it needs (followed teams, rivals, players, toggles) straight
 * from AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from './firebase';
import { fcmReady } from './fcmInit';
import { rivalEventsFromPrefs, teamEventsFromPrefs } from './fcmTopics';
import { FAVORITES_KEYS } from './football/legacyMigration';
import { getTeamFamilies } from './football/teamFamilies';
import {
  bumpedDelay, ESTADIO_DEFAULT_DELAY, ESTADIO_DELAYS,
  type EstadioClass, type EstadioRequest, type EstadioResponse, type EstadioRivalEvent,
} from '../../functions/src/shared/football/estadio';

export { ESTADIO_DELAYS, ESTADIO_DEFAULT_DELAY };

const SESSIONS_KEY = 'analistas_estadio_sessions_v2';
const LAST_DELAY_KEY = 'analistas_estadio_last_delay';
const HANDLED_ACTIONS_KEY = 'analistas_estadio_handled_actions';
const REGION = 'us-central1';
const CALL_TIMEOUT_MS = 20_000;
const MAX_PLAYERS = 200;

/** A match this device has the mode on for. */
export interface EstadioSessionLocal {
  delayMin: number;
  /** Unix seconds after which the server has dropped the session for sure. */
  endsAt: number;
}
export type EstadioSessions = Record<string, EstadioSessionLocal>;

/** The match, as far as this module needs it. */
export interface EstadioMatchRef {
  id: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

/** Why a request didn't go through — the sheet turns it into a message. */
export type EstadioErrorCode = 'no-push' | 'match-finished' | 'failed';
export class EstadioError extends Error {
  constructor(public readonly code: EstadioErrorCode) {
    super(code);
    this.name = 'EstadioError';
  }
}

// ── Transport (tests swap it) ────────────────────────────────────────────────

type Transport = (req: EstadioRequest) => Promise<EstadioResponse>;

let transport: Transport = async req => {
  const fn = httpsCallable<EstadioRequest, EstadioResponse>(
    getFunctions(app, REGION), 'fbEstadio', { timeout: CALL_TIMEOUT_MS },
  );
  return (await fn(req)).data;
};

export function setEstadioTransport(t: Transport): void {
  transport = t;
}

async function call(req: EstadioRequest): Promise<EstadioResponse> {
  try {
    return await transport(req);
  } catch (err) {
    const text = `${(err as { code?: string }).code ?? ''} ${(err as Error)?.message ?? ''}`;
    throw new EstadioError(/match-finished/.test(text) ? 'match-finished' : 'failed');
  }
}

async function token(): Promise<string> {
  const t = await fcmReady();
  if (!t) throw new EstadioError('no-push');
  return t;
}

// ── Local record ─────────────────────────────────────────────────────────────

const listeners = new Set<(s: EstadioSessions) => void>();

/** Called whenever the sessions change, from the app or from a notification button. */
export function subscribeEstadio(listener: (s: EstadioSessions) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Sessions still alive (expired ones are dropped on the way). */
export async function readEstadioSessions(): Promise<EstadioSessions> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    const all = (raw ? JSON.parse(raw) : {}) as EstadioSessions;
    const now = Math.floor(Date.now() / 1000);
    const live: EstadioSessions = {};
    for (const [id, s] of Object.entries(all)) {
      if (s && typeof s.delayMin === 'number' && s.endsAt > now) live[id] = s;
    }
    return live;
  } catch {
    return {};
  }
}

async function writeSessions(next: EstadioSessions): Promise<void> {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(next)).catch(() => {});
  listeners.forEach(l => l(next));
}

async function setSession(matchId: string, s: EstadioSessionLocal | null): Promise<void> {
  const all = await readEstadioSessions();
  if (s) all[matchId] = s; else delete all[matchId];
  await writeSessions(all);
}

/** The option the user picked last time (what the notification button uses). */
export async function getLastEstadioDelay(): Promise<number> {
  const raw = Number(await AsyncStorage.getItem(LAST_DELAY_KEY).catch(() => null));
  return (ESTADIO_DELAYS as readonly number[]).includes(raw) ? raw : ESTADIO_DEFAULT_DELAY;
}

/**
 * The match ended: the server closes the session on its own, this only stops
 * showing it as active here.
 */
export async function forgetEstadio(matchId: string): Promise<void> {
  const all = await readEstadioSessions();
  if (!(matchId in all)) return;
  delete all[matchId];
  await writeSessions(all);
}

// ── What this device wants from the match ────────────────────────────────────

async function readList(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

interface Wants {
  classes: EstadioClass[];
  rivalTeamIds: string[];
  rivalEvents: EstadioRivalEvent[];
  playerIds: string[];
}

/**
 * The same notifications the device gets for this match today — its toggles
 * (with this match's own overrides), its rivals and its followed players —
 * so that turning the mode on changes WHEN they arrive, not WHICH.
 */
export async function wantsForMatch(match: EstadioMatchRef): Promise<Wants> {
  // Imported here: the context imports this module.
  const { PREFS_KEY, OVERRIDES_KEY, DEFAULT_NOTIFICATION_PREFS } = await import('../contexts/NotificationPrefsContext');
  const [teams, rivals, players, rawPrefs, rawOverrides] = await Promise.all([
    readList(FAVORITES_KEYS.teams), readList(FAVORITES_KEYS.rivals), readList(FAVORITES_KEYS.players),
    AsyncStorage.getItem(PREFS_KEY).catch(() => null), AsyncStorage.getItem(OVERRIDES_KEY).catch(() => null),
  ]);

  let prefs = { ...DEFAULT_NOTIFICATION_PREFS };
  try { if (rawPrefs) prefs = { ...prefs, ...JSON.parse(rawPrefs) }; } catch { /* defaults */ }
  let effective = prefs;
  try {
    const mine = rawOverrides ? (JSON.parse(rawOverrides) as Record<string, Record<string, boolean>>)[match.id] : null;
    if (mine) effective = { ...prefs, ...mine };
  } catch { /* no overrides */ }

  const sides = [match.homeTeamId, match.awayTeamId].filter((id): id is string => !!id).map(String);
  // Following Mexico also means Mexico U17 (see teamFamilies).
  const senior = await getTeamFamilies().catch(() => ({} as Record<string, string>));
  const follows = sides.some(id => teams.includes(id) || (!!senior[id] && teams.includes(senior[id])));

  return {
    classes: follows ? (teamEventsFromPrefs(effective) as EstadioClass[]) : [],
    rivalTeamIds: prefs.notificationsEnabled ? sides.filter(id => rivals.includes(id)) : [],
    rivalEvents: prefs.notificationsEnabled ? rivalEventsFromPrefs(prefs) : [],
    playerIds: prefs.notificationsEnabled ? players.slice(0, MAX_PLAYERS) : [],
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────

const platform = (): 'ios' | 'android' => (Platform.OS === 'ios' ? 'ios' : 'android');

/** Turn the mode on for a match, or change its delay. Resolves once the server confirmed. */
export async function startEstadio(
  match: EstadioMatchRef,
  delayMin: number,
  opts: { confirm?: boolean } = {},
): Promise<EstadioSessionLocal> {
  const fcmToken = await token();
  const wants = await wantsForMatch(match);
  const res = await call({
    action: 'start', matchId: match.id, fcmToken, delayMin, platform: platform(), confirm: opts.confirm, ...wants,
  });
  if (!res.active) throw new EstadioError('failed');
  const session = { delayMin: res.delayMin, endsAt: res.endsAt ?? Math.floor(Date.now() / 1000) + 4 * 3600 };
  await setSession(match.id, session);
  await AsyncStorage.setItem(LAST_DELAY_KEY, String(delayMin)).catch(() => {});
  return session;
}

/**
 * Turn the mode off for a match. `keepMuted`: the user silenced the match, so
 * the device stays out of its pushes.
 */
export async function stopEstadio(
  matchId: string,
  opts: { keepMuted?: boolean; confirm?: boolean } = {},
): Promise<void> {
  const fcmToken = await token();
  await call({ action: 'stop', matchId, fcmToken, keepMuted: opts.keepMuted, confirm: opts.confirm });
  await setSession(matchId, null);
}

/** "Me spoileó": more delay from now on. Returns the delay in force (0 = no session). */
export async function bumpEstadio(matchId: string, opts: { confirm?: boolean } = {}): Promise<number> {
  const fcmToken = await token();
  const res = await call({ action: 'bump', matchId, fcmToken, confirm: opts.confirm });
  const all = await readEstadioSessions();
  if (!res.active) {
    await setSession(matchId, null);
    return 0;
  }
  await setSession(matchId, { delayMin: res.delayMin, endsAt: res.endsAt ?? all[matchId]?.endsAt ?? Math.floor(Date.now() / 1000) + 4 * 3600 });
  return res.delayMin;
}

/** The delay "me spoileó" would lead to (for labels). */
export function nextEstadioDelay(delayMin: number): number {
  return bumpedDelay(delayMin);
}

/** The user silenced a match: if the mode was on there, end it and stay muted. */
export async function stopEstadioBecauseMuted(matchId: string): Promise<void> {
  const all = await readEstadioSessions();
  if (!(matchId in all)) return;
  await stopEstadio(matchId, { keepMuted: true }).catch(async () => {
    // Offline: the server session lapses by itself; don't keep showing it.
    await setSession(matchId, null);
  });
}

// ── Notification buttons ─────────────────────────────────────────────────────

export type EstadioAction = 'on' | 'spoiled' | 'off';

/**
 * A long-press button of a notification was used. `responseId` identifies that
 * tap: the OS can hand the same response to the app again on a later launch,
 * and "me spoileó" must not add its minutes twice.
 *
 * Returns false when the request failed (the caller tells the user: there is
 * no screen to show an error on).
 */
export async function handleEstadioAction(
  action: EstadioAction,
  data: Record<string, unknown> | null | undefined,
  responseId: string,
): Promise<boolean | 'ignored'> {
  const matchId = typeof data?.matchId === 'string' ? data.matchId : null;
  if (!matchId) return 'ignored';

  const key = `${responseId}:${action}`;
  let handled: string[] = [];
  try { handled = JSON.parse((await AsyncStorage.getItem(HANDLED_ACTIONS_KEY)) ?? '[]'); } catch { /* none */ }
  if (handled.includes(key)) return 'ignored';
  await AsyncStorage.setItem(HANDLED_ACTIONS_KEY, JSON.stringify([...handled, key].slice(-30))).catch(() => {});

  try {
    if (action === 'on') {
      const delay = await getLastEstadioDelay();
      await startEstadio({
        id: matchId,
        homeTeamId: data?.homeTeamId != null ? String(data.homeTeamId) : null,
        awayTeamId: data?.awayTeamId != null ? String(data.awayTeamId) : null,
      }, delay, { confirm: true });
    } else if (action === 'spoiled') {
      await bumpEstadio(matchId, { confirm: true });
    } else {
      await stopEstadio(matchId, { confirm: true });
    }
    return true;
  } catch {
    return false;
  }
}
