import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../playtest/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], results = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`gimmick-${name}.png`, output)) });
const get = () => page.locator('#ui').evaluate(ui => ({ state: ui.dataset.state, height: Number(ui.dataset.height), swimming: ui.dataset.swimming === 'true',
  time: Number(ui.dataset.activeTime), attached: ui.dataset.attached, v: { x: Number(ui.dataset.velocityX), y: Number(ui.dataset.velocityY), z: Number(ui.dataset.velocityZ) } }));
const fly = () => page.locator('#world').evaluate(canvas => ({ x: Number(canvas.dataset.attachedFlyX), y: Number(canvas.dataset.attachedFlyY), z: Number(canvas.dataset.attachedFlyZ) }));

// Explicit saved-state fixtures isolate later mechanics. They do not claim an ascent from ground.
async function seed(area) {
  await page.goto(gameURL); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  const setup = await page.evaluate(async area => {
    const { makeLegacyCourse: makeCourse } = await import('/src/game/legacy-course.ts');
    const c = makeCourse('main'); let position, target;
    if (area === 'moving') {
      const p = c.platforms.find(p => p.id === 'pad-1'); position = { x: p.position.x, y: p.position.y + .55, z: p.position.z };
      target = c.anchors.find(a => a.id === 'fly-1-relay');
    } else if (area === 'spring') {
      const p = c.platforms.find(p => p.id === 'pad-4'); position = { x: p.position.x, y: p.position.y + 2.5, z: p.position.z };
    } else {
      const p = c.platforms.find(p => p.id === 'pad-6'); position = { x: p.position.x, y: p.position.y + .55, z: p.position.z };
      target = c.anchors.find(a => a.id === 'fly-water-6-exit');
    }
    const state = { version: 1, course: c.id, mode: 'main', position, velocity: { x: 0, y: 0, z: 0 }, attached: null, length: 0,
      peak: position.y - c.start.y, time: 0, falls: 0, tick: 0, finished: false, eatenFlies: [] };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('frog-ascent-local', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('states', 'readwrite'); transaction.objectStore('states').put(state, 'current');
        transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    });
    return { area, position, target };
  }, area);
  await page.reload(); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('#continue').click(); await page.waitForTimeout(250);
  return setup;
}
async function project(point) {
  const data = await page.locator('#world').evaluate(canvas => ({ x: Number(canvas.dataset.cameraX), y: Number(canvas.dataset.cameraY), z: Number(canvas.dataset.cameraZ),
    yaw: Number(canvas.dataset.cameraYaw), pitch: Number(canvas.dataset.cameraPitch) }));
  const camera = new THREE.PerspectiveCamera(60, 1440 / 900, .1, 330); camera.position.set(data.x, data.y, data.z);
  const offset = new THREE.Vector3(Math.sin(data.yaw) * Math.cos(data.pitch), Math.sin(data.pitch), Math.cos(data.yaw) * Math.cos(data.pitch));
  camera.lookAt(camera.position.clone().sub(offset)); camera.updateMatrixWorld();
  const p = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  const screen = { x: (p.x + 1) * 720, y: (1 - p.y) * 450 };
  assert.ok(screen.x > 0 && screen.x < 1440 && screen.y > 0 && screen.y < 900, 'fixture target must be visible');
  return screen;
}
try {
  const movingSetup = await seed('moving'); await page.locator('#resume').click(); await page.waitForTimeout(80);
  const screen = await project(movingSetup.target.position); await page.mouse.move(screen.x, screen.y); await page.mouse.down(); await page.waitForTimeout(100);
  assert.equal((await get()).attached, 'fly-1-relay'); const beforeFly = await fly(); await shot('moving-before');
  await page.waitForTimeout(700); const afterFly = await fly(); assert.equal((await get()).attached, 'fly-1-relay');
  assert.deepEqual(afterFly, beforeFly); await shot('moving-hang');
  results.push({ check: 'real input catches a moving fly and freezes its world position', fixture: movingSetup, beforeFly, afterFly, passed: true });
  await page.keyboard.press('Escape'); await page.mouse.up(); const pausedFly = await fly(); await page.waitForTimeout(300);
  assert.deepEqual(await fly(), pausedFly); results.push({ check: 'pause freezes moving fly and tether', passed: true });

  const waterSetup = await seed('water'); await shot('water-entry'); await page.locator('#resume').click(); await page.keyboard.down('Space');
  await page.waitForFunction(() => Number(document.querySelector('#ui').dataset.height) > 35.4 && document.querySelector('#ui').dataset.swimming === 'true', null, { timeout: 6000 });
  const swam = await get(); assert.ok(swam.height > waterSetup.position.y - .72 + 4); await shot('swimming');
  const exitScreen = await project(waterSetup.target.position); await page.mouse.move(exitScreen.x, exitScreen.y); await page.mouse.down(); await page.waitForTimeout(80);
  assert.equal((await get()).attached, 'fly-water-6-exit'); await shot('water-rehook');
  await page.keyboard.up('Space'); await page.mouse.up(); await page.waitForTimeout(250);
  results.push({ check: 'hold Space swims upward and real mouse input reconnects to the exit fly', fixture: waterSetup, afterSwim: swam, afterEatDash: await get(), passed: true });
  await page.keyboard.press('Escape');

  const springSetup = await seed('spring'); await page.locator('#resume').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('탄성 잎'), null, { timeout: 3000 });
  const bounce = await get(); assert.ok(bounce.v.y > 6); await shot('spring-bounce');
  results.push({ check: 'landing on the marked leaf actually launches the frog upward', fixture: springSetup, after: bounce, passed: true });
  assert.equal(errors.length, 0);
} catch (error) { results.push({ failed: String(error) }); await shot('failure'); process.exitCode = 1; }
await writeFile(new URL('gimmick-playtest.json', output), JSON.stringify({ results, errors, fixtureBased: true }, null, 2));
console.log(JSON.stringify({ results, errors })); await browser.close();
