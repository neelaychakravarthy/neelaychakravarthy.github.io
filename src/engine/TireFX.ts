import * as THREE from 'three';
import type { Unit } from './Unit';

/**
 * TireFX — little puffs of dust kicked up from the rear wheels while the unit
 * drives. Particles are emitted in WORLD space (left behind as a trail) and fade
 * + grow as they settle. One pooled Points cloud, faded per-particle via a tiny
 * custom shader (an `aLife` attribute drives size and alpha).
 */

function dustSprite(): THREE.Texture {
  const s = 48;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TireFX {
  private readonly MAX = 100;
  private readonly LIFE = 0.75;
  private readonly pos: Float32Array;
  private readonly life: Float32Array; // remaining life 0..1 (also the aLife attribute)
  private readonly vel: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly posAttr: THREE.BufferAttribute;
  private readonly lifeAttr: THREE.BufferAttribute;
  private readonly points: THREE.Points;
  private cursor = 0;
  private accum = 0;
  // rear-wheel offsets in the unit's local frame (forward is +z)
  private readonly rear: Array<[number, number]> = [
    [-0.95, -1.05],
    [0.95, -1.05],
  ];

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.MAX * 3);
    this.life = new Float32Array(this.MAX);
    this.vel = new Float32Array(this.MAX * 3);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.lifeAttr = new THREE.BufferAttribute(this.life, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aLife', this.lifeAttr);
    this.geo.setDrawRange(0, this.MAX);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTex: { value: dustSprite() },
        uColor: { value: new THREE.Color('#cab590') },
        uSize: { value: 95 },
      },
      vertexShader: /* glsl */ `
        attribute float aLife;
        uniform float uSize;
        varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float grow = 0.45 + (1.0 - aLife) * 1.6;
          gl_PointSize = uSize * grow / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform vec3 uColor;
        varying float vLife;
        void main() {
          if (vLife <= 0.01) discard;
          float a = texture2D(uTex, gl_PointCoord).a * vLife * 0.6;
          gl_FragColor = vec4(uColor, a);
        }`,
    });

    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  update(dt: number, unit: Unit) {
    const speed = unit.currentSpeed;
    if (speed > 1.5) {
      this.accum += dt * (5 + speed * 0.9);
      while (this.accum >= 1) {
        this.accum -= 1;
        this.emit(unit);
      }
    }
    for (let i = 0; i < this.MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt / this.LIFE);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.9;
      this.vel[i * 3 + 1] -= 1.4 * dt; // settle back down
      this.vel[i * 3 + 2] *= 0.9;
    }
    this.posAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
  }

  private emit(unit: Unit) {
    const yaw = unit.object.rotation.y;
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const [ox, oz] = this.rear[this.cursor % 2];
    const wx = unit.position.x + (ox * c + oz * s);
    const wz = unit.position.z + (-ox * s + oz * c);
    const i = this.findSlot();
    this.pos[i * 3] = wx + (Math.random() - 0.5) * 0.25;
    this.pos[i * 3 + 1] = 0.22;
    this.pos[i * 3 + 2] = wz + (Math.random() - 0.5) * 0.25;
    // kick up and backward (opposite the unit's forward = (sin, cos))
    this.vel[i * 3] = -s * 0.5 + (Math.random() - 0.5) * 0.9;
    this.vel[i * 3 + 1] = 0.8 + Math.random() * 0.7;
    this.vel[i * 3 + 2] = -c * 0.5 + (Math.random() - 0.5) * 0.9;
    this.life[i] = 1;
    this.cursor++;
  }

  private findSlot(): number {
    for (let k = 0; k < this.MAX; k++) {
      const i = (this.cursor + k) % this.MAX;
      if (this.life[i] <= 0) return i;
    }
    return this.cursor % this.MAX;
  }
}
