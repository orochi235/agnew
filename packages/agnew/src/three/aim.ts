import type { Curve } from '../design.js';
import { AUTO } from '../params.js';
import { bestAngle, type Box } from './framing.js';
import type { ViewSettings } from './settings.js';

type Scale = { x: number; y: number; z: number };
type Angle = { azimuth: number; elevation: number };

/** `c` scaled by `k` on each axis, or `c` itself when `k` is 1 throughout. */
export function stretchedCurve(c: Curve, k: Scale): Curve {
  if (k.x === 1 && k.y === 1 && k.z === 1) return c;
  const positions = new Float32Array(c.positions);
  for (let i = 0; i < c.count; i++) {
    positions[i * 3] *= k.x;
    positions[i * 3 + 1] *= k.y;
    positions[i * 3 + 2] *= k.z;
  }
  return { ...c, positions, radius: c.radius * Math.max(k.x, k.y, k.z) };
}

/** The camera angle that lets `curve`, stretched by `k`, fill `frame` most. */
export function bestAngleFor(curve: Curve | null, k: Scale, frame: Box): Angle {
  if (!curve) return { azimuth: 19, elevation: 15 };
  return bestAngle(stretchedCurve(curve, k).positions, curve.count, frame.width / frame.height);
}

/**
 * The camera angle `settings` ask for, with an `'auto'` side turned to fill
 * the frame. The search is kept until the curve (by `version`), the frame's
 * proportions or the stretch change.
 */
export function createAutoAngle() {
  let cached: { key: string; value: Angle } | null = null;
  return (s: ViewSettings, curve: Curve | null, version: number, frame: Box, k: Scale): Angle => {
    if (s.azimuth !== AUTO && s.elevation !== AUTO) return { azimuth: s.azimuth, elevation: s.elevation };
    const key = `${version}:${(frame.width / frame.height).toFixed(4)}:${k.x},${k.y},${k.z}`;
    if (cached?.key !== key) cached = { key, value: bestAngleFor(curve, k, frame) };
    const best = cached.value;
    return {
      azimuth: s.azimuth === AUTO ? best.azimuth : s.azimuth,
      elevation: s.elevation === AUTO ? best.elevation : s.elevation,
    };
  };
}
