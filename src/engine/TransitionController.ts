import gsap from 'gsap';
import type { SpawnConfig } from '../world/types';
import type { EnvironmentController, EnvState } from './EnvironmentController';
import { type BuiltBiome, MORPH_SINK } from './Biome';
import type { Unit } from './Unit';

export interface MorphOptions {
  from: BuiltBiome;
  to: BuiltBiome;
  env: EnvironmentController;
  fromEnv: EnvState;
  toEnv: EnvState;
  unit: Unit;
  spawn: SpawnConfig;
  onComplete: () => void;
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
    tl.to(o.unit.object.position, { x: sp[0], y: sp[1], z: sp[2], duration: D * 0.85, ease: 'power2.inOut' }, 0);
    tl.to(o.unit.object.rotation, { y: o.spawn.rotationY ?? Math.PI, duration: D * 0.6, ease: 'power2.inOut' }, 0);

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

    return tl;
  }
}
