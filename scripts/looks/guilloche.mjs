// Guilloché studies: fine families of interlocking lines, in a soft glow and
// as dark ink on paper.

import { createBlock, presetByName } from '../../packages/agnew/dist/index.js';
import { DEFAULT_VIEW, STYLE_DEFAULTS } from '../../packages/agnew/dist/three/index.js';

const design = (turns, samples, blocks) => ({
  version: 1,
  turns,
  samples,
  blocks: blocks.map(([kind, params]) => createBlock(kind, params)),
});

const base = (style, patch) => ({
  ...DEFAULT_VIEW,
  ...STYLE_DEFAULTS[style],
  style,
  autoRotate: false,
  fit: 'tight',
  azimuth: 0,
  elevation: 0,
  ...patch,
  layers: DEFAULT_VIEW.layers,
});
const glow = (patch = {}) => base('neon', { palette: 'grayscale', lineOpacity: 0.22, bloom: 0.25, lineWidth: 1.2, ...patch });
const engraved = (patch = {}) =>
  base('ink', { palette: 'banknote', background: '#efe9d8', lineOpacity: 0.85, lineWidth: 0.9, bloom: 0, ...patch });

/** Harmonograph on a torus, its passes spread by a drift through the tube,
 *  seen through a patch. */
function spreadPatch(turns, samples) {
  const d = presetByName('Harmonograph on a torus').design();
  d.turns = turns;
  d.samples = samples;
  d.blocks[2].params.vDrift = 0.137;
  d.blocks.push(createBlock('torusPatch', { u0: -60, v0: -180, u1: 60, v1: 180, turn: 20 }));
  return d;
}

/** A torus knot's straight passes, wiggled by a fast small pendulum, through
 *  a patch: wavy hatching. */
const hatch = (turn) =>
  design(1, 90000, [
    ['torusKnot', { p: 7, q: 113, R: 0.72, r: 0.3 }],
    ['pendulum', { axis: 'x', amplitude: 0.025, freq: 640, phase: 0 }],
    ['torusPatch', { u0: -60, v0: -180, u1: 60, v1: 180, turn }],
  ]);

/** Spirograph arms just off a whole-number ratio, filling a ring. */
const rosette = design(40, 140000, [
  ['arm', { radius: 0.62, freq: 1 }],
  ['arm', { radius: 0.3, freq: -17.03 }],
  ['arm', { radius: 0.06, freq: 97 }],
]);

/** A slow sweep across with a fast wave whose phase drifts each pass. */
const band = design(30, 120000, [
  ['pendulum', { axis: 'x', amplitude: 1, freq: 1, phase: 90 }],
  ['pendulum', { axis: 'y', amplitude: 0.12, freq: 53.017, phase: 0 }],
  ['pendulum', { axis: 'y', amplitude: 0.05, freq: 7.003, phase: 30 }],
]);

const card = { width: 1600, height: 1000 };
const square = { width: 1200, height: 1200 };
const banner = { width: 1920, height: 240 };
const topbar = { width: 3000, height: 100 };

export const LOOKS = [
  { name: 'Spread patch, glow', ...card, design: spreadPatch(12, 40000), view: glow() },
  { name: 'Spread patch, engraved', ...card, design: spreadPatch(12, 40000), view: engraved() },
  { name: 'Spread patch dense, engraved', ...card, design: spreadPatch(36, 120000), view: engraved({ lineWidth: 0.7, lineOpacity: 0.7 }) },
  { name: 'Hatch, engraved', ...card, design: hatch(0), view: engraved({ lineWidth: 0.7 }) },
  { name: 'Hatch turned, glow', ...card, design: hatch(25), view: glow({ lineOpacity: 0.3 }) },
  { name: 'Rosette, engraved', ...square, design: rosette, view: engraved({ lineWidth: 0.6, lineOpacity: 0.75 }) },
  { name: 'Rosette, glow', ...square, design: rosette, view: glow({ lineOpacity: 0.12, lineWidth: 0.9 }) },
  { name: 'Band, engraved', ...banner, design: band, view: engraved({ lineWidth: 0.7 }) },
  { name: 'Band, glow', ...banner, design: band, view: glow({ lineOpacity: 0.18 }) },
  { name: 'Spread patch top bar, engraved', ...topbar, design: spreadPatch(36, 120000), view: engraved({ lineWidth: 0.6 }) },
  { name: 'Spread patch top bar, glow', ...topbar, design: spreadPatch(36, 120000), view: glow({ lineOpacity: 0.15, lineWidth: 0.8 }) },
];

/** Round two: lighter bands, more rosettes, a sparser top bar. */
const thinBand = design(10, 60000, [
  ['pendulum', { axis: 'x', amplitude: 1, freq: 1, phase: 90 }],
  ['pendulum', { axis: 'y', amplitude: 0.06, freq: 23.011, phase: 0 }],
  ['pendulum', { axis: 'y', amplitude: 0.03, freq: 3.007, phase: 30 }],
]);
const fiveLobe = design(30, 140000, [
  ['arm', { radius: 0.5, freq: 1 }],
  ['arm', { radius: 0.35, freq: -4.02 }],
  ['arm', { radius: 0.1, freq: 61 }],
]);
const lace = design(24, 140000, [
  ['arm', { radius: 0.7, freq: 1 }],
  ['arm', { radius: 0.18, freq: 41.013 }],
  ['arm', { radius: 0.08, freq: -7.003 }],
]);
const fineHatch = design(1, 120000, [
  ['torusKnot', { p: 5, q: 151, R: 0.72, r: 0.3 }],
  ['pendulum', { axis: 'x', amplitude: 0.008, freq: 900, phase: 0 }],
  ['torusPatch', { u0: -45, v0: -180, u1: 45, v1: 180, turn: 12 }],
]);

LOOKS.push(
  { name: 'Thin band, engraved', ...banner, design: thinBand, view: engraved({ lineWidth: 0.7, lineOpacity: 0.8 }) },
  { name: 'Five lobe rosette, engraved', ...square, design: fiveLobe, view: engraved({ lineWidth: 0.55, lineOpacity: 0.7 }) },
  { name: 'Lace rosette, engraved', ...square, design: lace, view: engraved({ lineWidth: 0.55, lineOpacity: 0.7 }) },
  { name: 'Lace rosette, glow', ...square, design: lace, view: glow({ lineOpacity: 0.1, lineWidth: 0.8 }) },
  { name: 'Fine hatch, engraved', ...card, design: fineHatch, view: engraved({ lineWidth: 0.6 }) },
  { name: 'Sparse patch top bar, engraved', ...topbar, design: spreadPatch(8, 40000), view: engraved({ lineWidth: 0.7 }) },
);
