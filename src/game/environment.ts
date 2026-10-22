import { vec, clamp, distance, type Anchor, type Vec, type WaterVolume, type Rock, type Landscape, type Platform } from './types';

export function platformRotation(rotation = vec()) {
  const cx = Math.cos(rotation.x / 2), sx = Math.sin(rotation.x / 2);
  const cy = Math.cos(rotation.y / 2), sy = Math.sin(rotation.y / 2);
  const cz = Math.cos(rotation.z / 2), sz = Math.sin(rotation.z / 2);
  return { x: sx * cy * cz + cx * sy * sz, y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz, w: cx * cy * cz - sx * sy * sz };
}

export function bladeHeight(p: Platform, x: number, z: number) {
  const t = z / (p.size.z / 2), side = x / (p.size.x / 2);
  return p.size.y / 2 + (p.bend ?? .3) * t * t + side * side * (p.form === 'petal' ? .65 : .14);
}

export function platformMesh(p: Platform): { vertices: Float32Array; indices: Uint32Array } {
  const v: number[] = [], f: number[] = [];
  if (p.form === 'leaf' || p.form === 'petal') {
    const rows = 12, cols = 8, layer = (rows + 1) * (cols + 1);
    for (let bottom = 0; bottom < 2; bottom++) for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const t = j / rows, z = (t - .5) * p.size.z;
      const width = (.06 + .94 * Math.pow(Math.sin(Math.PI * t), p.form === 'petal' ? .4 : .65)) * p.size.x / 2;
      const x = (i / cols * 2 - 1) * width;
      v.push(x, bladeHeight(p, x, z) - bottom * p.size.y, z);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + cols + 1;
      f.push(a, b, a + 1, a + 1, b, b + 1, a + layer, a + 1 + layer, b + layer, a + 1 + layer, b + 1 + layer, b + layer);
    }
    const edge: number[] = [];
    for (let i = 0; i <= cols; i++) edge.push(i);
    for (let j = 1; j <= rows; j++) edge.push(j * (cols + 1) + cols);
    for (let i = cols - 1; i >= 0; i--) edge.push(rows * (cols + 1) + i);
    for (let j = rows - 1; j > 0; j--) edge.push(j * (cols + 1));
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i], b = edge[(i + 1) % edge.length];
      f.push(a, a + layer, b, b, a + layer, b + layer);
    }
  } else if (p.form === 'cloud') {
    const faces = [0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];
    const sphere=[...rockHull(vec(1,1,1))],triangles:number[]=[],edges=new Map<string,number>();
    const midpoint=(a:number,b:number)=>{
      const key=`${Math.min(a,b)}:${Math.max(a,b)}`,known=edges.get(key);
      if(known!==undefined)return known;
      const x=(sphere[a*3]+sphere[b*3])/2,y=(sphere[a*3+1]+sphere[b*3+1])/2,z=(sphere[a*3+2]+sphere[b*3+2])/2,d=Math.hypot(x,y,z),id=sphere.length/3;
      sphere.push(x/d,y/d,z/d);edges.set(key,id);return id;
    };
    for(let i=0;i<faces.length;i+=3){
      const a=faces[i],b=faces[i+1],c=faces[i+2],ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
      triangles.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca);
    }
    for (const [x, y, z, scale] of [[0,0,0,1],[-.3,-.12,.06,.8],[.32,-.16,.04,.7],[-.12,-.2,-.3,.65],[.16,-.18,.3,.7]]) {
      const offset = v.length / 3;
      for (let i = 0; i < sphere.length; i += 3) v.push(sphere[i]*p.size.x/2*scale+x*p.size.x,sphere[i+1]*p.size.y/2*scale+y*p.size.y,sphere[i+2]*p.size.z/2*scale+z*p.size.z);
      f.push(...triangles.map(n => n + offset));
    }
  } else {
    const branch = p.form === 'branch' || p.form === 'root', segments = branch ? 12 : 8, rings = branch ? 9 : 5;
    for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
      const t = j / (rings - 1), a = i / segments * Math.PI * 2;
      if (branch) {
        const width = p.form==='root' ? .35+.65*Math.sin(Math.PI*t) : .12+.88*Math.pow(Math.sin(Math.PI*t),.6), z = (t - .5) * p.size.z;
        v.push(Math.cos(a) * p.size.x / 2 * width, Math.sin(a) * p.size.y / 2 + (p.bend ?? .12) * (t * 2 - 1) ** 2, z);
      } else {
        const radius = [.4,.72,1,.95,.81][j]*(1+.13*Math.sin(i*2.7+p.zone)+.06*Math.cos(i*4.1));
        const angle=a+.045*Math.sin(i*3.4+p.zone);
        v.push(Math.cos(angle)*p.size.x/2*radius,[-.5,-.3,0,.32,.5][j]*p.size.y,Math.sin(angle)*p.size.z/2*radius);
      }
    }
    for (let j = 0; j < rings - 1; j++) for (let i = 0; i < segments; i++) {
      const a = j * segments + i, b = j * segments + (i + 1) % segments, c = a + segments, d = b + segments;
      f.push(a, b, c, b, d, c);
    }
    for (let end = 0; end < 2; end++) {
      const offset = v.length / 3, base = end * (rings - 1) * segments;
      v.push(0, branch ? p.bend ?? .12 : (end ? .5 : -.5) * p.size.y, branch ? (end ? .5 : -.5) * p.size.z : 0);
      for (let i = 0; i < segments; i++) f.push(offset, base + (end ? i : (i + 1) % segments), base + (end ? (i + 1) % segments : i));
    }
  }
  if (p.form === 'stone') for (let i=0;i<f.length;i+=3) [f[i+1],f[i+2]]=[f[i+2],f[i+1]];
  return { vertices: new Float32Array(v), indices: new Uint32Array(f) };
}

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
    const cellX = ((x + .5) / n - .5) * land.size.x;
    const cellZ = ((z + .5) / n - .5) * land.size.z;
    if (land.hole && Math.hypot(cellX - land.hole.x, cellZ - land.hole.z) < land.hole.radius) continue;
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
