"use strict";
/**
 * football/on-demand-mapping.ts
 *
 * API-Sports → on-demand Firestore document mappers (shapes in
 * shared/football/model.ts). Pure functions — no I/O — so they can be tested
 * against recorded API responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapVenue = mapVenue;
exports.toFixtureLite = toFixtureLite;
exports.capFixtures = capFixtures;
exports.mapH2H = mapH2H;
exports.absenceType = absenceType;
exports.mapAbsences = mapAbsences;
exports.mapPrediction = mapPrediction;
exports.mapForm = mapForm;
exports.mapSquad = mapSquad;
exports.pickCurrentCoach = pickCurrentCoach;
exports.mapTeamLeagues = mapTeamLeagues;
exports.pickPrimaryLeague = pickPrimaryLeague;
exports.mapTeam = mapTeam;
exports.mapTeamStats = mapTeamStats;
exports.mapPlayerStat = mapPlayerStat;
exports.looksNationalTeam = looksNationalTeam;
exports.mapPlayer = mapPlayer;
exports.mapCoach = mapCoach;
exports.mapLeague = mapLeague;
exports.mapSearchTeams = mapSearchTeams;
exports.mapSearchPlayers = mapSearchPlayers;
exports.fullPlayerName = fullPlayerName;
const leagues_1 = require("../shared/football/leagues");
const mapping_1 = require("./mapping");
// ── Small helpers ────────────────────────────────────────────────────────────
function n(v) {
    if (typeof v === 'number')
        return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
        const x = parseFloat(v.replace('%', ''));
        return Number.isFinite(x) ? x : 0;
    }
    return 0;
}
function intOrNull(v) {
    if (v === null || v === undefined || v === '')
        return null;
    const x = parseInt(String(v), 10);
    return Number.isFinite(x) ? x : null;
}
function ref(t, code) {
    const name = t.name ?? '';
    return { id: String(t.id ?? ''), name, shortName: code || (0, mapping_1.deriveShortName)(name), logo: t.logo ?? '' };
}
function mapVenue(v) {
    if (!v || !v.id || !v.name)
        return null;
    return {
        id: v.id,
        name: v.name,
        city: v.city ?? null,
        country: v.country ?? null,
        address: v.address ?? null,
        capacity: v.capacity ?? null,
        surface: v.surface ?? null,
        image: v.image ?? null,
    };
}
// ── Slim fixtures (calendars) ────────────────────────────────────────────────
function toFixtureLite(f, withLeague) {
    const short = f.fixture.status.short;
    const played = f.goals.home !== null && f.goals.away !== null;
    const row = {
        id: String(f.fixture.id),
        timestamp: f.fixture.timestamp,
        statusShort: short,
        round: f.league.round ?? null,
        homeId: String(f.teams.home.id),
        homeName: f.teams.home.name,
        awayId: String(f.teams.away.id),
        awayName: f.teams.away.name,
        homeScore: played ? f.goals.home : null,
        awayScore: played ? f.goals.away : null,
    };
    if (f.score.penalty.home !== null && f.score.penalty.away !== null) {
        row.homePen = f.score.penalty.home;
        row.awayPen = f.score.penalty.away;
    }
    if (f.fixture.status.elapsed != null && !(0, mapping_1.isFinishedShort)(short) && played)
        row.minute = f.fixture.status.elapsed;
    if (f.fixture.venue?.id)
        row.venueId = f.fixture.venue.id;
    if (f.fixture.venue?.name)
        row.venueName = f.fixture.venue.name;
    if (f.fixture.venue?.city)
        row.venueCity = f.fixture.venue.city;
    if (f.teams.home.winner === true)
        row.winner = 'home';
    else if (f.teams.away.winner === true)
        row.winner = 'away';
    if (withLeague) {
        row.leagueId = String(f.league.id);
        row.league = f.league.name;
        row.season = f.league.season;
    }
    return row;
}
/**
 * Sort chronologically and, when a season is too large for one document
 * (catch-all friendlies competitions), keep the `max` fixtures nearest to now.
 */
