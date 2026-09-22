import { Color } from 'three';

/** Named gradients run along the curve from its start to its end. */
export const PALETTES: Readonly<Record<string, readonly string[]>> = {
  aurora: ['#22d3ee', '#6366f1', '#d946ef'],
  ember: ['#fde68a', '#f97316', '#be123c'],
  ice: ['#e0f2fe', '#7dd3fc', '#1d4ed8'],
  brass: ['#f5d08a', '#c8893a', '#8a5a2b'],
  spectrum: ['#ef4444', '#f59e0b', '#84cc16', '#06b6d4', '#8b5cf6', '#ef4444'],
  ink: ['#1b1a2e', '#2b2342', '#1b1a2e'],
  mono: ['#ffffff', '#ffffff'],
};

export function paletteStops(name: string): readonly string[] {
  return PALETTES[name] ?? PALETTES.aurora;
}

/** Linear-space RGB triples, one per point, interpolated through `stops`. */
export function gradientColors(count: number, stops: readonly string[]): Float32Array {
  const cs = stops.map((s) => new Color(s));
  const out = new Float32Array(count * 3);
  const c = new Color();
  const segs = Math.max(1, cs.length - 1);
  for (let i = 0; i < count; i++) {
    const u = count > 1 ? (i / (count - 1)) * segs : 0;
    const k = Math.min(segs - 1, Math.floor(u));
    c.copy(cs[k]).lerp(cs[Math.min(cs.length - 1, k + 1)], u - k);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}
