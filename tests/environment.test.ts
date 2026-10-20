import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation, DT, DASH_CONFIG } from '../src/game/simulation';
import { movingAnchorPosition, WATER_CONFIG } from '../src/game/environment';
import { makeLegacyCourse as makeCourse } from '../src/game/legacy-course';
import { vec, distance, type Course, type Controls } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };
function fixture(): Course {
  const summit = { id: 'summit', position: vec(15, 20, 0), size: vec(3, .4, 3), kind: 'flower' as const, zone: 0 };
  return { id: 'environment', mode: 'training', height: 20, start: vec(0, 4, 0), platforms: [summit], summit,
    anchors: [{ id: 'moving', position: vec(0, 8, 0), motion: { amplitude: vec(.75, .2, .45), period: 4, phase: 0 }, recovery: false, zone: 0 }],
    waters: [{ id: 'water', position: vec(0, 4, 0), radius: 3 }] };
}

it('moves freely but freezes its native grapple point exactly when caught', () => {
  const c = fixture(); c.waters = [];
  const s = new Simulation(c); const original = s.anchorPosition('moving')!;
  for (let i = 0; i < 30; i++) s.step(idle, null);
  const caught = s.anchorPosition('moving')!;
  expect(distance(caught, movingAnchorPosition(c.anchors[0], s.time))).toBeLessThan(.00001);
  expect(distance(original, caught)).toBeGreaterThan(.2); expect(s.attach('moving')).toBe(true);
  let maxError = 0;
  for (let i = 0; i < 120; i++) {
    s.step(idle, null); maxError = Math.max(maxError, distance(s.position, s.anchor!.position) - s.ropeLength);
  }
  expect(s.anchor!.position).toEqual(caught); expect(maxError).toBeLessThan(.1);
  s.dispose();
});

it('freezes on the input catch tick and resumes continuously after eating and respawning', () => {
  const c = fixture(); c.waters = []; const s = new Simulation(c);
  for (let i = 0; i < 20; i++) s.step(idle, null);
  const caught = s.anchorPosition('moving')!;
  s.step({ ...idle, grapplePress: true }, 'moving');
  expect(s.anchorPosition('moving')).toEqual(caught);
  s.step({ ...idle, grappleRelease: true }, null);
  for (let i = 0; i < 350; i++) s.step(idle, null);
  expect(s.anchorPosition('moving')).toEqual(caught);
  for (let i = 0; i < 20; i++) s.step(idle, null);
  expect(distance(caught, s.anchorPosition('moving')!)).toBeLessThan(.2);
  expect(distance(caught, s.anchorPosition('moving')!)).toBeGreaterThan(.01);
  s.dispose();
});

it('aims and eat-dashes toward the current moving point rather than its original position', () => {
  const s = new Simulation(fixture());
  for (let i = 0; i < 120; i++) s.step(idle, null);
  const a = s.anchorPosition('moving')!, camera = vec(0, 5, 8), d = distance(camera, a);
  expect(s.selectTarget(camera, vec((a.x - camera.x) / d, (a.y - camera.y) / d, (a.z - camera.z) / d))?.id).toBe('moving');
  expect(s.attach('moving')).toBe(true); s.body.setLinvel(vec(), true);
  const p = s.position, r = distance(p, a); s.release();
  expect(distance(s.velocity, vec((a.x - p.x) / r * DASH_CONFIG.boost, (a.y - p.y) / r * DASH_CONFIG.boost, (a.z - p.z) / r * DASH_CONFIG.boost))).toBeLessThan(.00001);
  s.dispose();
});

it('restores moving-anchor phase, rope and avatar velocity at the saved active time', () => {
  const c = fixture(); c.waters = []; const a = new Simulation(c); a.attach('moving');
  for (let i = 0; i < 150; i++) a.step(idle, null);
  const saved = a.snapshot(), b = new Simulation(c); b.restore(saved);
  expect(distance(b.anchor!.position, a.anchor!.position)).toBeLessThan(.00001); expect(b.velocity).toEqual(a.velocity);
  a.step(idle, null); b.step(idle, null);
  expect(distance(b.anchor!.position, a.anchor!.position)).toBeLessThan(.00001);
  expect(distance(b.position, a.position)).toBeLessThan(.08);
  a.dispose(); b.dispose();
});

