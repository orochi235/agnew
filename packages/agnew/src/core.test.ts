import { describe, expect, it } from 'vitest';
import { decode, encode, portableDesign, sanitizeDesign } from './codec.js';
import { createBlock, type Design, evaluate, evaluateAt } from './design.js';
import { parallelTransport } from './frames.js';
import { PRESETS } from './presets.js';

const design = (blocks: Design['blocks'], turns = 1, samples = 2000): Design => ({
  version: 1,
  blocks,
  turns,
  samples,
});

const point = (c: { positions: Float32Array }, i: number) => [
  c.positions[i * 3],
  c.positions[i * 3 + 1],
  c.positions[i * 3 + 2],
];

describe('evaluate', () => {
  it('closes a torus knot after one turn', () => {
    const c = evaluate(design([createBlock('torusKnot', { p: 3, q: 7 })]));
    const a = point(c, 0);
    const b = point(c, c.count - 1);
    for (let k = 0; k < 3; k++) expect(b[k]).toBeCloseTo(a[k], 5);
  });

  it('keeps a flat pattern wrapped onto a sphere on that sphere', () => {
    const c = evaluate(
      design([
        createBlock('arm', { radius: 0.5, freq: 1 }),
        createBlock('arm', { radius: 0.3, freq: -5 }),
        createBlock('wrapSphere', { radius: 1.3 }),
      ]),
    );
    for (let i = 0; i < c.count; i += 97) expect(Math.hypot(...point(c, i))).toBeCloseTo(1.3, 5);
  });

  it('shrinks a damped pendulum over time', () => {
    const c = evaluate(design([createBlock('pendulum', { freq: 5, damping: 0.5 })], 10, 20000));
    const peak = (from: number, to: number) => {
      let m = 0;
      for (let i = from; i < to; i++) m = Math.max(m, Math.abs(point(c, i)[0]));
      return m;
    };
    expect(peak(18000, 20000)).toBeLessThan(peak(0, 2000) * 0.2);
  });

  it('measures arc length', () => {
    const c = evaluate(design([createBlock('arm', { radius: 1, freq: 1 })], 1, 4000));
    expect(c.length).toBeCloseTo(Math.PI * 2, 3);
  });

  it('skips disabled blocks', () => {
    const off = createBlock('arm', { radius: 2 });
    off.enabled = false;
    const c = evaluate(design([createBlock('arm', { radius: 0.5 }), off]));
    expect(c.radius).toBeCloseTo(0.5, 5);
  });

  it('fills params missing from an older saved block with defaults', () => {
    const b = createBlock('torusKnot');
    b.params = { p: 2 };
    expect(Number.isFinite(evaluate(design([b])).radius)).toBe(true);
  });
});

describe('evaluateAt', () => {
  it('chains the arms from the origin to the pen', () => {
    const d = design([createBlock('arm', { radius: 1, freq: 1 }), createBlock('arm', { radius: 0.5, freq: 3 })]);
    const m = evaluateAt(d, 0.7);
    expect(m.joints).toHaveLength(3);
    expect(m.joints[0]).toEqual([0, 0, 0]);
    expect(m.joints[2]).toEqual(m.point);
    expect(Math.hypot(...m.joints[1])).toBeCloseTo(1, 6);
  });

  it('carries joints through a linear modifier and restarts after a wrap', () => {
    const d = design([
      createBlock('arm', { radius: 1, freq: 1 }),
      createBlock('scale', { x: 2, y: 2, z: 2 }),
    ]);
    expect(Math.hypot(...evaluateAt(d, 0.3).joints[1])).toBeCloseTo(2, 6);

    const wrapped = design([createBlock('arm', { radius: 0.5 }), createBlock('wrapTorus')]);
    const m = evaluateAt(wrapped, 0.3);
    expect(m.joints).toEqual([m.point]);
    expect(m.guides.length).toBeGreaterThan(0);
  });

  it('matches evaluate at the same time', () => {
    const d = PRESETS.find((p) => p.name === 'Nautilus')!.design();
    const c = evaluate(d);
    const i = 1234;
    const t = (i / (c.count - 1)) * d.turns * Math.PI * 2;
    const m = evaluateAt(d, t);
    for (let k = 0; k < 3; k++) expect(m.point[k]).toBeCloseTo(point(c, i)[k], 5);
  });
});

describe('presets', () => {
  it.each(PRESETS.map((p) => [p.name, p]))('%s produces a finite, non-empty curve', (_n, p) => {
    const c = evaluate({ ...p.design(), samples: 3000 });
    expect(c.radius).toBeGreaterThan(0.1);
    expect(c.radius).toBeLessThan(5);
    expect(c.positions.every(Number.isFinite)).toBe(true);
  });
});

describe('codec', () => {
  it('round-trips a design through a URL-safe string', () => {
    const d = PRESETS[2].design();
    const text = encode(portableDesign(d));
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = sanitizeDesign(decode(text))!;
    expect(back.blocks.map((b) => [b.kind, b.params])).toEqual(d.blocks.map((b) => [b.kind, b.params]));
    expect(back.turns).toBe(d.turns);
  });

  it('drops unknown kinds and bad params from untrusted input', () => {
    const back = sanitizeDesign({
      blocks: [
        { kind: 'nope' },
        { kind: 'arm', params: { radius: 'big', freq: 5 } },
        { kind: 'pendulum', params: { axis: 'w' } },
      ],
      turns: -4,
    })!;
    expect(back.blocks.map((b) => b.kind)).toEqual(['arm', 'pendulum']);
    expect(back.blocks[0].params.radius).toBe(0.5);
    expect(back.blocks[0].params.freq).toBe(5);
    expect(back.blocks[1].params.axis).toBe('x');
    expect(back.turns).toBe(0.01);
    expect(sanitizeDesign('garbage')).toBeNull();
  });
});

describe('parallelTransport', () => {
  it('gives orthonormal frames that do not flip', () => {
    const c = evaluate(design([createBlock('torusKnot', { p: 2, q: 5 })], 1, 1000));
    const f = parallelTransport(c.positions, c.count);
    const v = (a: Float32Array, i: number) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (let i = 0; i < c.count; i++) {
      const t = v(f.tangents, i);
      const n = v(f.normals, i);
      const b = v(f.binormals, i);
      expect(dot(t, t)).toBeCloseTo(1, 4);
      expect(dot(n, n)).toBeCloseTo(1, 4);
      expect(dot(t, n)).toBeCloseTo(0, 4);
      expect(dot(t, b)).toBeCloseTo(0, 4);
      if (i > 0) expect(dot(n, v(f.normals, i - 1))).toBeGreaterThan(0.9);
    }
  });
});
