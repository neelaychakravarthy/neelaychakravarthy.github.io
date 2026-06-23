import * as THREE from 'three';
import { WORLD_PERIOD } from './wrap';
import { SUMMIT_BASE_Y, SUMMIT_DOME, SUMMIT_RADIUS } from './summit';

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

// ---- chakra (foundry / workshop) palette ----
const CHAKRA_ORANGE = '#d9691f';
const CHAKRA_BRAND = '#b85000';
const CHAKRA_EMBER = '#ff7a1f';
const METAL_DK = '#2b2622';
const METAL_MD = '#4a4138';

/**
 * A low-poly cog wheel built in the local XY plane (its face points +Z), so a
 * group with userData.spinSpeed + spinAxis 'z' turns it like a wheel. Used for
 * the Chakra gear monument, the engine housings, and scattered cogs.
 */
function makeGear(radius: number, teeth: number, thickness: number, body: THREE.Material, tooth: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const disc = mesh(new THREE.CylinderGeometry(radius, radius, thickness, Math.max(16, teeth)), body);
  disc.rotation.x = Math.PI / 2; // lay the circular face toward +Z
  g.add(disc);
  const tw = ((radius * 2 * Math.PI) / teeth) * 0.55; // tangential tooth width
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = mesh(new THREE.BoxGeometry(tw, radius * 0.3, thickness), tooth);
    t.position.set(Math.cos(a) * (radius + radius * 0.06), Math.sin(a) * (radius + radius * 0.06), 0);
    t.rotation.z = a - Math.PI / 2; // align the tooth's length radially outward
    g.add(t);
  }
  const hub = mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, thickness * 1.3, 14), tooth);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 5; i++) {
    const spoke = mesh(new THREE.BoxGeometry(radius * 0.13, radius * 1.25, thickness * 0.7), body);
    spoke.rotation.z = (i / 5) * Math.PI * 2;
    g.add(spoke);
  }
  return g;
}

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
    // A big mountain whose flat-ish top is a DRIVABLE snow dome (the summit lives
    // in the hub — no biome switch). A continuous chair-lift loops up the south
    // face and around bullwheels at both terminals; the car boards, a chair brings
    // it up, and it drives off onto the dome. Geometry is local; the mountain is
    // authored at (-22, 0, -56). See summit.ts for the drivable surface.
    'ski-mountain': () => {
      const g = new THREE.Group();
      const rockMat = std('#8a94a0', { roughness: 1 });
      const rockDk = std('#7c8590', { roughness: 1 });
      const snowMat = std('#eef4fb', { roughness: 0.9 });
      // truncated cone (frustum): wide base, broad flat top to carry the summit
      const body = mesh(new THREE.CylinderGeometry(15, 27, 24, 12), rockMat);
      body.position.y = 12;
      const skirt = mesh(new THREE.CylinderGeometry(20, 30, 9, 12), rockDk);
      skirt.position.y = 4.5;
      const snowSkirt = mesh(new THREE.CylinderGeometry(15.4, 19, 8, 12), snowMat);
      snowSkirt.position.y = 20;
      g.add(skirt, body, snowSkirt);

      // the drivable snow dome on top (a gentle bumpy crown, radius 15 to overhang
      // the rim so the car never sees the mesh edge). Matches summit.ts.
      {
        const R = 15;
        const rings = 5;
        const segs = 30;
        const r2 = SUMMIT_RADIUS * SUMMIT_RADIUS;
        const hAt = (x: number, z: number) =>
          SUMMIT_BASE_Y + SUMMIT_DOME * (1 - Math.min(1, (x * x + z * z) / r2)) + Math.sin(x * 0.4) * 0.4 + Math.cos(z * 0.45) * 0.4;
        const verts: number[] = [0, hAt(0, 0), 0];
        for (let ring = 1; ring <= rings; ring++) {
          const r = (R * ring) / rings;
          for (let s = 0; s < segs; s++) {
            const a = (s / segs) * Math.PI * 2;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            verts.push(x, hAt(x, z), z);
          }
        }
        const idx: number[] = [];
        for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
        for (let ring = 1; ring < rings; ring++) {
          const a0 = 1 + (ring - 1) * segs;
          const b0 = 1 + ring * segs;
          for (let s = 0; s < segs; s++) {
            const a = a0 + s;
            const b = a0 + ((s + 1) % segs);
            const c = b0 + s;
            const d = b0 + ((s + 1) % segs);
            idx.push(a, d, c, a, b, d);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const dome = mesh(geo, std('#eef4fb', { roughness: 0.92, side: THREE.DoubleSide }));
        dome.receiveShadow = true;
        g.add(dome);
      }

      // a sharp secondary peak at the back rim, for a proper summit silhouette
      const peak = mesh(new THREE.ConeGeometry(6, 16, 7), rockDk);
      peak.position.set(2, SUMMIT_BASE_Y + 7, -11);
      const peakSnow = mesh(new THREE.ConeGeometry(3.2, 7, 7), snowMat);
      peakSnow.position.set(2, SUMMIT_BASE_Y + 12, -11);
      g.add(peak, peakSnow);

      // ---- the chair-lift, a continuous conveyor loop up the south face ----
      const liftMat = std('#3a3f48', { metalness: 0.3 });
      const cableMat = std('#23272e');
      const seatMat = std('#e0a93f');
      // closed loop (local): up the front cable, around the top wheel, down the
      // back cable, around the base wheel. Endpoints match world.json lift.ride.
      const loop = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(0, 2, 30), // base, foot of the up-cable
          new THREE.Vector3(0, 25, 14), // top of the up-cable (summit front rim)
          new THREE.Vector3(1.5, 26.5, 13), // over the top bullwheel
          new THREE.Vector3(3, 25, 14), // top of the down-cable
          new THREE.Vector3(3, 2, 30), // base of the down-cable
          new THREE.Vector3(1.5, 1, 31), // around the base bullwheel
        ],
        true,
        'catmullrom',
        0.5,
      );

      // terminals (platform + A-frame + spinning bullwheel) at base and top
      const terminal = (x: number, y: number, z: number, s: number) => {
        const t = new THREE.Group();
        const plat = mesh(new THREE.BoxGeometry(3.4 * s, 0.7, 3.0 * s), std('#5a6068'));
        plat.position.y = 0.35;
        plat.receiveShadow = true;
        t.add(plat);
        for (const sx of [-1, 1]) {
          const post = mesh(new THREE.CylinderGeometry(0.2 * s, 0.26 * s, 3.6 * s, 6), liftMat);
          post.position.set(sx * 1.4 * s, 2.0 * s, 0);
          t.add(post);
        }
        const wheel = mesh(new THREE.CylinderGeometry(1.4 * s, 1.4 * s, 0.34 * s, 18), std('#c0c6cf', { metalness: 0.4 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(1.5 * s, 3.7 * s, 0);
        wheel.userData.spinSpeed = 0.9;
        wheel.userData.spinAxis = 'x';
        t.add(wheel);
        t.position.set(x, y, z);
        return t;
      };
      g.add(terminal(0, 0, 30.5, 1.0)); // base terminal
      g.add(terminal(0, 24, 13.5, 0.9)); // top terminal (on the summit rim)

      // towers up the slope (between the cable lines)
      for (let i = 1; i < 6; i++) {
        const p = loop.getPoint(i / 12); // along the up-cable portion
        const tower = mesh(new THREE.CylinderGeometry(0.22, 0.32, 3.4, 6), liftMat);
        tower.position.set(1.5, p.y - 1.0, p.z);
        const arm = mesh(new THREE.BoxGeometry(4.0, 0.2, 0.2), liftMat);
        arm.position.set(1.5, p.y + 0.7, p.z);
        g.add(tower, arm);
      }

      // the two cables, drawn from the loop's straight segments
      g.add(connect(loop.getPoint(0), loop.getPoint(1 / 6), 0.07, cableMat));
      g.add(connect(loop.getPoint(3 / 6), loop.getPoint(4 / 6), 0.07, cableMat));

      // evenly-spaced chairs; the LiftController moves them around the loop
      const chairs: THREE.Group[] = [];
      for (let i = 0; i < 12; i++) {
        const c = new THREE.Group();
        const hanger = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), liftMat, false);
        hanger.position.y = -0.35;
        const seat = mesh(new THREE.BoxGeometry(0.9, 0.14, 0.6), seatMat, false);
        seat.position.y = -0.78;
        const backrest = mesh(new THREE.BoxGeometry(0.9, 0.5, 0.1), seatMat, false);
        backrest.position.set(0, -0.52, -0.28);
        c.add(hanger, seat, backrest);
        g.add(c);
        chairs.push(c);
      }
      g.userData.skiLift = { loop, chairs, speed: 0.05, hang: 0.78 };
      return g;
    },

    // ---------- chakra (multi-tenant BoM / inventory foundry) ----------
    // Signature landmark: a big orange cog (the brand mark) on a pedestal, turning
    // slowly, with a glowing twin-ring "spiral" core. Looms behind the info board.
    'chakra-gear': () => {
      const g = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(1.7, 2.2, 1.0, 8), std(METAL_DK, { metalness: 0.3, roughness: 0.7 }));
      base.position.y = 0.5;
      base.receiveShadow = true;
      const neck = mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.8, 8), std(METAL_MD, { metalness: 0.4, roughness: 0.6 }));
      neck.position.y = 2.3;
      g.add(base, neck);
      const gear = makeGear(3.0, 16, 0.6, std(CHAKRA_BRAND, { metalness: 0.45, roughness: 0.5 }), std(CHAKRA_ORANGE, { emissive: CHAKRA_ORANGE, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.45 }));
      gear.position.y = 6.0; // raised so the cog crowns the info board rather than hiding behind it
      gear.userData.spinSpeed = 0.32;
      gear.userData.spinAxis = 'z';
      g.add(gear);
      // glowing twin-ring swirl at the hub (the chakra spiral)
      const ring1 = mesh(new THREE.TorusGeometry(0.82, 0.17, 10, 24), std(CHAKRA_EMBER, { emissive: CHAKRA_EMBER, emissiveIntensity: 0.9, roughness: 0.3 }), false);
      ring1.position.set(0, 6.0, 0.34);
      ring1.userData.spinSpeed = -0.55;
      ring1.userData.spinAxis = 'z';
      const ring2 = mesh(new THREE.TorusGeometry(0.44, 0.13, 10, 20), std('#ffd27a', { emissive: '#ffb24a', emissiveIntensity: 1.0, roughness: 0.3 }), false);
      ring2.position.set(0, 6.0, 0.37);
      ring2.userData.spinSpeed = 0.85;
      ring2.userData.spinAxis = 'z';
      g.add(ring1, ring2);
      return g;
    },
    // a single scattered cog (sized via manifest `scale`); odd/even instances
    // counter-rotate so neighbours read as meshing.
    gear: (seed) => {
      const cols = [CHAKRA_ORANGE, CHAKRA_BRAND, '#c2691f', '#5a4a3a'];
      const g = makeGear(1.0, 12, 0.4, std(cols[seed % cols.length], { metalness: 0.45, roughness: 0.5 }), std('#3a332b', { metalness: 0.5, roughness: 0.45 }));
      g.userData.spinSpeed = (seed % 2 === 0 ? 1 : -1) * 0.7;
      g.userData.spinAxis = 'z';
      return g;
    },
    // the "engine": a dark housing with three meshing cogs turning on its face —
    // a stand-in for Chakra's transactional inventory/consumption engine.
    machine: () => {
      const g = new THREE.Group();
      const frame = mesh(new THREE.BoxGeometry(5.6, 4.6, 0.4), std('#1f1b17', { roughness: 0.8 }));
      frame.position.set(0, 2.6, -0.55);
      const panel = mesh(new THREE.BoxGeometry(5.2, 4.2, 0.5), std(METAL_DK, { metalness: 0.3, roughness: 0.7 }));
      panel.position.set(0, 2.6, -0.4);
      g.add(frame, panel);
      const specs = [
        { x: -1.35, y: 2.9, r: 1.3, c: CHAKRA_ORANGE, s: 0.8 },
        { x: 1.15, y: 3.1, r: 0.95, c: CHAKRA_BRAND, s: -1.1 },
        { x: 0.8, y: 1.4, r: 0.78, c: '#c2691f', s: 1.35 },
      ];
      for (const sp of specs) {
        const gr = makeGear(sp.r, Math.round(sp.r * 10), 0.45, std(sp.c, { emissive: sp.c, emissiveIntensity: 0.2, metalness: 0.45, roughness: 0.5 }), std('#3a2e22', { metalness: 0.5, roughness: 0.45 }));
        gr.position.set(sp.x, sp.y, 0.05);
        gr.userData.spinSpeed = sp.s;
        gr.userData.spinAxis = 'z';
        g.add(gr);
      }
      // a glowing status seam along the base of the housing
      const seam = mesh(new THREE.PlaneGeometry(4.8, 0.1), std(CHAKRA_EMBER, { emissive: CHAKRA_EMBER, emissiveIntensity: 0.8, roughness: 0.4 }), false);
      seam.position.set(0, 0.7, 0.0);
      g.add(seam);
      return g;
    },
    // warehouse shelving stacked with coloured material bins — inventory.
    'inventory-rack': (seed) => {
      const g = new THREE.Group();
      const steel = std('#4a4138', { metalness: 0.4, roughness: 0.6 });
      const W = 3.4;
      const H = 4.0;
      const D = 1.2;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const post = mesh(new THREE.BoxGeometry(0.16, H, 0.16), steel);
          post.position.set((sx * W) / 2, H / 2, (sz * D) / 2);
          g.add(post);
        }
      }
      const binCols = ['#c46a2a', '#7a8a5a', '#5a6a8a', '#9a5a4a', '#b8923a', '#6a6a6a'];
      let ci = seed;
      for (let s = 0; s < 3; s++) {
        const y = 1.0 + s * 1.3;
        const shelf = mesh(new THREE.BoxGeometry(W, 0.1, D), steel);
        shelf.position.set(0, y, 0);
        shelf.receiveShadow = true;
        g.add(shelf);
        for (let b = 0; b < 3; b++) {
          const bin = mesh(new THREE.BoxGeometry(0.85, 0.72, 0.85), std(binCols[ci++ % binCols.length], { roughness: 0.85 }));
          bin.position.set(-W / 2 + 0.72 + b * 1.05, y + 0.46, 0);
          g.add(bin);
        }
      }
      return g;
    },
    // a pallet of raw materials — bars, sacks, or planks (varies by instance).
    'material-pallet': (seed) => {
      const g = new THREE.Group();
      const pallet = mesh(new THREE.BoxGeometry(2.0, 0.18, 1.4), std('#8a6a44', { roughness: 0.9 }));
      pallet.position.y = 0.09;
      pallet.receiveShadow = true;
      g.add(pallet);
      const kind = seed % 3;
      if (kind === 0) {
        const barMat = std('#9aa0a6', { metalness: 0.6, roughness: 0.4 });
        for (let i = 0; i < 6; i++) {
          const bar = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), barMat);
          bar.rotation.z = Math.PI / 2;
          bar.position.set(-0.32 + (i % 3) * 0.32, 0.32 + Math.floor(i / 3) * 0.26, -0.3 + (i % 2) * 0.5);
          g.add(bar);
        }
      } else if (kind === 1) {
        for (let i = 0; i < 4; i++) {
          const sack = mesh(new THREE.SphereGeometry(0.44, 10, 8), std(['#b8923a', '#9a7a4a'][i % 2], { roughness: 1 }));
          sack.scale.set(1, 0.8, 0.82);
          sack.position.set(-0.5 + (i % 2) * 1.0, 0.46, -0.36 + Math.floor(i / 2) * 0.72);
          g.add(sack);
        }
      } else {
        for (let i = 0; i < 4; i++) {
          const plank = mesh(new THREE.BoxGeometry(1.9, 0.12, 0.36), std('#a07a4a', { roughness: 0.9 }));
          plank.position.set(0, 0.26 + i * 0.14, -0.5 + i * 0.32);
          g.add(plank);
        }
      }
      return g;
    },
    // a production line: blocks ride the belt and loop (materials in → product out).
    conveyor: () => {
      const g = new THREE.Group();
      const L = 7.0;
      const w = 1.2;
      const steel = std('#3a342c', { metalness: 0.4, roughness: 0.6 });
      for (const sx of [-1, 1]) {
        for (const lz of [-1, 0, 1]) {
          const leg = mesh(new THREE.BoxGeometry(0.18, 1.0, 0.18), steel);
          leg.position.set(lz * (L / 2) * 0.85, 0.5, (sx * w) / 2);
          g.add(leg);
        }
      }
      const belt = mesh(new THREE.BoxGeometry(L, 0.12, w), std('#23201b', { roughness: 0.85 }));
      belt.position.y = 1.05;
      belt.receiveShadow = true;
      g.add(belt);
      for (const sx of [-1, 1]) {
        const roller = mesh(new THREE.CylinderGeometry(0.22, 0.22, w + 0.1, 12), std('#5a5048', { metalness: 0.5 }));
        roller.rotation.x = Math.PI / 2;
        roller.position.set((sx * L) / 2, 1.05, 0);
        g.add(roller);
      }
      const items: THREE.Object3D[] = [];
      const itemCols = ['#c46a2a', '#7a8a5a', '#b8923a', '#5a6a8a'];
      for (let i = 0; i < 5; i++) {
        const it = mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), std(itemCols[i % itemCols.length], { roughness: 0.8 }));
        it.position.set(-L / 2, 1.4, 0);
        g.add(it);
        items.push(it);
      }
      g.userData.conveyor = { items, from: new THREE.Vector3(-L / 2, 1.4, 0), to: new THREE.Vector3(L / 2, 1.4, 0), speed: 0.06 };
      return g;
    },
    // a forge brazier — a tripod bowl of glowing embers (warm light + atmosphere).
    brazier: () => {
      const g = new THREE.Group();
      const metalMat = std('#2e2823', { metalness: 0.4, roughness: 0.6 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 6), metalMat);
        leg.position.set(Math.cos(a) * 0.36, 0.85, Math.sin(a) * 0.36);
        leg.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
        g.add(leg);
      }
      const bowl = mesh(new THREE.CylinderGeometry(0.72, 0.46, 0.5, 12), metalMat);
      bowl.position.y = 1.7;
      const ember = mesh(new THREE.SphereGeometry(0.56, 12, 10), std(CHAKRA_EMBER, { emissive: '#ff5a10', emissiveIntensity: 1.0, roughness: 0.4 }), false);
      ember.scale.set(1, 0.5, 1);
      ember.position.y = 1.86;
      g.add(bowl, ember);
      return g;
    },
    // a bill-of-materials / type-inheritance tree: a glowing product node wired
    // down to its component material nodes.
    'bom-assembly': () => {
      const g = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.3, 8), std('#3a332b', { roughness: 0.7 }));
      base.position.y = 0.15;
      base.receiveShadow = true;
      const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), std('#5a5048', { metalness: 0.4 }));
      post.position.y = 1.5;
      g.add(base, post);
      const product = mesh(new THREE.IcosahedronGeometry(0.62, 0), std(CHAKRA_ORANGE, { emissive: CHAKRA_ORANGE, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.5 }));
      product.position.y = 3.0;
      product.userData.spinSpeed = 0.5; // default Y axis
      g.add(product);
      const top = new THREE.Vector3(0, 3.0, 0);
      const matCols = ['#7a8a5a', '#5a6a8a', '#b8923a', '#9a5a4a'];
      const strutMat = std('#6a5a3a', { emissive: CHAKRA_EMBER, emissiveIntensity: 0.25 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const px = Math.cos(a) * 1.55;
        const pz = Math.sin(a) * 1.55;
        const node = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), std(matCols[i], { roughness: 0.75 }));
        node.position.set(px, 1.0, pz);
        g.add(node);
        g.add(connect(new THREE.Vector3(px, 1.0, pz), top, 0.04, strutMat));
      }
      return g;
    },

    // ---------- wordle (entropy-based solver) ----------
    // The unmistakable Wordle icon: a tall 6×5 grid of guess tiles coloured to
    // read as a finished solve — early rows mostly absent (gray), narrowing
    // through present (yellow) to the all-correct (green) final row. Tile faces
    // are emissive so they auto-register for bloom. The hero of the biome and the
    // hub teaser (scaled down in the manifest).
    'wordle-board': () => {
      const g = new THREE.Group();
      const GRAY = '#787c7e';
      const YELLOW = '#c9b458';
      const GREEN = '#6aaa64';
      const palette = [GRAY, YELLOW, GREEN];
      const cols = 5;
      const rows = 6;
      const ts = 0.9; // tile size
      const gap = 0.16;
      const cell = ts + gap;
      const gridW = cols * ts + (cols - 1) * gap;
      const gridH = rows * ts + (rows - 1) * gap;
      const baseY = 1.4; // bottom of the grid above the ground
      // a solve that narrows from gray → yellow → all-green (top row first)
      const pattern = [
        [0, 1, 0, 0, 2],
        [1, 0, 2, 0, 0],
        [0, 2, 2, 1, 0],
        [2, 2, 0, 2, 1],
        [2, 2, 2, 0, 2],
        [2, 2, 2, 2, 2],
      ];
      const back = mesh(new THREE.BoxGeometry(gridW + 0.5, gridH + 0.5, 0.2), std('#1a1c1e', { roughness: 0.9 }));
      back.position.set(0, baseY + gridH / 2, 0);
      g.add(back);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const col = palette[pattern[r][c]];
          const tile = mesh(new THREE.BoxGeometry(ts, ts, 0.22), std(col, { emissive: col, emissiveIntensity: 0.45, roughness: 0.5 }));
          tile.position.set(-gridW / 2 + ts / 2 + c * cell, baseY + gridH - (ts / 2 + r * cell), 0.12);
          g.add(tile);
        }
      }
      const post = mesh(new THREE.BoxGeometry(0.5, baseY, 0.5), std('#2b2d2f'));
      post.position.y = baseY / 2;
      const base = mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.4, 8), std('#3a3d40'));
      base.position.y = 0.2;
      base.receiveShadow = true;
      g.add(post, base);
      return g;
    },
    // A single guess tile on a pedestal — a scattered "token". seed picks its
    // colour from the gray/yellow/green palette; the tile flips slowly on Y like
    // a Wordle reveal animation (userData.spinSpeed, default Y axis).
    'tile-pylon': (seed) => {
      const g = new THREE.Group();
      const cols = ['#787c7e', '#c9b458', '#6aaa64'];
      const col = cols[seed % 3];
      const ped = mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.8, 8), std('#cfd4d8', { roughness: 0.9 }));
      ped.position.y = 0.4;
      ped.receiveShadow = true;
      const tile = mesh(new THREE.BoxGeometry(1.0, 1.0, 0.24), std(col, { emissive: col, emissiveIntensity: 0.5, roughness: 0.5 }));
      tile.position.y = 1.55;
      tile.userData.spinSpeed = 0.4; // flips like a revealed tile
      g.add(ped, tile);
      return g;
    },
    // An information-gain histogram — the entropy bar chart at the heart of the
    // 3b1b approach (taller bar = more expected bits). Bars are tinted by height
    // (more information → greener) and emissive so they glow.
    'entropy-bars': () => {
      const g = new THREE.Group();
      const heights = [2.4, 1.7, 2.9, 1.2, 2.1, 0.8, 1.5];
      const n = heights.length;
      const spacing = 0.7;
      for (let i = 0; i < n; i++) {
        const h = heights[i];
        const col = h > 2.2 ? '#6aaa64' : h > 1.4 ? '#c9b458' : '#787c7e';
        const bar = mesh(new THREE.BoxGeometry(0.5, h, 0.5), std(col, { emissive: col, emissiveIntensity: 0.4, roughness: 0.5 }));
        bar.position.set(-((n - 1) / 2) * spacing + i * spacing, h / 2 + 0.2, 0);
        g.add(bar);
      }
      const base = mesh(new THREE.BoxGeometry(n * spacing + 0.4, 0.2, 1.0), std('#cfd4d8', { roughness: 0.9 }));
      base.position.y = 0.1;
      base.receiveShadow = true;
      g.add(base);
      return g;
    },

    // ---------- image duplicate finder (perceptual hash → CLIP → union-find) ----------
    // Hero: a gallery wall of framed photos where the found duplicates glow cyan —
    // the headline idea (spotting near-identical images in a pile). Emissive
    // highlights auto-register for bloom. Also the hub teaser (scaled down).
    'gallery-wall': () => {
      const g = new THREE.Group();
      const DUP = '#3fd0e0';
      const cols = 4;
      const rows = 3;
      const ts = 1.0;
      const gap = 0.22;
      const cell = ts + gap;
      const gridW = cols * ts + (cols - 1) * gap;
      const gridH = rows * ts + (rows - 1) * gap;
      const baseY = 1.6;
      const photoCols = ['#c98a5a', '#6a8fb0', '#8aa86a', '#b06a6a', '#9a7ab0', '#c9b458', '#5aa89a', '#a0a8b8', '#7a9ad0', '#6a8fb0', '#c07a9a', '#b06a6a'];
      const dup = new Set([1, 9, 3, 11]); // two matched pairs (same colour) highlighted
      const back = mesh(new THREE.BoxGeometry(gridW + 0.5, gridH + 0.5, 0.2), std('#1a1e2c', { roughness: 0.9 }));
      back.position.set(0, baseY + gridH / 2, 0);
      g.add(back);
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -gridW / 2 + ts / 2 + c * cell;
          const y = baseY + gridH - (ts / 2 + r * cell);
          const isDup = dup.has(idx);
          const frame = mesh(
            new THREE.BoxGeometry(ts, ts, 0.16),
            isDup ? std(DUP, { emissive: DUP, emissiveIntensity: 0.7, roughness: 0.4 }) : std('#2b3142', { roughness: 0.7 }),
          );
          frame.position.set(x, y, 0.12);
          const photo = mesh(new THREE.BoxGeometry(ts * 0.78, ts * 0.78, 0.05), std(photoCols[idx], { roughness: 0.6, emissive: photoCols[idx], emissiveIntensity: 0.12 }));
          photo.position.set(x, y, 0.22);
          g.add(frame, photo);
          idx++;
        }
      }
      const post = mesh(new THREE.BoxGeometry(0.5, baseY, 0.5), std('#23283a'));
      post.position.y = baseY / 2;
      const base = mesh(new THREE.CylinderGeometry(1.3, 1.6, 0.4, 8), std('#2e3344'));
      base.position.y = 0.2;
      base.receiveShadow = true;
      g.add(post, base);
      return g;
    },
    // A single framed photo on an easel — gallery ambiance. seed picks the photo's
    // colour from a muted palette.
    'photo-frame': (seed) => {
      const g = new THREE.Group();
      const cols = ['#c98a5a', '#6a8fb0', '#8aa86a', '#b06a6a', '#9a7ab0', '#c9b458'];
      const col = cols[seed % cols.length];
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.7, 6), std('#23283a'));
      post.position.y = 0.85;
      const foot = mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.18, 10), std('#2e3344'));
      foot.position.y = 0.09;
      foot.receiveShadow = true;
      const frame = mesh(new THREE.BoxGeometry(1.3, 1.3, 0.12), std('#2b3142', { roughness: 0.6 }));
      frame.position.y = 1.95;
      const photo = mesh(new THREE.BoxGeometry(1.05, 1.05, 0.05), std(col, { roughness: 0.6, emissive: col, emissiveIntensity: 0.2 }));
      photo.position.set(0, 1.95, 0.08);
      g.add(post, foot, frame, photo);
      return g;
    },
    // CLIP embedding space: glowing nodes grouped into clusters, with the matches
    // inside each cluster wired together (the cosine-similarity graph that
    // union-find collapses into duplicate groups).
    'embedding-orbs': (seed) => {
      const g = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.25, 10), std('#2a3042', { roughness: 0.8 }));
      base.position.y = 0.12;
      base.receiveShadow = true;
      const stem = mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.0, 6), std('#3a4258'));
      stem.position.y = 0.6;
      g.add(base, stem);
      const edgeMat = std('#9fe8ff', { emissive: '#9fe8ff', emissiveIntensity: 0.55 });
      const clusters = [
        { c: new THREE.Vector3(-0.7, 1.5, -0.3), col: '#3fd0e0', n: 3, r: 0.5 },
        { c: new THREE.Vector3(0.8, 2.2, 0.2), col: '#e05fb0', n: 3, r: 0.45 },
        { c: new THREE.Vector3(0.25, 1.05, 0.6), col: '#7ab0ff', n: 2, r: 0.4 },
      ];
      for (const cl of clusters) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < cl.n; i++) {
          const a = (i / cl.n) * Math.PI * 2 + seed;
          const p = new THREE.Vector3(cl.c.x + Math.cos(a) * cl.r, cl.c.y + Math.sin(a * 1.3) * cl.r * 0.6, cl.c.z + Math.sin(a) * cl.r);
          const orb = mesh(new THREE.SphereGeometry(0.16, 12, 10), std(cl.col, { emissive: cl.col, emissiveIntensity: 0.9, roughness: 0.3 }), false);
          orb.position.copy(p);
          g.add(orb);
          pts.push(p);
        }
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) g.add(connect(pts[i], pts[j], 0.025, edgeMat));
      }
      return g;
    },

    // ---------- mountain summit (snowy plateau reached by the ski lift) ----------
    // The summit lift station: where you board to ride back down. A platform with
    // an A-frame and a spinning bullwheel, plus a stub of cable heading off-edge.
    'lift-terminal': () => {
      const g = new THREE.Group();
      const liftMat = std('#3a3f48', { metalness: 0.3 });
      const plat = mesh(new THREE.BoxGeometry(3.4, 0.7, 3.4), std('#6a727c'));
      plat.position.y = 0.35;
      plat.receiveShadow = true;
      g.add(plat);
      for (const sx of [-1, 1]) {
        const post = mesh(new THREE.CylinderGeometry(0.2, 0.26, 4.0, 6), liftMat);
        post.position.set(sx * 1.1, 2.3, 0);
        post.rotation.x = -0.18; // lean toward the down-slope
        g.add(post);
      }
      const wheel = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.32, 16), std('#c0c6cf', { metalness: 0.4 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 4.0, -0.4);
      wheel.userData.spinSpeed = 0.8;
      wheel.userData.spinAxis = 'x';
      g.add(wheel);
      // a short cable + a couple of chairs heading off the back edge (down the hill)
      const cableMat = std('#23272e');
      const a = new THREE.Vector3(0, 4.0, -0.4);
      const b = new THREE.Vector3(0.4, 6.5, -5.5);
      g.add(connect(a, b, 0.06, cableMat));
      for (let i = 0; i < 2; i++) {
        const p = a.clone().lerp(b, 0.35 + i * 0.4);
        const seat = mesh(new THREE.BoxGeometry(0.85, 0.14, 0.55), std('#e0a93f'), false);
        seat.position.set(p.x, p.y - 0.75, p.z);
        const hang = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), liftMat, false);
        hang.position.set(p.x, p.y - 0.35, p.z);
        g.add(seat, hang);
      }
      return g;
    },
    // Ski-trail marker sign: a post with the classic difficulty badges
    // (green circle, blue square, black diamond) pointing off down the runs.
    'trail-sign': (seed) => {
      const g = new THREE.Group();
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), std('#6b4f2a'));
      post.position.y = 1.2;
      const cap = mesh(new THREE.SphereGeometry(0.16, 8, 6), std('#f2f7ff'));
      cap.position.y = 2.42;
      g.add(post, cap);
      const badges = [
        { c: '#3aa655', shape: 'circle' },
        { c: '#3a6fc4', shape: 'square' },
        { c: '#1a1a1a', shape: 'diamond' },
      ];
      for (let i = 0; i < 3; i++) {
        const b = badges[(seed + i) % badges.length];
        const plate = mesh(new THREE.BoxGeometry(1.2, 0.4, 0.08), std('#e9eef3', { roughness: 0.7 }));
        const side = i % 2 === 0 ? 0.7 : -0.7;
        plate.position.set(side, 1.9 - i * 0.5, 0);
        plate.rotation.y = i % 2 === 0 ? -0.2 : 0.2;
        let badge: THREE.Mesh;
        if (b.shape === 'circle') badge = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 16), std(b.c, { emissive: b.c, emissiveIntensity: 0.15 }), false);
        else if (b.shape === 'square') badge = mesh(new THREE.BoxGeometry(0.22, 0.22, 0.04), std(b.c, { emissive: b.c, emissiveIntensity: 0.15 }), false);
        else badge = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.04), std(b.c), false);
        if (b.shape === 'circle') badge.rotation.x = Math.PI / 2;
        if (b.shape === 'diamond') badge.rotation.z = Math.PI / 4;
        badge.position.set(side - 0.32, 1.9 - i * 0.5, 0.06);
        badge.rotation.y = plate.rotation.y;
        g.add(plate, badge);
      }
      return g;
    },
    // A pair of skis crossed and planted in the snow, with poles — classic après-ski.
    'crossed-skis': (seed) => {
      const g = new THREE.Group();
      const skiCols = ['#e0533f', '#3a6fc4', '#e0a93f', '#3aa655'];
      const c1 = skiCols[seed % skiCols.length];
      const c2 = skiCols[(seed + 2) % skiCols.length];
      const makeSki = (col: string, lean: number) => {
        const ski = mesh(new THREE.BoxGeometry(0.16, 2.6, 0.06), std(col, { roughness: 0.5 }));
        // a little upturned tip
        const tip = mesh(new THREE.BoxGeometry(0.16, 0.4, 0.06), std(col, { roughness: 0.5 }), false);
        tip.position.set(0, 1.4, 0.1);
        tip.rotation.x = -0.5;
        const grp = new THREE.Group();
        grp.add(ski, tip);
        grp.position.y = 1.0;
        grp.rotation.z = lean;
        return grp;
      };
      g.add(makeSki(c1, 0.32), makeSki(c2, -0.32));
      for (const sx of [-1, 1]) {
        const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), std('#cfd6de', { metalness: 0.3 }));
        pole.position.set(sx * 0.7, 0.9, 0.2);
        pole.rotation.z = sx * 0.12;
        const basket = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8), std('#2a2f36'), false);
        basket.position.set(sx * 0.7, 0.3, 0.2);
        g.add(pole, basket);
      }
      return g;
    },
    // A snow-laden pine.
    'snow-pine': (seed) => {
      const g = new THREE.Group();
      const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 7), std('#6b4a2e'));
      trunk.position.y = 0.55;
      g.add(trunk);
      const green = std(['#2f6e4a', '#357a52', '#2c6644'][seed % 3], { roughness: 0.85 });
      const snow = std('#f4f8fc', { roughness: 0.8 });
      const tiers = [
        { y: 1.4, r: 1.2, h: 1.5 },
        { y: 2.2, r: 0.92, h: 1.25 },
        { y: 2.9, r: 0.62, h: 1.0 },
      ];
      for (const t of tiers) {
        const cone = mesh(new THREE.ConeGeometry(t.r, t.h, 8), green);
        cone.position.y = t.y;
        const snowCap = mesh(new THREE.ConeGeometry(t.r * 0.92, t.h * 0.42, 8), snow, false);
        snowCap.position.y = t.y + t.h * 0.32;
        g.add(cone, snowCap);
      }
      g.rotation.y = (seed % 5) * 1.1;
      return g;
    },
    // A friendly snowman.
    'snowman': () => {
      const g = new THREE.Group();
      const snow = std('#f6fafe', { roughness: 0.9 });
      const r = [0.7, 0.52, 0.38];
      let y = 0.7;
      for (let i = 0; i < 3; i++) {
        const ball = mesh(new THREE.SphereGeometry(r[i], 16, 12), snow);
        ball.position.y = y;
        g.add(ball);
        y += r[i] + (r[i + 1] ?? 0.34) - 0.12;
      }
      const headY = 0.7 + (r[0] + r[1] - 0.12) + (r[1] + r[2] - 0.12);
      const coal = std('#1b1b1b');
      for (const sx of [-1, 1]) {
        const eye = mesh(new THREE.SphereGeometry(0.05, 8, 8), coal, false);
        eye.position.set(sx * 0.13, headY + 0.08, r[2] - 0.02);
        g.add(eye);
      }
      const nose = mesh(new THREE.ConeGeometry(0.07, 0.36, 7), std('#e8832a'), false);
      nose.position.set(0, headY - 0.02, r[2] + 0.05);
      nose.rotation.x = Math.PI / 2;
      g.add(nose);
      for (let i = 0; i < 3; i++) {
        const btn = mesh(new THREE.SphereGeometry(0.05, 8, 8), coal, false);
        btn.position.set(0, 1.3 + i * 0.22, r[1] - 0.04);
        g.add(btn);
      }
      const armMat = std('#5a4326');
      for (const sx of [-1, 1]) {
        const arm = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), armMat);
        arm.position.set(sx * 0.6, 1.35, 0);
        arm.rotation.z = sx * 1.0;
        g.add(arm);
      }
      return g;
    },
    // A low snow drift / mound to break up the plateau.
    'snow-mound': (seed) => {
      const g = new THREE.Group();
      const snow = std('#eef4fb', { roughness: 0.95 });
      const n = 3 + (seed % 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + seed;
        const r = 1.2 + (i % 2) * 0.7;
        const mound = mesh(new THREE.SphereGeometry(r, 12, 8), snow);
        mound.scale.set(1, 0.4, 1);
        mound.position.set(Math.cos(a) * 1.1, 0.1, Math.sin(a) * 1.1);
        mound.receiveShadow = true;
        g.add(mound);
      }
      return g;
    },
    // Localized falling snow over the summit (self-animating in the vertex shader,
    // ticked via the shared per-frame uTime — tagged `water` to reuse that tick).
    'snow-fall': () => {
      const g = new THREE.Group();
      const N = 520;
      const W = 36;
      const H = 18;
      const positions = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        positions[i * 3] = (Math.random() - 0.5) * W;
        positions[i * 3 + 1] = Math.random() * H;
        positions[i * 3 + 2] = (Math.random() - 0.5) * W;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.5, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uH = { value: H };
        mat.userData.shader = shader;
        shader.vertexShader =
          'uniform float uTime; uniform float uH;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             transformed.y = mod(position.y - uTime * 3.2, uH);
             transformed.x += sin(uTime * 0.8 + position.y * 0.6) * 0.7;
             transformed.z += cos(uTime * 0.7 + position.x * 0.5) * 0.5;`,
          );
      };
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.userData.water = true; // reuse the per-frame shader uTime tick
      g.add(pts);
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
