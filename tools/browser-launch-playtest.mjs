import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL(`../playtest/${process.env.PLAYTEST_OUTPUT ?? ''}`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const results = [], errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`swing-${name}.png`, output)) });
const boot = () => page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
const get = () => page.locator('#ui').evaluate(ui => ({ state: ui.dataset.state, attached: ui.dataset.attached,
  height: Number(ui.dataset.height), biome: ui.dataset.biome, swing: ui.dataset.swingKind,
  v: { x: Number(ui.dataset.velocityX), y: Number(ui.dataset.velocityY), z: Number(ui.dataset.velocityZ) } }));

try {
  await page.goto(gameURL); await boot(); await page.locator('#training').click(); await page.waitForTimeout(500);
  const ground = await get();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => Number(document.querySelector('#ui').dataset.height) > 1.3, null, { timeout: 1500 });
  await shot('ground-jump');
  await page.waitForFunction(() => Number(document.querySelector('#ui').dataset.height) < .1, null, { timeout: 2500 });
  results.push({ check: 'Space remains a ground jump when no food is attached', passed: true, from: ground, afterJump: await get() });

  await page.mouse.move(815, 155); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.attached === 'fly-0', null, { timeout: 2500 });
  await page.keyboard.down('a'); await page.waitForTimeout(420); await page.keyboard.up('a');
  const before = await get(); await shot('tethered-swing');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#ui').dataset.swingKind === 'eat-swing', null, { timeout: 1200 });
  const launch = await get(); await shot('eat-swing-target-dash');
  assert.equal(launch.attached, '', 'eating the fly should release the tongue');
  await page.waitForFunction(() => !document.querySelector('#ui').dataset.swingKind, null, { timeout: 2500 });
  const after = await get();
  assert.ok(after.height > before.height + .5, 'target dash should carry the frog toward the fly position');
  assert.ok(Math.hypot(after.v.x, after.v.y, after.v.z) > 1, 'momentum should continue after arrival');
  await shot('eat-dash-arrival-coast');
  results.push({ check: 'Space consumes the attached fly and follows a shallow arcing dash to its position, then preserves arrival momentum', before, launch, after });

  await page.keyboard.press('Escape');
  assert.equal((await get()).state, 'paused');
  await page.locator('#exit').click();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.state === 'menu', null, { timeout: 2500 });
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.mode === 'main' && document.querySelector('#ui').dataset.state === 'playing', null, { timeout: 5000 });
  await page.waitForTimeout(600); await shot('ecosystem-first-zone');
  assert.equal(await page.locator('#world').getAttribute('data-course'), 'ecosystem-main-v5');
  const metrics = await page.evaluate(async () => {
    const { makeCourse } = await import('/src/game/course.ts');
    const course = makeCourse('main');
    const holeRadius = course.landscapes?.find(land => land.zone === 0)?.hole?.radius;
    return { height: course.height, routeBeats: course.route?.length, bridgePads: course.platforms.filter(p => p.id.startsWith('bridge-')).length,
      landHoleRadius: holeRadius, wellOpeningRadius: holeRadius ? holeRadius * .86 : undefined };
  });
  assert.equal(metrics.height, 1540); assert.equal(metrics.routeBeats, 221); assert.equal(metrics.bridgePads, 174);
  assert.equal(metrics.landHoleRadius, 10); assert.equal(metrics.wellOpeningRadius, 8.6);
  results.push({ check: 'expanded 1540m course loads with 221 route beats', course: await page.locator('#world').getAttribute('data-course'), metrics, state: await get() });

  await page.evaluate(async () => {
    const { makeCourse } = await import('/src/game/course.ts');
    const c = makeCourse('main'), pad = c.platforms.find(p => p.id === 'pad-9');
    const position = { x: pad.position.x, y: pad.position.y + pad.size.y / 2 + .4, z: pad.position.z };
    const state = { version: 1, course: c.id, mode: 'main', position, velocity: { x: 0, y: 0, z: 0 }, attached: null,
      length: 0, peak: position.y - c.start.y, time: 0, falls: 0, tick: 0, finished: false };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('frog-ascent-local', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('states', 'readwrite');
        tx.objectStore('states').put(state, 'current');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.reload(); await boot(); await page.locator('#continue').click(); await page.locator('#resume').click();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.state === 'playing' && document.querySelector('#ui').dataset.biome === 'rocks', null, { timeout: 5000 });
  await page.waitForTimeout(450); await shot('rock-gorge-swing-route');
  results.push({ check: 'revised gorge segment loads from a real landing surface', state: await get() });
  assert.equal(errors.length, 0);
} catch (e) {
  results.push({ failed: String(e) }); await shot('failure'); process.exitCode = 1;
}
await writeFile(new URL('swing-playtest.json', output), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors }));
await browser.close();
