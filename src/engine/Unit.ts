import * as THREE from 'three';

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
