/**
 * matchPhases.ts
 *
 * Single source of truth for match-phase logic. Before this module existed,
 * the bracket cell, the sticky match-detail header, the EnVivo timeline
 * section headers, and the pressure-index x-axis each implemented their own
 * "does this match have extra time / penalties?" check. They drifted: the
 * timeline correctly added a "Tanda de penales" header for shootout matches,
 * but the pressure chart still capped its x-axis at minute 90' (hiding any
 * ET goal markers), and the bracket cell showed dashes for the 2022 final.
 *
 * Everything that cares about minutes, phases, or final-score notation
 * should read from here.
 */

import type { Match, MatchEvent } from '../data/types';

/** A phase of a regulation-or-ET match, used by the timeline section split. */
export interface MatchPhase {
  /** Stable key, useful as React list key. */
  key: 'firstHalf' | 'secondHalf' | 'extraTime';
  /** Inclusive minute range that belongs to this phase. */
  minRange: [number, number];
  /** i18n key for the section label ("1er Tiempo", "2do Tiempo", etc.). */
  i18nKey: string;
  /** i18n key for the CLOSING boundary marker shown at the end of this phase
   *  with the cumulative running score (e.g. "Medio tiempo · 2-0"). Null when
   *  the phase has no meaningful closing boundary on its own. */
  boundaryKey: string | null;
  /** The minute at which this phase's closing boundary sits. Used to decide
   *  whether the boundary has been reached yet for live matches. */
  boundaryMinute: number;
}

/** Regulation + extra-time phases, in chronological order. Extra time is a
 *  SINGLE "Prórroga" block (91-120) — matching Sofascore / 365scores / FotMob,
 *  which all collapse the two ET halves into one segment (the 105' break
 *  rarely carries events). The timeline renderer iterates and only emits a
 *  section when it has events, so regular FT matches never show ET headers. */
export const MATCH_PHASES: readonly MatchPhase[] = [
  { key: 'firstHalf',  minRange: [1,  45],  i18nKey: 'timeline.firstHalf',  boundaryKey: 'timeline.boundaryHalfTime', boundaryMinute: 45 },
  { key: 'secondHalf', minRange: [46, 90],  i18nKey: 'timeline.secondHalf', boundaryKey: 'timeline.boundaryFullTime', boundaryMinute: 90 },
  { key: 'extraTime',  minRange: [91, 120], i18nKey: 'timeline.extraTime',  boundaryKey: 'timeline.boundaryAET',      boundaryMinute: 120 },
] as const;

/** True when the fixture has been decided by a penalty shootout. We trust
 *  the explicit `homePenScore`/`awayPenScore` numeric fields written by the
 *  Cloud Function mapper (`functions/src/mappers.ts:extractScores`); the
 *  shootout total comes from SportMonks' `scores[]` description='PENALTIES'. */
export function matchEndedInPenalties(match: Match): boolean {
  return typeof match.homePenScore === 'number'
      && typeof match.awayPenScore === 'number';
}

/** True when the fixture went beyond regulation (extra time and/or penalties).
 *  The most reliable signal is the presence of penalty scores; for AET-only
 *  matches (rare — ET goals decided it, no shootout) we fall back to checking
 *  the events array for any minute > 90. The stateLabel hint covers the
 *  live case where SM is mid-ET. */
export function matchHadExtraTime(match: Match, events?: MatchEvent[]): boolean {
  if (matchEndedInPenalties(match)) return true;
  if (match.stateLabel === 'ET' || match.stateLabel === 'PEN') return true;
  if (events && events.some(e => e.minute > 90 && !isShootoutEventType(e.type))) return true;
  return false;
}

/** Predicate split out so the pressure-curve marker filter can use it
 *  without depending on the broader match-level check. Shootout events come
 *  with their own SM type ids (22 / 23) so we identify them directly. */
export function isShootoutEventType(type: string): boolean {
  return type === 'shootout-goal' || type === 'shootout-miss';
}

/** Maximum regulation minute that the pressure chart's x-axis and the
 *  timeline's phase split should cover for this match. Returns 90 for a
 *  regular fixture, 120 when ET / penalties happened. Penalties live in a
 *  separate UI block (the timeline "Tanda de penales" section) — they are
 *  NOT a 120+ extension here. */
export function maxRegulationMinute(match: Match, events?: MatchEvent[]): 90 | 120 {
  return matchHadExtraTime(match, events) ? 120 : 90;
}

/** "(4-2 pen)" suffix when the match ended in a shootout, else null.
 *  Mirror the FotMob convention so the bracket cell, the sticky compact
 *  header, and any match-card surface render identical strings. */
export function formatPenSuffix(match: Match): string | null {
  if (!matchEndedInPenalties(match)) return null;
  return `${match.homePenScore}-${match.awayPenScore} pen`;
}

/** Goals scored by each side up to AND INCLUDING the given event, walking the
 *  full event list in chronological order. Powers the running-score label
 *  shown under each goal in the timeline ("1-0", "2-1", …) — every competitor
 *  (Sofascore, 365scores, FotMob) surfaces this and it's the single biggest
 *  clarity win. Own goals are credited to the OPPOSING side (an own goal by
 *  the home team raises the away score). Shootout kicks are excluded — they
 *  have their own tally. */
export function runningScoreAt(
  events: MatchEvent[],
  targetEvent: MatchEvent,
): { home: number; away: number } {
  const isGoalType = (t: string) => t === 'goal' || t === 'penalty-goal' || t === 'own-goal';
  // Chronological order: minute then addedTime, with the target's own id as
  // the inclusive cut-off so two goals in the same minute count correctly.
  const ordered = [...events]
    .filter(e => isGoalType(e.type))
    .sort((a, b) => (a.minute - b.minute) || ((a.addedTime ?? 0) - (b.addedTime ?? 0)));
  let home = 0, away = 0;
  for (const e of ordered) {
    // Own goal counts for the opponent.
    const scoringSide =
      e.type === 'own-goal' ? (e.team === 'home' ? 'away' : 'home') : e.team;
    if (scoringSide === 'home') home++; else away++;
    if (e.id === targetEvent.id) break;
  }
  return { home, away };
}

/** Cumulative score at the end of a phase (i.e. up to `boundaryMinute`).
 *  Used by the boundary markers ("Medio tiempo · 2-0"). */
export function cumulativeScoreAtMinute(
  events: MatchEvent[],
  uptoMinute: number,
): { home: number; away: number } {
  const isGoalType = (t: string) => t === 'goal' || t === 'penalty-goal' || t === 'own-goal';
  let home = 0, away = 0;
  for (const e of events) {
    if (!isGoalType(e.type)) continue;
    if (e.minute > uptoMinute) continue;
    const scoringSide =
      e.type === 'own-goal' ? (e.team === 'home' ? 'away' : 'home') : e.team;
    if (scoringSide === 'home') home++; else away++;
  }
  return { home, away };
}
