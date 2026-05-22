"use strict";
/**
 * sync-teams.ts
 *
 * Cloud Function: syncs full team info for every team that plays in any of
 * the 51 configured leagues. Writes one `teams/{teamId}` doc per team with
 * enough detail to power TeamDetailScreen without any client-side
 * SportMonks calls.
 *
 * Architecture rationale: previously `useTeamDetail` hit the SportMonks
 * proxy three times per team-page open (fetchTeamById + fetchSquad +
 * fetchTeamRecentFixtures). With ~15k users that scales linearly into the
 * API quota. This function pulls the data once per day per league and
 * serves every user from Firestore.
 *
 * Schedule: every 24h. Team info (stadium, coach, founded year) changes on
 * a weekly-to-yearly timescale, so daily is generous.
 *
 * Cost: 51 leagues × 1 call/league (single page typically holds all teams
 * including pagination) ≈ 60-100 SM calls/day. ~0.1% of the Pro plan.
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
exports.syncTeamsHandler = syncTeamsHandler;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const config_1 = require("./config");
const sportmonks_1 = require("./sportmonks");
const SLEEP_BETWEEN_LEAGUES_MS = 500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/**
 * Pull the active coach (or fall back to the first listed) and derive their
 * display fields. Mirrors the client's existing useTeamDetail logic so a
 * page rendered from Firestore looks identical to one fetched from the
 * proxy.
 */
function pickCoach(team) {
    const coaches = team.coaches ?? [];
    const active = coaches.find(c => c.active !== false) ?? coaches[0] ?? null;
    if (!active)
        return { name: '', image: '', age: 0 };
    const name = active.display_name || active.common_name || active.name || '';
    const image = active.image_path ?? '';
    let age = 0;
    if (active.date_of_birth) {
        const birth = new Date(active.date_of_birth);
        if (!isNaN(birth.getTime())) {
            const now = new Date();
            age = now.getFullYear() - birth.getFullYear();
            if (now.getMonth() < birth.getMonth() ||
                (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
                age--;
            }
        }
    }
    return { name, image, age };
}
function mapTeamToDoc(team, leagueId, leagueName, seasonId) {
    const coach = pickCoach(team);
    // For World Cup national teams SM often returns a club venue (e.g. the
    // Mexico fed page shows Soldier Field Chicago). Clear venue for league 732
    // so the client doesn't need its existing isWCNationalTeam hack later.
    const isWcNational = leagueId === 732;
    return {
        id: String(team.id),
        name: team.name,
        shortName: team.short_code || team.name.slice(0, 3).toUpperCase(),
        logo: team.image_path ?? '',
        country: '', // SM doesn't include country name on the team payload — left blank
        founded: team.founded ?? 0,
        venueName: isWcNational ? '' : (team.venue?.name ?? ''),
        venueCity: isWcNational ? '' : (team.venue?.city_name ?? ''),
        venueCapacity: isWcNational ? 0 : (team.venue?.capacity ?? 0),
        venueImage: isWcNational ? '' : (team.venue?.image_path ?? ''),
        coachName: coach.name,
        coachImage: coach.image,
        coachAge: coach.age,
        leagueId,
        leagueName,
        currentSeasonId: seasonId,
        updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
    };
}
async function syncTeamsHandler() {
    logger.info(`👥 syncTeams: starting for ${config_1.LEAGUES.length} leagues`);
    let totalTeams = 0;
    let leagueErrors = 0;
    for (const league of config_1.LEAGUES) {
        const seasonId = league.currentSeasonId;
        if (seasonId == null) {
            logger.debug(`👥 syncTeams: skipping ${league.name} — no currentSeasonId`);
            continue;
        }
        try {
            const teams = await (0, sportmonks_1.fetchTeamsForSeason)(seasonId);
            if (teams.length === 0) {
                logger.warn(`👥 syncTeams: 0 teams for ${league.name} (season ${seasonId})`);
                continue;
            }
            // Batch write. Firestore caps at 500 ops per batch — most leagues
            // (~20-50 teams) fit in one, but the safety check is here anyway.
            const batches = [];
            let current = admin_init_1.db.batch();
            let opCount = 0;
            for (const team of teams) {
                const doc = mapTeamToDoc(team, league.id, league.name, seasonId);
                const ref = admin_init_1.db.collection('teams').doc(doc.id);
                // `merge: true` is intentional — preserves overrides from other
                // sync paths (e.g. a future syncTeamSocial function adding twitter/
                // instagram handles without us re-fetching from SM).
                current.set(ref, doc, { merge: true });
                opCount++;
                if (opCount >= 499) {
                    batches.push(current);
                    current = admin_init_1.db.batch();
                    opCount = 0;
                }
            }
            if (opCount > 0)
                batches.push(current);
            await Promise.all(batches.map(b => b.commit()));
            totalTeams += teams.length;
            logger.info(`  ✓ ${league.name}: ${teams.length} teams`);
            await sleep(SLEEP_BETWEEN_LEAGUES_MS); // rate-limit courtesy
        }
        catch (err) {
            leagueErrors++;
            logger.error(`  ✗ ${league.name} (season ${league.currentSeasonId}):`, err);
        }
    }
    logger.info(`✅ syncTeams: wrote ${totalTeams} teams across ${config_1.LEAGUES.length - leagueErrors} leagues (${leagueErrors} errors)`);
}
//# sourceMappingURL=sync-teams.js.map