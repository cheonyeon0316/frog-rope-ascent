import { clamp, length, type Vec, vec } from './types';

export const SWING_CONFIG = {
  baseKick: 3,
  maxKick: 4,
  alignmentBonus: 1,
  minSwingSpeed: 1.1,
  inputSteering: .38,
  maxAddedWork: 48,
  duration: .34,
};

export interface EatSwingKick {
  direction: Vec;
  speedDelta: number;
  swingAlignment: number;
}

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const projectTangent = (value: Vec, normal: Vec): Vec => {
  const radial = dot(value, normal);
  return vec(value.x - normal.x * radial, value.y - normal.y * radial, value.z - normal.z * radial);
};
const normalized = (value: Vec): Vec | null => {
  const magnitude = length(value);
  return magnitude > 1e-7 && Number.isFinite(magnitude)
    ? vec(value.x / magnitude, value.y / magnitude, value.z / magnitude)
    : null;
};

function stableHorizontalTangent(normal: Vec): Vec {
  const axes = [vec(1, 0, 0), vec(0, 0, 1)];
  axes.sort((a, b) => Math.abs(dot(a, normal)) - Math.abs(dot(b, normal)));
  return normalized(projectTangent(axes[0], normal)) ?? vec(1, 0, 0);
}

/** Calculate a one-shot tether-tangent velocity impulse; it never steers toward the food. */
export function calculateEatSwingKick(velocity: Vec, ropeToAnchor: Vec, movement: Vec, cameraForward: Vec): EatSwingKick {
  const normal = normalized(ropeToAnchor) ?? vec(0, 1, 0);
  const tangentVelocity = projectTangent(velocity, normal);
  const tangentialSpeed = length(tangentVelocity);
  const movementTangent = projectTangent(movement, normal);
  const movementTangentSpeed = length(movementTangent);
  let direction: Vec;
  let drive = 1;
  let swingAlignment = 0;

  if (tangentialSpeed >= SWING_CONFIG.minSwingSpeed) {
    const swingDirection = normalized(tangentVelocity)!;
    direction = normalized(vec(
      swingDirection.x + movementTangent.x * SWING_CONFIG.inputSteering,
      swingDirection.y + movementTangent.y * SWING_CONFIG.inputSteering,
      swingDirection.z + movementTangent.z * SWING_CONFIG.inputSteering,
    )) ?? swingDirection;
    swingAlignment = clamp(dot(direction, swingDirection), 0, 1);
  } else if (length(movement) > .08) {
    // Analog input parallel to the rope has almost no tangent authority, so it cannot
    // accidentally become a full-strength kick after a normalize operation.
    drive = clamp(movementTangentSpeed, 0, 1);
    direction = normalized(movementTangent)
      ?? normalized(projectTangent(cameraForward, normal))
      ?? stableHorizontalTangent(normal);
  } else {
    direction = normalized(projectTangent(cameraForward, normal)) ?? stableHorizontalTangent(normal);
  }

  const requested = Math.min(SWING_CONFIG.maxKick,
    SWING_CONFIG.baseKick * drive + SWING_CONFIG.alignmentBonus * swingAlignment);
  const alongSpeed = dot(velocity, direction);
  const workLimited = Math.max(0, -alongSpeed + Math.sqrt(alongSpeed * alongSpeed + 2 * SWING_CONFIG.maxAddedWork));
  return { direction, speedDelta: Math.min(requested, workLimited), swingAlignment };
}
