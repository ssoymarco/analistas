// ── useTopScorers — Firestore-backed top scorers with proxy fallback ────────
//
// Reads from `topscorers/{seasonId}` in Firestore (refreshed every hour by
// the `syncTopScorers` Cloud Function — see functions/src/sync-standings.ts).
// The subscription pushes updates the moment a new sync lands, so no client
// polling is needed.
//
// Falls back to SportMonks (via getTopScorers → proxy) only when:
//   • the Firestore document doesn't exist yet (brand-new season SM just
//     added, before the next sync run picks it up), or
//   • the Firestore subscription itself errors (rules, network, etc.).
//
// In steady state — i.e. every season that's in the synced league list AND
// has had at least one sync run — this hook never touches SportMonks. The
// proxy is just a safety net.

import { useState, useEffect, useRef } from 'react';
import { subscribeTopScorers, type FirestoreTopScorer } from '../services/firestoreApi';
import { getTopScorers } from '../services/sportsApi';

// Public hook result shape — kept stable so screens don't have to change.
export interface TopScorerView {
  playerId: number;
  playerName: string;
  playerImage: string;
  goals: number;
  position: number;
  teamName: string;
  teamLogo: string;
}

interface UseTopScorersResult {
  scorers: TopScorerView[];
  loading: boolean;
  error: string | null;
}

function fromFirestore(rows: FirestoreTopScorer[]): TopScorerView[] {
  return rows.map(r => ({
    playerId:    Number(r.playerId) || 0,
    playerName:  r.playerName,
    playerImage: r.playerImage,
    goals:       r.goals,
    position:    r.position,
    teamName:    r.teamName,
    teamLogo:    r.teamLogo,
  }));
}

export function useTopScorers(seasonId: number | null): UseTopScorersResult {
  const [scorers, setScorers] = useState<TopScorerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const isMounted             = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!seasonId || seasonId <= 0) {
      setScorers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Emergency-only proxy fallback. See note at top of file.
    const loadFromProxy = () => {
      getTopScorers(seasonId)
        .then(data => {
          if (!isMounted.current) return;
          // Proxy `TopScorer` shape doesn't carry teamName/teamLogo —
          // those fields render as blank for that path. Acceptable for
          // the rare race-condition case the fallback is here to cover.
          setScorers(data.map(t => ({
            playerId:    t.playerId,
            playerName:  t.playerName,
            playerImage: t.playerImage,
            goals:       t.goals,
            position:    t.position,
            teamName:    '',
            teamLogo:    '',
          })));
          setLoading(false);
        })
        .catch(err => {
          if (!isMounted.current) return;
          setError(err instanceof Error ? err.message : 'Error loading top scorers');
          setLoading(false);
        });
    };

    let receivedAny = false;
    const unsubscribe = subscribeTopScorers(
      seasonId,
      rows => {
        if (!isMounted.current) return;
        receivedAny = true;
        if (rows.length === 0) {
          // Doc not synced yet for this season — try the proxy once
          loadFromProxy();
        } else {
          setScorers(fromFirestore(rows));
          setLoading(false);
        }
      },
      err => {
        if (!isMounted.current) return;
        if (!receivedAny) {
          console.warn('[useTopScorers] Firestore failed, using proxy:', err.message);
          loadFromProxy();
        }
      },
    );

    return unsubscribe;
  }, [seasonId]);

  return { scorers, loading, error };
}
