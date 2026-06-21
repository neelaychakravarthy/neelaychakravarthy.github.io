import * as THREE from 'three';
import type { FocusOverride } from './FocusController';

/**
 * CameraRig — angled isometric-style follow camera.
 *
 * Holds a fixed elevation (the "isometric" tilt) with adjustable azimuth and
 * distance, and smoothly trails a focus point (the unit). Controls:
 *  - mouse wheel  → zoom (distance)
 *  - right-drag   → orbit (azimuth)
 *  - one-finger drag (touch) → orbit; two-finger pinch (touch) → zoom
 *
 * Left-click / single tap are intentionally left free for click-to-move.
 */
export class CameraRig {
  /** Downward tilt of the camera, in degrees (the isometric angle). */
  elevationDeg = 42;
  /** Horizontal orbit angle, in radians. 0 = directly behind the unit, which
   *  centres the (symmetric) biome layouts; right-drag to orbit from there. */
  azimuth = 0;
  /** Camera-to-focus distance. */
  distance = 26;

  /** Raise the look-at point above the unit so info boards sit comfortably in
   *  frame and the empty foreground shrinks. */
  targetHeight = 2.35;

  minDistance = 10;
  maxDistance = 55;
  /** How quickly the camera catches up to the focus (higher = snappier). */
  followRate = 6;

  private readonly target = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private dragging = false; // mouse right-drag
  private lastX = 0;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private initialised = false;
  /** Resting FOV, restored as focus releases. */
  private readonly baseFov: number;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
  ) {
    this.baseFov = camera.fov;
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('contextmenu', this.onContextMenu);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0012);
    this.distance = THREE.MathUtils.clamp(
      this.distance * factor,
      this.minDistance,
      this.maxDistance,
    );
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 2) return; // right-drag orbits; left is free for move
      this.dragging = true;
      this.lastX = e.clientX;
      return;
    }
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) this.pinchDist = this.currentPinchDist();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.azimuth -= dx * 0.005;
      return;
    }
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.touches.size === 1) {
      this.azimuth -= dx * 0.006; // one-finger drag = orbit
    } else if (this.touches.size === 2) {
      const d = this.currentPinchDist();
      if (this.pinchDist > 0 && d > 0) {
        this.distance = THREE.MathUtils.clamp(this.distance * (this.pinchDist / d), this.minDistance, this.maxDistance);
      }
      this.pinchDist = d;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.dragging = false;
      return;
    }
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinchDist = 0;
  };

  /** Pixel distance between the two active touch points. */
  private currentPinchDist(): number {
    const it = this.touches.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  /** Computes the camera offset for the current elevation/azimuth/distance. */
  private computeOffset(out: THREE.Vector3) {
    const elev = THREE.MathUtils.degToRad(this.elevationDeg);
    const h = this.distance * Math.cos(elev); // horizontal radius
    out.set(
      h * Math.sin(this.azimuth),
      this.distance * Math.sin(elev), // height
      h * Math.cos(this.azimuth),
    );
  }

  update(dt: number, focus: THREE.Vector3, override?: FocusOverride | null) {
    this.computeOffset(this.offset);
    this.desired.copy(focus).add(this.offset);
    this.lookTarget.set(focus.x, focus.y + this.targetHeight, focus.z);

    // Blend toward a focus pose (driving up to readable content), if any.
    const w = override ? override.weight : 0;
    if (override && w > 0.0001) {
      this.desired.lerp(override.pos, w);
      this.lookTarget.lerp(override.look, w);
    }

    if (!this.initialised) {
      // Snap into place on the first frame so we don't fly in from the origin.
      this.camera.position.copy(this.desired);
      this.target.copy(this.lookTarget);
      this.initialised = true;
    } else {
      const k = 1 - Math.exp(-this.followRate * dt);
      this.camera.position.lerp(this.desired, k);
      this.target.lerp(this.lookTarget, k);
    }
    this.camera.lookAt(this.target);

    const fov = THREE.MathUtils.lerp(this.baseFov, override ? override.fov : this.baseFov, w);
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Shift the camera + look-target by a world offset with no visible motion
   *  (used when the unit is recentred to the home tile before a morph). */
  shift(dx: number, dz: number) {
    this.camera.position.x += dx;
    this.camera.position.z += dz;
    this.target.x += dx;
    this.target.z += dz;
  }

  dispose() {
    this.dom.removeEventListener('wheel', this.onWheel);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
  }
}
