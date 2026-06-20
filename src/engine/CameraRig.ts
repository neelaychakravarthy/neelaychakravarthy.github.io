import * as THREE from 'three';

/**
 * CameraRig — angled isometric-style follow camera.
 *
 * Holds a fixed elevation (the "isometric" tilt) with adjustable azimuth and
 * distance, and smoothly trails a focus point (the unit). Controls:
 *  - mouse wheel  → zoom (distance)
 *  - right-drag   → orbit (azimuth)
 *
 * Left-click is intentionally left free for click-to-move.
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
  private dragging = false;
  private lastX = 0;
  private initialised = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
  ) {
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
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
    if (e.button !== 2) return; // right button only
    this.dragging = true;
    this.lastX = e.clientX;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.azimuth -= dx * 0.005;
  };

  private onPointerUp = () => {
    this.dragging = false;
  };

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

  update(dt: number, focus: THREE.Vector3) {
    this.computeOffset(this.offset);
    this.desired.copy(focus).add(this.offset);
    this.lookTarget.set(focus.x, focus.y + this.targetHeight, focus.z);

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
  }

  dispose() {
    this.dom.removeEventListener('wheel', this.onWheel);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
  }
}
