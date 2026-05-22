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
export declare function syncSquadsHandler(): Promise<void>;
