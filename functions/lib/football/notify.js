"use strict";
/**
 * football/notify.ts
 *
 * Push delivery for football changes detected by live-detect.ts. Ports the
 * Sportmonks-era dispatch rules (feature/live-activities branch) 1:1 onto the
 * `fb_` topic namespace (see FbTopics in shared/football/model.ts):
 *
 *  - Modo Estadio: retrasable events go to <base>_d0 now and to _d2/_d5/_d10
 *    through the `deliverDelayedPush` task queue (VAR guard for goals AND reds).
 *    Every task is awaited and retried: the snapshot latch is already saved
 *    when we dispatch, so a lost enqueue would be a push lost for good.
 *    A correction (disallowed goal, revoked red) follows a delayed bucket only
 *    when that bucket had already received the event it corrects.
 *  - Modo Rival: immediate, single team topic.
 *  - "Silenciar este partido": every condition carries
 *    `&& !('fb_mute_{matchId}' in topics)` so muted devices are excluded in FCM
 *    (real silence with the app closed). Followed-player pushes omit it on
 *    purpose — following a player is a stronger opt-in, and their condition
 *    already uses FCM's 5-topic limit.
 *  - Followed players: goals (never own goals) and red cards, immediate, to
 *    devices that follow the player but NOT that player's team (those already
 *    get the team push, which names the scorer).
 *  - Modo Estadio per match (estadio.ts): a device with a session on a match
 *    holds its mute topic, so none of the sends here reach it; the session
 *    delivers them by token, late. Player pushes skip `mute`, so they exclude
 *    the session's own `fb_hold_{matchId}` topic instead.
 *  - iOS category MATCH_EVENT → long-press action "Silenciar este partido".
 *  - dedupId includes the minute so two different same-type events at the same
 *    score don't replace each other in the notification center.
 *
 * LEGACY DUAL-SEND (transition window): users still on a Sportmonks-era build
 * are subscribed to `team_{sportmonksId}_*` topics. Immediate pushes are also
 * sent to the legacy topic of every team we can map back (legacy.ts), and the
 * delayed copies to its `_d2/_d5/_d10` twins — an old build with Modo Estadio
 * on is subscribed only to those, and would otherwise hear nothing live. The
 * payload omits `matchId` so tapping opens the app (and its update prompt)
 * instead of a match screen the old build can no longer load. Disable with
 * FB_LEGACY_DUAL_SEND=false once adoption of the new build is high.
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
exports.DELAY_MINUTES = exports.loc = void 0;
exports.displayLeague = displayLeague;
exports.buildCopy = buildCopy;
exports.route = route;
exports.routeWithFamily = routeWithFamily;
exports.legacyTopicFor = legacyTopicFor;
exports.delayedBucketsFor = delayedBucketsFor;
exports.enqueueDelayed = enqueueDelayed;
exports.taskIdFor = taskIdFor;
exports.conditionFor = conditionFor;
exports.analyticsLabel = analyticsLabel;
exports.sendFcm = sendFcm;
exports.payloadFor = payloadFor;
exports.dedupFor = dedupFor;
exports.playerPushFor = playerPushFor;
exports.dispatchPlayerLineups = dispatchPlayerLineups;
exports.immediateCondition = immediateCondition;
exports.dispatchFootballChanges = dispatchFootballChanges;
const functions_1 = require("firebase-admin/functions");
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("../admin-init");
const model_1 = require("../shared/football/model");
const legacy_1 = require("../shared/football/legacy");
const names_1 = require("./names");
Object.defineProperty(exports, "loc", { enumerable: true, get: function () { return names_1.loc; } });
const team_family_1 = require("./team-family");
const estadio_1 = require("./estadio");
const ESTADIO_DELAY_ENABLED = process.env.ESTADIO_DELAY_ENABLED !== 'false';
const LEGACY_DUAL_SEND = process.env.FB_LEGACY_DUAL_SEND !== 'false';
/** Friendlies are one match in a push → singular "Amistoso". */
function displayLeague(name) {
    if (!name)
        return '';
    return /friendl|amistoso/i.test(name) ? 'Amistoso' : name;
}
const H = (c) => (0, names_1.teamLabel)(c.homeTeam);
const A = (c) => (0, names_1.teamLabel)(c.awayTeam);
const L = (c) => displayLeague(c.league);
const scoreLine = (c) => `${H(c)} ${c.homeScore}-${c.awayScore} ${A(c)}`;
const sideName = (c) => (c.side === 'home' ? H(c) : A(c));
const min = (c) => (c.minute != null ? `${c.minute}' ` : '');
function buildCopy(c) {
    switch (c.type) {
        case 'goal': {
            const h = c.side === 'home' ? `[${c.homeScore}]` : `${c.homeScore}`;
            const a = c.side === 'away' ? `[${c.awayScore}]` : `${c.awayScore}`;
            const scorer = c.scorerName ? `${c.scorerName} · ` : '';
            const title = c.goalKind === 'penalty' ? `⚽ ¡Gol de penal de ${sideName(c)}!` :
                c.goalKind === 'own' ? `⚽ Autogol de ${c.side === 'home' ? A(c) : H(c)}` :
                    `⚽ ¡GOL de ${sideName(c)}!`;
            return { title, body: `${min(c)}${scorer}${H(c)} ${h}-${a} ${A(c)}`.trim() };
        }
        case 'goalCancelled':
            // "El VAR anula" only when a VAR review backs it; otherwise neutral copy
            // (clear offside on the pitch, data correction). Never claim more than we know.
            return {
                title: c.varConfirmed ? `🚫 El VAR anula gol de ${sideName(c)}` : `🚫 Gol anulado de ${sideName(c)}`,
                body: `${min(c)}${scoreLine(c)}`.trim(),
            };
        case 'matchStart':
            return { title: '⚽ ¡Empieza el partido!', body: `${H(c)} vs ${A(c)} · ${L(c)}` };
        case 'kickoffDelayed':
            return c.delay === 'postponed'
                ? { title: '⏰ Partido aplazado', body: `${H(c)} vs ${A(c)} · ${L(c)} · se jugará en otra fecha` }
                : { title: '⏰ Partido retrasado', body: `${H(c)} vs ${A(c)} · ${L(c)} · ${c.delay ? `+${c.delay}` : 'el inicio se retrasó'}` };
        case 'halftime':
            return { title: '⏱️ Medio tiempo · Marcador:', body: scoreLine(c) };
        case 'secondHalfStart':
            return { title: '¡Arranca el segundo tiempo!', body: `${scoreLine(c)} · ${L(c)}` };
        case 'matchEnd': {
            const pen = c.homePenScore != null && c.awayPenScore != null ? ` (pen. ${c.homePenScore}-${c.awayPenScore})` : '';
            return { title: '🏁 Final del partido', body: `${H(c)} ${c.homeScore}-${c.awayScore}${pen} ${A(c)} · ${L(c)}` };
        }
        case 'redCard':
            return { title: '🟥 TARJETA ROJA', body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}(${sideName(c)}) · ${scoreLine(c)}`.trim() };
        case 'redCardCancelled':
            return { title: `🟥↩️ Se anula la expulsión de ${sideName(c)}`, body: `${min(c)}${scoreLine(c)}`.trim() };
        case 'yellowCard':
            return { title: '🟨 Tarjeta amarilla', body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}(${sideName(c)}) · ${scoreLine(c)}`.trim() };
        case 'substitution': {
            // Off first, then on — the way a commentator reads it.
            const out = c.playerName ? `↓ ${c.playerName}` : '';
            const inn = c.relatedPlayerName ? ` ↑ ${c.relatedPlayerName}` : '';
            return { title: `🔄 Cambio · ${sideName(c)}`, body: `${min(c)}${out}${inn}`.trim() || scoreLine(c) };
        }
        case 'extraTimeStart':
            return { title: '⏱️ ¡Prórroga!', body: `${scoreLine(c)} · ${L(c)}` };
        case 'penaltiesStart':
            return { title: '🥅 ¡Tanda de penaltis!', body: `${scoreLine(c)} · ${L(c)}` };
        case 'matchSuspended':
            return { title: '⚠️ Partido suspendido', body: scoreLine(c) };
        case 'matchReminder':
            return { title: '⏰ ¡El partido comienza pronto!', body: `${H(c)} vs ${A(c)} · ${L(c)} · en ~15 min` };
        case 'lineups':
            return { title: '📋 Alineaciones confirmadas', body: `${H(c)} vs ${A(c)} · ${L(c)}` };
        case 'rivalLoss':
            return { title: `😈 ${sideName(c)} perdió`, body: `${scoreLine(c)} · a disfrutar 🍿` };
        case 'rivalBigLoss':
            return { title: `😈 ¡Goleada al ${sideName(c)}!`, body: `${scoreLine(c)} · ¡vaya paliza! 🤭` };
        case 'rivalRedCard':
            return { title: `🟥😈 Roja al ${sideName(c)}`, body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}expulsado · se quedan con 10`.trim() };
        case 'rivalPenMiss':
            return { title: `😈 ${sideName(c)} falló un penal`, body: `${min(c)}${c.playerName ? c.playerName + ' ' : ''}la mandó a volar 🚀`.trim() };
        default:
            return { title: 'Analistas', body: 'Nueva actualización del partido' };
    }
}
function route(c) {
    const h = c.homeTeam.id;
    const a = c.awayTeam.id;
    const s = c.side === 'home' ? h : a;
    switch (c.type) {
        case 'goal': return { bucketed: { topic: model_1.FbTopics.goals, teams: [h, a], delayed: true } };
        // Corrections always reach _d0. A delayed bucket gets one only if it had
        // already been told about the event; otherwise the VAR guard in
        // deliverDelayedPush drops its copy and there is nothing to take back.
        case 'goalCancelled': return { bucketed: { topic: model_1.FbTopics.goals, teams: [h, a], delayed: false, correction: true } };
        case 'redCardCancelled': return { bucketed: { topic: model_1.FbTopics.cards, teams: [h, a], delayed: false, correction: true } };
        case 'halftime':
        case 'secondHalfStart':
        case 'matchEnd':
        case 'extraTimeStart':
        case 'penaltiesStart':
        case 'matchSuspended': return { bucketed: { topic: model_1.FbTopics.live, teams: [h, a], delayed: true } };
        // Owner's rule (25-nov-2026): following a team means hearing about the
        // whole match — every event goes to the followers of BOTH sides, and each
        // kind has the topic of its own toggle ("Notificaciones de este partido").
        // Before, cards and substitutions only reached the player's team, and
        // yellow cards / substitutions rode on the red-card / match-phase topics.
        case 'redCard': return { bucketed: { topic: model_1.FbTopics.cards, teams: [h, a], delayed: true } };
        case 'yellowCard': return { bucketed: { topic: model_1.FbTopics.yellow, teams: [h, a], delayed: true } };
        case 'substitution': return { bucketed: { topic: model_1.FbTopics.subs, teams: [h, a], delayed: true } };
        case 'matchStart':
        case 'kickoffDelayed': return { immediate: { topic: model_1.FbTopics.kickoff, teams: [h, a] } };
        case 'matchReminder': return { immediate: { topic: model_1.FbTopics.reminders, teams: [h, a] } };
        case 'lineups': return { immediate: { topic: model_1.FbTopics.lineups, teams: [h, a] } };
        case 'rivalLoss': return { immediate: { topic: model_1.FbTopics.rivalLoss, teams: [s] } };
        case 'rivalBigLoss': return { immediate: { topic: model_1.FbTopics.rivalBigLoss, teams: [s] } };
        case 'rivalRedCard': return { immediate: { topic: model_1.FbTopics.rivalRedCard, teams: [s] } };
        case 'rivalPenMiss': return { immediate: { topic: model_1.FbTopics.rivalPenMiss, teams: [s] } };
        default: return {};
    }
}
/**
 * `route` plus the senior national team of each youth side in it (`senior`:
 * youth team id → senior team id), so whoever follows Mexico also hears about
 * Mexico U17. "Rival" news stays with the team that was marked as a rival.
 */
function routeWithFamily(c, senior) {
    const r = route(c);
    if (c.type.startsWith('rival'))
        return r;
    const widen = (teams) => [...new Set(teams.flatMap(t => (senior[t] ? [t, senior[t]] : [t])))];
    return {
        ...(r.bucketed ? { bucketed: { ...r.bucketed, teams: widen(r.bucketed.teams) } } : {}),
        ...(r.immediate ? { immediate: { ...r.immediate, teams: widen(r.immediate.teams) } } : {}),
    };
}
/** Legacy (Sportmonks-era) topic for a new-format team topic, or null when unmappable. */
function legacyTopicFor(fbTopic) {
    const m = /^fb_team_(\d+)_(.+)$/.exec(fbTopic);
    if (!m)
        return null;
    // Topics that didn't exist in the previous taxonomy have no legacy twin.
    if (/^(yellow|subs)_/.test(m[2]))
        return null;
    const smId = (0, legacy_1.legacyTeamIdFor)(m[1]);
    return smId ? `team_${smId}_${m[2]}` : null;
}
// ── Modo Estadio: delayed buckets ────────────────────────────────────────────
exports.DELAY_MINUTES = [2, 5, 10];
/**
 * Slack when deciding whether a bucket had already been told about an event
 * that is now being corrected. The delayed copy fires N minutes after its
 * enqueue, a few seconds off our poll clock either way. Erring towards sending:
 * a "gol anulado" for a goal that bucket never got is odd, a goal that is never
 * taken back is wrong.
 */
const CORRECTION_MARGIN_SEC = 15;
/**
 * Delay buckets a change goes to, besides the immediate one.
 *
 *  - retrasable events: all of them;
 *  - corrections: the buckets whose copy of the corrected event had already
 *    gone out when the feed took it back (`revokedAt - eventAt` ≥ the bucket's
 *    delay). The others never showed it — the VAR guard dropped their copy.
 *    When we don't know when the event was announced, every bucket is corrected.
 */
function delayedBucketsFor(c, r = route(c)) {
    if (!r.bucketed)
        return [];
    if (r.bucketed.delayed)
        return [...exports.DELAY_MINUTES];
    if (!r.bucketed.correction)
        return [];
    if (c.eventAt == null)
        return [...exports.DELAY_MINUTES];
    const shownFor = (c.revokedAt ?? Math.floor(Date.now() / 1000)) - c.eventAt;
    return exports.DELAY_MINUTES.filter(m => shownFor >= m * 60 - CORRECTION_MARGIN_SEC);
}
const ENQUEUE_RETRY_WAITS_MS = [300, 1200];
/**
 * Enqueue one delayed push, waiting for Cloud Tasks to accept it. Retries
 * transient failures; "already exists" means an earlier attempt got through.
 * Never throws — a task that still can't be queued is logged as an error.
 */
async function enqueueDelayed(queue, payload, opts, waitsMs = ENQUEUE_RETRY_WAITS_MS) {
    for (let attempt = 0;; attempt++) {
        try {
            await queue.enqueue(payload, opts);
            return true;
        }
        catch (err) {
            const msg = `${err.code ?? ''} ${String(err)}`;
            if (/already[\s_-]?exists/i.test(msg))
                return true;
            if (attempt >= waitsMs.length) {
                logger.error(`Modo Estadio: delayed push lost, Cloud Tasks refused it ${attempt + 1} times: ${opts.id}`, {
                    err: msg, matchId: payload.matchId, changeType: payload.changeType,
                });
                return false;
            }
            await new Promise(r => setTimeout(r, waitsMs[attempt]));
        }
    }
}
function taskIdFor(raw) {
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 499);
}
// ── FCM helpers ──────────────────────────────────────────────────────────────
/** `(a || b) && !mute` — FCM allows at most 5 topics per condition. */
function conditionFor(topics, muteMatchId) {
    const any = topics.map(t => `'${t}' in topics`).join(' || ');
    const grouped = topics.length > 1 ? `(${any})` : any;
    return muteMatchId ? `${grouped} && !('${model_1.FbTopics.mute(muteMatchId)}' in topics)` : grouped;
}
/**
 * Label for Firebase's message reports: the kind of notification, with
 * "legacy-" for the copies sent to builds from before the provider change.
 * Firebase accepts [a-zA-Z0-9-_.~%], 50 characters, 100 distinct labels a day.
 */
function analyticsLabel(data) {
    const kind = (data.type || 'other').replace(/[^a-zA-Z0-9_.~%-]/g, '').slice(0, 40) || 'other';
    return data.legacy === '1' ? `legacy-${kind}` : kind;
}
async function sendFcm(target, copy, data, dedupId) {
    try {
        await admin_init_1.admin.messaging().send({
            ...target,
            notification: { title: copy.title, body: copy.body },
            data,
            // Firebase console → Messaging → Reports can then split sends and opens
            // by kind of notification ("goal", "halftime", "legacy-goal"…).
            fcmOptions: { analyticsLabel: analyticsLabel(data) },
            android: {
                priority: 'high',
                collapseKey: dedupId,
                notification: { channelId: 'analistas-live', sound: 'default', tag: dedupId },
            },
            apns: {
                headers: { 'apns-collapse-id': dedupId },
                // MATCH_EVENT → iOS long-press action "Silenciar este partido".
                payload: { aps: { sound: 'default', badge: 0, category: 'MATCH_EVENT' } },
            },
        });
    }
    catch (err) {
        const code = err.code;
        if (code !== 'messaging/invalid-argument' && code !== 'messaging/registration-token-not-registered') {
            logger.warn('FCM send failed', { target, code, err: String(err) });
        }
    }
}
function payloadFor(c) {
    const d = {
        sport: 'football',
        v: '2',
        type: c.type,
        matchId: c.matchId,
        homeTeam: c.homeTeam.name,
        awayTeam: c.awayTeam.name,
        homeTeamId: c.homeTeam.id,
        awayTeamId: c.awayTeam.id,
        homeScore: String(c.homeScore),
        awayScore: String(c.awayScore),
        leagueId: c.leagueId,
    };
    if (c.side)
        d.scoringTeamSide = c.side;
    if (c.goalKind)
        d.goalKind = c.goalKind;
    if (c.scorerName)
        d.scorerName = c.scorerName;
    if (c.playerName)
        d.playerName = c.playerName;
    if (c.minute != null)
        d.minute = String(c.minute);
    return d;
}
function legacyPayloadFor(c) {
    // No matchId: old builds would try to open a match they can't load.
    const { matchId: _m, sport: _s, v: _v, homeTeamId: _h, awayTeamId: _a, ...rest } = payloadFor(c);
    return { ...rest, legacy: '1' };
}
function dedupFor(c) {
    return `fb${c.matchId}_${c.type}_${c.homeScore}-${c.awayScore}_m${c.minute ?? ''}`.slice(0, 64);
}
// ── Followed players ─────────────────────────────────────────────────────────
/**
 * The push about a followed player (goal — never an own goal — or red card),
 * or null when the change isn't one. Shared by the topic send below and by
 * the per-match Modo Estadio sessions (estadio.ts).
 */
function playerPushFor(c) {
    if (!c.playerId || !c.side)
        return null;
    const isGoal = c.type === 'goal' && c.goalKind !== 'own';
    const isRed = c.type === 'redCard';
    if (!isGoal && !isRed)
        return null;
    const pid = String(c.playerId);
    const name = isGoal ? c.scorerName : c.playerName;
    const title = isGoal
        ? (c.goalKind === 'penalty' ? `⚽ ¡Gol de penal de ${name ?? 'tu jugador'}!` : `⚽ ¡Gol de ${name ?? 'tu jugador'}!`)
        : `🟥 Expulsado: ${name ?? 'tu jugador'}`;
    const body = `${scoreLine(c)}${c.minute != null ? ` · ${c.minute}'` : ''}`;
    return {
        playerId: pid, kind: isGoal ? 'goal' : 'red', copy: { title, body },
        data: { ...payloadFor(c), type: isGoal ? 'playerGoal' : 'playerRedCard', playerId: pid },
        dedupId: `${dedupFor(c)}_p${pid}`.slice(0, 64),
    };
}
function playerPush(c) {
    const p = playerPushFor(c);
    if (!p || !c.side)
        return null;
    const teamId = c.side === 'home' ? c.homeTeam.id : c.awayTeam.id;
    const playerTopic = p.kind === 'goal' ? model_1.FbTopics.playerGoals(p.playerId) : model_1.FbTopics.playerCards(p.playerId);
    const teamTopic = p.kind === 'goal' ? model_1.FbTopics.goals : model_1.FbTopics.cards;
    // FCM allows five topics per condition: the player, the per-match Modo
    // Estadio guard (the session delivers this push late, by token) and three of
    // the team's delay buckets. The 10-minute bucket of the old global mode is
    // the one left out: such a device may see the player push and the team one.
    const condition = `'${playerTopic}' in topics` +
        ['d0', 'd2', 'd5'].map(b => ` && !('${teamTopic(teamId, b)}' in topics)`).join('') +
        ` && !('${model_1.FbTopics.hold(c.matchId)}' in topics)`;
    return sendFcm({ condition }, p.copy, p.data, p.dedupId);
}
/**
 * Starting XI confirmed → one push per starter to devices following that
 * player but not their team (team followers got the "Alineaciones" push).
 */
async function dispatchPlayerLineups(match, starters) {
    await Promise.allSettled(starters.map(s => {
        const own = s.teamId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
        const rival = s.teamId === match.homeTeam.id ? match.awayTeam : match.homeTeam;
        const pid = String(s.playerId);
        return sendFcm({ condition: `'${model_1.FbTopics.playerLineups(pid)}' in topics && !('${model_1.FbTopics.lineups(s.teamId)}' in topics)` }, { title: `📋 ${s.name} es titular`, body: `${(0, names_1.teamLabel)(own)} vs ${(0, names_1.teamLabel)(rival)} · ${displayLeague(match.league)}` }, { sport: 'football', v: '2', type: 'playerLineup', matchId: match.matchId, playerId: pid }, `fb${match.matchId}_lineup_p${pid}`.slice(0, 64));
    }));
}
/**
 * FCM condition of the immediate push of a change.
 *
 * Modo Rival's red card ("your rival is a man down") is skipped for devices
 * that follow the OTHER team of the match with cards on: they already get the
 * regular red-card push for this same sending-off. FCM allows five topics per
 * condition: the rival topic, the mute guard and three of the other team's
 * delay buckets (10-minute Modo Estadio users may still see both).
 */
function immediateCondition(c, topics) {
    if (c.type !== 'rivalRedCard' || !c.side || topics.length !== 1)
        return conditionFor(topics, c.matchId);
    const other = c.side === 'home' ? c.awayTeam.id : c.homeTeam.id;
    const exclusions = ['d0', 'd2', 'd5']
        .map(b => ` && !('${model_1.FbTopics.cards(other, b)}' in topics)`).join('');
    return `'${topics[0]}' in topics${exclusions} && !('${model_1.FbTopics.mute(c.matchId)}' in topics)`;
}
// ── Dispatch ─────────────────────────────────────────────────────────────────
async function dispatchFootballChanges(changes, deps = {}) {
    if (!changes.length)
        return;
    const sends = [];
    const queue = deps.queue !== undefined
        ? deps.queue
        : (ESTADIO_DELAY_ENABLED ? (0, functions_1.getFunctions)().taskQueue('deliverDelayedPush') : null);
    // Followers of a senior national team also hear about its youth sides
    // (Mexico → Mexico U17…): each youth team brings its senior team's topics.
    // Only in national-team competitions (the provider files them under
    // "World"), so club academies ("Real Madrid U19") cost no lookups.
    const seen = new Map();
    for (const c of changes) {
        if (c.leagueCountry !== team_family_1.NATIONAL_TEAMS_COUNTRY)
            continue;
        seen.set(c.homeTeam.id, c.homeTeam);
        seen.set(c.awayTeam.id, c.awayTeam);
    }
    const senior = seen.size
        ? await (0, team_family_1.seniorTeamIds)([...seen.values()]).catch(() => ({}))
        : {};
    for (const c of changes) {
        const copy = buildCopy(c);
        const data = payloadFor(c);
        const dedupId = dedupFor(c);
        const r = routeWithFamily(c, senior);
        // Immediate (d0 / plain) topics. At most two teams and their two senior
        // sides: four topics plus the mute guard is exactly FCM's limit of five.
        const immediate = [...new Set(r.bucketed
                ? r.bucketed.teams.map(t => r.bucketed.topic(t, 'd0'))
                : (r.immediate?.teams.map(t => r.immediate.topic(t)) ?? []))];
        if (!immediate.length)
            continue;
        // One condition → a user following both teams gets exactly one push.
        sends.push(sendFcm({ condition: immediateCondition(c, immediate) }, copy, data, dedupId));
        // Followed player (goals, reds).
        const pp = playerPush(c);
        if (pp)
            sends.push(pp);
        // Modo Estadio delayed buckets. Awaited with the rest of the sends: a task
        // still in flight when the function returns may never reach Cloud Tasks.
        if (queue && r.bucketed) {
            for (const delayMin of delayedBucketsFor(c, r)) {
                const bucket = `d${delayMin}`;
                const topics = [...new Set(r.bucketed.teams.map(t => r.bucketed.topic(t, bucket)))];
                const guard = {
                    changeType: c.type, matchId: c.matchId,
                    homeScore: c.homeScore, awayScore: c.awayScore,
                    matchCollection: 'fb_matches',
                    ...(c.type === 'redCard' ? { homeRedCards: c.homeRedCards, awayRedCards: c.awayRedCards } : {}),
                };
                const opts = { scheduleDelaySeconds: delayMin * 60 };
                const baseId = `fb_${dedupId}_${r.bucketed.teams.join('_')}`;
                sends.push(enqueueDelayed(queue, { condition: conditionFor(topics, c.matchId), title: copy.title, body: copy.body, data, dedupId, ...guard }, { ...opts, id: taskIdFor(`${baseId}_d${delayMin}`) }));
                // Old builds with Modo Estadio on sit in `team_{oldId}_*_d{N}` only.
                // Their copy is a task of its own, so a retry never repeats the other.
                if (LEGACY_DUAL_SEND) {
                    const legacy = [...new Set(topics.map(legacyTopicFor).filter((t) => !!t))];
                    if (legacy.length) {
                        sends.push(enqueueDelayed(queue, { condition: conditionFor(legacy), title: copy.title, body: copy.body,
                            data: legacyPayloadFor(c), dedupId: `l${dedupId}`.slice(0, 64), ...guard }, { ...opts, id: taskIdFor(`fbl_${dedupId}_${r.bucketed.teams.join('_')}_d${delayMin}`) }));
                    }
                }
            }
        }
        // Legacy dual-send (immediate only; old builds' per-match mute ids are
        // Sportmonks ids we can't map, so no mute guard there).
        if (LEGACY_DUAL_SEND) {
            const legacy = [...new Set(immediate.map(legacyTopicFor).filter((t) => !!t))];
            if (legacy.length) {
                sends.push(sendFcm({ condition: conditionFor(legacy) }, copy, legacyPayloadFor(c), `l${dedupId}`.slice(0, 64)));
            }
        }
        logger.info(`📣 ${c.type} — ${copy.title} · ${copy.body}`, { matchId: c.matchId, topics: immediate });
    }
    // Devices with Modo Estadio on for one of these matches left its topics
    // (they hold the match's mute topic): the server delivers to them by token,
    // late. A failure there must never cost the pushes above.
    if (deps.sessions !== null) {
        sends.push((0, estadio_1.dispatchEstadioSessions)(changes, { queue, sessions: deps.sessions })
            .catch(err => logger.error('Modo Estadio: session dispatch failed', { err: String(err) })));
    }
    await Promise.allSettled(sends);
}
//# sourceMappingURL=notify.js.map