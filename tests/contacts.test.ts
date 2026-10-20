import { beforeAll, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from '../src/game/simulation';
import { vec, type Course, type Controls } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };
function edgePocket(): Course {
  const summit = { id: 'summit', position: vec(8, 15, 0), size: vec(2, .3, 2), kind: 'flower' as const, zone: 0 };
  return { id: 'edge-pocket', mode: 'training', height: 15, start: vec(1.15, .52, 0), anchors: [], summit,
    platforms: [
      { id: 'ledge', position: vec(0, 0, 0), size: vec(2, .3, 2), kind: 'leaf', zone: 0 },
      { id: 'wall', position: vec(1.7, .6, 0), size: vec(.5, 2, 2), kind: 'wood', zone: 0 },
      summit,
    ] };
}

it('recognizes foot support beside a ledge even when the center ray misses', () => {
  const s = new Simulation(edgePocket());
  for (let i = 0; i < 120; i++) s.step(idle, null);
  const before = s.position;
  expect(s.grounded).toBe(true);
  s.step({ ...idle, jump: true, x: -1 }, null);
  expect(s.velocity.y).toBeGreaterThan(3);
  for (let i = 0; i < 45; i++) s.step({ ...idle, x: -1 }, null);
  expect(s.position.x).toBeLessThan(before.x - .2);
  s.dispose();
});

it('can move back onto the ledge from a resting edge pocket without jumping', () => {
  const s = new Simulation(edgePocket());
  for (let i = 0; i < 120; i++) s.step(idle, null);
  for (let i = 0; i < 60; i++) s.step({ ...idle, x: -1 }, null);
  expect(s.position.x).toBeLessThan(.8);
  s.dispose();
});

it('also permits jumping when only the rounded foot touches a platform corner', () => {
  const course = edgePocket(); course.start = vec(1.15, .48, 1.15);
  course.platforms[1].size.z = 4;
  course.platforms.push({ id: 'second-wall', position: vec(0, .6, 1.7), size: vec(4, 2, .5), kind: 'wood', zone: 0 });
  const s = new Simulation(course);
  for (let i = 0; i < 120; i++) s.step(idle, null);
  expect(s.grounded).toBe(true);
  const y = s.position.y;
  s.step({ ...idle, jump: true }, null);
  for (let i = 0; i < 18; i++) s.step(idle, null);
  expect(s.position.y).toBeGreaterThan(y + .35);
  s.dispose();
});

it('does not treat a vertical wall or open air as jump support', () => {
  const course = edgePocket(); course.start = vec(1.14, 4, 0);
  course.platforms = course.platforms.filter(p => p.id !== 'ledge');
  course.platforms[0].position.y = 3; course.platforms[0].size.y = 10;
  const s = new Simulation(course);
  for (let i = 0; i < 30; i++) s.step({ ...idle, x: 1, jump: true }, null);
  expect(s.grounded).toBe(false); expect(s.velocity.y).toBeLessThan(-2);
  s.dispose();
});
