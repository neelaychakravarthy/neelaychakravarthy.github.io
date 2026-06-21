/**
 * Toroidal world wrap. The world is authored once in a single L×L tile centred
 * on the origin; everything is then rendered as if that tile repeats infinitely,
 * so driving far in any direction loops back to the start. Content is drawn at
 * its nearest periodic image to the unit; the seam (at L/2) is kept beyond the
 * steep camera's visible-ground horizon and inside the fog.
 */

/** World period (loop length, world units). Mutable so the dev panel can tune it. */
export let WORLD_PERIOD = 150;

export function setWorldPeriod(p: number) {
  WORLD_PERIOD = Math.max(40, p);
}

/** The periodic image of `base` that is nearest to `ref`. */
export function wrapNearest(ref: number, base: number): number {
  return base + WORLD_PERIOD * Math.round((ref - base) / WORLD_PERIOD);
}

/** Shortest signed toroidal displacement a − b (in [−L/2, L/2]). */
export function wrapDelta(a: number, b: number): number {
  const d = a - b;
  return d - WORLD_PERIOD * Math.round(d / WORLD_PERIOD);
}

/** Shortest toroidal distance on the ground plane between two points. */
export function wrapDistXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(wrapDelta(ax, bx), wrapDelta(az, bz));
}
