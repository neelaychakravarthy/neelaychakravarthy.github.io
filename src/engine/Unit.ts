import * as THREE from 'three';
import { wrapDelta, wrapNearest } from './wrap';
import { bridgeHeight, ROAD_HALF, type BridgeSpan } from './bridges';

/**
 * A circular no-go region (mountain base, water, etc.). Anchored to a structure
 * origin (ax,az) that tiles with the world, plus a world-space offset (dx,dz) to
 * the circle centre — so the barrier always wraps to the same image as the
 * structure it belongs to (e.g. the ocean stays glued to its beach).
 */
export interface Collider {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  radius: number;
}

/**
 * A rectangular (oriented) no-go region — the footprint of any solid object
 * (buildings, props, stands…). Anchored like Collider (ax,az tile with the world;
 * dx,dz is the rotated centre offset), with half-extents (hx,hz) along the box's
 * own axes and a rotation. Lets the car stop flush against walls of any size.
 */
export interface BoxCollider {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  hx: number;
  hz: number;
  rot: number;
}

/**
 * The looping river: an E-W water band (centreZ ± halfZ) that blocks driving,
 * except across the central grass land-bridge (|world x| < bridgeHalf). Both axes
 * are toroidal, so it tiles with the world.
 */
export interface RiverBlock {
  centerZ: number;
  halfZ: number;
  bridgeHalf: number;
}

/**
 * Unit — the player-controllable thing, with car-like click-to-move steering.
 *
 * Phase 0 builds the body from primitives. The model is treated as a swappable
 * slot: later we replace `buildVehicle()` with a loaded glTF (vehicle now →
 * character/mascot later) without changing the steering logic (see SPEC.md §1).
 *
 * Forward is +Z in local space. Yaw is stored on `object.rotation.y`.
 */
export class Unit {
  readonly object = new THREE.Group();

  /** Top speed (world units / second). */
  speed = 10;
  /** How fast it can turn (radians / second). */
  turnRate = 5.5;
  /** Acceleration / deceleration (units / second^2). */
  accel = 24;

  private readonly arriveRadius = 3.5;
  private readonly stopThreshold = 0.3;
  private readonly wheelRadius = 0.34;

  /** Circular obstacles the unit can't enter (drives around / stops at the edge). */
  colliders: Collider[] = [];
  /** Rectangular obstacles (auto-derived from solid structures' footprints). */
  boxColliders: BoxCollider[] = [];
  /** When true, all obstacle/river clamping is skipped — the unit passes through
   *  everything. Used by the guided tour, which drives the car on scripted rails
   *  to exact stops and must never be blocked by a prop. */
  ghost = false;
  /** Car half-width, padded onto obstacles so the body (not just its centre) stops. */
  private readonly bodyRadius = 1.0;
  /** Optional looping river that blocks all but the central land-bridge. */
  river: RiverBlock | null = null;
  /** Racetrack bridge spans (world centre-lines). Over a bridge the river block
   *  is lifted (the car crosses the water) and the car rides the raised deck. */
  bridgeSpans: BridgeSpan[] = [];
  /** Optional raised surface (e.g. the mountain summit): returns the drivable
   *  height at (x,z), or null off its edge (a wall). When set, the car's y follows
   *  it. Null surface = ordinary flat ground at y = 0. */
  surface: ((x: number, z: number) => number | null) | null = null;

  private target: THREE.Vector3 | null = null;
  private velocity = 0;
  private prevX = 0;
  private prevZ = 0;
  private boostTimer = 0;
  private boostSpeed = 0;
  private driveThrottle = 0;
  private driveSteer = 0;
  private readonly wheels: THREE.Mesh[] = [];

  private readonly toTarget = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  constructor() {
    this.buildVehicle();
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get hasTarget(): boolean {
    return this.target !== null;
  }

  /** True while the player is actively driving — a click target, live keyboard
   *  input, or still rolling. Lets the read-up focus release the instant you move
   *  by ANY means (click or keyboard), not just on a click target. */
  get driving(): boolean {
    return this.target !== null || this.driveThrottle !== 0 || this.driveSteer !== 0 || Math.abs(this.velocity) > 0.4;
  }

  /** Current forward speed (world units / second) — for the tire dust FX. */
  get currentSpeed(): number {
    return this.velocity;
  }

  setTarget(p: THREE.Vector3) {
    this.target = p.clone();
    this.target.y = 0;
    if (this.ghost) return; // on rails (guided tour): aim exactly where told
    // If the destination is inside an obstacle, pull it to that obstacle's edge
    // so the car drives up to the shore/mountain and stops cleanly (no grinding).
    for (const c of this.colliders) {
      const cx = wrapNearest(this.target.x, c.ax) + c.dx;
      const cz = wrapNearest(this.target.z, c.az) + c.dz;
      const dx = this.target.x - cx;
      const dz = this.target.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < c.radius && d > 1e-4) {
        const s = c.radius / d - 1;
        this.target.x += dx * s;
        this.target.z += dz * s;
      }
    }
    for (const b of this.boxColliders) this.pushOutOfBox(this.target, b, 0);
    this.clampOutOfRiver(this.target);
  }

