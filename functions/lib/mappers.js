"use strict";
/**
 * mappers.ts
 *
 * Transform SportMonks API responses into Firestore document shapes.
 * Mirrors the client-side sportsApi.ts mapping logic for server-side use.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapFixtureToMatchDoc = mapFixtureToMatchDoc;
exports.mapStandingsToDoc = mapStandingsToDoc;
exports.mapTopScorersToDoc = mapTopScorersToDoc;
const firestore_1 = require("firebase-admin/firestore");
const config_1 = require("./config");
const types_1 = require("./types");
// ── State Label Mapping ─────────────────────────────────────────────────────
function getStateLabel(stateId) {
    switch (stateId) {
        case types_1.SM_STATE_IDS.FIRST_HALF: return '1T';
        case types_1.SM_STATE_IDS.HALF_TIME: return 'HT';
        case types_1.SM_STATE_IDS.SECOND_HALF: return '2T';
        case types_1.SM_STATE_IDS.EXTRA_TIME: return 'ET';
        case types_1.SM_STATE_IDS.PENALTIES: return 'PEN';
        case types_1.SM_STATE_IDS.BREAK: return 'HT';
        default: return null;
    }
}
/**
 * Map a SportMonks state_id to our internal MatchStatus.
 *
 * Why the time-based fallback exists:
 *   1. SportMonks occasionally adds new state IDs (or our constants drift out
 *      of date — see the historical note in types.ts). Without a fallback,
 *      any unknown ID silently becomes 'scheduled' and the client renders
 *      the pre-match view for an active live match.
 *   2. Some lower-tier or regional feeds lag — they keep `state_id: 1`
 *      (NOT_STARTED) for several minutes after actual kickoff.
 *
 * The fallback is intentionally conservative:
 *   - Only triggers for state IDs we don't recognize (or NOT_STARTED).
 *   - Never overrides a DEAD state (postponed/cancelled/abandoned/etc.).
 *   - 2-min minimum elapsed avoids prematurely marking a fixture live just
 *     because clocks are slightly off.
 *   - 135-min maximum elapsed covers 90' regulation + ~15' HT + 30' ET +
 *     ~5' penalty shootout + buffer, while still rejecting matches that
 *     started hours ago and clearly should have ended.
 *
 * Mirror of `mapStateToStatus` in src/services/sportsApi.ts — keep both
 * in sync so server-side writes match client-side reads.
 */
