import * as THREE from 'three';
import { WORLD_PERIOD } from './wrap';

/** Half-width (x) of the central grass land-bridge; the river is the gap beyond it. */
export const BRIDGE_HALF = 42;

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

/** Animated water material (gentle surface ripple). Mark its mesh userData.water
 *  so BiomeManager ticks the shader's uTime each frame. */
function makeWater(color: THREE.ColorRepresentation, opacity = 0.9): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.5, transparent: true, opacity });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.z += sin(position.x * 0.6 + uTime * 1.4) * 0.06 + sin(position.y * 0.9 + uTime * 1.1) * 0.05;`,
      );
  };
  return mat;
}

/** River water: like makeWater, but the fragment shader carves out the central
 *  land-bridge gap (|world x| < BRIDGE_HALF, periodic) so the bridge stays grass
 *  while the water tiles to either side. */
function makeRiverWater(color: THREE.ColorRepresentation, opacity: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.5, transparent: true, opacity, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uPeriod = { value: WORLD_PERIOD };
    shader.uniforms.uBridge = { value: BRIDGE_HALF };
    mat.userData.shader = shader;
    shader.vertexShader =
      'uniform float uTime;\nvarying float vWX;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.z += sin(position.x * 0.5 + uTime * 1.2) * 0.05 + sin(position.y * 0.7 + uTime * 0.9) * 0.04;
         vWX = (modelMatrix * vec4(transformed, 1.0)).x;`,
      );
    shader.fragmentShader =
      'uniform float uPeriod;\nuniform float uBridge;\nvarying float vWX;\n' +
      shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         float _dx = vWX - uPeriod * floor(vWX / uPeriod + 0.5);
         if (abs(_dx) < uBridge) discard;`,
      );
  };
  return mat;
}

/** A cylinder spanning two points (for cables / struts). */
function connect(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 6), mat);
  m.castShadow = false;
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

function waterPoloGoal(): THREE.Group {
  const g = new THREE.Group();
  const mat = std('#f2f5f8', { roughness: 0.5 });
  const w = 1.6;
  const h = 0.85;
  const l = mesh(new THREE.BoxGeometry(0.08, h, 0.08), mat);
  l.position.set(-w / 2, h / 2, 0);
  const r = mesh(new THREE.BoxGeometry(0.08, h, 0.08), mat);
  r.position.set(w / 2, h / 2, 0);
  const top = mesh(new THREE.BoxGeometry(w + 0.08, 0.08, 0.08), mat);
  top.position.set(0, h, 0);
  const net = mesh(new THREE.PlaneGeometry(w, h), std('#ffffff', { transparent: true, opacity: 0.22, side: THREE.DoubleSide }), false);
  net.position.set(0, h / 2, -0.22);
  g.add(l, r, top, net);
  return g;
}

function palm(): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = std('#9a7b4a');
  for (let i = 0; i < 5; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.12 - i * 0.012, 0.15 - i * 0.012, 0.6, 7), trunkMat);
    seg.position.set(i * 0.12, 0.3 + i * 0.55, 0);
    seg.rotation.z = -0.09 * i;
    g.add(seg);
  }
  const leafMat = std('#4f9a52', { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = mesh(new THREE.ConeGeometry(0.22, 2.0, 4), leafMat, false);
    leaf.position.set(0.55 + Math.cos(a) * 0.5, 3.0, Math.sin(a) * 0.5);
    leaf.rotation.set(Math.PI / 2.4, a, Math.cos(a) * 0.3);
    g.add(leaf);
  }
  return g;
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
    planter: (seed) => {
      const g = new THREE.Group();
      const trunk = mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.2, 7), std('#8a5a3b'));
      trunk.position.y = 0.6;
      const foliage = std(['#4fa86c', '#5fb87a', '#69b97e'][seed % 3], { roughness: 0.85 });
      const c1 = mesh(new THREE.ConeGeometry(1.05, 1.7, 8), foliage);
      c1.position.y = 1.5;
      const c2 = mesh(new THREE.ConeGeometry(0.8, 1.35, 8), foliage);
      c2.position.y = 2.3;
      const c3 = mesh(new THREE.ConeGeometry(0.52, 1.05, 8), foliage);
      c3.position.y = 2.95;
      g.add(trunk, c1, c2, c3);
      g.rotation.y = Math.random() * Math.PI * 2;
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

    // ---------- shared / thematic set pieces ----------
    gateway: () => {
      const g = new THREE.Group();
      const stone = std('#d2dae4');
      for (const sx of [-1, 1]) {
        const post = mesh(new THREE.BoxGeometry(0.5, 4.0, 0.5), stone);
        post.position.set(sx * 1.7, 2.0, 0);
        g.add(post);
      }
      const top = mesh(new THREE.BoxGeometry(4.2, 0.6, 0.5), stone);
      top.position.y = 4.3;
      const portal = mesh(
        new THREE.PlaneGeometry(2.9, 3.7),
        std('#cfe6ff', { emissive: '#bfe0ff', emissiveIntensity: 0.4, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
        false,
      );
      portal.position.y = 2.05;
      g.add(top, portal);
      return g;
    },
    'big-phone': (seed) => {
      const g = new THREE.Group();
      const screenColor = ['#3ddc84', '#4aa3ff'][seed % 2]; // iMessage green / Telegram blue
      const stand = mesh(new THREE.BoxGeometry(1.7, 0.4, 1.3), std('#2a3550'));
      stand.position.y = 0.2;
      const body = mesh(new THREE.BoxGeometry(3.0, 5.6, 0.45), std('#10141d', { roughness: 0.4 }));
      body.position.y = 3.2;
      const screen = mesh(
        new THREE.PlaneGeometry(2.55, 5.0),
        std('#0a0f16', { emissive: screenColor, emissiveIntensity: 0.16, roughness: 0.3 }),
        false,
      );
      screen.position.set(0, 3.3, 0.24);
      g.add(stand, body, screen);
      // chat bubbles on the screen
      for (let i = 0; i < 4; i++) {
        const left = i % 2 === 0;
        const incoming = left;
        const bub = mesh(
          new THREE.BoxGeometry(1.5, 0.62, 0.06),
          std(incoming ? '#e6edf5' : screenColor, { emissive: incoming ? '#000000' : screenColor, emissiveIntensity: incoming ? 0 : 0.5, roughness: 0.4 }),
          false,
        );
        bub.position.set(left ? -0.45 : 0.45, 4.7 - i * 0.9, 0.27);
        g.add(bub);
      }
      return g;
    },
    hero: () => {
      const g = new THREE.Group();
      const body = mesh(new THREE.CapsuleGeometry(0.5, 1.0, 6, 12), std('#e8533d', { roughness: 0.5 }));
      body.position.y = 1.1;
      const head = mesh(new THREE.SphereGeometry(0.42, 16, 12), std('#ffd9cf', { roughness: 0.5 }));
      head.position.y = 2.15;
      const cape = mesh(new THREE.BoxGeometry(1.0, 1.4, 0.12), std('#c33a27', { roughness: 0.55 }));
      cape.position.set(0, 1.35, -0.42);
      g.add(body, head, cape);
      return g;
    },
    'sidekick-bot': () => {
      const g = new THREE.Group();
      const body = mesh(new THREE.SphereGeometry(0.42, 16, 14), std('#3fe0c8', { emissive: '#19b59c', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2 }), false);
      body.position.y = 1.0;
      const eye = mesh(new THREE.SphereGeometry(0.13, 10, 10), std('#0e1726'), false);
      eye.position.set(0, 1.05, 0.36);
      const antenna = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), std('#2c3440'));
      antenna.position.y = 1.5;
      const tip = mesh(new THREE.SphereGeometry(0.08, 8, 8), std('#5ad1ff', { emissive: '#5ad1ff', emissiveIntensity: 0.95 }), false);
      tip.position.y = 1.7;
      g.add(body, eye, antenna, tip);
      g.userData.billboard = true; // keep the bot's eye on the visitor
      return g;
    },
    lamppost: () => {
      const g = new THREE.Group();
      const pole = mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 8), std('#5a4632'));
      pole.position.y = 1.6;
      const cap = mesh(new THREE.CylinderGeometry(0.05, 0.2, 0.24, 8), std('#3a2e22'));
      cap.position.y = 3.45;
      const lamp = mesh(new THREE.SphereGeometry(0.22, 12, 10), std('#ffe6a8', { emissive: '#ffcf6b', emissiveIntensity: 1.0 }), false);
      lamp.position.y = 3.2;
      g.add(pole, cap, lamp);
      return g;
    },

    // ---------- university / academic ----------
    'university-building': () => {
      const g = new THREE.Group();
      const stone = std('#e3dcc8', { roughness: 0.85 });
      const darkStone = std('#cabfa3', { roughness: 0.85 });
      const base = mesh(new THREE.BoxGeometry(11, 0.6, 6), darkStone);
      base.position.y = 0.3;
      const step = mesh(new THREE.BoxGeometry(10, 0.5, 5), stone);
      step.position.y = 0.85;
      const floor = mesh(new THREE.BoxGeometry(9.5, 0.4, 4.6), stone);
      floor.position.y = 1.3;
      const wall = mesh(new THREE.BoxGeometry(9, 3.4, 0.7), darkStone);
      wall.position.set(0, 3.2, -1.6);
      g.add(base, step, floor, wall);
      for (let i = 0; i < 6; i++) {
        const col = mesh(new THREE.CylinderGeometry(0.32, 0.36, 3.4, 14), stone);
        col.position.set(-4 + i * 1.6, 3.2, 1.8);
        g.add(col);
      }
      const entablature = mesh(new THREE.BoxGeometry(9.8, 0.7, 4.6), stone);
      entablature.position.y = 5.25;
      const roof = mesh(new THREE.ConeGeometry(6.4, 2.2, 4), darkStone);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 6.7;
      g.add(entablature, roof);
      // clock tower
      const tower = mesh(new THREE.BoxGeometry(1.7, 2.6, 1.7), stone);
      tower.position.y = 7.4;
      const towerRoof = mesh(new THREE.ConeGeometry(1.35, 1.4, 4), darkStone);
      towerRoof.rotation.y = Math.PI / 4;
      towerRoof.position.y = 9.1;
      const clock = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 18), std('#fff6e0', { emissive: '#ffe6a8', emissiveIntensity: 0.8 }), false);
      clock.rotation.x = Math.PI / 2;
      clock.position.set(0, 7.6, 0.9);
      g.add(tower, towerRoof, clock);
      // cardinal banners between columns
      for (const x of [-2.4, 2.4]) {
        const banner = mesh(new THREE.BoxGeometry(0.7, 1.8, 0.08), std('#9e1b32', { roughness: 0.6 }));
        banner.position.set(x, 3.5, 2.1);
        g.add(banner);
      }
      return g;
    },
    desk: () => {
      const g = new THREE.Group();
      const top = mesh(new THREE.BoxGeometry(1.5, 0.1, 0.85), std('#b48a52'));
      top.position.y = 0.76;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const leg = mesh(new THREE.BoxGeometry(0.1, 0.76, 0.1), std('#6b4f2a'));
        leg.position.set(sx * 0.64, 0.38, sz * 0.34);
        g.add(leg);
      }
      g.add(top);
      return g;
    },
    'computer-desk': () => {
      const g = new THREE.Group();
      const top = mesh(new THREE.BoxGeometry(1.7, 0.1, 0.95), std('#c9cfd6'));
      top.position.y = 0.78;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const leg = mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), std('#7d8794'));
        leg.position.set(sx * 0.72, 0.39, sz * 0.38);
        g.add(leg);
      }
      const stand = mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), std('#2a3340'));
      stand.position.set(0, 1.0, -0.12);
      const bezel = mesh(new THREE.BoxGeometry(1.05, 0.66, 0.06), std('#12161d'));
      bezel.position.set(0, 1.5, -0.12);
      const screen = mesh(new THREE.PlaneGeometry(0.92, 0.54), std('#5aa9e6', { emissive: '#5aa9e6', emissiveIntensity: 0.7, roughness: 0.4 }), false);
      screen.position.set(0, 1.5, -0.085);
      g.add(top, stand, bezel, screen);
      return g;
    },
    chalkboard: (seed) => {
      const g = new THREE.Group();
      const frame = mesh(new THREE.BoxGeometry(3.3, 2.1, 0.12), std('#5a4632'));
      frame.position.y = 1.85;
      const board = mesh(new THREE.BoxGeometry(3.0, 1.8, 0.04), std('#26402e', { roughness: 0.95 }));
      board.position.set(0, 1.85, 0.07);
      g.add(frame, board);
      const chalk = std('#e8ece4', { emissive: '#e8ece4', emissiveIntensity: 0.18, roughness: 0.9 });
      for (let i = 0; i < 4; i++) {
        const ln = mesh(new THREE.BoxGeometry(1.5 - i * 0.22 - (seed % 2) * 0.2, 0.04, 0.02), chalk, false);
        ln.position.set(-0.6 + (i % 2) * 0.3, 2.45 - i * 0.34, 0.1);
        g.add(ln);
      }
      const ax1 = mesh(new THREE.BoxGeometry(0.03, 0.85, 0.02), chalk, false);
      ax1.position.set(0.85, 1.5, 0.1);
      const ax2 = mesh(new THREE.BoxGeometry(0.85, 0.03, 0.02), chalk, false);
      ax2.position.set(1.2, 1.1, 0.1);
      g.add(ax1, ax2);
      for (const sx of [-1, 1]) {
        const leg = mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), std('#5a4632'));
        leg.position.set(sx * 1.35, 0.47, 0);
        g.add(leg);
      }
      return g;
    },
    podium: () => {
      const g = new THREE.Group();
      const wood = std('#7d5a36');
      const stand = mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.1, 8), wood);
      stand.position.y = 0.55;
      const top = mesh(new THREE.BoxGeometry(0.85, 0.12, 0.55), wood);
      top.position.set(0, 1.2, 0.05);
      top.rotation.x = -0.32;
      g.add(stand, top);
      return g;
    },
    'book-stack': (seed) => {
      const g = new THREE.Group();
      const colors = ['#9e1b32', '#2c5e8a', '#3a7d4f', '#c08a2a', '#5a4632'];
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const b = mesh(new THREE.BoxGeometry(0.72 - i * 0.05, 0.16, 0.52), std(colors[(seed + i) % colors.length]));
        b.position.set((i % 2) * 0.06 - 0.03, y + 0.08, 0);
        b.rotation.y = (i % 2) * 0.12;
        g.add(b);
        y += 0.16;
      }
      return g;
    },

    // ---------- personal set pieces (hub) ----------
    'swimming-pool': () => {
      const g = new THREE.Group();
      const L = 13;
      const W = 7;
      const deckMat = std('#d4dae0', { roughness: 0.9 });
      const longN = mesh(new THREE.BoxGeometry(L + 1.6, 0.3, 0.8), deckMat);
      longN.position.set(0, 0.15, W / 2 + 0.4);
      const longS = mesh(new THREE.BoxGeometry(L + 1.6, 0.3, 0.8), deckMat);
      longS.position.set(0, 0.15, -W / 2 - 0.4);
      const shortE = mesh(new THREE.BoxGeometry(0.8, 0.3, W), deckMat);
      shortE.position.set(L / 2 + 0.4, 0.15, 0);
      const shortW = mesh(new THREE.BoxGeometry(0.8, 0.3, W), deckMat);
      shortW.position.set(-L / 2 - 0.4, 0.15, 0);
      const floor = mesh(new THREE.BoxGeometry(L, 0.1, W), std('#86c8de'));
      floor.position.y = 0.06;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(L, W, 26, 16), makeWater('#2f9bd6', 0.85));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.23;
      water.userData.water = true;
      g.add(longN, longS, shortE, shortW, floor, water);
      // swimming half: lane ropes along the length
      const ropeCols = ['#f0d23f', '#e6533f', '#f0d23f'];
      for (let i = 0; i < 3; i++) {
        const rope = mesh(new THREE.CylinderGeometry(0.05, 0.05, L - 0.3, 6), std(ropeCols[i], { emissive: ropeCols[i], emissiveIntensity: 0.18 }), false);
        rope.rotation.z = Math.PI / 2;
        rope.position.set(0, 0.3, 0.85 + i * 0.95);
        g.add(rope);
      }
      // water-polo half: goals at each end + coloured field markers
      for (const sx of [-1, 1]) {
        const goal = waterPoloGoal();
        goal.position.set(sx * (L / 2 - 0.5), 0.27, -W / 4);
        // face down the length of the pool (into the court), nets at the ends
        goal.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(goal);
      }
      const marks = ['#e6533f', '#f0d23f', '#ffffff', '#f0d23f', '#e6533f'];
      for (let i = 0; i < marks.length; i++) {
        const m = mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), std(marks[i], { emissive: marks[i], emissiveIntensity: 0.2 }), false);
        m.position.set(-L / 2 + 1.3 + (i * (L - 2.6)) / (marks.length - 1), 0.31, -W / 2 + 0.4);
        g.add(m);
      }
      return g;
    },
    // A shoreline sand strip where the grass land-bridge meets the river. The
    // outer (local +x) edge sits at the water; umbrella + palms go on the inland
    // (local -x) side. Placed at both bridge edges (the west one rotated 180°).
    beach: () => {
      const g = new THREE.Group();
      const sand = mesh(new THREE.BoxGeometry(11, 0.25, 50), std('#e8d4a2', { roughness: 1 }));
      sand.position.set(0, 0.13, 0);
      sand.receiveShadow = true;
      g.add(sand);
      const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), std('#c9c9c9'));
      pole.position.set(-3, 1.1, 6);
      const canopy = mesh(new THREE.ConeGeometry(1.5, 0.7, 12), std('#e6533f', { roughness: 0.7 }));
      canopy.position.set(-3, 2.35, 6);
      g.add(pole, canopy);
      const p1 = palm();
      p1.position.set(-3.5, 0.2, -12);
      const p2 = palm();
      p2.position.set(-3, 0.2, 17);
      p2.rotation.y = 1.2;
      p2.scale.setScalar(0.85);
      g.add(p1, p2);
      return g;
    },
    // The looping river: a wide water band whose shader carves out the central
    // land-bridge so the plaza grass crosses it. Tiles E-W with the world.
    river: () => {
      const g = new THREE.Group();
      const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_PERIOD * 3, 50, 64, 14), makeRiverWater('#2f86c4', 0.95));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.1;
      water.userData.water = true;
      g.add(water);
      return g;
    },
    'ski-mountain': () => {
      const g = new THREE.Group();
      const rockMat = std('#8a94a0', { roughness: 1 });
      const snowMat = std('#f2f7ff', { roughness: 0.85 });
      const m1 = mesh(new THREE.ConeGeometry(20, 27, 7), rockMat);
      m1.position.y = 13.5;
      m1.rotation.y = 0.3;
      const s1 = mesh(new THREE.ConeGeometry(9.5, 12, 7), snowMat);
      s1.position.y = 21.5;
      s1.rotation.y = 0.3;
      const m2 = mesh(new THREE.ConeGeometry(13, 19, 7), std('#929ca8', { roughness: 1 }));
      m2.position.set(17, 9.5, 7);
      m2.rotation.y = 0.8;
      const s2 = mesh(new THREE.ConeGeometry(6, 8, 7), snowMat);
      s2.position.set(17, 15.5, 7);
      s2.rotation.y = 0.8;
      g.add(m1, s1, m2, s2);
      // ski lift up the front slope
      const liftMat = std('#3a3f48');
      const bottom = new THREE.Vector3(-3, 1.2, 19);
      const top = new THREE.Vector3(0, 18, 4);
      for (let i = 1; i < 5; i++) {
        const p = bottom.clone().lerp(top, i / 5);
        const tower = mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.6, 6), liftMat);
        tower.position.set(p.x, p.y + 0.3, p.z);
        g.add(tower);
      }
      g.add(connect(bottom.clone().setY(bottom.y + 1.3), top.clone().setY(top.y + 1.3), 0.04, std('#23272e')));
      for (let i = 0; i < 5; i++) {
        const p = bottom.clone().lerp(top, 0.1 + i * 0.2).add(new THREE.Vector3(0, 1.3, 0));
        const hanger = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), liftMat, false);
        hanger.position.set(p.x, p.y - 0.2, p.z);
        const chair = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.35), std('#e0a93f'), false);
        chair.position.set(p.x, p.y - 0.45, p.z);
        g.add(hanger, chair);
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
