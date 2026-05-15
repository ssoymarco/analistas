// ── useLiveTick — centralized 1-Hz clock shared across the app ───────────────
//
// WHY THIS EXISTS
// Before this hook, every live-match screen had its own `setInterval` counting
// seconds locally. Consequences:
//   • Partidos list: no tick at all → minute froze at load time until the
//     next 10-s API poll (and the 10-s poll wasn't even patching `minute`).
//   • MatchDetailScreen: local `setInterval` that reset seconds to 0 on every
//     mount — so navigating in/out of a match restarted "0 → 59" each time.
//   • No consistency between list and detail: they showed different times.
//
// HOW IT WORKS
// A single `setInterval` (running while at least one subscriber is active)
// emits the current `Date.now()` every second. All consumers share the same
// tick, so every live card/screen advances in lockstep, and the per-component
// timer count stays at exactly 1 — regardless of how many live matches render.
//
// HOW TO USE
//   const now = useLiveTick();                              // ms since epoch
//   const { minute, seconds } = computeLiveMinuteSeconds(match, now);
//
// The hook returns `Date.now()` as a number that changes every second; callers
// can derive whatever display they need (minute only, minute:ss, etc).

import { useEffect, useState } from 'react';
import type { Match } from '../data/types';

// ── Shared ticker ──────────────────────────────────────────────────────────
type Subscriber = (now: number) => void;
const subscribers = new Set<Subscriber>();
let timerId: ReturnType<typeof setInterval> | null = null;

function startTicker() {
  if (timerId !== null) return;
  timerId = setInterval(() => {
    const now = Date.now();
    subscribers.forEach(cb => cb(now));
  }, 1000);
}

function stopTicker() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

/**
 * Subscribe to a shared 1-Hz tick. Returns `Date.now()` that re-renders the
 * consuming component once per second. Pass `enabled=false` to skip
 * subscribing (e.g. for finished/scheduled matches) so the component doesn't
 * re-render every second unnecessarily. The shared ticker itself only runs
 * while at least one subscriber is active.
 */
export function useLiveTick(enabled: boolean = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const cb: Subscriber = (t) => setNow(t);
    subscribers.add(cb);
    startTicker();
    return () => {
      subscribers.delete(cb);
      if (subscribers.size === 0) stopTicker();
    };
  }, [enabled]);

  return now;
}

// ── Display-time computation ───────────────────────────────────────────────

export interface LiveDisplayTime {
  /** Broadcast minute (nominal). When `isStoppage` is true, this equals the
   *  period cap (45/90/105/120) and `stoppageMinute` holds the "+N" count. */
  minute: number | undefined;
  /** Seconds within the current minute (0-59). */
  seconds: number;
  /** True when the match is at half-time. */
  isHalfTime: boolean;
  /** True when elapsed time has passed the nominal period end — callers
   *  should render stoppage format "N+M'" instead of "(N+M)'". */
  isStoppage: boolean;
  /** Stoppage minute count (1-indexed). Present only when `isStoppage`. */
  stoppageMinute?: number;
  /** Nominal cap of current period (45/90/105/120). Present only when `isStoppage`. */
  periodCap?: number;
}

/**
 * Nominal end minute of the period a `counts_from` offset belongs to.
 * Used to detect stoppage time:
 *   1st half  (counts_from 0)   → cap 45
 *   2nd half  (counts_from 45)  → cap 90
 *   ET 1st    (counts_from 90)  → cap 105
 *   ET 2nd    (counts_from 105) → cap 120
 */
function getPeriodNominalCap(periodMinuteOffset: number): number {
  if (periodMinuteOffset >= 105) return 120;
  if (periodMinuteOffset >= 90)  return 105;
  if (periodMinuteOffset >= 45)  return 90;
  return 45;
}

/** Maximum stoppage time (minutes) we're willing to extrapolate past the
 *  nominal period end. Beyond this, we assume the server's anchor is stale
 *  (period ended but the patch didn't arrive yet) and bail out. 15 is well
 *  above any real-world stoppage (the record is ~14 min, rare). */