function capFixtures(rows, max, nowSec) {
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    if (sorted.length <= max)
        return { rows: sorted, truncated: false };
    const byDistance = [...sorted].sort((a, b) => Math.abs(a.timestamp - nowSec) - Math.abs(b.timestamp - nowSec));
    const keep = new Set(byDistance.slice(0, max).map(r => r.id));
    return { rows: sorted.filter(r => keep.has(r.id)), truncated: true };
}
// ── Match preview ────────────────────────────────────────────────────────────
function mapH2H(list, excludeFixtureId) {
    return (list ?? [])
        .filter(f => f.fixture.id !== excludeFixtureId && (0, mapping_1.isFinishedShort)(f.fixture.status.short))
        .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
        .slice(0, 10)
        .map(f => ({
        matchId: String(f.fixture.id),
        timestamp: f.fixture.timestamp,
        homeTeam: ref(f.teams.home),
        awayTeam: ref(f.teams.away),
        homeScore: f.goals.home ?? 0,
        awayScore: f.goals.away ?? 0,
        leagueId: String(f.league.id),
        league: f.league.name,
        round: f.league.round ?? null,
        venueName: f.fixture.venue?.name ?? null,
    }));
}
function absenceType(type, reason) {
    const r = (reason ?? '').toLowerCase();
    if (/suspen|red card|yellow card|cards/.test(r))
        return 'suspension';
    if (/national|international|selection/.test(r))
        return 'international';
    if (/questionable|doubt/.test((type ?? '').toLowerCase()))
        return 'doubtful';
    if (/injur|knock|illness|ill\b|sick|muscle|knee|ankle|hamstring|groin|thigh|calf|foot|back|shoulder|broken|fracture|surgery|strain|sprain|concussion|virus|fitness|achilles|ligament|hip|wrist|hand|head|rib|toe|leg|arm|elbow|tendon|hernia/.test(r))
        return 'injury';
    return 'other';
}
function mapAbsences(list, homeId) {
    const out = { home: [], away: [] };
    const seen = new Set();
    for (const e of list) {
        if (!e.player?.id || seen.has(e.player.id))
            continue;
        seen.add(e.player.id);
        const row = {
            playerId: String(e.player.id),
            name: e.player.name,
            photo: e.player.photo ?? '',
            type: absenceType(e.player.type, e.player.reason),
            reason: e.player.reason ?? e.player.type ?? '',
        };
        (e.team.id === homeId ? out.home : out.away).push(row);
    }
    return out;
}
function mapPrediction(p) {
    if (!p?.predictions)
        return null;
    const pr = p.predictions;
    const pct = pr.percent;
    if (!pct || (pct.home == null && pct.draw == null && pct.away == null))
        return null;
    const pair = (x) => ({ home: n(x?.home), away: n(x?.away) });
    const c = p.comparison;
    return {
        percent: { home: n(pct.home), draw: n(pct.draw), away: n(pct.away) },
        advice: pr.advice ?? null,
        winnerTeamId: pr.winner?.id ? String(pr.winner.id) : null,
        winOrDraw: pr.win_or_draw ?? null,
        underOver: pr.under_over ?? null,
        goalsHome: pr.goals?.home ?? null,
        goalsAway: pr.goals?.away ?? null,
        comparison: c ? {
            form: pair(c.form), attack: pair(c.att), defense: pair(c.def), poisson: pair(c.poisson_distribution),
            h2h: pair(c.h2h), goals: pair(c.goals), total: pair(c.total),
        } : null,
    };
}
/** Last finished matches of `teamId`, newest first. */
function mapForm(list, teamId, max = 5) {
    return list
        .filter(f => (0, mapping_1.isFinishedShort)(f.fixture.status.short) && f.goals.home !== null && f.goals.away !== null)
        .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
        .slice(0, max)
        .map(f => {
        const isHome = f.teams.home.id === teamId;
        const gf = (isHome ? f.goals.home : f.goals.away) ?? 0;
        const ga = (isHome ? f.goals.away : f.goals.home) ?? 0;
        // Shootout / extra-time winners count as wins even when goals are level.
        const flagged = isHome ? f.teams.home.winner : f.teams.away.winner;
        const result = gf > ga ? 'W' : gf < ga ? 'L' : flagged === true ? 'W' : flagged === false ? 'L' : 'D';
        return {
            matchId: String(f.fixture.id),
            timestamp: f.fixture.timestamp,
            opponent: ref(isHome ? f.teams.away : f.teams.home),
            isHome,
            goalsFor: gf,
            goalsAgainst: ga,
            result,
            league: f.league.name,
        };
    });
}
// ── Team ─────────────────────────────────────────────────────────────────────
const SQUAD_POSITION = {
    goalkeeper: 'POR', defender: 'DEF', midfielder: 'MED', attacker: 'DEL',
};
function mapSquad(entry) {
    const order = { POR: 0, DEF: 1, MED: 2, DEL: 3, JUG: 4 };
    return (entry?.players ?? [])
        .map(p => ({
        id: String(p.id),
        name: p.name,
        age: p.age ?? null,
        number: p.number ?? null,
        position: SQUAD_POSITION[(p.position ?? '').toLowerCase()] ?? 'JUG',
        photo: p.photo ?? '',
    }))
        .sort((a, b) => order[a.position] - order[b.position] || (a.number ?? 999) - (b.number ?? 999));
}
/**
 * The coach currently in charge of `teamId`. `/coachs?team=` returns everyone
 * who ever had a stint there; old stints sometimes keep `end: null`, so the
 * open stint with the latest start wins.
 */
