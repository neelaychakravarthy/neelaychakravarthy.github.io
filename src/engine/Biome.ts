import * as THREE from 'three';
import type { Text } from 'troika-three-text';
import type { BiomeConfig, WorldConfig } from '../world/types';
import type { AssetRegistry } from './AssetRegistry';
import { EnvironmentController } from './EnvironmentController';
import { makeContent, makePad } from './interactables';

/** How far (world units) structures drop below ground when sunk during a morph. */
export const MORPH_SINK = 10;

export interface MorphItem {
  obj: THREE.Object3D;
  baseY: number;
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
    morphItems.push({ obj, baseY: obj.position.y });
  };

  (config.structures ?? []).forEach((s, i) => {
    const obj = registry.create(s.modelId, i);
    obj.position.set(...s.position);
    if (s.rotationY) obj.rotation.y = s.rotationY;
    if (s.scale) obj.scale.setScalar(s.scale);
    addItem(obj);
  });

  for (const c of config.content ?? []) addItem(makeContent(c));
  for (const p of config.pads ?? []) addItem(makePad(p));

  // Collect interactive bits generically from userData tags.
  const clickables: THREE.Object3D[] = [];
  const billboards: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.userData.url !== undefined) clickables.push(o);
    if (o.userData.billboard) billboards.push(o);
    if (o.userData.spinSpeed) spinners.push(o);
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

  scene.add(group);
  return { id: config.id, config, group, morphItems, clickables, pads, billboards, spinners };
}

function disposeMaterial(m: THREE.Material | THREE.Material[]) {
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
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
        o.geometry.dispose();
        disposeMaterial(o.material);
      }
    });
  }

  update(dt: number, camera: THREE.Camera) {
    const b = this.current;
    if (!b) return;

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
  }
}
