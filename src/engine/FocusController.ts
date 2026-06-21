import * as THREE from 'three';

/**
 * FocusController — cinematic "read me" camera.
 *
 * When the unit drives up to a piece of readable content (an info board, an
 * image slideshow, or a video screen), this eases the camera in to frame that
 * content head-on, big and centred, then eases back to the normal follow camera
 * when the unit drives away. It produces a {@link FocusOverride} (a target
 * pose + a 0..1 blend weight) that the {@link CameraRig} blends toward; it never
 * touches the camera directly, so the follow cam stays in charge at weight 0.
 *
 * Content is tagged generically in `interactables` (userData.focus), collected
 * per biome in `Biome`, and handed here via {@link setBiome} — so new content
 * becomes focusable with no change to this controller.
 */

interface FocusTarget {
  object: THREE.Object3D;
  /** Intended front yaw (radians) — the side the content is read from. */
  facing: number;
  /** Panels/screens have a real front; boards billboard (approach from either side). */
  oneSided: boolean;
  /** Explicit look-at height (image centre), overriding the bounding-box centre. */
  centerY?: number;
  // framing cached when the target is acquired (content doesn't move):
  center: THREE.Vector3;
  front: THREE.Vector3;
  dist: number;
}

export interface FocusOverride {
  /** Desired camera position when fully focused. */
  pos: THREE.Vector3;
  /** Desired look-at point when fully focused. */
  look: THREE.Vector3;
  /** 0 = normal follow, 1 = fully framed on the content. */
  weight: number;
  /** Camera FOV at full focus (narrower = a touch more zoom). */
  fov: number;
}

export class FocusController {
  enabled = true;
  /** Park (and stop) within this distance of content to frame it. */
  outer = 6.5;
  /** Gentle downward tilt while focused (degrees) so text reads head-on. */
  elevationDeg = 13;
  /** Camera FOV at full focus. */
  focusFov = 36;
  /** Padding factor around the framed content (1 = exactly fills). */
  margin = 1.2;

  private targets: FocusTarget[] = [];
  private current: FocusTarget | null = null;
  private weight = 0;
  /** Brief suppression after a biome (re)build so we don't zoom on spawn. */
  private settle = 0;
  /** Brief grace after leaving a focus so a click can clear the content's range. */
  private cooldown = 0;

  private readonly ov: FocusOverride = {
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    weight: 0,
    fov: 36,
  };
  private readonly box = new THREE.Box3();
  private readonly size = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Point the controller at the active biome's focusable content. */
  setBiome(focusables: THREE.Object3D[]) {
    this.targets = focusables.map((o) => ({
      object: o,
      facing: (o.userData.focusFacing as number) ?? 0,
      oneSided: !!o.userData.focusOneSided,
      centerY: o.userData.focusCenterY as number | undefined,
      center: new THREE.Vector3(),
      front: new THREE.Vector3(),
      dist: 10,
    }));
    this.current = null;
    this.weight = 0;
    this.settle = 0.8;
    this.cooldown = 0;
  }

  /** Snap fully back to the follow camera (used at the start of a morph). */
  reset() {
    this.current = null;
    this.weight = 0;
    this.cooldown = 0;
  }

