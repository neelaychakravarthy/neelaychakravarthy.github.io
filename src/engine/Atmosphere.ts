import * as THREE from 'three';
import gsap from 'gsap';
import type { AtmosphereConfig } from '../world/types';
import { wrapNearest } from './wrap';
import { getQuality } from './quality';

/**
 * Atmosphere — procedural ambient life, configured per biome and crossfaded on
 * morph: wind-swept instanced grass, drifting low-poly clouds, circling birds,
 * floating particles (pollen / fireflies / dust), and a starfield.
 *
 * It is independent of the biome morph (it crossfades by intensity rather than
 * sinking/rising), and it animates every frame via update().
 */

const BLADE_H = 0.45;

/** Keep `v` within ±bound of `center`, wrapping by 2·bound — so a world-anchored
 *  element stays near the unit (coverage) while only drifting by its own motion
 *  in between (real parallax: it streams past as you drive). */
function wrapToward(v: number, center: number, bound: number): number {
  let d = v - center;
  const span = bound * 2;
  if (d > bound) d -= span;
  else if (d < -bound) d += span;
  return center + d;
}

function softSprite(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Bird {
  group: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  cx: number;
  cz: number;
  radius: number;
  height: number;
  speed: number;
  flap: number;
  angle: number;
}

interface Cloud {
  mesh: THREE.Group;
  speed: number;
}

interface Particles {
  points: THREE.Points;
  velocities: Float32Array;
  phases: Float32Array;
  base: THREE.Color;
  twinkle: boolean;
  bounds: number;
  rise: number;
}

/** One biome's worth of atmosphere; faded via a single 0..1 intensity. */
class Layer {
  readonly group = new THREE.Group();
  /** Ambient life (birds/particles/clouds/stars) that follows the unit so it's
   *  everywhere; grass stays in `group` and wraps to the nearest plaza image. */
  private readonly ambient = new THREE.Group();
  intensity = 0;
  private grass?: THREE.InstancedMesh;
  private grassMat?: THREE.MeshStandardMaterial;
  private fadeMats: Array<{ mat: THREE.Material & { opacity: number }; base: number }> = [];
  private birds: Bird[] = [];
  private clouds: Cloud[] = [];
  private particles?: Particles;
  private stars?: { points: THREE.Points; phases: Float32Array; base: THREE.Color };
  private readonly sharedTex: THREE.Texture;

  constructor(scene: THREE.Scene, cfg: AtmosphereConfig | undefined, sharedTex: THREE.Texture) {
    this.sharedTex = sharedTex;
    this.group.add(this.ambient);
    scene.add(this.group);
    const c = cfg ?? {};
    if (c.grass) this.buildGrass(c.grass, c.grassColor ?? '#6fae5a', c.grassClear ?? []);
    if (c.clouds) this.buildClouds(c.clouds);
    if (c.birds) this.buildBirds(c.birds);
    if (c.particles && c.particles !== 'none') this.buildParticles(c.particles, c.particleCount ?? 70, c.particleColor);
    if (c.stars) this.buildStars(c.stars);
    this.apply();
  }

  // ---- builders ----
  private buildGrass(density: number, color: string, clearings: number[][]) {
    const target = Math.min(8000, Math.max(1, Math.floor(density * 7000 * getQuality().grassScale)));
    // collect blade positions, skipping cleared circles (pool deck, etc.)
    const pts: number[] = [];
    let attempts = 0;
    while (pts.length / 2 < target && attempts < target * 4) {
      attempts++;
      const a = Math.random() * Math.PI * 2;
      const r = 8.5 + Math.pow(Math.random(), 0.7) * 18.5;
      const x = Math.cos(a) * r + (Math.random() - 0.5) * 0.8;
      const z = Math.sin(a) * r + (Math.random() - 0.5) * 0.8;
      let blocked = false;
      for (const c of clearings) {
        const dx = x - c[0];
        const dz = z - c[1];
        if (dx * dx + dz * dz < c[2] * c[2]) {
          blocked = true;
          break;
        }
      }
      if (!blocked) pts.push(x, z);
    }
    const count = pts.length / 2;
    const geo = new THREE.PlaneGeometry(0.11, BLADE_H, 1, 1);
    geo.translate(0, BLADE_H / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      mat.userData.shader = shader;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float ix = instanceMatrix[3].x; float iz = instanceMatrix[3].z;
           float sway = sin(uTime * 1.6 + ix * 0.5 + iz * 0.4) * 0.18 + sin(uTime * 2.4 + ix) * 0.05;
           transformed.x += sway * (position.y / ${BLADE_H.toFixed(2)});`,
        );
    };
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const base = new THREE.Color(color);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      dummy.position.set(pts[i * 2], 0, pts[i * 2 + 1]);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.set(0.85 + Math.random() * 0.5, 0.8 + Math.random() * 0.4, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.copy(base).offsetHSL((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.13);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.grass = mesh;
    this.grassMat = mat;
    this.group.add(mesh);
  }

  private buildClouds(n: number) {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0, depthWrite: false });
    this.fadeMats.push({ mat, base: 0.85 });
    for (let i = 0; i < n; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat);
        puff.position.set((Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.6);
        puff.scale.set(1 + Math.random() * 0.8, 0.6 + Math.random() * 0.3, 1 + Math.random() * 0.6);
        cloud.add(puff);
      }
      cloud.position.set((Math.random() - 0.5) * 90, 12 + Math.random() * 7, (Math.random() - 0.5) * 90);
      cloud.scale.setScalar(1.3 + Math.random() * 1.3);
      this.group.add(cloud);
      this.clouds.push({ mesh: cloud, speed: 0.4 + Math.random() * 0.5 });
    }
  }

  private buildBirds(n: number) {
    const mat = new THREE.MeshStandardMaterial({ color: '#39414e', roughness: 0.7, transparent: true, opacity: 0 });
    this.fadeMats.push({ mat, base: 1 });
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 5), mat);
      body.rotation.x = -Math.PI / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat);
      head.position.z = 0.22;
      const wingGeo = new THREE.BoxGeometry(0.5, 0.02, 0.18);
      const left = new THREE.Group();
      const right = new THREE.Group();
      const lw = new THREE.Mesh(wingGeo, mat);
      lw.position.x = -0.25;
      const rw = new THREE.Mesh(wingGeo, mat);
      rw.position.x = 0.25;
      left.add(lw);
      right.add(rw);
      g.add(body, head, left, right);
      g.scale.setScalar(1.5);
      this.group.add(g);
      this.birds.push({
        group: g,
        left,
        right,
        cx: (Math.random() - 0.5) * 44,
        cz: (Math.random() - 0.5) * 44,
        radius: 9 + Math.random() * 8,
        height: 6.5 + Math.random() * 2.5,
        speed: (0.25 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1),
        flap: 7 + Math.random() * 3,
        angle: Math.random() * Math.PI * 2,
      });
    }
  }

  private buildParticles(kind: 'pollen' | 'fireflies' | 'dust', count: number, color?: string) {
    const bounds = 26;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const base = new THREE.Color(color ?? (kind === 'fireflies' ? '#7dffd6' : kind === 'dust' ? '#cfe0ff' : '#fff3c8'));
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * bounds * 2;
      positions[i * 3 + 1] = 0.5 + Math.random() * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * bounds * 2;
      velocities[i * 3] = (Math.random() - 0.5) * 0.4;
      velocities[i * 3 + 1] = 0.1 + Math.random() * 0.3;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      phases[i] = Math.random() * Math.PI * 2;
      colors[i * 3] = base.r;
      colors[i * 3 + 1] = base.g;
      colors[i * 3 + 2] = base.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const fireflies = kind === 'fireflies';
    const mat = new THREE.PointsMaterial({
      size: fireflies ? 0.5 : 0.34,
      map: this.sharedTex,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: fireflies ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    this.fadeMats.push({ mat, base: fireflies ? 1 : 0.6 });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
    this.particles = { points, velocities, phases, base, twinkle: fireflies, bounds, rise: 8 };
  }

  private buildStars(n: number) {
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const phases = new Float32Array(n);
    const base = new THREE.Color('#eaf2ff');
    for (let i = 0; i < n; i++) {
      // scatter on a high hemisphere shell
      const u = Math.random() * Math.PI * 2;
      const v = 0.5 + Math.random() * 0.75; // bias toward the horizon band (visible in the iso view)
      const r = 115;
      positions[i * 3] = Math.cos(u) * Math.sin(v) * r;
      positions[i * 3 + 1] = 12 + Math.cos(v) * r * 0.55;
      positions[i * 3 + 2] = Math.sin(u) * Math.sin(v) * r - 25;
      phases[i] = Math.random() * Math.PI * 2;
      colors[i * 3] = base.r;
      colors[i * 3 + 1] = base.g;
      colors[i * 3 + 2] = base.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 1.1, map: this.sharedTex, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.fadeMats.push({ mat, base: 1 });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.ambient.add(points);
    this.stars = { points, phases, base };
  }

  // ---- runtime ----
  apply() {
    if (this.grass) this.grass.scale.y = Math.max(0.0001, this.intensity);
    for (const f of this.fadeMats) f.mat.opacity = this.intensity * f.base;
  }

  update(dt: number, t: number, unitX: number, unitZ: number) {
    // Grass wraps to the nearest plaza image; only the star dome follows the unit.
    if (this.grass) this.grass.position.set(wrapNearest(unitX, 0), 0, wrapNearest(unitZ, 0));
    this.ambient.position.set(unitX, 0, unitZ);
    if (this.grassMat?.userData.shader) this.grassMat.userData.shader.uniforms.uTime.value = t;

    // Birds circle a world-space centre that wraps to stay near the unit, so they
    // stream past with real parallax rather than sticking to the screen.
    for (const b of this.birds) {
      b.cx = wrapToward(b.cx, unitX, 26);
      b.cz = wrapToward(b.cz, unitZ, 26);
      b.angle += b.speed * dt;
      const ca = Math.cos(b.angle);
      const sa = Math.sin(b.angle);
      b.group.position.set(b.cx + ca * b.radius, b.height + Math.sin(b.angle * 2) * 0.6, b.cz + sa * b.radius);
      b.group.rotation.y = Math.atan2(-sa * Math.sign(b.speed), ca * Math.sign(b.speed));
      const flap = Math.sin(t * b.flap) * 0.6;
      b.left.rotation.z = flap;
      b.right.rotation.z = -flap;
    }

    for (const c of this.clouds) {
      c.mesh.position.x = wrapToward(c.mesh.position.x + c.speed * dt, unitX, 55);
      c.mesh.position.z = wrapToward(c.mesh.position.z, unitZ, 55);
    }

    const p = this.particles;
    if (p) {
      const pos = p.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const col = p.points.geometry.getAttribute('color') as THREE.BufferAttribute;
      const carr = col.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        // drift by their own velocity only (world-anchored), then wrap toward the
        // unit — so they parallax past as the car moves, never glued to the screen.
        arr[i * 3] += p.velocities[i * 3] * dt + Math.sin(t * 0.6 + p.phases[i]) * 0.01;
        arr[i * 3 + 1] += p.velocities[i * 3 + 1] * dt;
        arr[i * 3 + 2] += p.velocities[i * 3 + 2] * dt;
        if (arr[i * 3 + 1] > p.rise) arr[i * 3 + 1] = 0.4;
        arr[i * 3] = wrapToward(arr[i * 3], unitX, p.bounds);
        arr[i * 3 + 2] = wrapToward(arr[i * 3 + 2], unitZ, p.bounds);
        if (p.twinkle) {
          const k = 0.25 + 0.75 * Math.abs(Math.sin(t * 2.5 + p.phases[i]));
          carr[i * 3] = p.base.r * k;
          carr[i * 3 + 1] = p.base.g * k;
          carr[i * 3 + 2] = p.base.b * k;
        }
      }
      pos.needsUpdate = true;
      if (p.twinkle) col.needsUpdate = true;
    }

    const st = this.stars;
    if (st) {
      const col = st.points.geometry.getAttribute('color') as THREE.BufferAttribute;
      const carr = col.array as Float32Array;
      for (let i = 0; i < col.count; i++) {
        const k = 0.55 + 0.45 * Math.sin(t * 1.5 + st.phases[i]);
        carr[i * 3] = st.base.r * k;
        carr[i * 3 + 1] = st.base.g * k;
        carr[i * 3 + 2] = st.base.b * k;
      }
      col.needsUpdate = true;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    this.group.parent?.remove(this.group);
  }
}

export class Atmosphere {
  private layer?: Layer;
  private readonly sharedTex = softSprite();
  private elapsed = 0;

  constructor(private scene: THREE.Scene) {}

  setBiome(cfg: AtmosphereConfig | undefined) {
    const old = this.layer;
    if (old) {
      gsap.to(old, { intensity: 0, duration: 0.9, ease: 'power1.in', onUpdate: () => old.apply(), onComplete: () => old.dispose() });
    }
    const next = new Layer(this.scene, cfg, this.sharedTex);
    this.layer = next;
    gsap.to(next, { intensity: 1, duration: 1.6, ease: 'power1.out', onUpdate: () => next.apply() });
  }

  update(dt: number, unitX: number, unitZ: number) {
    this.elapsed += dt;
    this.layer?.update(dt, this.elapsed, unitX, unitZ);
  }
}
