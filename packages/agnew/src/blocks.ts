import { choice, num, type ParamSpec, type ParamValues } from './params.js';
import { rotateX, rotateY, rotateZ, type Vec3 } from './vec.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * A block maps the running pen position at time `t`. Time is measured in
 * radians of the base cycle, so a frequency of 1 is one revolution per turn.
 */
export interface BlockKind {
  kind: string;
  label: string;
  /** Sources add a motion to the pen; modifiers transform everything so far. */
  role: 'source' | 'modifier';
  params: readonly ParamSpec[];
  apply(p: Vec3, t: number, params: ParamValues): Vec3;
  /**
   * A modifier that is linear at any fixed `t` (scale, rotate). Earlier joints
   * of the mechanism can be carried through it; through any other modifier
   * they are meaningless, so the mechanism restarts after it.
   */
  linear?: boolean;
  /** Wireframe of the surface a wrap modifier projects onto, as polylines. */
  guide?(params: ParamValues): Vec3[][];
}

const n = (p: ParamValues, k: string) => p[k] as number;
const axisRotate = (axis: string): ((v: Vec3, a: number) => Vec3) =>
  axis === 'x' ? rotateX : axis === 'y' ? rotateY : rotateZ;
const unitAxis = (axis: string): Vec3 => (axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1]);

