import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { makeCourse } from '../src/game/course';
import { Simulation, DASH_CONFIG, validSave } from '../src/game/simulation';
import { vec, distance, length, clamp, type Controls } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };

it('raises a ground jump to about 1.5m and does not jump again in the air', () => {
  const s = new Simulation(makeCourse('training'));
  for (let t = 0; t < 60; t++) s.step(idle, null);
  const start = s.position.y;
  s.step({ ...idle, jump: true }, null);
  let peak = s.position.y;
  for (let t = 0; t < 60; t++) { s.step(idle, null); peak = Math.max(peak, s.position.y); }
  expect(peak - start).toBeGreaterThan(1.45); expect(peak - start).toBeLessThan(1.6);
  const speed = s.velocity.y; s.step({ ...idle, jump: true }, null);
  expect(s.velocity.y).toBeLessThan(speed); expect(s.events.some(e => e.type === 'dash')).toBe(false);
  s.dispose();
});

it('eats and launches toward the attached target on Space even during a fast fall', () => {
  const s = new Simulation(makeCourse('training'));
  expect(s.attach('fly-0')).toBe(true);
  const p = s.position, a = s.anchor!.position, d = distance(p, a);
  const n = vec((a.x - p.x) / d, (a.y - p.y) / d, (a.z - p.z) / d);
  s.body.setLinvel(vec(-n.x * 25, -n.y * 25, -n.z * 25), true);
  s.step({ ...idle, jump: true }, null);
  expect(s.attached).toBeNull(); expect(s.flyLife('fly-0').phase).toBe('retracting');
  expect(s.dash?.kind).toBe('launch');
  expect(length(s.velocity)).toBeGreaterThan(8.5);
  expect(length(s.velocity)).toBeLessThan(DASH_CONFIG.launchMaxSpeed);
  const launch = s.dash!;
  expect(launch.distance).toBeCloseTo(d, 5);
  expect(launch.duration).toBeCloseTo(launch.distance! / (DASH_CONFIG.launchCruiseSpeed * .9), 5);
  expect(launch.anchor).toBe('fly-0');
  const origin = s.position;
  for (let t = 0; t < 120 && s.dash; t++) s.step(idle, null);
  const progress = (s.position.x - origin.x) * n.x + (s.position.y - origin.y) * n.y + (s.position.z - origin.z) * n.z;
  expect(progress).toBeGreaterThan(d - .25);
  expect(progress).toBeLessThan(d + .1);
  const arrivalVelocity = s.velocity;
  expect(arrivalVelocity.y).toBeGreaterThan(0);
  s.step(idle, null);
  expect(s.velocity.y).toBeLessThan(arrivalVelocity.y - .1);
  expect(s.events.filter(e => e.type === 'eat')).toHaveLength(1);
  const before = s.velocity; s.step({ ...idle, grappleRelease: true }, null);
  expect(s.events.filter(e => e.type === 'eat')).toHaveLength(1);
  expect(s.velocity.y).toBeLessThan(before.y);
  s.dispose();
});

it('retains bounded sideways swing, then can reconnect without a second Space press', () => {
  const s = new Simulation(makeCourse('training')); s.attach('fly-0');
  s.body.setLinvel(vec(70, 0, 0), true); s.release('launch');
  expect(length(s.velocity)).toBeLessThanOrEqual(DASH_CONFIG.launchMaxSpeed + .0001);
  expect(s.velocity.x).toBeGreaterThan(1);
  expect(s.attach('fly-1')).toBe(true);
  s.step(idle, null); expect(s.attached).toBe('fly-1');
  s.dispose();
});

it('restores a strong dash without repeating its launch and accepts old weak dash saves', () => {
  const s = new Simulation(makeCourse('training')); s.attach('fly-0'); s.release('launch');
  const state = s.snapshot(), b = new Simulation(makeCourse('training')); b.restore(state);
  expect(state.dash?.anchor).toBe('fly-0');
  expect(b.dash).toEqual(s.dash); expect(b.velocity).toEqual(s.velocity);
  expect(b.events).toEqual([]);
  expect(validSave(state)).toBe(true);
  expect(validSave({ ...state, dash: { direction: vec(1, 0, 0), kind: 'launch', remaining: .31 } })).toBe(false);
  expect(validSave({ ...state, dash: { direction: vec(1, 0, 0), remaining: .1 } })).toBe(true);
  for (let t = 0; t < 120; t++) b.step(idle, null);
  expect(b.dash).toBeUndefined();
  s.dispose(); b.dispose();
});

