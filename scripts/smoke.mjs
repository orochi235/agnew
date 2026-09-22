#!/usr/bin/env node
// Drives the lab like a person would and fails on anything broken: the canvas
// draws, presets and styles switch, layers toggle, blocks add and remove,
// the URL keeps the state, and both exports download. Needs the dev server.
//
//   node scripts/smoke.mjs [--url http://localhost:5190]

import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:5190' } } });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const fail = (msg) => {
  throw new Error(msg);
};

/** Fraction of sampled canvas pixels that differ from the corner pixel. */
async function inked() {
  const shot = await page.locator('.ag-canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const [r0, g0, b0] = d;
    let hit = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      n++;
      if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 60) hit++;
    }
    return hit / n;
  }, shot.toString('base64'));
}

async function pngSize(path) {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const hash = () => page.evaluate(() => location.hash);
const selects = () => page.locator('.ag-sidebar select');
const blockCards = () => page.locator('.ag-card');

step('loads and draws', async () => {
  await page.goto(values.url);
  await page.waitForSelector('.ag-canvas');
  await page.waitForTimeout(1200);
  const f = await inked();
  if (f < 0.01) fail(`canvas looks blank (${(f * 100).toFixed(1)}% inked)`);
});

step('switches preset', async () => {
  const before = await hash();
  await selects().nth(0).selectOption('Harmonograph');
  await page.waitForTimeout(800);
  if ((await blockCards().count()) !== 4) fail(`expected 4 pendulum cards, got ${await blockCards().count()}`);
  if ((await hash()) === before) fail('URL hash did not change');
});

step('switches every style and still draws', async () => {
  for (const style of ['tube', 'ribbon', 'ink', 'neon']) {
    await selects().nth(1).selectOption(style);
    await page.waitForTimeout(900);
    const f = await inked();
    if (f < 0.01) fail(`${style}: canvas looks blank`);
  }
});

step('toggles trace and mechanism layers', async () => {
  await page.getByRole('checkbox', { name: 'Trace' }).check();
  await page.getByRole('checkbox', { name: 'Mechanism' }).check();
  await page.waitForTimeout(1500);
  if ((await inked()) < 0.005) fail('canvas blank with trace + mechanism');
  await page.getByRole('checkbox', { name: 'Curve' }).uncheck();
  await page.waitForTimeout(500);
  await page.getByRole('checkbox', { name: 'Curve' }).check();
});

step('adds, disables and removes a block', async () => {
  const n = await blockCards().count();
  await page.locator('.ag-add select').selectOption('precess');
  await page.getByRole('button', { name: 'Add block' }).click();
  if ((await blockCards().count()) !== n + 1) fail('block was not added');
  if (!(await page.locator('.ag-badge').isVisible())) fail('custom badge missing after edit');
  await page.getByRole('checkbox', { name: 'Enable Precess' }).uncheck();
  await page.locator('.ag-card').last().getByRole('button', { name: 'Remove' }).click();
  if ((await blockCards().count()) !== n) fail('block was not removed');
});

step('edits a block parameter from its slider', async () => {
  const before = await hash();
  const slider = page.locator('.ag-card').first().getByRole('slider').first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  if ((await hash()) === before) fail('slider edit did not reach the URL');
});

step('restores state from the URL', async () => {
  const url = page.url();
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForTimeout(1000);
  if ((await blockCards().count()) !== 4) fail('reload lost the stack');
  if (!(await page.locator('.ag-badge').isVisible())) fail('reload lost the custom state');
});

step('exports a PNG', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PNG 2×' }).click()]);
  if (!dl.suggestedFilename().endsWith('@2x.png')) fail(`bad PNG name ${dl.suggestedFilename()}`);
  const { width, height } = await pngSize(await dl.path());
  const box = await page.locator('.ag-canvas').boundingBox();
  const dpr = await page.evaluate(() => Math.min(devicePixelRatio, 2));
  if (width !== Math.round(box.width * dpr * 2) || height !== Math.round(box.height * dpr * 2)) {
    fail(`PNG is ${width}x${height}, expected 2x the ${box.width}x${box.height} canvas`);
  }
  if (process.env.SMOKE_KEEP) await dl.saveAs(`${process.env.SMOKE_KEEP}/export@2x.png`);
});

step('records a video', async () => {
  await page.locator('.ag-inline input').fill('2');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Record video' }).click(),
  ]);
  if (!dl.suggestedFilename().endsWith('.webm')) fail(`bad video name ${dl.suggestedFilename()}`);
  const bytes = statSync(await dl.path()).size;
  if (bytes < 20_000) fail(`video is only ${bytes} bytes`);
});

let failed = 0;
for (const [i, [name, fn]] of steps.entries()) {
  try {
    await fn();
    console.log(`${String(i + 1).padStart(2)}/${steps.length} ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`${String(i + 1).padStart(2)}/${steps.length} FAIL  ${name}: ${e.message}`);
  }
}
if (errors.length) {
  failed++;
  console.log(`page errors:\n  ${[...new Set(errors)].join('\n  ')}`);
}
await browser.close();
process.exitCode = failed ? 1 : 0;
