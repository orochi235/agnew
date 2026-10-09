import { describe, expect, it } from 'vitest';
import { BLOCK_KINDS } from '../blocks.js';
import { createBlock, type Design } from '../design.js';
import { PRESETS } from '../presets.js';
import { BLOCK_GLSL, curveProgram } from './glsl.js';

describe('curveProgram', () => {
  it('has GLSL for every block kind', () => {
    for (const k of BLOCK_KINDS) expect(BLOCK_GLSL[k.kind], k.kind).toBeTypeOf('function');
  });

  it('builds every preset, with a uniform for each number param', () => {
    for (const p of PRESETS) {
      const prog = curveProgram(p.design(), { aspect: 1.5 });
      expect(prog.glsl).toContain('vec3 agnewCurve(float u)');
      expect(prog.values.length % 4).toBe(0);
      expect([...prog.values].every(Number.isFinite)).toBe(true);
    }
  });

  it('keeps one key while only numbers change, and a new one for a choice', () => {
    const d = (amp: number, axis: string): Design => ({
      version: 2,
      loop: 12,
      passes: 1,
      turns: 1,
      samples: 100,
      blocks: [createBlock('pendulum', { amplitude: amp, axis })],
    });
    expect(curveProgram(d(0.2, 'x')).key).toBe(curveProgram(d(0.9, 'x')).key);
    expect(curveProgram(d(0.2, 'x')).key).not.toBe(curveProgram(d(0.2, 'y')).key);
  });
});
