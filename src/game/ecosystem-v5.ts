import { makeEcosystem } from './ecosystem';
import { vec, type Anchor, type Course, type Landform, type Platform, type Solid, type Vec } from './types';

export const ECOSYSTEM_V5_ID = 'ecosystem-main-v5';
export const LEVEL_HEIGHT_SCALE = 3.5;
export const WORLD_SCALE = 2;
const START_WELL_DEPTH = 22.5;

const scaleY = (y: number) => y * LEVEL_HEIGHT_SCALE;
const worldY = scaleY;
const exponentialDifficulty = (zone: number) => {
  const t = Math.max(0, Math.min(1, zone / 9));
  return (Math.exp(t * 2.1) - 1) / (Math.exp(2.1) - 1);
};
const copy = (v: Vec): Vec => ({ ...v });

function transformedSolid(solid: Solid): Solid {
  const direction = solid.direction ?? vec(0, 1, 0);
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const half = { x: direction.x / length * solid.height / 2, y: direction.y / length * solid.height / 2, z: direction.z / length * solid.height / 2 };
  const a = { x: solid.position.x - half.x, y: worldY(solid.position.y - half.y), z: solid.position.z - half.z };
  const b = { x: solid.position.x + half.x, y: worldY(solid.position.y + half.y), z: solid.position.z + half.z };
  const delta = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  return { ...solid, position: vec((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), height: Math.hypot(delta.x, delta.y, delta.z), direction: delta };
}

function landscapeHeightAt(land: NonNullable<Course['landscapes']>[number], x: number, z: number): number {
  const resolution = land.resolution, stride = resolution + 1;
  const gx = Math.max(0, Math.min(resolution, (x - land.position.x) / land.size.x * resolution + resolution / 2));
  const gz = Math.max(0, Math.min(resolution, (z - land.position.z) / land.size.z * resolution + resolution / 2));
  const x0 = Math.min(resolution - 1, Math.floor(gx)), z0 = Math.min(resolution - 1, Math.floor(gz));
  const fx = gx - x0, fz = gz - z0;
  const h00 = land.heights[x0 * stride + z0], h10 = land.heights[(x0 + 1) * stride + z0];
  const h01 = land.heights[x0 * stride + z0 + 1], h11 = land.heights[(x0 + 1) * stride + z0 + 1];
  return land.position.y + (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
}

/** Turn each of v4's 45 landings into a three-beat route with extra catches. */
export function makeEcosystemV5(): Course {
  const base = makeEcosystem();
  const startingTerrain = base.landscapes?.find(landscape => landscape.zone === 0);
  const wellRimTop = startingTerrain
    ? landscapeHeightAt(startingTerrain, base.start.x + 5.6, base.start.z)
    : 0;
  const solids = (base.solids ?? []).map(transformedSolid);
  const platforms = base.platforms.map(platform => {
    if (platform.id === 'ground') return { ...platform, position: vec(0, -START_WELL_DEPTH - platform.size.y / 2, base.start.z),
      size: vec(8.8, platform.size.y, 8.8), round: true };
    const size = copy(platform.size);
    const difficulty = exponentialDifficulty(platform.zone);
    const lateDifficulty = Math.max(0, (difficulty - .06) / .94);
    size.x *= 1 - .34 * lateDifficulty;
    size.z *= 1 - .34 * lateDifficulty;
    const authoredTop = platform.position.y + platform.size.y / 2;
    const top = platform.id === 'pad-1' ? -9.5 : platform.id === 'pad-2' ? 2.5 : worldY(authoredTop);
    const wellPad = platform.id === 'pad-1' || platform.id === 'pad-2';
    const position = platform.id === 'cloud-hanging-bank'
      ? { ...platform.position, x: platform.position.x - 12, z: platform.position.z - 9, y: top - size.y / 2 }
      : wellPad
        ? { ...platform.position, x: platform.id === 'pad-1' ? 1 : -1, z: platform.id === 'pad-1' ? base.start.z + .65 : base.start.z - .65, y: top - size.y / 2 }
        : { ...platform.position, y: top - size.y / 2 };
    if (wellPad) { size.x = Math.min(size.x, 3.8); size.z = Math.min(size.z, 3.8); }
    return { ...platform, position, size };
  });
  const platformById = new Map(platforms.map(platform => [platform.id, platform]));
  const authoredRoute = (base.route ?? []).map(beat => ({ beat, platform: base.platforms.find(platform => platform.id === beat.platform) })).filter(
    (entry): entry is { beat: NonNullable<Course['route']>[number]; platform: Platform } => !!entry.platform && entry.platform.id !== 'pad-1',
  );
  const ground = base.platforms.find(platform => platform.id === 'ground');
  const routeNodes = ground ? [{ platform: ground, beat: undefined }, ...authoredRoute] : authoredRoute;
  const expandedPlatforms: Platform[] = [];
  const bridgePads: Platform[] = [];
  const palette: Record<number, string> = { 1:'#82ad58', 2:'#939384', 3:'#df9db0', 4:'#8b6b4d', 5:'#89959a', 6:'#e5edf7', 7:'#73768c', 8:'#829575', 9:'#efaaa5' };
  const formFor = (platform: Platform): Landform => platform.form ?? (platform.kind === 'rock' ? 'stone' : platform.kind === 'cloud' ? 'cloud' : 'branch');
  const kindFor = (form: Landform): Platform['kind'] => form === 'stone' ? 'rock' : form === 'root' ? 'branch' : form;
  const sourceTop = (platform: Platform) => platform.position.y + platform.size.y / 2;
  for (let i = 0; i < routeNodes.length - 1; i++) {
    const fromSource = routeNodes[i].platform, toSource = routeNodes[i + 1].platform;
    const from = platformById.get(fromSource.id)!, to = platformById.get(toSource.id)!;
    expandedPlatforms.push(from);
    const fromTop = sourceTop(from), toTop = sourceTop(to);
    const dx = to.position.x - from.position.x, dz = to.position.z - from.position.z;
    const horizontalLength = Math.hypot(dx, dz);
    const perpendicular = horizontalLength > .01 ? { x: -dz / horizontalLength, z: dx / horizontalLength }
      : (i % 2 ? { x: 0, z: 1 } : { x: 1, z: 0 });
    const bridgeSide = i % 2 ? -1 : 1;
    // Scale the course up while keeping the authored route readable: add
    // catches for both vertical and lateral gaps before the final 2x transform.
    const bridgeCount = Math.max(2, Math.ceil(Math.abs(toTop - fromTop) / 4) - 1,
      Math.ceil(horizontalLength / 5.5) - 1);
    for (let step = 1; step <= bridgeCount; step++) {
      const t = step / (bridgeCount + 1);
      const side = bridgeSide;
      const form = formFor(t < .5 ? fromSource : toSource);
      const top = fromTop + (toTop - fromTop) * t;
      const zone = t < .5 ? from.zone : to.zone;
      const difficulty = exponentialDifficulty(zone);
      const insideWell = fromTop < 0;
      const size = insideWell ? vec(3.6, .34, 3.6) : vec(4.8 - 2.35 * difficulty, .34, 4.6 - 2.2 * difficulty);
      const offset = insideWell ? 2.2 : 4 + 2 * difficulty;
      const x = from.position.x + dx * t + perpendicular.x * offset * side;
      const z = from.position.z + dz * t + perpendicular.z * offset * side;
      const pad: Platform = {
        id: `bridge-${i + 1}-${step}`,
        position: vec(x, top - size.y / 2, z),
        size, zone, kind: kindFor(form), form, bend: .35, color: palette[zone],
      };
      // The well is an open vertical tutorial shaft. Keep its bottom start
      // surface and the exit landing, but remove every midair step below the rim.
      if (top < wellRimTop) continue;
      bridgePads.push(pad); expandedPlatforms.push(pad);
    }
  }
  const summitSource = authoredRoute.at(-1)?.platform;
  const summit = summitSource ? platformById.get(summitSource.id) : undefined;
  if (summit) expandedPlatforms.push(summit);
  platforms.push(...bridgePads);

  const foodAnchor = (id: string, position: Vec, zone: number, food?: Anchor['food']): Anchor => {
    const anchor: Anchor = { id, position, zone, recovery: false, food };
    const motionScale = 1 + 1.35 * exponentialDifficulty(zone);
    if (food === 'bee') anchor.motion = { amplitude: vec(.32 * motionScale, .08 * motionScale, .2 * motionScale), period: 3.5, phase: 0 };
    if (food === 'pollen') anchor.motion = { amplitude: vec(.16 * motionScale, .16 * motionScale, .12 * motionScale), period: 4.5, phase: 0 };
    if (food === 'moth') anchor.motion = { amplitude: vec(.2 * motionScale, .2 * motionScale, .12 * motionScale), period: 4, phase: 0 };
    if (food === 'dew') anchor.motion = { amplitude: vec(.48 * motionScale, .22 * motionScale, .35 * motionScale), period: 3.2, phase: .4 };
    if (food === 'stardust' && zone === 9) anchor.motion = { amplitude: vec(.42 * motionScale, .18 * motionScale, .3 * motionScale), period: 3.8, phase: .8 };
    return anchor;
  };
  const anchors = base.anchors.filter(anchor => !/^fly-\d+-[ab]$/.test(anchor.id) && !anchor.id.startsWith('food-crossing-'))
    .map(anchor => {
      const recovery = anchor.recovery ? platforms.find(p => p.id === `basin-${base.biomes?.[anchor.zone]?.id}`) : undefined;
      return { ...anchor, position: { ...anchor.position,
        y: recovery ? recovery.position.y + recovery.size.y / 2 + 2.8 : worldY(anchor.position.y) } };
    });
  // Keep a simple chain of close catches through the empty well shaft.
  for (const anchor of base.anchors.filter(item => item.id === 'fly-1-a' || item.id === 'fly-1-b')) {
    anchors.push({ ...anchor, position: { ...anchor.position,
      ...(anchor.id === 'fly-1-a' ? { x: -2 } : {}),
      y: anchor.id === 'fly-1-a' ? -17.5 : -13.5 } });
  }
  for (const [index, y] of [-9.5, -5.5, -1.5, 2.5].entries()) {
    const angle = index * Math.PI / 2;
    anchors.push(foodAnchor(`well-tutorial-${index + 1}`, vec(Math.cos(angle) * 1.5, y,
      base.start.z + Math.sin(angle) * 1.5), 0, 'fly'));
  }
  const route: NonNullable<Course['route']> = [];
  for (let i = 0; i < expandedPlatforms.length - 1; i++) {
    const platform = expandedPlatforms[i], next = expandedPlatforms[i + 1];
    const zone = platform.zone, biome = base.biomes?.[zone];
    const foods = biome?.foods ?? ['fly'];
    const launchId = `v5-route-${i + 1}-a`, arrivalId = `v5-route-${i + 1}-b`;
    const launchY = sourceTop(platform) + (platform.id === 'ground' ? 5.5 : 3.5);
    const arrivalY = sourceTop(next) + 3.5;
    const dx = next.position.x - platform.position.x, dz = next.position.z - platform.position.z;
    const horizontalLength = Math.hypot(dx, dz) || 1;
    const difficulty = exponentialDifficulty(Math.max(zone, next.zone));
    const foodOffset = platform.position.y + platform.size.y / 2 < 0 ? 1.2 : 2.5 + difficulty * .35;
    const launchSide = i % 2 ? -1 : 1;
    const arrivalSide = launchSide;
    anchors.push(foodAnchor(launchId, vec(platform.position.x - dz / horizontalLength * foodOffset * launchSide, launchY,
      platform.position.z + dx / horizontalLength * foodOffset * launchSide), zone, foods[(i + 1) % foods.length]));
    anchors.push(foodAnchor(arrivalId, vec(next.position.x - dz / horizontalLength * foodOffset * arrivalSide, arrivalY,
      next.position.z + dx / horizontalLength * foodOffset * arrivalSide), next.zone, (base.biomes?.[next.zone]?.foods ?? foods)[i % (base.biomes?.[next.zone]?.foods.length ?? foods.length)]));
    const original = routeNodes.find(entry => entry.platform.id === platform.id)?.beat;
    route.push({ platform: platform.id, launch: launchId, arrival: arrivalId, name: original?.name ?? `${biome?.name ?? '상승'} 중간 발판 ${i + 1}`, zone });
  }
  if (summit) route.push({ platform: summit.id, launch: '', name: '별의 정상', zone: 9 });

  const biomes = base.biomes?.map(biome => ({ ...biome, start: worldY(biome.start), end: worldY(biome.end), center: { ...biome.center, y: worldY(biome.center.y) } }));
  const landscapes = base.landscapes?.map(landscape => {
    const result = { ...landscape, position: copy(landscape.position), size: copy(landscape.size), heights: [...landscape.heights] };
    if (landscape.zone !== 0) return result;
    result.hole = { x: base.start.x, z: base.start.z, radius: 5 };
    const stride = landscape.resolution + 1;
    for (let x = 0; x <= landscape.resolution; x++) for (let z = 0; z <= landscape.resolution; z++) {
      const lx = (x / landscape.resolution - .5) * landscape.size.x;
      const lz = (z / landscape.resolution - .5) * landscape.size.z;
      const radius = Math.hypot(lx, lz - base.start.z);
      if (radius >= 5.3) continue;
      const index = x * stride + z, original = landscape.heights[index];
      const floor = -START_WELL_DEPTH + .02 * Math.sin(lx * 2.1) * Math.cos(lz * 1.7);
      const blend = Math.max(0, Math.min(1, (radius - 4.55) / .75));
      result.heights[index] = floor * (1 - blend) + original * blend;
    }
    return result;
  });
  const scalePosition = (p: Vec): Vec => vec(p.x * WORLD_SCALE, p.y * WORLD_SCALE, p.z * WORLD_SCALE);
  const scaleSize = (s: Vec): Vec => vec(s.x * WORLD_SCALE, s.y * WORLD_SCALE, s.z * WORLD_SCALE);
  return {
    ...base,
    id: ECOSYSTEM_V5_ID,
    height: scaleY(base.height) * WORLD_SCALE,
    start: scalePosition({ ...base.start, y: base.start.y - START_WELL_DEPTH }),
    platforms: platforms.filter(platform => platform.id !== 'pad-1')
      .map(platform => ({ ...platform, position: scalePosition(platform.position), size: scaleSize(platform.size) })),
    anchors: anchors.map(anchor => ({ ...anchor, position: scalePosition(anchor.position),
      motion: anchor.motion ? { ...anchor.motion, amplitude: scaleSize(anchor.motion.amplitude) } : undefined })),
    summit: { ...summit!, position: scalePosition(summit!.position), size: scaleSize(summit!.size) },
    biomes: biomes?.map(biome => ({ ...biome, start: biome.start * WORLD_SCALE, end: biome.end * WORLD_SCALE,
      center: scalePosition(biome.center) })),
    solids: solids.map(solid => ({ ...solid, position: scalePosition(solid.position), height: solid.height * WORLD_SCALE,
      radius: solid.radius * WORLD_SCALE, direction: solid.direction ? scalePosition(solid.direction) : undefined })),
    landscapes: landscapes?.map(landscape => ({ ...landscape, position: scalePosition(landscape.position), size: scaleSize(landscape.size),
      heights: landscape.heights.map(height => height * WORLD_SCALE), hole: landscape.hole ? { ...landscape.hole,
        x: landscape.hole.x * WORLD_SCALE, z: landscape.hole.z * WORLD_SCALE, radius: landscape.hole.radius * WORLD_SCALE } : undefined })),
    rocks: base.rocks?.map(rock => ({ ...rock, position: scalePosition(rock.position), size: scaleSize(rock.size) })),
    waters: base.waters?.map(water => ({ ...water, position: scalePosition(water.position), radius: water.radius * WORLD_SCALE })),
    bounds: base.bounds === undefined ? undefined : base.bounds * WORLD_SCALE,
    route,
  };
}
