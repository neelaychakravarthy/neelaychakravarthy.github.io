import * as THREE from 'three';

/**
 * ClickToMove — left-click the ground to set the unit's destination.
 *
 * Raycasts the pointer against the ground mesh, calls `onPick` with the world
 * point, and shows a pulsing marker there until the unit arrives.
 */
export class ClickToMove {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly marker: THREE.Group;
  private readonly ring: THREE.Mesh;
  private pulse = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private ground: THREE.Object3D,
    scene: THREE.Scene,
    private onPick: (point: THREE.Vector3) => void,
  ) {
    this.marker = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.55, 0.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#ffd23f',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.marker.add(this.ring);
    this.marker.visible = false;
    scene.add(this.marker);

    dom.addEventListener('pointerdown', this.onPointerDown);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return; // left button only
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    if (!hit) return; // clicked the sky / off-world: ignore

    this.onPick(hit.point);
    this.marker.position.copy(hit.point);
    this.marker.position.y = 0;
    this.marker.visible = true;
    this.pulse = 0;
  };

  /** `active` should be true while the unit is still travelling to the marker. */
  update(dt: number, active: boolean) {
    if (!active) {
      this.marker.visible = false;
      return;
    }
    this.pulse += dt * 4;
    const s = 1 + Math.sin(this.pulse) * 0.12;
    this.marker.scale.setScalar(s);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
  }
}
