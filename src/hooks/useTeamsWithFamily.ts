import { useEffect, useMemo, useState } from 'react';
import { getTeamFamilies, withYouthTeams } from '../services/football/teamFamilies';

/**
 * The followed teams plus the youth sides of the national teams among them
 * (following Mexico includes Mexico U17). Starts as the plain list and widens
 * once the links are loaded.
 */
export function useTeamsWithFamily(followedTeamIds: string[]): string[] {
  const [links, setLinks] = useState<Record<string, string>>({});
  const hasTeams = followedTeamIds.length > 0;
  useEffect(() => {
    if (!hasTeams) return;
    let alive = true;
    getTeamFamilies().then(l => { if (alive) setLinks(l); }).catch(() => {});
    return () => { alive = false; };
  }, [hasTeams]);
  return useMemo(() => withYouthTeams(followedTeamIds, links), [followedTeamIds, links]);
}
