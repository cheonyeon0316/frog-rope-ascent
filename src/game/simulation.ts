import RAPIER from '@dimforge/rapier3d-compat';
import { vec, length, distance, clamp, type Vec, type Course, type Controls, type Anchor, type GameEvent, type SaveState, type FlyLife, type ImpulseState, type LegacyDashState } from './types';
import { movingAnchorPosition, waterAt, WATER_CONFIG, rockHull, cylinderRotation, landscapeMesh, starMesh, cloudClumps, platformMesh, platformRotation } from './environment';
import { SWING_CONFIG } from './swing';
import { WORLD_SCALE } from './ecosystem-v5';

export const DT = 1 / 120;
export const CONFIG = { gravity: 18, range: 10, minRange: .75, aimAngle: 8, swingAccel: 25.5, airAccel: 2.5, inputSpeed: 24, jump: 7.5 };
export const FLY_TIMING = { retract: .32, swallow: .22, respawn: 3, appear: .25 };
export const RELEASE_CONFIG = { boost: 3.5, duration: .16, maxBoostedSpeed: 16 };
const LEGACY_LAUNCH_SAVE = { duration: .3, minDuration: .1, maxDuration: 1.7 };
export const LAUNCH_CONFIG = { speed: 8, arrivalSpeed: 3, cruiseSpeed: 7.2, minDuration: .1, maxDuration: 1.7, maxSpeed: 16 };
const LONG_LEVEL_COURSE = 'ecosystem-main-v5';
const LONG_LEVEL_RANGE = 12;
const WELL_TUTORIAL_AIM_ANGLE = 26;
const WELL_INTERIOR_RADIUS = 8.3;
const PLACED_ROUTE_COURSES = new WeakSet<Course>();
const copy = (p: Vec): Vec => vec(p.x, p.y, p.z);
function landscapeHeightAt(land: NonNullable<Course['landscapes']>[number], x: number, z: number): number {
  const resolution = land.resolution, stride = resolution + 1;
  const gx = clamp((x - land.position.x) / land.size.x + .5, 0, 1) * resolution;
  const gz = clamp((z - land.position.z) / land.size.z + .5, 0, 1) * resolution;
  const x0 = Math.min(resolution - 1, Math.floor(gx)), z0 = Math.min(resolution - 1, Math.floor(gz));
  const fx = gx - x0, fz = gz - z0;
  const h00 = land.heights[x0 * stride + z0], h10 = land.heights[(x0 + 1) * stride + z0];
  const h01 = land.heights[x0 * stride + z0 + 1], h11 = land.heights[(x0 + 1) * stride + z0 + 1];
  return land.position.y + (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
}
function launchCurve(t: number, duration: number, distance: number) {
  const start = LAUNCH_CONFIG.speed * duration / distance;
  const end = LAUNCH_CONFIG.arrivalSpeed * duration / distance;
  const a = -2 + start + end, b = 3 - 2 * start - end, c = start;
  const progress = ((a * t + b) * t + c) * t;
  return { progress, rate: (3 * a * t * t + 2 * b * t + c) / duration };
}
function launchPathVelocity(origin: Vec, destination: Vec, t: number, duration: number, distance: number): Vec {
  const { progress, rate } = launchCurve(t, duration, distance);
  const arc = clamp(distance * .12, .3, 1.1);
  return vec((destination.x - origin.x) * rate,
    (destination.y - origin.y) * rate + 4 * arc * (1 - 2 * progress) * rate,
    (destination.z - origin.z) * rate);
}

export class Simulation {
  readonly world: RAPIER.World;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private anchors = new Map<string, { definition: Anchor; body: RAPIER.RigidBody }>();
  private anchorTouchSensors = new Map<string, RAPIER.Collider>();
  private touchingAnchors = new Set<string>();
  private joint: RAPIER.ImpulseJoint | null = null;
  private surfaces = new Map<number, Course['platforms'][number]>();
  private footProbe = new RAPIER.Ball(.28);
  private eatenFlies = new Map<string, number>();
  private impulseUntil = 0;
  private impulseDirection = vec();
  private impulseKind: ImpulseState['kind'] = 'release';
  private impulseDuration = RELEASE_CONFIG.duration;
  private dashUntil = 0;
  private dashDirection = vec();
  private launchDistance = 0;
  private launchTravelled = 0;
  private launchElapsed = 0;
  private launchDuration = .3;
  private launchStart: Vec | null = null;
  private launchEnd: Vec | null = null;
  private launchTarget: string | null = null;
  private previousWater: string | null = null;
  private anchorPhases = new Map<string, number>();
  readonly events: GameEvent[] = [];
  attached: string | null = null;
  ropeLength = 0;
  grounded = false;
  peak = 0;
  time = 0;
  tick = 0;
  falls = 0;
  finished = false;
  private wasGrounded = false;
  private coyote = 0;
  private jumpBuffer = 0;
  private landingHold = 0;
  private fallHold = 0;
  private falling = false;
  private lastLandTime = -1;
  private ropeRange = CONFIG.range;
  private wellSurfaceY: number | null = null;
  private wellExitCheckpoint: Vec | null = null;
  private wellGateCollider: RAPIER.Collider | null = null;

  constructor(readonly course: Course) {
    this.ropeRange = course.id === LONG_LEVEL_COURSE ? LONG_LEVEL_RANGE : CONFIG.range;
    this.world = new RAPIER.World(vec(0, -CONFIG.gravity, 0));
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 12;
    for (const p of course.platforms) {
      const rigid = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.position.x, p.position.y, p.position.z).setRotation(platformRotation(p.rotation)));
      if (p.form) {
        const data = platformMesh(p);
        const collider = this.world.createCollider(RAPIER.ColliderDesc.trimesh(data.vertices, data.indices).setFriction(.65), rigid);
        this.surfaces.set(collider.handle, p);
        continue;
      }
      if (p.kind === 'cloud' && !p.refuge) {
        for (const clump of cloudClumps(p.size)) this.world.createCollider(RAPIER.ColliderDesc.convexHull(rockHull(clump.size))!
          .setTranslation(clump.position.x, clump.position.y, clump.position.z).setFriction(.65), rigid);
        continue;
      }
      const mesh = p.kind === 'star' && !p.refuge ? starMesh(p.size) : null;
      const refugeRadius = p.refuge && course.id === 'ecosystem-main-v2' ? Math.min(5, p.size.x / 2) : p.size.x / 2;
      const shape = mesh ? RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices) : p.round
        ? RAPIER.ColliderDesc.cylinder(p.size.y / 2, refugeRadius) : RAPIER.ColliderDesc.cuboid(p.size.x / 2, p.size.y / 2, p.size.z / 2);
      this.world.createCollider(shape.setFriction(.65).setRestitution(.03), rigid);
      if (p.kind === 'pot') this.world.createCollider(RAPIER.ColliderDesc.cylinder(.8, Math.min(p.size.x, p.size.z) * .43).setTranslation(0, -.95, 0).setFriction(.6), rigid);
    }
    if (course.id === LONG_LEVEL_COURSE) {
      const ground = course.landscapes?.find(land => land.zone === 0);
      if (ground) this.wellSurfaceY = landscapeHeightAt(ground, course.start.x + 5.6 * WORLD_SCALE, course.start.z);
    }
    for (const rock of course.rocks ?? []) {
      if (this.isStartingWellObstruction(rock.position)) continue;
      const desc = RAPIER.ColliderDesc.convexHull(rockHull(rock.size));
      if (desc) this.world.createCollider(desc.setTranslation(rock.position.x, rock.position.y, rock.position.z).setFriction(.6));
    }
    // A visible central trunk is a real obstacle too.
    if (course.id === 'garden-main-v1') {
      const trunk = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 88, 0));
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(88, .8).setFriction(.6), trunk);
    }
    for (const solid of course.solids ?? []) {
      if (this.isStartingWellObstruction(solid.position) || solid.kind === 'grass') continue;
      // Tall ornamental reeds/stems stay visible but must not form invisible
      // walls across the denser scaled route.
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(solid.height / 2, solid.radius)
        .setTranslation(solid.position.x, solid.position.y, solid.position.z)
        .setRotation(cylinderRotation(solid.direction ?? vec(0, 1, 0))).setFriction(.6));
    }
    for (const land of course.landscapes ?? []) {
      const mesh = landscapeMesh(land);
      this.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices)
        .setTranslation(land.position.x, land.position.y, land.position.z).setFriction(.6));
    }
    if (course.id === LONG_LEVEL_COURSE) {
      const ground = course.landscapes?.find(land => land.zone === 0);
      if (ground) {
        const surfaceY = this.wellSurfaceY ?? landscapeHeightAt(ground, course.start.x + 5.6 * WORLD_SCALE, course.start.z);
        this.wellSurfaceY = surfaceY;
        const gateBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
        this.wellGateCollider = this.world.createCollider(RAPIER.ColliderDesc.cylinder(.14, 9.82)
          .setTranslation(course.start.x, surfaceY + .08, course.start.z).setFriction(.65), gateBody);
        this.wellGateCollider.setEnabled(false);
        const exitPad = course.platforms.find(platform => platform.id === 'pad-2');
        if (exitPad) this.wellExitCheckpoint = vec(exitPad.position.x,
          exitPad.position.y + exitPad.size.y / 2 + .42, exitPad.position.z);
        const bottomY = course.start.y - .95 * WORLD_SCALE;
        const depth = surfaceY - bottomY;
        const segments = 40, wallRadius = 4.15 * WORLD_SCALE, halfThickness = .32 * WORLD_SCALE;
        const halfTangent = wallRadius * Math.sin(Math.PI / segments) + .045;
        for (let i = 0; i < segments; i++) {
          const angle = i * Math.PI * 2 / segments;
          const rotation = { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
          this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfTangent, depth / 2, halfThickness)
            .setTranslation(course.start.x + Math.sin(angle) * wallRadius, bottomY + depth / 2, course.start.z + Math.cos(angle) * wallRadius)
            .setRotation(rotation).setFriction(.6));
        }
      }
    }
    for (const a of course.anchors) {
      const p = movingAnchorPosition(a, 0);
      const description = a.motion ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
      const body = this.world.createRigidBody(description.setTranslation(p.x, p.y, p.z));
      // Food is a sensor: frog-body contact is registered without bumping the
      // flight or making the edible anchor obstruct its own tongue ray.
      const radius = a.food === 'bee' || a.food === 'moth' ? .34 : .28;
      const touch = this.world.createCollider(RAPIER.ColliderDesc.ball(radius).setSensor(true), body);
      this.anchorTouchSensors.set(a.id, touch);
      this.anchors.set(a.id, { definition: a, body });
      if (a.motion) this.anchorPhases.set(a.id, 0);
    }
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(course.start.x, course.start.y, course.start.z)
      .lockRotations().setCcdEnabled(true).setLinearDamping(.04).setCanSleep(false));
    // Ground acceleration/braking is controlled below. Contact friction must not glue the frog to walls or lips.
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(.1, .3).setDensity(1).setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(.03), this.body);
    this.body.setAdditionalMass(Math.max(0, 1 - this.body.mass()), true);
    this.world.step();
    if (course.id === LONG_LEVEL_COURSE && !PLACED_ROUTE_COURSES.has(course)) {
      this.placeRouteFood();
      PLACED_ROUTE_COURSES.add(course);
      this.world.step();
    }
    this.grounded = this.probeGround();
    this.previousWater = this.water?.volume.id ?? null;
  }

  get position(): Vec { return copy(this.body.translation()); }
  get velocity(): Vec { return copy(this.body.linvel()); }
  get height(): number { return Math.max(0, this.body.translation().y - this.course.start.y); }

  private get wellTutorialActive(): boolean {
    return this.wellSurfaceY !== null && this.position.y < this.wellSurfaceY + .5;
  }

  private get wellTutorialCleared(): boolean {
    return this.wellSurfaceY !== null && this.peak >= this.wellSurfaceY - this.course.start.y + .25;
  }

  get wellLocked(): boolean { return this.wellTutorialCleared; }

  private isStartingWellObstruction(position: Vec): boolean {
    if (this.course.id !== LONG_LEVEL_COURSE || this.wellSurfaceY === null) return false;
    const inside = Math.hypot(position.x - this.course.start.x, position.z - this.course.start.z) < WELL_INTERIOR_RADIUS;
    return inside && position.y < this.wellSurfaceY && position.y > this.course.start.y - 1.2 * WORLD_SCALE;
  }

  private secureWellExit(): void {
    if (!this.wellTutorialCleared) return;
    this.wellGateCollider?.setEnabled(true);
    if (this.wellSurfaceY === null || !this.wellExitCheckpoint) return;
    const p = this.position;
    const insideOpening = Math.hypot(p.x - this.course.start.x, p.z - this.course.start.z) < 9.82;
    if (!insideOpening || p.y >= this.wellSurfaceY + .3) return;
    this.release('reset');
    this.body.setTranslation(this.wellExitCheckpoint, true);
    this.body.setLinvel(vec(), true);
    this.fallHold = 0; this.falling = false; this.coyote = 0; this.jumpBuffer = 0;
    this.events.push({ type: 'recovery', position: this.position, reason: 'well-tutorial-exit' });
  }

  private placeRouteFood() {
    const route = this.course.route ?? [];
    const place = (id: string, platformId: string, partnerId?: string) => {
      const entry = this.anchors.get(id), platform = this.course.platforms.find(item => item.id === platformId);
      if (!entry || !platform) return;
      const partner = partnerId ? this.anchors.get(partnerId)?.definition.position : undefined;
      const top = platform.position.y + platform.size.y / 2;
      const stand = vec(platform.position.x, top + .4, platform.position.z);
      const original = copy(entry.definition.position);
      const candidates: Vec[] = [original];
      for (const height of [4, 6.5, 9]) for (const radius of [2, 5, 8]) for (let step = 0; step < 8; step++) {
        const angle = step * Math.PI / 4;
        candidates.push(vec(platform.position.x + Math.cos(angle) * radius, top + height, platform.position.z + Math.sin(angle) * radius));
      }
      candidates.sort((a, b) => distance(a, original) - distance(b, original));
      const point = candidates.find(candidate => distance(stand, candidate) < this.ropeRange - 1.1
        && (!partner || distance(partner, candidate) < this.ropeRange - 1.1) && !this.blocked(stand, candidate));
      if (!point) return;
      // Keep the authored origin compensated for its phase-zero motion offset.
      // Recreated simulations then begin at the same tested, unobstructed catch.
      const phaseZero = movingAnchorPosition(entry.definition, 0);
      entry.definition.position = vec(point.x - (phaseZero.x - original.x),
        point.y - (phaseZero.y - original.y), point.z - (phaseZero.z - original.z));
      entry.body.setTranslation(point, true);
    };
    for (let index = 0; index < route.length - 1; index++) {
      place(route[index].launch, route[index].platform);
      if (route[index].arrival) place(route[index].arrival!, route[index + 1].platform, route[index].launch);
    }
  }
  get biome() {
    const p = this.position;
    const land = [...(this.course.landscapes ?? [])].reverse().find(l => Math.abs(p.x - l.position.x) <= l.size.x / 2
      && Math.abs(p.z - l.position.z) <= l.size.z / 2 && p.y >= l.position.y - 3.5 && p.y < l.position.y + 4.5);
    return land ? this.course.biomes?.[land.zone] : this.course.biomes?.find(b => p.y >= b.start && (p.y < b.end || b.end === this.course.height));
  }
  get zone(): number { return this.biome ? this.course.biomes!.indexOf(this.biome) : Math.min(5, Math.floor(this.height / 30)); }
  get refuge() {
    if (!this.grounded) return undefined;
    const p = this.position;
    if (this.course.route) {
      const hit = this.world.castRay(new RAPIER.Ray(p, vec(0,-1,0)), .8, true, undefined, undefined, this.collider, this.body);
      const surface = hit && this.surfaces.get(hit.collider.handle);
      if (surface?.refuge) return surface;
      // A route leaf can sit just above a broad recovery landform. Treat that
      // shallow overlap as the same safe ecosystem floor when the frog lands on it.
      if (surface) return this.course.platforms.find(refuge => refuge.refuge && refuge.zone === surface.zone
        && Math.abs(p.x - refuge.position.x) <= refuge.size.x / 2
        && Math.abs(p.z - refuge.position.z) <= refuge.size.z / 2
        && Math.abs((surface.position.y + surface.size.y / 2) - (refuge.position.y + refuge.size.y / 2)) <= .75);
      return undefined;
    }
    const land = this.course.landscapes?.find(l => Math.abs(p.x - l.position.x) <= l.size.x / 2
      && Math.abs(p.z - l.position.z) <= l.size.z / 2 && p.y >= l.position.y - 3.5 && p.y < l.position.y + 4.5);
    if (land) return this.course.platforms.find(surface => surface.refuge && surface.zone === land.zone);
    return this.course.platforms.find(surface => surface.refuge
      && Math.abs(p.x - surface.position.x) <= surface.size.x / 2
      && Math.abs(p.z - surface.position.z) <= surface.size.z / 2
      && Math.abs(p.y - (surface.position.y + surface.size.y / 2 + .4)) < .2);
  }
  get anchor(): Anchor | null {
    const a = this.attached ? this.anchors.get(this.attached) : null;
    return a ? { ...a.definition, position: copy(a.body.translation()) } : null;
  }
  anchorPosition(id: string): Vec | null { const a = this.anchors.get(id); return a ? copy(a.body.translation()) : null; }
  get water() { return waterAt(this.position, this.course.waters); }
  get impulse(): ImpulseState | undefined {
    const remaining = this.impulseUntil - this.time;
    return remaining > 0 ? { remaining, direction: copy(this.impulseDirection), kind: this.impulseKind, duration: this.impulseDuration } : undefined;
  }
  get dash(): LegacyDashState | undefined {
    const remaining = this.dashUntil - this.time;
    return remaining > 0 ? { remaining, direction: copy(this.dashDirection), kind: 'launch', duration: this.launchDuration,
      distance: this.launchDistance, travelled: this.launchTravelled, anchor: this.launchTarget ?? undefined,
      ...(this.launchStart && this.launchEnd ? { origin: copy(this.launchStart), targetPosition: copy(this.launchEnd) } : {}) } : undefined;
  }

  flyLife(id: string): FlyLife {
    const remaining = Math.max(0, (this.eatenFlies.get(id) ?? 0) - this.time);
    if (remaining <= 0) return { phase: 'alive', elapsed: 0, remaining: 0 };
    const elapsed = FLY_TIMING.respawn - remaining;
    return { phase: elapsed < FLY_TIMING.retract ? 'retracting' : remaining <= FLY_TIMING.appear ? 'respawning' : 'hidden', elapsed, remaining };
  }

  blocked(a: Vec, b: Vec): boolean {
    // The tongue starts above the frog's center, at its mouth. Raising the ray
    // origin avoids treating the supporting surface under the frog as a wall.
    const origin = vec(a.x, a.y + .32, a.z);
    const d = distance(origin, b);
    if (d < .02) return false;
    const dir = vec((b.x - origin.x) / d, (b.y - origin.y) / d, (b.z - origin.z) / d);
    return this.world.castRay(new RAPIER.Ray(origin, dir), Math.max(0, d - .04), true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider, this.body) !== null;
  }

  selectTarget(camera: Vec, direction: Vec, assisted = false): Anchor | null {
    const p = this.position;
    const aimAngle = this.wellTutorialActive ? WELL_TUTORIAL_AIM_ANGLE : assisted ? 12 : CONFIG.aimAngle;
    const limit = Math.cos(aimAngle * Math.PI / 180);
    let best: { anchor: Anchor; alignment: number; distance: number } | null = null;
    for (const a of this.course.anchors) {
      if (this.flyLife(a.id).phase !== 'alive') continue;
      const current = { ...a, position: this.anchorPosition(a.id)! };
      const d = distance(p, current.position);
      if (d < CONFIG.minRange || d > this.ropeRange) continue;
      const c = distance(camera, current.position);
      const alignment = ((current.position.x - camera.x) * direction.x + (current.position.y - camera.y) * direction.y + (current.position.z - camera.z) * direction.z) / c;
      if (alignment < limit || this.blocked(p, current.position)) continue;
      if (!best || alignment > best.alignment + 1e-6 || Math.abs(alignment - best.alignment) < 1e-6 && (d < best.distance - .001 || Math.abs(d - best.distance) < .001 && a.id < best.anchor.id)) best = { anchor: current, alignment, distance: d };
    }
    return best?.anchor ?? null;
  }

  attach(id: string): boolean {
    if (this.attached) return false;
    const a = this.anchors.get(id);
    const point = a ? copy(a.body.translation()) : vec();
    const d = a ? distance(this.position, point) : 0;
    if (!a || this.flyLife(id).phase !== 'alive' || d < CONFIG.minRange || d > this.ropeRange || this.blocked(this.position, point)) return false;
    this.ropeLength = d;
    this.joint = this.world.createImpulseJoint(RAPIER.JointData.rope(d, vec(), vec()), this.body, a.body, true);
    this.attached = id;
    this.events.push({ type: 'shoot', position: this.position, anchor: id }, { type: this.falling ? 'recovery' : 'catch', position: this.position, anchor: id });
    this.falling = false;
    this.fallHold = 0;
    return true;
  }

  release(reason: 'manual' | 'launch' | 'blocked' | 'reset' | 'restore' = 'manual', duringStep = false): void {
    if (!this.joint) return;
    const anchorId = this.attached;
    const fly = this.anchor;
    this.world.removeImpulseJoint(this.joint, true);
    this.joint = null;
    this.events.push({ type: reason === 'blocked' ? 'blocked' : 'release', position: this.position, anchor: anchorId ?? undefined });
    if ((reason === 'manual' || reason === 'launch') && anchorId) {
      // Keep the opening catches available for immediate retries while the frog
      // is still learning the rope controls inside the well.
      if (!this.wellTutorialActive) this.eatenFlies.set(anchorId, this.time + FLY_TIMING.respawn);
      this.events.push({ type: 'eat', position: this.position, anchor: anchorId });
      if (fly) {
        const p = this.position, v = this.velocity, d = distance(p, fly.position);
        if (d > .001) {
          const n = vec((fly.position.x - p.x) / d, (fly.position.y - p.y) / d, (fly.position.z - p.z) / d);
          if (reason === 'launch') {
            const duration = clamp(d / (LAUNCH_CONFIG.cruiseSpeed * .9), LAUNCH_CONFIG.minDuration, LAUNCH_CONFIG.maxDuration);
            const destination = copy(fly.position);
            const launchVelocity = launchPathVelocity(p, destination, 0, duration, d);
            const launchSpeed = Math.min(LAUNCH_CONFIG.maxSpeed, length(launchVelocity));
            const scale = length(launchVelocity) > LAUNCH_CONFIG.maxSpeed ? LAUNCH_CONFIG.maxSpeed / length(launchVelocity) : 1;
            this.body.setLinvel(vec(launchVelocity.x * scale, launchVelocity.y * scale, launchVelocity.z * scale), true);
            this.dashDirection = launchSpeed > .001 ? vec(launchVelocity.x / length(launchVelocity), launchVelocity.y / length(launchVelocity), launchVelocity.z / length(launchVelocity)) : vec(0, 1, 0);
            this.dashUntil = this.time + duration - (duringStep ? DT : 0);
            this.launchDistance = d; this.launchTravelled = 0; this.launchElapsed = 0; this.launchDuration = duration;
            this.launchStart = copy(p); this.launchEnd = destination; this.launchTarget = anchorId;
            this.events.push({ type: 'swing', position: p, anchor: anchorId, speed: launchSpeed, reason: 'launch', direction: this.dashDirection });
          } else {
            // Manual tongue release retains its gentler food-side nudge. Existing fast
            // falls and swings are preserved; only the added work is limited.
            const speed = length(v), toward = v.x * n.x + v.y * n.y + v.z * n.z;
            const limit = Math.max(RELEASE_CONFIG.maxBoostedSpeed, speed);
            const budget = Math.max(0, -toward + Math.sqrt(toward * toward + Math.max(0, limit * limit - speed * speed)));
            const boost = Math.min(RELEASE_CONFIG.boost, budget);
            if (boost > .001) {
              const mass = this.body.mass();
              this.body.applyImpulse(vec(n.x * boost * mass, n.y * boost * mass, n.z * boost * mass), true);
              this.impulseKind = 'release'; this.impulseDirection = n; this.impulseDuration = RELEASE_CONFIG.duration;
              this.impulseUntil = this.time + RELEASE_CONFIG.duration - (duringStep ? DT : 0);
              this.events.push({ type: 'swing', position: p, anchor: anchorId, speed: boost, reason: 'release', direction: n });
            }
          }
        }
      }
    }
    this.attached = null;
    this.ropeLength = 0;
  }

  private probeGround(): boolean {
    if (this.velocity.y >= 1) return false;
    const p = this.position;
    const minNormal = Math.cos(50 * Math.PI / 180);
    let supported = false;
    // A capsule can rest on an edge while its center ray is outside the platform.
    this.world.contactPairsWith(this.collider, surface => {
      if (supported || surface.isSensor()) return;
      const contact = this.collider.contactCollider(surface, .025);
      if (contact && contact.normal2.y > minNormal && contact.point1.y < p.y - .08) supported = true;
    });
    if (supported) return true;
    // Sweep the lower hemisphere for the small landing/coyote gap, not a single point.
    const hit = this.world.castShape(vec(p.x, p.y - .1, p.z), { x: 0, y: 0, z: 0, w: 1 }, vec(0, -1, 0),
      this.footProbe, 0, .1, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider, this.body);
    return !!hit && hit.normal1.y > minNormal;
  }

  step(input: Controls, target: string | null): void {
    if (this.finished) return;
    this.tick++;
    this.time += DT;
    for (const [id, until] of this.eatenFlies) if (until <= this.time) this.eatenFlies.delete(id);
    for (const [id, sensor] of this.anchorTouchSensors) sensor.setEnabled(this.flyLife(id).phase !== 'hidden');
    this.grounded = this.probeGround();
    this.coyote = this.grounded ? .08 : Math.max(0, this.coyote - DT);
    const launch = input.jump && !!this.attached;
    if (launch) { this.release('launch', true); this.jumpBuffer = 0; this.coyote = 0; }
    else this.jumpBuffer = input.jump ? .08 : Math.max(0, this.jumpBuffer - DT);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.body.setLinvel(vec(this.velocity.x, CONFIG.jump, this.velocity.z), true);
      this.coyote = 0; this.jumpBuffer = 0;
    }
    if (input.grappleRelease) this.release();
    if (input.grapplePress && !this.attached && !(target && this.attach(target))) this.events.push({ type: 'miss', position: this.position });
    // Resolve the catch first: the point seen by the player must not move another tick.
    for (const [id, { definition, body }] of this.anchors) if (definition.motion) {
      let phase = this.anchorPhases.get(id) ?? 0;
      if (this.attached !== id && this.flyLife(id).phase === 'alive') phase += DT;
      this.anchorPhases.set(id, phase);
      body.setNextKinematicTranslation(movingAnchorPosition(definition, phase));
    }
    const v = this.velocity;
    const mass = this.body.mass();
    const water = this.water;
    let ix = input.x, iz = input.z;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }
    if (this.anchor) {
      const p = this.position, a = this.anchor.position;
      const d = distance(p, a);
      const n = vec((p.x - a.x) / d, (p.y - a.y) / d, (p.z - a.z) / d);
      const dot = ix * n.x + iz * n.z;
      let impulse = vec((ix - n.x * dot) * CONFIG.swingAccel, -n.y * dot * CONFIG.swingAccel, (iz - n.z * dot) * CONFIG.swingAccel);
      const speed = length(v);
      const work = impulse.x * v.x + impulse.y * v.y + impulse.z * v.z;
      if (speed >= CONFIG.inputSpeed && work > 0) {
        const k = work / (speed * speed);
        impulse = vec(impulse.x - v.x * k, impulse.y - v.y * k, impulse.z - v.z * k);
      }
      // A little air resistance while attached keeps long pendulum arcs readable
      // without taking away the momentum needed to carry between catches.
      const swingBrake = clamp((speed - 17) * .5, 0, 4.5);
      if (speed > .01 && swingBrake > 0) {
        impulse.x -= v.x / speed * swingBrake;
        impulse.y -= v.y / speed * swingBrake;
        impulse.z -= v.z / speed * swingBrake;
      }
      this.body.applyImpulse(vec(impulse.x * mass * DT, impulse.y * mass * DT, impulse.z * mass * DT), true);
    } else if (this.launchDistance > 0 && this.dashUntil > this.time) {
      // Target dashes commit to a shallow arcing path; air steering resumes at arrival.
    } else if (water) {
      const gain = clamp((this.impulse ? 1.5 : WATER_CONFIG.drag) * water.immersion * DT, 0, 1);
      this.body.applyImpulse(vec((ix * WATER_CONFIG.moveSpeed - v.x) * gain * mass, 0, (iz * WATER_CONFIG.moveSpeed - v.z) * gain * mass), true);
    } else if (this.grounded && !this.impulse) {
      const gain = clamp(24 * DT, 0, 1);
      this.body.applyImpulse(vec((ix * 4.5 - v.x) * gain * mass, 0, (iz * 4.5 - v.z) * gain * mass), true);
    } else this.body.applyImpulse(vec(ix * CONFIG.airAccel * mass * DT, 0, iz * CONFIG.airAccel * mass * DT), true);
    if (water && !(this.launchDistance > 0 && this.dashUntil > this.time)) {
      const swim = clamp(input.swim ?? 0, -1, 1);
      const desired = swim > 0 ? swim * WATER_CONFIG.riseSpeed : swim < 0 ? swim * WATER_CONFIG.diveSpeed : WATER_CONFIG.floatSpeed;
      const lift = CONFIG.gravity * water.immersion + (desired - this.velocity.y) * (this.impulse ? 1.5 : WATER_CONFIG.drag) * water.immersion;
      this.body.applyImpulse(vec(0, lift * mass * DT, 0), true);
    }
    if (this.launchDistance > 0 && this.launchStart && this.launchEnd && this.dashUntil > this.time) {
      const t = clamp(this.launchElapsed / this.launchDuration, 0, 1);
      const pathVelocity = launchPathVelocity(this.launchStart, this.launchEnd, t, this.launchDuration, this.launchDistance);
      const pathSpeed = length(pathVelocity), scale = pathSpeed > LAUNCH_CONFIG.maxSpeed ? LAUNCH_CONFIG.maxSpeed / pathSpeed : 1;
      this.body.setLinvel(vec(pathVelocity.x * scale, pathVelocity.y * scale + CONFIG.gravity * DT, pathVelocity.z * scale), true);
    }
    this.world.step();
    if (this.launchDistance > 0) {
      this.launchElapsed = Math.min(this.launchDuration, this.launchElapsed + DT);
      this.launchTravelled = this.launchDistance * launchCurve(clamp(this.launchElapsed / this.launchDuration, 0, 1), this.launchDuration, this.launchDistance).progress;
      if (this.dashUntil <= this.time) {
        if (this.launchEnd) this.body.setTranslation(this.launchEnd, true);
        const endVelocity = this.launchStart && this.launchEnd
          ? launchPathVelocity(this.launchStart, this.launchEnd, 1, this.launchDuration, this.launchDistance) : vec();
        this.body.setLinvel(endVelocity, true);
        this.dashUntil = 0; this.launchDistance = 0; this.launchTravelled = 0; this.launchElapsed = 0;
        this.launchStart = null; this.launchEnd = null; this.launchTarget = null;
      }
    }
    if (this.impulseUntil <= this.time) this.impulseUntil = 0;
    const touching = new Set<string>();
    for (const [id, sensor] of this.anchorTouchSensors) {
      if (id === this.attached || this.flyLife(id).phase === 'hidden') continue;
      if (this.world.intersectionPair(this.collider, sensor)) {
        touching.add(id);
        if (!this.touchingAnchors.has(id)) this.events.push({ type: 'touch', position: this.position, anchor: id, reason: 'body-contact' });
      }
    }
    this.touchingAnchors = touching;
    if (this.anchor && this.blocked(this.position, this.anchor.position)) this.release('blocked');
    this.grounded = this.probeGround();
    if (this.grounded && !this.wasGrounded && this.time - this.lastLandTime > .2) {
      this.events.push({ type: 'land', position: this.position, speed: Math.abs(v.y) });
      this.lastLandTime = this.time;
      this.falling = false;
      const p = this.position;
      const spring = this.course.platforms.find(surface => surface.bounce && Math.abs(p.x - surface.position.x) <= surface.size.x / 2 + .15
        && Math.abs(p.z - surface.position.z) <= surface.size.z / 2 + .15 && Math.abs(p.y - (surface.position.y + surface.size.y / 2 + .4)) < .2);
      if (spring && v.y < -.8) {
        this.body.setLinvel(vec(this.velocity.x, spring.bounce!, this.velocity.z), true);
        this.grounded = false; this.coyote = 0;
        this.events.push({ type: 'bounce', position: p, speed: spring.bounce });
      }
    }
    const waterId = this.water?.volume.id ?? null;
    if (waterId !== this.previousWater) {
      this.events.push({ type: waterId ? 'water-enter' : 'water-exit', position: this.position, reason: waterId ?? this.previousWater ?? undefined });
      this.previousWater = waterId;
    }
    this.wasGrounded = this.grounded;
    if (!this.grounded && !this.attached && this.velocity.y < -6) this.fallHold += DT;
    else this.fallHold = 0;
    if (this.fallHold > .3 && !this.falling) {
      this.falling = true; this.falls++; this.events.push({ type: 'fall', position: this.position });
    }
    this.peak = Math.max(this.peak, this.height);
    this.secureWellExit();
    const p = this.position;
    if (p.y < (this.course.id === LONG_LEVEL_COURSE ? this.course.start.y - 5.5 * WORLD_SCALE : -6)
      || Math.abs(p.x) > (this.course.bounds ?? 36) || Math.abs(p.z) > (this.course.bounds ?? 36)) this.resetPosition();
    const s = this.course.summit;
    const atSummit = this.grounded && Math.abs(p.x - s.position.x) <= s.size.x / 2 && Math.abs(p.z - s.position.z) <= s.size.z / 2 && Math.abs(p.y - (s.position.y + s.size.y / 2 + .4)) < .25;
    this.landingHold = atSummit ? this.landingHold + DT : 0;
    if (this.landingHold >= .5) { this.finished = true; this.events.push({ type: 'summit', position: this.position }); }
  }

  resetPosition(): void {
    this.release('reset');
    this.body.setTranslation(this.wellTutorialCleared && this.wellExitCheckpoint ? this.wellExitCheckpoint : this.course.start, true);
    this.body.setLinvel(vec(), true);
    this.coyote = 0; this.jumpBuffer = 0; this.fallHold = 0; this.falling = false; this.landingHold = 0;
    this.impulseUntil = 0; this.impulseDirection = vec(); this.impulseKind = 'release'; this.impulseDuration = RELEASE_CONFIG.duration;
    this.dashUntil = 0; this.dashDirection = vec(); this.launchDistance = 0; this.launchTravelled = 0; this.launchElapsed = 0;
    this.launchDuration = .3; this.launchStart = null; this.launchEnd = null; this.launchTarget = null;
    this.previousWater = null;
    this.events.push({ type: 'reset', position: this.position });
  }

  snapshot(): SaveState {
    return { version: 1, course: this.course.id, mode: this.course.mode, position: this.position, velocity: this.velocity,
      attached: this.attached, length: this.ropeLength, peak: this.peak, time: this.time, tick: this.tick, falls: this.falls, finished: this.finished,
      eatenFlies: [...this.eatenFlies].filter(([, until]) => until > this.time).map(([id, until]) => ({ id, remaining: until - this.time })),
      swing: this.impulse, dash: this.dash, anchorPhases: [...this.anchorPhases].map(([id, time]) => ({ id, time })) };
  }

  restore(s: SaveState): void {
    if (!validSave(s) || s.course !== this.course.id) throw new Error('이 코스에서 불러올 수 없는 저장입니다.');
    if (s.eatenFlies?.some(fly => !this.anchors.has(fly.id))) throw new Error('저장된 파리를 찾을 수 없습니다.');
    if (s.anchorPhases?.some(phase => !this.anchors.get(phase.id)?.definition.motion)) throw new Error('저장된 이동 파리를 찾을 수 없습니다.');
    this.release('restore');
    this.anchorPhases.clear();
    for (const [id, { definition, body }] of this.anchors) if (definition.motion) {
      const phase = s.anchorPhases?.find(phase => phase.id === id)?.time ?? s.time;
      this.anchorPhases.set(id, phase);
      const p = movingAnchorPosition(definition, phase); body.setTranslation(p, true); body.setNextKinematicTranslation(p);
    }
    this.eatenFlies.clear();
    for (const fly of s.eatenFlies ?? []) this.eatenFlies.set(fly.id, s.time + fly.remaining);
    for (const [id, sensor] of this.anchorTouchSensors) sensor.setEnabled(this.flyLife(id).phase !== 'hidden');
    this.touchingAnchors.clear();
    this.body.setTranslation(s.position, true);
    this.body.setLinvel(s.velocity, true);
    const legacyDash = s.dash;
    const restoredImpulse = s.swing ?? (legacyDash && legacyDash.kind !== 'launch' ? {
      remaining: legacyDash.remaining,
      duration: RELEASE_CONFIG.duration,
      direction: legacyDash.direction,
      kind: 'release' as const,
    } : undefined);
    this.impulseUntil = s.time + (restoredImpulse?.remaining ?? 0);
    this.impulseDirection = restoredImpulse ? copy(restoredImpulse.direction) : vec();
    this.impulseKind = restoredImpulse?.kind ?? 'release';
    this.impulseDuration = restoredImpulse?.duration ?? RELEASE_CONFIG.duration;
    this.dashUntil = s.time + (legacyDash?.kind === 'launch' ? legacyDash.remaining : 0);
    this.dashDirection = legacyDash?.kind === 'launch' ? copy(legacyDash.direction) : vec();
    this.launchDistance = legacyDash?.kind === 'launch' ? legacyDash.distance ?? 0 : 0;
    this.launchTravelled = legacyDash?.kind === 'launch' ? legacyDash.travelled ?? 0 : 0;
    this.launchDuration = legacyDash?.kind === 'launch' ? legacyDash.duration ?? .3 : .3;
    this.launchElapsed = this.launchDistance > 0 && legacyDash?.kind === 'launch' ? this.launchDuration - legacyDash.remaining : 0;
    this.launchStart = legacyDash?.kind === 'launch' && legacyDash.origin ? copy(legacyDash.origin) : null;
    this.launchEnd = legacyDash?.kind === 'launch' && legacyDash.targetPosition ? copy(legacyDash.targetPosition) : null;
    this.launchTarget = legacyDash?.kind === 'launch' ? legacyDash.anchor ?? null : null;
    if (s.attached) {
      const a = this.anchors.get(s.attached);
      if (!a) throw new Error('저장된 파리를 찾을 수 없습니다.');
      this.ropeLength = s.length;
      this.joint = this.world.createImpulseJoint(RAPIER.JointData.rope(s.length, vec(), vec()), this.body, a.body, true);
      this.attached = s.attached;
    }
    this.peak = s.peak; this.time = s.time; this.tick = s.tick; this.falls = s.falls; this.finished = s.finished;
    this.secureWellExit();
    this.previousWater = this.water?.volume.id ?? null;
    this.events.length = 0;
  }

  dispose(): void { this.world.free(); }
}

