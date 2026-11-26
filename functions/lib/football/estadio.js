"use strict";
/**
 * football/estadio.ts
 *
 * Modo Estadio per match (v2). The first design delayed pushes with one FCM
 * topic per delay (`…_d2/_d5/_d10`) and a GLOBAL switch in the app: turning it
 * on meant re-subscribing every followed team from the phone (hundreds of
 * calls that died when the phone was locked), switching mid-match repeated or
 * lost events, and rival / followed-player pushes were never delayed.
 *
 * Here the mode belongs to ONE match and the server owns it:
 *
 *   start  The app calls `fbEstadio` once. We subscribe the device's token to
 *          the match's mute topic — every regular push of the match already
 *          excludes it — and to its hold topic (followed-player pushes, which
 *          ignore mute), and store a session: token, delay, what the device
 *          wants from this match (its notification toggles, rival teams,
 *          followed players).
 *   event  dispatchEstadioSessions() runs with every batch of changes: each
 *          session that wants a change gets it by token, `delayMin` minutes
 *          later, through the same `deliverDelayedPush` queue (VAR guard
 *          included). Only what is detected AFTER the session started goes
 *          this way; what came before was delivered by the topics → switching
 *          mid-match neither repeats nor loses anything.
 *   stop   The session is deleted and the token leaves both topics. Pushes
 *          already queued carry their tokens, so they still arrive.
 *   end    At full time the session gets a short expiry (after its last push);
 *          sweepEstadioSessions() then unmutes the device and deletes it.
 *          Sessions never outlive 4 h past kickoff.
 *
 * Cost follows the number of devices that have the mode on in a match, not the
 * number of users: one query per dispatch, one task per (event, delay).
 * Sessions live in `fb_estadio` (server only: no client rule opens it).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESTADIO_COL = void 0;
exports.sessionIdFor = sessionIdFor;
exports.sessionPushFor = sessionPushFor;
exports.dispatchEstadioSessions = dispatchEstadioSessions;
exports.sweepEstadioSessions = sweepEstadioSessions;
exports.handleEstadio = handleEstadio;
const crypto_1 = require("crypto");
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("../admin-init");
const deliver_delayed_push_1 = require("../deliver-delayed-push");
const estadio_1 = require("../shared/football/estadio");
const model_1 = require("../shared/football/model");
const mapping_1 = require("./mapping");
const names_1 = require("./names");
const notify_1 = require("./notify");
const store_1 = require("./store");
exports.ESTADIO_COL = 'fb_estadio';
/** A session never outlives this past kickoff (abandoned or never-ending matches). */
const MAX_AFTER_KICKOFF_SEC = 4 * 3600;
/** After full time: the session's delay plus this, so its last push goes out first. */
const END_GRACE_SEC = 120;
/** Same slack as the topic buckets (see CORRECTION_MARGIN_SEC in notify.ts). */
const CORRECTION_MARGIN_SEC = 15;
const TOKENS_PER_TASK = 400;
const MAX_PLAYERS = 200;
function sessionIdFor(matchId, token) {
    return `${matchId}_${(0, crypto_1.createHash)('sha256').update(token).digest('hex').slice(0, 24)}`;
}
// ── What a session wants ─────────────────────────────────────────────────────
const CLASS_OF = {
    goal: 'goals', goalCancelled: 'goals',
    redCard: 'cards', redCardCancelled: 'cards',
    yellowCard: 'yellow',
    substitution: 'subs',
    halftime: 'live', secondHalfStart: 'live', matchEnd: 'live', extraTimeStart: 'live',
    penaltiesStart: 'live', matchSuspended: 'live',
    matchStart: 'kickoff', kickoffDelayed: 'kickoff',
    lineups: 'lineups',
    matchReminder: 'reminders',
};
const RIVAL_OF = {
    rivalLoss: 'loss', rivalBigLoss: 'bigLoss', rivalRedCard: 'redCard', rivalPenMiss: 'penMiss',
};
/** Never a spoiler: delivered at once, as the topics do. */
const PRE_MATCH = new Set(['kickoff', 'lineups', 'reminders']);
/**
 * The push a session gets for a change, or null when it wants none.
 *
 *  - its own notification toggles decide the team events;
 *  - a followed player's goal or red card reaches a device that doesn't get
 *    the team push for it (same rule as the player topics);
 *  - rival news follows the rival toggles; the "rival sent off" push is
 *    dropped when the device already gets the red card itself;
 *  - a correction (disallowed goal, revoked red) is only for a device that
 *    was shown the event: either it saw it live before turning the mode on,
 *    or its delayed copy had already gone out.
 */
