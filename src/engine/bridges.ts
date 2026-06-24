/**
 * Racetrack bridges — a raised deck the car drives over open water on.
 *
 * A bridge is a polyline "span": the track centre-line points that run over the
 * sea, extended a little onto land at each end for the approach ramps.
 * `bridgeHeight()` returns the deck height at a point — full height across the
 * road over the span, ramping down to ground level at the ends (longitudinally)
 * and just past the road edge (laterally). The track ribbon and the car both
 * sample this same profile, so the road and the car rise together and stay glued.
 */
export const BRIDGE_HEIGHT = 0.9; // deck height above the ground (sea is at y≈0.1)
export const ROAD_HALF = 4.2; // half road width used for the lateral falloff
const RAMP = 6; // approach-ramp length (world units) at each bridge end
const LAT_FADE = 1.5; // lateral fade past the road edge

export type BridgeSpan = { x: number; z: number }[];

/** Deck height at (x,z); 0 when not on any bridge. */
export function bridgeHeight(x: number, z: number, spans: BridgeSpan[], halfW: number): number {
  let best = 0;
  for (const pts of spans) {
    const n = pts.length;
    if (n < 2) continue;
    let total = 0;
    for (let i = 0; i < n - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    let acc = 0;
    let bestCross = Infinity;
    let along = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const cross = Math.hypot(x - px, z - pz);
      if (cross < bestCross) {
        bestCross = cross;
        along = acc + Math.sqrt(L2) * t;
      }
      acc += Math.sqrt(L2);
    }
    if (bestCross > halfW + LAT_FADE) continue;
    const lat = bestCross <= halfW ? 1 : 1 - (bestCross - halfW) / LAT_FADE;
    const end = Math.min(along, total - along);
    const lon = end >= RAMP ? 1 : end <= 0 ? 0 : end / RAMP;
    const h = BRIDGE_HEIGHT * lat * lon;
    if (h > best) best = h;
  }
  return best;
}
