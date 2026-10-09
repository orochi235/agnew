export type WaveShape = 'sine' | 'triangle' | 'saw' | 'square';
export const WAVE_SHAPES: readonly WaveShape[] = ['sine', 'triangle', 'saw', 'square'];

/** CSS's named easing curves, which blits reads as data. */
export type Ease = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
export const EASES: readonly Ease[] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];

/** A periodic swing of `±depth` around the param's set value. */
export interface WaveMotion {
  kind: 'wave';
  shape: WaveShape;
  /** Cycles per loop of the design. */
  cycles: number;
  /** In the param's own units. */
  depth: number;
  /** Where in its cycle the wave starts, 0–1. */
  phase: number;
}

/** Values at points through the loop, replacing the param's set value. */
export interface KeysMotion {
  kind: 'keys';
  /** `at` is a fraction of the loop, 0–1, in ascending order. */
  stops: { at: number; value: number }[];
  ease: Ease;
}

export type Motion = WaveMotion | KeysMotion;

/** Seconds one loop of a design lasts, when it does not say. */
export const DEFAULT_LOOP = 12;

/** A motion to start from for a param at `value` on a slider spanning `range`. */
export function newMotion(kind: Motion['kind'], value: number, range: number): Motion {
  if (kind === 'wave') return { kind, shape: 'sine', cycles: 1, depth: Math.max(range * 0.1, 1e-3), phase: 0 };
  return {
    kind,
    ease: 'ease-in-out',
    stops: [
      { at: 0, value },
      { at: 0.5, value: value + range * 0.1 },
      { at: 1, value },
    ],
  };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A motion from untrusted data, or `null` when nothing usable is there. */
export function sanitizeMotion(value: unknown): Motion | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.kind === 'wave') {
    return {
      kind: 'wave',
      shape: WAVE_SHAPES.includes(v.shape as WaveShape) ? (v.shape as WaveShape) : 'sine',
      cycles: finite(v.cycles) ? clamp(Math.round(v.cycles), 1, 1000) : 1,
      depth: finite(v.depth) ? v.depth : 0,
      phase: finite(v.phase) ? v.phase - Math.floor(v.phase) : 0,
    };
  }
  if (v.kind === 'keys' && Array.isArray(v.stops)) {
    const stops = v.stops
      .filter((s): s is { at: number; value: number } => finite(s?.at) && finite(s?.value))
      .map((s) => ({ at: clamp(s.at, 0, 1), value: s.value }))
      .sort((a, b) => a.at - b.at);
    if (stops.length === 0) return null;
    return { kind: 'keys', stops, ease: EASES.includes(v.ease as Ease) ? (v.ease as Ease) : 'linear' };
  }
  return null;
}
