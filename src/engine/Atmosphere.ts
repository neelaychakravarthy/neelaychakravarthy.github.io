import * as THREE from 'three';
import gsap from 'gsap';
import type { AtmosphereConfig } from '../world/types';
import { WORLD_PERIOD } from './wrap';
import { getQuality } from './quality';
import type { RiverBlock } from './Unit';

/** Extra biome geometry the grass needs so it carpets the whole green ground but
 *  skips water and portal pads. Pads/river come from the built biome. */
export interface GrassClearInfo {
  river?: RiverBlock | null;
  pads?: Array<{ position: THREE.Vector3; radius: number }>;
}

/**
 * The grass is an "infinite" carpet that follows the unit, so there is never a
 * visible edge — wherever you drive, dense lawn is under you and it fades softly
 * into the distance. Blades are anchored to a world grid (hashed per cell in the
 * shader) so the field stays put as the carpet slides; cleared regions (plaza,
 * pool, sand, pads, water) collapse blades to zero height by world position.
 */
const GRASS_R = 54; // carpet half-extent (follows the unit)
const GRASS_FADE = 36; // blades taper to zero height between here and GRASS_R
const GRASS_GRID = 268; // blades per side at full quality (GRID² total)
const GRASS_MAX_CIRCLES = 24;
const GRASS_MAX_RECTS = 36;

/**
 * Atmosphere — procedural ambient life, configured per biome and crossfaded on
 * morph: wind-swept instanced grass, drifting low-poly clouds, circling birds,
 * floating particles (pollen / fireflies / dust), and a starfield.
 *
 * It is independent of the biome morph (it crossfades by intensity rather than
 * sinking/rising), and it animates every frame via update().
 */

const BLADE_H = 0.5;

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
  /** Snow: particles fall and reset to the top instead of rising. */
  fall: boolean;
}

/** One biome's worth of atmosphere; faded via a single 0..1 intensity. */
class Layer {
  readonly group = new THREE.Group();
  /** Ambient life (birds/particles/clouds/stars) that follows the unit so it's
   *  everywhere; grass stays in `group` and wraps to the nearest plaza image. */
  private readonly ambient = new THREE.Group();
  intensity = 0;
  private grass?: THREE.InstancedMesh;
  private grassMat?: THREE.MeshLambertMaterial;
  /** World-grid cell size of the grass carpet; the carpet snaps to this so blades
   *  stay world-anchored as it follows the unit. */
  private grassCell = 1;
  private fadeMats: Array<{ mat: THREE.Material & { opacity: number }; base: number }> = [];
  private birds: Bird[] = [];
  private clouds: Cloud[] = [];
  private particles?: Particles;
  private stars?: { points: THREE.Points; phases: Float32Array; base: THREE.Color };
  private readonly sharedTex: THREE.Texture;

  constructor(scene: THREE.Scene, cfg: AtmosphereConfig | undefined, sharedTex: THREE.Texture, clear?: GrassClearInfo) {
    this.sharedTex = sharedTex;
    this.group.add(this.ambient);
    scene.add(this.group);
    const c = cfg ?? {};
    if (c.grass) this.buildGrass(c.grass, c.grassColor ?? '#6fae5a', c.grassClear ?? [], clear ?? {});
    if (c.clouds) this.buildClouds(c.clouds);
    if (c.birds) this.buildBirds(c.birds);
    if (c.particles && c.particles !== 'none') this.buildParticles(c.particles, c.particleCount ?? 70, c.particleColor);
    if (c.stars) this.buildStars(c.stars);
    this.apply();
  }

