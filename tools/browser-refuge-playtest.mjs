import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../playtest/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const results = [], errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`refuge-${name}.png`, output)) });
const get = () => page.locator('#ui').evaluate(ui => ({ height: Number(ui.dataset.height), refuge: ui.dataset.refuge, attached: ui.dataset.attached }));

// Independent browser storage and explicit fall fixtures; this is not a full-course ascent.
async function seed(i, outside = false) {
  await page.goto(gameURL);
  await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  const fixture = await page.evaluate(async ({ i, outside }) => {
    const { makeLegacyCourse: makeCourse } = await import('/src/game/legacy-course.ts');
    const c = makeCourse('main');
    const pad = c.platforms.find(p => p.id === `pad-${i + 2}`);
    const turn = i + 3;
    const position = outside ? { x: Math.sin(.63 * turn) * 10.08, y: turn * 5, z: Math.cos(.63 * turn) * 10.08 }
      : { x: pad.position.x, y: i * 5 + 3, z: pad.position.z };
    const state = { version: 1, course: c.id, mode: 'main', position, velocity: { x: 0, y: -18, z: 0 },
      attached: null, length: 0, peak: position.y, time: 0, falls: 0, tick: 0, finished: false };
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
    return { position, target: c.anchors.find(a => a.id === `fly-refuge-${i}`).position };
  }, { i, outside });
  await page.reload();
  await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  await page.locator('#continue').click();
  await page.locator('#resume').click();
  return fixture;
}

async function aim(point) {
  const data = await page.locator('#world').evaluate(c => ({ x: Number(c.dataset.cameraX), y: Number(c.dataset.cameraY), z: Number(c.dataset.cameraZ),
    yaw: Number(c.dataset.cameraYaw), pitch: Number(c.dataset.cameraPitch) }));
  const camera = new THREE.PerspectiveCamera(60, 1440 / 900, .1, 330);
  camera.position.set(data.x, data.y, data.z);
  const offset = new THREE.Vector3(Math.sin(data.yaw) * Math.cos(data.pitch), Math.sin(data.pitch), Math.cos(data.yaw) * Math.cos(data.pitch));
  camera.lookAt(camera.position.clone().sub(offset)); camera.updateMatrixWorld();
  const p = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  const x = (p.x + 1) * 720, y = (1 - p.y) * 450;
  assert.ok(x > 0 && x < 1440 && y > 0 && y < 900, 'restart fly visible');
  await page.mouse.move(x, y);
}

try {
  for (const i of [3, 9, 15, 21, 27, 33]) {
    const fixture = await seed(i);
    await page.waitForFunction(id => document.querySelector('#ui').dataset.refuge === id, `refuge-${i}`, { timeout: 4000 });
    const landed = await get();
    assert.ok(Math.abs(landed.height - i * 5) < .3);
    assert.match(await page.locator('#zone').innerText(), /안쪽 지형/);
    await page.waitForTimeout(250);
    await shot(`landing-${i}`);
    await aim(fixture.target);
    await page.mouse.down();
    await page.waitForFunction(id => document.querySelector('#ui').dataset.attached === id, `fly-refuge-${i}`, { timeout: 2000 });
    await page.keyboard.down('a'); await page.waitForTimeout(250); await page.keyboard.up('a');
    await page.keyboard.press('Escape'); await page.mouse.up();
    results.push({ check: 'local fall lands on terrace and real mouse input starts another swing', i, fixture, landed, attached: (await get()).attached });
  }
  await seed(3, true);
  await page.waitForFunction(() => Number(document.querySelector('#ui').dataset.height) < 1, null, { timeout: 6000 });
  assert.equal((await get()).refuge, '');
  await shot('major-fall');
  results.push({ check: 'outside first terrace a failed transition falls back to ground', passed: true });
  assert.equal(errors.length, 0);
} catch (e) { results.push({ failed: String(e) }); await shot('failure'); process.exitCode = 1; }
await writeFile(new URL('refuge-playtest.json', output), JSON.stringify({ fixtureBased: true, results, errors }, null, 2));
console.log(JSON.stringify({ results, errors }));
await browser.close();