function pickCurrentCoach(list, teamId) {
    let best = null;
    for (const c of list) {
        for (const job of c.career ?? []) {
            if (job.team?.id !== teamId || job.end !== null)
                continue;
            const start = job.start ?? '';
            if (!best || start > best.start)
                best = { c, start };
        }
    }
    const c = best?.c ?? list.find(x => x.team?.id === teamId);
    if (!c)
        return null;
    return { id: String(c.id), name: c.name, photo: c.photo ?? null, age: c.age ?? null, nationality: c.nationality ?? null };
}
/** Competitions whose current season is still running (or ended < 60 days ago). */
function mapTeamLeagues(list, nowMs) {
    const cutoff = new Date(nowMs - 60 * 86_400_000).toISOString().slice(0, 10);
    const out = [];
    for (const x of list) {
        const cur = x.seasons?.find(s => s.current);
        if (!cur || cur.end < cutoff)
            continue;
        out.push({
            leagueId: String(x.league.id), name: x.league.name, type: x.league.type,
            country: x.country.name, logo: x.league.logo, season: cur.year,
        });
    }
    return out.sort((a, b) => (0, leagues_1.getLeaguePopularity)(b.leagueId, undefined, { name: b.name, country: b.country, type: b.type }) -
        (0, leagues_1.getLeaguePopularity)(a.leagueId, undefined, { name: a.name, country: a.country, type: a.type }));
}
const FRIENDLY_RE = /friendl|amistos/i;
/** The competition that defines a team's table and calendar. */
function pickPrimaryLeague(leagues, teamCountry, national) {
    const real = leagues.filter(l => !FRIENDLY_RE.test(l.name));
    if (!real.length)
        return leagues[0] ?? null;
    if (national)
        return real[0]; // already sorted by popularity (World Cup, continental cup, qualifiers…)
    const domestic = real.filter(l => l.type === 'League' && (!teamCountry || l.country === teamCountry));
    return domestic[0] ?? real.find(l => l.type === 'League') ?? real[0];
}
function mapTeam(entry, squad, coaches, leagues, nowMs) {
    const t = entry.team;
    const teamLeagues = mapTeamLeagues(leagues, nowMs);
    const primary = pickPrimaryLeague(teamLeagues, t.country, !!t.national);
    return {
        id: String(t.id),
        name: t.name,
        shortName: t.code || (0, mapping_1.deriveShortName)(t.name),
        logo: t.logo,
        country: t.country ?? null,
        founded: t.founded ?? null,
        national: !!t.national,
        // National teams have no home ground — API-Sports returns whichever
        // stadium hosted them last, which reads as wrong on a team page.
        venue: t.national ? null : mapVenue(entry.venue),
        coach: pickCurrentCoach(coaches, t.id),
        squad: mapSquad(squad),
        leagues: teamLeagues,
        primaryLeagueId: primary?.leagueId ?? null,
        primaryLeagueName: primary?.name ?? null,
        season: primary?.season ?? null,
    };
}
function hat(x) {
    return { home: n(x?.home), away: n(x?.away), total: n(x?.total) };
}
function buckets(m) {
    return Object.entries(m ?? {})
        .map(([label, v]) => ({ label, total: v?.total ?? 0, percentage: n(v?.percentage) }))
        .filter(b => !(b.label.startsWith('9') || b.label.startsWith('10')) || b.total > 0); // drop empty extra-time buckets
}
function mapTeamStats(s) {
    return {
        teamId: String(s.team.id),
        leagueId: String(s.league.id),
        season: s.league.season,
        form: s.form ?? '',
        played: hat(s.fixtures?.played),
        wins: hat(s.fixtures?.wins),
        draws: hat(s.fixtures?.draws),
        losses: hat(s.fixtures?.loses),
        goalsFor: hat(s.goals?.for?.total),
        goalsAgainst: hat(s.goals?.against?.total),
        goalsForAvg: hat(s.goals?.for?.average),
        goalsAgainstAvg: hat(s.goals?.against?.average),
        goalsForByMinute: buckets(s.goals?.for?.minute),
        goalsAgainstByMinute: buckets(s.goals?.against?.minute),
        cleanSheets: hat(s.clean_sheet),
        failedToScore: hat(s.failed_to_score),
        penalties: {
            scored: s.penalty?.scored?.total ?? 0,
            missed: s.penalty?.missed?.total ?? 0,
            total: s.penalty?.total ?? 0,
        },
        biggest: {
            winHome: s.biggest?.wins?.home ?? null,
            winAway: s.biggest?.wins?.away ?? null,
            lossHome: s.biggest?.loses?.home ?? null,
            lossAway: s.biggest?.loses?.away ?? null,
            streakWins: s.biggest?.streak?.wins ?? 0,
            streakDraws: s.biggest?.streak?.draws ?? 0,
            streakLosses: s.biggest?.streak?.loses ?? 0,
        },
        formations: (s.lineups ?? []).map(l => ({ formation: l.formation, played: l.played })),
        yellowByMinute: buckets(s.cards?.yellow),
        redByMinute: buckets(s.cards?.red),
    };
}
// ── Player ───────────────────────────────────────────────────────────────────
function mapPlayerStat(b) {
    if (!b.league?.id || !b.team?.id || !b.league.season)
        return null;
    const rating = b.games?.rating ? parseFloat(b.games.rating) : NaN;
    return {
        season: b.league.season,
        leagueId: String(b.league.id),
        league: b.league.name ?? '',
        leagueLogo: b.league.logo ?? '',
        teamId: String(b.team.id),
        team: b.team.name ?? '',
        teamLogo: b.team.logo ?? '',
        number: b.games?.number ?? null,
        position: b.games?.position ?? null,
        captain: !!b.games?.captain,
        appearances: b.games?.appearences ?? 0,
        lineups: b.games?.lineups ?? 0,
        minutes: b.games?.minutes ?? 0,
        rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 100) / 100 : null,
        subIn: b.substitutes?.in ?? 0,
        subOut: b.substitutes?.out ?? 0,
        bench: b.substitutes?.bench ?? 0,
        goals: b.goals?.total ?? 0,
        assists: b.goals?.assists ?? 0,
        conceded: b.goals?.conceded ?? 0,
        saves: b.goals?.saves ?? 0,
        shots: b.shots?.total ?? 0,
        shotsOn: b.shots?.on ?? 0,
        passes: b.passes?.total ?? 0,
        keyPasses: b.passes?.key ?? 0,
        passAccuracy: n(b.passes?.accuracy),
        tackles: b.tackles?.total ?? 0,
        blocks: b.tackles?.blocks ?? 0,
        interceptions: b.tackles?.interceptions ?? 0,
        duels: b.duels?.total ?? 0,
        duelsWon: b.duels?.won ?? 0,
        dribbles: b.dribbles?.attempts ?? 0,
        dribblesWon: b.dribbles?.success ?? 0,
        foulsDrawn: b.fouls?.drawn ?? 0,
        foulsCommitted: b.fouls?.committed ?? 0,
        yellow: b.cards?.yellow ?? 0,
        yellowRed: b.cards?.yellowred ?? 0,
        red: b.cards?.red ?? 0,
        penWon: b.penalty?.won ?? 0,
        penScored: b.penalty?.scored ?? 0,
        penMissed: b.penalty?.missed ?? 0,
        penSaved: b.penalty?.saved ?? 0,
    };
}
/** A team that represents a country (senior or youth side). */
function looksNationalTeam(teamName, nationality) {
    if (!nationality)
        return false;
    const a = teamName.trim().toLowerCase();
    const b = nationality.trim().toLowerCase();
    return a === b || a.startsWith(b + ' u') || a.startsWith(b + ' olympic') || a.startsWith(b + ' w');
}
function mapPlayer(seasons, profile, teams, seasonsLoaded) {
    const p = seasons.find(s => s.player)?.player ?? profile;
    if (!p)
        return null;
    const stats = [];
    for (const s of seasons)
        for (const b of s.statistics ?? []) {
            const row = mapPlayerStat(b);
            if (row)
                stats.push(row);
        }
    stats.sort((a, b) => b.season - a.season || b.appearances - a.appearances || b.minutes - a.minutes);
    const career = teams.map(t => ({
        teamId: String(t.team.id), team: t.team.name, teamLogo: t.team.logo,
        seasons: [...(t.seasons ?? [])].sort((a, b) => b - a),
    }));
    const nationality = p.nationality ?? null;
    const latest = (c) => c.seasons[0] ?? 0;
    const clubs = career.filter(c => !looksNationalTeam(c.team, nationality) && c.seasons.length > 0);
    const nationals = career.filter(c => c.team.trim().toLowerCase() === (nationality ?? '').trim().toLowerCase());
    // Current club: the non-national team of the newest season; ties broken by
    // minutes played there this season (loans / mid-season transfers).
    const minutesAt = (teamId, season) => stats.filter(s => s.teamId === teamId && s.season === season).reduce((sum, s) => sum + s.minutes, 0);
    const newestClubSeason = Math.max(0, ...clubs.map(latest));
    const currentClub = clubs
        .filter(c => latest(c) === newestClubSeason)
        .sort((a, b) => minutesAt(b.teamId, newestClubSeason) - minutesAt(a.teamId, newestClubSeason))[0];
    const clubStat = currentClub ? stats.find(s => s.teamId === currentClub.teamId) : stats[0];
    const toRef = (c) => c ? { id: c.teamId, name: c.team, shortName: (0, mapping_1.deriveShortName)(c.team), logo: c.teamLogo } : null;
    return {
        id: String(p.id),
        name: p.name,
        firstName: p.firstname ?? '',
        lastName: p.lastname ?? '',
        photo: p.photo ?? '',
        age: p.age ?? null,
        birthDate: p.birth?.date ?? null,
        birthPlace: p.birth?.place ?? null,
        birthCountry: p.birth?.country ?? null,
        nationality,
        heightCm: intOrNull(p.height),
        weightKg: intOrNull(p.weight),
        injured: !!p.injured,
        position: clubStat?.position ?? p.position ?? stats[0]?.position ?? null,
        number: clubStat?.number ?? p.number ?? null,
        currentTeam: toRef(currentClub),
        nationalTeam: toRef(nationals[0]),
        stats,
        seasonsLoaded: [...seasonsLoaded].sort((a, b) => b - a),
        career,
    };
}
function mapCoach(c) {
    const career = (c.career ?? [])
        .filter(j => j.team?.id)
        .map(j => ({ team: ref(j.team), start: j.start ?? null, end: j.end ?? null }))
        .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
    return {
        id: String(c.id),
        name: c.name,
        firstName: c.firstname ?? '',
        lastName: c.lastname ?? '',
        photo: c.photo ?? null,
        age: c.age ?? null,
        birthDate: c.birth?.date ?? null,
        birthPlace: c.birth?.place ?? null,
        birthCountry: c.birth?.country ?? null,
        nationality: c.nationality ?? null,
        team: c.team?.id ? ref(c.team) : null,
        career,
    };
}
// ── League ───────────────────────────────────────────────────────────────────
function mapLeague(x) {
    return {
        id: String(x.league.id),
        name: x.league.name,
        type: x.league.type,
        country: x.country.name,
        logo: x.league.logo,
        flag: x.country.flag ?? null,
        seasons: [...(x.seasons ?? [])]
            .sort((a, b) => b.year - a.year)
            .map(s => ({ year: s.year, start: s.start, end: s.end, current: !!s.current, standings: !!s.coverage?.standings })),
    };
}
// ── Search ───────────────────────────────────────────────────────────────────
function mapSearchTeams(list, max = 25) {
    return list.slice(0, max).map(e => ({
        id: String(e.team.id),
        name: e.team.name,
        shortName: e.team.code || (0, mapping_1.deriveShortName)(e.team.name),
        logo: e.team.logo,
        country: e.team.country ?? null,
        national: !!e.team.national,
    }));
}
function mapSearchPlayers(list, max = 30) {
    return list.slice(0, max).map(e => ({
        id: String(e.player.id),
        name: fullPlayerName(e.player),
        photo: e.player.photo ?? '',
        nationality: e.player.nationality ?? null,
        position: e.player.position ?? null,
        age: e.player.age ?? null,
    }));
}
/** "Luis Malagón" from firstname "Luis Ángel" + lastname "Malagón Velázquez" (API `name` is "L. Malagón"). */
function fullPlayerName(p) {
    const first = (p.firstname ?? '').trim().split(/\s+/)[0] ?? '';
    const last = (p.lastname ?? '').trim().split(/\s+/)[0] ?? '';
    const abbreviated = /^[A-ZÀ-Ý]\.\s/.test(p.name ?? '');
    if (!abbreviated || !first || !last)
        return p.name ?? `${first} ${last}`.trim();
    // Keep the display surname from `name` (it handles "de Bruyne", "van Dijk").
    const surname = p.name.replace(/^[A-ZÀ-Ý]\.\s+/, '');
    return `${first} ${surname}`.trim();
}
//# sourceMappingURL=on-demand-mapping.js.map