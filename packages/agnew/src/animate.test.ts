import { describe, expect, it } from 'vitest';
import { animate, waveAt } from './animate.js';
import { decode, encode, portableDesign, sanitizeDesign } from './codec.js';
import { createBlock, type Design, evaluate } from './design.js';

const base = (extra: Partial<Design> = {}): Design => ({
  version: 2,
  loop: 10,
  passes: 1,
  turns: 1,
  samples: 400,
  blocks: [createBlock('arm', { radius: 1, freq: 1 })],
  ...extra,
});

const radiusAt = (d: Design, seconds: number) => animate(d).at(seconds).blocks[0].params.radius as number;

describe('waveAt', () => {
  it('starts at 0 and rises, for every shape but square', () => {
    expect(waveAt('sine', 0.25)).toBeCloseTo(1, 12);
    expect(waveAt('triangle', 0.25)).toBeCloseTo(1, 12);
    expect(waveAt('triangle', 0.75)).toBeCloseTo(-1, 12);
    expect(waveAt('saw', 0.25)).toBeCloseTo(0.5, 12);
    expect(waveAt('saw', 0.75)).toBeCloseTo(-0.5, 12);
    expect(waveAt('square', 0.1)).toBe(1);
    expect(waveAt('square', 0.6)).toBe(-1);
    expect(waveAt('sine', -0.75)).toBeCloseTo(1, 12);
  });
});

describe('animate', () => {
  it('leaves a still design still, with no motions on it', () => {
    const a = animate(base());
    expect(a.moving).toBe(false);
    expect(a.at(3).blocks[0].params.radius).toBe(1);
  });

  it('swings a wave around the set value over whole cycles of the loop', () => {
    const d = base();
    d.blocks[0].motion = { radius: { kind: 'wave', shape: 'sine', cycles: 2, depth: 0.5, phase: 0 } };
    expect(radiusAt(d, 0)).toBeCloseTo(1, 6);
    expect(radiusAt(d, 1.25)).toBeCloseTo(1.5, 6);
    expect(radiusAt(d, 3.75)).toBeCloseTo(0.5, 6);
    expect(radiusAt(d, 11.25)).toBeCloseTo(1.5, 6);
    expect(animate(d).at(1).blocks[0].motion).toBeUndefined();
  });

  it('reads keys as values through the loop', () => {
    const d = base();
    d.blocks[0].motion = {
      radius: { kind: 'keys', ease: 'linear', stops: [{ at: 0, value: 2 }, { at: 0.5, value: 4 }, { at: 1, value: 2 }] },
    };
    expect(radiusAt(d, 0)).toBeCloseTo(2, 6);
    expect(radiusAt(d, 2.5)).toBeCloseTo(3, 6);
    expect(radiusAt(d, 5)).toBeCloseTo(4, 6);
  });

  it('answers the same at a moment however it got there', () => {
    const d = base();
    d.blocks[0].motion = { radius: { kind: 'wave', shape: 'triangle', cycles: 1, depth: 1, phase: 0.1 } };
    const a = animate(d);
    const at = (s: number) => a.at(s).blocks[0].params.radius as number;
    const forward = [0.5, 2, 7, 9.5].map(at);
    const back = [9.5, 7, 2, 0.5].map(at).reverse();
    forward.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 9));
  });

  it('moves a morph weight, clamped to 0–1', () => {
    const d = base({
      morph: {
        to: { blocks: [createBlock('arm', { radius: 2, freq: 1 })], turns: 1 },
        weight: 0.5,
        motion: { kind: 'wave', shape: 'square', cycles: 1, depth: 0.8, phase: 0 },
      },
    });
    expect(animate(d).at(1).morph?.weight).toBe(1);
    expect(animate(d).at(6).morph?.weight).toBe(0);
  });
});

describe('morph', () => {
  it('blends two curves point by point', () => {
    const d = base({ morph: { to: { blocks: [createBlock('arm', { radius: 3, freq: 1 })], turns: 1 }, weight: 0.5 } });
    expect(evaluate(d).radius).toBeCloseTo(2, 4);
    expect(evaluate({ ...d, morph: { ...d.morph!, weight: 1 } }).radius).toBeCloseTo(3, 4);
  });
});

describe('codec', () => {
  it('round-trips motions, loop, passes, and morph', () => {
    const d = base({ loop: 7, passes: 3 });
    d.blocks[0].motion = { radius: { kind: 'wave', shape: 'saw', cycles: 4, depth: 0.2, phase: 0.3 } };
    d.morph = { to: { blocks: [createBlock('pendulum')], turns: 2 }, weight: 0.4 };
    const back = sanitizeDesign(decode(encode(portableDesign(d))))!;
    expect(back.loop).toBe(7);
    expect(back.passes).toBe(3);
    expect(back.blocks[0].motion).toEqual(d.blocks[0].motion);
    expect(back.morph?.to.blocks[0].kind).toBe('pendulum');
    expect(back.morph?.weight).toBe(0.4);
  });

  it('loads a version 1 design with the default loop', () => {
    const back = sanitizeDesign({ version: 1, turns: 1, samples: 100, blocks: [{ kind: 'arm', params: {} }] })!;
    expect(back.version).toBe(2);
    expect(back.loop).toBe(12);
    expect(back.passes).toBe(1);
  });

  it('drops a motion on a param that is not a number', () => {
    const back = sanitizeDesign({
      blocks: [{ kind: 'pendulum', params: {}, motion: { axis: { kind: 'wave' }, amplitude: { kind: 'wave', depth: 0.1 } } }],
    })!;
    expect(Object.keys(back.blocks[0].motion ?? {})).toEqual(['amplitude']);
  });
});
