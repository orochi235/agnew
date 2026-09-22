import { describe, expect, it } from 'vitest';
import { createBlock, evaluate } from '../design.js';
import { buildRibbon, buildTube, decimate } from './geometry.js';
import { gradientColors } from './palette.js';

const curve = evaluate({ version: 1, turns: 1, samples: 500, blocks: [createBlock('torusKnot', { p: 2, q: 3 })] });
const colors = gradientColors(curve.count, ['#ff0000', '#0000ff']);

describe('buildTube', () => {
  it('puts every ring vertex at the radius from its curve point', () => {
    const t = buildTube(curve.positions, curve.count, colors, 0.05, 8);
    const pos = t.geometry.getAttribute('position');
    expect(pos.count).toBe(curve.count * 9);
    for (let v = 0; v < pos.count; v += 37) {
      const i = Math.floor(v / 9);
      const d = Math.hypot(
        pos.getX(v) - curve.positions[i * 3],
        pos.getY(v) - curve.positions[i * 3 + 1],
        pos.getZ(v) - curve.positions[i * 3 + 2],
      );
      expect(d).toBeCloseTo(0.05, 5);
    }
  });

  it('reveals whole segments in curve order', () => {
    const t = buildTube(curve.positions, curve.count, colors, 0.05, 8);
    expect(t.indicesUpTo(0)).toBe(0);
    expect(t.indicesUpTo(10)).toBe(10 * 8 * 6);
    expect(t.indicesUpTo(1e9)).toBe(t.geometry.getIndex()!.count);
  });
});

describe('buildRibbon', () => {
  it('spans the full width at every point', () => {
    const r = buildRibbon(curve.positions, curve.count, colors, 0.1, 5);
    const pos = r.geometry.getAttribute('position');
    for (let i = 0; i < curve.count; i += 23) {
      const a = 2 * i;
      const d = Math.hypot(pos.getX(a) - pos.getX(a + 1), pos.getY(a) - pos.getY(a + 1), pos.getZ(a) - pos.getZ(a + 1));
      expect(d).toBeCloseTo(0.1, 5);
    }
  });
});

describe('gradientColors', () => {
  it('starts and ends on the first and last stops', () => {
    const c = gradientColors(10, ['#ff0000', '#00ff00', '#0000ff']);
    expect([c[0], c[1], c[2]]).toEqual([1, 0, 0]);
    expect([c[27], c[28], c[29]]).toEqual([0, 0, 1]);
  });
});

describe('decimate', () => {
  it('keeps the first and last point', () => {
    const d = decimate(curve.positions, curve.count, 50);
    expect(d.count).toBe(50);
    expect(Array.from(d.positions.slice(-3))).toEqual(Array.from(curve.positions.slice(-3)));
    expect(Array.from(d.positions.slice(0, 3))).toEqual(Array.from(curve.positions.slice(0, 3)));
  });
});
