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
 *  - Modo Rival: immediate, single team topic.
 *  - "Silenciar este partido": every condition carries
 *    `&& !('fb_mute_{matchId}' in topics)` so muted devices are excluded in FCM
 *    (real silence with the app closed). Followed-player pushes omit it on
 *    purpose — following a player is a stronger opt-in, and their condition
 *    already uses FCM's 5-topic limit.
 *  - Followed players: goals (never own goals) and red cards, immediate, to
 *    devices that follow the player but NOT that player's team (those already
 *    get the team push, which names the scorer).
 *  - iOS category MATCH_EVENT → long-press action "Silenciar este partido".
 *  - dedupId includes the minute so two different same-type events at the same
 *    score don't replace each other in the notification center.
 *
 * LEGACY DUAL-SEND (transition window): users still on a Sportmonks-era build
 * are subscribed to `team_{sportmonksId}_*` topics. Immediate pushes are also
 * sent to the legacy topic of every team we can map back (legacy.ts). The
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
exports.loc = void 0;
exports.displayLeague = displayLeague;
exports.buildCopy = buildCopy;
exports.route = route;
exports.legacyTopicFor = legacyTopicFor;
exports.conditionFor = conditionFor;
exports.sendFcm = sendFcm;
exports.dispatchPlayerLineups = dispatchPlayerLineups;
exports.immediateCondition = immediateCondition;
exports.dispatchFootballChanges = dispatchFootballChanges;
const functions_1 = require("firebase-admin/functions");
const logger = __importStar(require("firebase-functions/logger"));
const admin_init_1 = require("../admin-init");
const model_1 = require("../shared/football/model");
const legacy_1 = require("../shared/football/legacy");
const ESTADIO_DELAY_ENABLED = process.env.ESTADIO_DELAY_ENABLED !== 'false';
const LEGACY_DUAL_SEND = process.env.FB_LEGACY_DUAL_SEND !== 'false';
// ── Spanish names for national teams (clubs pass through unchanged) ─────────
const TEAMS_ES = {
    'Afghanistan': 'Afganistán', 'Algeria': 'Argelia', 'Armenia': 'Armenia',
    'Azerbaijan': 'Azerbaiyán', 'Bahrain': 'Baréin', 'Belgium': 'Bélgica',
    'Bosnia & Herzegovina': 'Bosnia y Herzegovina', 'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
    'Brazil': 'Brasil', 'Cameroon': 'Camerún', 'Canada': 'Canadá', 'Cape Verde Islands': 'Cabo Verde',
    'China': 'China', 'Congo DR': 'Congo RD', 'Croatia': 'Croacia', 'Curacao': 'Curazao', 'Curaçao': 'Curazao',
    'Czech Republic': 'República Checa', 'Czechia': 'República Checa', 'Denmark': 'Dinamarca',
    'Egypt': 'Egipto', 'England': 'Inglaterra', 'Finland': 'Finlandia', 'France': 'Francia',
    'Germany': 'Alemania', 'Greece': 'Grecia', 'Hungary': 'Hungría', 'Iran': 'Irán', 'Iraq': 'Irak',
    'Ireland': 'Irlanda', 'Rep. Of Ireland': 'Irlanda', 'Italy': 'Italia', 'Ivory Coast': 'Costa de Marfil',
    'Japan': 'Japón', 'Jordan': 'Jordania', 'Kenya': 'Kenia', 'North Korea': 'Corea del Norte',
    'South Korea': 'Corea del Sur', 'Mali': 'Malí', 'Mexico': 'México', 'Morocco': 'Marruecos',
    'Netherlands': 'Países Bajos', 'New Zealand': 'Nueva Zelanda', 'Norway': 'Noruega', 'Oman': 'Omán',
    'Panama': 'Panamá', 'Peru': 'Perú', 'Poland': 'Polonia', 'Qatar': 'Catar', 'Romania': 'Rumanía',
    'Russia': 'Rusia', 'Saudi Arabia': 'Arabia Saudita', 'Scotland': 'Escocia', 'Slovakia': 'Eslovaquia',
    'Slovenia': 'Eslovenia', 'South Africa': 'Sudáfrica', 'Spain': 'España', 'Sweden': 'Suecia',
    'Switzerland': 'Suiza', 'Thailand': 'Tailandia', 'Tunisia': 'Túnez', 'Turkey': 'Turquía',
    'Türkiye': 'Turquía', 'Ukraine': 'Ucrania', 'United Arab Emirates': 'Emiratos Árabes',
    'USA': 'Estados Unidos', 'United States': 'Estados Unidos', 'Wales': 'Gales', 'Zimbabwe': 'Zimbabue',
    'Northern Ireland': 'Irlanda del Norte', 'Haiti': 'Haití', 'Uzbekistan': 'Uzbekistán',
};
const loc = (name) => TEAMS_ES[name] ?? name;
exports.loc = loc;
/** Friendlies are one match in a push → singular "Amistoso". */
function displayLeague(name) {
    if (!name)
        return '';
    return /friendl|amistoso/i.test(name) ? 'Amistoso' : name;
}
const H = (c) => (0, exports.loc)(c.homeTeam.name);
const A = (c) => (0, exports.loc)(c.awayTeam.name);
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
        // Corrections only reach _d0: delayed buckets never saw the event (the
        // VAR guard in deliverDelayedPush drops their copy).
        case 'goalCancelled': return { bucketed: { topic: model_1.FbTopics.goals, teams: [h, a], delayed: false } };
        case 'redCardCancelled': return { bucketed: { topic: model_1.FbTopics.cards, teams: [h, a], delayed: false } };
        case 'halftime':
        case 'secondHalfStart':
        case 'matchEnd':
        case 'extraTimeStart':
        case 'penaltiesStart':
        case 'matchSuspended': return { bucketed: { topic: model_1.FbTopics.live, teams: [h, a], delayed: true } };
        // A sending-off changes the match for both sides: followers of either team
        // get it (owner's rule since 25-nov-2026; it used to reach only the
        // followers of the player's team).
        case 'redCard': return { bucketed: { topic: model_1.FbTopics.cards, teams: [h, a], delayed: true } };
        case 'yellowCard': return { bucketed: { topic: model_1.FbTopics.cards, teams: [s], delayed: true } };
        case 'substitution': return { bucketed: { topic: model_1.FbTopics.live, teams: [s], delayed: true } };
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
/** Legacy (Sportmonks-era) topic for a new-format team topic, or null when unmappable. */
function legacyTopicFor(fbTopic) {
    const m = /^fb_team_(\d+)_(.+)$/.exec(fbTopic);
    if (!m)
        return null;
    const smId = (0, legacy_1.legacyTeamIdFor)(m[1]);
    return smId ? `team_${smId}_${m[2]}` : null;
}
// ── FCM helpers ──────────────────────────────────────────────────────────────
/** `(a || b) && !mute` — FCM allows at most 5 topics per condition. */
function conditionFor(topics, muteMatchId) {
    const any = topics.map(t => `'${t}' in topics`).join(' || ');
    const grouped = topics.length > 1 ? `(${any})` : any;
    return muteMatchId ? `${grouped} && !('${model_1.FbTopics.mute(muteMatchId)}' in topics)` : grouped;
}
async function sendFcm(target, copy, data, dedupId) {
    try {
        await admin_init_1.admin.messaging().send({
            ...target,
            notification: { title: copy.title, body: copy.body },
            data,
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
function playerPush(c) {
    if (!c.playerId || !c.side)
        return null;
    const isGoal = c.type === 'goal' && c.goalKind !== 'own';
    const isRed = c.type === 'redCard';
    if (!isGoal && !isRed)
        return null;
    const teamId = c.side === 'home' ? c.homeTeam.id : c.awayTeam.id;
    const pid = String(c.playerId);
    const playerTopic = isGoal ? model_1.FbTopics.playerGoals(pid) : model_1.FbTopics.playerCards(pid);
    const teamTopic = isGoal ? model_1.FbTopics.goals : model_1.FbTopics.cards;
    // player AND NOT any of the 4 team buckets = exactly FCM's 5-topic limit.
    const condition = `'${playerTopic}' in topics` +
        ['d0', 'd2', 'd5', 'd10'].map(b => ` && !('${teamTopic(teamId, b)}' in topics)`).join('');
    const name = isGoal ? c.scorerName : c.playerName;
    const title = isGoal
        ? (c.goalKind === 'penalty' ? `⚽ ¡Gol de penal de ${name ?? 'tu jugador'}!` : `⚽ ¡Gol de ${name ?? 'tu jugador'}!`)
        : `🟥 Expulsado: ${name ?? 'tu jugador'}`;
    const body = `${scoreLine(c)}${c.minute != null ? ` · ${c.minute}'` : ''}`;
    return sendFcm({ condition }, { title, body }, { ...payloadFor(c), type: isGoal ? 'playerGoal' : 'playerRedCard', playerId: pid }, `${dedupFor(c)}_p${pid}`.slice(0, 64));
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
        return sendFcm({ condition: `'${model_1.FbTopics.playerLineups(pid)}' in topics && !('${model_1.FbTopics.lineups(s.teamId)}' in topics)` }, { title: `📋 ${s.name} es titular`, body: `${(0, exports.loc)(own.name)} vs ${(0, exports.loc)(rival.name)} · ${displayLeague(match.league)}` }, { sport: 'football', v: '2', type: 'playerLineup', matchId: match.matchId, playerId: pid }, `fb${match.matchId}_lineup_p${pid}`.slice(0, 64));
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
async function dispatchFootballChanges(changes) {
    if (!changes.length)
        return;
    const sends = [];
    const queue = ESTADIO_DELAY_ENABLED ? (0, functions_1.getFunctions)().taskQueue('deliverDelayedPush') : null;
    for (const c of changes) {
        const copy = buildCopy(c);
        const data = payloadFor(c);
        const dedupId = dedupFor(c);
        const r = route(c);
        // Immediate (d0 / plain) topics.
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
        // Modo Estadio delayed buckets.
        if (queue && r.bucketed?.delayed) {
            for (const delayMin of [2, 5, 10]) {
                const bucket = `d${delayMin}`;
                const topics = [...new Set(r.bucketed.teams.map(t => r.bucketed.topic(t, bucket)))];
                const payload = {
                    condition: conditionFor(topics, c.matchId),
                    title: copy.title, body: copy.body, data, dedupId,
                    changeType: c.type, matchId: c.matchId,
                    homeScore: c.homeScore, awayScore: c.awayScore,
                    matchCollection: 'fb_matches',
                    ...(c.type === 'redCard' ? { homeRedCards: c.homeRedCards, awayRedCards: c.awayRedCards } : {}),
                };
                const taskId = `fb_${dedupId}_${r.bucketed.teams.join('_')}_d${delayMin}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 499);
                queue.enqueue(payload, { scheduleDelaySeconds: delayMin * 60, id: taskId }).catch((err) => {
                    const msg = String(err);
                    if (!/already ?exists/i.test(msg))
                        logger.warn(`Cloud Task enqueue failed: ${taskId}`, { err: msg });
                });
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
    await Promise.allSettled(sends);
}
//# sourceMappingURL=notify.js.map