  /** Push a point out of an oriented box (with `pad` added to its extents). Used
   *  both to clamp click targets and to resolve the car each frame. */
  private pushOutOfBox(p: THREE.Vector3, b: BoxCollider, pad: number) {
    const cx = wrapNearest(p.x, b.ax) + b.dx;
    const cz = wrapNearest(p.z, b.az) + b.dz;
    const wx = p.x - cx;
    const wz = p.z - cz;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const lx = c * wx - s * wz; // world delta → box-local
    const lz = s * wx + c * wz;
    const px = b.hx + pad;
    const pz = b.hz + pad;
    if (Math.abs(lx) >= px || Math.abs(lz) >= pz) return; // outside
    let nlx = lx;
    let nlz = lz;
    if (px - Math.abs(lx) < pz - Math.abs(lz)) nlx = Math.sign(lx) * px; // push along nearer face
    else nlz = Math.sign(lz) * pz;
    p.x = cx + c * nlx + s * nlz; // box-local → world
    p.z = cz - s * nlx + c * nlz;
  }

  /** If a point is in the river, pull it to the nearest bank or bridge edge. */
  private clampOutOfRiver(p: THREE.Vector3) {
    const r = this.river;
    if (!r) return;
    // On a racetrack bridge the water doesn't block — let the car drive across.
    if (this.bridgeSpans.length && bridgeHeight(p.x, p.z, this.bridgeSpans, ROAD_HALF) > 0.01) return;
    const dz = wrapDelta(p.z, r.centerZ);
    const dx = wrapDelta(p.x, 0);
    if (Math.abs(dz) >= r.halfZ || Math.abs(dx) <= r.bridgeHalf) return;
    const pushZ = r.halfZ - Math.abs(dz); // to the z-band edge (a bank)
    const pushX = Math.abs(dx) - r.bridgeHalf; // to the bridge x-edge
    if (pushZ <= pushX) p.z += Math.sign(dz) * pushZ;
    else p.x -= Math.sign(dx) * pushX;
  }

  /** Cancel movement (used while a morph drives the unit externally). */
  stop() {
    this.target = null;
    this.velocity = 0;
    this.boostTimer = 0;
  }

  /** Fire a speed boost (a track boost-strip): an instant surge to `speed` plus a
   *  raised top-speed cap for `duration` seconds. It does NOT steer the car — you
   *  keep full control (keyboard or click) and retain the speed while changing
   *  direction; the cap relaxes back to normal when it expires. */
  boost(speed: number, duration: number) {
    this.boostSpeed = speed;
    this.boostTimer = Math.max(this.boostTimer, duration);
    if (this.velocity < speed) this.velocity = speed; // instant surge in the current heading
  }

  /** Direct keyboard driving input, applied each frame: throttle (−1 reverse …
   *  +1 forward) and steer (+1 left … −1 right). Any non-zero input takes over
   *  from click-to-move (and clears the click target). */
  setDrive(throttle: number, steer: number) {
    this.driveThrottle = throttle;
    this.driveSteer = steer;
  }

