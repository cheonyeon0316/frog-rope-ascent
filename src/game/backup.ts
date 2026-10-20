import { validSave } from './simulation';
import { DEFAULT_SETTINGS, type Settings } from './storage';
import type { SaveState } from './types';

export interface Backup {
  format: 'frog-ascent-backup'; version: 1; createdAt: string;
  current: SaveState | null; previous: SaveState | null; best: number; settings: Settings;
}
export function parseBackup(text: string): Backup {
  if (text.length > 1_000_000) throw new Error('저장 파일이 너무 큽니다.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('JSON 저장 파일을 읽을 수 없습니다.'); }
  if (!data || typeof data !== 'object') throw new Error('게임 백업 파일이 아닙니다.');
  const b = data as Backup;
  if (b.format !== 'frog-ascent-backup' || b.version !== 1 || typeof b.createdAt !== 'string'
    || !Number.isFinite(b.best) || b.best < 0 || b.best > 200) throw new Error('지원하지 않는 백업 형식입니다.');
  for (const state of [b.current, b.previous]) {
    if (state !== null && (!validSave(state) || state.mode !== 'main' || !['garden-main-v1', 'ecosystem-main-v2'].includes(state.course)))
      throw new Error('현재 정원에서 불러올 수 없는 진행 상태입니다.');
  }
  const s = b.settings;
  if (!s || ['mute', 'assisted', 'toggle', 'motion'].some(key => typeof s[key as keyof Settings] !== 'boolean')
    || !Number.isFinite(s.volume) || s.volume < 0 || s.volume > 1 || !['low', 'high'].includes(s.quality))
    throw new Error('백업의 설정 값이 올바르지 않습니다.');
  return { format: b.format, version: 1, createdAt: b.createdAt, current: b.current, previous: b.previous,
    best: Math.max(b.best, b.current?.peak ?? 0), settings: { ...DEFAULT_SETTINGS, ...s } };
}
