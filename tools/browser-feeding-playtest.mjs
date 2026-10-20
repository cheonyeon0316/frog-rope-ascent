import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../playtest/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [], results = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const shot = async name => page.screenshot({ path: fileURLToPath(new URL(`feeding-${name}.png`, output)) });
const valid = async () => (await page.locator('#reticle').getAttribute('class')).includes('valid');
const waitBoot = async () => page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
const readSave = () => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('frog-ascent-local', 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const read = db.transaction('states', 'readonly').objectStore('states').get('current');
    read.onsuccess = () => { resolve(read.result); db.close(); };
    read.onerror = () => { reject(read.error); db.close(); };
  };
}));

try {
  await page.goto(gameURL); await waitBoot();
  await page.locator('#training').click(); await page.waitForTimeout(700);
  await page.mouse.move(815, 155); await page.waitForTimeout(100); assert.equal(await valid(), true);
  await page.mouse.down(); await page.waitForTimeout(250);
  assert.equal(await page.locator('#ui').getAttribute('data-attached'), 'fly-0'); await shot('attached');
  await page.mouse.up(); const releasedAt = Date.now();
  await page.waitForTimeout(100); await shot('pull');
  await page.waitForTimeout(Math.max(0, 365 - (Date.now() - releasedAt))); await shot('gulp');
  await page.waitForTimeout(Math.max(0, 750 - (Date.now() - releasedAt)));
  assert.equal(await page.locator('#ui').getAttribute('data-attached'), '');
  assert.equal(await valid(), false); await shot('hidden');
  results.push({ check: 'real release pulls fly into mouth and disables old target', passed: true });
  await page.keyboard.press('Escape'); await page.waitForTimeout(3300);
  await page.locator('#resume').click(); await page.mouse.move(815, 155); await page.waitForTimeout(150); assert.equal(await valid(), false);
  results.push({ check: 'paused wall-clock time does not regenerate fly', passed: true });
  await page.waitForTimeout(2500); await shot('respawn'); assert.equal(await valid(), true);
  await page.mouse.down(); await page.waitForTimeout(100);
  assert.equal(await page.locator('#ui').getAttribute('data-attached'), 'fly-0');
  results.push({ check: 'regenerated fly can be caught again with real input', passed: true });
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.locator('#exit').click();
  await page.locator('#start').waitFor(); await page.locator('#start').click(); await page.waitForTimeout(600);
  await page.mouse.move(763, 174); await page.waitForTimeout(100); assert.equal(await valid(), true);
  await page.mouse.down(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#ui').getAttribute('data-attached'), 'fly-1-a');
  await page.mouse.up(); await page.waitForTimeout(450); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const saved = await readSave();
  assert.ok(saved.eatenFlies.some(fly => fly.id === 'fly-1-a' && fly.remaining > 1));
  await page.reload(); await waitBoot(); await page.locator('#continue').click(); await page.waitForTimeout(100);
  await page.locator('#resume').click(); await page.mouse.move(763, 174); await page.waitForTimeout(150);
  assert.equal(await valid(), false);
  results.push({ check: 'actual IndexedDB stores consumed fly and reload preserves cooldown', passed: true });
  await page.waitForTimeout(2800); assert.equal(await valid(), true);
  assert.equal(errors.length, 0);
} catch (error) {
  results.push({ failed: String(error) }); await shot('failure'); process.exitCode = 1;
}
await context.close();
await writeFile(new URL('feeding-playtest.json', output), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors })); await browser.close();
