import { expect, it } from 'vitest';
import { cameraRelativeAxes } from '../src/game/input';

it('maps forward and lateral input to the supplied camera yaw', () => {
  const baseYaw = .52;
  const forward = cameraRelativeAxes(0, 1, baseYaw);
  const right = cameraRelativeAxes(1, 0, baseYaw);
  expect(forward.x).toBeCloseTo(-Math.sin(baseYaw));
  expect(forward.z).toBeCloseTo(-Math.cos(baseYaw));
  expect(right.x).toBeCloseTo(Math.cos(baseYaw));
  expect(right.z).toBeCloseTo(-Math.sin(baseYaw));
});
