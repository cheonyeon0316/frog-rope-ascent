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
    frog: canvas.dataset.frogAsset, foods: Number(canvas.dataset.foodAssets), ecology: Number(canvas.dataset.ecologyAssets),
  }));
  assert.equal(loaded.state, 'ready');
  assert.equal(loaded.models, 26);
  assert.equal(loaded.expected, 26);
  assert.equal(loaded.frog, 'frog_hero_lowpoly.glb');
  assert.ok(loaded.foods >= 8);
  assert.equal(loaded.ecology, 18);
  assert.ok(loaded.instances > loaded.foods);
  await page.screenshot({ path: path.join(output, 'assets-menu.png') });

  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.state === 'playing');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, 'assets-pond.png') });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('#world').dataset.frogAnimation === 'Frog_Jump', null, { timeout: 2500 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, 'assets-jump.png') });
  await page.keyboard.up('Space');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ passed: true, loaded, animation: 'Frog_Jump', errors }));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'assets-failure.png') });
  throw error;
} finally {
  await browser.close();
}
