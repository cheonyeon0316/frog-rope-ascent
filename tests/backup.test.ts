import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from '../src/game/simulation';
import { makeCourse } from '../src/game/course';
import { parseBackup, type Backup } from '../src/game/backup';
import { DEFAULT_SETTINGS } from '../src/game/storage';
beforeAll(async () => { await RAPIER.init(); });
function fixture(): Backup {
  const sim = new Simulation(makeCourse('main'));
  const state = sim.snapshot(); sim.dispose();
  return { format: 'frog-ascent-backup', version: 1, createdAt: new Date().toISOString(),
    current: state, previous: null, best: 12, settings: { ...DEFAULT_SETTINGS, volume: .2 } };
}
it('round-trips exact progress, moving phases, settings and best height', () => {
  const b = fixture(); expect(parseBackup(JSON.stringify(b))).toEqual(b);
});
it('accepts settings-only backup and finished runs', () => {
  const b = fixture(); b.current!.finished = true; expect(parseBackup(JSON.stringify(b)).current?.finished).toBe(true);
  b.current = null; expect(parseBackup(JSON.stringify(b)).current).toBeNull();
});
it('rejects corrupt, foreign, oversized and unsupported backup files', () => {
  for (const s of ['{', '{}', 'null', ' '.repeat(1_000_001), JSON.stringify({ ...fixture(), version: 2 })]) expect(() => parseBackup(s)).toThrow();
  const b = fixture(); b.current!.course = 'other'; expect(() => parseBackup(JSON.stringify(b))).toThrow();
});
it('rejects invalid settings and unsafe save positions without repairing them silently', () => {
  const b = fixture(); b.settings.volume = -1; expect(() => parseBackup(JSON.stringify(b))).toThrow();
  b.settings.volume = .5; b.current!.position.x = 200; expect(() => parseBackup(JSON.stringify(b))).toThrow();
});
