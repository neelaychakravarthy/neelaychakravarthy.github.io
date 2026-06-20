import type { WorldConfig } from '../world/types';

/**
 * Loads and lightly validates the world manifest at runtime. Validation is
 * intentionally loud in dev so a broken/typo'd manifest fails with a clear
 * message instead of a confusing render glitch.
 */
export async function loadWorld(url = '/world.json'): Promise<WorldConfig> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load world manifest (HTTP ${res.status}) from ${url}`);
  const data = (await res.json()) as WorldConfig;
  validate(data);
  return data;
}

function validate(w: WorldConfig) {
  if (!w || typeof w !== 'object') throw new Error('world.json: root is not an object');
  if (!Array.isArray(w.biomes) || w.biomes.length === 0) throw new Error('world.json: "biomes" must be a non-empty array');

  const ids = new Set(w.biomes.map((b) => b.id));
  if (ids.size !== w.biomes.length) throw new Error('world.json: duplicate biome ids');
  if (!ids.has(w.startBiome)) throw new Error(`world.json: startBiome "${w.startBiome}" is not a defined biome`);

  for (const b of w.biomes) {
    if (!b.environment) throw new Error(`world.json: biome "${b.id}" is missing an environment`);
    for (const p of b.pads ?? []) {
      if (!ids.has(p.target)) throw new Error(`world.json: pad "${p.id}" in "${b.id}" targets unknown biome "${p.target}"`);
    }
  }
}
