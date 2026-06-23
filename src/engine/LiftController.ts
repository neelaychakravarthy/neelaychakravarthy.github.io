import * as THREE from 'three';
import type { Unit } from './Unit';
import type { MorphFX } from './MorphFX';
import type { CameraRig } from './CameraRig';
import type { AudioManager } from './AudioManager';
import type { LiftConfig } from '../world/types';
import { SUMMIT_BASE_Y } from './summit';

/**
 * LiftController — a real chair-lift, in-world (no biome switch).
 *
 * It continuously circulates the chairs around the lift loop (around the
 * bullwheels at each terminal). When the car rolls onto a lift pad it is locked
 * in (a burst of particles); the controller waits for the next chair to come
 * around the boarding point, then carries the car up (or down) the cable, easing
 * to a stop. At the far end it's set down — onto the raised summit surface or back
 * on the ground — and auto-driven a few metres clear before control returns.
 */
export interface LiftDeps {
  unit: Unit;
  fx: MorphFX;
  rig: CameraRig;
  audio: AudioManager;
  /** Put the car on the raised summit surface (height-following, no colliders). */
  enterSummit: () => void;
  /** Put the car back on ordinary ground (restore colliders / river). */
  exitSummit: () => void;
  /** Gate input + pad re-triggers while the lift owns the car. */
  setActive: (active: boolean) => void;
}

interface SkiLift {
  loop: THREE.CatmullRomCurve3;
  chairs: THREE.Group[];
  speed: number;
  hang: number;
}

type Phase = 'idle' | 'lock' | 'ride' | 'land';

export class LiftController {
  /** The whole sequence is running — blocks user input + pad re-triggers. */
  active = false;
  /** The lift owns the car's transform (board/ride) — skip Unit.update. */
  carrying = false;

  private mountain: THREE.Object3D | null = null;
  private lift: SkiLift | null = null;
  private chairPhase = 0;

  private phase: Phase = 'idle';
  private t = 0;
  private dur = 4;
  private cfg?: LiftConfig;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(private d: LiftDeps) {}

  /** Point the controller at the current biome's ski-mountain (or null). */
  setLift(mountain: THREE.Object3D | null) {
    this.mountain = mountain;
    this.lift = (mountain?.userData.skiLift as SkiLift) ?? null;
    if (!this.lift && this.active) this.release();
  }

  /** Roll onto a lift pad → board. No-op if a ride is already in progress. */
  ride(cfg: LiftConfig) {
    if (this.active || !this.lift) return;
    this.active = true;
    this.carrying = true;
    this.phase = 'lock';
    this.t = 0;
    this.cfg = cfg;
    this.dur = cfg.duration ?? 4;
    this.from.set(cfg.ride[0][0], cfg.ride[0][1], cfg.ride[0][2]);
    const last = cfg.ride[cfg.ride.length - 1];
    this.to.set(last[0], last[1], last[2]);
    this.d.unit.stop();
    this.d.rig.enabled = false;
    this.d.setActive(true);
    this.d.audio.morph();
    this.d.fx.shockwave(this.d.unit.position.clone(), '#dff1ff');
    this.d.fx.burst(this.d.unit.position.clone(), '#eaf6ff', 150); // locked in
  }

  update(dt: number) {
    // keep the chairs circulating whenever a lift is present
    if (this.lift) {
      this.chairPhase = (this.chairPhase + this.lift.speed * dt) % 1;
      const n = this.lift.chairs.length;
      for (let i = 0; i < n; i++) {
        const u = (i / n + this.chairPhase) % 1;
        this.lift.chairs[i].position.copy(this.lift.loop.getPointAt(u));
      }
    }
    if (!this.active) return;
    this.t += dt;

    if (this.phase === 'lock') {
      // hold on the pad until the next chair sweeps through the boarding point
      const ready = this.t > 3.0 || this.chairNearBoard();
      if (ready) {
        this.phase = 'ride';
        this.t = 0;
      }
      return;
    }

    if (this.phase === 'ride') {
      const k = Math.min(1, this.t / this.dur);
      const e = k * k * (3 - 2 * k); // ease in + out → slows at both ends
      const obj = this.d.unit.object;
      obj.position.lerpVectors(this.from, this.to, e);
      this.tmp.subVectors(this.to, this.from).normalize();
      obj.rotation.y = Math.atan2(this.tmp.x, this.tmp.z);
      obj.rotation.x = -Math.asin(THREE.MathUtils.clamp(this.tmp.y, -1, 1)) * 0.85;
      if (k >= 1) this.setDown();
      return;
    }

    if (this.phase === 'land') {
      // car auto-drives to the landing spot (Unit.update runs now); then release
      if (this.t > 0.4 && !this.d.unit.hasTarget) this.release();
    }
  }

  private setDown() {
    const cfg = this.cfg!;
    const obj = this.d.unit.object;
    obj.rotation.x = 0;
    if (cfg.toSummit) {
      obj.position.set(this.to.x, SUMMIT_BASE_Y, this.to.z);
      this.d.enterSummit();
    } else {
      obj.position.set(this.to.x, 0, this.to.z);
      this.d.exitSummit();
    }
    this.carrying = false;
    this.d.fx.burst(this.d.unit.position.clone(), '#eaf6ff', 150); // released
    this.d.unit.setTarget(this.tmp.set(cfg.land[0], obj.position.y, cfg.land[1]));
    this.phase = 'land';
    this.t = 0;
  }

  private release() {
    this.phase = 'idle';
    this.active = false;
    this.carrying = false;
    this.d.rig.enabled = true;
    this.d.setActive(false);
  }

  /** Is a chair currently passing the boarding point (the foot of this ride)? */
  private chairNearBoard(): boolean {
    if (!this.lift || !this.mountain) return false;
    this.mountain.getWorldPosition(this.tmp2);
    const n = this.lift.chairs.length;
    for (let i = 0; i < n; i++) {
      const u = (i / n + this.chairPhase) % 1;
      this.tmp.copy(this.lift.loop.getPointAt(u)).add(this.tmp2);
      if (this.tmp.distanceTo(this.from) < 2.6) return true;
    }
    return false;
  }
}
