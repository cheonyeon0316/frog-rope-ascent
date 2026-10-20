import { vec, type Course, type Platform, type Anchor, type Mode, type WaterVolume } from './types';
import { makeRocks } from './environment';

export function makeLegacyCourse(mode: Mode): Course {
  const anchors: Anchor[] = [];
  const platforms: Platform[] = [];
  const waters: WaterVolume[] = [];
  const height = mode === 'main' ? 180 : 12;
  const start = vec(0, .45, 3.5);
  platforms.push({ id: 'ground', position: vec(0, -0.3, 0), size: vec(34, 0.6, 34), kind: 'ground', zone: 0 });
  if (mode === 'training') {
    platforms.push(
      { id: 'train-a', position: vec(3, 3.5, -.8), size: vec(3.8, 0.3, 3.2), kind: 'leaf', zone: 0 },
      { id: 'train-b', position: vec(-1, 7.5, -1), size: vec(4.1, 0.3, 3.7), kind: 'pot', zone: 1 },
      { id: 'train-recovery', position: vec(-4, 2, 1.8), size: vec(2.2, 0.25, 2.2), kind: 'leaf', zone: 0, recovery: true, bounce: 6.2 },
    );
    [vec(.8, 4.7, 3), vec(2.8, 7.4, .9), vec(-.9, 10.4, .4), vec(4.2, 14.5, -.5), vec(-3, 5.1, 2.4)]
      .forEach((position, i) => anchors.push({ id: `fly-${i}`, position, zone: i < 2 ? 0 : 1, recovery: i === 4 }));
    anchors[1].motion = { amplitude: vec(.35, .12, .2), period: 3, phase: 0 };
  } else {
    // Each terrace catches local retries; the winding route then leaves its footprint.
    let previous = vec(0, 0, 3.5);
    for (let i = 1; i <= 36; i++) {
      const y = i * 5;
      const zone = Math.min(5, Math.floor((y - .1) / 30));
      const angle = .63 * i;
      const p = vec(Math.sin(angle) * 5.6, y, Math.cos(angle) * 5.6);
      const kind: Platform['kind'] = (['leaf', 'pot', 'metal', 'wood', 'leaf', 'flower'] as const)[zone];
      const width = i < 7 ? 3.8 : i % 6 === 0 ? 4 : i % 4 === 0 ? 2 : 2.9;
      if (i !== 36) platforms.push({ id: `pad-${i}`, position: p, size: vec(width, .3, width * .9), kind, zone, bounce: i === 4 ? 8 : undefined });
      // Two accessible stepping anchors and an optional wider swing per beat.
      anchors.push({ id: `fly-${i}-a`, position: vec(previous.x + (p.x - previous.x) * .15, i === 1 ? 4.5 : y + .9, previous.z + (p.z - previous.z) * .15), zone, recovery: false });
      anchors.push({ id: `fly-${i}-b`, position: vec(p.x + (i % 2 ? 1 : -1) * (i <= 6 ? 1.45 : 1.2), y + (i <= 6 ? 3.2 : 3.6), p.z - (i <= 6 ? .9 : .7)), zone, recovery: false });
      // The first three beats teach eat-dash -> diagonal rehook before the long ascent.
      if (i <= 3) anchors.push({ id: `fly-${i}-relay`, position: vec(previous.x + (p.x - previous.x) * .35, y + 2, previous.z + (p.z - previous.z) * .35), zone, recovery: false });
      if (i % 3 === 0) anchors.push({ id: `fly-${i}-shortcut`, position: vec(p.x * .45, y + 5, p.z * .45), zone, recovery: false });
      if (i % 6 === 3) {
        platforms.push({ id: `recover-${i}`, position: vec(-p.x * .9, y - 7, -p.z * .8), size: vec(1.8, .25, 2), kind: 'leaf', zone, recovery: true });
        anchors.push({ id: `fly-${i}-recover`, position: vec(-p.x * .9 + .5, y - 3, -p.z * .8), zone, recovery: true });
      }
      previous = p;
    }
    const refugeNames = ['첫 숨돌림', '화분 마당', '선반 안쪽', '온실 쉼터', '수관 둥지', '꽃 아래 뜰'];
    for (let i = 3; i <= 33; i += 6) {
      // Cover the next two beats with 1.8m of lateral room. The third beat turns
      // around the trunk and out over open air, exposing the earlier ascent again.
      const pads = [i, i + 1, i + 2].map(n => platforms.find(p => p.id === `pad-${n}`)!);
      const minX = Math.min(...pads.map(p => p.position.x)) - 1.8;
      const maxX = Math.max(...pads.map(p => p.position.x)) + 1.8;
      const minZ = Math.min(...pads.map(p => p.position.z)) - 1.8;
      const maxZ = Math.max(...pads.map(p => p.position.z)) + 1.8;
      // Keep the existing pad/anchor IDs and top height for saved games.
      platforms.push({ id: `refuge-${i}`, position: vec((minX + maxX) / 2, i * 5 - .25, (minZ + maxZ) / 2),
        size: vec(maxX - minX, .8, maxZ - minZ), kind: 'terrace', zone: pads[0].zone, refuge: refugeNames[(i - 3) / 6] });
      anchors.push({ id: `fly-refuge-${i}`, position: vec((minX + maxX) / 2, i * 5 + 2.8, (minZ + maxZ) / 2),
        zone: pads[0].zone, recovery: true });
    }
    for (const [id, amplitude, period, phase] of [
      ['fly-1-relay', vec(.4, .12, .25), 2.8, 0],
      ['fly-2-b', vec(.75, .2, .45), 2.6, 0],
      ['fly-3-a', vec(.6, .18, .55), 2.9, Math.PI / 2],
      ['fly-4-b', vec(.7, .2, .4), 2.5, Math.PI],
    ] as const) anchors.find(anchor => anchor.id === id)!.motion = { amplitude, period, phase };
    for (const [i, radius, lift] of [[6, 3.4, 4], [9, 3.6, 4.2]]) {
      const pad = platforms.find(platform => platform.id === `pad-${i}`)!;
      const position = vec(pad.position.x, pad.position.y + lift, pad.position.z);
      const id = `water-${i}`;
      waters.push({ id, position, radius });
      anchors.push({ id: `fly-${id}-exit`, position: vec(position.x + 1, position.y + radius + 1.2, position.z - .4), zone: pad.zone, recovery: false });
    }
  }
  const summit: Platform = {
    id: 'summit', position: mode === 'main' ? vec(Math.sin(.63 * 36) * 5.6, height, Math.cos(.63 * 36) * 5.6) : vec(3.2, height, -3),
    size: mode === 'main' ? vec(5, .4, 5) : vec(4.6, .4, 4), kind: 'flower', zone: mode === 'main' ? 5 : 1,
  };
  platforms.push(summit);
  return { id: `garden-${mode}-v1`, mode, height, start, anchors, platforms, summit, waters, rocks: makeRocks() };
}
