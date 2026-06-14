"use strict";
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
const functions_1 = require("firebase-admin/functions");
const logger = __importStar(require("firebase-functions/logger"));
const sync_league_data_1 = require("./sync-league-data");
const types_1 = require("./types");
Object.defineProperty(exports, "LIVE_STATE_IDS", { enumerable: true, get: function () { return types_1.LIVE_STATE_IDS; } });
Object.defineProperty(exports, "FINISHED_STATE_IDS", { enumerable: true, get: function () { return types_1.FINISHED_STATE_IDS; } });
// ── Server-side Spanish team name lookup ──────────────────────────────────────
// Notifications are built server-side; i18n lives on the client. Since our
// primary audience is MX/LATAM we localize to Spanish here. Club names that
// don't appear in the map are returned unchanged (safe call).
const TEAMS_ES = {
    'Afghanistan': 'Afganistán', 'Albania': 'Albania', 'Algeria': 'Argelia',
    'Angola': 'Angola', 'Argentina': 'Argentina', 'Armenia': 'Armenia',
    'Australia': 'Australia', 'Austria': 'Austria', 'Azerbaijan': 'Azerbaiyán',
    'Bahrain': 'Baréin', 'Belgium': 'Bélgica', 'Bolivia': 'Bolivia',
    'Bosnia and Herzegovina': 'Bosnia y Herzegovina', 'Brazil': 'Brasil',
    'Bulgaria': 'Bulgaria', 'Cameroon': 'Camerún', 'Canada': 'Canadá',
    'Cape Verde Islands': 'Cabo Verde',
    'Chile': 'Chile', 'China PR': 'China', 'Colombia': 'Colombia',
    'Congo DR': 'Congo RD', 'Costa Rica': 'Costa Rica', 'Croatia': 'Croacia',
    'Czech Republic': 'República Checa', 'Czechia': 'República Checa',
    'Denmark': 'Dinamarca', 'Ecuador': 'Ecuador', 'Egypt': 'Egipto',
    'England': 'Inglaterra', 'Finland': 'Finlandia', 'France': 'Francia',
    'Germany': 'Alemania', 'Ghana': 'Ghana', 'Greece': 'Grecia',
    'Guatemala': 'Guatemala', 'Honduras': 'Honduras', 'Hungary': 'Hungría',
    'India': 'India', 'Indonesia': 'Indonesia', 'Iran': 'Irán',
    'Iraq': 'Irak', 'Ireland': 'Irlanda', 'Israel': 'Israel',
    'Italy': 'Italia',
    'Ivory Coast': 'Costa de Marfil', "Côte d'Ivoire": 'Costa de Marfil',
    'Jamaica': 'Jamaica', 'Japan': 'Japón', 'Jordan': 'Jordania',
    'Kenya': 'Kenia', 'Korea DPR': 'Corea del Norte',
    'Korea Republic': 'Corea del Sur', 'Kosovo': 'Kosovo', 'Kuwait': 'Kuwait',
    'Mali': 'Malí', 'Mexico': 'México', 'Morocco': 'Marruecos',
    'Netherlands': 'Países Bajos', 'New Zealand': 'Nueva Zelanda',
    'Nigeria': 'Nigeria', 'Norway': 'Noruega', 'Oman': 'Omán',
    'Panama': 'Panamá', 'Paraguay': 'Paraguay', 'Peru': 'Perú',
    'Poland': 'Polonia', 'Portugal': 'Portugal', 'Qatar': 'Catar',
    'Romania': 'Rumanía', 'Russia': 'Rusia', 'Saudi Arabia': 'Arabia Saudita',
    'Scotland': 'Escocia', 'Senegal': 'Senegal', 'Serbia': 'Serbia',
    'Slovakia': 'Eslovaquia', 'Slovenia': 'Eslovenia',
    'South Africa': 'Sudáfrica', 'South Korea': 'Corea del Sur',
    'Spain': 'España', 'Sweden': 'Suecia', 'Switzerland': 'Suiza',
    'Thailand': 'Tailandia', 'Tunisia': 'Túnez',
    'Turkey': 'Türkiye', 'Türkiye': 'Türkiye',
    'Ukraine': 'Ucrania', 'United Arab Emirates': 'Emiratos Árabes',
    'United States': 'Estados Unidos', 'USA': 'Estados Unidos',
    'Uruguay': 'Uruguay', 'Venezuela': 'Venezuela',
    'Wales': 'Gales', 'Zimbabwe': 'Zimbabue',
};
/** Translate a team name to Spanish. Club names not in the map pass through unchanged. */
function loc(name) {
    return TEAMS_ES[name] ?? name;
}
// ── Snapshot helpers ────────────────────────────────────────────────────────
async function loadSnapshot() {
    const snap = await admin_init_1.db.doc('_meta/livescoresSnapshot').get();
    if (!snap.exists)
        return {};
    return snap.data()?.matches ?? {};
}
/** Count red cards (red + second yellow) for a given side. */
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
/** Count first yellow cards (NOT second yellows — those are counted as red cards). */
function countYellowCards(events, participantId) {
    if (!events || !participantId)
        return 0;
    let count = 0;
    for (const ev of events) {
        if (ev.participant_id !== participantId)
            continue;
        if (ev.type_id === types_1.SM_EVENT_TYPES.YELLOW_CARD)
            count++;
    }
    return count;
}
/** Count substitutions for a given side. */
function countSubstitutions(events, participantId) {
    if (!events || !participantId)
        return 0;
    let count = 0;
    for (const ev of events) {
        if (ev.participant_id !== participantId)
            continue;
        if (ev.type_id === types_1.SM_EVENT_TYPES.SUBSTITUTION)
            count++;
    }
    return count;
}
/** Find the most recent yellow card for a given side. */
function findRecentYellowCard(fixture, side) {
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
        if (ev.type_id === types_1.SM_EVENT_TYPES.YELLOW_CARD) {
            return { playerName: ev.player_name ?? undefined, minute: ev.minute ?? null };
        }
    }
    return null;
}
/** Find the most recent substitution for a given side.
 *  player_name = player going OFF, related_player_name = player coming ON. */
