import * as THREE from 'three';
import type { Unit } from './Unit';
import type { MorphFX } from './MorphFX';
import { LapController } from './LapController';
import { wrapDistXZ } from './wrap';

/** A racetrack's start: a staging pad you drive onto, and the grid you teleport to. */
export interface RaceZone {
  padX: number;
  padZ: number;
  padR: number;
  gridX: number;
  gridZ: number;
  yaw: number;
}

/** UI hooks the controller drives (implemented in main against the DOM). */
export interface RaceUI {
  /** Big centre overlay text for the countdown ("3"/"2"/"1"/"GO"); null hides it. */
  countdown(text: string | null): void;
  /** Fade the lap-timer HUD in/out. */
  showTimer(show: boolean): void;
  /** Live race time (seconds) while racing. */
  time(seconds: number): void;
  /** A lap finished: final + best time (seconds). */
  result(lastSec: number, bestSec: number): void;
}

export type RacePhase = 'idle' | 'countdown' | 'racing' | 'finishing';

/**
 * RaceController — a polished start/finish flow for a racetrack.
 *
 * Drive onto the staging pad → the car teleports to the grid (particles), a 3-2-1
 * countdown runs (car frozen), then GO starts the timer. Completing the loop fires
 * confetti + the time, then the car is auto-driven off the line (so it can't
 * immediately re-trigger) and the HUD fades out. Re-race by returning to the pad.
 *
 * Hub-agnostic: it just needs a RaceZone + checkpoints, supplied per biome.
 */
export class RaceController {
  phase: RacePhase = 'idle';
  private zone: RaceZone | null = null;
  private checkpoints: THREE.Vector3[] = [];
  private readonly lap = new LapController();
  private cdT = 0;
  private raceT = 0;
  private endT = 0;
  private wasOnPad = false;
  private bestSec: number | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private unit: Unit,
    private fx: MorphFX,
    private ui: RaceUI,
  ) {}

  setBiome(zone: RaceZone | null, checkpoints: THREE.Vector3[]) {
    this.zone = zone;
    this.checkpoints = checkpoints;
    this.phase = 'idle';
    this.wasOnPad = false;
    this.bestSec = null;
    this.ui.countdown(null);
    this.ui.showTimer(false);
  }

  /** While true, normal driving input is ignored (countdown freeze / drive-off). */
  get inputLocked(): boolean {
    return this.phase === 'countdown' || this.phase === 'finishing';
  }

  update(dt: number) {
    if (!this.zone) return;
    const p = this.unit.position;
    if (this.phase === 'idle') {
      const on = wrapDistXZ(p.x, p.z, this.zone.padX, this.zone.padZ) < this.zone.padR;
      if (on && !this.wasOnPad) this.start();
      this.wasOnPad = on;
    } else if (this.phase === 'countdown') {
      const prev = Math.ceil(this.cdT);
      this.cdT -= dt;
      if (this.cdT > 0) {
        const now = Math.ceil(this.cdT);
        if (now !== prev) this.ui.countdown(String(now));
      } else {
        this.go();
      }
    } else if (this.phase === 'racing') {
      this.raceT += dt;
      this.ui.time(this.raceT);
      this.lap.update(p, () => this.finish());
    } else if (this.phase === 'finishing') {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.phase = 'idle';
        this.wasOnPad = true; // must leave the pad before a new race can trigger
        this.ui.showTimer(false);
      }
    }
  }

  private start() {
    const z = this.zone!;
    // teleport onto the grid, facing the race direction; clear momentum
    this.unit.object.position.set(z.gridX, 0, z.gridZ);
    this.unit.object.rotation.y = z.yaw;
    this.unit.stop();
    this.unit.setDrive(0, 0);
    this.fx.burst(this.tmp.set(z.gridX, 0.3, z.gridZ), '#bfe6ff', 220);
    this.fx.shockwave(this.tmp.set(z.gridX, 0, z.gridZ), '#bfe6ff');
    this.phase = 'countdown';
    this.cdT = 3.0;
    this.ui.showTimer(true);
    this.ui.time(0);
    this.ui.countdown('3');
  }

  private go() {
    this.phase = 'racing';
    this.raceT = 0;
    this.lap.setBiome(this.checkpoints, this.unit.position); // arm: car sits on the line
    this.ui.countdown('GO');
    window.setTimeout(() => {
      if (this.phase === 'racing') this.ui.countdown(null);
    }, 750);
  }

  private finish() {
    const z = this.zone!;
    const t = this.raceT;
    this.bestSec = this.bestSec === null ? t : Math.min(this.bestSec, t);
    this.fx.confetti(this.tmp.set(z.gridX, 0, z.gridZ));
    this.ui.result(t, this.bestSec);
    // controlled drive-off: pull OFF the track to the side, next to the staging
    // pad (not straight down the racing line, which would run over a boost strip).
    const nx = z.padX - z.gridX;
    const nz = z.padZ - z.gridZ;
    const nlen = Math.hypot(nx, nz) || 1;
    const ux = nx / nlen; // unit vector grid → pad (off the track, into the infield)
    const uz = nz / nlen;
    this.unit.setDrive(0, 0);
    this.unit.setTarget(this.tmp.set(z.padX + ux * 2 - uz * 6, 0, z.padZ + uz * 2 + ux * 6));
    this.phase = 'finishing';
    this.endT = 3.0;
  }
}
