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
}

export type ContentKind = 'title' | 'subtitle' | 'fact' | 'link' | 'panel' | 'screen';

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
  /** panel / screen placeholder caption */
  caption?: string;
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

/** Procedural ambient-pad descriptor (synthesized per biome, crossfaded on morph). */
export interface AmbientConfig {
  ambientRoot?: number;
  ambientChord?: number[];
  ambientWave?: OscillatorType;
  ambientCutoff?: number;
  ambientGain?: number;
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
}

export interface WorldConfig {
  version: number;
  unit?: { speed?: number; turnRate?: number };
  startBiome: string;
  biomes: BiomeConfig[];
}
