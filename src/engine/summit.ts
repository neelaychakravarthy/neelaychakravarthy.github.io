/**
 * The mountain summit is part of the hub (no biome switch) — a raised, rounded
 * snow dome the car drives on after the lift carries it up. This module defines
 * that drivable surface so the mountain mesh and the car's height-following agree.
 *
 * Coordinates are world-space; the ski-mountain is authored at (cx, cz).
 */
export const SUMMIT_CX = -22;
export const SUMMIT_CZ = -56;
export const SUMMIT_RADIUS = 14; // drivable radius on top
export const SUMMIT_BASE_Y = 24; // height of the plateau rim
export const SUMMIT_DOME = 2.6; // extra height at the centre (gentle crown)

/**
 * Drivable height at a world point on the summit, or null if it's past the rim
 * (a soft wall the car can't drive off). A gentle crown so it reads as a rounded,
 * uneven peak rather than a flat disc.
 */
export function summitHeight(x: number, z: number): number | null {
  const dx = x - SUMMIT_CX;
  const dz = z - SUMMIT_CZ;
  const d2 = dx * dx + dz * dz;
  const r2 = SUMMIT_RADIUS * SUMMIT_RADIUS;
  if (d2 > r2) return null;
  const t = d2 / r2;
  // crown in the middle + a couple of broad rolls so it's not a perfect dome
  return SUMMIT_BASE_Y + SUMMIT_DOME * (1 - t) + Math.sin(dx * 0.4) * 0.4 + Math.cos(dz * 0.45) * 0.4;
}
