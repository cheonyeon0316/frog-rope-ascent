import { chromium } from '@playwright/test';
import { launchOptions, gameURL } from './browser-config.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output=new URL('../playtest/level-rebuild/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.goto(gameURL);
  await page.locator('#boot').waitFor({state:'detached',timeout:30000});
  const zones=await page.evaluate(async()=>{
    const {Garden}=await import('/src/render/garden.ts');
    const {Simulation}=await import('/src/game/simulation.ts');
    const {makeCourse}=await import('/src/game/course.ts');
    const canvas=document.createElement('canvas');canvas.id='level-review';
    canvas.style.cssText='position:fixed;inset:0;z-index:10000;width:100vw;height:100vh';document.body.append(canvas);
    const course=makeCourse('main'),garden=new Garden(canvas),sim=new Simulation(course);
    garden.load(course);window.__levelReview={garden,sim,course};
    return course.biomes.map(b=>({id:b.id,name:b.name}));
  });
  for(let zone=0;zone<zones.length;zone++){
    await page.evaluate(zone=>{
      const {garden:g,sim,course}=window.__levelReview,b=course.biomes[zone];
      const mid=(b.start+b.end)/2;
      sim.body.setTranslation({x:b.center.x,y:mid,z:b.center.z},true);
      g.update(sim,null,1/60,0,false);
      g.scene.background.set(b.sky);g.scene.fog.color.set(b.sky);
      g.scene.fog.density=.003;
      g.camera.position.set(b.center.x+28,mid+12,b.center.z+36);
      g.camera.lookAt(b.center.x,mid,b.center.z);g.camera.updateMatrixWorld();
      g.renderer.render(g.scene,g.camera);
    },zone);
    await page.locator('#level-review').screenshot({path:fileURLToPath(new URL(`overview-${zones[zone].id}.png`,output))});
  }
  await writeFile(new URL('overviews.json',output),JSON.stringify({diagnosticCamera:true,zones,errors},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({captured:zones.length,errors}));
} finally {await browser.close();}
