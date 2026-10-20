import { validSave } from './simulation';
import type { SaveState } from './types';
import type { Backup } from './backup';

export interface Settings { mute: boolean; volume: number; assisted: boolean; toggle: boolean; motion: boolean; quality: 'low' | 'high'; }
export const DEFAULT_SETTINGS: Settings = { mute: false, volume: .45, assisted: false, toggle: false, motion: true, quality: 'high' };
export class Store {
  private db: IDBDatabase | null = null;
  private running: Promise<void> | null = null;
  private pending: SaveState | null = null;
  settings: Settings = { ...DEFAULT_SETTINGS };
  best = 0;
  available = true;

  async init(): Promise<void> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('frog-ascent-local', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('states');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const settings = await this.get('settings') as Partial<Settings> | undefined;
      if (settings) this.settings = { ...DEFAULT_SETTINGS, ...settings };
      this.best = Number(await this.get('best')) || 0;
    } catch { this.available = false; }
  }

  private get(key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(undefined); return; }
      const request = this.db.transaction('states', 'readonly').objectStore('states').get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }

  async load(): Promise<SaveState | null> {
    try {
      const state = await this.get('current');
      if (validSave(state) && state.mode === 'main' && !state.finished) return state;
      return null;
    } catch { return null; }
  }

  save(state: SaveState): Promise<void> {
    if (state.mode === 'training' || !this.available) return Promise.resolve();
    this.pending = state;
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        while (this.pending) {
          const next = this.pending; this.pending = null;
          const old = await this.get('current');
          await this.transaction(store => { if (old) store.put(old, 'previous'); store.put(next, 'current'); store.put(Math.max(this.best, next.peak), 'best'); });
          this.best = Math.max(this.best, next.peak);
        }
      } finally { this.running = null; }
    })();
    return this.running;
  }

  async saveSettings(): Promise<void> {
    if (!this.available) return;
    try { await this.transaction(store => store.put(this.settings, 'settings')); } catch { /* settings failure must not reset progress */ }
  }
  async backup(fallback?: SaveState): Promise<Backup> {
    if (this.running) await this.running.catch(() => {});
    const current = fallback?.mode === 'main' ? fallback : await this.get('current');
    const previous = await this.get('previous');
    return { format: 'frog-ascent-backup', version: 1, createdAt: new Date().toISOString(),
      current: validSave(current) && current.mode === 'main' ? current : null,
      previous: validSave(previous) && previous.mode === 'main' ? previous : null,
      best: Math.max(this.best, validSave(current) ? current.peak : 0), settings: { ...this.settings } };
  }
  async importBackup(backup: Backup): Promise<void> {
    if (this.running) await this.running;
    const old = await this.get('current');
    // One transaction: a failed import never partially replaces the settings or progress.
    await this.transaction(store => {
      store.put(backup.current, 'current');
      store.put(validSave(old) ? old : backup.previous, 'previous');
      store.put(backup.best, 'best'); store.put(backup.settings, 'settings');
    });
    this.best = backup.best; this.settings = { ...backup.settings };
  }
  private transaction(write: (store: IDBObjectStore) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('이 브라우저에서 저장소를 사용할 수 없습니다.')); return; }
      const tx = this.db.transaction('states', 'readwrite');
      write(tx.objectStore('states'));
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('저장 공간을 확인해 주세요.'));
    });
  }
}
