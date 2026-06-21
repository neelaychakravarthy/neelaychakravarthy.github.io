import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import type { BiomeConfig, WorldConfig } from '../world/types';
import type { AssetRegistry } from './AssetRegistry';
import { EnvironmentController } from './EnvironmentController';
import { makeContent, makePad } from './interactables';
import { wrapNearest } from './wrap';
import type { Collider, RiverBlock } from './Unit';

/** How far (world units) structures drop below ground when sunk during a morph. */
export const MORPH_SINK = 10;

export interface MorphItem {
  obj: THREE.Object3D;
  baseX: number;
  baseY: number;
  baseZ: number;
  /** Distant scenery that follows the camera instead of tiling with the world. */
  backdrop: boolean;
}

export interface PadInstance {
  object: THREE.Object3D;
  position: THREE.Vector3;
  radius: number;
  target: string;
  glow?: THREE.MeshStandardMaterial;
  pulse: number;
  wasInside: boolean;
}

export interface BuiltBiome {
  id: string;
  config: BiomeConfig;
  group: THREE.Group;
  morphItems: MorphItem[];
  clickables: THREE.Object3D[];
  pads: PadInstance[];
  billboards: THREE.Object3D[];
  spinners: THREE.Object3D[];
  galleries: THREE.Object3D[];
  videos: THREE.Object3D[];
  glows: THREE.Object3D[];
  waters: THREE.Object3D[];
  focusables: THREE.Object3D[];
  colliders: Collider[];
  river: RiverBlock | null;
}

function buildBiome(
  scene: THREE.Scene,
  registry: AssetRegistry,
  config: BiomeConfig,
  hidden: boolean,
): BuiltBiome {
  const group = new THREE.Group();
  group.name = `biome:${config.id}`;
  const morphItems: MorphItem[] = [];

  const addItem = (obj: THREE.Object3D) => {
    group.add(obj);
    morphItems.push({
      obj,
      baseX: obj.position.x,
      baseY: obj.position.y,
      baseZ: obj.position.z,
      backdrop: !!obj.userData.backdrop,
    });
  };

  const colliders: Collider[] = [];
  (config.structures ?? []).forEach((s, i) => {
    const obj = registry.create(s.modelId, i);
    obj.position.set(...s.position);
    if (s.rotationY) obj.rotation.y = s.rotationY;
    if (s.scale) obj.scale.setScalar(s.scale);
    if (s.backdrop) obj.userData.backdrop = true;
    if (s.collider) {
      const r = s.rotationY ?? 0;
      const sc = s.scale ?? 1;
      const dx = (s.collider.dx ?? 0) * sc;
      const dz = (s.collider.dz ?? 0) * sc;
      colliders.push({
        ax: s.position[0],
        az: s.position[2],
        dx: dx * Math.cos(r) + dz * Math.sin(r),
        dz: -dx * Math.sin(r) + dz * Math.cos(r),
        radius: s.collider.radius * sc,
      });
    }
    addItem(obj);
  });

  for (const c of config.content ?? []) addItem(makeContent(c));
  for (const p of config.pads ?? []) addItem(makePad(p));

  // Collect interactive bits generically from userData tags.
  const clickables: THREE.Object3D[] = [];
  const billboards: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  const galleries: THREE.Object3D[] = [];
  const videos: THREE.Object3D[] = [];
  const glows: THREE.Object3D[] = [];
  const waters: THREE.Object3D[] = [];
  const focusables: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.userData.url !== undefined) clickables.push(o);
    if (o.userData.billboard) billboards.push(o);
    if (o.userData.spinSpeed) spinners.push(o);
    if (o.userData.gallery) galleries.push(o);
    if (o.userData.video) videos.push(o);
    if (o.userData.water) waters.push(o);
    if (o.userData.focus) focusables.push(o);
    if (o instanceof THREE.Mesh) {
      const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.MeshStandardMaterial;
      const e = mat?.emissive;
      if (e && e.r + e.g + e.b > 0.05 && (mat.emissiveIntensity ?? 0) > 0.25) glows.push(o);
    }
  });

  const pads: PadInstance[] = [];
  for (const { obj } of morphItems) {
    if (obj.userData.padTarget) {
      pads.push({
        object: obj,
        position: obj.position.clone(),
        radius: obj.userData.padRadius ?? 2,
        target: obj.userData.padTarget,
        glow: obj.userData.glowMat as THREE.MeshStandardMaterial | undefined,
        pulse: 0,
        wasInside: false,
      });
    }
  }

  if (hidden) {
    for (const it of morphItems) {
      it.obj.position.y = it.baseY - MORPH_SINK;
      it.obj.scale.setScalar(0.0001);
    }
  }

  const river: RiverBlock | null = config.river
    ? { centerZ: config.river.centerZ ?? 0, halfZ: config.river.halfZ, bridgeHalf: config.river.bridgeHalf }
    : null;

  scene.add(group);
  return { id: config.id, config, group, morphItems, clickables, pads, billboards, spinners, galleries, videos, glows, waters, focusables, colliders, river };
}

function disposeMaterial(m: THREE.Material | THREE.Material[]) {
  const arr = Array.isArray(m) ? m : [m];
  for (const x of arr) {
    const map = (x as THREE.MeshBasicMaterial).map;
    if (map) map.dispose();
    x.dispose();
  }
}

