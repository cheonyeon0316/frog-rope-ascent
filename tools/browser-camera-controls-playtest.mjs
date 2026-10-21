import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL(`../playtest/${process.env.PLAYTEST_OUTPUT ?? 'tongumble-camera/'}`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto(gameURL); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  const saved = { version: 1, course: 'ecosystem-main-v3', mode: 'main', position: { x: 40, y: 82, z: -32 },
    velocity: { x: 0, y: 0, z: 0 }, attached: null, length: 0, peak: 82, time: 12, falls: 0, tick: 1440, finished: false };
  await page.evaluate(async state => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('frog-ascent-local', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('states', 'readwrite'); tx.objectStore('states').put(state, 'current');
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, saved);
  await page.reload(); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('#continue').click();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.state === 'paused');
  await page.locator('#resume').click();
  await page.waitForFunction(() => Number(document.querySelector('#world').dataset.cameraY) > 80, null, { timeout: 5000 });
  await page.keyboard.down('w');
  await page.waitForFunction(() => Number.isFinite(Number(document.querySelector('#world').dataset.inputZ))
    && Math.abs(Number(document.querySelector('#world').dataset.inputZ)) > .2, null, { timeout: 1500 });
  const sample = await page.locator('#world').evaluate(canvas => ({
    cameraYaw: Number(canvas.dataset.cameraYaw), movementYaw: Number(canvas.dataset.movementYaw),
    inputX: Number(canvas.dataset.inputX), inputZ: Number(canvas.dataset.inputZ),
  }));
  await page.screenshot({ path: fileURLToPath(new URL('camera-controls-flower.png', output)) });
  await page.keyboard.up('w');
  assert.ok(Math.abs(sample.cameraYaw - sample.movementYaw) < .04, JSON.stringify(sample));
  assert.ok(Math.abs(sample.inputX + Math.sin(sample.cameraYaw)) < .025, JSON.stringify(sample));
  assert.ok(Math.abs(sample.inputZ + Math.cos(sample.cameraYaw)) < .025, JSON.stringify(sample));
  assert.equal(errors.length, 0);
  const result = { scenario: 'flower-biome transition preserves camera and W direction', course: 'ecosystem-main-v3', sample, errors };
  assert.ok(Math.abs(sample.cameraYaw - .52) < .04, JSON.stringify(sample));
  await writeFile(new URL('camera-controls-playtest.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: fileURLToPath(new URL('camera-controls-failure.png', output)) });
  throw error;
} finally { await context.close(); await browser.close(); }