  private horizDist(a: THREE.Vector3, b: THREE.Vector3): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  /** Measure the content and work out where to put the camera to frame it. */
  private acquire(t: FocusTarget, unitPos: THREE.Vector3) {
    this.box.setFromObject(t.object);
    if (this.box.isEmpty()) {
      t.object.getWorldPosition(t.center);
      t.center.y += 1.5;
      this.size.set(3, 2, 0.2);
    } else {
      this.box.getCenter(t.center);
      this.box.getSize(this.size);
    }
    // Prefer the content's true centre height (e.g. a panel's image) over the
    // bounding-box centre, which sinks toward the support legs.
    if (t.centerY !== undefined) {
      this.size.y = Math.max(0.6, (this.box.max.y - t.centerY) * 2);
      t.center.y = t.centerY;
    }

    // Front normal (horizontal). For two-sided boards, approach from the side
    // the unit is already on so the camera doesn't swing around the content.
    t.front.set(Math.sin(t.facing), 0, Math.cos(t.facing));
    if (t.front.lengthSq() < 1e-6) t.front.set(0, 0, 1);
    t.front.normalize();
    if (!t.oneSided) {
      this.tmp.copy(unitPos).sub(t.center);
      this.tmp.y = 0;
      if (t.front.dot(this.tmp) < 0) t.front.negate();
    }

    // Distance so the content fits the (narrowed) vertical FOV, accounting for
    // width via the aspect ratio.
    const vfov = THREE.MathUtils.degToRad(this.focusFov);
    const tanHalf = Math.tan(vfov / 2);
    const fitH = Math.max(this.size.y, 0.6) / 2 / tanHalf;
    const fitW = Math.max(this.size.x, 0.6) / 2 / (tanHalf * this.camera.aspect);
    t.dist = THREE.MathUtils.clamp(Math.max(fitH, fitW) * this.margin, 5, 18);
  }

  /**
   * @param canEngage false while a morph is locked — eases focus out.
   * @returns the focus override, or null when fully on the follow camera.
   */
  update(dt: number, unitPos: THREE.Vector3, canEngage = true): FocusOverride | null {
    if (this.settle > 0) this.settle = Math.max(0, this.settle - dt);
    const stopped = this.enabled && canEngage && this.settle === 0;
    if (stopped && this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    const live = stopped && this.cooldown === 0 && this.targets.length > 0;

    if (live) {
      // nearest focusable to the unit (horizontal distance)
      let nearest: FocusTarget | null = null;
      let nd = Infinity;
      for (const t of this.targets) {
        t.object.getWorldPosition(this.tmp);
        const d = this.horizDist(unitPos, this.tmp);
        if (d < nd) {
          nd = d;
          nearest = t;
        }
      }
      if (this.current) {
        this.current.object.getWorldPosition(this.tmp);
        const cd = this.horizDist(unitPos, this.tmp);
        if (cd > this.outer) {
          this.current = null;
        } else if (nearest && nearest !== this.current && nd < cd - 1 && this.weight < 0.3) {
          // switch to a clearly-closer target, but only once mostly released
          this.current = nearest;
          this.acquire(nearest, unitPos);
        }
      }
      if (!this.current && nearest && nd < this.outer) {
        this.current = nearest;
        this.acquire(nearest, unitPos);
      }
    } else {
      // Driving away from an active focus → arm a brief grace so the next
      // stop won't instantly re-zoom (gives a window to drive clear).
      if (!canEngage && this.weight > 0.4) this.cooldown = 0.7;
      this.current = null;
    }

    // Binary target, smoothly eased: parking near content always frames the
    // content itself (a consistent, well-composed shot independent of exactly
    // where you stopped), rather than a half-zoom that drifts off-centre.
    const wTarget = this.current ? 1 : 0;
    // Ease in gently (cinematic), release faster so driving away snaps back to
    // the world view immediately.
    const rate = wTarget > this.weight ? 4 : 8;
    this.weight += (wTarget - this.weight) * (1 - Math.exp(-rate * dt));

    if (this.weight < 0.001 || !this.current) {
      this.weight = this.current ? this.weight : 0;
      return null;
    }

    const elev = THREE.MathUtils.degToRad(this.elevationDeg);
    const t = this.current;
    this.ov.pos.copy(t.center).addScaledVector(t.front, t.dist * Math.cos(elev));
    this.ov.pos.y = t.center.y + t.dist * Math.sin(elev);
    this.ov.look.copy(t.center);
    this.ov.weight = this.weight;
    this.ov.fov = this.focusFov;
    return this.ov;
  }
}
