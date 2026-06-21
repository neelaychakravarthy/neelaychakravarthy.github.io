/**
 * Manifest types — the data contract the engine interprets.
 *
 * The engine is a fixed interpreter of this shape. Adding a project = adding a
 * biome entry (+ a pad in the hub) to public/world.json, not engine code.
 * See portfolio-research/SPEC.md §2.
 */

export type Vec3 = [number, number, number];

export interface EnvironmentConfig {
  skyTop: string;
  skyBottom: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPosition: Vec3;
  groundColor: string;
}

export interface StructureConfig {
  modelId: string;
  position: Vec3;
  rotationY?: number;
  scale?: number;
  /** Distant scenery: follows the camera at this offset (never reached) instead
   *  of tiling with the looping world. For mountains, coastlines, skyline, etc. */
  backdrop?: boolean;
  /** Circular no-go region (local offset from the structure + radius) the unit
   *  can't enter — e.g. a mountain base or open water. Drives around it. */
  collider?: { dx?: number; dz?: number; radius: number };
}

export type ContentKind = 'title' | 'subtitle' | 'fact' | 'link' | 'panel' | 'screen' | 'board';

export interface ContentConfig {
  type: ContentKind;
  position: Vec3;
  rotationY?: number;
  /** title / subtitle / fact */
  text?: string;
  size?: number;
  color?: string;
  /** link */
  label?: string;
  url?: string;
  /** hover bubble text; omit url to make a non-clickable info chip (e.g. email) */
  tooltip?: string;
  /** panel / screen placeholder caption */
  caption?: string;
  /** panel: image path(s); cycles as a gallery if more than one */
  images?: string[];
  /** screen: path to a looping muted video */
  video?: string;
  /** board: a consolidated, readable info panel */
  heading?: string;
  subheading?: string;
  badge?: string;
  lines?: string[];
  accent?: string;
  width?: number;
}

export interface PadConfig {
  id: string;
  position: Vec3;
  target: string;
  label: string;
  color?: string;
  radius?: number;
}

export interface SpawnConfig {
  position: Vec3;
  rotationY?: number;
}

/** Procedural ambient-music descriptor (synthesized per biome, crossfaded on morph). */
export interface AmbientConfig {
  /** Music preset name (see MUSIC_PRESETS): mood/scale/tempo/timbre. */
  music?: string;
  /** Key root frequency (the scale's tonic), e.g. 261.63 = C4. */
  ambientRoot?: number;
  /** Overall music level (0..1). */
  ambientGain?: number;
  // legacy pad fields (kept for back-compat; no longer used by the engine):
  ambientChord?: number[];
  ambientWave?: OscillatorType;
  ambientCutoff?: number;
}

/** Procedural ambient *atmosphere* (grass, sky, creatures, particles). */
export interface AtmosphereConfig {
  /** grass density 0..1 (0 = none, e.g. indoor rooms) */
  grass?: number;
  grassColor?: string;
  /** circles [x, z, radius] kept grass-free (around pools, decks, etc.) */
  grassClear?: number[][];
  /** number of drifting clouds */
  clouds?: number;
  /** number of circling birds */
  birds?: number;
  /** floating particle style */
  particles?: 'pollen' | 'fireflies' | 'dust' | 'none';
  particleColor?: string;
  particleCount?: number;
  /** number of stars (night skies) */
  stars?: number;
}

export interface BiomeConfig {
  id: string;
  title: string;
  environment: EnvironmentConfig;
  spawn?: SpawnConfig;
  structures?: StructureConfig[];
  content?: ContentConfig[];
  pads?: PadConfig[];
  audio?: AmbientConfig;
  atmosphere?: AtmosphereConfig;
  /** A looping E-W river that only the central grass land-bridge crosses. */
  river?: { centerZ?: number; halfZ: number; bridgeHalf: number };
}

export interface WorldConfig {
  version: number;
  unit?: { speed?: number; turnRate?: number };
  /** Toroidal loop length in world units (drive this far to wrap back). */
  period?: number;
  startBiome: string;
  biomes: BiomeConfig[];
}
