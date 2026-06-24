import * as THREE from 'three';
import type { PadInstance } from './Biome';
import { wrapDelta } from './wrap';

/** A non-pad point of interest to plot (race start, etc.). Drawn with a ring so
 *  it reads differently from the project-portal dots. */
export interface MapMarker {
  x: number;
  z: number;
  color: string;
}

/**
 * Minimap — a small radar in the corner that helps you orient in the looping
 * world: the unit sits at the centre (a triangle pointing where it faces), and
 * each biome's pads (project portals) plus any extra markers show as coloured
 * dots at their nearest toroidal position, clamped to the rim when far. North up.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly size = 132;
  private readonly worldRadius = 52; // world units mapped to the rim
  private pads: PadInstance[] = [];
  private markers: MapMarker[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.canvas.style.cssText =
      'position:fixed;left:calc(14px + env(safe-area-inset-left));' +
      'bottom:calc(14px + env(safe-area-inset-bottom));' +
      `width:${this.size}px;height:${this.size}px;z-index:15;border-radius:50%;` +
      'box-shadow:0 4px 18px rgba(10,20,40,.28);pointer-events:none;';
    document.body.appendChild(this.canvas);
    const c = this.canvas.getContext('2d');
    if (!c) throw new Error('[Minimap] 2D context unavailable');
    c.scale(dpr, dpr);
    this.ctx = c;
  }

  setBiome(pads: PadInstance[], markers: MapMarker[] = []) {
    this.pads = pads;
    this.markers = markers;
  }

  /** Map a world point to a minimap pixel (nearest toroidal image, rim-clamped). */
  private plot(wx: number, wz: number, unitPos: THREE.Vector3, c: number, rim: number): [number, number] {
    const dx = wrapDelta(wx, unitPos.x);
    const dz = wrapDelta(wz, unitPos.z);
    const d = Math.hypot(dx, dz) || 1;
    const k = (Math.min(d, this.worldRadius) / this.worldRadius) * rim;
    return [c + (dx / d) * k, c + (dz / d) * k];
  }

  update(unitPos: THREE.Vector3, unitYaw: number) {
    const ctx = this.ctx;
    const s = this.size;
    const c = s / 2;
    const r = s / 2 - 5;
    ctx.clearRect(0, 0, s, s);

    // dish
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,26,42,0.6)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();

    // north tick
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', c, 9);

    // pads (project portals), nearest toroidal image, clamped to the rim
    const rim = r - 8;
    for (const p of this.pads) {
      const [px, py] = this.plot(p.position.x, p.position.z, unitPos, c, rim);
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = p.glow ? '#' + p.glow.color.getHexString() : '#ffd23f';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
    }

    // extra markers (e.g. the race start), drawn with a ring to stand apart
    for (const m of this.markers) {
      const [px, py] = this.plot(m.x, m.z, unitPos, c, rim);
      ctx.beginPath();
      ctx.arc(px, py, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = m.color;
      ctx.stroke();
    }

    // the unit at centre, pointing where it faces
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.atan2(Math.sin(unitYaw), -Math.cos(unitYaw)));
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff5a3c';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.restore();
  }

  dispose() {
    this.canvas.remove();
  }
}
