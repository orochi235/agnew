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

const TAU = Math.PI * 2;

/**
 * A point near a torus around z, read back as its angle around (`u`), its
 * angle through (`v`), and its height off the surface.
 */
export function torusCoords(p: Vec3, R: number, r: number): { u: number; v: number; height: number } {
  const rho = Math.hypot(p[0], p[1]) - R;
  return { u: Math.atan2(p[1], p[0]), v: Math.atan2(p[2], rho), height: Math.hypot(rho, p[2]) - r };
}

/**
 * Maps a patch of a torus flat onto a rectangle. The patch has corners at
 * (`u0`, `v0`) and (`u1`, `v1`), in radians, turned by `turn` against the
 * torus's own grid. Since the torus repeats every full turn both ways, every
 * pass of the curve over that patch lands in the same rectangle. Points the
 * patch does not cover come back as NaN, a gap in the line. The rectangle is
 * `aspect` wide and 1 high, centered on 0, so its corners can be made to land
 * on a frame's corners whatever the patch's own proportions.
 */
export function patchAt(
  p: Vec3,
  R: number,
  r: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  turn: number,
  aspect: number,
): Vec3 {
  const { u, v, height } = torusCoords(p, R, r);
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const hu = Math.abs(u1 - u0) / 2;
  const hv = Math.abs(v1 - v0) / 2;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const du = u - cu;
  const dv = v - cv;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const x = du + i * TAU;
      const y = dv + j * TAU;
      const a = c * x + s * y;
      const b = -s * x + c * y;
      if (Math.abs(a) <= hu && Math.abs(b) <= hv) return [(aspect * a) / (2 * hu), b / (2 * hv), height];
    }
  }
  return [Number.NaN, Number.NaN, Number.NaN];
}