function sessionPushFor(s, c) {
    const delayed = s.delayMin * 60;
    const cls = CLASS_OF[c.type];
    if (cls) {
        if (s.classes.includes(cls)) {
            if (PRE_MATCH.has(cls))
                return { variant: 'team', delaySec: 0 };
            if (c.type === 'goalCancelled' || c.type === 'redCardCancelled') {
                const shown = c.eventAt == null || s.startedAt > c.eventAt ||
                    (c.revokedAt ?? c.eventAt) - c.eventAt >= delayed - CORRECTION_MARGIN_SEC;
                if (!shown)
                    return null;
            }
            return { variant: 'team', delaySec: delayed };
        }
        const p = (0, notify_1.playerPushFor)(c);
        return p && s.playerIds.includes(p.playerId) ? { variant: 'player', delaySec: delayed } : null;
    }
    const rival = RIVAL_OF[c.type];
    if (rival && c.side) {
        const teamId = c.side === 'home' ? c.homeTeam.id : c.awayTeam.id;
        if (!s.rivalTeamIds.includes(teamId) || !s.rivalEvents.includes(rival))
            return null;
        if (c.type === 'rivalRedCard' && s.classes.includes('cards'))
            return null;
        return { variant: 'team', delaySec: delayed };
    }
    return null;
}
// ── Firestore ────────────────────────────────────────────────────────────────
const firestoreSessions = {
    async load(matchIds, nowSec) {
        const out = new Map();
        for (let i = 0; i < matchIds.length; i += 30) {
            const snap = await admin_init_1.db.collection(exports.ESTADIO_COL).where('matchId', 'in', matchIds.slice(i, i + 30)).get();
            snap.forEach(d => {
                const s = { ...d.data(), id: d.id };
                if (s.endsAt <= nowSec || !s.token)
                    return;
                const list = out.get(s.matchId);
                if (list)
                    list.push(s);
                else
                    out.set(s.matchId, [s]);
            });
        }
        return out;
    },
    async expire(updates) {
        for (let i = 0; i < updates.length; i += 400) {
            const batch = admin_init_1.db.batch();
            for (const u of updates.slice(i, i + 400))
                batch.update(admin_init_1.db.doc(`${exports.ESTADIO_COL}/${u.id}`), { endsAt: u.endsAt });
            await batch.commit();
        }
    },
};
// ── Dispatch ─────────────────────────────────────────────────────────────────
/**
 * Deliver a batch of changes to the sessions of their matches. `queue` null
 * (delays switched off with ESTADIO_DELAY_ENABLED=false) → everything goes out
 * at once: a muted device must never be left without its pushes.
 */
