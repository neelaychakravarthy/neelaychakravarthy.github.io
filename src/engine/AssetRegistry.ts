import * as THREE from 'three';

/**
 * AssetRegistry — resolves a `modelId` to a 3D object.
 *
 * Phase 1 builds everything procedurally from primitives so we're not blocked on
 * asset sourcing. The manifest only ever references a string `modelId`, so when
 * we later swap a prefab for a CC0/custom glTF, the manifest doesn't change —
 * we just re-point the registry entry (see SPEC.md §2/§4).
 */
type Factory = (seed: number) => THREE.Object3D;

function std(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04, ...opts });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  return m;
}

const WARM_CANOPIES = ['#e8674a', '#f0a93f', '#d9534f', '#e0863a'];
const AGENT_COLORS = ['#4f86c6', '#5bb8a6', '#8a6fd1', '#d98a4f', '#5aa9e6', '#c2607f', '#5cc08a', '#b59a3f'];

export class AssetRegistry {
  private factories: Record<string, Factory> = {
    // ---------- hub ----------
    plaza: () => {
      const g = new THREE.Group();
      const disc = mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.12, 48), std('#dfe7f0', { roughness: 0.95 }), false);
      disc.position.y = 0.06;
      disc.receiveShadow = true;
      const rim = mesh(new THREE.TorusGeometry(6.5, 0.12, 10, 64), std('#c4d2e2'), false);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.12;
      g.add(disc, rim);
      return g;
    },
    monument: () => {
      const g = new THREE.Group();
      const base = mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), std('#b9c3cf'));
      base.position.y = 0.25;
      const pedestal = mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.4, 6), std('#cfd8e2'));
      pedestal.position.y = 1.2;
      const gem = mesh(new THREE.OctahedronGeometry(0.95, 0), std('#5b8def', { metalness: 0.25, roughness: 0.3, emissive: '#1b3a73', emissiveIntensity: 0.35 }));
      gem.position.y = 2.9;
      gem.userData.spinSpeed = 0.6;
      g.add(base, pedestal, gem);
      return g;
    },
    pillar: () => {
      const g = new THREE.Group();
      const base = mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), std('#d3dae3'));
      base.position.y = 0.15;
      const shaft = mesh(new THREE.CylinderGeometry(0.32, 0.46, 3.2, 12), std('#eef2f7'));
      shaft.position.y = 1.9;
      const cap = mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), std('#d3dae3'));
      cap.position.y = 3.6;
      g.add(base, shaft, cap);
      return g;
    },
    planter: () => {
      const g = new THREE.Group();
      const box = mesh(new THREE.BoxGeometry(1.6, 0.7, 1.6), std('#cdd6df'));
      box.position.y = 0.35;
      for (const [dx, dz, h] of [[-0.35, -0.2, 1.2], [0.35, 0.25, 1.5], [0.1, -0.4, 1.0]] as const) {
        const trunk = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), std('#8a5a3b'));
        trunk.position.set(dx, 0.85, dz);
        const leaf = mesh(new THREE.ConeGeometry(0.55, h, 8), std('#5fb87a', { roughness: 0.85 }));
        leaf.position.set(dx, 0.95 + h / 2, dz);
        g.add(trunk, leaf);
      }
      return g;
    },

    // ---------- goti (marketplace / negotiation) ----------
    'negotiation-table': () => {
      const g = new THREE.Group();
      const top = mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.22, 24), std('#9c6b3f'));
      top.position.y = 0.95;
      const inlay = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 24), std('#caa06a', { roughness: 0.5 }), false);
      inlay.position.y = 1.07;
      g.add(top, inlay);
      for (const a of [0, 1, 2, 3]) {
        const leg = mesh(new THREE.BoxGeometry(0.22, 0.95, 0.22), std('#7d5430'));
        leg.position.set(Math.cos((a * Math.PI) / 2) * 1.5, 0.47, Math.sin((a * Math.PI) / 2) * 1.5);
        g.add(leg);
      }
      // tokens / chips on the table
      for (let i = 0; i < 7; i++) {
        const chip = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12), std(AGENT_COLORS[i % AGENT_COLORS.length], { emissive: AGENT_COLORS[i % AGENT_COLORS.length], emissiveIntensity: 0.15 }));
        chip.position.set(Math.cos(i) * 0.9, 1.1, Math.sin(i * 1.7) * 0.9);
        g.add(chip);
      }
      return g;
    },
    agent: (seed) => {
      const g = new THREE.Group();
      const color = AGENT_COLORS[seed % AGENT_COLORS.length];
      const body = mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 12), std(color, { roughness: 0.5 }));
      body.position.y = 0.72;
      const head = mesh(new THREE.SphereGeometry(0.3, 16, 12), std('#2c3440', { roughness: 0.35 }));
      head.position.y = 1.42;
      const visor = mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), std(color, { emissive: color, emissiveIntensity: 0.7, roughness: 0.3 }));
      visor.position.set(0, 1.45, 0.26);
      const antenna = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), std('#2c3440'));
      antenna.position.y = 1.85;
      const tip = mesh(new THREE.SphereGeometry(0.07, 8, 8), std(color, { emissive: color, emissiveIntensity: 0.9 }));
      tip.position.y = 2.07;
      g.add(body, head, visor, antenna, tip);
      return g;
    },
    stall: (seed) => {
      const g = new THREE.Group();
      const canopyColor = WARM_CANOPIES[seed % WARM_CANOPIES.length];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const post = mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), std('#7d5430'));
        post.position.set(sx * 1.1, 1.2, sz * 0.9);
        g.add(post);
      }
      const roof = mesh(new THREE.ConeGeometry(2.0, 0.9, 4), std(canopyColor, { roughness: 0.6 }));
      roof.position.y = 2.85;
      roof.rotation.y = Math.PI / 4;
      const counter = mesh(new THREE.BoxGeometry(2.4, 0.9, 0.5), std('#9c6b3f'));
      counter.position.set(0, 0.45, 1.0);
      g.add(roof, counter);
      // goods
      for (let i = 0; i < 3; i++) {
        const good = mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), std(WARM_CANOPIES[(seed + i) % WARM_CANOPIES.length]));
        good.position.set(-0.6 + i * 0.6, 1.1, 1.0);
        g.add(good);
      }
      return g;
    },
    banner: (seed) => {
      const g = new THREE.Group();
      const pole = mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8), std('#6f4a2c'));
      pole.position.y = 2.1;
      const flag = mesh(new THREE.BoxGeometry(0.08, 1.1, 1.6), std(WARM_CANOPIES[seed % WARM_CANOPIES.length], { roughness: 0.55 }));
      flag.position.set(0, 3.4, 0.85);
      g.add(pole, flag);
      return g;
    },
    'crate-stack': () => {
      const g = new THREE.Group();
      const positions: Array<[number, number, number]> = [
        [0, 0.5, 0], [1.05, 0.5, 0.1], [0.5, 1.5, 0.05], [-0.2, 0.5, 0.9],
      ];
      for (const [x, y, z] of positions) {
        const crate = mesh(new THREE.BoxGeometry(1, 1, 1), std('#d8b27a'));
        crate.position.set(x, y, z);
        crate.receiveShadow = true;
        g.add(crate);
      }
      return g;
    },
  };

  create(modelId: string, seed = 0): THREE.Object3D {
    const factory = this.factories[modelId];
    if (!factory) {
      console.warn(`[AssetRegistry] unknown modelId "${modelId}" — using placeholder box`);
      return mesh(new THREE.BoxGeometry(1, 1, 1), std('#ff5a5a'));
    }
    return factory(seed);
  }
}
