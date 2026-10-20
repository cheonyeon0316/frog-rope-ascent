import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation, DASH_CONFIG, DT, validSave } from '../src/game/simulation';
import { makeCourse } from '../src/game/course';
import { vec, distance, length, type Controls, type Course } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };
function fixture(): Course {
  const summit = { id: 'summit', position: vec(12, 20, 0), size: vec(3, .4, 3), kind: 'flower' as const, zone: 0 };
  return { id: 'dash-test', mode: 'training', start: vec(0, 3, 0), height: 20, summit, platforms: [summit],
    anchors: [{ id: 'a', position: vec(4, 7, -2), zone: 0, recovery: false }, { id: 'b', position: vec(4, 8, 0), zone: 0, recovery: false }] };
}

it('adds a small impulse toward the eaten fly while preserving all tangential velocity', () => {
  const s = new Simulation(fixture()); s.attach('a'); s.body.setLinvel(vec(-1, 2, 3), true);
  const before = s.velocity, p = s.position, a = s.anchor!.position, d = distance(p, a);
  const n = vec((a.x - p.x) / d, (a.y - p.y) / d, (a.z - p.z) / d);
  s.release(); const after = s.velocity;
  const dv = vec(after.x - before.x, after.y - before.y, after.z - before.z);
  expect(distance(dv, vec(n.x * DASH_CONFIG.boost, n.y * DASH_CONFIG.boost, n.z * DASH_CONFIG.boost))).toBeLessThan(.00001);
  expect(s.dash?.remaining).toBeCloseTo(DASH_CONFIG.duration);
  const speed = s.velocity; s.release(); expect(s.velocity).toEqual(speed);
  expect(s.events.filter(e => e.type === 'dash')).toHaveLength(1);
  s.dispose();
});

it('caps added energy without truncating an existing high-speed fall', () => {
  const c = fixture(); c.anchors[0].position = vec(0, 7, 0);
  const s = new Simulation(c); s.attach('a'); s.body.setLinvel(vec(0, 15, 0), true); s.release();
  expect(length(s.velocity)).toBeLessThanOrEqual(DASH_CONFIG.maxBoostedSpeed + .00001);
  const b = new Simulation(c); b.attach('a'); b.body.setLinvel(vec(20, 0, 0), true);
  const v = b.velocity; b.release(); expect(b.velocity).toEqual(v);
  const falling = new Simulation(c); falling.attach('a'); falling.body.setLinvel(vec(0, -20, 0), true); falling.release();
  expect(falling.velocity.y).toBeCloseTo(-20 + DASH_CONFIG.boost);
  s.dispose(); b.dispose(); falling.dispose();
});

it('does not dash on blocked detach, reset or restore', () => {
  const s = new Simulation(fixture()); s.attach('a'); s.body.setLinvel(vec(2, -4, 1), true);
  const before = s.velocity; s.release('blocked'); expect(s.velocity).toEqual(before); expect(s.dash).toBeUndefined();
  s.attach('a'); s.resetPosition(); expect(s.dash).toBeUndefined(); expect(s.velocity).toEqual(vec());
  s.attach('a'); const snapshot = s.snapshot(); s.restore(snapshot); expect(s.dash).toBeUndefined();
  expect(s.events.some(e => e.type === 'dash')).toBe(false); s.dispose();
});

it('keeps the dash coast and velocity across a save without applying the boost twice', () => {
  const s = new Simulation(fixture()); s.attach('a'); s.release();
  for (let i = 0; i < 6; i++) s.step(idle, null);
  const saved = s.snapshot(), b = new Simulation(fixture()); b.restore(saved);
  expect(b.velocity).toEqual(s.velocity); expect(b.dash).toEqual(s.dash);
  for (let i = 0; i < 20; i++) b.step(idle, null);
  expect(b.dash).toBeUndefined(); expect(b.events.some(e => e.type === 'dash')).toBe(false);
  expect(validSave({ ...saved, dash: { remaining: 1, direction: vec(1, 0, 0) } })).toBe(false);
  expect(validSave({ ...saved, dash: { remaining: .1, direction: vec(2, 0, 0) } })).toBe(false);
  s.dispose(); b.dispose();
});

it('turns a dash-rehook into a bounded pendulum that swings back', () => {
  const c = fixture(); c.anchors[0].position = vec(0, 7, 0);
  const s = new Simulation(c); s.attach('a'); s.body.setLinvel(vec(6, 2, 0), true); s.release();
  expect(s.attach('b')).toBe(true);
  let maxError = 0, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 480; i++) {
    s.step(idle, null);
    maxError = Math.max(maxError, distance(s.position, s.anchor!.position) - s.ropeLength);
    minX = Math.min(minX, s.velocity.x); maxX = Math.max(maxX, s.velocity.x);
  }
  expect(maxError).toBeLessThan(.1); expect(maxX).toBeGreaterThan(1); expect(minX).toBeLessThan(-.5);
  s.dispose();
});

it('keeps each new early relay visible and within range from the preceding landing', () => {
  const s = new Simulation(makeCourse('main'));
  let previous = s.course.start;
  for (let i = 1; i <= 3; i++) {
    s.body.setTranslation(previous, true); s.body.setLinvel(vec(), true);
    expect(s.attach(`fly-${i}-relay`)).toBe(true); s.release('blocked');
    const platform = s.course.platforms.find(p => p.id === `pad-${i}`)!;
    previous = vec(platform.position.x, platform.position.y + .55, platform.position.z);
  }
  const training = new Simulation(makeCourse('training'));
  const a = training.course.anchors[2].position, b = training.course.anchors[3].position;
  expect(distance(a, b)).toBeLessThan(10); expect(training.blocked(a, b)).toBe(false);
  s.dispose(); training.dispose();
});

it('starts an eat-dash from the ground without the walking brake cancelling it', () => {
  const s = new Simulation(makeCourse('training'));
  for (let i = 0; i < 100; i++) s.step(idle, null);
  s.step({ ...idle, grapplePress: true }, 'fly-0');
  const start = s.position; s.step({ ...idle, grappleRelease: true }, null);
  expect(s.velocity.y).toBeGreaterThan(3); expect(s.dash).toBeDefined();
  for (let i = 0; i < Math.round(.15 / DT); i++) s.step(idle, null);
  expect(s.position.y).toBeGreaterThan(start.y + .2);
  s.dispose();
});

it('prioritizes a Space launch over a simultaneous manual release on the ground', () => {
  const s = new Simulation(makeCourse('training'));
  for (let i = 0; i < 100; i++) s.step(idle, null);
  s.step({ ...idle, grapplePress: true }, 'fly-0');
  s.step({ ...idle, grappleRelease: true, jump: true }, null);
  expect(s.velocity.y).toBeGreaterThan(7);
  expect(s.dash?.kind).toBe('launch'); s.dispose();
});