async function dispatchEstadioSessions(changes, deps) {
    if (!changes.length)
        return;
    const source = deps.sessions ?? firestoreSessions;
    const nowSec = deps.nowSec ?? Math.floor(Date.now() / 1000);
    const byMatch = await source.load([...new Set(changes.map(c => c.matchId))], nowSec);
    if (!byMatch.size)
        return;
    const work = [];
    const expire = [];
    for (const c of changes) {
        const sessions = byMatch.get(c.matchId);
        if (!sessions?.length)
            continue;
        const groups = new Map();
        for (const s of sessions) {
            const push = sessionPushFor(s, c);
            if (!push)
                continue;
            const key = `${push.variant}_${push.delaySec}`;
            const g = groups.get(key);
            if (g)
                g.tokens.push(s.token);
            else
                groups.set(key, { push, tokens: [s.token] });
        }
        for (const [key, { push, tokens }] of groups) {
            let copy;
            let data;
            let dedupId;
            if (push.variant === 'player') {
                const p = (0, notify_1.playerPushFor)(c);
                if (!p)
                    continue;
                ({ copy, data, dedupId } = p);
            }
            else {
                copy = (0, notify_1.buildCopy)(c);
                data = (0, notify_1.payloadFor)(c);
                dedupId = (0, notify_1.dedupFor)(c);
            }
            if (!deps.queue || push.delaySec === 0) {
                work.push((0, deliver_delayed_push_1.sendPushToTokens)(tokens, copy, data, dedupId, `${c.type}-estadio`.slice(0, 50), estadio_1.ESTADIO_PUSH_CATEGORY));
                continue;
            }
            for (let i = 0; i < tokens.length; i += TOKENS_PER_TASK) {
                const payload = {
                    tokens: tokens.slice(i, i + TOKENS_PER_TASK),
                    category: estadio_1.ESTADIO_PUSH_CATEGORY,
                    title: copy.title, body: copy.body, data, dedupId,
                    changeType: c.type, matchId: c.matchId,
                    homeScore: c.homeScore, awayScore: c.awayScore,
                    matchCollection: 'fb_matches',
                    ...(c.type === 'redCard' ? { homeRedCards: c.homeRedCards, awayRedCards: c.awayRedCards } : {}),
                };
                work.push((0, notify_1.enqueueDelayed)(deps.queue, payload, {
                    scheduleDelaySeconds: push.delaySec,
                    id: (0, notify_1.taskIdFor)(`fbs_${dedupId}_${key}_${i / TOKENS_PER_TASK}`),
                }));
            }
        }
        // Full time: the session lives just long enough to deliver its last push.
        if (c.type === 'matchEnd') {
            for (const s of sessions) {
                const endsAt = nowSec + s.delayMin * 60 + END_GRACE_SEC;
                if (endsAt < s.endsAt)
                    expire.push({ id: s.id, endsAt });
            }
        }
    }
    if (expire.length) {
        work.push(source.expire(expire).catch(err => logger.warn('Modo Estadio: could not set the final expiry', { err: String(err) })));
    }
    const results = await Promise.allSettled(work);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed)
        logger.error(`Modo Estadio: ${failed} session delivery call(s) failed`);
}
/**
 * Close sessions whose time is up: take their devices out of the match's mute
 * topic and delete them. Runs once a minute from the live poller. Never throws.
 */
