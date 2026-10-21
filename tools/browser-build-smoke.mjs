import { chromium } from '@playwright/test';
import { launchOptions } from './browser-config.mjs';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output=new URL('../playtest/level-rebuild/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch(launchOptions),results=[];
try {
  for(const [name,url] of [['production','http://127.0.0.1:5280/'],['standalone',new URL('../frog-ascent.html',import.meta.url).href]]) {
    const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(url);await page.locator('#boot').waitFor({state:'detached',timeout:30000});
    assert.equal(await page.locator('#world').getAttribute('data-course'),'ecosystem-main-v3');
    await page.locator('#start').click();
    await page.waitForFunction(()=>document.querySelector('#ui').dataset.state==='playing');
    await page.waitForTimeout(500);await page.keyboard.press('Space');
    await page.waitForFunction(()=>Number(document.querySelector('#ui').dataset.height)>1.2,null,{timeout:2000});
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#ui').dataset.state==='paused');
    await page.screenshot({path:fileURLToPath(new URL(`${name}-jump.png`,output))});
    await page.reload();await page.locator('#boot').waitFor({state:'detached',timeout:30000});
    await page.locator('#continue').click();
    await page.waitForFunction(()=>document.querySelector('#ui').dataset.state==='paused');
    assert.equal(await page.locator('#world').getAttribute('data-course'),'ecosystem-main-v3');
    assert.equal(errors.length,0);
    results.push({name,url,course:'ecosystem-main-v3',jump:true,saveRestore:true,errors});
    await context.close();
  }
  await writeFile(new URL('build-smoke.json',output),JSON.stringify({results},null,2));
  console.log(JSON.stringify({results}));
} finally {await browser.close();}