function getMatchStatus(stateId, startingAt) {
    if (types_1.LIVE_STATE_IDS.has(stateId))
        return 'live';
    if (types_1.FINISHED_STATE_IDS.has(stateId))
        return 'finished';
    if (types_1.DEAD_STATE_IDS.has(stateId))
        return 'scheduled';
    // Time-based inference for NOT_STARTED, unknown IDs, or lagging feeds.
    if (startingAt) {
        const kickoffMs = new Date(startingAt.replace(' ', 'T') + 'Z').getTime();
        if (!Number.isNaN(kickoffMs)) {
            const elapsedMin = (Date.now() - kickoffMs) / 60000;
            if (elapsedMin > 2 && elapsedMin < 135)
                return 'live';
        }
    }
    return 'scheduled';
}
// ── Live Minute Calculation ─────────────────────────────────────────────────
function calculateLiveMinute(fixture) {
    const status = getMatchStatus(fixture.state_id, fixture.starting_at);
    if (status !== 'live')
        return null;
    if (fixture.state_id === types_1.SM_STATE_IDS.HALF_TIME)
        return 45;
    const kickoffTs = fixture.starting_at_timestamp;
    if (!kickoffTs)
        return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsedMin = Math.floor((nowSec - kickoffTs) / 60);
    // If second half (or beyond), subtract 15 min half-time break
    if (fixture.state_id === types_1.SM_STATE_IDS.SECOND_HALF) {
        return Math.max(46, elapsedMin - 15);
    }
    return Math.max(1, Math.min(elapsedMin, 45));
}
// ── Time Display ────────────────────────────────────────────────────────────
function formatTimeDisplay(fixture, status, minute) {
    if (status === 'finished')
        return 'FT';
    if (status === 'live' && fixture.state_id === types_1.SM_STATE_IDS.HALF_TIME)
        return 'HT';
    if (status === 'live' && minute)
        return `${minute}'`;
    // Scheduled: store the raw UTC HH:MM. We can't compute the user's local time
    // server-side (GCP runs in UTC, the client knows its own timezone). The app
    // uses `startingAtUtc` to render the final local time per-user; this `time`
    // string is a UTC fallback for any read path that doesn't do that conversion.
    return fixture.starting_at?.slice(11, 16) ?? '--:--';
}
// ── Score Extraction ────────────────────────────────────────────────────────
function extractScores(fixture) {
    let homeScore = 0, awayScore = 0;
    let homeScoreHT = null, awayScoreHT = null;
    // Penalty shootout final score — kept as `null` rather than 0 so the
    // client can distinguish "no shootout took place" from "shootout ended 0-0"
    // (which is impossible in practice but useful semantically).
    let homePenScore = null, awayPenScore = null;
    if (fixture.scores && Array.isArray(fixture.scores)) {
        for (const s of fixture.scores) {
            // CURRENT = the regulation/ET score (i.e. the in-play total). For a
            // fixture that ends in penalties this stays at the ET tied value
            // (e.g. 3-3 for the 2022 final) — the shootout result lives in a
            // separate row described as 'PENALTIES' (see below).
            if (s.description === 'CURRENT') {
                if (s.score.participant === 'home')
                    homeScore = s.score.goals;
                else
                    awayScore = s.score.goals;
            }
            else if (s.description === '1ST_HALF') {
                if (s.score.participant === 'home')
                    homeScoreHT = s.score.goals;
                else
                    awayScoreHT = s.score.goals;
            }
            else if (s.description === 'PENALTIES' || s.description === 'PENALTY_SHOOTOUT') {
                // SportMonks v3 docs spell it 'PENALTIES'; some legacy/third-party
                // feeds use the more literal 'PENALTY_SHOOTOUT'. Accept both — the
                // semantic is identical (final shootout tally).
                if (s.score.participant === 'home')
                    homePenScore = s.score.goals;
                else
                    awayPenScore = s.score.goals;
            }
        }
    }
    return { homeScore, awayScore, homeScoreHT, awayScoreHT, homePenScore, awayPenScore };
}
// ── Live clock anchor ───────────────────────────────────────────────────────
// Extract the timestamp + minute offset of the currently-ticking period so the
// client can smoothly advance the displayed minute between server polls.
// Mirrors `getLiveClockAnchor` in src/services/sportsApi.ts so both ends of the
// pipeline use the same logic. Returns undefined for HT (no period ticking),
// scheduled, and finished matches — the client falls back to `minute` then.
function getLiveClockAnchor(fixture) {
    const periods = fixture.periods;
    if (!periods || periods.length === 0)
        return undefined;
    const ticking = periods.find(p => p.ticking);
    if (!ticking)
        return undefined;
    if (typeof ticking.started !== 'number' || ticking.started <= 0)
        return undefined;
    const offset = typeof ticking.counts_from === 'number' ? ticking.counts_from : 0;
    return {
        periodStartedAt: ticking.started,
        periodMinuteOffset: Math.max(0, offset),
    };
}
// ── Live enrichment extractor ───────────────────────────────────────────────
// Pulls the subset of SMFixture fields that change during a live match —
// events, statistics, periods. Returned as a plain object suitable for
// nesting under MatchDoc.detail. Skips undefined values to keep Firestore
// happy.
function extractLiveEnrichment(fixture) {
    const f = fixture;
    const out = {};
    let any = false;
    if (Array.isArray(f.events)) {
        out.events = f.events;
        any = true;
    }
    if (Array.isArray(f.statistics)) {
        out.statistics = f.statistics;
        any = true;
    }
    if (Array.isArray(f.periods)) {
        out.periods = f.periods;
        any = true;
    }
    return any ? out : null;
}
// ── Fixture → MatchDoc ──────────────────────────────────────────────────────
function mapFixtureToMatchDoc(fixture) {
    const participants = fixture.participants ?? [];
    const home = participants.find(p => p.meta?.location === 'home');
    const away = participants.find(p => p.meta?.location === 'away');
    if (!home || !away)
        return null;
    const status = getMatchStatus(fixture.state_id, fixture.starting_at);
    const minute = calculateLiveMinute(fixture);
    const { homeScore, awayScore, homeScoreHT, awayScoreHT, homePenScore, awayPenScore, } = extractScores(fixture);
    const time = formatTimeDisplay(fixture, status, minute);
    // League info from config or SM response
    const leagueCfg = (0, config_1.getLeagueConfig)(fixture.league_id);
    const league = fixture.league;
    const homeTeam = {
        id: String(home.id),
        name: home.name,
        shortName: home.short_code || home.name.slice(0, 3).toUpperCase(),
        logo: home.image_path,
    };
    const awayTeam = {
        id: String(away.id),
        name: away.name,
        shortName: away.short_code || away.name.slice(0, 3).toUpperCase(),
        logo: away.image_path,
    };
    const doc = {
        id: String(fixture.id),
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        homeScoreHT,
        awayScoreHT,
        homePenScore,
        awayPenScore,
        status,
        stateId: fixture.state_id,
        // For finished fixtures we suppress the in-game stateLabel ("HT", "2T",
        // "ET" …) so the UI doesn't keep rendering "DESCANSO" or "EN VIVO" on a
        // match that ended hours/years ago. The UI uses status='finished' alone
        // to drive the "FT" / final-score presentation.
        stateLabel: status === 'finished' ? null : getStateLabel(fixture.state_id),
        minute,
        time,
        league: leagueCfg?.name ?? league?.name ?? 'Unknown',
        leagueId: String(fixture.league_id),
        leagueLogo: league?.image_path ?? '',
        date: fixture.starting_at?.slice(0, 10) ?? '',
        startingAtUtc: fixture.starting_at ?? '',
        seasonId: fixture.season_id ?? null,
        updatedAt: firestore_1.Timestamp.now(),
    };
    // Live clock anchor — populated only when a period is actively ticking.
    // Without this the client UI freezes the minute between server polls (15s
    // intervals); with it the displayed minute advances smoothly every second.
    const liveClock = getLiveClockAnchor(fixture);
    if (liveClock) {
        doc.liveClock = liveClock;
    }
    // Optional live enrichment — only present when called from pollLivescores
    // (which pulls events/statistics/periods on /livescores/inplay).
    const liveEnrich = extractLiveEnrichment(fixture);
    if (liveEnrich) {
        doc.detail = liveEnrich;
        doc.detailUpdatedAt = firestore_1.Timestamp.now();
    }
    return doc;
}
// ── Standings → StandingsDoc ────────────────────────────────────────────────
function getDetailValue(details, typeId) {
    return details?.find(d => d.type_id === typeId)?.value ?? 0;
}
function mapStandingsToDoc(seasonId, leagueId, groups) {
    const rows = [];
    for (const group of groups) {
        const entries = group.standings?.data ?? [];
        for (const entry of entries) {
            if (!entry.participant)
                continue;
            rows.push({
                position: entry.position,
                team: {
                    id: String(entry.participant.id),
                    name: entry.participant.name,
                    shortName: entry.participant.short_code || entry.participant.name.slice(0, 3).toUpperCase(),
                    logo: entry.participant.image_path,
                },
                played: getDetailValue(entry.details, types_1.STANDING_DETAIL_TYPES.GP),
                won: getDetailValue(entry.details, types_1.STANDING_DETAIL_TYPES.W),
                drawn: getDetailValue(entry.details, types_1.STANDING_DETAIL_TYPES.D),
                lost: getDetailValue(entry.details, types_1.STANDING_DETAIL_TYPES.L),
                goalsFor: getDetailValue(entry.details, types_1.STANDING_DETAIL_TYPES.GF),
                goalsAgainst: getDetailValue(entry.details, types_1.STANDING_DETAIL_TYPES.GA),
                goalDifference: getDetailValue(entry.details, types_1.STANDING_DETAIL_TYPES.GD),
                points: entry.points,
                groupId: entry.group_id ?? null,
            });
        }
    }
    // Sort by position
    rows.sort((a, b) => a.position - b.position);
    return {
        seasonId,
        leagueId,
        rows,
        updatedAt: firestore_1.Timestamp.now(),
    };
}
// ── Top Scorers → TopScorersDoc ─────────────────────────────────────────────
function mapTopScorersToDoc(seasonId, leagueId, scorers) {
    // SM returns one entry per stat type. type_id 208 = goals (most common).
    // Group by player, take the highest total as goals.
    const playerMap = new Map();
    for (const s of scorers) {
        const pid = s.player_id;
        const existing = playerMap.get(pid);
        if (!existing || s.total > existing.goals) {
            playerMap.set(pid, {
                playerId: String(pid),
                playerName: s.player?.display_name ?? s.player?.common_name ?? `Player ${pid}`,
                playerImage: s.player?.image_path ?? '',
                // Team info now arrives via the `participant` include on the topscorers
                // query — see fetchTopScorers in sportmonks.ts.
                teamName: s.participant?.name ?? '',
                teamLogo: s.participant?.image_path ?? '',
                goals: s.total,
                assists: 0,
                position: s.position,
            });
        }
    }
    const result = Array.from(playerMap.values());
    result.sort((a, b) => a.position - b.position);
    return {
        seasonId,
        leagueId,
        scorers: result.slice(0, 30), // Top 30
        updatedAt: firestore_1.Timestamp.now(),
    };
}
//# sourceMappingURL=mappers.js.map