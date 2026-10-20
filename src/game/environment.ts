import { vec, clamp, distance, type Anchor, type Vec, type WaterVolume, type Rock, type Landscape } from './types';

export const WATER_CONFIG = { moveSpeed: 3.2, riseSpeed: 4.2, diveSpeed: 3.5, floatSpeed: .25, drag: 6, skin: .25 };
export function cylinderRotation(direction: Vec) {
  const d = Math.hypot(direction.x, direction.y, direction.z);
  if (d < .001) return { x: 0, y: 0, z: 0, w: 1 };
  const x = direction.x / d, y = direction.y / d, z = direction.z / d;
  if (y < -.99999) return { x: 1, y: 0, z: 0, w: 0 };
  const n = Math.hypot(z, -x, 1 + y);
  return { x: z / n, y: 0, z: -x / n, w: (1 + y) / n };
}

// The same triangles feed Rapier and Three.js; relief never invents invisible terrain.
export function landscapeMesh(land: Landscape) {
  const n = land.resolution, vertices: number[] = [], indices: number[] = [];
  for (let x = 0; x <= n; x++) for (let z = 0; z <= n; z++) {
    const nx = x / n * 2 - 1, nz = z / n * 2 - 1;
    const angle = Math.atan2(nz, nx);
    const organicEdge = land.round ? 1 + .026 * Math.sin(angle * 3 + land.zone * .9) + .018 * Math.cos(angle * 5 - land.zone * .6) : 1;
    vertices.push(nx * land.size.x / 2 * (land.round ? Math.sqrt(1 - nz * nz / 2) * organicEdge : 1), land.heights[x * (n + 1) + z],
      nz * land.size.z / 2 * (land.round ? Math.sqrt(1 - nx * nx / 2) * organicEdge : 1));
  }
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    const a = x * (n + 1) + z, b = a + n + 1, c = a + 1, d = b + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

export function starMesh(size: Vec) {
  const vertices: number[] = [0, size.y / 2, 0, 0, -size.y / 2, 0], indices: number[] = [];
  const r = Math.min(size.x, size.z) / 2;
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5, radius = i % 2 ? r * .45 : r;
    vertices.push(Math.sin(a) * radius, size.y / 2, Math.cos(a) * radius, Math.sin(a) * radius, -size.y / 2, Math.cos(a) * radius);
  }
  for (let i = 0; i < 10; i++) {
    const a = 2 + i * 2, b = 2 + (i + 1) % 10 * 2;
    indices.push(0, a, b, 1, b + 1, a + 1, a, a + 1, b, b, a + 1, b + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

export function cloudClumps(size: Vec): Rock[] {
  const r = Math.min(size.x, size.z) * .4;
  return [0, -1, 1].map((side, i) => {
    const height = i ? .42 : .55;
    return { position: vec(side * r * .45, size.y / 2 - height * .850650808, i ? r * .1 : 0), size: vec(r * (i ? .75 : 1), height, r * (i ? .8 : 1)) };
  });
}

export function makeRocks(): Rock[] {
  const rocks: Rock[] = [];
  for (let i = 0; i < 24; i++) {
    const a = i * 2.399, r = 8 + i % 5 * 1.5;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.hypot(x + 6, z + 4) < 7.3) continue;
    const size = vec(.35 + i % 3 * .22, .25 + i % 4 * .1, .4 + i % 3 * .16);
    rocks.push({ position: vec(x, size.y * .850650808, z), size });
  }
  return rocks;
}
export function rockHull(size: Vec): Float32Array {
  const t = (1 + Math.sqrt(5)) / 2, k = 1 / Math.sqrt(1 + t * t);
  const vertices = [-1,t,0,1,t,0,-1,-t,0,1,-t,0,0,-1,t,0,1,t,0,-1,-t,0,1,-t,t,0,-1,t,0,1,-t,0,-1,-t,0,1];
  return new Float32Array(vertices.map((n, i) => n * k * [size.x, size.y, size.z][i % 3]));
}

export function movingAnchorPosition(anchor: Anchor, time: number): Vec {
  if (!anchor.motion) return vec(anchor.position.x, anchor.position.y, anchor.position.z);
  const { amplitude, period, phase } = anchor.motion;
  const t = time / period * Math.PI * 2 + phase;
  return vec(anchor.position.x + amplitude.x * Math.sin(t), anchor.position.y + amplitude.y * Math.sin(t * 2), anchor.position.z + amplitude.z * Math.sin(t));
}

export function waterAt(position: Vec, volumes: WaterVolume[] = []): { volume: WaterVolume; immersion: number } | null {
  let best: { volume: WaterVolume; immersion: number } | null = null;
  for (const volume of volumes) {
    const immersion = clamp((volume.radius + WATER_CONFIG.skin - distance(position, volume.position)) / .55, 0, 1);
    if (immersion > .01 && (!best || immersion > best.immersion)) best = { volume, immersion };
  }
  return best;
}
