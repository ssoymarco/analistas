/**
 * momentum.ts — turns the server's pressure snapshots into a per-minute
 * momentum curve and draws it as an SVG.
 *
 * Data: during a live match the server stores one snapshot every 2-4 minutes
 * (`PressureIndex.series`). Each snapshot has the CUMULATIVE attacking counts
 * of both teams (`c`: shots on goal, shots in the box, shots, corners, xG,
 * accurate passes). The momentum at a given minute is how much each team
 * added between snapshots, weighted by how dangerous each action is — the
 * same idea as the "attack momentum" graphs in other apps. Snapshots written
 * before the counts existed only carry the cumulative share (`home` %); for
 * those we approximate the totals as share × minute (activity grows roughly
 * linearly with time) and differentiate that instead.
 *
 * Drawing: React Native has no vector primitive and react-native-svg is a
 * native module (store build). expo-image, already in the binary, renders SVG,
 * so the chart is an SVG string handed to it as a base64 data URI — sharp at
 * any pixel density and shippable over the air. The caller falls back to
 * per-minute bars drawn with Views if the image fails to load.
 */
import type { PressureSample } from '../../data/types';

/** Weight of each cumulative count, i.e. how much one unit signals pressure. */
const WEIGHTS: Record<'sog' | 'sib' | 'sh' | 'ck' | 'xg' | 'pa', number> = {
  sog: 3,      // shot on target
  sib: 2,      // shot from inside the box
  sh: 1,       // any shot
  ck: 1.2,     // corner
  xg: 6,       // expected goals (0.1 xG chance = 0.6)
  pa: 0.04,    // accurate pass — keeps possession spells visible between shots
};

export interface MomentumCurve {
  /** Momentum per minute, index = minute (0..lastMinute), in [-1, 1]. +home / −away. */
  values: number[];
  /** Last minute with data. */
  lastMinute: number;
  /** True when built from the raw counts; false for the share approximation. */
  exact: boolean;
}

function weighted(c: NonNullable<PressureSample['c']>, side: 0 | 1): number {
  let s = 0;
  for (const k of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    const v = c[k];
    if (Array.isArray(v) && typeof v[side] === 'number' && isFinite(v[side])) s += v[side] * WEIGHTS[k];
  }
  return s;
}

function gaussianSmooth(data: number[], sigma: number): number[] {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k: number[] = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(w); sum += w; }
  return data.map((_, i) => {
    let acc = 0;
    for (let j = -r; j <= r; j++) {
      const idx = Math.max(0, Math.min(data.length - 1, i + j));
      acc += (k[j + r] / sum) * data[idx];
    }
    return acc;
  });
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

/**
 * Per-minute momentum from the snapshots, up to `endMinute` (the current
 * minute when live, the end of the match when finished). Returns null when
 * there isn't enough data to draw anything honest.
 */
export function buildMomentum(series: PressureSample[] | undefined, endMinute: number): MomentumCurve | null {
  if (!series || !series.length || endMinute <= 0) return null;

  // Clean: valid minutes inside the window, sorted, one point per minute (last wins).
  const byMinute = new Map<number, PressureSample>();
  for (const p of series) {
    if (!p || typeof p.minute !== 'number' || !isFinite(p.minute)) continue;
    const m = Math.round(p.minute);
    if (m <= 0 || m > endMinute) continue;
    byMinute.set(m, p);
  }
  let pts = [...byMinute.entries()].sort((a, b) => a[0] - b[0]).map(([m, p]) => ({ m, p }));
  if (!pts.length) return null;

  const withCounts = pts.filter(x => x.p.c && Object.keys(x.p.c).length > 0);
  const exact = withCounts.length >= 2 && withCounts.length >= pts.length * 0.6;
  if (exact) pts = withCounts;

  // Cumulative pressure per side at each snapshot, anchored at 0 at kickoff.
  const cum: Array<{ m: number; h: number; a: number }> = [{ m: 0, h: 0, a: 0 }];
  for (const { m, p } of pts) {
    let h: number, a: number;
    if (exact) { h = weighted(p.c!, 0); a = weighted(p.c!, 1); }
    else {
      const share = Math.max(0, Math.min(100, Number(p.home) || 50)) / 100;
      h = share * m; a = (1 - share) * m;
    }
    const prev = cum[cum.length - 1];
    // Counts only grow; a provider correction downwards would draw a fake swing.
    cum.push({ m, h: Math.max(h, prev.h), a: Math.max(a, prev.a) });
  }

  const lastMinute = cum[cum.length - 1].m;
  if (lastMinute < 2) return { values: new Array(lastMinute + 1).fill(0), lastMinute, exact };

  // Spread each interval's increments evenly over its minutes.
  const net = new Array<number>(lastMinute + 1).fill(0);
  for (let i = 1; i < cum.length; i++) {
    const a = cum[i - 1], b = cum[i];
    const span = b.m - a.m;
    if (span <= 0) continue;
    const perMin = ((b.h - a.h) - (b.a - a.a)) / span;
    for (let m = a.m + 1; m <= b.m; m++) net[m] = perMin;
  }

  const smooth = gaussianSmooth(net, 1.1);
  // Scale to the match's own intensity so a quiet match still shows its swings,
  // with a floor so a dull spell isn't blown up into fake drama.
  const floor = exact ? 0.6 : 0.25;
  const scale = Math.max(floor, percentile(smooth.slice(1).map(Math.abs), 0.9));
  const values = smooth.map((v, i) => (i === 0 ? 0 : Math.tanh((v / scale) * 0.95)));
  return { values, lastMinute, exact };
}

// ── SVG drawing ───────────────────────────────────────────────────────────────

