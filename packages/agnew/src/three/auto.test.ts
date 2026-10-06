import { describe, expect, it } from 'vitest';
import { createBlock, evaluate } from '../design.js';
import { autoBloom, autoLineOpacity, autoLineWidth, coverage } from './auto.js';

const frame = (width: number, height: number) => ({ x: 0, y: 0, width, height });
const knot = (samples: number) =>
  evaluate({ version: 1, turns: 1, samples, blocks: [createBlock('torusKnot', { p: 5, q: 72 })] });

describe('autoLineWidth', () => {
  it('thins out in a short strip and stops at the usual weight in a window', () => {
    expect(autoLineWidth(frame(1080, 36))).toBeCloseTo(0.6, 9);
    expect(autoLineWidth(frame(1600, 900))).toBe(2);
  });
});

describe('coverage', () => {
  it('climbs as the same curve is squeezed into a smaller frame', () => {
    const c = knot(8000);
    expect(coverage(c, frame(300, 300), 1.5)).toBeGreaterThan(coverage(c, frame(900, 900), 1.5));
  });
});

describe('autoLineOpacity and autoBloom', () => {
  it('keep the style default when sparse and dim as coverage climbs', () => {
    expect(autoLineOpacity('neon', 0.1)).toBeCloseTo(0.55, 9);
    expect(autoLineOpacity('neon', 8)).toBeLessThan(0.2);
    expect(autoBloom('neon', 0.5)).toBeCloseTo(0.9, 9);
    expect(autoBloom('neon', 9)).toBeCloseTo(0.3, 9);
    expect(autoBloom('ink', 0.5)).toBe(0);
  });
});
