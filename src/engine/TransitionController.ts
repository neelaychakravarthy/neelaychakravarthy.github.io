import gsap from 'gsap';
import * as THREE from 'three';
import type { SpawnConfig } from '../world/types';
import type { EnvironmentController, EnvState } from './EnvironmentController';
import { type BuiltBiome, MORPH_SINK } from './Biome';
import type { Unit } from './Unit';
import type { MorphFX } from './MorphFX';
import type { CameraRig } from './CameraRig';

export interface MorphOptions {
  from: BuiltBiome;
  to: BuiltBiome;
  env: EnvironmentController;
  fromEnv: EnvState;
  toEnv: EnvState;
  unit: Unit;
  spawn: SpawnConfig;
  fx: MorphFX;
  rig: CameraRig;
  onComplete: () => void;
  /** Snap the unit to the spawn instantly instead of gliding it there — used by
   *  the ski-lift, which has already carried the car and hands off mid-air. */
  snapUnit?: boolean;
}

/**
 * TransitionController — the signature world-morph.
 *
 * On a single GSAP timeline: the current world sinks into the ground in
 * staggered waves while the atmosphere crossfades, the unit is pulled back to
 * the new biome's spawn, and the new world rises from the ground to meet it.
 * Driven by GSAP's own ticker, independent of the render loop.
 */
export class TransitionController {
  active = false;

  morph(o: MorphOptions): gsap.core.Timeline {
    this.active = true;
    const D = 2.4;
    const prog = { t: 0 };

    const tl = gsap.timeline({
      onComplete: () => {
        this.active = false;
        o.onComplete();
      },
    });

    // Atmosphere crossfade across the whole transition.
    tl.to(prog, {
      t: 1,
      duration: D,
      ease: 'power1.inOut',
      onUpdate: () => o.env.applyInterpolated(o.fromEnv, o.toEnv, prog.t),
    }, 0);

    // Pull the unit back to the incoming biome's spawn as the world reassembles.
    const sp = o.spawn.position;
    if (o.snapUnit) {
      o.unit.object.position.set(sp[0], sp[1], sp[2]);
      o.unit.object.rotation.set(0, o.spawn.rotationY ?? Math.PI, 0);
    } else {
      tl.to(o.unit.object.position, { x: sp[0], y: sp[1], z: sp[2], duration: D * 0.85, ease: 'power2.inOut' }, 0);
      tl.to(o.unit.object.rotation, { y: o.spawn.rotationY ?? Math.PI, duration: D * 0.6, ease: 'power2.inOut' }, 0);
    }

    // Sink the current world in staggered waves.
    o.from.morphItems.forEach((it, i) => {
      const at = (i % 6) * 0.04;
      tl.to(it.obj.position, { y: it.baseY - MORPH_SINK, duration: 0.75, ease: 'power2.in' }, at);
      tl.to(it.obj.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: 0.7, ease: 'power2.in' }, at);
    });

    // Raise the new world, overlapping the tail of the sink.
    const RISE = 1.0;
    o.to.morphItems.forEach((it, i) => {
      const at = RISE + (i % 7) * 0.05;
      tl.to(it.obj.position, { y: it.baseY, duration: 0.9, ease: 'back.out(1.25)' }, at);
      tl.to(it.obj.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'back.out(1.4)' }, at);
    });

    // Escalation: debris as the old world sinks, an eruption + camera punch as
    // the new world rises.
    const origin = new THREE.Vector3(0, 0, 0);
    const baseDist = o.rig.distance;
    tl.call(() => o.fx.burst(origin, '#ffe2b0'), undefined, 0.1);
    tl.call(() => {
      o.fx.shockwave(origin, '#cfe8ff');
      o.fx.burst(origin, '#ffffff');
    }, undefined, RISE - 0.05);
    tl.to(o.rig, { distance: baseDist - 4, duration: 0.18, ease: 'power2.out' }, RISE - 0.05);
    tl.to(o.rig, { distance: baseDist, duration: 0.55, ease: 'power2.inOut' }, RISE + 0.13);

    return tl;
  }
}
