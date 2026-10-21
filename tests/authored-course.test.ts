import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { makeCourse, courseForSave } from '../src/game/course';
import { makeEcosystemV2 } from '../src/game/ecosystem-v2';
import { Simulation } from '../src/game/simulation';
import { platformMesh } from '../src/game/environment';
import { vec, clamp, type Controls } from '../src/game/types';

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

it('traverses from the pond to the summit with input only and no position resets',()=>{
  const s=new Simulation(makeCourse('main'));
  const pads=s.course.platforms;
  const trace:unknown[]=[];
  const steer=(p:typeof pads[number])=>{
    const pos=s.position,v=s.velocity;
    return {...idle,x:clamp((p.position.x-pos.x)*.6-v.x*.45,-1,1),z:clamp((p.position.z-pos.z)*.6-v.z*.45,-1,1)};
  };
  const dash=(id:string)=>{
    s.step({...idle,grapplePress:true},id);
    expect(s.attached,`${id} from ${JSON.stringify(s.position)}`).toBe(id);
    s.step({...idle,jump:true},null);
    for(let t=0;t<230&&s.dash;t++)s.step(idle,null);
    trace.push({id,p:s.position,v:s.velocity});
  };
  const land=(p:typeof pads[number])=>{
    let landed=false;
    for(let t=0;t<420;t++){
      s.step(steer(p),null);
      if(s.grounded&&Math.abs(s.position.y-p.position.y-p.size.y/2-.4)<1.2&&Math.hypot(s.position.x-p.position.x,s.position.z-p.position.z)<2){landed=true;break;}
    }
    expect(landed,`${p.id} at ${JSON.stringify(s.position)} ${JSON.stringify(trace.slice(-2))}`).toBe(true);
  };
  for(let t=0;t<60;t++)s.step(idle,null);
  s.step({...idle,jump:true},null);
  for(let t=0;t<18;t++)s.step(idle,null);
  dash('fly-1-a');dash('fly-1-b');land(pads.find(p=>p.id==='pad-1')!);
  for(let i=0;i<s.course.route!.length-1;i++){
    const beat=s.course.route![i],p=pads.find(p=>p.id===beat.platform)!;
    for(let t=0;t<160;t++)s.step(steer(p),null);
    s.step({...idle,jump:true},null);
    for(let t=0;t<18;t++)s.step(idle,null);
    dash(beat.launch);dash(beat.arrival!);
    land(pads.find(p=>p.id===s.course.route![i+1].platform)!);
  }
  for(let t=0;t<120;t++)s.step(idle,null);
  expect(s.finished).toBe(true);
  expect(s.events.some(e=>e.type==='reset')).toBe(false);
  s.dispose();
});

it('clears each authored route leg with a jump, food launch and air steering',()=>{
  const c=makeCourse('main'),failures:unknown[]=[];
  for(let i=0;i<c.route!.length-1;i++){
    const s=new Simulation(c),beat=c.route![i],next=c.route![i+1];
    const a=c.platforms.find(p=>p.id===beat.platform)!,b=c.platforms.find(p=>p.id===next.platform)!;
    const y=a.position.y+a.size.y/2+.42;
    s.body.setTranslation(vec(a.position.x,y,a.position.z),true);s.body.setLinvel(vec(),true);
    for(let t=0;t<20;t++)s.step(idle,null);
    s.step({...idle,jump:true},null);
    for(let t=0;t<18;t++)s.step(idle,null);
    if(!s.attach(beat.launch)){failures.push({leg:beat.name,problem:'cannot attach',anchor:beat.launch,p:s.position});s.dispose();continue;}
    s.step({...idle,jump:true},null);
    for(let t=0;t<230&&s.dash;t++)s.step(idle,null);
    const relayAt=s.position;
    if(!s.attach(beat.arrival!)){
      const target=s.anchorPosition(beat.arrival!)!,d=Math.hypot(target.x-relayAt.x,target.y-relayAt.y,target.z-relayAt.z);
      const hit=s.world.castRay(new RAPIER.Ray(relayAt,vec((target.x-relayAt.x)/d,(target.y-relayAt.y)/d,(target.z-relayAt.z)/d)),d,true,undefined,undefined,s.collider,s.body);
      failures.push({leg:beat.name,problem:'cannot reconnect',anchor:beat.arrival,p:s.position,obstruction:hit?.collider.translation()});s.dispose();continue;
    }
    s.step({...idle,jump:true},null);
    for(let t=0;t<230&&s.dash;t++)s.step(idle,null);
    const arrivalAt=s.position,arrivalVelocity=s.velocity;
    let landed=false,peak=s.position.y;
    for(let t=0;t<420;t++){
      const p=s.position,v=s.velocity;
      s.step({...idle,x:clamp((b.position.x-p.x)*.6-v.x*.45,-1,1),z:clamp((b.position.z-p.z)*.6-v.z*.45,-1,1)},null);
      peak=Math.max(peak,s.position.y);
      if(s.grounded&&Math.abs(s.position.y-b.position.y-b.size.y/2-.4)<1.2&&Math.hypot(s.position.x-b.position.x,s.position.z-b.position.z)<2){landed=true;break;}
    }
    if(!landed)failures.push({leg:beat.name,target:next.name,relayAt,arrivalAt,arrivalVelocity,peak,p:s.position});
    s.dispose();
  }
  expect(failures).toEqual([]);
});
