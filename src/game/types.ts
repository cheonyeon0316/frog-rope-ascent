export interface Vec { x: number; y: number; z: number }
export type Mode = 'main' | 'training';
export type Session = 'menu' | 'playing' | 'paused' | 'complete' | 'error';
export type Food = 'fruit-fly' | 'fly' | 'beetle' | 'pollen' | 'bee' | 'moth' | 'dew' | 'stardust';
export interface Anchor { id: string; position: Vec; zone: number; recovery: boolean; food?: Food; transition?: boolean; motion?: { amplitude: Vec; period: number; phase: number } }
export type Landform = 'leaf' | 'petal' | 'stone' | 'branch' | 'root' | 'cloud';
export interface Platform { id: string; position: Vec; size: Vec; zone: number; kind: 'leaf' | 'pot' | 'wood' | 'metal' | 'flower' | 'ground' | 'terrace' | 'grass' | 'rock' | 'petal' | 'branch' | 'cloud' | 'star'; recovery?: boolean; bounce?: number; refuge?: string; round?: boolean; form?: Landform; rotation?: Vec; bend?: number; color?: string }
export interface CourseBeat { platform: string; launch: string; arrival?: string; name: string; zone: number }
export interface Biome { id: string; name: string; start: number; end: number; center: Vec; kind: Platform['kind']; foods: Food[]; sky: string; color: string }
export interface Solid { position: Vec; radius: number; height: number; kind: 'trunk' | 'stem' | 'grass'; direction?: Vec }
export interface Landscape { position: Vec; size: Vec; resolution: number; heights: number[]; zone: number; round?: boolean }
export interface WaterVolume { id: string; position: Vec; radius: number }
export interface Rock { position: Vec; size: Vec }
export interface Course { id: string; mode: Mode; height: number; start: Vec; anchors: Anchor[]; platforms: Platform[]; summit: Platform; waters?: WaterVolume[]; rocks?: Rock[]; biomes?: Biome[]; solids?: Solid[]; landscapes?: Landscape[]; bounds?: number; route?: CourseBeat[] }
export interface Controls { x: number; z: number; jump: boolean; grapplePress: boolean; grappleRelease: boolean; swim?: number }
export interface GameEvent { type: 'shoot' | 'catch' | 'release' | 'eat' | 'touch' | 'dash' | 'water-enter' | 'water-exit' | 'bounce' | 'miss' | 'blocked' | 'land' | 'recovery' | 'fall' | 'reset' | 'summit'; position: Vec; anchor?: string; speed?: number; reason?: string }
export interface DashState { remaining: number; direction: Vec; kind?: 'release' | 'launch'; duration?: number; distance?: number; travelled?: number; anchor?: string; origin?: Vec; targetPosition?: Vec }
export interface FlyLife { phase: 'alive' | 'retracting' | 'hidden' | 'respawning'; elapsed: number; remaining: number }
export interface SaveState {
  version: 1; course: string; mode: Mode; position: Vec; velocity: Vec;
  attached: string | null; length: number; peak: number; time: number; falls: number;
  tick: number; finished: boolean;
  eatenFlies?: { id: string; remaining: number }[];
  dash?: DashState;
  anchorPhases?: { id: string; time: number }[];
}
export const vec = (x = 0, y = 0, z = 0): Vec => ({ x, y, z });
export const length = (v: Vec) => Math.hypot(v.x, v.y, v.z);
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const ZONES = ['웅덩이 가장자리', '화분 정원', '도구 선반', '덩굴 온실', '거대한 수관', '정상 꽃'];
export const COLORS = ['#769c53', '#b9835e', '#658b84', '#568263', '#608c50', '#d9a2a6'];
export const FOOD_NAMES: Record<Food, string> = { 'fruit-fly': '초파리', fly: '파리', beetle: '풍뎅이', pollen: '꽃가루', bee: '벌', moth: '나방', dew: '이슬', stardust: '별가루' };
