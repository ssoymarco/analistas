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
  key: 'firstHalf' | 'secondHalf' | 'firstHalfET' | 'secondHalfET';
  /** Inclusive minute range that belongs to this phase. */
  minRange: [number, number];
  /** i18n key for the section label ("1er Tiempo", "2do Tiempo", etc.). */
  i18nKey: string;
}

/** All four regulation+ET phases, in chronological order. The timeline
 *  renderer iterates and only emits a section when phaseEvents.length > 0,
 *  so regular FT matches don't show empty ET headers. */
export const MATCH_PHASES: readonly MatchPhase[] = [
  { key: 'firstHalf',    minRange: [1,   45],  i18nKey: 'timeline.firstHalf'    },
  { key: 'secondHalf',   minRange: [46,  90],  i18nKey: 'timeline.secondHalf'   },
  { key: 'firstHalfET',  minRange: [91,  105], i18nKey: 'timeline.firstHalfET'  },
  { key: 'secondHalfET', minRange: [106, 120], i18nKey: 'timeline.secondHalfET' },
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
