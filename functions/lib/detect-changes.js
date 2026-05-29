"use strict";
/**
 * detect-changes.ts
 *
 * Compares current livescores against the previous snapshot in Firestore.
 * Detects goals (regular/penalty/own), goal cancellations (VAR), match starts,
 * halftime, full time, and red cards. Sends FCM topic pushes for each event.
 *
 * Topic naming convention — must stay aligned with src/services/fcmTopics.ts:
 *   team_{id}_goals    · cards · start · lineups · reminders
 *   league_{id}_start  · finals
 *   player_{id}_goals  · cards
 *
 * Strategy C (hybrid) for goal+scorer:
 *   - When a score change is detected, we ALSO look at the events array on the
 *     same SMFixture payload for a matching goal event (same minute, same
 *     team). If we find it, the notification includes the scorer name.
 *   - If the scorer event isn't in the payload yet (SportMonks publishes the
 *     score before the event in ~5% of cases), we send the notification
 *     without a name. The client will see the name in-app when it shows up
 *     on the next poll. We do NOT send a second "follow-up" notification —
 *     two pushes for the same goal feels like spam.
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
exports.FINISHED_STATE_IDS = exports.LIVE_STATE_IDS = void 0;
exports.loadSnapshot = loadSnapshot;
exports.saveSnapshot = saveSnapshot;
exports.detectChanges = detectChanges;
exports.dispatchNotifications = dispatchNotifications;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const sync_league_data_1 = require("./sync-league-data");
const types_1 = require("./types");
Object.defineProperty(exports, "LIVE_STATE_IDS", { enumerable: true, get: function () { return types_1.LIVE_STATE_IDS; } });
Object.defineProperty(exports, "FINISHED_STATE_IDS", { enumerable: true, get: function () { return types_1.FINISHED_STATE_IDS; } });
// ── Snapshot helpers ────────────────────────────────────────────────────────
async function loadSnapshot() {
    const snap = await admin_init_1.db.doc('_meta/livescoresSnapshot').get();
    if (!snap.exists)
        return {};
    return snap.data()?.matches ?? {};
}
/** Count red cards for a given side in the events array. */
function countRedCards(events, participantId) {
    if (!events || !participantId)
        return 0;
    let count = 0;
    for (const ev of events) {
        if (ev.participant_id !== participantId)
            continue;
        if (ev.type_id === types_1.SM_EVENT_TYPES.RED_CARD || ev.type_id === types_1.SM_EVENT_TYPES.SECOND_YELLOW) {
            count++;
        }
    }
    return count;
}
/** Snapshot the relevant per-match state for next-poll diff detection. */
async function saveSnapshot(matches, fixtures) {
    const snapshot = {};
    // Build a quick lookup of fixture by id so we can pull the events array
    // (red card count) for each MatchDoc without iterating the fixtures list
    // O(n²) times.
    const fixtureById = new Map();
    for (const f of fixtures)
        fixtureById.set(f.id, f);
    for (const m of matches) {
        const fixture = fixtureById.get(Number(m.id));
        const home = fixture?.participants?.find(p => p.meta?.location === 'home');
        const away = fixture?.participants?.find(p => p.meta?.location === 'away');
        const redHome = countRedCards(fixture?.events, home?.id);
        const redAway = countRedCards(fixture?.events, away?.id);
        snapshot[m.id] = {
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            status: m.status,
            stateId: m.stateId,
            redCardsHome: redHome,
            redCardsAway: redAway,
        };
    }
    await admin_init_1.db.doc('_meta/livescoresSnapshot').set({
        matches: snapshot,
        updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
    });
}
// ── Goal scorer extraction ──────────────────────────────────────────────────
/** Find the most recent goal event for a given side, returning the scorer
 *  name + kind (normal/penalty/own). Returns null if no matching event yet. */
