import * as THREE from 'three';
import type { EnvironmentConfig } from '../world/types';
import { getQuality } from './quality';

/**
 * EnvironmentController — owns the persistent atmosphere (sky, fog, lights,
 * ground) and interpolates between biome environments. The ground is shared
 * across biomes (only its colour changes), so click-to-move always raycasts the
 * same mesh while structures rise/sink above it.
 */

export interface EnvState {
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPos: THREE.Vector3;
  groundColor: THREE.Color;
}

export class EnvironmentController {
  readonly ground: THREE.Mesh;
  /** Public so the dev panel can tune view distance (for hiding the wrap seam). */
  readonly fog: THREE.Fog;

  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sky: THREE.Mesh;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly groundMat: THREE.MeshStandardMaterial;
  /** Sun position as an offset from the followed centre (keeps a constant sun angle). */
  private readonly sunOffset = new THREE.Vector3();
  private readonly center = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#a9d4ff') },
        uBottom: { value: new THREE.Color('#ffffff') },
        uExponent: { value: 0.7 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        uniform vec3 uTop; uniform vec3 uBottom; uniform float uExponent;
        void main() {
          float h = normalize(vWorld).y;
          float t = pow(clamp(h, 0.0, 1.0), uExponent);
          gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    this.sky.name = 'sky';
    scene.add(this.sky);

    // fog
    this.fog = new THREE.Fog(new THREE.Color('#dcebfa'), 50, 150);
    scene.fog = this.fog;

    // lights
    this.hemi = new THREE.HemisphereLight(new THREE.Color('#dff0ff'), new THREE.Color('#c2cdd6'), 1.1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(new THREE.Color('#fff6e8'), 2.6);
    this.sun.position.set(24, 34, 18);
    this.sunOffset.copy(this.sun.position);
    this.sun.castShadow = true;
    const sm = getQuality().shadowMapSize;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 130;
    const s = 50;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun, this.sun.target);

    // ground (shared raycast target) — large + recentred on the unit each frame
    // so it reads as infinite in every direction.
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#e7edf4', roughness: 0.96, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    scene.add(this.ground);
  }

  /** Recentre the ground, sky dome, and sun/shadow on the unit (for the
   *  infinite-feeling, seamlessly-wrapping world). Uniform, so it's invisible. */
  follow(x: number, z: number) {
    this.center.set(x, 0, z);
    this.ground.position.set(x, 0, z);
    this.sky.position.set(x, 0, z);
    this.applySun();
  }

  private applySun() {
    this.sun.target.position.copy(this.center);
    this.sun.position.set(
      this.center.x + this.sunOffset.x,
      this.sunOffset.y,
      this.center.z + this.sunOffset.z,
    );
  }

  /** Parse a manifest environment into interpolatable state. */
  stateFor(c: EnvironmentConfig): EnvState {
    return {
      skyTop: new THREE.Color(c.skyTop),
      skyBottom: new THREE.Color(c.skyBottom),
      fogColor: new THREE.Color(c.fogColor),
      fogNear: c.fogNear,
      fogFar: c.fogFar,
      hemiSky: new THREE.Color(c.hemiSky),
      hemiGround: new THREE.Color(c.hemiGround),
      hemiIntensity: c.hemiIntensity,
      sunColor: new THREE.Color(c.sunColor),
      sunIntensity: c.sunIntensity,
      sunPos: new THREE.Vector3(...c.sunPosition),
      groundColor: new THREE.Color(c.groundColor),
    };
  }

  setImmediate(c: EnvironmentConfig) {
    const s = this.stateFor(c);
    this.applyInterpolated(s, s, 1);
  }

  /** Write an interpolation of two states into the live scene (t in [0,1]). */
  applyInterpolated(a: EnvState, b: EnvState, t: number) {
    (this.skyMat.uniforms.uTop.value as THREE.Color).lerpColors(a.skyTop, b.skyTop, t);
    (this.skyMat.uniforms.uBottom.value as THREE.Color).lerpColors(a.skyBottom, b.skyBottom, t);

    this.fog.color.lerpColors(a.fogColor, b.fogColor, t);
    this.fog.near = THREE.MathUtils.lerp(a.fogNear, b.fogNear, t);
    this.fog.far = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t);

    this.hemi.color.lerpColors(a.hemiSky, b.hemiSky, t);
    this.hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, t);
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t);

    this.sun.color.lerpColors(a.sunColor, b.sunColor, t);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    this.sunOffset.lerpVectors(a.sunPos, b.sunPos, t);
    this.applySun();

    this.groundMat.color.lerpColors(a.groundColor, b.groundColor, t);
  }
}
