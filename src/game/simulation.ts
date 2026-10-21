import RAPIER from '@dimforge/rapier3d-compat';
import { vec, length, distance, clamp, type Vec, type Course, type Controls, type Anchor, type GameEvent, type SaveState, type FlyLife, type ImpulseState, type LegacyDashState } from './types';
import { movingAnchorPosition, waterAt, WATER_CONFIG, rockHull, cylinderRotation, landscapeMesh, starMesh, cloudClumps, platformMesh, platformRotation } from './environment';
import { calculateEatSwingKick, SWING_CONFIG } from './swing';

export const DT = 1 / 120;
export const CONFIG = { gravity: 18, range: 10, minRange: .75, aimAngle: 8, swingAccel: 12, airAccel: 2.5, inputSpeed: 14, jump: 7.5 };
export const FLY_TIMING = { retract: .32, swallow: .22, respawn: 3, appear: .25 };
export const RELEASE_CONFIG = { boost: 3.5, duration: .16, maxBoostedSpeed: 16 };
const LEGACY_LAUNCH_SAVE = { duration: .3, minDuration: .1, maxDuration: 1.7 };
const copy = (p: Vec): Vec => vec(p.x, p.y, p.z);

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

  constructor(readonly course: Course) {
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
    for (const rock of course.rocks ?? []) {
      const desc = RAPIER.ColliderDesc.convexHull(rockHull(rock.size));
      if (desc) this.world.createCollider(desc.setTranslation(rock.position.x, rock.position.y, rock.position.z).setFriction(.6));
    }
    // A visible central trunk is a real obstacle too.
    if (course.id === 'garden-main-v1') {
      const trunk = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 88, 0));
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(88, .8).setFriction(.6), trunk);
    }
    for (const solid of course.solids ?? []) {
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(solid.height / 2, solid.radius)
        .setTranslation(solid.position.x, solid.position.y, solid.position.z)
        .setRotation(cylinderRotation(solid.direction ?? vec(0, 1, 0))).setFriction(.6));
    }
    for (const land of course.landscapes ?? []) {
      const mesh = landscapeMesh(land);
      this.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices)
        .setTranslation(land.position.x, land.position.y, land.position.z).setFriction(.6));
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
    this.grounded = this.probeGround();
    this.previousWater = this.water?.volume.id ?? null;
  }

  get position(): Vec { return copy(this.body.translation()); }
  get velocity(): Vec { return copy(this.body.linvel()); }
  get height(): number { return Math.max(0, this.body.translation().y - this.course.start.y); }
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

  flyLife(id: string): FlyLife {
    const remaining = Math.max(0, (this.eatenFlies.get(id) ?? 0) - this.time);
    if (remaining <= 0) return { phase: 'alive', elapsed: 0, remaining: 0 };
    const elapsed = FLY_TIMING.respawn - remaining;
    return { phase: elapsed < FLY_TIMING.retract ? 'retracting' : remaining <= FLY_TIMING.appear ? 'respawning' : 'hidden', elapsed, remaining };
  }

  blocked(a: Vec, b: Vec): boolean {
    const d = distance(a, b);
    if (d < .02) return false;
    const dir = vec((b.x - a.x) / d, (b.y - a.y) / d, (b.z - a.z) / d);
    return this.world.castRay(new RAPIER.Ray(a, dir), Math.max(0, d - .04), true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider, this.body) !== null;
  }

  selectTarget(camera: Vec, direction: Vec, assisted = false): Anchor | null {
    const p = this.position;
    const limit = Math.cos((assisted ? 12 : CONFIG.aimAngle) * Math.PI / 180);
    let best: { anchor: Anchor; alignment: number; distance: number } | null = null;
    for (const a of this.course.anchors) {
      if (this.flyLife(a.id).phase !== 'alive') continue;
      const current = { ...a, position: this.anchorPosition(a.id)! };
      const d = distance(p, current.position);
      if (d < CONFIG.minRange || d > CONFIG.range) continue;
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
    if (!a || this.flyLife(id).phase !== 'alive' || d < CONFIG.minRange || d > CONFIG.range || this.blocked(this.position, point)) return false;
    this.ropeLength = d;
    this.joint = this.world.createImpulseJoint(RAPIER.JointData.rope(d, vec(), vec()), this.body, a.body, true);
    this.attached = id;
    this.events.push({ type: 'shoot', position: this.position, anchor: id }, { type: this.falling ? 'recovery' : 'catch', position: this.position, anchor: id });
    this.falling = false;
    this.fallHold = 0;
    return true;
  }

  release(reason: 'manual' | 'eat-swing' | 'blocked' | 'reset' | 'restore' = 'manual', duringStep = false, controls?: Controls): void {
    if (!this.joint) return;
    const anchorId = this.attached;
    const fly = this.anchor;
    this.world.removeImpulseJoint(this.joint, true);
    this.joint = null;
    this.events.push({ type: reason === 'blocked' ? 'blocked' : 'release', position: this.position, anchor: anchorId ?? undefined });
    if ((reason === 'manual' || reason === 'eat-swing') && anchorId) {
      this.eatenFlies.set(anchorId, this.time + FLY_TIMING.respawn);
      this.events.push({ type: 'eat', position: this.position, anchor: anchorId });
      if (fly) {
        const p = this.position, v = this.velocity, d = distance(p, fly.position);
        if (d > .001) {
          const n = vec((fly.position.x - p.x) / d, (fly.position.y - p.y) / d, (fly.position.z - p.z) / d);
          if (reason === 'eat-swing') {
            const kick = calculateEatSwingKick(v, vec(fly.position.x - p.x, fly.position.y - p.y, fly.position.z - p.z),
              vec(controls?.x ?? 0, 0, controls?.z ?? 0), controls?.cameraForward ?? vec(0, 0, -1));
            if (kick.speedDelta > .001) {
              const mass = this.body.mass();
              this.body.applyImpulse(vec(kick.direction.x * kick.speedDelta * mass, kick.direction.y * kick.speedDelta * mass,
                kick.direction.z * kick.speedDelta * mass), true);
              this.impulseKind = 'eat-swing'; this.impulseDirection = kick.direction; this.impulseDuration = SWING_CONFIG.duration;
              this.impulseUntil = this.time + SWING_CONFIG.duration - (duringStep ? DT : 0);
              this.events.push({ type: 'swing', position: p, anchor: anchorId, speed: kick.speedDelta, reason: 'eat-swing', direction: kick.direction });
            }
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
    const eatSwing = input.jump && !!this.attached;
    if (eatSwing) { this.release('eat-swing', true, input); this.jumpBuffer = 0; this.coyote = 0; }
    else this.jumpBuffer = input.jump ? .08 : Math.max(0, this.jumpBuffer - DT);
    // A tethered Space press eats and swings; a grounded Space press jumps.
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
      this.body.applyImpulse(vec(impulse.x * mass * DT, impulse.y * mass * DT, impulse.z * mass * DT), true);
    } else if (water) {
      const gain = clamp((this.impulse ? 1.5 : WATER_CONFIG.drag) * water.immersion * DT, 0, 1);
      this.body.applyImpulse(vec((ix * WATER_CONFIG.moveSpeed - v.x) * gain * mass, 0, (iz * WATER_CONFIG.moveSpeed - v.z) * gain * mass), true);
    } else if (this.grounded && !this.impulse) {
      const gain = clamp(24 * DT, 0, 1);
      this.body.applyImpulse(vec((ix * 4.5 - v.x) * gain * mass, 0, (iz * 4.5 - v.z) * gain * mass), true);
    } else this.body.applyImpulse(vec(ix * CONFIG.airAccel * mass * DT, 0, iz * CONFIG.airAccel * mass * DT), true);
    if (water) {
      const swim = clamp(input.swim ?? 0, -1, 1);
      const desired = swim > 0 ? swim * WATER_CONFIG.riseSpeed : swim < 0 ? swim * WATER_CONFIG.diveSpeed : WATER_CONFIG.floatSpeed;
      const lift = CONFIG.gravity * water.immersion + (desired - this.velocity.y) * (this.impulse ? 1.5 : WATER_CONFIG.drag) * water.immersion;
      this.body.applyImpulse(vec(0, lift * mass * DT, 0), true);
    }
    this.world.step();
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
    const p = this.position;
    if (p.y < -6 || Math.abs(p.x) > (this.course.bounds ?? 36) || Math.abs(p.z) > (this.course.bounds ?? 36)) this.resetPosition();
    const s = this.course.summit;
    const atSummit = this.grounded && Math.abs(p.x - s.position.x) <= s.size.x / 2 && Math.abs(p.z - s.position.z) <= s.size.z / 2 && Math.abs(p.y - (s.position.y + s.size.y / 2 + .4)) < .25;
    this.landingHold = atSummit ? this.landingHold + DT : 0;
    if (this.landingHold >= .5) { this.finished = true; this.events.push({ type: 'summit', position: this.position }); }
  }

  resetPosition(): void {
    this.release('reset');
    this.body.setTranslation(this.course.start, true);
    this.body.setLinvel(vec(), true);
    this.coyote = 0; this.jumpBuffer = 0; this.fallHold = 0; this.falling = false; this.landingHold = 0;
    this.impulseUntil = 0; this.impulseDirection = vec(); this.impulseKind = 'release'; this.impulseDuration = RELEASE_CONFIG.duration;
    this.previousWater = null;
    this.events.push({ type: 'reset', position: this.position });
  }

  snapshot(): SaveState {
    return { version: 1, course: this.course.id, mode: this.course.mode, position: this.position, velocity: this.velocity,
      attached: this.attached, length: this.ropeLength, peak: this.peak, time: this.time, tick: this.tick, falls: this.falls, finished: this.finished,
      eatenFlies: [...this.eatenFlies].filter(([, until]) => until > this.time).map(([id, until]) => ({ id, remaining: until - this.time })),
      swing: this.impulse, anchorPhases: [...this.anchorPhases].map(([id, time]) => ({ id, time })) };
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
    const restoredImpulse = s.swing ?? (legacyDash ? {
      remaining: legacyDash.kind === 'launch' ? Math.min(legacyDash.remaining, SWING_CONFIG.duration) : legacyDash.remaining,
      duration: legacyDash.kind === 'launch' ? SWING_CONFIG.duration : RELEASE_CONFIG.duration,
      direction: legacyDash.direction,
      kind: legacyDash.kind === 'launch' ? 'eat-swing' as const : 'release' as const,
    } : undefined);
    this.impulseUntil = s.time + (restoredImpulse?.remaining ?? 0);
    this.impulseDirection = restoredImpulse ? copy(restoredImpulse.direction) : vec();
    this.impulseKind = restoredImpulse?.kind ?? 'release';
    this.impulseDuration = restoredImpulse?.duration ?? RELEASE_CONFIG.duration;
    if (s.attached) {
      const a = this.anchors.get(s.attached);
      if (!a) throw new Error('저장된 파리를 찾을 수 없습니다.');
      this.ropeLength = s.length;
      this.joint = this.world.createImpulseJoint(RAPIER.JointData.rope(s.length, vec(), vec()), this.body, a.body, true);
      this.attached = s.attached;
    }
    this.peak = s.peak; this.time = s.time; this.tick = s.tick; this.falls = s.falls; this.finished = s.finished;
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
        && (dash.distance === undefined || Number.isFinite(dash.distance) && dash.distance > 0 && dash.distance <= CONFIG.range + 1e-6)
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
  if (phases !== undefined && (!Array.isArray(phases) || phases.length > 200 || phases.some(phase => !phase || typeof phase.id !== 'string'
    || !Number.isFinite(phase.time) || phase.time < 0) || new Set(phases.map(phase => phase.id)).size !== phases.length)) return false;
  if (flies !== undefined && (!Array.isArray(flies) || flies.length > 200 || flies.some(f => !f || typeof f.id !== 'string'
    || !Number.isFinite(f.remaining) || f.remaining <= 0 || f.remaining > FLY_TIMING.respawn || f.id === p.attached)
    || new Set(flies.map(f => f.id)).size !== flies.length)) return false;
  return p.version === 1 && (p.mode === 'main' || p.mode === 'training') && typeof p.course === 'string' && v(p.position) && v(p.velocity)
    && [p.length, p.peak, p.time, p.tick, p.falls].every(n => Number.isFinite(n) && n >= 0) && p.length <= 10.1
    && (p.attached === null && p.length === 0 || typeof p.attached === 'string' && p.length >= .75)
    && typeof p.finished === 'boolean' && Math.abs(p.position.x) <= (['ecosystem-main-v2','ecosystem-main-v3'].includes(p.course) ? 70 : 36)
    && Math.abs(p.position.z) <= (['ecosystem-main-v2','ecosystem-main-v3'].includes(p.course) ? 70 : 36) && p.position.y >= -6 && p.position.y <= 200;
}
