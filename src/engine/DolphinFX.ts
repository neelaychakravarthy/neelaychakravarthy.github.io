import * as THREE from 'three';
import { wrapNearest } from './wrap';
import type { RiverBlock } from './Unit';

/**
 * DolphinFX — a few low-poly dolphins that arc out of the river and splash back.
 * Active only in biomes that have a river; each dolphin lives in the water (so it
 * wraps to whichever river image is nearest the unit) and is hidden between jumps.
 */

function mat(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
}

function makeDolphin(): THREE.Group {
  const g = new THREE.Group();
  const skin = mat('#7d8c9c');
  const belly = mat('#d6dee5');
  // body — stretched along local +x (swim/travel direction)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), skin);
  body.scale.set(1.9, 0.78, 0.78);
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8), belly);
  under.scale.set(1.7, 0.5, 0.66);
  under.position.y = -0.14;
  // snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 10), skin);
  snout.rotation.z = -Math.PI / 2;
  snout.position.x = 1.05;
  // tail fluke
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 4), skin);
  tail.rotation.z = Math.PI / 2;
  tail.scale.set(1, 1, 0.3);
  tail.position.x = -1.05;
  // dorsal fin
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), skin);
  dorsal.scale.set(1, 1, 0.4);
  dorsal.position.set(-0.1, 0.5, 0);
  dorsal.rotation.y = Math.PI / 4;
  g.add(body, under, snout, tail, dorsal);
  g.scale.setScalar(1.7);
  return g;
}

interface Dolphin {
  g: THREE.Group;
  homeX: number;
  homeZ: number;
  period: number;
  t: number;
  dir: number;
  height: number;
}

export class DolphinFX {
  private readonly group = new THREE.Group();
  private readonly dolphins: Dolphin[] = [];
  private river: RiverBlock | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    for (let i = 0; i < 5; i++) {
      const g = makeDolphin();
      g.visible = false;
      this.group.add(g);
      this.dolphins.push({ g, homeX: 0, homeZ: 0, period: 5, t: 0, dir: 1, height: 2.4 });
    }
  }

  /** Place the dolphins in the given river's water (or hide them if no river). */
  setRiver(river: RiverBlock | null) {
    this.river = river;
    if (!river) {
      for (const d of this.dolphins) d.g.visible = false;
      return;
    }
    this.dolphins.forEach((d, i) => {
      const side = i % 2 === 0 ? 1 : -1; // alternate east/west banks
      d.homeX = side * (river.bridgeHalf + 9 + ((i * 11) % 26));
      d.homeZ = river.centerZ + Math.sin(i * 1.7) * (river.halfZ - 7);
      d.period = 5 + ((i * 1.7) % 4);
      d.t = (i * 1.9) % d.period;
      d.dir = side; // swim along the river, facing outward-ish
      d.height = 2.2 + (i % 3) * 0.5;
    });
  }

  update(dt: number, unitX: number) {
    if (!this.river) return;
    const JUMP = 1.5;
    for (const d of this.dolphins) {
      d.t += dt;
      if (d.t > d.period) d.t -= d.period;
      if (d.t >= JUMP) {
        d.g.visible = false;
        continue;
      }
      const u = d.t / JUMP; // 0..1 over the arc
      const wx = wrapNearest(unitX, d.homeX);
      d.g.visible = true;
      d.g.position.set(wx + (u - 0.5) * 3.5 * d.dir, 0.05 + Math.sin(u * Math.PI) * d.height, d.homeZ);
      // nose up on the way out, down on the way in; face the travel direction
      d.g.rotation.set((0.5 - u) * 2.1 * d.dir, d.dir > 0 ? 0 : Math.PI, 0);
    }
  }
}