  // ---- builders ----
  private buildGrass(density: number, color: string, clearings: number[][], clear: GrassClearInfo) {
    // An infinite carpet: a GRID×GRID block of blades on a regular grid that
    // follows the unit (snapped to the cell size). Each blade re-hashes to the
    // world cell it currently covers (in the vertex shader), so the lawn stays
    // world-anchored as the carpet slides — no swimming, no edge. Density and
    // count are constant regardless of how far you drive.
    // Force an even grid so R/cell (= grid/2) is an integer — that keeps the
    // per-cell floor() on a half-integer and prevents the carpet from flickering.
    const raw = Math.max(48, Math.round(GRASS_GRID * Math.sqrt(getQuality().grassScale * density)));
    const grid = raw + (raw % 2);
    const cell = (GRASS_R * 2) / grid;
    const count = grid * grid;
    this.grassCell = cell;

    // Cleared regions as shader uniforms: circles ([x,z,r]) and (optionally
    // rotated) rects ([x,z,hx,hz] / [x,z,hx,hz,rot]) from the manifest, plus
    // portal pads, plus the river/ocean band — tested per blade by world position.
    const circles: THREE.Vector3[] = [];
    const rects: THREE.Vector4[] = [];
    const rectRot: number[] = [];
    for (const c of clearings) {
      if (c.length >= 4) {
        rects.push(new THREE.Vector4(c[0], c[1], c[2], c[3]));
        rectRot.push(c[4] ?? 0);
      } else {
        circles.push(new THREE.Vector3(c[0], c[1], c[2]));
      }
    }
    for (const p of clear.pads ?? []) circles.push(new THREE.Vector3(p.position.x, p.position.z, p.radius + 0.4));
    const numCircles = Math.min(circles.length, GRASS_MAX_CIRCLES);
    const numRects = Math.min(rects.length, GRASS_MAX_RECTS);
    while (circles.length < GRASS_MAX_CIRCLES) circles.push(new THREE.Vector3());
    while (rects.length < GRASS_MAX_RECTS) {
      rects.push(new THREE.Vector4());
      rectRot.push(0);
    }
    const river = clear.river;
    const riverVec = new THREE.Vector4(river?.centerZ ?? 0, river?.halfZ ?? 0, river?.bridgeHalf ?? 0, river ? 1 : 0);

    const geo = new THREE.PlaneGeometry(0.16, BLADE_H, 1, 1);
    geo.translate(0, BLADE_H / 2, 0);
    // Lambert (matte) is much cheaper per fragment than PBR and grass has no
    // specular anyway, so this is a big fill-rate win at no visual cost.
    const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uCenter = { value: new THREE.Vector2() };
      shader.uniforms.uCell = { value: cell };
      shader.uniforms.uR = { value: GRASS_R };
      shader.uniforms.uFade = { value: GRASS_FADE };
      shader.uniforms.uPeriod = { value: WORLD_PERIOD };
      shader.uniforms.uNumCircles = { value: numCircles };
      shader.uniforms.uCircles = { value: circles };
      shader.uniforms.uNumRects = { value: numRects };
      shader.uniforms.uRects = { value: rects };
      shader.uniforms.uRectRot = { value: rectRot };
      shader.uniforms.uRiver = { value: riverVec };
      mat.userData.shader = shader;
      shader.vertexShader =
        `uniform float uTime; uniform vec2 uCenter; uniform float uCell; uniform float uR; uniform float uFade; uniform float uPeriod;
         uniform int uNumCircles; uniform vec3 uCircles[${GRASS_MAX_CIRCLES}];
         uniform int uNumRects; uniform vec4 uRects[${GRASS_MAX_RECTS}]; uniform float uRectRot[${GRASS_MAX_RECTS}];
         uniform vec4 uRiver; varying float vCV;
         float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        ` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec2 ibase = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
           // Each blade maps to the world grid cell it currently covers. ibase is
           // offset by half a cell, so this lands on a half-integer — plain floor()
           // (no +0.5) keeps the result stable under float noise as the carpet
           // slides, which is what prevents the grid from flickering while moving.
           vec2 wcell = floor((uCenter + ibase) / uCell);
           float h1 = hash21(wcell);
           float h2 = hash21(wcell + vec2(17.3, 5.1));
           float h3 = hash21(wcell + vec2(41.7, 29.4));
           float h4 = hash21(wcell + vec2(71.1, 53.8));
           // Generous jitter (blades wander into neighbouring cells) breaks up the
           // regular grid so it doesn't shimmer/moiré in motion.
           vec2 jit = (vec2(h1, h2) - 0.5) * uCell * 1.6;
           vec2 wp = wcell * uCell + jit;            // blade world position (x,z)
           float dist = length(wp - uCenter);
           float vis = clamp((uR - dist) / (uR - uFade), 0.0, 1.0);
           // All clearings cluster near the biome origin, so blades far from it
           // (the common case while roaming) skip every test below.
           vec2 wo = wp - uPeriod * floor(wp / uPeriod + 0.5);
           if (dot(wo, wo) < 88.0 * 88.0) {
             for (int i = 0; i < ${GRASS_MAX_CIRCLES}; i++) {
               if (i >= uNumCircles) break;
               vec3 c = uCircles[i];
               vec2 d = wp - c.xy; d -= uPeriod * floor(d / uPeriod + 0.5);
               if (dot(d, d) < c.z * c.z) vis = 0.0;
             }
             for (int i = 0; i < ${GRASS_MAX_RECTS}; i++) {
               if (i >= uNumRects) break;
               vec4 r = uRects[i];
               vec2 d = wp - r.xy; d -= uPeriod * floor(d / uPeriod + 0.5);
               float rot = uRectRot[i]; float cs = cos(rot), sn = sin(rot);
               vec2 l = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);
               if (abs(l.x) < r.z && abs(l.y) < r.w) vis = 0.0;
             }
             if (uRiver.w > 0.5) {
               float dz = wp.y - uRiver.x; dz -= uPeriod * floor(dz / uPeriod + 0.5);
               float dx = wp.x; dx -= uPeriod * floor(dx / uPeriod + 0.5);
               if (abs(dz) < uRiver.y && abs(dx) > uRiver.z) vis = 0.0;
             }
           }
           float ang = h3 * 6.2831853;
           float ca = cos(ang), sa = sin(ang);
           vec3 gp = transformed;
           gp.y *= 0.7 + h4 * 0.6;                   // height variation
           gp.x *= 0.75 + h2 * 0.55;                 // width variation
           float sway = sin(uTime * 1.6 + wp.x * 0.5 + wp.y * 0.4) * 0.18 + sin(uTime * 2.4 + wp.x) * 0.05;
           gp.x += sway * (gp.y / ${BLADE_H.toFixed(2)});
           gp.xz = vec2(gp.x * ca - gp.z * sa, gp.x * sa + gp.z * ca);  // yaw
           gp.y *= vis;                              // fade / clear → collapse to ground
           gp.xz += wp - uCenter - ibase;            // land on the blade's world cell
           transformed = gp;
           vCV = h4;`,
        );
      shader.fragmentShader =
        'varying float vCV;\n' +
        shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
           diffuseColor.rgb *= mix(0.8, 1.16, vCV);`);
    };

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        dummy.position.set(-GRASS_R + (i + 0.5) * cell, 0, -GRASS_R + (j + 0.5) * cell);
        dummy.updateMatrix();
        mesh.setMatrixAt(j * grid + i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
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

  private buildParticles(kind: 'pollen' | 'fireflies' | 'dust' | 'snow', count: number, color?: string) {
    const bounds = 30;
    const snow = kind === 'snow';
    const rise = snow ? 16 : 8;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const base = new THREE.Color(color ?? (kind === 'fireflies' ? '#7dffd6' : kind === 'dust' ? '#cfe0ff' : snow ? '#ffffff' : '#fff3c8'));
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * bounds * 2;
      positions[i * 3 + 1] = snow ? Math.random() * rise : 0.5 + Math.random() * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * bounds * 2;
      velocities[i * 3] = (Math.random() - 0.5) * (snow ? 0.5 : 0.4);
      velocities[i * 3 + 1] = snow ? -(1.4 + Math.random() * 1.4) : 0.1 + Math.random() * 0.3;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * (snow ? 0.5 : 0.4);
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
      size: fireflies ? 0.5 : snow ? 0.52 : 0.34,
      map: this.sharedTex,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: fireflies ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    this.fadeMats.push({ mat, base: fireflies ? 1 : snow ? 0.85 : 0.6 });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
    this.particles = { points, velocities, phases, base, twinkle: fireflies, bounds, rise, fall: snow };
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
    // The grass carpet follows the unit, snapped to its cell grid so blades stay
    // world-anchored (no swimming) while there's always lawn under the car.
    if (this.grass) {
      const cell = this.grassCell;
      const cx = Math.round(unitX / cell) * cell;
      const cz = Math.round(unitZ / cell) * cell;
      this.grass.position.set(cx, 0, cz);
      const shader = this.grassMat?.userData.shader;
      if (shader) {
        shader.uniforms.uTime.value = t;
        shader.uniforms.uCenter.value.set(cx, cz);
      }
    }
    this.ambient.position.set(unitX, 0, unitZ);

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
        arr[i * 3] += p.velocities[i * 3] * dt + Math.sin(t * (p.fall ? 1.4 : 0.6) + p.phases[i]) * (p.fall ? 0.03 : 0.01);
        arr[i * 3 + 1] += p.velocities[i * 3 + 1] * dt;
        arr[i * 3 + 2] += p.velocities[i * 3 + 2] * dt;
        if (p.fall) {
          if (arr[i * 3 + 1] < 0.1) arr[i * 3 + 1] = p.rise; // landed → back to the top
        } else if (arr[i * 3 + 1] > p.rise) {
          arr[i * 3 + 1] = 0.4;
        }
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

  setBiome(cfg: AtmosphereConfig | undefined, clear?: GrassClearInfo) {
    const old = this.layer;
    if (old) {
      gsap.to(old, { intensity: 0, duration: 0.9, ease: 'power1.in', onUpdate: () => old.apply(), onComplete: () => old.dispose() });
    }
    const next = new Layer(this.scene, cfg, this.sharedTex, clear);
    this.layer = next;
    gsap.to(next, { intensity: 1, duration: 1.6, ease: 'power1.out', onUpdate: () => next.apply() });
  }

  update(dt: number, unitX: number, unitZ: number) {
    this.elapsed += dt;
    this.layer?.update(dt, this.elapsed, unitX, unitZ);
  }
}