async function sweepEstadioSessions(nowSec = Math.floor(Date.now() / 1000)) {
    try {
        const snap = await admin_init_1.db.collection(exports.ESTADIO_COL).where('endsAt', '<=', nowSec).limit(300).get();
        if (snap.empty)
            return 0;
        const tokensByMatch = new Map();
        snap.forEach(d => {
            const s = d.data();
            if (!s.matchId || !s.token)
                return;
            const list = tokensByMatch.get(s.matchId);
            if (list)
                list.push(s.token);
            else
                tokensByMatch.set(s.matchId, [s.token]);
        });
        for (const [matchId, tokens] of tokensByMatch) {
            for (let i = 0; i < tokens.length; i += 1000) {
                await releaseDevices(tokens.slice(i, i + 1000), matchId)
                    .catch(err => logger.warn('Modo Estadio: unmute at session end failed', { matchId, err: String(err) }));
            }
        }
        const batch = admin_init_1.db.batch();
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        logger.info(`Modo Estadio: ${snap.size} session(s) closed`);
        return snap.size;
    }
    catch (err) {
        logger.warn('Modo Estadio: sweep failed', { err: String(err) });
        return 0;
    }
}
// ── Topic membership of a session's devices ──────────────────────────────────
/** Take devices out of the match's regular pushes. Throws if any topic refuses. */
async function holdDevices(tokens, matchId) {
    const done = [];
    try {
        for (const topic of [model_1.FbTopics.mute(matchId), model_1.FbTopics.hold(matchId)]) {
            const res = await admin_init_1.admin.messaging().subscribeToTopic(tokens, topic);
            if (res.failureCount > 0)
                throw new https_1.HttpsError('failed-precondition', 'token-rejected');
            done.push(topic);
        }
    }
    catch (err) {
        // Half-held is the worst state (muted, or player pushes lost, with no
        // session behind): undo what went through.
        for (const topic of done)
            await admin_init_1.admin.messaging().unsubscribeFromTopic(tokens, topic).catch(() => { });
        throw err;
    }
}
/** Put devices back on the match's regular pushes. Returns false if FCM refused. */
async function releaseDevices(tokens, matchId, keepMuted = false) {
    let ok = true;
    for (const topic of keepMuted ? [model_1.FbTopics.hold(matchId)] : [model_1.FbTopics.hold(matchId), model_1.FbTopics.mute(matchId)]) {
        const res = await admin_init_1.admin.messaging().unsubscribeFromTopic(tokens, topic);
        if (res.failureCount > 0)
            ok = false;
    }
    return ok;
}
// ── Callable ─────────────────────────────────────────────────────────────────
function cleanList(value, allowed) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.filter((v) => typeof v === 'string' && allowed.includes(v)))];
}
function cleanIds(value, max) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map(v => String(v)).filter(v => /^\d{1,12}$/.test(v)))].slice(0, max);
}
function matchData(matchId, m, type) {
    return {
        sport: 'football', v: '2', type, matchId,
        homeTeam: m.homeTeam.name, awayTeam: m.awayTeam.name,
        homeTeamId: String(m.homeTeam.id), awayTeamId: String(m.awayTeam.id),
        homeScore: String(m.homeScore ?? 0), awayScore: String(m.awayScore ?? 0),
        leagueId: String(m.leagueId),
    };
}
async function confirmPush(token, matchId, m, type, copy) {
    const data = m ? matchData(matchId, m, type) : { sport: 'football', v: '2', type, matchId };
    await (0, deliver_delayed_push_1.sendPushToTokens)([token], copy, data, `fb${matchId}_${type}`.slice(0, 64), type, estadio_1.ESTADIO_PUSH_CATEGORY)
        .catch(err => logger.warn('Modo Estadio: confirmation push failed', { matchId, err: String(err) }));
}
const vs = (m) => (m ? `${(0, names_1.teamLabel)(m.homeTeam)} vs ${(0, names_1.teamLabel)(m.awayTeam)}: ` : '');
/** Body of the `fbEstadio` callable. */
async function handleEstadio(raw, uid) {
    const req = (raw ?? {});
    const matchId = String(req.matchId ?? '');
    const token = String(req.fcmToken ?? '');
    if (!/^\d{1,12}$/.test(matchId))
        throw new https_1.HttpsError('invalid-argument', 'matchId');
    if (token.length < 20 || token.length > 4096 || /\s/.test(token))
        throw new https_1.HttpsError('invalid-argument', 'fcmToken');
    if (req.action !== 'start' && req.action !== 'stop' && req.action !== 'bump' && req.action !== 'refresh') {
        throw new https_1.HttpsError('invalid-argument', "action must be 'start' | 'stop' | 'bump' | 'refresh'");
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const ref = admin_init_1.db.doc(`${exports.ESTADIO_COL}/${sessionIdFor(matchId, token)}`);
    const [matchSnap, prevSnap] = await admin_init_1.db.getAll(admin_init_1.db.doc(`${store_1.COL.matches}/${matchId}`), ref);
    const match = matchSnap.exists ? matchSnap.data() : null;
    const prev = prevSnap.exists ? prevSnap.data() : null;
    if (req.action === 'stop') {
        await ref.delete();
        // The session is gone; if FCM refuses, the device may still be muted: tell the app.
        if (!(await releaseDevices([token], matchId, !!req.keepMuted)))
            throw new https_1.HttpsError('unavailable', 'unmute-failed');
        if (req.confirm) {
            await confirmPush(token, matchId, match, 'estadioOff', {
                title: 'Modo Estadio apagado',
                body: `${vs(match)}tus avisos vuelven a llegar al momento.`,
            });
        }
        return { ok: true, active: false, delayMin: 0 };
    }
    if (req.action === 'bump') {
        if (!prev || prev.endsAt <= nowSec)
            return { ok: true, active: false, delayMin: 0 };
        const delayMin = (0, estadio_1.bumpedDelay)(prev.delayMin);
        await ref.update({ delayMin, updatedAt: nowSec });
        if (req.confirm) {
            await confirmPush(token, matchId, match, 'estadioBump', {
                title: `Modo Estadio: ahora ${delayMin} minutos`,
                body: delayMin > prev.delayMin
                    ? `${vs(match)}tus próximos avisos llegan ${delayMin} minutos después.`
                    : `${vs(match)}ya está en el retraso máximo.`,
            });
        }
        return { ok: true, active: true, delayMin, endsAt: prev.endsAt };
    }
    const teamIds = match ? [String(match.homeTeam.id), String(match.awayTeam.id)] : null;
    const wants = {
        classes: cleanList(req.classes, estadio_1.ESTADIO_CLASSES),
        rivalTeamIds: cleanIds(req.rivalTeamIds, 2).filter(id => !teamIds || teamIds.includes(id)),
        rivalEvents: cleanList(req.rivalEvents, estadio_1.ESTADIO_RIVAL_EVENTS),
        playerIds: cleanIds(req.playerIds, MAX_PLAYERS),
    };
    // The device now follows a team of the match, or flipped a notification
    // toggle: the session must deliver what the topics would. Delay and start
    // stay as they are.
    if (req.action === 'refresh') {
        if (!prev || prev.endsAt <= nowSec)
            return { ok: true, active: false, delayMin: 0 };
        await ref.update({ ...wants, updatedAt: nowSec });
        return { ok: true, active: true, delayMin: prev.delayMin, endsAt: prev.endsAt };
    }
    // start (or change the delay of a running session)
    const delayMin = Number(req.delayMin);
    if (!estadio_1.ESTADIO_DELAYS.includes(delayMin))
        throw new https_1.HttpsError('invalid-argument', 'delayMin');
    if (!match)
        throw new https_1.HttpsError('not-found', 'match');
    if ((0, mapping_1.isFinishedShort)(match.statusShort))
        throw new https_1.HttpsError('failed-precondition', 'match-finished');
    const session = {
        matchId, token, delayMin,
        ...wants,
        platform: req.platform === 'ios' || req.platform === 'android' ? req.platform : 'unknown',
        uid,
        startedAt: prev && prev.endsAt > nowSec ? prev.startedAt : nowSec,
        endsAt: Math.max(Number(match.timestamp) || 0, nowSec) + MAX_AFTER_KICKOFF_SEC,
        updatedAt: nowSec,
    };
    // Mute first, session second: between the two the device could only miss a
    // push, never get a spoiler. If the session can't be stored, undo the mute —
    // a muted device without a session would hear nothing at all.
    await holdDevices([token], matchId);
    if (session.startedAt === nowSec)
        session.startedAt = Math.floor(Date.now() / 1000);
    try {
        await ref.set(session);
    }
    catch (err) {
        await releaseDevices([token], matchId).catch(() => { });
        throw err;
    }
    if (req.confirm) {
        await confirmPush(token, matchId, match, 'estadioOn', {
            title: 'Modo Estadio activado',
            body: `${vs(match)}tus avisos llegan ${delayMin} minutos después. Se apaga solo al final.`,
        });
    }
    return { ok: true, active: true, delayMin, endsAt: session.endsAt };
}
//# sourceMappingURL=estadio.js.map