export interface MomentumSvgOptions {
  width: number;
  height: number;
  totalMin: number;
  homeColor: string;
  awayColor: string;
  /** Hex color (#fff / #000) for the baseline and guides; opacity is applied here. */
  inkColor: string;
  /** Minutes with a dashed vertical guide (half-time, end of regulation in ET). */
  guides: number[];
  /** Goal minutes per side: a faint dotted line from the marker to the baseline. */
  homeGoals: number[];
  awayGoals: number[];
  /** Device pixel ratio, so the SVG is rasterised at full resolution. */
  pixelRatio: number;
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

/** Upsample per-minute values to `perMin` samples per minute. */
function upsample(values: number[], perMin: number): number[] {
  const out: number[] = [];
  const n = values.length;
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < perMin; s++) {
      const t = s / perMin;
      const v = catmullRom(values[Math.max(0, i - 1)], values[i], values[i + 1], values[Math.min(n - 1, i + 2)], t);
      out.push(Math.max(-1, Math.min(1, v)));
    }
  }
  out.push(values[n - 1]);
  return out;
}

export function momentumSvg(curve: MomentumCurve | null, o: MomentumSvgOptions): string {
  const W = o.width, H = o.height;
  const mid = H / 2;
  const amp = mid - 3;
  const xAt = (minute: number) => (minute / o.totalMin) * W;
  const parts: string[] = [];

  parts.push(
    `<defs>` +
      `<linearGradient id="gh" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(mid - amp)}" x2="0" y2="${f1(mid)}">` +
        `<stop offset="0" stop-color="${o.homeColor}" stop-opacity="0.95"/>` +
        `<stop offset="1" stop-color="${o.homeColor}" stop-opacity="0.45"/>` +
      `</linearGradient>` +
      `<linearGradient id="ga" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(mid)}" x2="0" y2="${f1(mid + amp)}">` +
        `<stop offset="0" stop-color="${o.awayColor}" stop-opacity="0.45"/>` +
        `<stop offset="1" stop-color="${o.awayColor}" stop-opacity="0.95"/>` +
      `</linearGradient>` +
    `</defs>`,
  );

  for (const g of o.guides) {
    const x = f1(xAt(g));
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${o.inkColor}" stroke-opacity="0.28" stroke-width="1" stroke-dasharray="2 3"/>`);
  }
  for (const m of o.homeGoals) {
    const x = f1(xAt(Math.min(m, o.totalMin)));
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${f1(mid)}" stroke="${o.inkColor}" stroke-opacity="0.22" stroke-width="1" stroke-dasharray="1 2.5"/>`);
  }
  for (const m of o.awayGoals) {
    const x = f1(xAt(Math.min(m, o.totalMin)));
    parts.push(`<line x1="${x}" y1="${f1(mid)}" x2="${x}" y2="${H}" stroke="${o.inkColor}" stroke-opacity="0.22" stroke-width="1" stroke-dasharray="1 2.5"/>`);
  }

  if (curve && curve.values.length >= 2) {
    const PER_MIN = 4;
    const fine = upsample(curve.values, PER_MIN);
    const step = 1 / PER_MIN;
    const xs = fine.map((_, i) => f1(xAt(i * step)));
    const yHome = fine.map(v => f1(mid - Math.max(0, v) * amp));
    const yAway = fine.map(v => f1(mid - Math.min(0, v) * amp));
    const lastX = xs[xs.length - 1];

    const area = (ys: string[]) => {
      let d = `M0 ${f1(mid)}`;
      for (let i = 0; i < ys.length; i++) d += `L${xs[i]} ${ys[i]}`;
      return d + `L${lastX} ${f1(mid)}Z`;
    };
    // Outline only where that side is above the baseline, so neither team's
    // color runs along the baseline under the other team's area.
    const midS = f1(mid);
    const edge = (ys: string[]) => {
      let d = '';
      let open = false;
      for (let i = 0; i < ys.length; i++) {
        const onBase = ys[i] === midS;
        const nextOff = i + 1 < ys.length && ys[i + 1] !== midS;
        const prevOff = i > 0 && ys[i - 1] !== midS;
        if (onBase && !nextOff && !prevOff) { open = false; continue; }
        d += `${open ? 'L' : 'M'}${xs[i]} ${ys[i]}`;
        open = true;
      }
      return d || `M0 ${midS}`;
    };
    parts.push(`<path d="${area(yHome)}" fill="url(#gh)"/>`);
    parts.push(`<path d="${area(yAway)}" fill="url(#ga)"/>`);
    parts.push(`<path d="${edge(yHome)}" fill="none" stroke="${o.homeColor}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`);
    parts.push(`<path d="${edge(yAway)}" fill="none" stroke="${o.awayColor}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  parts.push(`<line x1="0" y1="${f1(mid)}" x2="${W}" y2="${f1(mid)}" stroke="${o.inkColor}" stroke-opacity="0.22" stroke-width="1"/>`);

  const pr = Math.max(1, Math.min(4, o.pixelRatio));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * pr)}" height="${Math.round(H * pr)}" ` +
    `viewBox="0 0 ${f1(W)} ${f1(H)}">${parts.join('')}</svg>`
  );
}

// Android's image loader only accepts base64 data URIs, and `btoa` isn't
// guaranteed on every Hermes build — the SVG is plain ASCII, so encode by hand.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Ascii(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i) & 0xff;
    const b = i + 1 < s.length ? s.charCodeAt(i + 1) & 0xff : NaN;
    const c = i + 2 < s.length ? s.charCodeAt(i + 2) & 0xff : NaN;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4)];
    out += isNaN(b) ? '=' : B64[((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6)];
    out += isNaN(c) ? '=' : B64[c & 63];
  }
  return out;
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${base64Ascii(svg)}`;
}
