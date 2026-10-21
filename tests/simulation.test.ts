import { beforeAll, describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation, DT, validSave, FLY_TIMING } from '../src/game/simulation';
import { makeCourse } from '../src/game/course';
import { vec, distance, type Course, type Controls } from '../src/game/types';
import { formatTime } from '../src/ui/interface';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };
function fixture(): Course {
  const ground = { id: 'ground', position: vec(0, -1, 0), size: vec(30, 1, 30), zone: 0, kind: 'ground' as const };
  const summit = { id: 'summit', position: vec(9, 15, 0), size: vec(3, .4, 3), zone: 0, kind: 'flower' as const };
  return { id: 'test', mode: 'training', height: 15, start: vec(0, 3, 0), platforms: [ground, summit],
    anchors: [{ id: 'a', position: vec(0, 7, 0), zone: 0, recovery: false }, { id: 'b', position: vec(4, 8, 0), zone: 0, recovery: false }], summit };
}

describe('actual Rapier rope physics', () => {
  it('preserves upward and downward velocity when terrain cuts the rope', () => {
    for (const y of [6, -6]) {
      const s = new Simulation(fixture());
      expect(s.attach('a')).toBe(true);
      s.body.setLinvel(vec(3, y, -2), true);
      const v = s.velocity; s.release('blocked'); expect(s.velocity).toEqual(v);
      s.dispose();
    }
  });
  it('allows slack instead of forcing a fixed-distance circle', () => {
    const s = new Simulation(fixture()); s.attach('a');
    s.body.setTranslation(vec(0, 5, 0), true); s.body.setLinvel(vec(), true);
    s.step(idle, null);
    expect(s.position.y).toBeGreaterThan(4.99);
    expect(distance(s.position, s.anchor!.position)).toBeLessThan(2.1);
    s.dispose();
  });
  it('does not hoist a stationary frog just by attaching', () => {
    const s = new Simulation(fixture()); s.attach('a'); const y = s.position.y;
    for (let i = 0; i < 120; i++) s.step(idle, null);
    expect(s.position.y).toBeLessThanOrEqual(y + .05); s.dispose();
  });
  it('builds a swing from rest and keeps the rope length bounded', () => {
    const s = new Simulation(fixture()); s.attach('a');
    let maxError = 0, top = s.position.y;
    for (let i = 0; i < 600; i++) {
      const direction = s.velocity.x < -.02 ? -1 : 1;
      s.step({ ...idle, x: direction }, null);
      top = Math.max(top, s.position.y);
      maxError = Math.max(maxError, distance(s.position, s.anchor!.position) - s.ropeLength);
    }
    expect(top).toBeGreaterThan(4);
    expect(maxError).toBeLessThan(.10); s.dispose();
  });
  it('rejects out-of-range and blocked flies without teleporting', () => {
    const course = fixture(); course.anchors[1].position = vec(30, 20, 0);
    course.platforms.push({ id: 'wall', position: vec(0, 5, 0), size: vec(3, .4, 3), kind: 'wood', zone: 0 });
    const s = new Simulation(course); const before = s.position;
    expect(s.attach('a')).toBe(false); expect(s.attach('b')).toBe(false);
    expect(s.position).toEqual(before); s.dispose();
  });
  it('selects the same visible target that its aim ray indicates', () => {
    const s = new Simulation(fixture());
    const camera = vec(0, 4, 8), a = s.course.anchors[0].position;
    const d = distance(camera, a), direction = vec((a.x - camera.x) / d, (a.y - camera.y) / d, (a.z - camera.z) / d);
    expect(s.selectTarget(camera, direction)?.id).toBe('a'); s.dispose();
  });
  it('detects body contact with visible food without consuming or blocking tongue access', () => {
    const course = fixture(); course.anchors[0].food = 'fly';
    const s = new Simulation(course);
    s.body.setTranslation(vec(0, 7, 0), true); s.body.setLinvel(vec(), true);
    s.step(idle, null);
    expect(s.flyLife('a').phase).toBe('alive');
    expect(s.events.some(event => event.type === 'touch' && event.anchor === 'a' && event.reason === 'body-contact')).toBe(true);
    s.body.setTranslation(vec(0, 3, 0), true); s.body.setLinvel(vec(), true);
    expect(s.attach('a')).toBe(true);
    s.dispose();
  });
  it('produces matching results under 30, 60 and 120 FPS render schedules', () => {
    function run(fps: number) {
      const s = new Simulation(fixture()); s.attach('a'); let acc = 0;
      for (let f = 0; f < fps * 8; f++) {
        acc += 1 / fps;
        while (acc + 1e-9 >= DT) { s.step({ ...idle, x: s.tick < 250 ? 1 : -1 }, null); acc -= DT; }
      }
      const result = { p: s.position, v: s.velocity, ticks: s.tick }; s.dispose(); return result;
    }
    const a = run(30), b = run(60), c = run(120);
    expect(a.ticks).toBe(c.ticks); expect(distance(a.p, b.p)).toBeLessThan(.25); expect(distance(a.v, c.v)).toBeLessThan(.25);
  });
});

