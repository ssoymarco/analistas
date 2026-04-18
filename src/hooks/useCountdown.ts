// ── useCountdown — counts down to a UTC datetime ────────────────────────────
import { useState, useEffect } from 'react';

export interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** total milliseconds remaining */
  totalMs: number;
  /** true when the target time is in the past */
  isPast: boolean;
  /** true when < 10 minutes remain — show "Por comenzar" */
  isImminent: boolean;
  /** true when < 24 hours remain — show countdown */
  showCountdown: boolean;
}

function computeCountdown(startingAtUtc: string): CountdownState {
  const target = new Date(startingAtUtc.replace(' ', 'T') + 'Z');
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: diff, isPast: true, isImminent: false, showCountdown: false };
  }

  const totalMs = diff;
  const days    = Math.floor(diff / 86_400_000);
  const hours   = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);

  return {
    days, hours, minutes, seconds, totalMs,
    isPast: false,
    isImminent: diff < 90_000,          // < 90 seconds
    showCountdown: diff < 24 * 3_600_000, // < 24 hours
  };
}

export function useCountdown(startingAtUtc?: string): CountdownState | null {
  const [state, setState] = useState<CountdownState | null>(
    startingAtUtc ? computeCountdown(startingAtUtc) : null,
  );

  useEffect(() => {
    if (!startingAtUtc) return;
    setState(computeCountdown(startingAtUtc));
    const id = setInterval(() => {
      const next = computeCountdown(startingAtUtc);
      setState(next);
      if (next.isPast) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [startingAtUtc]);

  return state;
}
