import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../vec.js';
import {
  angleOf,
  CAMERA_PRESETS,
  directionFor,
  fovFor,
  halfTangents,
  orbitDistance,
  SHAPE_NAMES,
  shapeBox,
  stretchFor,
  tightFraming,
} from './framing.js';

const basis: { right: Vec3; up: Vec3; back: Vec3 } = { right: [1, 0, 0], up: [0, 1, 0], back: [0, 0, 1] };

/** Screen extents of the points, as tangents, from a camera panned by `pan` at distance `d`. */
function extents(points: number[], d: number, pan: [number, number]) {
  const e = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
  for (let i = 0; i < points.length; i += 3) {
    const depth = d - points[i + 2];
    const x = (points[i] - pan[0]) / depth;
    const y = (points[i + 1] - pan[1]) / depth;
    e.left = Math.min(e.left, x);
    e.right = Math.max(e.right, x);
    e.bottom = Math.min(e.bottom, y);
    e.top = Math.max(e.top, y);
  }
  return e;
}

describe('fovFor', () => {
  it('keeps 40° for ordinary and tall frames', () => {
    expect(fovFor(1.6)).toBe(40);
    expect(fovFor(0.25)).toBe(40);
  });

  it('narrows the vertical angle so a very wide frame spans 70° across', () => {
    const [, tx] = halfTangents(fovFor(8), 8);
    expect((2 * Math.atan(tx) * 180) / Math.PI).toBeCloseTo(70, 6);
  });
});

describe('orbitDistance', () => {
  it('is limited by the narrower half-angle', () => {
    const [ty, tx] = halfTangents(40, 0.5);
    expect(orbitDistance(1, ty, tx)).toBeCloseTo(orbitDistance(1, tx, tx));
    expect(orbitDistance(1, ty, tx)).toBeGreaterThan(orbitDistance(1, ty, ty));
  });
});

describe('tightFraming', () => {
  it('fills a wide frame with a wide strip, inside the margin', () => {
    const pts = [-4, -0.5, 0, 4, 0.5, 0, 0, 0, 0.3];
    const [ty, tx] = halfTangents(40, 8);
    const f = tightFraming(new Float32Array(pts), 3, basis, ty, tx);
    const e = extents(pts, f.distance, f.pan);
    expect(Math.max(e.right, -e.left)).toBeLessThanOrEqual(tx / 1.08 + 1e-9);
    expect(Math.max(e.top, -e.bottom)).toBeLessThanOrEqual(ty / 1.08 + 1e-9);
    expect(Math.max(e.right / tx, e.top / ty)).toBeCloseTo(1 / 1.08, 4);
  });

  it('pans so a strip receding in depth sits centered rather than off to one side', () => {
    const pts = [-3, 0, -0.5, 3, 0, 0.5, -3, 0.3, -0.5, 3, -0.3, 0.5];
    const [ty, tx] = halfTangents(40, 8);
    const f = tightFraming(new Float32Array(pts), 4, basis, ty, tx);
    const e = extents(pts, f.distance, f.pan);
    expect(f.pan[0]).not.toBeCloseTo(0, 2);
    expect(e.left).toBeCloseTo(-e.right, 6);
    expect(e.right).toBeCloseTo(tx / 1.08, 4);
  });
});

describe('directionFor', () => {
  it('looks from +z at azimuth 0 and from +x at azimuth 90, level at elevation 0', () => {
    const z = directionFor(0, 0);
    const x = directionFor(90, 0);
    expect(z[0]).toBeCloseTo(0, 12);
    expect(z[2]).toBeCloseTo(1, 12);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(0, 12);
  });

  it('round-trips through angleOf', () => {
    for (const [az, el] of [[19, 15], [-120, 40], [170, -60], [0, 0]]) {
      const a = angleOf(directionFor(az, el));
      expect(a.azimuth).toBeCloseTo(az, 9);
      expect(a.elevation).toBeCloseTo(el, 9);
    }
  });

  it('stops short of straight up', () => {
    expect(angleOf(directionFor(0, 90)).elevation).toBeCloseTo(89.5, 9);
  });
});

describe('shapeBox', () => {
  const area = { x: 10, y: 20, width: 1000, height: 600 };

  it('is the whole area when free', () => {
    expect(shapeBox(area, 'free')).toEqual(area);
  });

  it('centers the widest box of the shape inside the area', () => {
    expect(shapeBox(area, 'banner')).toEqual({ x: 10, y: 20 + (600 - 125) / 2, width: 1000, height: 125 });
    const tall = shapeBox(area, 'sidebar');
    expect(tall.height).toBe(600);
    expect(tall.width).toBe(150);
    expect(tall.x).toBe(10 + (1000 - 150) / 2);
  });
});

describe('stretchFor', () => {
  it("brings a square curve's ratio to the aspect, squashing depth with the short side", () => {
    const square = new Float32Array([-1, -1, 0, 1, 1, 0]);
    const [x, y, z] = stretchFor(square, 2, 8);
    expect(x / y).toBeCloseTo(8, 9);
    expect(z).toBe(y);
  });

  it('stays within the scale limits for extreme aspects', () => {
    const square = new Float32Array([-1, -1, 0, 1, 1, 0]);
    for (const k of stretchFor(square, 2, 30)) expect(Math.abs(k)).toBeLessThanOrEqual(3);
  });
});

describe('CAMERA_PRESETS', () => {
  it('offers some for every shape, and the top bar keeps azimuth 0 so x stays level', () => {
    for (const shape of SHAPE_NAMES) expect(CAMERA_PRESETS[shape].length).toBeGreaterThan(1);
    for (const shape of ['topbar'] as const) {
      for (const c of CAMERA_PRESETS[shape]) expect(c.azimuth).toBe(0);
    }
  });
});
