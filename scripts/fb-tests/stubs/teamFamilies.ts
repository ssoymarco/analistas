// Youth team id → senior team id, as fb_meta/teamFamilies publishes it.
export const links: Record<string, string> = { '25551': '16' };
export async function getTeamFamilies(): Promise<Record<string, string>> { return links; }
export function withYouthTeams(followed: string[]): string[] { return followed; }
