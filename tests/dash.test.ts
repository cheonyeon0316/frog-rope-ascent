import { expect, it } from 'vitest';
import { calculateEatSwingKick, SWING_CONFIG } from '../src/game/swing';
import { length, vec } from '../src/game/types';

const dot = (a: ReturnType<typeof vec>, b: ReturnType<typeof vec>) => a.x*b.x + a.y*b.y + a.z*b.z;

it('adds kick along existing rope-tangent swing and never toward the food', () => {
  const rope = vec(0, 1, 0), velocity = vec(8, -3, 0);
  const kick = calculateEatSwingKick(velocity, rope, vec(0, 0, 0), vec(0, 0, -1));
  expect(kick.speedDelta).toBeGreaterThan(0);
  expect(kick.speedDelta).toBeLessThanOrEqual(SWING_CONFIG.maxKick);
  expect(Math.abs(dot(kick.direction, rope))).toBeLessThan(1e-6);
  expect(dot(kick.direction, velocity)).toBeGreaterThan(0);
});

it('uses movement and camera tangent when hanging still, with no radial kick', () => {
  const rope = vec(0, 1, 0);
  const steered = calculateEatSwingKick(vec(0, 0, 0), rope, vec(1, 0, 0), vec(0, 0, -1));
  expect(steered.direction.x).toBeCloseTo(1);
  expect(steered.speedDelta).toBeCloseTo(SWING_CONFIG.baseKick);
  expect(Math.abs(dot(steered.direction, rope))).toBeLessThan(1e-6);
  const parallelInput = calculateEatSwingKick(vec(0, 0, 0), vec(1, 0, 0), vec(1, 0, 0), vec(0, 0, -1));
  expect(parallelInput.speedDelta).toBeLessThan(SWING_CONFIG.baseKick);
  expect(Number.isFinite(length(parallelInput.direction))).toBe(true);
});

it('keeps existing high speed and limits only added work', () => {
  const falling = calculateEatSwingKick(vec(0, -25, 0), vec(0, 1, 0), vec(1, 0, 0), vec(0, 0, -1));
  expect(falling.speedDelta).toBeGreaterThan(0);
  expect(falling.speedDelta).toBeLessThanOrEqual(SWING_CONFIG.maxKick);
  expect(falling.direction.y).toBeCloseTo(0);
  const perpendicular = calculateEatSwingKick(vec(0, 0, 0), vec(1, 0, 0), vec(0, 0, 1), vec(0, 0, -1));
  const addedWork = perpendicular.speedDelta ** 2 / 2;
  expect(addedWork).toBeLessThanOrEqual(SWING_CONFIG.maxAddedWork + 1e-6);
});

it('handles degenerate rope and inputs with a finite stable direction', () => {
  const kick = calculateEatSwingKick(vec(), vec(), vec(), vec());
  expect([kick.direction.x, kick.direction.y, kick.direction.z, kick.speedDelta].every(Number.isFinite)).toBe(true);
  expect(length(kick.direction)).toBeCloseTo(1);
});
