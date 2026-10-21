import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { makeCourse, courseForSave } from '../src/game/course';
import { makeEcosystemV2 } from '../src/game/ecosystem-v2';
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
  expect(makeCourse('main').id).toBe('ecosystem-main-v3');
  old.dispose();restored.dispose();
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
  const s=new Simulation(makeCourse('main')),pad=s.course.platforms.find(p=>p.id==='pad-3')!;
  s.body.setTranslation(vec(pad.position.x,pad.position.y+pad.size.y/2+.4,pad.position.z),true);
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
    expect(platform.size.x,beat.name).toBeGreaterThanOrEqual(4.4);
    expect(platform.size.z,beat.name).toBeGreaterThanOrEqual(4.4);
    const sim=new Simulation(c);
    const stand=vec(platform.position.x,platform.position.y+platform.size.y/2+.4,platform.position.z);
    sim.body.setTranslation(stand,true);sim.body.setLinvel(vec(),true);
    const launch=food(beat.launch),arrival=food(beat.arrival!);
    expect(distance(stand,launch.position),beat.name).toBeLessThan(6.5);
    expect(distance(vec(destination.position.x,destination.position.y+destination.size.y/2+.4,destination.position.z),arrival.position),beat.name).toBeLessThan(3);
    const rayDistance=distance(stand,launch.position),rayDirection=vec((launch.position.x-stand.x)/rayDistance,(launch.position.y-stand.y)/rayDistance,(launch.position.z-stand.z)/rayDistance);
    const hit=sim.world.castRay(new RAPIER.Ray(stand,rayDirection),rayDistance-.04,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,sim.collider,sim.body);
    const attached=sim.attach(beat.launch);
    expect(attached,`${beat.name}: ${beat.launch} d=${rayDistance.toFixed(2)} blocked=${sim.blocked(stand,launch.position)} hit=${JSON.stringify(hit?.collider.translation())}`).toBe(true);
    expect(distance(launch.position,arrival.position),beat.name).toBeLessThan(10);
    expect(launch.food,beat.name).toBeDefined();expect(arrival.food,beat.name).toBeDefined();
    sim.release('blocked');
    const landingStand=vec(destination.position.x,destination.position.y+destination.size.y/2+.4,destination.position.z);
    sim.body.setTranslation(landingStand,true);sim.body.setLinvel(vec(),true);
    expect(sim.attach(beat.arrival!),`${beat.name}: arrival ${beat.arrival}`).toBe(true);
    sim.dispose();
  }
});
