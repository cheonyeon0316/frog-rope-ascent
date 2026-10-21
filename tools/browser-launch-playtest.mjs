import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL(`../playtest/${process.env.PLAYTEST_OUTPUT ?? ''}`, import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const results = [], errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shot = name => page.screenshot({ path: fileURLToPath(new URL(`launch-${name}.png`, output)) });
const boot = () => page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
const get = () => page.locator('#ui').evaluate(ui => ({ state: ui.dataset.state, attached: ui.dataset.attached, height: Number(ui.dataset.height),
  dash: ui.dataset.dashKind, refuge: ui.dataset.refuge, v: { x: Number(ui.dataset.velocityX), y: Number(ui.dataset.velocityY), z: Number(ui.dataset.velocityZ) } }));
async function aim(point) {
  const data = await page.locator('#world').evaluate(c => ({ x: Number(c.dataset.cameraX), y: Number(c.dataset.cameraY), z: Number(c.dataset.cameraZ), yaw: Number(c.dataset.cameraYaw), pitch: Number(c.dataset.cameraPitch) }));
  const camera = new THREE.PerspectiveCamera(60, 1440 / 900, .1, 330); camera.position.set(data.x, data.y, data.z);
  const offset = new THREE.Vector3(Math.sin(data.yaw) * Math.cos(data.pitch), Math.sin(data.pitch), Math.cos(data.yaw) * Math.cos(data.pitch));
  camera.lookAt(camera.position.clone().sub(offset)); camera.updateMatrixWorld();
  const p = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  const x = (p.x + 1) * 720, y = (1 - p.y) * 450;
  assert.ok(x > 0 && x < 1440 && y > 0 && y < 900, 'launch target visible');
  await page.mouse.move(x, y);
}
async function waitDash() {
  await page.waitForFunction(() => document.querySelector('#ui').dataset.dashKind === 'launch', null, { timeout: 2000 });
  return get();
}

try {
  await page.goto(gameURL); await boot(); await page.locator('#training').click();
  await page.waitForTimeout(450); await page.keyboard.press('Space');
  await page.waitForFunction(() => Number(document.querySelector('#ui').dataset.height) > 1.3, null, { timeout: 1500 });
  await shot('higher-jump');
  await page.waitForFunction(() => Number(document.querySelector('#ui').dataset.height) < .1, null, { timeout: 2000 });
  results.push({ check: 'real Space produces the higher ground jump', passed: true });

  await aim({ x: .8, y: 4.7, z: 3 }); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.attached === 'fly-0');
  await page.keyboard.down('Space'); const launch = await waitDash();
  assert.equal(launch.attached, ''); assert.ok(Math.hypot(launch.v.x, launch.v.y, launch.v.z) > 8.5 && Math.hypot(launch.v.x, launch.v.y, launch.v.z) < 15);
  await shot('strong-burst');
  await page.waitForTimeout(300); await shot('pull-mid');
  await page.mouse.up(); assert.equal((await get()).attached, '');
  await page.waitForFunction(() => !document.querySelector('#ui').dataset.dashKind, null, { timeout: 3000 });
  await aim({ x: 2.8, y: 7.4, z: .9 }); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.attached === 'fly-1', null, { timeout: 2000 });
  await page.keyboard.down('Space'); await page.waitForTimeout(70);
  assert.equal((await get()).attached, 'fly-1', 'holding/repeating Space must not auto-launch a newly caught food');
  await page.keyboard.up('Space'); await page.keyboard.down('Space');
  const chained = await waitDash(); assert.equal(chained.attached, '');
  await page.keyboard.up('Space'); await page.mouse.up();
  results.push({ check: 'hold mode Space eats and launches; repeated key does not auto-chain; fresh press launches again', launch, chained });

  await page.keyboard.press('Escape'); await page.locator('#settings-pause').click();
  await page.locator('#setting-toggle').selectOption('true'); await page.locator('#settings-close').click();
  await page.locator('#restart').click(); await page.locator('#yes').click(); await page.waitForTimeout(450);
  await aim({ x: .8, y: 4.7, z: 3 }); await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.attached === 'fly-0');
  await page.keyboard.press('Space'); assert.equal((await waitDash()).attached, '');
  results.push({ check: 'toggle mode also supports Space launch', passed: true });

  // Explicit saved fixture at the last pond leaf; the subsequent crossing uses real input.
  await page.goto(gameURL); await boot();
  await page.evaluate(async () => {
    const { makeCourse } = await import('/src/game/course.ts');
    const c = makeCourse('main'), pad = c.platforms.find(p => p.id === 'pad-2'), p=pad.position;
    const a = c.anchors.find(a => a.id === 'food-crossing-pond');
    const position = { x: p.x, y: p.y + pad.size.y/2 + .4, z: p.z };
    const state = { version: 1, course: c.id, mode: 'main', position, velocity: { x: 0, y: 0, z: 0 }, attached: a.id,
      length: Math.hypot(position.x - a.position.x, position.y - a.position.y, position.z - a.position.z), peak: p.y, time: 0, falls: 0, tick: 0, finished: false };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('frog-ascent-local', 1); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('states', 'readwrite'); tx.objectStore('states').put(state, 'current');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.reload(); await boot(); await page.locator('#continue').click(); await page.locator('#resume').click();
  await page.keyboard.press('Space'); await waitDash();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#ui').dataset.state === 'paused');
  const paused = await get();
  await page.waitForTimeout(350); assert.deepEqual(await get(), paused);
  await page.reload(); await boot(); await page.locator('#continue').click();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.state === 'paused');
  const restored = await get(); assert.equal(restored.dash, 'launch'); assert.deepEqual(restored.v, paused.v);
  await page.locator('#resume').click();
  await page.waitForFunction(() => !document.querySelector('#ui').dataset.dashKind,null,{timeout:3000});
  const arrival=await page.evaluate(async()=>{
    const {makeCourse}=await import('/src/game/course.ts');const c=makeCourse('main');
    const beat=c.route.find(b=>b.platform==='pad-2');return c.anchors.find(a=>a.id===beat.arrival);
  });
  await aim(arrival.position);await page.mouse.down();await page.mouse.up();
  await page.waitForFunction(id=>document.querySelector('#ui').dataset.attached===id,arrival.id,{timeout:2000});
  await page.keyboard.press('Space');await waitDash();
  await page.waitForFunction(() => document.querySelector('#ui').dataset.refuge === 'basin-grass', null, { timeout: 5000 });
  await shot('crossing-landed');
  results.push({ check: 'strong dash survives pause and reload, then reconnects and crosses into grass with real input', paused, restored, landed: await get(), fixtureBased: true });
  assert.equal(errors.length, 0);
} catch (e) { results.push({ failed: String(e) }); await shot('failure'); process.exitCode = 1; }
await writeFile(new URL('launch-playtest.json', output), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors })); await browser.close();