describe('eating and fly regeneration', () => {
  it('pulls in a manually released fly, disables it and allows another connection immediately', () => {
    const s = new Simulation(fixture());
    expect(s.attach('a')).toBe(true);
    s.release();
    expect(s.attached).toBeNull();
    expect(s.flyLife('a').phase).toBe('retracting');
    expect(s.events.filter(e => e.type === 'eat').map(e => e.anchor)).toEqual(['a']);
    expect(s.attach('a')).toBe(false);
    const camera = vec(0, 4, 8), a = s.course.anchors[0].position, d = distance(camera, a);
    expect(s.selectTarget(camera, vec((a.x - camera.x) / d, (a.y - camera.y) / d, (a.z - camera.z) / d))).toBeNull();
    expect(s.attach('b')).toBe(true);
    s.dispose();
  });
  it('hides after retraction, appears near three seconds and becomes catchable again', () => {
    const s = new Simulation(fixture()); s.attach('a'); s.release();
    while (s.time < FLY_TIMING.retract + .01) s.step(idle, null);
    expect(s.flyLife('a').phase).toBe('hidden');
    while (s.time < FLY_TIMING.respawn - FLY_TIMING.appear + .01) s.step(idle, null);
    expect(s.flyLife('a').phase).toBe('respawning'); expect(s.attach('a')).toBe(false);
    while (s.time < FLY_TIMING.respawn + DT) s.step(idle, null);
    expect(s.flyLife('a').phase).toBe('alive'); expect(s.attach('a')).toBe(true);
    s.dispose();
  });
  it('keeps flies alive when terrain cuts the rope, resetting or restoring', () => {
    const s = new Simulation(fixture()); s.attach('a'); s.release('blocked');
    expect(s.flyLife('a').phase).toBe('alive');
    s.attach('a'); s.resetPosition(); expect(s.flyLife('a').phase).toBe('alive');
    s.attach('a'); const state = s.snapshot(); s.restore(state);
    expect(s.flyLife('a').phase).toBe('alive'); expect(s.attached).toBe('a');
    expect(s.events.some(e => e.type === 'eat')).toBe(false);
    s.dispose();
  });
  it('saves remaining cooldown, restores it and supports saves made before the feature', () => {
    const s = new Simulation(fixture()); s.attach('a'); s.release();
    for (let i = 0; i < 100; i++) s.step(idle, null);
    const state = s.snapshot(), b = new Simulation(fixture());
    b.restore(state); expect(b.flyLife('a')).toEqual(s.flyLife('a')); expect(b.attach('a')).toBe(false);
    for (let i = 0; i < 270; i++) b.step(idle, null);
    expect(b.flyLife('a').phase).toBe('alive');
    const old = { ...state }; delete old.eatenFlies; b.restore(old);
    expect(b.flyLife('a').phase).toBe('alive');
    s.dispose(); b.dispose();
  });
  it('rejects duplicate, invalid or currently attached consumed flies in saves', () => {
    const s = new Simulation(fixture()), state = s.snapshot();
    expect(validSave({ ...state, eatenFlies: [{ id: 'a', remaining: 2 }] })).toBe(true);
    expect(validSave({ ...state, eatenFlies: [{ id: 'a', remaining: 4 }] })).toBe(false);
    expect(validSave({ ...state, eatenFlies: [{ id: 'a', remaining: 0 }] })).toBe(false);
    expect(validSave({ ...state, eatenFlies: [{ id: 'a', remaining: 2 }, { id: 'a', remaining: 1 }] })).toBe(false);
    expect(validSave({ ...state, attached: 'a', length: 4, eatenFlies: [{ id: 'a', remaining: 2 }] })).toBe(false);
    expect(() => s.restore({ ...state, eatenFlies: [{ id: 'missing', remaining: 2 }] })).toThrow();
    s.dispose();
  });
});

