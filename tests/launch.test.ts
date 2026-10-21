import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { Simulation, DT, validSave } from '../src/game/simulation';
import { makeCourse } from '../src/game/course';
import { SWING_CONFIG } from '../src/game/swing';
import { vec, length, type Controls, type Course } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };
function fixture(): Course {
  const summit = { id: 'summit', position: vec(12, 20, 0), size: vec(3, .4, 3), kind: 'flower' as const, zone: 0 };
  return { id: 'swing-test', mode: 'training', start: vec(0, 3, 0), height: 20, summit, platforms: [summit],
    anchors: [{ id: 'a', position: vec(0, 7, 0), zone: 0, recovery: false }, { id: 'b', position: vec(4, 8, 0), zone: 0, recovery: false }] };
}

it('keeps a higher ground jump and does not add a second air jump', () => {
  const s = new Simulation(makeCourse('training'));
  for (let t = 0; t < 60; t++) s.step(idle, null);
  const start = s.position.y;
  s.step({ ...idle, jump: true }, null);
  let peak = s.position.y;
  for (let t = 0; t < 60; t++) { s.step(idle, null); peak = Math.max(peak, s.position.y); }
  expect(peak - start).toBeGreaterThan(1.45);
  expect(peak - start).toBeLessThan(1.6);
  const vy = s.velocity.y; s.step({ ...idle, jump: true }, null);
  expect(s.velocity.y).toBeLessThan(vy); s.dispose();
});

it('Space eats the caught food and adds one tangent impulse, then ordinary gravity continues', () => {
  const s = new Simulation(fixture());
  expect(s.attach('a')).toBe(true);
  s.body.setLinvel(vec(8, 0, 0), true);
  s.step({ ...idle, jump: true, cameraForward: vec(0, 0, -1) }, null);
  expect(s.attached).toBeNull();
  expect(s.flyLife('a').phase).toBe('retracting');
  expect(s.events.filter(e => e.type === 'eat')).toHaveLength(1);
  const swing = s.events.find(e => e.type === 'swing' && e.reason === 'eat-swing');
  expect(swing).toBeDefined(); expect(swing!.speed).toBeGreaterThan(0);
  expect(swing!.direction!.x).toBeGreaterThan(.9);
  expect(s.velocity.x).toBeGreaterThan(8 + (swing!.speed ?? 0) - .2);
  const origin = s.position;
  for (let t = 0; t < Math.round(.25 / DT); t++) s.step(idle, null);
  expect(s.position.x).toBeGreaterThan(origin.x + .4);
  expect(s.velocity.y).toBeLessThan(0);
  expect(s.events.filter(e => e.type === 'eat')).toHaveLength(1);
  expect(s.impulse).toBeDefined();
  for (let t = 0; t < Math.round(.2 / DT); t++) s.step(idle, null);
  expect(s.impulse).toBeUndefined();
  expect(length(s.velocity)).toBeGreaterThan(0);
  s.dispose();
});

it('restores swing feedback without replaying a scripted path and accepts old dash saves', () => {
  const s = new Simulation(fixture()); s.attach('a'); s.body.setLinvel(vec(7, 0, 0), true);
  s.step({ ...idle, jump: true }, null);
  const saved = s.snapshot(), b = new Simulation(fixture()); b.restore(saved);
  expect(b.position).toEqual(s.position); expect(b.velocity).toEqual(s.velocity);
  expect(b.impulse).toEqual(s.impulse); expect(b.events).toEqual([]);
  for (let t = 0; t < Math.round(.5 / DT); t++) b.step(idle, null);
  expect(b.impulse).toBeUndefined();
  const legacy = { ...saved, swing: undefined, dash: { kind: 'launch' as const, remaining: .25, duration: .3,
    distance: 4, travelled: 1, direction: vec(1, 0, 0), anchor: 'a', origin: vec(), targetPosition: vec(4, 0, 0) } };
  expect(validSave(legacy)).toBe(true);
  const oldWorld = new Simulation(fixture()); oldWorld.restore(legacy);
  expect(oldWorld.velocity).toEqual(legacy.velocity); expect(oldWorld.position).toEqual(legacy.position);
  expect(oldWorld.impulse?.kind).toBe('eat-swing');
  expect(validSave({ ...legacy, dash: { ...legacy.dash, remaining: 2 } })).toBe(false);
  s.dispose(); b.dispose(); oldWorld.dispose();
});

it('keeps manual tongue release distinct from the deliberate eat swing', () => {
  const s = new Simulation(fixture()); s.attach('a'); s.body.setLinvel(vec(3, 0, 0), true);
  s.release();
  expect(s.events.some(e => e.type === 'eat')).toBe(true);
  expect(s.events.some(e => e.type === 'swing' && e.reason === 'release')).toBe(true);
  expect(s.events.some(e => e.type === 'swing' && e.reason === 'eat-swing')).toBe(false);
  expect(s.impulse?.kind).toBe('release'); s.dispose();
});

it('keeps route landings roomy and each food beat local to the adjoining recovery surfaces', () => {
  const c = makeCourse('main');
  expect(c.route!.length).toBe(36);
  const surface = (id: string) => c.platforms.find(p => p.id === id)!;
  const anchor = (id: string) => c.anchors.find(a => a.id === id)!;
  const top = (id: string) => { const p = surface(id); return p.position.y + p.size.y / 2; };
  for (let i = 0; i < c.route!.length - 1; i++) {
    const beat = c.route![i], next = c.route![i + 1];
    const landing = surface(beat.platform), destination = surface(next.platform);
    expect(landing.size.x, beat.name).toBeGreaterThanOrEqual(4.4);
    expect(landing.size.z, beat.name).toBeGreaterThanOrEqual(4.4);
    const launch = anchor(beat.launch), arrival = anchor(beat.arrival!);
    const from = vec(landing.position.x, top(beat.platform) + .4, landing.position.z);
    const to = vec(destination.position.x, top(next.platform) + .4, destination.position.z);
    expect(length(vec(launch.position.x - from.x, launch.position.y - from.y, launch.position.z - from.z)), beat.name).toBeLessThan(6.5);
    expect(length(vec(arrival.position.x - to.x, arrival.position.y - to.y, arrival.position.z - to.z)), beat.name).toBeLessThan(3);
    expect(launch.food, beat.name).toBeDefined(); expect(arrival.food, beat.name).toBeDefined();
  }
  for (let zone = 1; zone < c.biomes!.length; zone++) {
    const refuge = c.platforms.find(p => p.refuge === c.biomes![zone].name);
    expect(refuge, c.biomes![zone].id).toBeDefined();
    expect(refuge!.recovery).toBe(true);
  }
});
