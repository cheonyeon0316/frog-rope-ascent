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
  height: Number(ui.dataset.height), dashing: ui.dataset.dashing === 'true',
  v: { x: Number(ui.dataset.velocityX), y: Number(ui.dataset.velocityY), z: Number(ui.dataset.velocityZ) } }));
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`dash-${name}.png`, output)) });
try {
  await page.goto(gameURL); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('#training').click(); await page.waitForTimeout(700);
  await page.mouse.move(815, 155); await page.mouse.down(); await page.waitForTimeout(200);
  const before = await get(); assert.equal(before.attached, 'fly-0'); await shot('attached');
  await page.mouse.up(); await page.waitForFunction(() => document.querySelector('#ui').dataset.dashing === 'true', { timeout: 1500 });
  const boosted = await get();
  assert.equal(boosted.attached, ''); assert.equal(boosted.dashing, true);
  assert.ok(boosted.v.x > before.v.x + .4); assert.ok(boosted.v.y > before.v.y + 2.5); assert.ok(boosted.v.z < before.v.z - .2);
  await shot('eat-burst'); results.push({ check: 'actual release adds velocity toward the fly in three dimensions', before, after: boosted });
  await page.waitForTimeout(180); const airborne = await get();
  assert.ok(airborne.height > before.height + .15); assert.equal(airborne.dashing, false); await shot('coast');
  results.push({ check: 'short boost ends while momentum and normal gravity continue', ...airborne });
  await page.keyboard.press('Escape'); const paused = await get(); await page.waitForTimeout(250);
  assert.equal((await get()).height, paused.height); assert.equal((await get()).state, 'paused');
  results.push({ check: 'pause preserves the post-dash flight', passed: true });
  assert.equal(errors.length, 0);
} catch (error) { results.push({ failed: String(error) }); await shot('failure'); process.exitCode = 1; }
await writeFile(new URL('dash-playtest.json', output), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors })); await browser.close();