it('can swim upward and sideways inside water, and dive when asked', () => {
  const s = new Simulation(fixture()), start = s.position;
  for (let i = 0; i < 60; i++) s.step({ ...idle, swim: 1, x: 1 }, null);
  expect(s.water?.volume.id).toBe('water'); expect(s.position.y).toBeGreaterThan(start.y + 1);
  expect(s.position.x).toBeGreaterThan(start.x + .6); expect(s.velocity.y).toBeGreaterThan(3);
  const down = new Simulation(fixture());
  for (let i = 0; i < 60; i++) down.step({ ...idle, swim: -1 }, null);
  expect(down.position.y).toBeLessThan(start.y - .9); expect(down.velocity.y).toBeLessThan(-2);
  s.dispose(); down.dispose();
});

it('returns to normal gravity outside water and does not turn swim input into an air jump', () => {
  const c = fixture(); c.waters = []; const s = new Simulation(c), start = s.position;
  for (let i = 0; i < 60; i++) s.step({ ...idle, swim: 1 }, null);
  expect(s.water).toBeNull(); expect(s.velocity.y).toBeLessThan(-8); expect(s.position.y).toBeLessThan(start.y - 2);
  s.dispose();
});

it('restores swimming state and motion without changing the saved location', () => {
  const s = new Simulation(fixture()); for (let i = 0; i < 40; i++) s.step({ ...idle, swim: 1 }, null);
  const saved = s.snapshot(), b = new Simulation(fixture()); b.restore(saved);
  expect(b.water?.volume.id).toBe('water'); expect(b.position).toEqual(s.position); expect(b.velocity).toEqual(s.velocity);
  s.step({ ...idle, swim: 1 }, null); b.step({ ...idle, swim: 1 }, null);
  expect(distance(b.position, s.position)).toBeLessThan(.001);
  s.dispose(); b.dispose();
});

it('bounces on marked leaves only after a landing', () => {
  const c = fixture(); c.waters = []; c.start = vec(0, 2, 0);
  c.platforms.push({ id: 'spring', position: vec(0, 0, 0), size: vec(4, .3, 4), kind: 'leaf', zone: 0, bounce: 8 });
  const s = new Simulation(c);
  for (let i = 0; i < 120 && !s.events.some(e => e.type === 'bounce'); i++) s.step(idle, null);
  expect(s.events.filter(e => e.type === 'bounce')).toHaveLength(1); expect(s.velocity.y).toBeGreaterThan(7);
  s.step(idle, null); expect(s.events.filter(e => e.type === 'bounce')).toHaveLength(1);
  s.dispose();
});

it('places moving flies early, a spring at 20m and two swim routes in the early middle', () => {
  const c = makeCourse('main'); const moving = c.anchors.filter(a => a.motion);
  expect(moving).toHaveLength(4); expect(moving.every(a => a.position.y >= 7 && a.position.y < 25)).toBe(true);
  expect(c.platforms.find(p => p.bounce)?.position.y).toBe(20);
  expect(c.waters).toHaveLength(2); expect(c.waters!.every(w => w.position.y >= 30 && w.position.y < 55)).toBe(true);
  for (const w of c.waters!) expect(c.anchors.some(a => a.id === `fly-${w.id}-exit` && a.position.y > w.position.y + w.radius)).toBe(true);
});

it('can enter each actual course bubble, swim high and hook its exit fly', () => {
  for (const volume of makeCourse('main').waters!) {
    const c = makeCourse('main'); const padId = volume.id === 'water-6' ? 'pad-6' : 'pad-9';
    const pad = c.platforms.find(p => p.id === padId)!;
    c.start = vec(pad.position.x, pad.position.y + .55, pad.position.z);
    const s = new Simulation(c);
    for (let i = 0; i < 360 && s.position.y < volume.position.y + volume.radius - .6; i++) s.step({ ...idle, jump: i === 0, swim: 1 }, null);
    expect(s.position.y, volume.id).toBeGreaterThan(volume.position.y + volume.radius - .8);
    expect(s.attach(`fly-${volume.id}-exit`)).toBe(true);
    s.step({ ...idle, grappleRelease: true, swim: 1 }, null);
    for (let i = 0; i < Math.round(.4 / DT); i++) s.step({ ...idle, swim: 1 }, null);
    expect(s.position.y).toBeGreaterThan(volume.position.y + volume.radius);
    s.dispose();
  }
});
