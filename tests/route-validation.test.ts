import { it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from '../src/game/simulation';
import { makeCourse } from '../src/game/course';
import { distance, type Controls, type Mode } from '../src/game/types';

beforeAll(async () => { await RAPIER.init(); });

for (const mode of ['training', 'main'] as Mode[]) {
  it(`${mode}: starts from ground, pumps a swing and reconnects higher using inputs only`, () => {
    const s = new Simulation(makeCourse(mode));
    const first = mode === 'training' ? 'fly-0' : 'fly-1-a';
    const higher = mode === 'training' ? s.course.anchors.find(a => a.id === 'fly-1')! : s.course.anchors.find(a => a.id === s.course.route![0].launch)!;
    const idle: Controls = { x: 0, z: 0, jump: false, grapplePress: false, grappleRelease: false };
    let reconnectNext = false, connectedHigher = false;
    for (let tick = 0; tick < 120 * 16; tick++) {
      const p = s.position, v = s.velocity;
      const control: Controls = { ...idle, x: v.x <= .02 ? -1 : 1, jump: tick === 0 };
      let target: string | null = null;
      if (tick === 20) { control.grapplePress = true; target = first; }
      if (reconnectNext) { control.grapplePress = true; target = higher.id; reconnectNext = false; }
      else if (!connectedHigher && s.attached === first && distance(p, higher.position) < 9.5 && p.y > s.course.start.y + 2.4 && !s.blocked(p, higher.position)) {
        control.grappleRelease = true; reconnectNext = true;
      }
      s.step(control, target);
      connectedHigher ||= s.attached === higher.id;
      if (connectedHigher && s.peak > 5.5) break;
    }
    console.log(JSON.stringify({ mode, peak: s.peak, connectedHigher }));
    expect(connectedHigher).toBe(true);
    expect(s.peak).toBeGreaterThan(3.5);
    s.dispose();
  });
}
