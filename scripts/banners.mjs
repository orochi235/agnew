#!/usr/bin/env node
// Wide, quiet strips cut through the middle of a curve, for title-bar
// backgrounds. Needs the lab dev server running and `npm run build -w agnew`.
// Each one is rendered square in the lab's ?bare mode and clipped to a band,
// since the lab frames the whole curve by height.
//
//   node scripts/banners.mjs [--url http://localhost:5190] [--out banners] [--only <substring>]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createBlock, encode, portableDesign, presetByName } from '../packages/agnew/dist/index.js';
import { DEFAULT_VIEW, STYLE_DEFAULTS } from '../packages/agnew/dist/three/index.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5190' },
    out: { type: 'string', default: 'banners' },
    only: { type: 'string', default: '' },
  },
});

/** Square side of the render, in CSS pixels; device scale 2 doubles it. */
const SIDE = 1920;
/** Band height in CSS pixels: 8:1, the shape of a wide title bar. */
const BAND = 240;

const design = (turns, samples, blocks) => ({
  version: 1,
  turns,
  samples,
  blocks: blocks.map(([kind, params]) => createBlock(kind, params)),
});
const preset = (name) => presetByName(name).design();

function view(style, patch = {}) {
  return { ...DEFAULT_VIEW, ...STYLE_DEFAULTS[style], style, autoRotate: false, ...patch, layers: DEFAULT_VIEW.layers };
}

/** `band` moves the strip off center: -1 is the top edge, 1 the bottom. */
const BANNERS = [
  { name: 'Woven band, ice', design: preset('Woven band'), view: view('neon', { palette: 'ice', lineOpacity: 0.3, bloom: 0.6 }) },
  { name: 'Woven band, ink', design: preset('Woven band'), view: view('ink', { lineOpacity: 0.35, lineWidth: 1 }) },
  { name: 'Harmonograph, ember', design: preset('Harmonograph'), view: view('neon', { palette: 'ember', lineOpacity: 0.22, bloom: 0.7 }) },
  { name: 'Harmonograph, ink', design: preset('Harmonograph'), view: view('ink', { lineOpacity: 0.3, lineWidth: 0.9 }) },
  { name: 'Torus knot, aurora', design: preset('Torus knot'), view: view('neon', { lineOpacity: 0.35, bloom: 0.7 }) },
  { name: 'Nautilus, spectrum', design: preset('Nautilus'), view: view('neon', { palette: 'spectrum', lineOpacity: 0.2, bloom: 0.5 }), band: 0.15 },
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
    band: -0.2,
  },
];

const selected = BANNERS.filter((b) => b.name.toLowerCase().includes(values.only.toLowerCase()));
mkdirSync(values.out, { recursive: true });
console.log(`onto: plan ${selected.length} banners`);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: SIDE, height: SIDE }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));

const links = [];
let i = 0;
for (const b of selected) {
  i += 1;
  const hash = encode({ preset: '', design: portableDesign(b.design), view: b.view });
  const stem = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await page.goto('about:blank');
  await page.goto(`${values.url}/?bare#s=${hash}`);
  await page.waitForSelector('.ag-canvas');
  await page.waitForTimeout(2000);
  const y = Math.round(SIDE / 2 + ((b.band ?? 0) * (SIDE - BAND)) / 2 - BAND / 2);
  const file = join(values.out, `${stem}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y, width: SIDE, height: BAND } });
  links.push(`${b.name}\t#s=${hash}`);
  console.log(`${String(i).padStart(2)}/${selected.length} ${file}`);
  console.log(`onto: progress ${i}/${selected.length}`);
}
await browser.close();
writeFileSync(join(values.out, 'links.tsv'), `${links.join('\n')}\n`);
if (errors.length) {
  console.error(`page errors:\n${[...new Set(errors)].join('\n')}`);
  process.exitCode = 1;
}
