import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { makeLegacyCourse as makeCourse } from '../src/game/legacy-course';
import { Simulation } from '../src/game/simulation';
import { vec, type Controls } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };

it('catches missed landings under both protected beats at every refuge', () => {
  for (let i = 3; i <= 33; i += 6) for (const beat of [i + 1, i + 2]) {
    const course = makeCourse('main');
    const pad = course.platforms.find(p => p.id === `pad-${beat}`)!;
    const s = new Simulation(course);
    // Begin below the missed upper platform so only the natural landing below counts.
    s.body.setTranslation(vec(pad.position.x, i * 5 + 3, pad.position.z), true);
    s.body.setLinvel(vec(0, -18, 0), true);
    for (let t = 0; t < 180; t++) s.step(idle, null);
    expect(s.refuge?.id, `beat ${beat}`).toBe(`refuge-${i}`);
    expect(s.position.y).toBeCloseTo(i * 5 + .55, 1);
    expect(s.events.some(e => e.type === 'reset')).toBe(false);
    // A low fly remains visible below upper platforms after either missed beat.
    expect(s.attach(`fly-refuge-${i}`), `retry ${beat}`).toBe(true);
    s.dispose();
  }
});

it('keeps high-speed landings with moderate lateral drift inside the first refuge', () => {
  const s = new Simulation(makeCourse('main'));
  const pad = s.course.platforms.find(p => p.id === 'pad-5')!;
  s.body.setTranslation(vec(pad.position.x, 24, pad.position.z), true);
  s.body.setLinvel(vec(3, -24, 1), true);
  for (let t = 0; t < 240; t++) s.step(idle, null);
  expect(s.refuge?.id).toBe('refuge-3');
  s.dispose();
});

it('allows a fall beyond the refuge to lose the whole ascent without a checkpoint teleport', () => {
  for (let i = 3; i <= 33; i += 6) {
    const s = new Simulation(makeCourse('main'));
    const pad = i === 33 ? s.course.summit : s.course.platforms.find(p => p.id === `pad-${i + 3}`)!;
    const p = vec(pad.position.x * 1.8, (i + 3) * 5, pad.position.z * 1.8);
    s.body.setTranslation(p, true); s.body.setLinvel(vec(0, -12, 0), true);
    s.peak = p.y;
    for (let t = 0; t < 1000; t++) s.step(idle, null);
    expect(s.height).toBeLessThan(1);
    expect(s.peak).toBe(p.y);
    // Ground rocks may deflect the landing, but it must not respawn at the start.
    expect(Math.hypot(s.position.x, s.position.z - s.course.start.z)).toBeGreaterThan(6);
    expect(s.events.some(e => e.type === 'reset')).toBe(false);
    s.dispose();
  }
});

it('preserves a saved falling position and velocity with the new terrain', () => {
  const s = new Simulation(makeCourse('main'));
  const saved = { ...s.snapshot(), position: vec(5, 22, -4), velocity: vec(1, -8, 2), peak: 29 };
  s.restore(saved);
  expect(s.position).toEqual(saved.position);
  expect(s.velocity).toEqual(saved.velocity);
  expect(s.refuge).toBeUndefined();
  s.dispose();
});
