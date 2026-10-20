import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../playtest/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], results = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`camera-${name}.png`, output)) });
const get = async () => ({ yaw: Number(await page.locator('#world').getAttribute('data-camera-yaw')),
  pitch: Number(await page.locator('#world').getAttribute('data-camera-pitch')),
  attached: await page.locator('#ui').getAttribute('data-attached'), state: await page.locator('#ui').getAttribute('data-state') });
async function restart() {
  await page.keyboard.press('Escape'); await page.locator('#restart').click(); await page.locator('#yes').click(); await page.waitForTimeout(500);
  await page.mouse.move(815, 155); await page.waitForTimeout(80);
}
try {
  await page.goto(gameURL); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('#training').click(); await page.waitForTimeout(500);
  await page.mouse.move(815, 155); await page.mouse.down({ button: 'left' }); await page.waitForTimeout(150);
  assert.equal((await get()).attached, 'fly-0');
  await page.keyboard.down('a'); await page.waitForTimeout(1000); await page.keyboard.up('a');
  await shot('before'); const before = await get();
  await page.mouse.down({ button: 'right' }); await page.mouse.move(935, 215, { steps: 12 }); await page.waitForTimeout(100);
  const rotated = await get(); await shot('hanging-orbit');
  assert.ok(Math.abs(rotated.yaw - before.yaw) > .25, 'holding left then pressing right must rotate yaw');
  assert.ok(Math.abs(rotated.pitch - before.pitch) > .08, 'holding left then pressing right must rotate pitch');
  assert.equal(rotated.attached, 'fly-0'); assert.equal(rotated.state, 'playing');
  results.push({ check: 'left-held then right-drag rotates while hanging', before, after: rotated });
  await page.mouse.up({ button: 'right' }); await page.mouse.move(1015, 255, { steps: 6 }); await page.waitForTimeout(80);
  const rightReleased = await get(); assert.equal(rightReleased.attached, 'fly-0'); assert.equal(rightReleased.yaw, rotated.yaw);
  results.push({ check: 'release right keeps tongue and stops drag-look', passed: true });
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'left' }); await page.waitForTimeout(80);
  assert.equal((await get()).attached, ''); assert.match(await page.locator('#toast').innerText(), /꿀꺽/);
  const afterRelease = await get(); await page.mouse.move(1075, 275, { steps: 6 }); await page.waitForTimeout(80);
  assert.ok(Math.abs((await get()).yaw - afterRelease.yaw) > .12); await page.mouse.up({ button: 'right' });
  results.push({ check: 'release left while right-held eats fly and continues camera rotation', passed: true });
  await restart();
  await page.mouse.down({ button: 'right' }); await page.mouse.down({ button: 'left' }); await page.waitForTimeout(100);
  assert.equal((await get()).attached, 'fly-0');
  await page.mouse.move(875, 185, { steps: 8 }); await page.waitForTimeout(80); assert.equal((await get()).attached, 'fly-0');
  await page.mouse.up({ button: 'left' }); await page.waitForTimeout(80); assert.equal((await get()).attached, '');
  await page.mouse.up({ button: 'right' });
  results.push({ check: 'right-held then left-press also catches and releases correctly', passed: true });
  await restart(); await page.keyboard.press('Escape'); await page.locator('#settings-pause').click();
  await page.locator('#setting-toggle').selectOption('true'); await page.locator('#settings-close').click(); await page.locator('#resume').click();
  await page.mouse.move(815, 155); await page.mouse.click(815, 155); await page.waitForTimeout(100); assert.equal((await get()).attached, 'fly-0');
  const toggleBefore = await get(); await page.mouse.down({ button: 'right' }); await page.mouse.move(915, 185, { steps: 10 }); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(100); const toggleAfter = await get();
  assert.equal(toggleAfter.attached, 'fly-0'); assert.ok(Math.abs(toggleAfter.yaw - toggleBefore.yaw) > .2);
  results.push({ check: 'toggle attachment supports right-drag without detaching', passed: true });
  await page.keyboard.press('Escape'); await page.locator('#settings-pause').click();
  await page.locator('#setting-toggle').selectOption('false'); await page.locator('#settings-close').click(); await page.locator('#resume').click();
  await page.mouse.move(730, 420); await page.mouse.down({ button: 'left' }); await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(80); await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'right' }); await page.mouse.up({ button: 'left' }); await page.waitForTimeout(80);
  const paused = await get(); assert.equal(paused.state, 'paused'); assert.equal(paused.attached, 'fly-0');
  await page.mouse.move(900, 500); await page.waitForTimeout(80); assert.equal((await get()).yaw, paused.yaw);
  await page.locator('#resume').click(); await page.mouse.move(730, 420); await page.mouse.down({ button: 'left' });
  await page.mouse.down({ button: 'right' }); await page.mouse.move(790, 440, { steps: 6 }); await page.waitForTimeout(80);
  assert.equal((await get()).attached, 'fly-0'); assert.ok(Math.abs((await get()).yaw - paused.yaw) > .12);
  await page.mouse.up({ button: 'right' }); await page.mouse.up({ button: 'left' });
  results.push({ check: 'pause clears both-button capture and resume can orbit the preserved attachment', passed: true });
  assert.equal(errors.length, 0);
} catch (error) { results.push({ failed: String(error) }); await shot('failure'); process.exitCode = 1; }
await writeFile(new URL('camera-playtest.json', output), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors })); await browser.close();
