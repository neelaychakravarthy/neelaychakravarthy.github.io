# Manifest Reference — `public/world.json`

The single file that describes the entire world. The TypeScript contract is
[`src/world/types.ts`](../src/world/types.ts); `WorldLoader.ts` validates it at
load (loud failures in dev). **Editing this file is how you add/change content —
no engine code.**

All colors are hex strings (`"#rrggbb"`). All positions are `[x, y, z]` tuples
(world units). `rotationY` is in **radians**. See
[ARCHITECTURE.md §5](ARCHITECTURE.md#5-coordinate-system--world-geometry) for the
coordinate system.

## Root

```jsonc
{
  "version": 1,
  "unit": { "speed": 10, "turnRate": 5.5 },  // optional; car kinematics
  "period": 140,            // toroidal loop length (x and z). Min 40. Keep > 2× the farthest authored structure.
  "startBiome": "hub",      // MUST be a defined biome id
  "biomes": [ /* BiomeConfig[] */ ]
}
```

`startBiome` is also the dev override: set it to any biome id to boot straight
into that biome (handy for verifying — remember to revert to `"hub"`).

## BiomeConfig

```jsonc
{
  "id": "chakra",                         // unique; referenced by pads + startBiome + tour
  "title": "Chakra — ...",                // human label (not shown in-world)
  "environment": { /* EnvironmentConfig, REQUIRED */ },
  "audio":      { /* AmbientConfig */ },
  "atmosphere": { /* AtmosphereConfig */ },
  "spawn":      { "position": [0,0,13], "rotationY": 3.14159 },  // where the unit lands
  "structures": [ /* StructureConfig[] — the 3D props */ ],
  "content":    [ /* ContentConfig[] — boards, panels, screens, links */ ],
  "pads":       [ /* PadConfig[] — exits to other biomes */ ],
  "river":      { "centerZ": 0, "halfZ": 25, "bridgeHalf": 42 }  // optional water barrier
}
```

`id` must be unique and is validated. Every `pads[].target` must reference a valid
biome id or load fails.

### EnvironmentConfig (required)

Sky gradient, fog, hemisphere fill light, and a single sun (directional + shadow).
Crossfaded on morph by `EnvironmentController`.

| Field | Type | Notes |
|---|---|---|
| `skyTop`, `skyBottom` | color | Vertical sky gradient (dome shader). |
| `fogColor` | color | Linear fog color (hides the toroidal seam). |
| `fogNear`, `fogFar` | number | Fog distances (typical ~45 / ~150). |
| `hemiSky`, `hemiGround` | color | Hemisphere light sky/ground colors. |
| `hemiIntensity` | number | Hemisphere fill strength (~1.0–1.2). |
| `sunColor` | color | Directional sun color. |
| `sunIntensity` | number | Sun strength (~2.2–3.0). |
| `sunPosition` | `[x,y,z]` | Sun **direction offset** from the unit (kept constant as the world wraps). |
| `groundColor` | color | The shared ground plane's color. |

### AmbientConfig (`audio`)

Drives the generative score. See [music](#adding-music) and
[`MusicEngine.ts`](../src/engine/MusicEngine.ts).

| Field | Type | Notes |
|---|---|---|
| `music` | string | Preset name in `MUSIC_PRESETS` (`warm-major`, `curious-major`, `cool-minor`, `techy-dorian`, `minimal-penta`, `bell-pairs`, `dreamy-lydian`, `forge-mixo`). Unknown → silently falls back to `warm-major`. |
| `ambientRoot` | number | Key tonic in Hz (e.g. `261.63` = C4, `196` = G3, `174.61` = F3). |
| `ambientGain` | number | Music level 0..1 (~0.42–0.46). |

*(Legacy `ambientChord` / `ambientWave` / `ambientCutoff` exist for back-compat and
are ignored.)*

### AtmosphereConfig (`atmosphere`)

Procedural ambient life. Crossfaded on morph by `Atmosphere`. All optional.

| Field | Type | Notes |
|---|---|---|
| `grass` | number | Density 0..1 (0 = none, e.g. indoor/industrial biomes). |
| `grassColor` | color | Blade color. |
| `grassClear` | `[[x,z,r], …]` | Circular zones kept grass-free (around pools/decks). |
| `clouds` | number | Drifting cloud count. |
| `birds` | number | Circling bird count. |
| `particles` | `'pollen' \| 'fireflies' \| 'dust' \| 'none'` | Floating-mote style. `fireflies` = additive glow (great in dark biomes / for embers). |
| `particleColor` | color | Mote color. |
| `particleCount` | number | ~45–80. |
| `stars` | number | Star count (night skies). |

### SpawnConfig (`spawn`)

`{ "position": [x,0,z], "rotationY": <radians> }`. Where the unit appears on
entering. Convention: `position` ≈ `[0,0,12..13]`, `rotationY` ≈ `3.14159` (face
north). Put a hub-return pad ~2 units north of spawn.

### StructureConfig (`structures[]`)

A placed procedural prop. `modelId` resolves to a factory in `AssetRegistry.ts`.

| Field | Type | Notes |
|---|---|---|
| `modelId` | string | Factory key (e.g. `plaza`, `inventory-rack`, `chakra-gear`). Unknown id → a red placeholder box + console warning. |
| `position` | `[x,y,z]` | World position. |
| `rotationY` | number? | Radians. Also rotates the collider offset. |
| `scale` | number? | Uniform scale (also scales collider). |
| `backdrop` | bool? | If true, the prop holds a fixed offset from the camera (distant scenery — mountains/skyline; never reached, never collides). |
| `collider` | `{ dx?, dz?, radius }`? | A circular no-go zone the car can't enter (anchor-relative; wraps with the structure). The car drives around it. |

### ContentConfig (`content[]`)

The in-world info layer. `type` picks the builder in `interactables.ts`.

| `type` | Renders | Key fields |
|---|---|---|
| `board` | A readable rounded info panel (the main text block) | `heading`, `subheading`, `badge`, `lines[]`, `accent` (color), `width`, `position` (**y = bottom edge**). Billboards to face the camera; `focusOneSided:false`. |
| `panel` | An image plane (gallery if >1 image) | `images[]`, `position`, `rotationY`. `focusOneSided:true`. |
| `screen` | A looping muted video screen (plays within 14 units) | `video`, `position`, `rotationY`. `focusOneSided:true`. |
| `link` | A clickable 3D sign → opens `url` in a new tab | `label`, `url`, `tooltip`, `position`. Omit `url` (or `"#"`) for a non-clickable info chip (e.g. an email). |
| `title`/`subtitle`/`fact` | Plain 3D text | `text`, `size`, `color`, `position`. |

Boards/panels/screens are tagged `userData.focus` so the
[FocusController](ENGINE.md#focuscontrollerts) auto-frames them and the
[tour](ENGINE.md#tourcontrollerts) can zoom + narrate them. **Gotcha:** a board's
`position.y` is the **bottom** edge (stays put through the morph); a panel's
`position.y` is a **center** height.

### PadConfig (`pads[]`)

A glowing disc that morphs to another biome when the car rolls onto it.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique within the biome. |
| `position` | `[x,0,z]` | Ground position. |
| `target` | string | Destination biome id (validated). |
| `label` | string | Floating label (e.g. `"Chakra   ↗"`). |
| `color` | color? | Glow color. |
| `radius` | number? | Trigger radius (default 2; keep ≪ `period/2`). |

### `river` (optional)

A looping E-W water band that only the central grass land-bridge crosses (the
hub uses it). `{ centerZ, halfZ, bridgeHalf }`: water occupies
`|z − centerZ| < halfZ` except where `|x| < bridgeHalf`. The car can't drive into
the water (`RiverBlock` collision); dolphins (`DolphinFX`) appear only in river
biomes. **`bridgeHalf` must equal `BRIDGE_HALF` (42) in `AssetRegistry.ts`**, which
the river-water shader uses to carve the bridge gap.

## Worked example — a minimal new biome

```jsonc
{
  "id": "demo",
  "title": "Demo Project",
  "environment": {
    "skyTop": "#1b2a44", "skyBottom": "#4a6aa0", "fogColor": "#2b3a5e",
    "fogNear": 48, "fogFar": 150, "hemiSky": "#bcd2ff", "hemiGround": "#2a3550",
    "hemiIntensity": 1.0, "sunColor": "#cfe0ff", "sunIntensity": 2.4,
    "sunPosition": [20, 30, 14], "groundColor": "#33405e"
  },
  "audio": { "music": "cool-minor", "ambientRoot": 220.0, "ambientGain": 0.45 },
  "atmosphere": { "particles": "fireflies", "particleColor": "#7dffd6", "particleCount": 70 },
  "spawn": { "position": [0, 0, 13], "rotationY": 3.14159 },
  "structures": [
    { "modelId": "plaza", "position": [0, 0, -3] }
  ],
  "content": [
    { "type": "board", "position": [0, 1.2, -7], "width": 8.4, "accent": "#5ad1ff",
      "heading": "Demo", "subheading": "A new biome", "badge": "2026",
      "lines": ["Line one", "Line two"] },
    { "type": "link", "label": "Live", "url": "https://example.com", "position": [0, 0, 9] }
  ],
  "pads": [
    { "id": "to-hub", "position": [0, 0, 11], "target": "hub", "label": "←   Hub", "color": "#c9d2de", "radius": 2.4 }
  ]
}
```

Then add a pad in the `hub` biome with `"target": "demo"`. Done — no engine code.
See [COOKBOOK.md → Add a biome](COOKBOOK.md#add-a-new-project-biome) for the full
checklist (including the tour stop).
