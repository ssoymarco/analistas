"use strict";
/**
 * football/live-detect.ts
 *
 * Change detection for API-Sports live fixtures. Pure: takes the previous
 * per-match snapshot + current fixtures, returns detected changes and the next
 * snapshot. Same event vocabulary and product rules as the Sportmonks-era
 * detector (detect-changes.ts on the feature/live-activities branch), so
 * notification copy, Modo Estadio, Modo Rival, player follows and the per-match
 * mute behave identically.
 *
 * API-Sports specifics handled here:
 *   - Finished matches DROP OUT of `/fixtures?live=all`. The poller re-fetches
 *     snapshot matches missing from the feed via `/fixtures?ids=` and passes
 *     them in, so the FT transition is still observed.
 *   - Events have no ids. Scorer/card/sub details come from counting events
 *     per side (count-based diffing is naturally idempotent) and reading the
 *     newest matching event.
 *   - Own goals: API-Sports credits the event to the team that BENEFITS, so
 *     "latest goal event of the scoring side" also finds own goals.
 *   - A revoked red card / disallowed goal is REMOVED from the feed: counts go
 *     down. Red-card cancellations are confirmed over consecutive polls before
 *     notifying (a feed hiccup must not invent a correction).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RED_CANCEL_CONFIRM_POLLS = void 0;
exports.hasRecentVarEvent = hasRecentVarEvent;
exports.snapEntryFor = snapEntryFor;
exports.detectChanges = detectChanges;
exports.emptyEntry = emptyEntry;
exports.detectReminders = detectReminders;
const mapping_1 = require("./mapping");
/** Consecutive polls a red-card count drop must hold before "roja anulada"
 *  is sent. Polls are ≥15 s apart, so 2 polls ≈ 30-120 s — negligible next
 *  to a VAR review, enough to ride out a feed reordering. */
exports.RED_CANCEL_CONFIRM_POLLS = 2;
function latest(events, teamId, pred) {
    if (!events)
        return undefined;
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.team?.id === teamId && pred(e))
            return e;
    }
    return undefined;
}
function goalKindOf(e) {
    if (!e)
        return 'normal';
    if (/own goal/i.test(e.detail))
        return 'own';
    if (/penalty/i.test(e.detail))
        return 'penalty';
    return 'normal';
}
function minuteOf(e, fallback) {
    if (!e?.time?.elapsed)
        return fallback;
    return e.time.elapsed + (e.time.extra ?? 0);
}
/**
 * Is there a VAR event near the current minute? Distinguishes a formal VAR
 * review from a goal the referee disallowed on the spot (clear offside) or a
 * data correction. Six-minute window back from now; without a current minute
 * any VAR event counts (better to attribute in a match that had a review than
 * deny one that just happened).
 */
function hasRecentVarEvent(events, currentMinute) {
    for (const e of events ?? []) {
        if (e.type !== 'Var')
            continue;
        const m = e.time?.elapsed;
        if (currentMinute == null || m == null)
            return true;
        if (currentMinute - m <= 6)
            return true;
    }
    return false;
}
/** Build a snapshot entry from a fixture, carrying state over from `prev`. */
function snapEntryFor(f, prev) {
    const h = f.teams.home.id;
    const a = f.teams.away.id;
    const ev = f.events;
    // Live-feed fixtures always carry events; re-fetched ones may not. When
    // events are missing keep the previous counts so we don't fake decreases.
    const has = Array.isArray(ev);
    const e = {
        st: f.fixture.status.short,
        hs: f.goals.home ?? 0,
        as: f.goals.away ?? 0,
        rh: has ? (0, mapping_1.countBy)(ev, h, mapping_1.isRedCardEvent) : (prev?.rh ?? 0),
        ra: has ? (0, mapping_1.countBy)(ev, a, mapping_1.isRedCardEvent) : (prev?.ra ?? 0),
        yh: has ? (0, mapping_1.countBy)(ev, h, mapping_1.isYellowCardEvent) : (prev?.yh ?? 0),
        ya: has ? (0, mapping_1.countBy)(ev, a, mapping_1.isYellowCardEvent) : (prev?.ya ?? 0),
        sh: has ? (0, mapping_1.countBy)(ev, h, x => x.type === 'subst') : (prev?.sh ?? 0),
        sa: has ? (0, mapping_1.countBy)(ev, a, x => x.type === 'subst') : (prev?.sa ?? 0),
        ph: has ? (0, mapping_1.countBy)(ev, h, mapping_1.isMissedPenaltyEvent) : (prev?.ph ?? 0),
        pa: has ? (0, mapping_1.countBy)(ev, a, mapping_1.isMissedPenaltyEvent) : (prev?.pa ?? 0),
        ts: f.fixture.timestamp,
        f: { ...(prev?.f ?? {}) },
    };
    // Carry the optional bookkeeping (only when set — keeps the snapshot small).
    if (prev?.pp !== undefined)
        e.pp = prev.pp;
    if (prev?.lc)
        e.lc = prev.lc;
    if (prev?.rp)
        e.rp = [...prev.rp];
    if (prev?.rd)
        e.rd = [...prev.rd];
    if (prev?.ft)
        e.ft = prev.ft;
    if (prev?.se)
        e.se = prev.se;
    return e;
}
/**
 * Diff current fixtures against the previous snapshot.
 *
 * @param fixtures  live-feed fixtures + re-fetched fixtures that left the feed
 * @param prev      previous snapshot
 * @param nowSec    clock (injected for tests)
 */