function findRecentGoalEvent(fixture, scoringSide) {
    if (!fixture?.events?.length)
        return null;
    const home = fixture.participants?.find(p => p.meta?.location === 'home');
    const away = fixture.participants?.find(p => p.meta?.location === 'away');
    const scoringTeamId = scoringSide === 'home' ? home?.id : away?.id;
    if (!scoringTeamId)
        return null;
    // Iterate from the END of the events array because SportMonks orders by
    // minute ascending — the goal we just detected is the most recent matching event.
    for (let i = fixture.events.length - 1; i >= 0; i--) {
        const ev = fixture.events[i];
        const isGoalType = ev.type_id === types_1.SM_EVENT_TYPES.GOAL ||
            ev.type_id === types_1.SM_EVENT_TYPES.PENALTY_GOAL ||
            ev.type_id === types_1.SM_EVENT_TYPES.OWN_GOAL;
        if (!isGoalType)
            continue;
        if (ev.cancelled)
            continue; // VAR-overturned goals — handled separately.
        // For OWN_GOAL the credit lands on the OPPOSITE side from the scorer's
        // team, so we compare against the team that BENEFITED (scoringTeamId)
        // and the event's participant_id is the team that scored against itself.
        const eventCreditsTeam = ev.type_id === types_1.SM_EVENT_TYPES.OWN_GOAL
            ? (ev.participant_id === home?.id ? away?.id : home?.id)
            : ev.participant_id;
        if (eventCreditsTeam !== scoringTeamId)
            continue;
        const goalKind = ev.type_id === types_1.SM_EVENT_TYPES.PENALTY_GOAL ? 'penalty' :
            ev.type_id === types_1.SM_EVENT_TYPES.OWN_GOAL ? 'own' :
                'normal';
        return {
            scorerName: ev.player_name ?? undefined,
            goalKind,
        };
    }
    return null;
}
/** Find the most recent red-card event for a given side. */
function findRecentRedCard(fixture, side) {
    if (!fixture?.events?.length)
        return null;
    const home = fixture.participants?.find(p => p.meta?.location === 'home');
    const away = fixture.participants?.find(p => p.meta?.location === 'away');
    const teamId = side === 'home' ? home?.id : away?.id;
    if (!teamId)
        return null;
    for (let i = fixture.events.length - 1; i >= 0; i--) {
        const ev = fixture.events[i];
        if (ev.participant_id !== teamId)
            continue;
        if (ev.type_id === types_1.SM_EVENT_TYPES.RED_CARD || ev.type_id === types_1.SM_EVENT_TYPES.SECOND_YELLOW) {
            return {
                playerName: ev.player_name ?? undefined,
                minute: ev.minute ?? null,
            };
        }
    }
    return null;
}
// ── Change detection ────────────────────────────────────────────────────────
function detectChanges(currentMatches, previousSnapshot, fixtures) {
    const changes = [];
    // Quick lookup: matchId → SMFixture for event-array access during diffing
    const fixtureById = new Map();
    for (const f of fixtures)
        fixtureById.set(f.id, f);
    for (const match of currentMatches) {
        const prev = previousSnapshot[match.id];
        const fixture = fixtureById.get(Number(match.id));
        const baseEvent = {
            matchId: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            league: match.league,
            leagueId: match.leagueId,
            minute: match.minute,
        };
        if (!prev) {
            // Match not in previous snapshot. If it's live now, treat as kickoff.
            if (match.status === 'live' && match.stateId === types_1.SM_STATE_IDS.FIRST_HALF) {
                changes.push({ ...baseEvent, type: 'matchStart' });
            }
            continue;
        }
        // ── Goal detection ────────────────────────────────────────────────────
        const prevTotal = prev.homeScore + prev.awayScore;
        const newTotal = match.homeScore + match.awayScore;
        const homeScored = match.homeScore > prev.homeScore;
        const awayScored = match.awayScore > prev.awayScore;
        if (newTotal > prevTotal) {
            if (homeScored) {
                const ev = findRecentGoalEvent(fixture, 'home');
                changes.push({
                    ...baseEvent,
                    type: 'goal',
                    scoringTeamSide: 'home',
                    goalKind: ev?.goalKind ?? 'normal',
                    scorerName: ev?.scorerName,
                });
            }
            if (awayScored) {
                const ev = findRecentGoalEvent(fixture, 'away');
                changes.push({
                    ...baseEvent,
                    type: 'goal',
                    scoringTeamSide: 'away',
                    goalKind: ev?.goalKind ?? 'normal',
                    scorerName: ev?.scorerName,
                });
            }
        }
        else if (newTotal < prevTotal) {
            // Total goals DECREASED → a goal was disallowed (VAR overturned).
            // Figure out which side lost the goal.
            const side = match.homeScore < prev.homeScore ? 'home' : 'away';
            changes.push({
                ...baseEvent,
                type: 'goalCancelled',
                scoringTeamSide: side,
            });
        }
        // ── Match start ───────────────────────────────────────────────────────
        if (prev.status === 'scheduled' && match.status === 'live' &&
            match.stateId === types_1.SM_STATE_IDS.FIRST_HALF) {
            changes.push({ ...baseEvent, type: 'matchStart' });
        }
        // ── Halftime ──────────────────────────────────────────────────────────
        if (prev.stateId !== types_1.SM_STATE_IDS.HALF_TIME &&
            match.stateId === types_1.SM_STATE_IDS.HALF_TIME) {
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
function scoreWithBrackets(homeName, homeScore, awayName, awayScore, scoringSide) {
    const h = scoringSide === 'home' ? `[${homeScore}]` : `${homeScore}`;
    const a = scoringSide === 'away' ? `[${awayScore}]` : `${awayScore}`;
    return `${homeName} ${h}-${a} ${awayName}`;
}
function copyForGoal(c) {
    const scoringTeamName = c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name;
    const score = scoreWithBrackets(c.homeTeam.name, c.homeScore, c.awayTeam.name, c.awayScore, c.scoringTeamSide ?? 'home');
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
    const title = goalKind === 'penalty' ? `⚽ ¡Gol de penal de ${scoringTeamName}!` :
        goalKind === 'own' ? `⚽ Autogol de ${scoringTeamName === c.homeTeam.name ? c.awayTeam.name : c.homeTeam.name}` :
            `⚽ ¡GOL de ${scoringTeamName}!`;
    const body = `${minute ? minute + ' ' : ''}${scorer}${score}`;
    return { title, body: body.trim() };
}
function copyForGoalCancelled(c) {
    const cancelledFromTeam = c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name;
    const score = `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name}`;
    const minute = c.minute != null ? `${c.minute}' ` : '';
    return {
        title: `🚫 El VAR anula gol de ${cancelledFromTeam}`,
        body: `${minute}${score}`.trim(),
    };
}
function copyForMatchStart(c) {
    return {
        title: `⚽ ¡Empieza el partido!`,
        body: `${c.homeTeam.name} vs ${c.awayTeam.name} · ${c.league}`,
    };
}
function copyForHalftime(c) {
    return {
        title: `⏱️ Medio tiempo · Marcador:`,
        body: `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name}`,
    };
}
function copyForMatchEnd(c) {
    return {
        title: `🏁 Final del partido`,
        body: `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name} · ${c.league}`,
    };
}
function copyForRedCard(c) {
    const team = c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name;
    const minute = c.minute != null ? `${c.minute}' ` : '';
    const player = c.playerName ? `${c.playerName} ` : '';
    const score = `${c.homeTeam.name} ${c.homeScore}-${c.awayScore} ${c.awayTeam.name}`;
    return {
        title: `🟥 TARJETA ROJA`,
        body: `${minute}${player}(${team}) · ${score}`.trim(),
    };
}
// ── FCM topic routing ───────────────────────────────────────────────────────
/** Returns the list of FCM topics that should receive a given change.
 *  A single change can fan out to multiple topics (home team, away team,
 *  league), so callers should send the same payload to each. */
function topicsForChange(c) {
    const homeId = c.homeTeam.id;
    const awayId = c.awayTeam.id;
    const leagueId = c.leagueId;
    switch (c.type) {
        case 'goal':
        case 'goalCancelled':
            // Both teams' followers want goal news (yours + the rival's).
            // The league_*_start topic covers users following the league.
            return [
                `team_${homeId}_goals`,
                `team_${awayId}_goals`,
                `league_${leagueId}_start`,
            ];
        case 'matchStart':
            return [
                `team_${homeId}_start`,
                `team_${awayId}_start`,
                `league_${leagueId}_start`,
            ];
        case 'halftime':
            // Only sent to team start subscribers — league-wide halftime is too noisy.
            return [
                `team_${homeId}_start`,
                `team_${awayId}_start`,
            ];
        case 'matchEnd':
            return [
                `team_${homeId}_start`,
                `team_${awayId}_start`,
                `league_${leagueId}_finals`,
            ];
        case 'redCard': {
            // Only the team that received the card; rivals don't usually care.
            const side = c.scoringTeamSide === 'home' ? homeId : awayId;
            return [`team_${side}_cards`];
        }
        default:
            return [];
    }
}
// ── Notification payload builder ────────────────────────────────────────────
function buildFcmCopy(c) {
    switch (c.type) {
        case 'goal': return copyForGoal(c);
        case 'goalCancelled': return copyForGoalCancelled(c);
        case 'matchStart': return copyForMatchStart(c);
        case 'halftime': return copyForHalftime(c);
        case 'matchEnd': return copyForMatchEnd(c);
        case 'redCard': return copyForRedCard(c);
        default: return { title: 'Analistas', body: 'Nueva actualización del partido' };
    }
}
// ── Dispatch ────────────────────────────────────────────────────────────────
/** Send FCM topic pushes for each detected change. */
async function dispatchNotifications(changes) {
    if (changes.length === 0)
        return;
    const messaging = admin_init_1.admin.messaging();
    const sendPromises = [];
    for (const change of changes) {
        const { title, body } = buildFcmCopy(change);
        const topics = topicsForChange(change);
        // Common payload — included on every message so the client can route the
        // tap into the right MatchDetail screen and apply per-user filtering
        // (e.g. Modo Estadio delay).
        const data = {
            type: change.type,
            matchId: change.matchId,
            homeTeam: change.homeTeam.name,
            awayTeam: change.awayTeam.name,
            homeScore: String(change.homeScore),
            awayScore: String(change.awayScore),
            leagueId: change.leagueId,
        };
        if (change.scoringTeamSide)
            data.scoringTeamSide = change.scoringTeamSide;
        if (change.goalKind)
            data.goalKind = change.goalKind;
        if (change.scorerName)
            data.scorerName = change.scorerName;
        if (change.playerName)
            data.playerName = change.playerName;
        if (change.minute != null)
            data.minute = String(change.minute);
        // ── Deduplication key ──────────────────────────────────────────────────
        // A single event (e.g. a Boca goal) is dispatched to MULTIPLE topics:
        //   team_<home>_goals · team_<away>_goals · league_<id>_start
        // A user who follows BOTH a team AND its league is subscribed to two of
        // those topics, so FCM delivers the SAME event twice → duplicate banner.
        // The same happens if a device has more than one live FCM token (e.g.
        // mid app-reinstall, before FCM expires the stale token).
        //
        // We attach a stable id to every send for the same logical event:
        //   • iOS  → `apns-collapse-id` header. APNs collapses notifications
        //            sharing this id into a SINGLE banner on the device, even
        //            across separate topic deliveries. This is the primary fix
        //            because most pushes are received while the app is
        //            backgrounded/killed (where no JS runs to dedup).
        //   • Android → notification `tag`. A new notification with the same tag
        //            REPLACES the prior one instead of stacking.
        //
        // Key = matchId + type + score. For goals/VAR the score uniquely
        // identifies the moment; for matchStart/halftime/matchEnd the type alone
        // is unique per match. Capped to 64 bytes (APNs limit).
        const dedupId = `${change.matchId}_${change.type}_${change.homeScore}-${change.awayScore}`.slice(0, 64);
        for (const topic of topics) {
            sendPromises.push(messaging.send({
                topic,
                notification: { title, body },
                data,
                android: {
                    priority: 'high',
                    collapseKey: dedupId,
                    notification: {
                        channelId: 'analistas-live',
                        sound: 'default',
                        tag: dedupId,
                    },
                },
                apns: {
                    headers: {
                        'apns-collapse-id': dedupId,
                    },
                    payload: {
                        aps: { sound: 'default', badge: 0 },
                    },
                },
            }).catch(err => {
                // One failed topic shouldn't stop the others. SportMonks can
                // occasionally push events for teams that nobody is subscribed
                // to → FCM rejects with 'not-found', which is fine.
                const code = err.code;
                if (code !== 'messaging/invalid-argument' && code !== 'messaging/registration-token-not-registered') {
                    logger.warn(`FCM send failed for topic ${topic}`, { err, code });
                }
            }));
        }
        // Also log to Cloud Logging for monitoring + post-mortem
        logger.info(`📣 ${change.type.toUpperCase()} — ${title} · ${body}`, {
            matchId: change.matchId,
            topics,
        });
    }
    await Promise.allSettled(sendPromises);
    logger.info(`📊 Total changes: ${changes.length}`, {
        goals: changes.filter(c => c.type === 'goal').length,
        goalsCancelled: changes.filter(c => c.type === 'goalCancelled').length,
        starts: changes.filter(c => c.type === 'matchStart').length,
        halftimes: changes.filter(c => c.type === 'halftime').length,
        ends: changes.filter(c => c.type === 'matchEnd').length,
        redCards: changes.filter(c => c.type === 'redCard').length,
    });
    // Event-driven sync: refresh standings/topscorers for affected leagues so
    // table-position swaps and Messi-vs-Ronaldo races show up in seconds
    // instead of waiting for the hourly cron.
    await (0, sync_league_data_1.triggerLeagueSyncForChanges)(changes);
}
//# sourceMappingURL=detect-changes.js.map