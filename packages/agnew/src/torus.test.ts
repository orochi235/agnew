import { describe, expect, it } from 'vitest';
import { sanitizeDesign } from './codec.js';
import { createBlock, evaluate, sampleCount } from './design.js';
import { torusAt } from './torus.js';

const R = 0.7;
const r = 0.3;
const angles = [-2.5, -1, 0, 0.4, 1.9, 3, 7.5];

describe('torusAt', () => {
  it('is the usual torus around z when nothing is unrolled', () => {
    for (const u of angles) {
      for (const v of angles) {
        const w = R + r * Math.cos(v);
        const [x, y, z] = torusAt(R, r, u, v);
        expect(x).toBeCloseTo(w * Math.cos(u), 12);
        expect(y).toBeCloseTo(w * Math.sin(u), 12);
        expect(z).toBeCloseTo(r * Math.sin(v), 12);
      }
    }
  });

  it('is a flat rectangle along x when fully unrolled', () => {
    for (const u of angles) {
      for (const v of angles) {
        const [x, y, z] = torusAt(R, r, u, v, 1, 1);
        expect(x).toBeCloseTo(R * (u + Math.PI / 2), 12);
        expect(y).toBeCloseTo(-R - r * (v + Math.PI / 2), 12);
        expect(z).toBeCloseTo(-r, 12);
      }
    }
  });

  it('keeps arc length around the major circle part way unrolled', () => {
    const du = 1e-4;
    for (const s of [0.25, 0.5, 0.9]) {
      for (const u of angles) {
        const a = torusAt(R, 0, u, 0, s, 0);
        const b = torusAt(R, 0, u + du, 0, s, 0);
        expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / du).toBeCloseTo(R, 6);
      }
    }
  });

  it('moves smoothly as the unroll amount crosses toward 1', () => {
    const near = torusAt(R, r, 2, 1, 1 - 1e-7, 1 - 1e-7);
    const flat = torusAt(R, r, 2, 1, 1, 1);
    for (let i = 0; i < 3; i++) expect(near[i]).toBeCloseTo(flat[i], 5);
  });
});

describe('auto params', () => {
  const design = (patch: Record<string, number | string>) => ({
    version: 1 as const,
    turns: 12,
    samples: 20000,
    blocks: [
      createBlock('pendulum', { axis: 'x', amplitude: 0.5, freq: 3.01 }),
      createBlock('pendulum', { axis: 'y', amplitude: 1, freq: 5.02, phase: 40 }),
      createBlock('wrapTorus', { R: 0.9, r: 0.25 }),
      createBlock('torusPatch', patch),
    ],
  });

  it("reads a patch's auto radii from the torus above it", () => {
    const auto = evaluate(design({ R: 'auto', r: 'auto' }));
    const pinned = evaluate(design({ R: 0.9, r: 0.25 }));
    expect(Array.from(auto.positions.slice(0, 300))).toEqual(Array.from(pinned.positions.slice(0, 300)));
  });

  it("makes an auto patch as wide as the frame it is evaluated for", () => {
    const c = evaluate(design({ aspect: 'auto', u0: -180, u1: 180, v0: -180, v1: 180 }), { aspect: 20 });
    let x = 0;
    for (let i = 0; i < c.count; i++) if (Number.isFinite(c.positions[i * 3])) x = Math.max(x, Math.abs(c.positions[i * 3]));
    expect(x).toBeGreaterThan(9);
    expect(x).toBeLessThanOrEqual(10);
  });

  it('keeps auto through sanitizing, and picks more samples for a longer curve', () => {
    const saved = sanitizeDesign({ ...design({ R: 'auto' }), samples: 'auto' });
    expect(saved?.samples).toBe('auto');
    expect(saved?.blocks[3].params.R).toBe('auto');
    const short = sampleCount({ ...design({}), turns: 1, samples: 'auto' });
    const long = sampleCount({ ...design({}), turns: 12, samples: 'auto' });
    expect(long).toBeGreaterThan(short);
  });
});
