/**
 * detect-changes.ts
 *
 * Compares current livescores against the previous snapshot in Firestore.
 * Detects goals, match starts, and match endings.
 * Queues FCM notifications for each detected change.
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import type { MatchDoc, LivescoresSnapshot, DetectedChange } from './types';

const db = admin.firestore();

/**
 * Load the previous livescores snapshot from _meta/livescoresSnapshot.
 * Returns an empty snapshot if none exists yet.
 */
export async function loadSnapshot(): Promise<LivescoresSnapshot['matches']> {
  const snap = await db.doc('_meta/livescoresSnapshot').get();
  if (!snap.exists) return {};
  return (snap.data() as LivescoresSnapshot)?.matches ?? {};
}

/**
 * Save the current livescores snapshot for next comparison.
 */
export async function saveSnapshot(matches: MatchDoc[]): Promise<void> {
  const snapshot: LivescoresSnapshot['matches'] = {};
  for (const m of matches) {
    snapshot[m.id] = {
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      stateId: m.stateId,
    };
  }
  await db.doc('_meta/livescoresSnapshot').set({
    matches: snapshot,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Compare current matches against previous snapshot.
 * Returns a list of detected changes (goals, match starts, match endings).
 */
export function detectChanges(
  currentMatches: MatchDoc[],
  previousSnapshot: LivescoresSnapshot['matches'],
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  for (const match of currentMatches) {
    const prev = previousSnapshot[match.id];

    if (!prev) {
      // New live match — check if it just started
      if (match.status === 'live') {
        changes.push({
          type: 'matchStart',
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          league: match.league,
          leagueId: match.leagueId,
          minute: match.minute,
        });
      }
      continue;
    }

    // ── Goal Detection ────────────────────────────────────────────────────
    const prevTotal = prev.homeScore + prev.awayScore;
    const newTotal  = match.homeScore + match.awayScore;

    if (newTotal > prevTotal) {
      // Determine which side scored
      const homeScored = match.homeScore > prev.homeScore;
      const awayScored = match.awayScore > prev.awayScore;

      if (homeScored) {
        changes.push({
          type: 'goal',
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          league: match.league,
          leagueId: match.leagueId,
          scoringTeamSide: 'home',
          minute: match.minute,
        });
      }

      if (awayScored) {
        changes.push({
          type: 'goal',
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          league: match.league,
          leagueId: match.leagueId,
          scoringTeamSide: 'away',
          minute: match.minute,
        });
      }
    }

    // ── Match Start Detection ─────────────────────────────────────────────
    if (prev.status === 'scheduled' && match.status === 'live') {
      changes.push({
        type: 'matchStart',
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        league: match.league,
        leagueId: match.leagueId,
        minute: match.minute,
      });
    }

    // ── Match End Detection ───────────────────────────────────────────────
    if (prev.status === 'live' && match.status === 'finished') {
      changes.push({
        type: 'matchEnd',
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        league: match.league,
        leagueId: match.leagueId,
        minute: match.minute,
      });
    }
  }

  return changes;
}

/**
 * Dispatch FCM notifications for detected changes.
 * Uses FCM topics: team_{teamId}_goal, team_{teamId}_matchStart, etc.
 *
 * Phase 2: Full implementation with FCM topic sends.
 * For now: logs changes for monitoring.
 */
export async function dispatchNotifications(changes: DetectedChange[]): Promise<void> {
  for (const change of changes) {
    const homeId = change.homeTeam.id;
    const awayId = change.awayTeam.id;

    switch (change.type) {
      case 'goal': {
        const scorer = change.scoringTeamSide === 'home' ? change.homeTeam.name : change.awayTeam.name;
        logger.info(`⚽ GOL — ${scorer} | ${change.homeTeam.name} ${change.homeScore}-${change.awayScore} ${change.awayTeam.name} (${change.minute ?? '?'}')`, {
          matchId: change.matchId,
          scoringTeam: change.scoringTeamSide,
        });

        // TODO Phase 2: Send FCM to topics
        // await admin.messaging().send({
        //   topic: `team_${change.scoringTeamSide === 'home' ? homeId : awayId}_goal`,
        //   notification: {
        //     title: `Gol ⚽ — ${change.minute}'`,
        //     body: `${change.homeTeam.name} ${change.homeScore} - ${change.awayScore} ${change.awayTeam.name}`,
        //   },
        //   data: { type: 'goal', matchId: change.matchId },
        // });
        break;
      }

      case 'matchStart': {
        logger.info(`📣 INICIO — ${change.homeTeam.name} vs ${change.awayTeam.name} · ${change.league}`, {
          matchId: change.matchId,
        });
        break;
      }

      case 'matchEnd': {
        logger.info(`🏆 FINAL — ${change.homeTeam.name} ${change.homeScore}-${change.awayScore} ${change.awayTeam.name} · ${change.league}`, {
          matchId: change.matchId,
        });
        break;
      }
    }
  }

  if (changes.length > 0) {
    logger.info(`📊 Total changes detected: ${changes.length}`, {
      goals: changes.filter(c => c.type === 'goal').length,
      starts: changes.filter(c => c.type === 'matchStart').length,
      ends: changes.filter(c => c.type === 'matchEnd').length,
    });
  }
}
