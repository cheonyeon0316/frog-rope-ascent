import { vec, type Course, type Platform, type Anchor, type Biome, type Food } from './types';
import { makeRocks } from './environment';

export const ECOSYSTEM_ID = 'ecosystem-main-v2';
export function makeEcosystem(): Course {
  const biomes: Biome[] = [
    { id: 'pond', name: '작은 연못', start: 0, end: 15, center: vec(0, 0, 0), kind: 'grass', foods: ['fruit-fly'], sky: '#dce8ce', color: '#749d4c' },
    { id: 'grass', name: '거대한 풀숲', start: 15, end: 35, center: vec(18, 15, -4), kind: 'grass', foods: ['fruit-fly', 'fly'], sky: '#d3e8b7', color: '#6fa345' },
    { id: 'rocks', name: '바위 골짜기', start: 35, end: 60, center: vec(36, 35, -12), kind: 'rock', foods: ['fly', 'beetle'], sky: '#d8ddd4', color: '#9b9c88' },
    { id: 'flower', name: '거대한 꽃', start: 60, end: 90, center: vec(40, 60, -32), kind: 'petal', foods: ['pollen', 'bee'], sky: '#f1ded9', color: '#e3a2b4' },
    { id: 'tree', name: '오래된 나무', start: 90, end: 120, center: vec(20, 90, -40), kind: 'branch', foods: ['bee', 'moth'], sky: '#c3d8ba', color: '#80634b' },
    { id: 'mountain', name: '바위산 능선', start: 120, end: 145, center: vec(0, 120, -34), kind: 'rock', foods: ['beetle', 'moth'], sky: '#c6d6e4', color: '#7c8e9e' },
    { id: 'clouds', name: '구름 바다', start: 145, end: 165, center: vec(-16, 145, -20), kind: 'cloud', foods: ['dew'], sky: '#9dbfe0', color: '#e5edf8' },
    { id: 'stars', name: '별의 길', start: 165, end: 180, center: vec(-10, 165, 0), kind: 'star', foods: ['stardust'], sky: '#192846', color: '#dfc584' },
  ];
  const start = vec(0, .95, 3.5);
  const platforms: Platform[] = [{ id: 'ground', position: vec(0, -.3, 0), size: vec(28, .6, 28), kind: 'ground', zone: 0, round: true }];
  const anchors: Anchor[] = [];
  const solids: NonNullable<Course['solids']> = [];
  const landscapes: NonNullable<Course['landscapes']> = [];
  const rocks = makeRocks();
  const groundSize = 28, groundResolution = 32, groundHeights: number[] = [];
  for (let x = 0; x <= groundResolution; x++) for (let z = 0; z <= groundResolution; z++) {
    const lx = (x / groundResolution - .5) * groundSize, lz = (z / groundResolution - .5) * groundSize;
    const radius = Math.hypot(lx, lz);
    const pondDistance = Math.hypot(lx + 6, lz + 4);
    const rolling = .12 * (.5 + .5 * Math.sin(lx * .24 + .4) * Math.cos(lz * .3 - .25));
    const pondBowl = .55 * Math.max(0, Math.min(1, (7.7 - pondDistance) / 2.2));
    groundHeights.push(.16 + rolling + 1.3 * Math.pow(radius / 14, 2.1) - pondBowl);
  }
  landscapes.push({ position: vec(0, 0, 0), size: vec(groundSize, 1, groundSize), resolution: groundResolution, heights: groundHeights, zone: 0, round: true });
  const direction = (from: Biome, to: Biome) => {
    const dx = to.center.x - from.center.x, dz = to.center.z - from.center.z, d = Math.hypot(dx, dz);
    return vec(dx / d, 0, dz / d);
  };
  for (const [zone, biome] of biomes.entries()) {
    const c = biome.center;
    if (zone > 0) {
      const thickness = biome.kind === 'rock' ? 5 : biome.kind === 'grass' ? 3 : biome.kind === 'branch' ? 2 : 1.2;
      const round = true;
      platforms.push({ id: `basin-${biome.id}`, position: vec(c.x, biome.start + .15 - thickness / 2, c.z),
        size: vec(19, thickness, 19), kind: biome.kind, zone, refuge: biome.name, recovery: true, round });
      // A continuous, gently rolling landform is the ground of this ecosystem, with one low natural pass.
      const back = direction(biome, biomes[zone - 1]);
      const terrainSize = 19, terrainResolution = 40;
      const heights: number[] = [];
      const rimHeight = biome.kind === 'rock' ? 5 : biome.kind === 'branch' ? 4.5 : biome.kind === 'grass' ? 4.2 : 4.2;
      for (let x = 0; x <= terrainResolution; x++) for (let z = 0; z <= terrainResolution; z++) {
        const lx = (x / terrainResolution - .5) * terrainSize, lz = (z / terrainResolution - .5) * terrainSize;
        const radius = Math.hypot(lx, lz), angle = Math.atan2(lz, lx);
        const along = lx * back.x + lz * back.z;
        const across = Math.abs(lx * back.z - lz * back.x);
        const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
        // Keep a broad low pass open toward the next biome so slower eat-dashes
        // can follow the terrain route without being forced into the outer rim.
        const gate = smooth(3.5, 9.5, along) * (1 - smooth(2.4, 4, across));
        const rim = Math.max(0, Math.min(1, (radius - 4.8) / 4.7));
        const broadRoll = Math.sin(lx * .57 + zone) * Math.cos(lz * .42 - zone * .7) * .2;
        const smallRoll = Math.sin(lx * 1.1 + lz * .63) * Math.cos(lz * .91 - lx * .34) * .07;
        const strata = biome.kind === 'rock' ? Math.max(0, Math.sin(angle * 4 + radius * .58 + zone) - .25) * .32 : 0;
        const ridge = Math.pow(rim, biome.kind === 'rock' ? 1.1 : 1.15) * rimHeight;
        heights.push(ridge - gate * (ridge + 1.5) + broadRoll * (1 - gate * .8) + smallRoll + strata);
      }
      landscapes.push({ position: vec(c.x, biome.start + .15, c.z), size: vec(terrainSize, 1, terrainSize), resolution: terrainResolution, heights, zone, round });
      anchors.push({ id: `food-basin-${biome.id}`, position: vec(c.x, biome.start + 2.8, c.z), zone, recovery: true, food: biome.foods[0] });
    }
    if (biome.kind === 'rock') {
      for (const [x, z, h] of [[-5.5, -5.5, 8], [5.5, 5.5, 12], [-5, 5.5, 5]])
        rocks.push({ position: vec(c.x + x, biome.start + h / 2 - 2, c.z + z), size: vec(2.8, h / 2, 2.8) });
    }
    if (zone === 3) {
      solids.push({ kind: 'stem', position: vec(c.x + 5.6, 53, c.z + 5.6), radius: 1.3, height: 64 });
      // The rock-to-flower launch enters here; a solid petal roof would knock it down.
      for (const sign of [-1, 1]) for (const axis of ['x', 'z']) {
        if (axis === 'z' && sign === 1) continue;
        platforms.push({ id: `outer-petal-${axis}-${sign}`, kind: 'petal', zone,
          position: vec(c.x + (axis === 'x' ? sign * 10 : 0), 60.1, c.z + (axis === 'z' ? sign * 10 : 0)),
          size: axis === 'x' ? vec(5, .4, 10) : vec(10, .4, 5) });
      }
    }
    if (zone === 4) solids.push({ kind: 'trunk', position: vec(c.x + 5.8, 74, c.z - 5.8), radius: 1.65, height: 76 });
  }
  let previous = start;
  for (let i = 1; i <= 36; i++) {
    const y = i * 5;
    const zone = biomes.findIndex(b => y >= b.start && (y < b.end || b.end === 180));
    const biome = biomes[zone], c = biome.center;
    const back = zone ? direction(biome, biomes[zone - 1]) : vec(0, 0, 1);
    const forward = zone < 7 ? direction(biome, biomes[zone + 1]) : vec(.5, 0, .85);
    const t = Math.min(1, Math.max(0, (y - biome.start) / Math.max(5, biome.end - biome.start - 5)));
    const entry = vec(c.x + back.x * (zone ? 6.3 : 1), y, c.z + back.z * (zone ? 6.3 : 1));
    const exit = vec(c.x + forward.x * 4.2, y, c.z + forward.z * 4.2);
    const bend = Math.sin(t * Math.PI) * (i % 2 ? 3 : -3);
    const p = vec(entry.x + (exit.x - entry.x) * t - forward.z * bend, y, entry.z + (exit.z - entry.z) * t + forward.x * bend);
    // Keep the already verified pond opening; the ecosystem diverges at the grass bank.
    if (i <= 2) { p.x = Math.sin(.63 * i) * 5.6; p.z = Math.cos(.63 * i) * 5.6; }
    if (i === 36) { p.x += forward.x * 4.4; p.z += forward.z * 4.4; }
    const kind = biome.kind === 'grass' ? 'leaf' : biome.kind;
    if (i !== 36) platforms.push({ id: `pad-${i}`, position: p, size: vec(i < 4 ? 3.8 : 3.2, .3, 2.8), kind, zone, bounce: i === 4 ? 8 : undefined });
    if (zone === 4) {
      const a = vec(c.x + 5.8, y - 2, c.z - 5.8), b = vec(p.x, y - .6, p.z);
      const direction = vec(b.x - a.x, b.y - a.y, b.z - a.z);
      solids.push({ kind: 'trunk', radius: .25, height: Math.hypot(direction.x, direction.y, direction.z), direction,
        position: vec((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2) });
    }
    const food: Food = biome.foods[(i + 1) % biome.foods.length];
    const entryFood = vec(previous.x + (p.x - previous.x) * .15, i === 1 ? 4.5 : y + .9, previous.z + (p.z - previous.z) * .15);
    anchors.push({ id: `fly-${i}-a`, position: entryFood, zone, recovery: false, food });
    const high: Anchor = { id: `fly-${i}-b`, position: vec(p.x + (i % 2 ? 1 : -1) * (i <= 2 ? 1.45 : 1.2), y + (i <= 2 ? 3.2 : 3.4), p.z - (i <= 2 ? .9 : .8)), zone, recovery: false, food: biome.foods[i % biome.foods.length] };
    if (high.food === 'bee') high.motion = { amplitude: vec(.7, .1, .4), period: 2.5, phase: 0 };
    if (high.food === 'pollen') high.motion = { amplitude: vec(.25, .3, .2), period: 4, phase: 0 };
    if (high.food === 'moth') high.motion = { amplitude: vec(.35, .4, .25), period: 3.2, phase: 0 };
    if (i <= 4 || high.food === 'dew') high.motion = { amplitude: vec(.3, .1, .2), period: 3, phase: 0 };
    anchors.push(high);
    if (i <= 3) anchors.push({ id: `fly-${i}-relay`, position: vec(previous.x + (p.x - previous.x) * .35, y + 2, previous.z + (p.z - previous.z) * .35), zone, recovery: false, food });
    previous = p;
  }
  const summit: Platform = { id: 'summit', position: vec(previous.x, 180, previous.z), size: vec(5, .4, 5), kind: 'star', zone: 7 };
  platforms.push(summit);
  for (const anchor of anchors.filter(a => /^fly-\d+-b$/.test(a.id))) {
    const i = Number(anchor.id.split('-')[1]);
    if (i <= 2 || i === 36) continue;
    const p = platforms.find(p => p.id === `pad-${i}`)!.position;
    const next = i === 35 ? summit.position : platforms.find(p => p.id === `pad-${i + 1}`)!.position;
    // The upper meal aims the Space launch into the next hop instead of straight overhead.
    anchor.position = vec(p.x + (next.x - p.x) * .35, p.y + 4.2, p.z + (next.z - p.z) * .35);
    if (anchor.zone === 4 && i < 23) {
      // Keep the moving meal clear of the next physical branch, including its whole orbit.
      const trunk = biomes[4].center, ax = trunk.x + 5.8, az = trunk.z - 5.8;
      const dx = next.x - ax, dz = next.z - az;
      const t = Math.max(0, Math.min(1, ((anchor.position.x - ax) * dx + (anchor.position.z - az) * dz) / (dx * dx + dz * dz)));
      const cx = ax + dx * t, cz = az + dz * t;
      let ox = anchor.position.x - cx, oz = anchor.position.z - cz;
      let d = Math.hypot(ox, oz);
      if (d < 1.2) {
        if (d < .001) { ox = -dz; oz = dx; d = Math.hypot(ox, oz); }
        anchor.position.x = cx + ox / d * 1.2; anchor.position.z = cz + oz / d * 1.2;
      }
    }
  }
  for (let zone = 0; zone < biomes.length - 1; zone++) {
    const i = biomes[zone].end / 5 - 1;
    const p = platforms.find(p => p.id === `pad-${i}`)!.position;
    const nextPlatform = platforms.find(p => p.id === `pad-${i + 1}`)!;
    const next = nextPlatform.position;
    const lift = 8.5;
    const horizontal = Math.hypot(next.x - p.x, next.z - p.z);
    const nominalReach = .75;
    const reach = Math.min(nominalReach, Math.sqrt(9.5 ** 2 - (lift - .55) ** 2) / Math.max(.001, horizontal));
    const crossing = vec(p.x + (next.x - p.x) * reach, p.y + lift, p.z + (next.z - p.z) * reach);
    const destination = biomes[zone + 1];
    nextPlatform.size = vec(4, nextPlatform.size.y, 4); nextPlatform.round = true;
    nextPlatform.kind = destination.kind; nextPlatform.recovery = true;
    anchors.push({ id: `food-crossing-${biomes[zone].id}`, position: crossing,
      zone, recovery: false, food: biomes[zone].foods[0], transition: true });
  }
  const cloudPad = platforms.find(p => p.id === 'pad-30')!;
  const water = { id: 'cloud-dew', position: vec(cloudPad.position.x + 3, 153, cloudPad.position.z - 1), radius: 2.8 };
  anchors.push({ id: 'food-cloud-exit', position: vec(water.position.x + .6, 157, water.position.z), zone: 6, recovery: false, food: 'dew' });
  return { id: ECOSYSTEM_ID, mode: 'main', height: 180, start, anchors, platforms, summit, waters: [water], rocks, solids, landscapes, biomes, bounds: 70 };
}
