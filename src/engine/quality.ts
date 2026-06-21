/**
 * Quality tier — desktop renders the full budget; phones/tablets get a lighter
 * one (lower pixel ratio, cheaper bloom, smaller shadow map, less grass) so the
 * world runs smoothly on mobile GPUs. Detected once at boot; consumers read it.
 */
export interface Quality {
  mobile: boolean;
  pixelRatio: number;
  bloom: boolean;
  bloomResolutionScale: number;
  shadowMapSize: number;
  /** multiplier on grass-blade count */
  grassScale: number;
}

let QUALITY: Quality = {
  mobile: false,
  pixelRatio: 2,
  bloom: true,
  bloomResolutionScale: 1,
  shadowMapSize: 2048,
  grassScale: 1,
};

export function getQuality(): Quality {
  return QUALITY;
}

/** Touch-first, small-screen device? (`?mobile=1/0` forces it, for testing.) */
export function detectMobile(): boolean {
  try {
    const forced = new URLSearchParams(window.location.search).get('mobile');
    if (forced === '1') return true;
    if (forced === '0') return false;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const touch = (navigator.maxTouchPoints || 0) > 0;
    const small = Math.min(window.innerWidth, window.innerHeight) < 860;
    return (coarse || touch) && small;
  } catch {
    return false;
  }
}

/** Pick the quality tier (call once at boot, before building the engine). */
export function initQuality(mobile = detectMobile()): Quality {
  QUALITY = mobile
    ? {
        mobile: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        bloom: true,
        bloomResolutionScale: 0.5,
        shadowMapSize: 1024,
        grassScale: 0.4,
      }
    : {
        mobile: false,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        bloom: true,
        bloomResolutionScale: 1,
        shadowMapSize: 2048,
        grassScale: 1,
      };
  return QUALITY;
}
