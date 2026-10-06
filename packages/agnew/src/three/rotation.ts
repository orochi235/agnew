import type { Object3D } from 'three';

/** What auto-rotate turns: `orbit` swings the camera around the vertical;
 *  `spinX`/`spinY`/`spinZ` turn the curve about one of its own axes with the
 *  camera still; `tumble` turns it about two axes at rates that never line up. */
export type AutoRotate = 'off' | 'orbit' | 'spinX' | 'spinY' | 'spinZ' | 'tumble';
export const AUTO_ROTATES: readonly AutoRotate[] = ['off', 'orbit', 'spinX', 'spinY', 'spinZ', 'tumble'];
export const AUTO_ROTATE_LABELS: Readonly<Record<AutoRotate, string>> = {
  off: 'Off',
  orbit: 'Orbit',
  spinX: 'Spin X',
  spinY: 'Spin Y',
  spinZ: 'Spin Z',
  tumble: 'Tumble',
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

/** Advance `group`'s turn by `dt` seconds of `mode`. */
export function spin(group: Object3D, mode: AutoRotate, dt: number): void {
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