export function validSave(s: unknown): s is SaveState {
  if (!s || typeof s !== 'object') return false;
  const p = s as SaveState;
  const v = (x: Vec) => x && [x.x, x.y, x.z].every(Number.isFinite);
  const validLegacyDash = (dash: LegacyDashState) => {
    if (!dash || !Number.isFinite(dash.remaining) || dash.remaining <= 0
      || dash.kind !== undefined && !['release', 'launch'].includes(dash.kind)
      || !v(dash.direction) || Math.abs(length(dash.direction) - 1) > .001) return false;
    if (dash.kind === 'launch') {
      const duration = dash.duration ?? LEGACY_LAUNCH_SAVE.duration;
      return Number.isFinite(duration) && duration >= LEGACY_LAUNCH_SAVE.minDuration && duration <= LEGACY_LAUNCH_SAVE.maxDuration
        && dash.remaining <= duration + 1e-9
        && (dash.distance === undefined || Number.isFinite(dash.distance) && dash.distance > 0 && dash.distance <= (p.course === LONG_LEVEL_COURSE ? LONG_LEVEL_RANGE : CONFIG.range) + 1e-6)
        && (dash.travelled === undefined || Number.isFinite(dash.travelled) && dash.travelled >= 0 && dash.distance !== undefined && dash.travelled <= dash.distance + 1e-6)
        && (dash.anchor === undefined || typeof dash.anchor === 'string')
        && (dash.origin === undefined || v(dash.origin)) && (dash.targetPosition === undefined || v(dash.targetPosition))
        && ((dash.origin === undefined) === (dash.targetPosition === undefined));
    }
    return dash.remaining <= RELEASE_CONFIG.duration + 1e-9 && dash.duration === undefined && dash.distance === undefined
      && dash.travelled === undefined && dash.anchor === undefined && dash.origin === undefined && dash.targetPosition === undefined;
  };
  if (p.dash !== undefined && !validLegacyDash(p.dash)) return false;
  if (p.swing !== undefined && (!p.swing || !Number.isFinite(p.swing.remaining) || p.swing.remaining <= 0
    || !Number.isFinite(p.swing.duration) || p.swing.duration !== (p.swing.kind === 'eat-swing' ? SWING_CONFIG.duration : RELEASE_CONFIG.duration)
    || p.swing.remaining > p.swing.duration + 1e-9 || !['release', 'eat-swing'].includes(p.swing.kind)
    || !v(p.swing.direction) || Math.abs(length(p.swing.direction) - 1) > .001)) return false;
  const flies = p.eatenFlies;
  const phases = p.anchorPhases;
  if (phases !== undefined && (!Array.isArray(phases) || phases.length > 1200 || phases.some(phase => !phase || typeof phase.id !== 'string'
    || !Number.isFinite(phase.time) || phase.time < 0) || new Set(phases.map(phase => phase.id)).size !== phases.length)) return false;
  if (flies !== undefined && (!Array.isArray(flies) || flies.length > 1200 || flies.some(f => !f || typeof f.id !== 'string'
    || !Number.isFinite(f.remaining) || f.remaining <= 0 || f.remaining > FLY_TIMING.respawn || f.id === p.attached)
    || new Set(flies.map(f => f.id)).size !== flies.length)) return false;
  const longLevel = p.course === LONG_LEVEL_COURSE;
  return p.version === 1 && (p.mode === 'main' || p.mode === 'training') && typeof p.course === 'string' && v(p.position) && v(p.velocity)
    && [p.length, p.peak, p.time, p.tick, p.falls].every(n => Number.isFinite(n) && n >= 0) && p.length <= (longLevel ? LONG_LEVEL_RANGE + .1 : 10.1)
    && (p.attached === null && p.length === 0 || typeof p.attached === 'string' && p.length >= .75)
    && typeof p.finished === 'boolean' && Math.abs(p.position.x) <= (['ecosystem-main-v2','ecosystem-main-v3','ecosystem-main-v4',LONG_LEVEL_COURSE].includes(p.course) ? 140 : 36)
    && Math.abs(p.position.z) <= (['ecosystem-main-v2','ecosystem-main-v3','ecosystem-main-v4',LONG_LEVEL_COURSE].includes(p.course) ? 140 : 36)
    && p.position.y >= (longLevel ? -60 : -6) && p.position.y <= (longLevel ? 1600 : 240);
}
