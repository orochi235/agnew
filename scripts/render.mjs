#!/usr/bin/env node
// Renders named looks from a module to PNGs, one per look, through the lab's
// ?bare mode. A looks module exports `LOOKS`: [{ name, width, height, design,
// view }], width and height in CSS pixels (rendered at 2×). Needs the lab dev
// server running and `npm run build -w agnew`.
//
//   node scripts/render.mjs scripts/looks/guilloche.mjs [--out renders/guilloche] [--url ...] [--only <pattern>]

import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { encode, portableDesign } from '../packages/agnew/dist/index.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'http://localhost:5190' },
    out: { type: 'string' },
    only: { type: 'string', default: '' },
  },
});
const file = positionals[0];
if (!file) throw new Error('usage: render.mjs <looks module> [--out dir]');
const { LOOKS } = await import(pathToFileURL(resolve(file)).href);
const out = values.out ?? join('renders', basename(file, '.mjs'));
const only = new RegExp(values.only, 'i');
const selected = LOOKS.filter((l) => only.test(l.name));
mkdirSync(out, { recursive: true });
console.log(`onto: plan ${selected.length} renders`);

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const errors = [];
let i = 0;
for (const look of selected) {
  i += 1;
  const page = await browser.newPage({ viewport: { width: look.width, height: look.height }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  const hash = encode({ preset: '', design: portableDesign(look.design), view: look.view });
  await page.goto(`${values.url}/?bare#s=${hash}`);
  await page.waitForSelector('.ag-canvas');
  await page.waitForTimeout(2500);
  const path = join(out, `${look.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
  await page.locator('.ag-canvas').screenshot({ path });
  await page.close();
  console.log(`${String(i).padStart(2)}/${selected.length} ${path}`);
  console.log(`onto: progress ${i}/${selected.length}`);
}
await browser.close();
if (errors.length) {
  console.error(`page errors:\n${[...new Set(errors)].join('\n')}`);
  process.exitCode = 1;
}