  update(dt: number) {
    this.prevX = this.position.x;
    this.prevZ = this.position.z;
    const yaw = this.object.rotation.y;
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));

    // Speed boost (track strip): a temporary raised top speed (the instant surge
    // happens in boost()). It never steers — it just lifts the cap for whatever
    // control mode is active, so you keep control and retain speed while turning.
    if (this.boostTimer > 0) this.boostTimer -= dt;
    const maxFwd = this.boostTimer > 0 ? Math.max(this.speed, this.boostSpeed) : this.speed;

    // Keyboard driving (WASD / arrows): direct throttle + steering. Overrides any
    // click-to-move target; steering eases in at low speed and inverts in reverse.
    if (this.driveThrottle !== 0 || this.driveSteer !== 0) {
      this.target = null;
      const reversing = this.velocity < -0.05;
      const steerScale = Math.min(1, Math.abs(this.velocity) / 2 + 0.4);
      // keyboard steering is gentler than the turn rate used for click-to-move pivots
      const newYaw = yaw + this.driveSteer * this.turnRate * 0.55 * steerScale * (reversing ? -1 : 1) * dt;
      this.object.rotation.y = newYaw;
      this.forward.set(Math.sin(newYaw), 0, Math.cos(newYaw));
      const targetV = this.driveThrottle > 0 ? this.driveThrottle * maxFwd : this.driveThrottle * this.speed * 0.5;
      this.velocity = approach(this.velocity, targetV, this.accel * dt);
      this.position.addScaledVector(this.forward, this.velocity * dt);
      const spin = (this.velocity * dt) / this.wheelRadius;
      for (const w of this.wheels) w.rotation.x += spin;
      if (this.colliders.length || this.boxColliders.length || this.river) this.resolveCollisions();
      this.applySurface(dt);
      return;
    }

    let targetSpeed = 0;

    if (this.target) {
      this.toTarget.copy(this.target).sub(this.position);
      this.toTarget.y = 0;
      const dist = this.toTarget.length();

      if (dist <= this.stopThreshold) {
        this.target = null;
      } else {
        const desiredYaw = Math.atan2(this.toTarget.x, this.toTarget.z);
        const newYaw = rotateToward(yaw, desiredYaw, this.turnRate * dt);
        this.object.rotation.y = newYaw;
        this.forward.set(Math.sin(newYaw), 0, Math.cos(newYaw));

        // Slow down to pivot when not yet facing the target, and ease into arrival.
        const dir = this.toTarget.clone().normalize();
        const facing = THREE.MathUtils.clamp(this.forward.dot(dir), 0, 1);
        const arrive = THREE.MathUtils.clamp(dist / this.arriveRadius, 0, 1);
        targetSpeed = maxFwd * arrive * (0.25 + 0.75 * facing);
      }
    }

    // Approach the target speed, then move along the current heading.
    this.velocity = approach(this.velocity, targetSpeed, this.accel * dt);
    if (Math.abs(this.velocity) > 0.0001) {
      this.position.addScaledVector(this.forward, this.velocity * dt);
      const spin = (this.velocity * dt) / this.wheelRadius;
      for (const w of this.wheels) w.rotation.x += spin;
    }
    if (this.colliders.length || this.boxColliders.length || this.river) this.resolveCollisions();
    this.applySurface(dt);
  }

  /** Follow a raised surface (the summit dome): set y from its height, and block
   *  driving off its edge by reverting the move (stops cleanly at the rim). */
  private applySurface(dt: number) {
    if (!this.surface) {
      if (this.position.y !== 0) this.position.y += (0 - this.position.y) * Math.min(1, dt * 12);
      return;
    }
    const h = this.surface(this.position.x, this.position.z);
    if (h === null) {
      this.position.x = this.prevX;
      this.position.z = this.prevZ;
      this.velocity = 0;
      const hb = this.surface(this.position.x, this.position.z);
      if (hb !== null) this.position.y += (hb - this.position.y) * Math.min(1, dt * 12);
      return;
    }
    this.position.y += (h - this.position.y) * Math.min(1, dt * 12);
  }

  /** Push the unit out of any obstacle it has entered (slides along the edge,
   *  so you drive around the mountain / along the shore). Toroidally wrapped. */
  private resolveCollisions() {
    if (this.ghost) return; // guided tour: pass through everything
    for (const c of this.colliders) {
      const cx = wrapNearest(this.position.x, c.ax) + c.dx;
      const cz = wrapNearest(this.position.z, c.az) + c.dz;
      const dx = this.position.x - cx;
      const dz = this.position.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= c.radius) continue;
      if (d > 1e-4) {
        const push = c.radius / d - 1;
        this.position.x += dx * push;
        this.position.z += dz * push;
      } else {
        this.position.x += c.radius; // dead-centre: shove out along +x
      }
    }
    for (const b of this.boxColliders) this.pushOutOfBox(this.position, b, this.bodyRadius);
    this.clampOutOfRiver(this.position);
  }

  // ---- construction ----

  private buildVehicle() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#e8533d', roughness: 0.55, metalness: 0.1 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: '#ffd9cf', roughness: 0.45, metalness: 0.05 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#26282e', roughness: 0.75 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#c33a27', roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.0), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    this.object.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.5), cabinMat);
    cabin.position.set(0, 1.05, -0.2);
    cabin.castShadow = true;
    this.object.add(cabin);

    // Little nose wedge so "forward" reads clearly.
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.5), trimMat);
    nose.position.set(0, 0.55, 1.55);
    nose.castShadow = true;
    this.object.add(nose);

    const wheelGeo = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.32, 18);
    const wx = 0.95;
    const wz = 1.0;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2; // lay cylinder on its side
      wheel.position.set(sx * wx, this.wheelRadius, sz * wz);
      wheel.castShadow = true;
      this.object.add(wheel);
      this.wheels.push(wheel);
    }
  }
}

/** Rotate `current` toward `target` (radians) by at most `maxDelta`, taking the short way. */
function rotateToward(current: number, target: number, maxDelta: number): number {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to [-PI, PI]
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** Move `current` toward `target` by at most `maxDelta`. */
function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}
