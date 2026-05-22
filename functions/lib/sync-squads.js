"use strict";
/**
 * sync-squads.ts
 *
 * Cloud Function: syncs the full roster for every team in every configured
 * league. Writes one `squads/{seasonId}_{teamId}` doc per (season, team)
 * combination. Replaces the per-user fetchSquad calls from useTeamDetail.
 *
 * Trade-off: SportMonks doesn't expose a "/squads/seasons/{seasonId}"
 * endpoint that returns ALL teams' squads at once, so we have to call
 * `/squads/seasons/{seasonId}/teams/{teamId}` per team. ~51 leagues ×
 * ~20-50 teams = ~1000-2500 SM calls per run. We run this daily, NOT
 * hourly, to keep the cost reasonable (~1.4% of the Pro plan/day).
 *
 * Schedule: every 24h. Squads change on transfer windows (twice a year
 * primarily, plus loans), so daily is overkill but keeps the lag short.
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
exports.syncSquadsHandler = syncSquadsHandler;
const admin_init_1 = require("./admin-init");
const logger = __importStar(require("firebase-functions/logger"));
const config_1 = require("./config");
const sportmonks_1 = require("./sportmonks");
const SLEEP_BETWEEN_TEAMS_MS = 250;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function mapPlayerToDoc(sp) {
    // Find current club (non-national, active membership). Used to render
    // "current club" next to a national-team player on TeamDetailScreen.
    const todayStr = new Date().toISOString().slice(0, 10);
    const clubMembership = sp.player?.teams?.find(mt => (!mt.end || mt.end > todayStr) && mt.team && mt.team.type !== 'national');
    return {
        id: sp.id,
        playerId: sp.player_id,
        name: sp.player?.name ?? '',
        displayName: sp.player?.display_name || sp.player?.common_name || sp.player?.name || '',
        number: sp.jersey_number,
        positionId: sp.position_id,
        dateOfBirth: sp.player?.date_of_birth ?? '',
        image: sp.player?.image_path ?? '',
        isCaptain: sp.captain,
        clubName: clubMembership?.team?.name ?? '',
        clubLogo: clubMembership?.team?.image_path ?? '',
    };
}
async function syncSquadsHandler() {
    logger.info(`📋 syncSquads: starting for ${config_1.LEAGUES.length} leagues`);
    let totalSquads = 0;
    let totalPlayers = 0;
    let teamErrors = 0;
    for (const league of config_1.LEAGUES) {
        const seasonId = league.currentSeasonId;
        if (seasonId == null)
            continue;
        let teams;
        try {
            teams = await (0, sportmonks_1.fetchTeamsForSeason)(seasonId);
        }
        catch (err) {
            logger.error(`  ✗ ${league.name}: failed to list teams`, err);
            continue;
        }
        if (teams.length === 0)
            continue;
        logger.info(`  ▸ ${league.name}: ${teams.length} teams`);
        for (const team of teams) {
            try {
                const players = await (0, sportmonks_1.fetchSquadForSeasonAndTeam)(seasonId, team.id);
                if (players.length === 0)
                    continue;
                const doc = {
                    seasonId,
                    teamId: team.id,
                    players: players
                        .filter(p => p.player)
                        .map(mapPlayerToDoc)
                        .sort((a, b) => a.positionId - b.positionId || a.number - b.number),
                    updatedAt: admin_init_1.admin.firestore.Timestamp.now(),
                };
                const docId = `${seasonId}_${team.id}`;
                await admin_init_1.db.collection('squads').doc(docId).set(doc, { merge: true });
                totalSquads++;
                totalPlayers += doc.players.length;
                await sleep(SLEEP_BETWEEN_TEAMS_MS);
            }
            catch (err) {
                teamErrors++;
                logger.error(`    ✗ ${team.name} (id ${team.id}):`, err);
            }
        }
    }
    logger.info(`✅ syncSquads: wrote ${totalSquads} squads (${totalPlayers} players); ${teamErrors} team errors`);
}
//# sourceMappingURL=sync-squads.js.map