function detectChanges(fixtures, prev, nowSec) {
    const changes = [];
    const next = {};
    for (const f of fixtures) {
        const id = String(f.fixture.id);
        const p = prev[id];
        const cur = snapEntryFor(f, p);
        next[id] = cur;
        const row = (0, mapping_1.mapFixtureToMatch)(f, { nowSec });
        cur.pp = row.popularity;
        const base = {
            matchId: id,
            homeTeam: row.homeTeam,
            awayTeam: row.awayTeam,
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            league: row.league,
            leagueId: row.leagueId,
            leagueCountry: row.leagueCountry,
            popularity: row.popularity,
            minute: row.minute,
            homePenScore: row.homePenScore,
            awayPenScore: row.awayPenScore,
        };
        const push = (c) => changes.push(c);
        const ev = f.events;
        const homeId = f.teams.home.id;
        const awayId = f.teams.away.id;
        // ── First sighting ──────────────────────────────────────────────────────
        if (!p) {
            // Only call it a kickoff if we caught the very start (poller restarts
            // mid-match must not fire "¡Empieza el partido!"). Red cards already on
            // the board are the watermark — never "cancel" a card we didn't send.
            cur.rp = [cur.rh, cur.ra];
            if (cur.st === '1H' && (f.fixture.status.elapsed ?? 0) <= 5) {
                push({ ...base, type: 'matchStart' });
                cur.f.start = true;
            }
            if ((0, mapping_1.isFinishedShort)(cur.st))
                cur.ft = nowSec;
            continue;
        }
        // ── Kickoff ─────────────────────────────────────────────────────────────
        if (!cur.f.start && (p.st === 'NS' || p.st === 'TBD') && cur.st === '1H') {
            push({ ...base, type: 'matchStart' });
            cur.f.start = true;
        }
        // ── Goals / disallowed goals ────────────────────────────────────────────
        const prevTotal = p.hs + p.as;
        const curTotal = cur.hs + cur.as;
        for (const side of ['home', 'away']) {
            const scored = side === 'home' ? cur.hs > p.hs : cur.as > p.as;
            if (!scored)
                continue;
            const teamId = side === 'home' ? homeId : awayId;
            const g = latest(ev, teamId, mapping_1.isScoredGoalEvent);
            const kind = goalKindOf(g);
            push({
                ...base, type: 'goal', side,
                goalKind: kind,
                scorerName: g?.player?.name ?? undefined,
                // Own goals never notify the scorer's followers (owner's rule).
                playerId: kind !== 'own' ? (g?.player?.id ?? undefined) : undefined,
                minute: minuteOf(g, row.minute),
            });
        }
        if (curTotal < prevTotal) {
            const side = cur.hs < p.hs ? 'home' : 'away';
            push({ ...base, type: 'goalCancelled', side, varConfirmed: hasRecentVarEvent(ev, row.minute) });
        }
        // ── Phase transitions (latched so status flaps can't re-fire) ───────────
        if (p.st === '1H' && cur.st === 'HT' && !cur.f.ht) {
            push({ ...base, type: 'halftime' });
            cur.f.ht = true;
        }
        if (p.st === 'HT' && cur.st === '2H' && !cur.f.h2) {
            push({ ...base, type: 'secondHalfStart' });
            cur.f.h2 = true;
        }
        if (cur.st === 'ET' && p.st !== 'ET' && !cur.f.et) {
            push({ ...base, type: 'extraTimeStart' });
            cur.f.et = true;
        }
        if (cur.st === 'P' && p.st !== 'P' && !cur.f.pen) {
            push({ ...base, type: 'penaltiesStart' });
            cur.f.pen = true;
        }
        if ((0, mapping_1.isPlayingShort)(p.st) && (cur.st === 'SUSP' || cur.st === 'INT' || cur.st === 'ABD') && !cur.f.susp) {
            push({ ...base, type: 'matchSuspended' });
            cur.f.susp = true;
        }
        // ── Full time (+ Modo Rival result) ─────────────────────────────────────
        // Only a real final status counts (FT/AET/PEN/AWD/WO) and only for a match
        // we saw in play — never a "Final del partido" for one that didn't start.
        if (((0, mapping_1.isLiveShort)(p.st) || p.st === 'SUSP' || p.st === 'INT') && (0, mapping_1.isFinishedShort)(cur.st) && !cur.f.end) {
            push({ ...base, type: 'matchEnd', minute: null });
            cur.f.end = true;
            cur.ft = nowSec;
            if (!cur.f.rival && cur.hs !== cur.as && cur.st !== 'AWD' && cur.st !== 'WO') {
                const homeLost = cur.hs < cur.as;
                const margin = Math.abs(cur.hs - cur.as);
                push({ ...base, type: margin >= 4 ? 'rivalBigLoss' : 'rivalLoss', side: homeLost ? 'home' : 'away', minute: null });
                cur.f.rival = true;
            }
            // Draw on goals decided on penalties → the shootout loser gets the rival push.
            if (!cur.f.rival && cur.st === 'PEN' && row.homePenScore != null && row.awayPenScore != null &&
                row.homePenScore !== row.awayPenScore) {
                push({ ...base, type: 'rivalLoss', side: row.homePenScore < row.awayPenScore ? 'home' : 'away', minute: null });
                cur.f.rival = true;
            }
        }
        else if ((0, mapping_1.isFinishedShort)(cur.st) && !cur.ft) {
            cur.ft = nowSec;
        }
        // ── Count-based events ──────────────────────────────────────────────────
        if (!Array.isArray(ev))
            continue;
        const rp = cur.rp ?? [p.rh, p.ra];
        const rd = cur.rd ?? [0, 0];
        for (const side of ['home', 'away']) {
            const i = side === 'home' ? 0 : 1;
            const teamId = side === 'home' ? homeId : awayId;
            // Red cards (+ Modo Rival + followed player)
            const red = side === 'home' ? [p.rh, cur.rh] : [p.ra, cur.ra];
            if (red[1] > red[0] && red[1] > rp[i]) {
                const e = latest(ev, teamId, mapping_1.isRedCardEvent);
                const c = {
                    ...base, side,
                    playerName: e?.player?.name ?? undefined,
                    playerId: e?.player?.id ?? undefined,
                    minute: minuteOf(e, row.minute),
                    homeRedCards: cur.rh, awayRedCards: cur.ra,
                };
                push({ ...c, type: 'redCard' });
                push({ ...c, type: 'rivalRedCard', playerId: undefined });
                rp[i] = red[1];
                rd[i] = 0;
            }
            // Red card revoked: the count must stay below what we notified for
            // RED_CANCEL_CONFIRM_POLLS consecutive polls.
            const count = side === 'home' ? cur.rh : cur.ra;
            if (count >= rp[i]) {
                rd[i] = 0;
            }
            else {
                rd[i] += 1;
                if (rd[i] >= exports.RED_CANCEL_CONFIRM_POLLS) {
                    push({ ...base, type: 'redCardCancelled', side });
                    rp[i] = count;
                    rd[i] = 0;
                }
            }
            const yel = side === 'home' ? [p.yh, cur.yh] : [p.ya, cur.ya];
            if (yel[1] > yel[0]) {
                const e = latest(ev, teamId, mapping_1.isYellowCardEvent);
                push({ ...base, type: 'yellowCard', side, playerName: e?.player?.name ?? undefined, minute: minuteOf(e, row.minute) });
            }
            const sub = side === 'home' ? [p.sh, cur.sh] : [p.sa, cur.sa];
            if (sub[1] > sub[0]) {
                const e = latest(ev, teamId, x => x.type === 'subst');
                // API-Sports: player = OFF, assist = ON.
                push({
                    ...base, type: 'substitution', side,
                    playerName: e?.player?.name ?? undefined,
                    relatedPlayerName: e?.assist?.name ?? undefined,
                    minute: minuteOf(e, row.minute),
                });
            }
            const pm = side === 'home' ? [p.ph, cur.ph] : [p.pa, cur.pa];
            if (pm[1] > pm[0]) {
                const e = latest(ev, teamId, mapping_1.isMissedPenaltyEvent);
                push({ ...base, type: 'rivalPenMiss', side, playerName: e?.player?.name ?? undefined, minute: minuteOf(e, row.minute) });
            }
        }
        cur.rp = rp;
        if (rd[0] || rd[1])
            cur.rd = rd;
        else
            delete cur.rd;
    }
    return { changes, next };
}
function emptyEntry(ts, pp) {
    return { st: 'NS', hs: 0, as: 0, rh: 0, ra: 0, yh: 0, ya: 0, sh: 0, sa: 0, ph: 0, pa: 0, ts, pp, f: {} };
}
/**
 * Pre-match reminders (~15 min before kickoff). Creates/updates snapshot
 * entries for upcoming matches so the later NS → 1H transition is a proper
 * kickoff and the reminder latch survives across polls.
 */
function detectReminders(upcoming, snap, nowSec) {
    const out = [];
    for (const m of upcoming) {
        const mins = (m.timestamp - nowSec) / 60;
        if (mins <= 0 || mins > 16)
            continue;
        const e = snap[m.id] ?? emptyEntry(m.timestamp, m.popularity);
        snap[m.id] = e;
        if (e.f.rem)
            continue;
        e.f.rem = true;
        out.push({
            type: 'matchReminder', matchId: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
            homeScore: 0, awayScore: 0, league: m.league, leagueId: m.leagueId,
            leagueCountry: m.leagueCountry, popularity: m.popularity,
        });
    }
    return out;
}
//# sourceMappingURL=live-detect.js.map