import { type Object3D, Vector3 } from 'three';
import type { Vec3 } from '../vec.js';

/** What auto-rotate turns: `orbit` swings the camera around the vertical;
 *  `spinX`/`spinY`/`spinZ` turn the curve about one of its own axes with the
 *  camera still; `tumble` turns it about two axes at rates that never line up;
 *  `fling` keeps turning it the way the last camera drag was going when let go. */
export type AutoRotate = 'off' | 'orbit' | 'spinX' | 'spinY' | 'spinZ' | 'tumble' | 'fling';
export const AUTO_ROTATES: readonly AutoRotate[] = ['off', 'orbit', 'spinX', 'spinY', 'spinZ', 'tumble', 'fling'];
export const AUTO_ROTATE_LABELS: Readonly<Record<AutoRotate, string>> = {
  off: 'Off',
  orbit: 'Orbit',
  spinX: 'Spin X',
  spinY: 'Spin Y',
  spinZ: 'Spin Z',
  tumble: 'Tumble',
  fling: 'Fling',
};

/** An auto-rotate setting from untrusted data; before the modes, it was a
 *  boolean meaning orbit or off. */
export function autoRotateFrom(raw: unknown, fallback: AutoRotate): AutoRotate {
  if (raw === true) return 'orbit';
  if (raw === false) return 'off';
  return AUTO_ROTATES.includes(raw as AutoRotate) ? (raw as AutoRotate) : fallback;
}

/** Turns the curve itself, rather than the camera. */
export const turnsCurve = (mode: AutoRotate): boolean => mode !== 'off' && mode !== 'orbit';

/** Radians per second: the pace of OrbitControls' auto-rotate at speed 0.6,
 *  so every mode turns as fast as orbit. */
export const SPIN_RATE = ((2 * Math.PI) / 60) * 0.6;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** A turn about a world axis, `rate` in radians per second. */
export interface Fling {
  axis: Vec3;
  rate: number;
}

/** One camera direction (unit, from the orbit target) seen mid-drag, at `t` ms. */
export interface DragSample {
  t: number;
  dir: Vec3;
}

/** Fastest a fling turns, in radians per second, however hard it was thrown. */
const MAX_FLING_RATE = 4;
/** The span of drag a fling's velocity is read over, and how long the pointer
 *  may rest before release and still throw. In ms. */
const FLING_WINDOW = 100;
const FLING_REST = 60;

/**
 * The turn of the curve that carries on a camera drag released at `now`. The
 * camera swinging one way about the target looks like the curve turning the
 * other, so the axis is the camera's own turn reversed. A drag that came to
 * rest before release throws nothing.
 */
export function flingFrom(samples: readonly DragSample[], now: number): Fling | null {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > FLING_REST) return null;
  const first = samples.find((s) => last.t - s.t <= FLING_WINDOW && s !== last);
  if (!first) return null;
  const a = new Vector3(...first.dir);
  const b = new Vector3(...last.dir);
  const axis = b.clone().cross(a);
  const sin = axis.length();
  if (sin < 1e-6) return null;
  const angle = Math.atan2(sin, a.dot(b));
  const rate = Math.min(MAX_FLING_RATE, angle / ((last.t - first.t) / 1000));
  return { axis: axis.divideScalar(sin).toArray(), rate };
}

/** Advance `group`'s turn by `dt` seconds of `mode`; `fling` turns by `thrown`. */
export function spin(group: Object3D, mode: AutoRotate, dt: number, thrown: Fling | null = null): void {
  if (mode === 'fling') {
    if (thrown) group.rotateOnWorldAxis(new Vector3(...thrown.axis), thrown.rate * dt);
    return;
  }
  const a = SPIN_RATE * dt;
  const r = group.rotation;
  if (mode === 'spinX') r.x += a;
  else if (mode === 'spinY') r.y += a;
  else if (mode === 'spinZ') r.z += a;
  else if (mode === 'tumble') {
    r.x += a;
    r.y += a * GOLDEN;
  }
}