it('chains crossing and arrival meals to land in each next ecosystem', () => {
  const course = makeCourse('main');
  for (let zone = 0; zone < course.biomes!.length - 1; zone++) {
    const s = new Simulation(makeCourse('main'));
    const biome = s.course.biomes![zone], next = s.course.biomes![zone + 1];
    const pad = s.course.platforms.find(p => p.id === `pad-${biome.end / 5 - 1}`)!;
    s.body.setTranslation(vec(pad.position.x, pad.position.y + pad.size.y / 2 + .4, pad.position.z), true);
    s.body.setLinvel(vec(), true);
    const crossing = s.anchorPosition(`food-crossing-${biome.id}`)!;
    expect(s.attach(`food-crossing-${biome.id}`), `${biome.id} entry d=${distance(s.position, crossing)} blocked=${s.blocked(s.position, crossing)}`).toBe(true);
    s.step({ ...idle, jump: true }, null);
    for(let t=0;t<230&&s.dash;t++)s.step(idle,null);
    const beat=course.route!.find(r=>r.platform===pad.id)!;
    expect(s.attach(beat.arrival!),`reconnect ${biome.id}`).toBe(true);
    s.step({...idle,jump:true},null);
    for(let t=0;t<230&&s.dash;t++)s.step(idle,null);
    const destination=course.platforms.find(p=>p.id===course.route![course.route!.indexOf(beat)+1].platform)!;
    let entered = false; const trace: unknown[] = [{ tick: 0, p: s.position, v: s.velocity }];
    for (let t = 0; t < 360; t++) {
      const p=s.position,v=s.velocity;
      s.step({...idle,x:clamp((destination.position.x-p.x)*.6-v.x*.45,-1,1),z:clamp((destination.position.z-p.z)*.6-v.z*.45,-1,1)}, null);
      if (t % 30 === 0) trace.push({ tick: t, p: s.position, v: s.velocity });
      entered ||= s.position.y >= next.start + .4 && Math.abs(s.position.x - next.center.x) < 9.5 && Math.abs(s.position.z - next.center.z) < 9.5;
    }
    if (!entered) console.log(JSON.stringify({ biome: biome.id, next: next.id, start: s.course.start, crossing, nextCenter: next.center, trace }));
    expect(s.grounded, `landing ${biome.id}`).toBe(true);
    expect(entered, `${biome.id} -> ${next.id}: ${JSON.stringify(s.position)}`).toBe(true);
    expect(s.events.some(e => e.type === 'reset')).toBe(false);
    s.dispose();
  }
});

it('reaches a horizontal meal without sinking under it, then resumes gravity after arrival',()=>{
  const s=new Simulation({id:'horizontal-dash',mode:'training',height:12,start:vec(0,10,0),
    platforms:[],anchors:[{id:'side',position:vec(6,10,0),zone:0,recovery:false}],
    summit:{id:'summit',position:vec(0,20,0),size:vec(3,.4,3),zone:0,kind:'star'}});
  expect(s.attach('side')).toBe(true);s.release('launch');
  const startY=s.position.y;let peakY=startY;
  for(let t=0;t<230&&s.dash;t++){s.step(idle,null);peakY=Math.max(peakY,s.position.y);}
  expect(distance(s.position,vec(6,10,0))).toBeLessThan(.2);
  expect(peakY).toBeGreaterThan(startY+.5);
  expect(s.velocity.x).toBeGreaterThan(2);
  expect(s.velocity.y).toBeLessThan(0);
  const before=s.velocity.y;s.step(idle,null);
  expect(s.velocity.y).toBeLessThan(before-.1);
  s.dispose();
});

it('keeps upper launch meals out of solid terrain throughout their motion', () => {
  const s = new Simulation(makeCourse('main')), probe = new RAPIER.Ball(.05);
  for (let t = 0; t < 600; t++) {
    s.step(idle, null);
    if (t % 12) continue;
    for (const a of s.course.anchors.filter(a => a.id.endsWith('-b') || a.transition)) {
      const hit = s.world.intersectionWithShape(s.anchorPosition(a.id)!, { x: 0, y: 0, z: 0, w: 1 }, probe,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, s.body);
      expect(hit === null, `${a.id} at ${s.time.toFixed(2)}s`).toBe(true);
    }
  }
  s.dispose();
});
