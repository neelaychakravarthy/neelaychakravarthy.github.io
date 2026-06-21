import * as THREE from 'three';
import { PostFX } from './PostFX';
import { getQuality } from './quality';

/**
 * Engine — owns the renderer, scene, camera, and the render loop.
 *
 * Phase 0 uses WebGLRenderer (rock-solid with every addon). The renderer is
 * created behind this thin wrapper so a later swap to WebGPURenderer is a small,
 * contained change (see SPEC.md §1).
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly clock = new THREE.Clock();
  readonly postfx: PostFX;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(getQuality().pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // tone mapping is done in PostFX
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(18, 18, 18);
    this.camera.lookAt(0, 0, 0);

    this.postfx = new PostFX(this.renderer, this.scene, this.camera);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(getQuality().pixelRatio);
    this.postfx.setSize(w, h);
  };

  /** Start the render loop. `update(dt)` runs once per frame before the render. */
  start(update: (dt: number) => void) {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1); // clamp to avoid jumps after tab-out
      update(dt);
      this.postfx.render(dt);
    });
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
