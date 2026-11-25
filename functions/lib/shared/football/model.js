"use strict";
/**
 * shared/football/model.ts
 *
 * Firestore document shapes written by the API-Sports backend and read by the
 * app (and later the website). This is the contract between the two — the
 * backend normalizes API-Sports into these shapes so clients never see raw
 * provider payloads, never call the provider directly, and never need a key.
 *
 * Collections (all public-read, server-write):
 *   fb_matches/{fixtureId}          FbMatchDoc        — list rows, live scores
 *   fb_match_details/{fixtureId}    FbMatchDetailDoc  — events, stats, lineups
 *   fb_standings/{leagueId}_{season} FbStandingsDoc
 *   fb_topscorers/{leagueId}_{season} FbTopPlayersDoc
 *
 * Field names deliberately mirror the app's domain types in src/data/types.ts
 * (Match, MatchEvent, MatchStatCategory, MatchLineup, PlayerRating) so the
 * client mapping is close to a pass-through.
 *
 * Dependency-free (shared with the app). Timestamps are typed `unknown`: the
 * server writes Firestore Timestamps, the client reads them via its own SDK.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FbTopics = void 0;
exports.fbTeamLogo = fbTeamLogo;
exports.fbLeagueLogo = fbLeagueLogo;
exports.fbPlayerPhoto = fbPlayerPhoto;
exports.fbSeasonKey = fbSeasonKey;
exports.parseFbSeasonKey = parseFbSeasonKey;
/**
 * FCM topic names for football. Must be used verbatim by both the backend
 * (send) and the app (subscribe). Prefixed with `fb_` so they never collide
 * with the legacy Sportmonks-era `team_{id}_*` topics (different id space)
 * or with other sports later.
 */
exports.FbTopics = {
    goals: (teamId, b) => `fb_team_${teamId}_goals_${b}`,
    cards: (teamId, b) => `fb_team_${teamId}_cards_${b}`,
    live: (teamId, b) => `fb_team_${teamId}_live_${b}`,
    kickoff: (teamId) => `fb_team_${teamId}_kickoff`,
    lineups: (teamId) => `fb_team_${teamId}_lineups`,
    reminders: (teamId) => `fb_team_${teamId}_reminders`,
    rivalLoss: (teamId) => `fb_team_${teamId}_rival_loss`,
    rivalBigLoss: (teamId) => `fb_team_${teamId}_rival_bigloss`,
    rivalRedCard: (teamId) => `fb_team_${teamId}_rival_redcard`,
    rivalPenMiss: (teamId) => `fb_team_${teamId}_rival_penmiss`,
    /** Followed PLAYER: goals (not own goals), red cards, starting XI. */
    playerGoals: (playerId) => `fb_player_${playerId}_goals`,
    playerCards: (playerId) => `fb_player_${playerId}_cards`,
    playerLineups: (playerId) => `fb_player_${playerId}_lineups`,
    /** "Silenciar este partido": devices subscribed here are excluded in FCM. */
    mute: (matchId) => `fb_mute_${matchId}`,
};
/** Team crest URL (API-Sports media CDN) — lets slim rows omit the logo. */
function fbTeamLogo(teamId) {
    return `https://media.api-sports.io/football/teams/${teamId}.png`;
}
function fbLeagueLogo(leagueId) {
    return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
}
function fbPlayerPhoto(playerId) {
    return `https://media.api-sports.io/football/players/${playerId}.png`;
}
/** Synthetic numeric season key the app uses where it used to carry a provider
 *  season id: leagueId * 10000 + season year (e.g. Liga MX 2026 → 2622026). */
function fbSeasonKey(leagueId, season) {
    return Number(leagueId) * 10000 + season;
}
function parseFbSeasonKey(key) {
    if (!Number.isFinite(key) || key < 10000)
        return null;
    const season = key % 10000;
    const leagueId = Math.floor(key / 10000);
    if (season < 1900 || season > 2200 || leagueId <= 0)
        return null;
    return { leagueId, season };
}
//# sourceMappingURL=model.js.map