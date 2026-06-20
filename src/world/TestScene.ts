import * as THREE from 'three';

export interface TestScene {
  ground: THREE.Mesh;
}

/**
 * buildTestScene — Phase 0 placeholder world: a clean, minimal low-poly ground
 * with a gradient sky, soft lighting, and scattered primitive props (trees +
 * crates) so movement and depth are easy to read.
 *
 * In Phase 1 this is replaced by the data-driven hub + biomes (see SPEC.md §2).
 * Returns the ground mesh so ClickToMove can raycast against it.
 */
export function buildTestScene(scene: THREE.Scene): TestScene {
  // ---- atmosphere ----
  scene.fog = new THREE.Fog(new THREE.Color('#dcebfa'), 55, 140);
  scene.add(buildGradientSky());

  // ---- lighting ----
  const hemi = new THREE.HemisphereLight(
    new THREE.Color('#dff0ff'),
    new THREE.Color('#c2cdd6'),
    1.1,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff6e8', 2.6);
  sun.position.set(24, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  const s = 48;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // ---- ground ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: '#e7edf4', roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Faint grid to aid depth + motion perception (kept very subtle).
  const grid = new THREE.GridHelper(220, 110, 0x9fb4c8, 0xcdd9e6);
  (grid.material as THREE.Material).opacity = 0.25;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0.01;
  scene.add(grid);

  // ---- scattered props ----
  scatterProps(scene);

  return { ground };
}

function buildGradientSky(): THREE.Mesh {
  const top = new THREE.Color('#a9d4ff').convertSRGBToLinear();
  const bottom = new THREE.Color('#fbfdff').convertSRGBToLinear();
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: top },
      uBottom: { value: bottom },
      uExponent: { value: 0.7 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform float uExponent;
      void main() {
        float h = normalize(vWorld).y;
        float t = pow(clamp(h, 0.0, 1.0), uExponent);
        gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  return sky;
}

/** Deterministic pseudo-random so the layout is stable across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatterProps(scene: THREE.Scene) {
  const rng = mulberry32(1337);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#8a5a3b', roughness: 0.85 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: '#5fb87a', roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: '#4fa86c', roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: '#79c98e', roughness: 0.8 }),
  ];
  const crateMat = new THREE.MeshStandardMaterial({ color: '#d8b27a', roughness: 0.7 });

  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.0, 8);
  const leafGeo = new THREE.ConeGeometry(1.0, 2.2, 9);
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);

  const placed: THREE.Vector2[] = [];
  const tooClose = (x: number, z: number) => {
    if (Math.hypot(x, z) < 6) return true; // keep the spawn area clear
    return placed.some((p) => Math.hypot(p.x - x, p.y - z) < 3.5);
  };

  // Trees
  let made = 0;
  let guard = 0;
  while (made < 16 && guard++ < 400) {
    const angle = rng() * Math.PI * 2;
    const radius = 9 + rng() * 26;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (tooClose(x, z)) continue;
    placed.push(new THREE.Vector2(x, z));

    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.5;
    trunk.castShadow = true;
    tree.add(trunk);

    const scale = 0.8 + rng() * 0.8;
    const leaves = new THREE.Mesh(leafGeo, leafMats[(rng() * leafMats.length) | 0]);
    leaves.position.y = 1.0 + 1.1 * scale;
    leaves.scale.setScalar(scale);
    leaves.castShadow = true;
    tree.add(leaves);

    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * Math.PI;
    scene.add(tree);
    made++;
  }

  // Crates
  made = 0;
  guard = 0;
  while (made < 7 && guard++ < 200) {
    const angle = rng() * Math.PI * 2;
    const radius = 8 + rng() * 22;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (tooClose(x, z)) continue;
    placed.push(new THREE.Vector2(x, z));

    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(x, 0.5, z);
    crate.rotation.y = rng() * Math.PI;
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    made++;
  }
}