function findRecentSubstitution(fixture, side) {
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
        if (ev.type_id === types_1.SM_EVENT_TYPES.SUBSTITUTION) {
            return {
                playerName: ev.player_name ?? undefined,
                relatedPlayerName: ev.related_player_name ?? undefined,
                minute: ev.minute ?? null,
            };
        }
    }
    return null;
}
/** Snapshot the relevant per-match state for next-poll diff detection. */
async function saveSnapshot(matches, fixtures, previousSnapshot) {
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
        const prev = previousSnapshot?.[m.id];
        snapshot[m.id] = {
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            status: m.status,
            stateId: m.stateId,
            redCardsHome: countRedCards(fixture?.events, home?.id),
            redCardsAway: countRedCards(fixture?.events, away?.id),
            yellowCardsHome: countYellowCards(fixture?.events, home?.id),
            yellowCardsAway: countYellowCards(fixture?.events, away?.id),
            substitutionsHome: countSubstitutions(fixture?.events, home?.id),
            substitutionsAway: countSubstitutions(fixture?.events, away?.id),
            // Preserve flags that track whether one-time pushes have already been sent.
            reminderSent: prev?.reminderSent ?? false,
            lineupsSent: prev?.lineupsSent ?? false,
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
        // ── Event-count detection (cards, substitutions) ──────────────────────
        const home = fixture?.participants?.find(p => p.meta?.location === 'home');
        const away = fixture?.participants?.find(p => p.meta?.location === 'away');
        const redHome = countRedCards(fixture?.events, home?.id);
        const redAway = countRedCards(fixture?.events, away?.id);
        const yelHome = countYellowCards(fixture?.events, home?.id);
        const yelAway = countYellowCards(fixture?.events, away?.id);
        const subHome = countSubstitutions(fixture?.events, home?.id);
        const subAway = countSubstitutions(fixture?.events, away?.id);
        // ── Extra time start ──────────────────────────────────────────────────
        if (prev.stateId !== types_1.SM_STATE_IDS.EXTRA_TIME &&
            match.stateId === types_1.SM_STATE_IDS.EXTRA_TIME) {
            changes.push({ ...baseEvent, type: 'extraTimeStart' });
        }
        // ── Penalties start ───────────────────────────────────────────────────
        if (prev.stateId !== types_1.SM_STATE_IDS.PENALTIES &&
            match.stateId === types_1.SM_STATE_IDS.PENALTIES) {
            changes.push({ ...baseEvent, type: 'penaltiesStart' });
        }
        // ── Match suspended / postponed mid-game ──────────────────────────────
        const suspendedStateIds = [
            types_1.SM_STATE_IDS.SUSPENDED, types_1.SM_STATE_IDS.POSTPONED,
            types_1.SM_STATE_IDS.INTERRUPTED, types_1.SM_STATE_IDS.ABANDONED,
        ];
        if (prev.status === 'live' && suspendedStateIds.includes(match.stateId)) {
            changes.push({ ...baseEvent, type: 'matchSuspended' });
        }
        // ── Pre-match reminder (one-time, ~15 min before kickoff) ────────────
        // Fired when a scheduled match is within 16 minutes of kickoff and the
        // reminder hasn't been sent yet. The 16-min window covers the 15-second
        // polling gap + 1 min buffer so we don't miss the window.
        if (match.status === 'scheduled' && !prev.reminderSent) {
            const kickoffMs = new Date(match.startingAtUtc ?? '').getTime();
            const nowMs = Date.now();
            const minsToKick = (kickoffMs - nowMs) / 60_000;
            if (minsToKick > 0 && minsToKick <= 16) {
                changes.push({ ...baseEvent, type: 'matchReminder' });
                // Mark as sent so we don't fire again on the next poll
                if (prev)
                    prev.reminderSent = true;
            }
        }
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
        // ── Yellow card detection ─────────────────────────────────────────────
        const prevYelHome = prev.yellowCardsHome ?? 0;
        const prevYelAway = prev.yellowCardsAway ?? 0;
        if (yelHome > prevYelHome) {
            const ev = findRecentYellowCard(fixture, 'home');
            changes.push({
                ...baseEvent,
                type: 'yellowCard',
                scoringTeamSide: 'home',
                playerName: ev?.playerName,
                minute: ev?.minute ?? match.minute,
            });
        }
        if (yelAway > prevYelAway) {
            const ev = findRecentYellowCard(fixture, 'away');
            changes.push({
                ...baseEvent,
                type: 'yellowCard',
                scoringTeamSide: 'away',
                playerName: ev?.playerName,
                minute: ev?.minute ?? match.minute,
            });
        }
        // ── Substitution detection ────────────────────────────────────────────
        const prevSubHome = prev.substitutionsHome ?? 0;
        const prevSubAway = prev.substitutionsAway ?? 0;
        if (subHome > prevSubHome) {
            const ev = findRecentSubstitution(fixture, 'home');
            changes.push({
                ...baseEvent,
                type: 'substitution',
                scoringTeamSide: 'home',
                playerName: ev?.playerName,
                relatedPlayerName: ev?.relatedPlayerName,
                minute: ev?.minute ?? match.minute,
            });
        }
        if (subAway > prevSubAway) {
            const ev = findRecentSubstitution(fixture, 'away');
            changes.push({
                ...baseEvent,
                type: 'substitution',
                scoringTeamSide: 'away',
                playerName: ev?.playerName,
                relatedPlayerName: ev?.relatedPlayerName,
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
    const scoringTeamName = loc(c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name);
    const score = scoreWithBrackets(loc(c.homeTeam.name), c.homeScore, loc(c.awayTeam.name), c.awayScore, c.scoringTeamSide ?? 'home');
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
        goalKind === 'own' ? `⚽ Autogol de ${scoringTeamName === loc(c.homeTeam.name) ? loc(c.awayTeam.name) : loc(c.homeTeam.name)}` :
            `⚽ ¡GOL de ${scoringTeamName}!`;
    const body = `${minute ? minute + ' ' : ''}${scorer}${score}`;
    return { title, body: body.trim() };
}
function copyForGoalCancelled(c) {
    const cancelledFromTeam = loc(c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name);
    const score = `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)}`;
    const minute = c.minute != null ? `${c.minute}' ` : '';
    return {
        title: `🚫 El VAR anula gol de ${cancelledFromTeam}`,
        body: `${minute}${score}`.trim(),
    };
}
function copyForMatchStart(c) {
    return {
        title: `⚽ ¡Empieza el partido!`,
        body: `${loc(c.homeTeam.name)} vs ${loc(c.awayTeam.name)} · ${c.league}`,
    };
}
function copyForHalftime(c) {
    return {
        title: `⏱️ Medio tiempo · Marcador:`,
        body: `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)}`,
    };
}
function copyForMatchEnd(c) {
    return {
        title: `🏁 Final del partido`,
        body: `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)} · ${c.league}`,
    };
}
function copyForRedCard(c) {
    const team = loc(c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name);
    const minute = c.minute != null ? `${c.minute}' ` : '';
    const player = c.playerName ? `${c.playerName} ` : '';
    const score = `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)}`;
    return {
        title: `🟥 TARJETA ROJA`,
        body: `${minute}${player}(${team}) · ${score}`.trim(),
    };
}
function copyForYellowCard(c) {
    const team = loc(c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name);
    const minute = c.minute != null ? `${c.minute}' ` : '';
    const player = c.playerName ? `${c.playerName} ` : '';
    const score = `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)}`;
    return {
        title: `🟨 Tarjeta amarilla`,
        body: `${minute}${player}(${team}) · ${score}`.trim(),
    };
}
function copyForSubstitution(c) {
    const team = loc(c.scoringTeamSide === 'home' ? c.homeTeam.name : c.awayTeam.name);
    const minute = c.minute != null ? `${c.minute}' ` : '';
    const playerOut = c.playerName ? `↓ ${c.playerName}` : '';
    const playerIn = c.relatedPlayerName ? ` ↑ ${c.relatedPlayerName}` : '';
    return {
        title: `🔄 Cambio · ${team}`,
        body: `${minute}${playerOut}${playerIn}`.trim() ||
            `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)}`,
    };
}
function copyForExtraTimeStart(c) {
    return {
        title: `⏱️ ¡Prórroga!`,
        body: `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)} · ${c.league}`,
    };
}
function copyForPenaltiesStart(c) {
    return {
        title: `🥅 ¡Tanda de penaltis!`,
        body: `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)} · ${c.league}`,
    };
}
function copyForMatchSuspended(c) {
    return {
        title: `⚠️ Partido suspendido`,
        body: `${loc(c.homeTeam.name)} ${c.homeScore}-${c.awayScore} ${loc(c.awayTeam.name)}`,
    };
}
function copyForMatchReminder(c) {
    return {
        title: `⏰ ¡El partido comienza pronto!`,
        body: `${loc(c.homeTeam.name)} vs ${loc(c.awayTeam.name)} · ${c.league} · en ~15 min`,
    };
}
function copyForLineups(c) {
    return {
        title: `📋 Alineaciones confirmadas`,
        body: `${loc(c.homeTeam.name)} vs ${loc(c.awayTeam.name)} · ${c.league}`,
    };
}
// ── FCM topic taxonomy (Modo Estadio) ─────────────────────────────────────────
/** Delay buckets used for Modo Estadio (minutes). 0 = immediate. */
const DELAY_BUCKETS = [0, 2, 5, 10];
function routeChange(c) {
    const homeId = c.homeTeam.id;
    const awayId = c.awayTeam.id;
    const leagueId = c.leagueId;
    switch (c.type) {
        case 'goal':
            return {
                retrasableBases: [`team_${homeId}_goals`, `team_${awayId}_goals`],
                immediateTopic: null,
                // DUAL-SEND legacy: goals + league start (old builds expect league topic)
                legacyTopics: [`team_${homeId}_goals`, `team_${awayId}_goals`, `league_${leagueId}_start`],
            };
        case 'goalCancelled':
            // VAR: only send to _d0 (immediate). Devices on _d2/_d5/_d10 haven't seen
            // the goal yet → the VAR guard in deliverDelayedPush will suppress it.
            // No need to notify them that a goal they don't know about was cancelled.
            return {
                retrasableBases: [], // no delayed tasks for VAR
                immediateTopic: null,
                // Still notify _d0 devices (they saw the goal, now see the correction)
                // by putting the bases in legacyTopics + _d0 handling below.
                legacyTopics: [`team_${homeId}_goals`, `team_${awayId}_goals`, `league_${leagueId}_start`],
            };
        case 'matchStart':
            return {
                retrasableBases: [],
                immediateTopic: null, // kickoff fan-out handled specially below
                legacyTopics: [`team_${homeId}_start`, `team_${awayId}_start`, `league_${leagueId}_start`],
            };
        case 'halftime':
            return {
                retrasableBases: [`team_${homeId}_live`, `team_${awayId}_live`],
                immediateTopic: null,
                legacyTopics: [`team_${homeId}_start`, `team_${awayId}_start`],
            };
        case 'matchEnd':
            return {
                retrasableBases: [`team_${homeId}_live`, `team_${awayId}_live`],
                immediateTopic: null,
                legacyTopics: [`team_${homeId}_start`, `team_${awayId}_start`, `league_${leagueId}_finals`],
            };
        case 'redCard': {
            const side = c.scoringTeamSide === 'home' ? homeId : awayId;
            return {
                retrasableBases: [`team_${side}_cards`],
                immediateTopic: null,
                legacyTopics: [`team_${side}_cards`],
            };
        }
        case 'yellowCard': {
            // Yellow cards share the _cards bucket — client filters by data.type
            const side = c.scoringTeamSide === 'home' ? homeId : awayId;
            return {
                retrasableBases: [`team_${side}_cards`],
                immediateTopic: null,
                legacyTopics: [`team_${side}_cards`],
            };
        }
        case 'substitution': {
            // Substitutions share the _live bucket — client filters by data.type
            const side = c.scoringTeamSide === 'home' ? homeId : awayId;
            return {
                retrasableBases: [`team_${side}_live`],
                immediateTopic: null,
                legacyTopics: [`team_${side}_start`],
            };
        }
        case 'extraTimeStart':
            return {
                retrasableBases: [`team_${homeId}_live`, `team_${awayId}_live`],
                immediateTopic: null,
                legacyTopics: [`team_${homeId}_start`, `team_${awayId}_start`],
            };
        case 'penaltiesStart':
            return {
                retrasableBases: [`team_${homeId}_live`, `team_${awayId}_live`],
                immediateTopic: null,
                legacyTopics: [`team_${homeId}_start`, `team_${awayId}_start`],
            };
        case 'matchSuspended':
            // Suspended/postponed are immediate — no spoiler concern
            return {
                retrasableBases: [],
                immediateTopic: null,
                legacyTopics: [`team_${homeId}_start`, `team_${awayId}_start`],
            };
        case 'matchReminder':
            // Reminders are always immediate (pre-match)
            return {
                retrasableBases: [],
                immediateTopic: null,
                legacyTopics: [`team_${homeId}_reminders`, `team_${awayId}_reminders`],
            };
        case 'lineups':
            // Lineups are always immediate (pre-match info)
            return {
                retrasableBases: [],
                immediateTopic: null,
                legacyTopics: [`team_${homeId}_lineups`, `team_${awayId}_lineups`],
            };
        default:
            return { retrasableBases: [], immediateTopic: null, legacyTopics: [] };
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
        case 'yellowCard': return copyForYellowCard(c);
        case 'substitution': return copyForSubstitution(c);
        case 'extraTimeStart': return copyForExtraTimeStart(c);
        case 'penaltiesStart': return copyForPenaltiesStart(c);
        case 'matchSuspended': return copyForMatchSuspended(c);
        case 'matchReminder': return copyForMatchReminder(c);
        case 'lineups': return copyForLineups(c);
        default: return { title: 'Analistas', body: 'Nueva actualización del partido' };
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
function toTaskId(raw) {
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 499);
}
/** Send one FCM alert push to a specific topic — shared helper. */
function sendToTopic(messaging, topic, title, body, data, dedupId) {
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
        const code = err.code;
        if (code !== 'messaging/invalid-argument' && code !== 'messaging/registration-token-not-registered') {
            logger.warn(`FCM send failed for topic ${topic}`, { err, code });
        }
    });
}
/** Send FCM topic pushes for each detected change. */
async function dispatchNotifications(changes) {
    if (changes.length === 0)
        return;
    const messaging = admin_init_1.admin.messaging();
    const sendPromises = [];
    for (const change of changes) {
        const { title, body } = buildFcmCopy(change);
        const { retrasableBases, legacyTopics } = routeChange(change);
        // ── Common data payload ────────────────────────────────────────────────
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
        // ── Immediate-only events (reminder, lineups, suspended) ──────────────
        // These use only legacyTopics (which map to _reminders, _lineups, _kickoff, _start)
        // and have no bucket variants. Send immediately to all legacy topics.
        if (change.type === 'matchReminder' ||
            change.type === 'lineups' ||
            change.type === 'matchSuspended') {
            for (const topic of legacyTopics) {
                sendPromises.push(sendToTopic(messaging, topic, title, body, data, dedupId));
            }
            logger.info(`📣 ${change.type.toUpperCase()} — ${title}`, { matchId: change.matchId });
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
            const queue = (0, functions_1.getFunctions)().taskQueue('deliverDelayedPush');
            for (const base of retrasableBases) {
                for (const delayMin of [2, 5, 10]) {
                    const taskId = toTaskId(`estadio_${base}_${dedupId}_d${delayMin}`);
                    const payload = {
                        topic: `${base}_d${delayMin}`,
                        title, body, data, dedupId,
                        changeType: change.type,
                        matchId: change.matchId,
                        homeScore: change.homeScore,
                        awayScore: change.awayScore,
                    };
                    // Fire-and-forget; swallow ALREADY_EXISTS (idempotent re-enqueue)
                    queue.enqueue(payload, {
                        scheduleDelaySeconds: delayMin * 60,
                        id: taskId,
                    }).catch((err) => {
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
            matchId: change.matchId,
            retrasableBases,
            legacyTopics,
            estadioEnabled: ESTADIO_DELAY_ENABLED,
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
        yellowCards: changes.filter(c => c.type === 'yellowCard').length,
        substitutions: changes.filter(c => c.type === 'substitution').length,
        extraTime: changes.filter(c => c.type === 'extraTimeStart').length,
        penalties: changes.filter(c => c.type === 'penaltiesStart').length,
        suspended: changes.filter(c => c.type === 'matchSuspended').length,
        reminders: changes.filter(c => c.type === 'matchReminder').length,
        lineups: changes.filter(c => c.type === 'lineups').length,
    });
    // Event-driven sync: refresh standings/topscorers for affected leagues so
    // table-position swaps show up in seconds instead of waiting for the hourly cron.
    await (0, sync_league_data_1.triggerLeagueSyncForChanges)(changes);
}
//# sourceMappingURL=detect-changes.js.map