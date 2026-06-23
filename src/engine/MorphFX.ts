import * as THREE from 'three';

interface ActiveFX {
  obj: THREE.Object3D;
  age: number;
  ttl: number;
  velocities?: Float32Array;
  step: (fx: ActiveFX, dt: number) => void;
}

/**
 * MorphFX — transient particle/shockwave effects for the world-morph.
 *
 * Effects register themselves with the bloom selection (addGlow) so they glow,
 * and are disposed + de-selected when they expire. Driven by update(dt) from the
 * main loop.
 */
export class MorphFX {
  private active: ActiveFX[] = [];

  constructor(
    private scene: THREE.Scene,
    private addGlow: (o: THREE.Object3D) => void,
    private removeGlow: (o: THREE.Object3D) => void,
  ) {}

  /** Debris/sparks erupting from the ground around `center`. */
  burst(center: THREE.Vector3, color: THREE.ColorRepresentation, count = 240) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * 3.2;
      positions[i * 3] = Math.cos(ang) * rad;
      positions[i * 3 + 1] = 0.1 + Math.random() * 0.5;
      positions[i * 3 + 2] = Math.sin(ang) * rad;
      const out = 1.5 + Math.random() * 3;
      velocities[i * 3] = Math.cos(ang) * out;
      velocities[i * 3 + 1] = 4 + Math.random() * 7;
      velocities[i * 3 + 2] = Math.sin(ang) * out;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.22,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.position.copy(center);
    points.frustumCulled = false;
    this.scene.add(points);
    this.addGlow(points);
    this.active.push({ obj: points, age: 0, ttl: 1.7, velocities, step: stepBurst });
  }

  /** A celebratory multi-colour confetti burst (rises, then flutters down). */
  confetti(center: THREE.Vector3, count = 360) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      [0.91, 0.32, 0.24], [1, 0.81, 0.23], [0.35, 0.82, 1], [0.49, 1, 0.84],
      [1, 0.54, 0.75], [0.96, 0.96, 0.96], [0.23, 0.65, 0.33], [0.69, 0.44, 1],
    ];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * 5;
      positions[i * 3] = Math.cos(ang) * rad;
      positions[i * 3 + 1] = 0.4 + Math.random() * 1.2;
      positions[i * 3 + 2] = Math.sin(ang) * rad;
      const out = Math.random() * 4;
      velocities[i * 3] = Math.cos(ang) * out;
      velocities[i * 3 + 1] = 9 + Math.random() * 9;
      velocities[i * 3 + 2] = Math.sin(ang) * out;
      const c = palette[(Math.random() * palette.length) | 0];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.34, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    points.position.copy(center);
    points.frustumCulled = false;
    this.scene.add(points);
    this.active.push({ obj: points, age: 0, ttl: 3.2, velocities, step: stepConfetti });
  }

  /** Expanding ground ring. */
  shockwave(center: THREE.Vector3, color: THREE.ColorRepresentation) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.85, 56),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(center);
    ring.position.y = 0.12;
    this.scene.add(ring);
    this.addGlow(ring);
    this.active.push({ obj: ring, age: 0, ttl: 1.1, step: stepShockwave });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.age += dt;
      fx.step(fx, dt);
      if (fx.age >= fx.ttl) {
        this.removeGlow(fx.obj);
        this.scene.remove(fx.obj);
        const m = fx.obj as THREE.Mesh | THREE.Points;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.active.splice(i, 1);
      }
    }
  }
}

function stepBurst(fx: ActiveFX, dt: number) {
  const pts = fx.obj as THREE.Points;
  const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const v = fx.velocities as Float32Array;
  for (let i = 0; i < attr.count; i++) {
    v[i * 3 + 1] -= 11 * dt; // gravity
    arr[i * 3] += v[i * 3] * dt;
    arr[i * 3 + 1] += v[i * 3 + 1] * dt;
    arr[i * 3 + 2] += v[i * 3 + 2] * dt;
  }
  attr.needsUpdate = true;
  (pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - fx.age / fx.ttl);
}

function stepConfetti(fx: ActiveFX, dt: number) {
  const pts = fx.obj as THREE.Points;
  const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const v = fx.velocities as Float32Array;
  for (let i = 0; i < attr.count; i++) {
    v[i * 3 + 1] -= 14 * dt; // gravity
    arr[i * 3] += (v[i * 3] + Math.sin(fx.age * 6 + i) * 1.4) * dt; // flutter
    arr[i * 3 + 1] += v[i * 3 + 1] * dt;
    arr[i * 3 + 2] += (v[i * 3 + 2] + Math.cos(fx.age * 5 + i) * 1.4) * dt;
  }
  attr.needsUpdate = true;
  (pts.material as THREE.PointsMaterial).opacity = fx.age < fx.ttl * 0.7 ? 1 : Math.max(0, 1 - (fx.age - fx.ttl * 0.7) / (fx.ttl * 0.3));
}

function stepShockwave(fx: ActiveFX) {
  const t = fx.age / fx.ttl;
  fx.obj.scale.setScalar(1 + t * 20);
  ((fx.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - t));
}