export const arm: BlockKind = {
  kind: 'arm',
  label: 'Epicycle arm',
  role: 'source',
  params: [
    num('radius', 'Radius', 0.5, 0, 2, 0.01),
    num('freq', 'Frequency', 3, -40, 40, 1),
    num('phase', 'Phase', 0, 0, 360, 1, '°'),
    num('tiltX', 'Tilt X', 0, -180, 180, 1, '°'),
    num('tiltY', 'Tilt Y', 0, -180, 180, 1, '°'),
  ],
  apply(p, t, q) {
    const a = n(q, 'freq') * t + n(q, 'phase') * DEG;
    let v: Vec3 = [n(q, 'radius') * Math.cos(a), n(q, 'radius') * Math.sin(a), 0];
    v = rotateY(rotateX(v, n(q, 'tiltX') * DEG), n(q, 'tiltY') * DEG);
    return [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
  },
};

export const pendulum: BlockKind = {
  kind: 'pendulum',
  label: 'Pendulum',
  role: 'source',
  params: [
    choice('axis', 'Axis', 'x', ['x', 'y', 'z']),
    num('amplitude', 'Amplitude', 0.6, 0, 2, 0.01),
    num('freq', 'Frequency', 2, 0, 20, 0.001),
    num('phase', 'Phase', 0, 0, 360, 1, '°'),
    num('damping', 'Damping', 0, 0, 1, 0.001),
  ],
  apply(p, t, q) {
    const s =
      n(q, 'amplitude') *
      Math.sin(n(q, 'freq') * t + n(q, 'phase') * DEG) *
      Math.exp((-n(q, 'damping') * t) / TAU);
    const ax = unitAxis(q.axis as string);
    return [p[0] + ax[0] * s, p[1] + ax[1] * s, p[2] + ax[2] * s];
  },
};

export const torusKnot: BlockKind = {
  kind: 'torusKnot',
  label: 'Torus winding',
  role: 'source',
  params: [
    num('p', 'Around (p)', 7, 1, 60, 1),
    num('q', 'Through (q)', 17, 1, 60, 1),
    num('R', 'Major radius', 0.7, 0, 2, 0.01),
    num('r', 'Minor radius', 0.3, 0, 1.5, 0.01),
    num('phase', 'Phase', 0, 0, 360, 1, '°'),
  ],
  apply(p, t, q) {
    const u = n(q, 'p') * t;
    const v = n(q, 'q') * t + n(q, 'phase') * DEG;
    const w = n(q, 'R') + n(q, 'r') * Math.cos(v);
    return [p[0] + w * Math.cos(u), p[1] + w * Math.sin(u), p[2] + n(q, 'r') * Math.sin(v)];
  },
};

function sphereAt(radius: number, polar: number, azimuth: number): Vec3 {
  const s = Math.sin(polar);
  return [radius * s * Math.cos(azimuth), radius * s * Math.sin(azimuth), radius * Math.cos(polar)];
}

export const wrapSphere: BlockKind = {
  kind: 'wrapSphere',
  label: 'Wrap onto sphere',
  role: 'modifier',
  params: [
    num('radius', 'Radius', 1, 0.1, 2, 0.01),
    num('wrap', 'Wrap amount', 1.4, 0, 4, 0.01),
  ],
  /** The flat pattern's distance from the origin becomes the polar angle; its
   *  height becomes altitude above the surface. */
  apply([x, y, z], _t, q) {
    return sphereAt(n(q, 'radius') + z, Math.hypot(x, y) * n(q, 'wrap'), Math.atan2(y, x));
  },
  guide(q) {
    const r = n(q, 'radius');
    const lines: Vec3[][] = [];
    for (let m = 0; m < 12; m++) {
      const az = (m / 12) * TAU;
      lines.push(Array.from({ length: 49 }, (_, i) => sphereAt(r, (i / 48) * Math.PI, az)));
    }
    for (let k = 1; k < 7; k++) {
      const pol = (k / 7) * Math.PI;
      lines.push(Array.from({ length: 65 }, (_, i) => sphereAt(r, pol, (i / 64) * TAU)));
    }
    return lines;
  },
};

function torusAt(R: number, r: number, u: number, v: number): Vec3 {
  const w = R + r * Math.cos(v);
  return [w * Math.cos(u), w * Math.sin(u), r * Math.sin(v)];
}

export const wrapTorus: BlockKind = {
  kind: 'wrapTorus',
  label: 'Wrap onto torus',
  role: 'modifier',
  params: [
    num('R', 'Major radius', 0.75, 0.1, 2, 0.01),
    num('r', 'Minor radius', 0.3, 0.02, 1.5, 0.01),
    num('uScale', 'X → around', 1, 0, 10, 0.01),
    num('vScale', 'Y → through', 3.14, 0, 10, 0.01),
    num('uDrift', 'Drift around', 1, -20, 20, 0.01),
    num('vDrift', 'Drift through', 0, -20, 20, 0.01),
  ],
  /** x and y become angles around and through the torus, each with an
   *  optional steady drift; z becomes altitude above the surface. */
  apply([x, y, z], t, q) {
    const u = x * n(q, 'uScale') + n(q, 'uDrift') * t;
    const v = y * n(q, 'vScale') + n(q, 'vDrift') * t;
    return torusAt(n(q, 'R'), n(q, 'r') + z, u, v);
  },
  guide(q) {
    const R = n(q, 'R');
    const r = n(q, 'r');
    const lines: Vec3[][] = [];
    for (let k = 0; k < 24; k++) {
      const u = (k / 24) * TAU;
      lines.push(Array.from({ length: 33 }, (_, i) => torusAt(R, r, u, (i / 32) * TAU)));
    }
    for (let k = 0; k < 8; k++) {
      const v = (k / 8) * TAU;
      lines.push(Array.from({ length: 97 }, (_, i) => torusAt(R, r, (i / 96) * TAU, v)));
    }
    return lines;
  },
};

export const decay: BlockKind = {
  kind: 'decay',
  label: 'Decay',
  role: 'modifier',
  linear: true,
  params: [num('rate', 'Rate per turn', 0.05, 0, 2, 0.001)],
  apply(p, t, q) {
    const k = Math.exp((-n(q, 'rate') * t) / TAU);
    return [p[0] * k, p[1] * k, p[2] * k];
  },
};

export const precess: BlockKind = {
  kind: 'precess',
  label: 'Precess',
  role: 'modifier',
  linear: true,
  params: [
    choice('axis', 'Axis', 'y', ['x', 'y', 'z']),
    num('rate', 'Degrees per turn', 3, -180, 180, 0.1, '°'),
  ],
  apply(p, t, q) {
    return axisRotate(q.axis as string)(p, ((n(q, 'rate') * DEG) * t) / TAU);
  },
};

export const scaleBlock: BlockKind = {
  kind: 'scale',
  label: 'Scale',
  role: 'modifier',
  linear: true,
  params: [
    num('x', 'X', 1, -3, 3, 0.01),
    num('y', 'Y', 1, -3, 3, 0.01),
    num('z', 'Z', 1, -3, 3, 0.01),
  ],
  apply(p, _t, q) {
    return [p[0] * n(q, 'x'), p[1] * n(q, 'y'), p[2] * n(q, 'z')];
  },
};

export const BLOCK_KINDS: readonly BlockKind[] = [
  arm,
  pendulum,
  torusKnot,
  wrapSphere,
  wrapTorus,
  decay,
  precess,
  scaleBlock,
];

const byKind = new Map(BLOCK_KINDS.map((k) => [k.kind, k]));

export function blockKind(kind: string): BlockKind {
  const k = byKind.get(kind);
  if (!k) throw new Error(`agnew: unknown block kind "${kind}"`);
  return k;
}
