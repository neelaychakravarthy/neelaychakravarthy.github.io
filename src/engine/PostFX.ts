import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SelectiveBloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BrightnessContrastEffect,
  HueSaturationEffect,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { getQuality } from './quality';

/**
 * PostFX — the composited look: a vivid SELECTIVE bloom (only the emissive
 * "glow" objects we select bloom, never the sky/ground), then ACES tone
 * mapping, a touch of contrast/saturation, and a vignette.
 *
 * Selective bloom keeps the glow controllable: each biome registers its glowing
 * objects (gems, visors, the AI core, crystals, pads, lamps, phone accents) via
 * setSelection(); the morph FX register transient particles via addGlow().
 */
export class PostFX {
  readonly composer: EffectComposer;
  private readonly bloom: SelectiveBloomEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));

    const q = getQuality();
    this.bloom = new SelectiveBloomEffect(scene, camera, {
      blendFunction: BlendFunction.ADD,
      intensity: 1.5,
      luminanceThreshold: 0.2,
      luminanceSmoothing: 0.25,
      mipmapBlur: !q.mobile, // cheaper Kawase blur on mobile
      resolutionScale: q.bloomResolutionScale,
      radius: 0.62,
    });

    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const contrast = new BrightnessContrastEffect({ contrast: 0.08, brightness: 0.0 });
    const saturate = new HueSaturationEffect({ saturation: 0.16 });
    const vignette = new VignetteEffect({ darkness: 0.52, offset: 0.32 });

    this.composer.addPass(new EffectPass(camera, this.bloom));
    this.composer.addPass(new EffectPass(camera, tone, contrast, saturate, vignette));
  }

  /** Replace the set of objects that bloom (called on biome change). */
  setSelection(objects: THREE.Object3D[]) {
    this.bloom.selection.set(objects);
  }
  addGlow(obj: THREE.Object3D) {
    this.bloom.selection.add(obj);
  }
  removeGlow(obj: THREE.Object3D) {
    this.bloom.selection.delete(obj);
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
  }
  render(dt: number) {
    this.composer.render(dt);
  }
}
