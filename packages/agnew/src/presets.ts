import { createBlock, type Design } from './design.js';
import type { ParamValues } from './params.js';

export interface Preset {
  name: string;
  /** Which of the four families it comes from, or `combo`. */
  family: 'epicycles' | 'sphere' | 'torus' | 'harmonograph' | 'combo';
  design: () => Design;
}

const design = (turns: number, samples: number, blocks: [string, ParamValues][]): Design => ({
  version: 1,
  turns,
  samples,
  blocks: blocks.map(([kind, params]) => createBlock(kind, params)),
});

export const PRESETS: readonly Preset[] = [
  {
    name: 'Torus knot',
    family: 'torus',
    design: () => design(1, 8000, [['torusKnot', { p: 7, q: 17, R: 0.7, r: 0.3 }]]),
  },
  {
    name: 'Woven band',
    family: 'torus',
    design: () => design(1, 16000, [['torusKnot', { p: 5, q: 72, R: 0.75, r: 0.16 }]]),
  },
  {
    name: 'Harmonograph',
    family: 'harmonograph',
    design: () =>
      design(20, 50000, [
        ['pendulum', { axis: 'x', amplitude: 0.75, freq: 2, phase: 0, damping: 0.02 }],
        ['pendulum', { axis: 'y', amplitude: 0.75, freq: 3.02, phase: 90, damping: 0.02 }],
        ['pendulum', { axis: 'z', amplitude: 0.5, freq: 4.03, phase: 30, damping: 0.02 }],
        ['pendulum', { axis: 'x', amplitude: 0.15, freq: 6.01, phase: 70, damping: 0.03 }],
      ]),
  },
  {
    name: 'Lissajous cage',
    family: 'harmonograph',
    design: () =>
      design(1, 6000, [
        ['pendulum', { axis: 'x', amplitude: 0.8, freq: 3, phase: 90 }],
        ['pendulum', { axis: 'y', amplitude: 0.8, freq: 4, phase: 0 }],
        ['pendulum', { axis: 'z', amplitude: 0.8, freq: 5, phase: 30 }],
      ]),
  },
  {
    name: 'Harmonograph on a torus',
    family: 'combo',
    design: () =>
      design(12, 40000, [
        ['pendulum', { axis: 'x', amplitude: 0.5, freq: 3.01, phase: 0, damping: 0.02 }],
        ['pendulum', { axis: 'y', amplitude: 1, freq: 5.02, phase: 40, damping: 0.02 }],
        ['wrapTorus', { R: 0.72, r: 0.3, uScale: 1, vScale: 3.14, uDrift: 1, vDrift: 0 }],
      ]),
  },
  {
    name: 'Gear train',
    family: 'epicycles',
    design: () =>
      design(1, 8000, [
        ['arm', { radius: 0.8, freq: 1 }],
        ['arm', { radius: 0.4, freq: -11, tiltX: 40 }],
        ['arm', { radius: 0.18, freq: 23, tiltX: 85, tiltY: 30 }],
      ]),
  },
  {
    name: 'Precessing gears',
    family: 'epicycles',
    design: () =>
      design(10, 30000, [
        ['arm', { radius: 0.7, freq: 1 }],
        ['arm', { radius: 0.35, freq: -4.1, tiltX: 30 }],
        ['precess', { axis: 'x', rate: 18 }],
      ]),
  },
  {
    name: 'Globe rosette',
    family: 'sphere',
    design: () =>
      design(5, 16000, [
        ['arm', { radius: 0.55, freq: 1 }],
        ['arm', { radius: 0.3, freq: -3.2 }],
        ['wrapSphere', { radius: 0.9, wrap: 1.6 }],
      ]),
  },
  {
    name: 'Nautilus',
    family: 'combo',
    design: () =>
      design(16, 40000, [
        ['torusKnot', { p: 1, q: 9, R: 0.8, r: 0.35 }],
        ['decay', { rate: 0.06 }],
        ['precess', { axis: 'z', rate: 22.5 }],
      ]),
  },
  {
    name: 'Orbiting spirograph',
    family: 'combo',
    design: () =>
      design(12, 36000, [
        ['arm', { radius: 0.3, freq: 1 }],
        ['arm', { radius: 0.16, freq: -6.02 }],
        ['wrapTorus', { R: 0.72, r: 0.26, uScale: 1, vScale: 5, uDrift: 1 / 12, vDrift: 0 }],
      ]),
  },
];

export function presetByName(name: string): Preset | undefined {
  return PRESETS.find((p) => p.name === name);
}
