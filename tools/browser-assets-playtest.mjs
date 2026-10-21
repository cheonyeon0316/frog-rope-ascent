import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchOptions, gameURL } from './browser-config.mjs';

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../playtest/asset-runtime');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(gameURL);
  await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  const loaded = await page.locator('#world').evaluate(canvas => ({
    models: Number(canvas.dataset.assetModelsLoaded), expected: Number(canvas.dataset.assetModelsExpected),
    state: canvas.dataset.assetState, instances: Number(canvas.dataset.assetInstances),
    frog: canvas.dataset.frogAsset, frogVisible: canvas.dataset.proceduralFrogVisible === 'true',
    foods: Number(canvas.dataset.foodAssets), proceduralFoods: Number(canvas.dataset.proceduralFoods),
    ecology: Number(canvas.dataset.ecologyAssets),
  }));
  assert.equal(loaded.state, 'ready');
  assert.equal(loaded.models, 17);
  assert.equal(loaded.expected, 17);
  assert.equal(loaded.frog, 'procedural');
  assert.equal(loaded.frogVisible, true);
  assert.equal(loaded.foods, 0);
  assert.ok(loaded.proceduralFoods > 0);
  assert.equal(loaded.ecology, 18);
  assert.equal(loaded.instances, 18);
  await page.screenshot({ path: path.join(output, 'restored-characters-menu.png') });

  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.state === 'playing');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, 'restored-characters-pond.png') });
  await page.keyboard.down('Space');
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'restored-characters-jump.png') });
  await page.keyboard.up('Space');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ passed: true, loaded, characters: 'procedural', errors }));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'restored-characters-failure.png') });
  throw error;
} finally {
  await browser.close();
}
