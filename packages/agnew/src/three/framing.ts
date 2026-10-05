import type { Vec3 } from '../vec.js';

/** How `fit()` frames the curve. `orbit` keeps all of it in view from any
 *  angle; `tight` fills the frame from the current angle, edge to edge. */
export type FitMode = 'orbit' | 'tight';
export const FIT_MODES: readonly FitMode[] = ['orbit', 'tight'];

/** Breathing room around the curve, as a factor on the camera distance. */
const MARGIN = 1.08;

/** Vertical field of view, and the widest the horizontal one may span; a
 *  frame wider than that narrows vertically instead of bending to a fisheye. */
const FOV_Y = 40;
const MAX_FOV_X = 70;

/** Vertical field of view in degrees for a frame of `aspect` (width / height). */
export function fovFor(aspect: number): number {
  const capped = (2 * Math.atan(Math.tan((MAX_FOV_X * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(FOV_Y, capped);
}

/** Half-angle tangents of a perspective camera's view: vertical, then horizontal. */
export function halfTangents(fovYDegrees: number, aspect: number): [number, number] {
  const ty = Math.tan((fovYDegrees * Math.PI) / 360);
  return [ty, ty * aspect];
}

/** Camera distance that keeps a sphere of `radius` around the target inside
 *  the narrower of the two half-angles. */
export function orbitDistance(radius: number, ty: number, tx: number): number {
  return (radius / Math.sin(Math.atan(Math.min(ty, tx)))) * MARGIN;
}

/**
 * Where to put the camera so every point fills the frame from the direction
 * `back` (toward the camera). The camera pans across the view as well as
 * moving in, since an oblique curve's far end recedes in perspective and a
 * frame centered on the origin would leave that side empty. Returns the pan
 * along `right` and `up`, and the distance along `back`.
 *
 * A point at offset `x` and depth `z` toward the camera is inside when
 * `|x - pan| <= (d - z) * tx`. Every `d` past the smallest feasible one also
 * fits, so the distance is found by bisection and the pan is the middle of
 * what that distance allows.
 */
export function tightFraming(
  positions: Float32Array,
  count: number,
  basis: { right: Vec3; up: Vec3; back: Vec3 },
  ty: number,
  tx: number,
): { distance: number; pan: [number, number] } {
  const { right, up, back } = basis;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const zs = new Float64Array(count);
  let reach = 0;
  for (let i = 0; i < count; i++) {
    const p: Vec3 = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    xs[i] = p[0] * right[0] + p[1] * right[1] + p[2] * right[2];
    ys[i] = p[0] * up[0] + p[1] * up[1] + p[2] * up[2];
    zs[i] = p[0] * back[0] + p[1] * back[1] + p[2] * back[2];
    reach = Math.max(reach, Math.hypot(p[0], p[1], p[2]));
  }
  const fx = tx / MARGIN;
  const fy = ty / MARGIN;
  /** The pan interval along one axis at distance `d`, empty when lo > hi. */
  const interval = (vs: Float64Array, d: number, t: number): [number, number] => {
    let lo = -Infinity;
    let hi = Infinity;
    for (let i = 0; i < count; i++) {
      const half = (d - zs[i]) * t;
      lo = Math.max(lo, vs[i] - half);
      hi = Math.min(hi, vs[i] + half);
    }
    return [lo, hi];
  };
  const fits = (d: number) => {
    const [xl, xh] = interval(xs, d, fx);
    const [yl, yh] = interval(ys, d, fy);
    return xl <= xh && yl <= yh;
  };
  let lo = 0;
  let hi = Math.max(reach, 1e-3) * (1 + 1 / Math.min(fx, fy));
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const [xl, xh] = interval(xs, hi, fx);
  const [yl, yh] = interval(ys, hi, fy);
  return { distance: hi, pan: [(xl + xh) / 2, (yl + yh) / 2] };
}
