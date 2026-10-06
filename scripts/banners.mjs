#!/usr/bin/env node
// Curves stretched to fill rects of different shapes — a long top bar, a
// header, a card, a sidebar — for backgrounds, and torus curves unrolled
// into strips for the long ones. Needs the lab dev server
// running and `npm run build -w agnew`. Each look is squashed with a scale
// block toward the rect's aspect and framed with the view's tight fit, then
// rendered at that rect's size in the lab's ?bare mode.
//
//   node scripts/banners.mjs [--url http://localhost:5190] [--out banners] [--only <substring>]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createBlock, encode, evaluate, portableDesign, presetByName } from '../packages/agnew/dist/index.js';
import { DEFAULT_VIEW, STYLE_DEFAULTS } from '../packages/agnew/dist/three/index.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5190' },
    out: { type: 'string', default: 'banners' },
    only: { type: 'string', default: '' },
  },
});

/** Rect sizes in CSS pixels; device scale 2 doubles them. */
const SHAPES = [
  { name: 'topbar', width: 1920, height: 240 },
  { name: 'long-topbar', width: 2560, height: 128 },
  { name: 'header', width: 1600, height: 400 },
  { name: 'card', width: 1200, height: 600 },
  { name: 'sidebar', width: 320, height: 1280 },
];

/** Scale factors that bring `design`'s width-to-height ratio to `aspect`,
 *  within the scale block's ±3. Depth is squashed with the short side, or
 *  the oblique camera turns it back into height. */
function stretch(design, aspect) {
  const c = evaluate({ ...design, samples: Math.min(design.samples, 6000) });
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (let i = 0; i < c.count; i++) {
    for (let k = 0; k < 2; k++) {
      lo[k] = Math.min(lo[k], c.positions[i * 3 + k]);
      hi[k] = Math.max(hi[k], c.positions[i * 3 + k]);
    }
  }
  const m = (aspect * (hi[1] - lo[1])) / Math.max(hi[0] - lo[0], 1e-6);
  if (m >= 1) {
    const x = Math.min(3, Math.sqrt(m));
    return { x, y: x / m, z: x / m };
  }
  const y = Math.min(3, 1 / Math.sqrt(m));
  return { x: y * m, y, z: y * m };
}

const design = (turns, samples, blocks) => ({
  version: 1,
  turns,
  samples,
  blocks: blocks.map(([kind, params]) => createBlock(kind, params)),
});
const preset = (name) => presetByName(name).design();

/** `d` with every torus block unrolled by `around` and `through`. */
function unrolled(d, around, through) {
  const blocks = d.blocks.map((b) =>
    b.kind === 'torusKnot' || b.kind === 'wrapTorus' ? { ...b, params: { ...b.params, unrollU: around, unrollV: through } } : b,
  );
  return { ...d, blocks };
}

/** Shapes the unrolled strips go into; they are long by nature. */
const STRIPS = ['topbar', 'long-topbar', 'header'];

function view(style, patch = {}) {
  return { ...DEFAULT_VIEW, ...STYLE_DEFAULTS[style], style, autoRotate: false, fit: 'tight', azimuth: 0, ...patch, layers: DEFAULT_VIEW.layers };
}

