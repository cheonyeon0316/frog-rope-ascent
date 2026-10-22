import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { makeCourse, courseForSave } from '../src/game/course';
import { makeEcosystemV2 } from '../src/game/ecosystem-v2';
import { makeEcosystemV3 } from '../src/game/ecosystem-v3';
import { makeEcosystem } from '../src/game/ecosystem';
import { Simulation } from '../src/game/simulation';
import { platformMesh } from '../src/game/environment';
import { vec, distance, type Controls } from '../src/game/types';

beforeAll(async()=>{await RAPIER.init();});
const idle:Controls={x:0,z:0,jump:false,grapplePress:false,grappleRelease:false};

it('keeps old ecosystem saves on their original terrain and gives new runs the authored map',()=>{
  const old=new Simulation(makeEcosystemV2());
  const save={...old.snapshot(),position:vec(40,84,-32),velocity:vec(1,-8,2),peak:90};
  const restored=new Simulation(courseForSave(save)); restored.restore(save);
  expect(restored.course.id).toBe('ecosystem-main-v2');
  expect(restored.position).toEqual(save.position); expect(restored.velocity).toEqual(save.velocity);
  const prior=new Simulation(makeEcosystemV3());
  const priorSave={...prior.snapshot(),position:vec(-10,175,1),velocity:vec(0,0,0)};
  const priorRestored=new Simulation(courseForSave(priorSave)); priorRestored.restore(priorSave);
  expect(priorRestored.course.id).toBe('ecosystem-main-v3');
  const oldV4=new Simulation(makeEcosystem());
  const oldV4Save={...oldV4.snapshot(),position:vec(8,214,30),velocity:vec(0,-3,1)};
  const oldV4Restored=new Simulation(courseForSave(oldV4Save)); oldV4Restored.restore(oldV4Save);
  expect(oldV4Restored.course.id).toBe('ecosystem-main-v4');
  const current=makeCourse('main');
  expect(current.id).toBe('ecosystem-main-v5');
  expect(current.height).toBe(1540);
  expect(makeCourse('main').biomes).toHaveLength(10);
  expect(current.route).toHaveLength(221);
  expect(current.platforms.filter(p=>p.id.startsWith('bridge-'))).toHaveLength(174);
  expect(current.anchors.filter(a=>a.id.startsWith('v5-route-'))).toHaveLength(440);
  expect(current.start.y).toBeLessThan(-40);
  expect(current.platforms.find(p=>p.id==='ground')!.position.y + current.platforms.find(p=>p.id==='ground')!.size.y / 2).toBeCloseTo(-45);
  expect(current.landscapes![0].hole!.radius).toBeCloseTo(10);
  expect(current.solids!.find(s=>s.kind==='trunk')!.radius).toBeCloseTo(1.1);
  expect(current.biomes![1].end-current.biomes![1].start).toBe(140);
  expect(current.platforms.find(p=>p.id==='pad-3')!.position.y+current.platforms.find(p=>p.id==='pad-3')!.size.y/2).toBeCloseTo(15.5*7);
  expect(oldV4Restored.position).toEqual(oldV4Save.position);
  old.dispose();restored.dispose();prior.dispose();priorRestored.dispose();oldV4.dispose();oldV4Restored.dispose();
});

it('has closed, finite shared geometry and different silhouettes for all biome recoveries',()=>{
  const c=makeCourse('main'),forms=new Set<string>();
  for(const p of c.platforms.filter(p=>p.form)){
    const m=platformMesh(p);
    expect([...m.vertices].every(Number.isFinite),p.id).toBe(true);
    expect([...m.indices].every(i=>i<m.vertices.length/3),p.id).toBe(true);
    expect(m.indices.length%3).toBe(0);
    const edges=new Map<string,number>();
    for(let i=0;i<m.indices.length;i+=3) for(let j=0;j<3;j++) {
      const a=m.indices[i+j],b=m.indices[i+(j+1)%3],key=`${Math.min(a,b)}:${Math.max(a,b)}`;
      edges.set(key,(edges.get(key)??0)+1);
    }
    expect([...edges.values()].every(n=>n===2),`closed ${p.id}`).toBe(true);
    if(p.refuge) forms.add(p.form!);
  }
  expect(forms.size).toBeGreaterThanOrEqual(5);
  expect(c.landscapes).toHaveLength(1);
});

