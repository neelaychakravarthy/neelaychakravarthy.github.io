import * as THREE from 'three';

export interface ClickHandlers {
  /** Left-click hit the ground at this world point. */
  onGround: (point: THREE.Vector3) => void;
  /** Current clickable objects (link chips carrying userData.url). */
  getClickables: () => THREE.Object3D[];
  /** A clickable object was hit. */
  onInteract: (obj: THREE.Object3D) => void;
  /** While true, input is ignored (e.g. mid-morph). */
  isLocked: () => boolean;
}

/**
 * ClickToMove — left-click to drive. Clickable interactables (links) take
 * priority over the ground, so clicking a link opens it instead of moving.
 */
export class ClickToMove {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly marker: THREE.Group;
  private readonly ring: THREE.Mesh;
  private pulse = 0;
  private hoveredTip: THREE.Object3D | null = null;
  // touch tap tracking (a tap drives; a drag/pinch is the camera's, not a move)
  private tapId: number | null = null;
  private tapStart = { x: 0, y: 0, t: 0 };
  private activeTouches = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private ground: THREE.Object3D,
    scene: THREE.Scene,
    private handlers: ClickHandlers,
  ) {
    this.marker = new THREE.Group();
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.8, 32),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.marker.add(this.ring);
    this.marker.visible = false;
    scene.add(this.marker);

    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  /** Raycast at a screen point: a clickable interactable wins, else drive there. */
  private fireAt(clientX: number, clientY: number) {
    if (this.handlers.isLocked()) return;
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const clickables = this.handlers.getClickables();
    if (clickables.length) {
      const hit = this.raycaster.intersectObjects(clickables, false)[0];
      if (hit) {
        this.handlers.onInteract(hit.object);
        return;
      }
    }

    const g = this.raycaster.intersectObject(this.ground, false)[0];
    if (!g) return;
    this.handlers.onGround(g.point);
    this.marker.position.set(g.point.x, 0, g.point.z);
    this.marker.visible = true;
    this.pulse = 0;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.fireAt(e.clientX, e.clientY); // immediate on desktop
      return;
    }
    // touch/pen: start a candidate tap (cancelled if a 2nd finger lands)
    this.activeTouches++;
    if (this.activeTouches > 1) {
      this.tapId = null;
      return;
    }
    this.tapId = e.pointerId;
    this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    this.activeTouches = Math.max(0, this.activeTouches - 1);
    if (e.pointerId !== this.tapId) return;
    this.tapId = null;
    const moved = Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y);
    if (moved < 16 && performance.now() - this.tapStart.t < 500) this.fireAt(e.clientX, e.clientY);
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    this.activeTouches = Math.max(0, this.activeTouches - 1);
    if (e.pointerId === this.tapId) this.tapId = null;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return; // hover/tooltips are desktop-only
    if (this.handlers.isLocked()) {
      this.clearHover();
      return;
    }
    const clickables = this.handlers.getClickables();
    if (!clickables.length) {
      this.clearHover();
      return;
    }
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObjects(clickables, false)[0];
    const tip = (hit?.object.userData.tooltip3d as THREE.Object3D | undefined) ?? null;
    if (tip !== this.hoveredTip) {
      if (this.hoveredTip) this.hoveredTip.visible = false;
      if (tip) tip.visible = true;
      this.hoveredTip = tip;
    }
    const url = hit?.object.userData.url as string | undefined;
    this.dom.style.cursor = url && url !== '#' ? 'pointer' : 'default';
  };

  private clearHover() {
    if (this.hoveredTip) {
      this.hoveredTip.visible = false;
      this.hoveredTip = null;
    }
    this.dom.style.cursor = 'default';
  }

  update(_dt: number, active: boolean) {
    if (!active) {
      this.marker.visible = false;
      return;
    }
    this.pulse += _dt * 4;
    this.marker.scale.setScalar(1 + Math.sin(this.pulse) * 0.12);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
  }
}
