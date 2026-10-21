import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../playtest/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const results = [], errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const get = () => page.locator('#ui').evaluate(ui => ({ attached: ui.dataset.attached, state: ui.dataset.state,
  height: Number(ui.dataset.height), swing: ui.dataset.swingKind,
  v: { x: Number(ui.dataset.velocityX), y: Number(ui.dataset.velocityY), z: Number(ui.dataset.velocityZ) } }));
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`release-${name}.png`, output)) });

try {
  await page.goto(gameURL); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('#training').click(); await page.waitForTimeout(500);
  await page.mouse.move(815, 155); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.attached === 'fly-0', null, { timeout: 2500 });
  const caught = await get(); await shot('caught');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.swingKind === 'release', null, { timeout: 1200 });
  const nudged = await get();
  assert.equal(nudged.attached, '');
  assert.ok(Math.hypot(nudged.v.x, nudged.v.y, nudged.v.z) > 2.8);
  assert.ok(Math.hypot(nudged.v.x, nudged.v.y, nudged.v.z) < 5.5);
  await shot('manual-release');
  await page.waitForTimeout(250);
  const coast = await get();
  assert.equal(coast.swing, '');
  assert.ok(coast.v.y < nudged.v.y, 'gravity resumes immediately after the release impulse');
  await shot('coast');

  await page.keyboard.press('Escape');
  assert.equal((await get()).state, 'paused');
  assert.equal(errors.length, 0);
  results.push({ check: 'ordinary tongue release keeps its shorter directional nudge and then coasts under gravity', caught, nudged, coast });
} catch (error) {
  results.push({ failed: String(error) }); await shot('failure'); process.exitCode = 1;
}
await writeFile(new URL('release-playtest.json', output), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors })); await browser.close();
