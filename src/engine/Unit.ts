import * as THREE from 'three';
import { wrapDelta, wrapNearest } from './wrap';

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
  /** Optional looping river that blocks all but the central land-bridge. */
  river: RiverBlock | null = null;

  private target: THREE.Vector3 | null = null;
  private velocity = 0;
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

  setTarget(p: THREE.Vector3) {
    this.target = p.clone();
    this.target.y = 0;
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
    this.clampOutOfRiver(this.target);
  }

  /** If a point is in the river, pull it to the nearest bank or bridge edge. */
  private clampOutOfRiver(p: THREE.Vector3) {
    const r = this.river;
    if (!r) return;
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
  }

  update(dt: number) {
    const yaw = this.object.rotation.y;
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));

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
        targetSpeed = this.speed * arrive * (0.25 + 0.75 * facing);
      }
    }

    // Approach the target speed, then move along the current heading.
    this.velocity = approach(this.velocity, targetSpeed, this.accel * dt);
    if (this.velocity > 0.0001) {
      this.position.addScaledVector(this.forward, this.velocity * dt);
      const spin = (this.velocity * dt) / this.wheelRadius;
      for (const w of this.wheels) w.rotation.x += spin;
    }
    if (this.colliders.length || this.river) this.resolveCollisions();
  }

  /** Push the unit out of any obstacle it has entered (slides along the edge,
   *  so you drive around the mountain / along the shore). Toroidally wrapped. */
  private resolveCollisions() {
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
