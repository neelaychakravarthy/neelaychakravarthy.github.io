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

    // ---------- sidekick (comms / chat network) ----------
    'hub-core': () => {
      const g = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(1.3, 1.6, 0.4, 12), std('#2a3550'));
      base.position.y = 0.2;
      const pillar = mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.4, 10), std('#39466b'));
      pillar.position.y = 1.05;
      const core = mesh(new THREE.IcosahedronGeometry(1.05, 0), std('#3fe0c8', { emissive: '#19b59c', emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.2 }));
      core.position.y = 2.75;
      core.userData.spinSpeed = 0.5;
      const ring = mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 40), std('#5ad1ff', { emissive: '#5ad1ff', emissiveIntensity: 0.85 }), false);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2.75;
      ring.userData.spinSpeed = -0.8;
      g.add(base, pillar, core, ring);
      return g;
    },
    'platform-node': (seed) => {
      const g = new THREE.Group();
      const c = ['#4aa3ff', '#3ddc84'][seed % 2]; // telegram blue / imessage green
      const base = mesh(new THREE.BoxGeometry(1.8, 0.3, 1.1), std('#2a3550'));
      base.position.y = 0.15;
      const post = mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), std('#39466b'));
      post.position.y = 1.0;
      const screen = mesh(new THREE.BoxGeometry(1.5, 1.1, 0.16), std('#10151c'));
      screen.position.y = 2.1;
      const glow = mesh(new THREE.PlaneGeometry(1.2, 0.85), std(c, { emissive: c, emissiveIntensity: 0.85, roughness: 0.4 }), false);
      glow.position.set(0, 2.1, 0.1);
      g.add(base, post, screen, glow);
      return g;
    },
    'pipeline-gate': () => {
      const g = new THREE.Group();
      const left = mesh(new THREE.BoxGeometry(0.35, 3.0, 0.35), std('#39466b'));
      left.position.set(-1.3, 1.5, 0);
      const right = mesh(new THREE.BoxGeometry(0.35, 3.0, 0.35), std('#39466b'));
      right.position.set(1.3, 1.5, 0);
      const beam = mesh(new THREE.BoxGeometry(2.95, 0.4, 0.35), std('#39466b'));
      beam.position.y = 3.2;
      const bar = mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), std('#6f8fff', { emissive: '#6f8fff', emissiveIntensity: 0.85 }), false);
      bar.position.y = 2.9;
      g.add(left, right, beam, bar);
      return g;
    },
    'memory-crystal': () => {
      const g = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.4, 6), std('#2a3550'));
      base.position.y = 0.2;
      const crystal = mesh(new THREE.OctahedronGeometry(0.7, 0), std('#b06fff', { emissive: '#8a3fff', emissiveIntensity: 0.75, roughness: 0.2, metalness: 0.2 }));
      crystal.position.y = 1.5;
      crystal.userData.spinSpeed = 0.7;
      g.add(base, crystal);
      return g;
    },
    'chat-bubble': (seed) => {
      const g = new THREE.Group();
      const c = ['#5ad1ff', '#8a7dff', '#5be0c0', '#ff8ac0'][seed % 4];
      const h = 1.7 + (seed % 3) * 0.55;
      const mat = std(c, { emissive: c, emissiveIntensity: 0.4, roughness: 0.5 });
      const body = mesh(new THREE.SphereGeometry(0.6, 18, 14), mat, false);
      body.scale.set(1.15, 0.85, 0.7);
      body.position.y = h;
      const tail = mesh(new THREE.ConeGeometry(0.16, 0.34, 4), mat, false);
      tail.position.set(-0.18, h - 0.55, 0.1);
      tail.rotation.z = 0.35;
      for (let i = -1; i <= 1; i++) {
        const dot = mesh(new THREE.SphereGeometry(0.08, 8, 8), std('#0e1726'), false);
        dot.position.set(i * 0.22, h, 0.43);
        g.add(dot);
      }
      g.add(body, tail);
      g.userData.billboard = true; // face the camera like a real chat bubble
      return g;
    },
    lock: () => {
      const g = new THREE.Group();
      const post = mesh(new THREE.BoxGeometry(0.2, 1.0, 0.2), std('#39466b'));
      post.position.y = 0.5;
      const body = mesh(new THREE.BoxGeometry(0.7, 0.6, 0.3), std('#9fb0c8', { metalness: 0.3, roughness: 0.4 }));
      body.position.y = 1.35;
      const shackle = mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16, Math.PI), std('#c7d2e0', { metalness: 0.3 }), false);
      shackle.position.y = 1.62;
      const hole = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 8), std('#3fe0c8', { emissive: '#3fe0c8', emissiveIntensity: 0.7 }), false);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(0, 1.32, 0.16);
      g.add(post, body, shackle, hole);
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