describe('course and progress contracts', () => {
  it('offers a real 180m course and a separate 12m training course', () => {
    const main = makeCourse('main'), training = makeCourse('training');
    expect(main.height).toBe(180); expect(training.height).toBe(12);
    expect(new Set(main.anchors.map(a => a.id)).size).toBe(main.anchors.length);
    expect(main.anchors.some(a => a.recovery)).toBe(true);
    expect(main.platforms.some(p => p.recovery)).toBe(true);
  });
  it('keeps the first practice fly and every safe-route entry clear of the next platform', () => {
    const practice = new Simulation(makeCourse('training'));
    expect(practice.attach('fly-0')).toBe(true); practice.dispose();
    const main = new Simulation(makeCourse('main'));
    let previous = main.course.start;
    for (let i = 1; i <= 36; i++) {
      main.body.setTranslation(previous, true);
      const food = i === 1 ? 'fly-1-a' : main.course.route![i-2].launch;
      expect(main.attach(food), `safe route ${i}`).toBe(true); main.release();
      const platform = i === 36 ? main.course.summit : main.course.platforms.find(p => p.id === `pad-${i}`)!;
      previous = vec(platform.position.x, platform.position.y + platform.size.y / 2 + .4, platform.position.z);
    }
    main.dispose();
  });
  it('restores a fall at its actual velocity rather than its peak height', () => {
    const s = new Simulation(fixture());
    const save = { ...s.snapshot(), position: vec(2, 5, 0), velocity: vec(1, -8, 2), peak: 14, time: 76 };
    s.restore(save); expect(s.position).toEqual(save.position); expect(s.velocity).toEqual(save.velocity); expect(s.peak).toBe(14);
    expect(s.height).toBeLessThan(s.peak); s.dispose();
  });
  it('restores the same attached anchor and maximum length', () => {
    const a = new Simulation(fixture()); a.attach('a'); const save = a.snapshot();
    const b = new Simulation(fixture()); b.restore(save);
    expect(b.attached).toBe('a'); expect(b.ropeLength).toBe(save.length); a.dispose(); b.dispose();
  });
  it('returns out-of-bounds falls to ground without erasing peak or time', () => {
    const s = new Simulation(fixture()); s.peak = 14; s.time = 30;
    s.body.setTranslation(vec(40, 4, 0), true); s.step(idle, null);
    expect(distance(s.position, s.course.start)).toBeLessThan(.01); expect(s.peak).toBe(14); expect(s.time).toBeGreaterThan(30); s.dispose();
  });
  it('requires a stable summit landing, not an airborne pass', () => {
    const s = new Simulation(fixture());
    s.body.setTranslation(vec(9, 16, 0), true); s.body.setLinvel(vec(0, 3, 0), true);
    s.step(idle, null); expect(s.finished).toBe(false);
    s.body.setTranslation(vec(9, 15.61, 0), true); s.body.setLinvel(vec(), true);
    for (let i = 0; i < 90; i++) s.step(idle, null);
    expect(s.finished).toBe(true); s.dispose();
  });
  it('rejects malformed and impossible save states', () => {
    const s = new Simulation(fixture()), save = s.snapshot();
    expect(validSave(save)).toBe(true);
    expect(validSave({ ...save, velocity: vec(NaN, 0, 0) })).toBe(false);
    expect(validSave({ ...save, attached: 'a', length: 20 })).toBe(false);
    expect(validSave({ ...save, attached: null, length: 4 })).toBe(false);
    expect(validSave({ ...save, position: vec(0, 300, 0) })).toBe(false);
    s.dispose();
  });
  it('formats active play time without rounding a partial minute up', () => {
    expect(formatTime(59.99)).toBe('00:59'); expect(formatTime(125)).toBe('02:05');
  });
});