const MAX_STOPPAGE_MIN = 15;

/**
 * Compute the live broadcast minute + seconds from a Match and the current
 * wall-clock. Uses `match.liveClock` (server anchor) to extrapolate between
 * polls; falls back to `match.minute` if no anchor.
 *
 * Respects period boundaries: once elapsed exceeds the nominal cap (45, 90,
 * 105, 120), flips to stoppage format so the UI can render "45+3'" instead
 * of the wrong "48'". Includes a stale-anchor safeguard that bails out if
 * the match has clearly moved past a reasonable stoppage window — this
 * prevents "ghost ticking" during HT/end-of-period cache lag.
 */
export function computeLiveMinuteSeconds(
  match: Pick<Match, 'status' | 'minute' | 'stateLabel' | 'liveClock'>,
  now: number,
): LiveDisplayTime {
  const empty: LiveDisplayTime = {
    minute: undefined, seconds: 0, isHalfTime: false, isStoppage: false,
  };

  if (match.status !== 'live') return empty;
  if (match.stateLabel === 'HT') {
    return { minute: 45, seconds: 0, isHalfTime: true, isStoppage: false };
  }

  const anchor = match.liveClock;
  if (!anchor || anchor.periodStartedAt <= 0) {
    // No anchor → use server's last-known minute without sub-minute precision.
    return { minute: match.minute, seconds: 0, isHalfTime: false, isStoppage: false };
  }

  const elapsedSec  = Math.max(0, Math.floor(now / 1000 - anchor.periodStartedAt));
  const elapsedMin  = Math.floor(elapsedSec / 60);
  const absoluteMin = anchor.periodMinuteOffset + elapsedMin;
  const cap         = getPeriodNominalCap(anchor.periodMinuteOffset);

  // Stale-anchor safeguard: if we've run past the cap by more than the max
  // reasonable stoppage, the server has almost certainly moved on (HT, 2H, or
  // full-time) but the cache hasn't refreshed. Stop the runaway extrapolation
  // and fall back to the last authoritative minute we got.
  if (absoluteMin > cap + MAX_STOPPAGE_MIN) {
    return { minute: match.minute, seconds: 0, isHalfTime: false, isStoppage: false };
  }

  if (absoluteMin <= cap) {
    // Regular play within the period
    return {
      minute: Math.max(1, absoluteMin),
      seconds: elapsedSec % 60,
      isHalfTime: false,
      isStoppage: false,
    };
  }

  // Stoppage time — broadcast convention is "cap+stoppageMinute'" (e.g. 45+3')
  return {
    minute: cap,
    seconds: elapsedSec % 60,
    isHalfTime: false,
    isStoppage: true,
    stoppageMinute: absoluteMin - cap,
    periodCap: cap,
  };
}

/** Format a live clock for the detail-view header.
 *  Regular play  → "M:SS'" (smooth ticking)
 *  Stoppage time → "N+M'"  (broadcast convention, no seconds) */
export function formatLiveClock(display: LiveDisplayTime): string | null {
  if (display.isHalfTime) return null; // caller renders HT label
  if (display.isStoppage && display.periodCap !== undefined && display.stoppageMinute !== undefined) {
    return `${display.periodCap}+${display.stoppageMinute}'`;
  }
  if (display.minute === undefined) return null;
  return `${display.minute}:${String(display.seconds).padStart(2, '0')}'`;
}

/** Format just the minute label for compact views (list, hero).
 *  Regular play  → "M'"
 *  Stoppage time → "N+M'" */
export function formatLiveMinute(display: LiveDisplayTime): string | null {
  if (display.isHalfTime) return null; // caller renders HT label
  if (display.isStoppage && display.periodCap !== undefined && display.stoppageMinute !== undefined) {
    return `${display.periodCap}+${display.stoppageMinute}'`;
  }
  if (display.minute === undefined) return null;
  return `${display.minute}'`;
}