const LOOKS = [
  { name: 'Woven band, ice', design: preset('Woven band'), view: view('neon', { palette: 'ice', lineOpacity: 0.3, bloom: 0.6 }) },
  { name: 'Woven band, ink', design: preset('Woven band'), view: view('ink', { lineOpacity: 0.35, lineWidth: 1 }) },
  { name: 'Harmonograph, ember', design: preset('Harmonograph'), view: view('neon', { palette: 'ember', lineOpacity: 0.22, bloom: 0.7 }) },
  { name: 'Harmonograph, ink', design: preset('Harmonograph'), view: view('ink', { lineOpacity: 0.3, lineWidth: 0.9 }) },
  { name: 'Torus knot, aurora', design: preset('Torus knot'), view: view('neon', { lineOpacity: 0.35, bloom: 0.7 }) },
  { name: 'Nautilus, spectrum', design: preset('Nautilus'), view: view('neon', { palette: 'spectrum', lineOpacity: 0.2, bloom: 0.5 }) },
  { name: 'Precessing gears, mono', design: preset('Precessing gears'), view: view('neon', { palette: 'mono', background: '#0b0d12', lineOpacity: 0.14, bloom: 0.3, lineWidth: 1.2 }) },
  { name: 'Orbiting spirograph, ice ribbon', design: preset('Orbiting spirograph'), view: view('ribbon', { ribbonWidth: 0.02 }) },
  {
    name: 'Moire drift',
    design: design(1, 30000, [['torusKnot', { p: 3, q: 101, R: 0.75, r: 0.25 }]]),
    view: view('neon', { palette: 'aurora', lineOpacity: 0.25, bloom: 0.5, lineWidth: 1.1 }),
  },
  {
    name: 'Comb',
    design: design(1, 20000, [
      ['pendulum', { axis: 'x', amplitude: 0.95, freq: 1, phase: 0 }],
      ['pendulum', { axis: 'y', amplitude: 0.25, freq: 37, phase: 0 }],
      ['pendulum', { axis: 'z', amplitude: 0.3, freq: 2, phase: 30 }],
    ]),
    view: view('neon', { palette: 'ice', lineOpacity: 0.35, bloom: 0.6 }),
  },
  {
    name: 'Slow orbit',
    design: design(30, 60000, [
      ['arm', { radius: 0.6, freq: 1 }],
      ['arm', { radius: 0.3, freq: -7.03 }],
      ['arm', { radius: 0.08, freq: 31, tiltX: 60 }],
    ]),
    view: view('neon', { palette: 'aurora', lineOpacity: 0.12, bloom: 0.4, lineWidth: 1 }),
  },
  {
    name: 'Brass loom',
    design: design(1, 24000, [['torusKnot', { p: 4, q: 61, R: 0.72, r: 0.22 }]]),
    view: view('tube', { tubeRadius: 0.004, bloom: 0.1 }),
  },
  {
    name: 'Harmonograph on a torus, unrolled',
    design: unrolled(preset('Harmonograph on a torus'), 1, 1),
    view: view('neon', { lineOpacity: 0.3, bloom: 0.5 }),
    shapes: STRIPS,
  },
  {
    name: 'Harmonograph on a torus, half unrolled',
    design: unrolled(preset('Harmonograph on a torus'), 0.6, 0),
    view: view('neon', { palette: 'ember', lineOpacity: 0.25, bloom: 0.5 }),
    shapes: STRIPS,
  },
  {
    name: 'Orbiting spirograph, unrolled',
    design: unrolled(preset('Orbiting spirograph'), 1, 1),
    view: view('neon', { palette: 'ice', lineOpacity: 0.35, bloom: 0.5 }),
    shapes: STRIPS,
  },
  {
    name: 'Woven band, uncoiled',
    design: unrolled(preset('Woven band'), 1, 0),
    view: view('neon', { palette: 'ice', lineOpacity: 0.3, bloom: 0.5 }),
    shapes: STRIPS,
  },
  {
    name: 'Woven band, opened',
    design: unrolled(preset('Woven band'), 0.5, 0),
    view: view('ink', { lineOpacity: 0.35, lineWidth: 1 }),
    shapes: STRIPS,
  },
  {
    name: 'Torus knot, uncoiled',
    design: unrolled(preset('Torus knot'), 1, 0),
    view: view('neon', { lineOpacity: 0.35, bloom: 0.5 }),
    shapes: STRIPS,
  },
  {
    name: 'Moire drift, uncoiled',
    design: unrolled(design(1, 30000, [['torusKnot', { p: 3, q: 101, R: 0.75, r: 0.25 }]]), 1, 0),
    view: view('neon', { palette: 'aurora', lineOpacity: 0.25, bloom: 0.4, lineWidth: 1.1 }),
    shapes: STRIPS,
  },
  {
    name: 'Brass loom, uncoiled',
    design: unrolled(design(1, 24000, [['torusKnot', { p: 4, q: 61, R: 0.72, r: 0.22 }]]), 1, 0),
    view: view('tube', { tubeRadius: 0.004, bloom: 0.1 }),
    shapes: STRIPS,
  },
  {
    name: 'Nautilus, uncoiled',
    design: unrolled(preset('Nautilus'), 1, 0),
    view: view('neon', { palette: 'spectrum', lineOpacity: 0.2, bloom: 0.4 }),
    shapes: STRIPS,
  },
];

const banners = SHAPES.flatMap((shape) =>
  LOOKS.filter((look) => !look.shapes || look.shapes.includes(shape.name)).map((look) => ({
    name: `${shape.name}/${look.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    shape,
    look,
  })),
);
const selected = banners.filter((b) => b.name.includes(values.only.toLowerCase()));
console.log(`onto: plan ${selected.length} banners`);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const errors = [];
const links = [];
let i = 0;
for (const shape of SHAPES) {
  const mine = selected.filter((b) => b.shape === shape);
  if (!mine.length) continue;
  mkdirSync(join(values.out, shape.name), { recursive: true });
  const page = await browser.newPage({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));
  for (const b of mine) {
    i += 1;
    const d = b.look.design;
    const design = { ...d, blocks: [...d.blocks, createBlock('scale', stretch(d, shape.width / shape.height))] };
    const hash = encode({ preset: '', design: portableDesign(design), view: b.look.view });
    await page.goto('about:blank');
    await page.goto(`${values.url}/?bare#s=${hash}`);
    await page.waitForSelector('.ag-canvas');
    await page.waitForTimeout(2000);
    const file = join(values.out, `${b.name}.png`);
    await page.locator('.ag-canvas').screenshot({ path: file });
    links.push(`${b.name}\t#s=${hash}`);
    console.log(`${String(i).padStart(2)}/${selected.length} ${file}`);
    console.log(`onto: progress ${i}/${selected.length}`);
  }
  await page.close();
}
await browser.close();
mkdirSync(values.out, { recursive: true });
writeFileSync(join(values.out, 'links.tsv'), `${links.join('\n')}\n`);
if (errors.length) {
  console.error(`page errors:\n${[...new Set(errors)].join('\n')}`);
  process.exitCode = 1;
}
