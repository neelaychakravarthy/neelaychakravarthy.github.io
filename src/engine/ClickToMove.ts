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
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.handlers.isLocked()) return;

    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Interactables win over ground.
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
  };

  private onPointerMove = (e: PointerEvent) => {
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
  }
}
