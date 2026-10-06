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

/** Unit direction from the target toward the camera, for an azimuth around
 *  the vertical (0 looks from +z, 90 from +x) and an elevation above the
 *  horizon, both in degrees. Elevation stops short of straight up or down,
 *  where the camera's up direction is undefined. */
export function directionFor(azimuth: number, elevation: number): Vec3 {
  const a = (azimuth * Math.PI) / 180;
  const e = (Math.max(-89.5, Math.min(89.5, elevation)) * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

/** The azimuth and elevation, in degrees, of a direction toward the camera. */
export function angleOf(d: Vec3): { azimuth: number; elevation: number } {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return {
    azimuth: (Math.atan2(d[0], d[2]) * 180) / Math.PI,
    elevation: (Math.asin(Math.max(-1, Math.min(1, d[1] / len))) * 180) / Math.PI,
  };
}

/** Named frame shapes, by width-to-height ratio; `free` takes the whole area. */
export type Shape = 'free' | 'topbar' | 'banner' | 'header' | 'card' | 'sidebar';
export const SHAPES: Readonly<Record<Shape, { label: string; aspect: number | null }>> = {
  free: { label: 'Free', aspect: null },
  topbar: { label: 'Top bar 30:1', aspect: 30 },
  banner: { label: 'Banner 8:1', aspect: 8 },
  header: { label: 'Header 4:1', aspect: 4 },
  card: { label: 'Card 2:1', aspect: 2 },
  sidebar: { label: 'Sidebar 1:4', aspect: 0.25 },
};
export const SHAPE_NAMES = Object.keys(SHAPES) as Shape[];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The largest box of `shape`'s aspect centered in `area`, or `area` itself for `free`. */
export function shapeBox(area: Box, shape: Shape): Box {
  const aspect = SHAPES[shape]?.aspect;
  if (!aspect) return area;
  const width = Math.min(area.width, area.height * aspect);
  const height = width / aspect;
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

/**
 * Per-axis scale that brings the curve's width-to-height ratio to `aspect`,
 * within ±3 on any axis. Depth is squashed with the short side, or an
 * oblique camera turns it back into height.
 */
export function stretchFor(positions: Float32Array, count: number, aspect: number): Vec3 {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < count; i++) {
    x0 = Math.min(x0, positions[i * 3]);
    x1 = Math.max(x1, positions[i * 3]);
    y0 = Math.min(y0, positions[i * 3 + 1]);
    y1 = Math.max(y1, positions[i * 3 + 1]);
  }
  const m = (aspect * Math.max(y1 - y0, 1e-6)) / Math.max(x1 - x0, 1e-6);
  if (m >= 1) {
    const x = Math.min(3, Math.sqrt(m));
    return [x, x / m, x / m];
  }
  const y = Math.min(3, 1 / Math.sqrt(m));
  return [y * m, y, y * m];
}

export interface CameraPreset {
  label: string;
  azimuth: number;
  elevation: number;
}

const THREE_QUARTER: CameraPreset = { label: 'Three-quarter', azimuth: 19, elevation: 15 };
const FACE_ON: CameraPreset = { label: 'Face-on', azimuth: 0, elevation: 0 };

/**
 * Angles worth starting from in each shape. A wide frame keeps azimuth 0 so
 * the x axis, which a stretch lengthens, stays level and only tilts toward or
 * away; a tall one does the same for y by looking from the side.
 */
export const CAMERA_PRESETS: Readonly<Record<Shape, readonly CameraPreset[]>> = {
  free: [
    THREE_QUARTER,
    FACE_ON,
    { label: 'Top down', azimuth: 0, elevation: 80 },
    { label: 'Side', azimuth: 90, elevation: 10 },
  ],
  topbar: [FACE_ON, { label: 'Raking', azimuth: 0, elevation: 25 }, { label: 'Grazing', azimuth: 0, elevation: 60 }],
  banner: [FACE_ON, { label: 'Raking', azimuth: 0, elevation: 35 }, { label: 'Low sweep', azimuth: 0, elevation: -14 }, THREE_QUARTER],
  header: [FACE_ON, { label: 'Raking', azimuth: 0, elevation: 35 }, { label: 'Low sweep', azimuth: 0, elevation: -18 }, THREE_QUARTER],
  card: [THREE_QUARTER, FACE_ON, { label: 'Over the top', azimuth: 0, elevation: 55 }, { label: 'Side', azimuth: 90, elevation: 10 }],
  sidebar: [
    FACE_ON,
    { label: 'Turned', azimuth: 35, elevation: 0 },
    { label: 'Edge', azimuth: 75, elevation: 0 },
    { label: 'From below', azimuth: 20, elevation: -25 },
  ],
};
