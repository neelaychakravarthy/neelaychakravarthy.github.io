import type * as THREE from 'three';
import type { PadInstance } from './Biome';
import { wrapDistXZ } from './wrap';

/**
 * InteractionManager — fires a pad's morph when the unit drives onto it.
 *
 * Triggers on the outside→inside transition only, so standing on a pad (e.g.
 * right after a morph drops you near one) doesn't re-fire until you leave and
 * return.
 */
export class InteractionManager {
  private pads: PadInstance[] = [];

  setBiome(pads: PadInstance[], unitPos: THREE.Vector3) {
    this.pads = pads;
    for (const p of pads) p.wasInside = this.inside(p, unitPos);
  }

  private inside(p: PadInstance, pos: THREE.Vector3): boolean {
    // toroidal: a pad fires from whichever periodic image you drive onto
    return wrapDistXZ(pos.x, pos.z, p.position.x, p.position.z) < p.radius;
  }

  update(unitPos: THREE.Vector3, onTrigger: (target: string) => void) {
    for (const p of this.pads) {
      const now = this.inside(p, unitPos);
      if (now && !p.wasInside) onTrigger(p.target);
      p.wasInside = now;
    }
  }
}
