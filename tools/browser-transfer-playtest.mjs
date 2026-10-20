import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchOptions, gameURL } from './browser-config.mjs';
const output = new URL('../playtest/', import.meta.url); await mkdir(output, { recursive: true });
const browser = await chromium.launch(launchOptions);
const a = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const b = await browser.newContext({ viewport: { width: 1024, height: 720 } });
const errors = [], failed = [], requests = [];
function observe(page) {
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) failed.push({ status: r.status(), url: r.url() }); });
  page.on('request', r => requests.push(r.url()));
}
const first = await a.newPage(), second = await b.newPage(); observe(first); observe(second);
const boot = async page => { await page.goto(gameURL); await page.locator('#boot').waitFor({ state: 'detached', timeout: 30000 }); };
try {
  await boot(first); await first.locator('#start').click();
  await first.keyboard.down('d'); await first.waitForTimeout(250); await first.keyboard.up('d');
  await first.locator('#pause-button').click(); await first.locator('#settings-pause').click();
  await first.locator('#setting-assisted').check();
  const download = first.waitForEvent('download'); await first.locator('#backup-export').click();
  const file = fileURLToPath(new URL('transfer-save.json', output));
  const stream = await (await download).createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  await writeFile(file, Buffer.concat(chunks));
  const backup = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(backup.format, 'frog-ascent-backup'); assert.equal(backup.settings.assisted, true); assert.ok(backup.current.time > 0);
  await boot(second); await second.locator('#settings-title').click();
  await second.locator('#backup-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await second.waitForTimeout(150); assert.match(await second.locator('#backup-status').innerText(), /JSON/);
  assert.equal(await second.locator('#setting-assisted').isChecked(), false);
  second.on('dialog', dialog => dialog.accept());
  await second.locator('#backup-file').setInputFiles(file);
  await second.locator('#settings').waitFor({ state: 'hidden' }); await second.locator('#continue').waitFor({ state: 'visible' });
  await second.locator('#continue').click(); await second.waitForTimeout(150);
  const time = Number(await second.locator('#ui').getAttribute('data-active-time'));
  assert.ok(Math.abs(time - backup.current.time) < .0002, 'restored run must remain paused at exact time');
  await second.locator('#settings-pause').click(); assert.equal(await second.locator('#setting-assisted').isChecked(), true);
  await second.screenshot({ path: fileURLToPath(new URL('transfer-imported-settings.png', output)) });
  // Confirmed overwrite, then reject a valid-format save with an unknown fly; current save survives.
  await second.locator('#backup-file').setInputFiles(file); await second.locator('#settings').waitFor({ state: 'hidden' });
  await second.locator('#settings-title').click();
  const invalid = structuredClone(backup); invalid.current.attached = 'no-such-fly'; invalid.current.length = 3;
  await second.locator('#backup-file').setInputFiles({ name: 'invalid-anchor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await second.waitForTimeout(200); assert.match(await second.locator('#backup-status').innerText(), /파리/);
  await second.locator('#settings-close').click(); await second.reload(); await second.locator('#boot').waitFor({ state: 'detached', timeout: 30000 });
  await second.locator('#continue').click(); await second.waitForTimeout(150);
  assert.ok(Math.abs(Number(await second.locator('#ui').getAttribute('data-active-time')) - backup.current.time) < .0002);
  const result = { gameURL, independentBrowserProfiles: true, importExactTime: time, savedTime: backup.current.time,
    corruptedImportPreservesSave: true, settingsRestored: true, errors, failedResponses: failed,
    remoteRequests: requests.filter(url => !url.startsWith(new URL(gameURL).origin)) };
  assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(result.remoteRequests, []);
  await writeFile(new URL('transfer-check.json', output), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
