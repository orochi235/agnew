#!/usr/bin/env node
// Screenshots of the lab's canvas for every preset and style, for eyeballing
// changes. Needs the lab dev server running and `npm run build -w agnew`.
//
//   node scripts/shots.mjs [--url http://localhost:5190] [--out shots] [--only <substring>]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { encode, PRESETS, portableDesign } from '../packages/agnew/dist/index.js';
import { DEFAULT_VIEW, STYLE_DEFAULTS, STYLES } from '../packages/agnew/dist/three/index.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5190' },
    out: { type: 'string', default: 'shots' },
    only: { type: 'string', default: '' },
  },
});

const naturalStyle = { torus: 'neon', harmonograph: 'neon', epicycles: 'tube', sphere: 'neon', combo: 'neon' };

function view(style, patch = {}) {
  return {
    ...DEFAULT_VIEW,
    ...STYLE_DEFAULTS[style],
    style,
    autoRotate: false,
    ...patch,
    layers: { ...DEFAULT_VIEW.layers, ...patch.layers },
  };
}

const shots = [];
for (const p of PRESETS) {
  shots.push({ name: `preset-${p.name}`, preset: p, view: view(naturalStyle[p.family]) });
}
for (const name of ['Torus knot', 'Harmonograph', 'Gear train']) {
  const p = PRESETS.find((x) => x.name === name);
  for (const style of STYLES) shots.push({ name: `style-${style}-${name}`, preset: p, view: view(style) });
}
for (const name of ['Gear train', 'Globe rosette', 'Harmonograph on a torus']) {
  const p = PRESETS.find((x) => x.name === name);
  shots.push({
    name: `mechanism-${name}`,
    preset: p,
    wait: 4000,
    view: view('neon', { traceSeconds: 10, layers: { curve: true, trace: true, mechanism: true } }),
  });
}

const selected = shots.filter((s) => s.name.toLowerCase().includes(values.only.toLowerCase()));
mkdirSync(values.out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(m.text()));

let i = 0;
for (const s of selected) {
  i += 1;
  const hash = encode({ preset: s.preset.name, design: portableDesign(s.preset.design()), view: s.view });
  await page.goto('about:blank');
  await page.goto(`${values.url}/#s=${hash}`);
  await page.waitForSelector('.ag-canvas');
  await page.waitForTimeout(s.wait ?? 1500);
  const file = join(values.out, `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
  await page.locator('.ag-canvas').screenshot({ path: file });
  console.log(`${String(i).padStart(2)}/${selected.length} ${file}`);
}
await browser.close();
if (errors.length) {
  console.error(`page errors:\n${[...new Set(errors)].join('\n')}`);
  process.exitCode = 1;
}
