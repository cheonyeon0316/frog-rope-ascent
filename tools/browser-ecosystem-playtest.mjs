import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../playtest/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const results = [], errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`ecosystem-${name}.png`, output)) });
const boot = () => page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
const get = () => page.locator('#ui').evaluate(ui => ({ height: Number(ui.dataset.height), refuge: ui.dataset.refuge, biome: ui.dataset.biome, attached: ui.dataset.attached }));

// Fixtures isolate local falls and food types. They do not represent a full human ascent.
async function seed(zone, moth = false) {
  await page.goto(gameURL); await boot();
  const fixture = await page.evaluate(async ({ zone, moth }) => {
    const { makeCourse } = await import('/src/game/course.ts');
    const { FOOD_NAMES } = await import('/src/game/types.ts');
    const c = makeCourse('main'), b = c.biomes[zone];
    const target = moth ? c.anchors.find(a => a.food === 'moth' && a.id.endsWith('-b')) : c.anchors.find(a => a.id === `food-basin-${b.id}`);
    const position = moth ? { x: target.position.x, y: target.position.y - 2, z: target.position.z + 2 }
      : { x: b.center.x, y: b.start + 4, z: b.center.z };
    const state = { version: 1, course: c.id, mode: 'main', position, velocity: { x: 0, y: moth ? 0 : -15, z: 0 },
      attached: null, length: 0, peak: position.y, time: 0, falls: 0, tick: 0, finished: false };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('frog-ascent-local', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('states', 'readwrite'); tx.objectStore('states').put(state, 'current');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
    return { zone, biome: b, target, name: FOOD_NAMES[target.food], position };
  }, { zone, moth });
  await page.reload(); await boot(); await page.locator('#continue').click();
  return fixture;
}

async function aim(point) {
  const data = await page.locator('#world').evaluate(c => ({ x: Number(c.dataset.cameraX), y: Number(c.dataset.cameraY), z: Number(c.dataset.cameraZ), yaw: Number(c.dataset.cameraYaw), pitch: Number(c.dataset.cameraPitch) }));
  const camera = new THREE.PerspectiveCamera(60, 1440 / 900, .1, 330); camera.position.set(data.x, data.y, data.z);
  const offset = new THREE.Vector3(Math.sin(data.yaw) * Math.cos(data.pitch), Math.sin(data.pitch), Math.cos(data.yaw) * Math.cos(data.pitch));
  camera.lookAt(camera.position.clone().sub(offset)); camera.updateMatrixWorld();
  const p = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  const x = (p.x + 1) * 720, y = (1 - p.y) * 450;
  assert.ok(x > 0 && x < 1440 && y > 0 && y < 900, 'food must be visible');
  await page.mouse.move(x, y);
}

try {
  await page.goto(gameURL); await boot(); await shot('title');
  await page.locator('#start').click(); await page.waitForTimeout(800); await shot('pond');
  results.push({ check: 'fresh game starts in the pond', state: await get() });
  for (let zone = 1; zone <= 7; zone++) {
    const fixture = await seed(zone); await page.locator('#resume').click();
    await page.waitForFunction(id => document.querySelector('#ui').dataset.refuge === id, `basin-${fixture.biome.id}`, { timeout: 4000 });
    await page.waitForTimeout(900);
    assert.equal((await get()).biome, fixture.biome.id);
    await shot(fixture.biome.id);
    await aim(fixture.target.position); await page.waitForTimeout(70);
    assert.ok((await page.locator('#hint').innerText()).includes(fixture.name));
    await page.mouse.down();
    await page.waitForFunction(id => document.querySelector('#ui').dataset.attached === id, fixture.target.id, { timeout: 2000 });
    await shot(`food-${fixture.target.food}`);
    await page.mouse.up();
    await page.waitForTimeout(100);
    assert.ok((await page.locator('#toast').innerText()).includes(fixture.name));
    results.push({ check: 'local fall is caught by this ecosystem, actual input catches and eats its food', fixture, state: await get() });
    await page.keyboard.press('Escape');
  }
  const moth = await seed(4, true);
  await page.waitForTimeout(500);
  await page.locator('#resume').click(); await aim(moth.target.position);
  await page.mouse.down();
  await page.waitForFunction(id => document.querySelector('#ui').dataset.attached === id, moth.target.id, { timeout: 2000 });
  await shot('food-moth'); await page.keyboard.press('Escape'); await page.mouse.up();
  results.push({ check: 'real input catches a moth with its own model and moving path', passed: true });
  await page.setViewportSize({ width: 1024, height: 720 }); await page.locator('#resume').click(); await page.waitForTimeout(150); await shot('small-window');
  assert.equal(errors.length, 0);
} catch (e) { results.push({ failed: String(e) }); await shot('failure'); process.exitCode = 1; }
await writeFile(new URL('ecosystem-playtest.json', output), JSON.stringify({ fixtureBased: true, results, errors }, null, 2));
console.log(JSON.stringify({ results, errors }));
await browser.close();