/**
 * BiomeManager — builds/disposes biomes from the manifest and runs per-frame
 * idle animation (billboarded text, slow-spinning props, pulsing pads) for the
 * active biome.
 */
export class BiomeManager {
  current: BuiltBiome | null = null;
  private readonly byId = new Map<string, BiomeConfig>();
  private readonly tmp = new THREE.Vector3();
  private elapsed = 0;

  constructor(
    private scene: THREE.Scene,
    private registry: AssetRegistry,
    private env: EnvironmentController,
    world: WorldConfig,
  ) {
    for (const b of world.biomes) this.byId.set(b.id, b);
  }

  configFor(id: string): BiomeConfig {
    const c = this.byId.get(id);
    if (!c) throw new Error(`[BiomeManager] no biome "${id}" in manifest`);
    return c;
  }

  /** Build the initial biome visible and snap the environment to it. */
  start(id: string): BuiltBiome {
    const config = this.configFor(id);
    const biome = buildBiome(this.scene, this.registry, config, false);
    this.env.setImmediate(config.environment);
    this.current = biome;
    return biome;
  }

  /** Build a biome (optionally hidden/sunken, ready to rise during a morph). */
  build(id: string, hidden: boolean): BuiltBiome {
    return buildBiome(this.scene, this.registry, this.configFor(id), hidden);
  }

  dispose(biome: BuiltBiome) {
    this.scene.remove(biome.group);
    biome.group.traverse((o) => {
      if (o.userData.troika) {
        (o as Text).dispose?.();
        return;
      }
      if (o instanceof THREE.Mesh) {
        if (o.userData.video) {
          const v = o.userData.video as HTMLVideoElement;
          v.pause();
          v.removeAttribute('src');
          v.load();
          v.remove();
        }
        if (o.userData.gallery) {
          for (const t of (o.userData.gallery as { texes: THREE.Texture[] }).texes) t.dispose();
        }
        o.geometry.dispose();
        disposeMaterial(o.material);
      }
    });
  }

  /**
   * Toroidal wrap: draw every item at the periodic image nearest the unit, so
   * the world repeats seamlessly. Only X/Z are wrapped; Y stays owned by the
   * morph (sink/rise). Runs before interaction/focus so they see fresh positions.
   */
  wrap(unitPos: THREE.Vector3) {
    const b = this.current;
    if (!b) return;
    for (const it of b.morphItems) {
      if (it.backdrop) {
        // distant scenery: hold a constant offset from the unit (always far)
        it.obj.position.x = unitPos.x + it.baseX;
        it.obj.position.z = unitPos.z + it.baseZ;
      } else {
        it.obj.position.x = wrapNearest(unitPos.x, it.baseX);
        it.obj.position.z = wrapNearest(unitPos.z, it.baseZ);
      }
    }
    // PadInstance.position stays the authored base; proximity uses toroidal
    // distance to it, so a pad fires from whichever image you drive onto.
  }

  update(dt: number, camera: THREE.Camera, unitPos: THREE.Vector3) {
    const b = this.current;
    if (!b) return;
    this.elapsed += dt;

    for (const o of b.billboards) {
      o.getWorldPosition(this.tmp);
      o.rotation.y = Math.atan2(camera.position.x - this.tmp.x, camera.position.z - this.tmp.z);
    }
    for (const o of b.spinners) {
      o.rotation.y += (o.userData.spinSpeed as number) * dt;
    }
    for (const p of b.pads) {
      p.pulse += dt * 2.5;
      if (p.glow) p.glow.emissiveIntensity = 0.45 + 0.35 * Math.sin(p.pulse);
    }
    for (const o of b.galleries) {
      const gal = o.userData.gallery as { texes: THREE.Texture[]; idx: number; t: number; phase: string; fadeT: number };
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
      const FADE = 0.4;
      if (gal.phase === 'hold') {
        gal.t += dt;
        if (gal.t >= 4.2) {
          gal.phase = 'out';
          gal.fadeT = 0;
        }
      } else if (gal.phase === 'out') {
        gal.fadeT += dt;
        m.opacity = Math.max(0, 1 - gal.fadeT / FADE);
        if (gal.fadeT >= FADE) {
          gal.idx = (gal.idx + 1) % gal.texes.length;
          m.map = gal.texes[gal.idx];
          m.needsUpdate = true;
          gal.phase = 'in';
          gal.fadeT = 0;
        }
      } else {
        gal.fadeT += dt;
        m.opacity = Math.min(1, gal.fadeT / FADE);
        if (gal.fadeT >= FADE) {
          m.opacity = 1;
          gal.phase = 'hold';
          gal.t = 0;
        }
      }
    }
    // play the demo video only when the unit is near the screen
    for (const o of b.videos) {
      o.getWorldPosition(this.tmp);
      const dx = this.tmp.x - unitPos.x;
      const dz = this.tmp.z - unitPos.z;
      const near = dx * dx + dz * dz < 14 * 14;
      const v = o.userData.video as HTMLVideoElement;
      if (near && v.paused) void v.play().catch(() => {});
      else if (!near && !v.paused) v.pause();
    }
    for (const o of b.waters) {
      const mat = (o as THREE.Mesh).material as THREE.Material;
      const shader = mat.userData.shader as { uniforms: { uTime: { value: number } } } | undefined;
      if (shader) shader.uniforms.uTime.value = this.elapsed;
    }
  }
}
