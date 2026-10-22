import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, expect, it } from 'vitest';
import { makeCourse, courseForSave } from '../src/game/course';
import { makeLegacyCourse } from '../src/game/legacy-course';
import { Simulation, FLY_TIMING } from '../src/game/simulation';
import { parseBackup } from '../src/game/backup';
import { DEFAULT_SETTINGS } from '../src/game/storage';
import { vec, type Controls } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });
const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };

it('catches local failed landings in each ecosystem instead of resetting to the pond', () => {
  for (const biome of makeCourse('main').biomes!.slice(1)) {
    const s = new Simulation(makeCourse('main'));
    s.body.setTranslation(vec(biome.center.x, biome.start + 4, biome.center.z), true);
    s.body.setLinvel(vec(1, -22, .5), true);
    for (let t = 0; t < 240; t++) s.step(idle, null);
    expect(s.refuge?.refuge, biome.id).toBe(biome.name);
    expect(s.position.y).toBeGreaterThan(biome.start);
    expect(s.position.y).toBeLessThan(biome.start + 2);
    expect(s.events.some(e => e.type === 'reset')).toBe(false);
    expect(s.attach(`food-basin-${biome.id}`), `retry ${biome.id}`).toBe(true);
    s.dispose();
  }
});

it('lets transition failures lose the new ecosystem and land in an earlier one', () => {
  const biomes = makeCourse('main').biomes!;
  for (let zone = 2; zone < biomes.length; zone++) {
    const s = new Simulation(makeCourse('main')), previous = biomes[zone - 1], current = biomes[zone];
    // Choose an open shaft into the earlier basin, avoiding an intervening branch edge.
    let column: { x: number; y: number; z: number } | undefined;
    for (const x of [0,-2,2,-4,4,-6,6]) for (const z of [0,-2,2,-4,4,-6,6]) {
      const p = vec(previous.center.x + x, current.start + 8, previous.center.z + z);
      const clear = [vec(), vec(.45, 0, 0), vec(-.45, 0, 0), vec(0, 0, .45), vec(0, 0, -.45)].every(o => {
        const hit = s.world.castRay(new RAPIER.Ray(vec(p.x + o.x, p.y, p.z + o.z), vec(0, -1, 0)), 500, true, undefined, undefined, s.collider, s.body);
        const height = hit ? p.y - hit.timeOfImpact : -10;
        return height > previous.start && height < current.start - 2;
      });
      if (clear && !column) column = p;
    }
    expect(column, `open transition shaft ${current.id}`).toBeDefined();
    s.body.setTranslation(column!, true);
    s.body.setLinvel(vec(0, -15, 0), true); s.peak = current.start + 8;
    for (let t = 0; t < 1200 && s.position.y >= current.start - 1 && s.position.y > previous.start; t++) s.step(idle, null);
    expect(s.position.y, current.id).toBeLessThan(current.start - 1);
    expect(s.position.y, `${current.id} failed into ${previous.id} at ${JSON.stringify(column)}`).toBeGreaterThan(previous.start);
    expect(s.biome?.id).toBe(previous.id);
    expect(s.peak).toBeGreaterThanOrEqual(current.start + 8 - s.course.start.y - .2);
    expect(s.events.some(e => e.type === 'reset')).toBe(false);
    s.dispose();
  }
});

it('gives every food type real rope, eat, cooldown and respawn behavior', () => {
  const c = makeCourse('main');
  const foods = new Set(c.anchors.map(a => a.food));
  expect(foods.size).toBe(8);
  for (const food of foods) {
    const s = new Simulation(makeCourse('main'));
    let caught: string | undefined;
    for (const a of s.course.anchors.filter(a => a.food === food)) {
      for (const offset of [vec(0, -2, 2), vec(2, 0, 2), vec(-2, 0, -2), vec(0, 2, 2)]) {
        s.body.setTranslation(vec(a.position.x + offset.x, a.position.y + offset.y, a.position.z + offset.z), true);
        if (s.attach(a.id)) { caught = a.id; break; }
      }
      if (caught) break;
    }
    expect(caught, food).toBeDefined();
    const point = s.anchorPosition(caught!)!;
    for (let t = 0; t < 30; t++) s.step(idle, null);
    expect(s.anchorPosition(caught!)).toEqual(point);
    s.release();
    expect(s.flyLife(caught!).phase).toBe('retracting');
    expect(s.attach(caught!)).toBe(false);
    for (let t = 0; t < 120 * (FLY_TIMING.respawn + .1); t++) s.step(idle, null);
    expect(s.flyLife(caught!).phase).toBe('alive');
    s.dispose();
  }
});

it('uses actual colliding relief at the basin banks', () => {
  const s = new Simulation(makeCourse('main'));
  for (const land of s.course.landscapes!) {
    const corner = land.zone === 0 ? 12 : land.round ? 5.6 : 7.5;
    const hit = s.world.castRay(new RAPIER.Ray(vec(land.position.x + corner, land.position.y + 16, land.position.z + corner), vec(0, -1, 0)), 18, true);
    expect(hit).not.toBeNull();
    expect(land.position.y + 16 - hit!.timeOfImpact).toBeGreaterThan(land.position.y + (land.zone === 0 ? .4 : 1));
  }
  s.dispose();
});

it('restores each map version without relocating its original save', () => {
  for (const course of [makeLegacyCourse('main'), makeCourse('main')]) {
    const s = new Simulation(course);
    const saved = { ...s.snapshot(), position: course.biomes ? vec(40, 84, -32) : vec(5, 22, -4), velocity: vec(1, -8, 2), peak: 90 };
    const restored = new Simulation(courseForSave(saved)); restored.restore(saved);
    expect(restored.position).toEqual(saved.position); expect(restored.velocity).toEqual(saved.velocity);
    expect(parseBackup(JSON.stringify({ format: 'frog-ascent-backup', version: 1, createdAt: new Date().toISOString(), current: saved, previous: null, best: 90, settings: DEFAULT_SETTINGS })).current).toEqual(saved);
    s.dispose(); restored.dispose();
  }
});

it('finishes after a stable landing on the actual star summit', () => {
  const s = new Simulation(makeCourse('main')), p = s.course.summit.position;
  s.body.setTranslation(vec(p.x, p.y + .65, p.z), true); s.body.setLinvel(vec(), true);
  for (let t = 0; t < 120; t++) s.step(idle, null);
  expect(s.finished).toBe(true);
  expect(s.events.some(e => e.type === 'summit')).toBe(true);
  s.dispose();
});