it('counts the grass entry leaf as the refuge floor beneath it',()=>{
  const s=new Simulation(makeCourse('main')),basin=s.course.platforms.find(p=>p.id==='basin-grass')!;
  s.body.setTranslation(vec(basin.position.x,basin.position.y+basin.size.y/2+.4,basin.position.z),true);
  s.body.setLinvel(vec(),true);
  for(let t=0;t<4;t++)s.step(idle,null);
  expect(s.grounded).toBe(true);
  expect(s.refuge?.id).toBe('basin-grass');
  s.dispose();
});

it('places each swing beat close to its recovery surfaces with real catchable food',()=>{
  const c=makeCourse('main');
  const byId=(id:string)=>c.platforms.find(p=>p.id===id)!;
  const food=(id:string)=>c.anchors.find(a=>a.id===id)!;
  for(let i=0;i<c.route!.length-1;i++){
    const beat=c.route![i],next=c.route![i+1],platform=byId(beat.platform),destination=byId(next.platform);
    expect(platform.size.x,beat.name).toBeGreaterThanOrEqual(2.3);
    expect(platform.size.z,beat.name).toBeGreaterThanOrEqual(2.3);
    const sim=new Simulation(c);
    const stand=vec(platform.position.x,platform.position.y+platform.size.y/2+.4,platform.position.z);
    sim.body.setTranslation(stand,true);sim.body.setLinvel(vec(),true);
    const launch=food(beat.launch),arrival=food(beat.arrival!);
    expect(distance(stand,launch.position),beat.name).toBeLessThan(18);
    expect(distance(vec(destination.position.x,destination.position.y+destination.size.y/2+.4,destination.position.z),arrival.position),beat.name).toBeLessThan(11);
    const rayDistance=distance(stand,launch.position),rayDirection=vec((launch.position.x-stand.x)/rayDistance,(launch.position.y-stand.y)/rayDistance,(launch.position.z-stand.z)/rayDistance);
    const hit=sim.world.castRay(new RAPIER.Ray(stand,rayDirection),rayDistance-.04,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.collider,sim.body);
    const attached=sim.attach(beat.launch);
    const hitPosition=hit?.collider.translation();
    const nearby=c.platforms.filter(p=>hitPosition&&Math.hypot(p.position.x-hitPosition.x,p.position.z-hitPosition.z)<1&&Math.abs(p.position.y-hitPosition.y)<2).map(p=>p.id);
    expect(attached,`${beat.name}: ${beat.launch} stand=${JSON.stringify(stand)} food=${JSON.stringify(launch.position)} d=${rayDistance.toFixed(2)} blocked=${sim.blocked(stand,launch.position)} hit=${JSON.stringify(hitPosition)} nearby=${nearby.join(',')}`).toBe(true);
    expect(distance(launch.position,arrival.position),`${beat.name} launch=${JSON.stringify(launch.position)} arrival=${JSON.stringify(arrival.position)}`).toBeLessThan(18);
    expect(launch.food,beat.name).toBeDefined();expect(arrival.food,beat.name).toBeDefined();
    sim.release('blocked');
    const landingStand=vec(destination.position.x,destination.position.y+destination.size.y/2+.4,destination.position.z);
    sim.body.setTranslation(landingStand,true);sim.body.setLinvel(vec(),true);
    const arrivalDistance=distance(landingStand,arrival.position),arrivalDirection=vec((arrival.position.x-landingStand.x)/arrivalDistance,(arrival.position.y-landingStand.y)/arrivalDistance,(arrival.position.z-landingStand.z)/arrivalDistance);
    const arrivalHit=sim.world.castRay(new RAPIER.Ray(landingStand,arrivalDirection),arrivalDistance-.04,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.collider,sim.body);
    expect(sim.attach(beat.arrival!),`${beat.name}: arrival ${beat.arrival} stand=${JSON.stringify(landingStand)} food=${JSON.stringify(arrival.position)} d=${arrivalDistance.toFixed(2)} blocked=${sim.blocked(landingStand,arrival.position)} hit=${JSON.stringify(arrivalHit?.collider.translation())}`).toBe(true);
    sim.dispose();
  }
}, 15000);
