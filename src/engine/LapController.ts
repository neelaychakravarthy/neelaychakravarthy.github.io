import type * as THREE from 'three';
import { wrapDistXZ } from './wrap';

/**
 * LapController — fires a callback when the car completes a lap of the racetrack.
 *
 * A lap counts when the car crosses the start/finish (checkpoint 0) having visited
 * every other checkpoint around the circuit since the last lap. Visiting all
 * checkpoints means you actually drove the loop (not just nudged back and forth
 * over the line), but it's lenient about entry point and direction.
 */
export class LapController {
  private cps: THREE.Vector3[] = [];
  private visited: boolean[] = [];
  private nearFinish = false;
  private readonly R = 5.5;

  setBiome(checkpoints: THREE.Vector3[], pos: THREE.Vector3) {
    this.cps = checkpoints;
    this.visited = checkpoints.map(() => false);
    this.nearFinish = checkpoints.length > 0 && wrapDistXZ(pos.x, pos.z, checkpoints[0].x, checkpoints[0].z) < this.R;
  }

  update(pos: THREE.Vector3, onLap: () => void) {
    if (this.cps.length < 2) return;
    for (let i = 1; i < this.cps.length; i++) {
      if (wrapDistXZ(pos.x, pos.z, this.cps[i].x, this.cps[i].z) < this.R) this.visited[i] = true;
    }
    const atFinish = wrapDistXZ(pos.x, pos.z, this.cps[0].x, this.cps[0].z) < this.R;
    if (atFinish && !this.nearFinish) {
      let all = true;
      for (let i = 1; i < this.cps.length; i++) if (!this.visited[i]) all = false;
      if (all) {
        onLap();
        this.visited = this.cps.map(() => false);
      }
    }
    this.nearFinish = atFinish;
  }
}
