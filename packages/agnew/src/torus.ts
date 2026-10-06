import type { Vec3 } from './vec.js';

/**
 * A point `theta` radians along a circle of radius `rho`, measured from an
 * anchor where the circle's tangent is +along and its center lies +inward.
 * `unroll` straightens the circle: 0 is the circle, 1 a line through the
 * anchor, with arc length kept, so the point at `theta` lands `rho * theta`
 * along it. Returns the offsets along and inward, and the tangent's turn.
 */
function bend(theta: number, rho: number, unroll: number): { along: number; inward: number; turn: number } {
  const k = 1 - unroll;
  if (k < 1e-6) return { along: rho * theta, inward: 0, turn: 0 };
  const turn = k * theta;
  return { along: (rho * Math.sin(turn)) / k, inward: (rho * (1 - Math.cos(turn))) / k, turn };
}

/**
 * The torus point at angle `u` around and `v` through, with each circle
 * unrolled by a fraction. Fully unrolled, the surface is the flat rectangle
 * `x = R (u + π/2)`, `y = -R - r (v + π/2)`, `z = -r`, so it lies along x in
 * the xy plane. The anchors sit at u = v = -π/2, which is what turns it that
 * way; at zero unroll this is the usual torus around z.
 */
export function torusAt(R: number, r: number, u: number, v: number, unrollU = 0, unrollV = 0): Vec3 {
  const major = bend(u + Math.PI / 2, R, unrollU);
  const outX = Math.sin(major.turn);
  const outY = -Math.cos(major.turn);
  const tube = bend(v + Math.PI / 2, r, unrollV);
  const z = -r + tube.inward;
  return [major.along + outX * tube.along, -R + major.inward + outY * tube.along, z];
}
