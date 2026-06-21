# Cookbook

Copy-paste recipes for the common changes. Each says whether it's **data-only**
(manifest) or needs an **engine capability** addition, and where. Verify every
change in the preview ([CONVENTIONS → Verification](CONVENTIONS.md#verifying-in-the-preview)).

- [Add a new project biome](#add-a-new-project-biome) — data-only
- [Add a new prop (`modelId`)](#add-a-new-prop-modelid) — engine (AssetRegistry)
- [Add a new animation behavior](#add-a-new-animation-behavior) — engine (the userData pattern)
- [Add or tune music](#add-or-tune-music) — data (preset) / engine (melody style)
- [Add a tour stop](#add-a-tour-stop) — data (script)
- [Tune environment & atmosphere](#tune-environment--atmosphere) — data-only
- [Adjust the hub layout](#adjust-the-hub-layout) — data-only
- [Add a new content type](#add-a-new-content-type) — engine (interactables)

---

## Add a new project biome

**Data-only.** This is the headline use case — no `src/engine/` changes.

1. **Add a `BiomeConfig`** to `biomes[]` in `public/world.json`. Copy the
   [worked example](MANIFEST.md#worked-example--a-minimal-new-biome) and fill in
   `environment`, `audio`, `atmosphere`, `spawn`, `structures` (existing
   `modelId`s), `content` (a `board` + a `link`/`panel`/`screen`), and a `to-hub`
   pad. Put the hub-return pad ~2 units north of `spawn` (e.g. spawn `[0,0,13]`,
   pad `[0,0,11]`).
2. **Add a hub gateway:** add a pad to the `hub` biome's `pads[]` with
   `"target": "<your-id>"`, a label, color, and radius. Optionally place a small
   themed `structure` near it as a landmark teaser.
3. **Add a tour stop** (optional but recommended) — see
   [below](#add-a-tour-stop).
4. **Verify:** temporarily set the root `"startBiome": "<your-id>"`, `npm run dev`,
   drive around, then **revert `startBiome` to `"hub"`** and test the morph by
   driving onto the new hub pad.

If you need a prop that doesn't exist yet, add it first
([next recipe](#add-a-new-prop-modelid)) — that's the only time a new biome touches
the engine.

---

## Add a new prop (`modelId`)

**Engine — `AssetRegistry.ts` only.** Add a factory; the manifest references it by
string. Match the low-poly style ([CONVENTIONS](CONVENTIONS.md#low-poly-style)).

```ts
// in the `factories` record in AssetRegistry.ts
'crystal-pylon': (seed) => {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 8), std('#2a3550'));
  base.position.y = 0.2;
  const gem = mesh(new THREE.OctahedronGeometry(0.7, 0),
    std('#b06fff', { emissive: '#8a3fff', emissiveIntensity: 0.75, roughness: 0.2 }));
  gem.position.y = 1.5;
  gem.userData.spinSpeed = 0.7;        // ← free idle animation (see next recipe)
  g.add(base, gem);
  return g;
},
```

- `seed` is the structure's index — use `seed % N` to pick from a palette array for
  deterministic per-instance variation (see `agent`, `inventory-rack`).
- Use the helpers: `std`, `mesh`, `connect`, `makeWater`/`makeRiverWater`,
  `makeGear`.
- An emissive mesh (`emissiveIntensity > 0.25`) is **auto-collected for bloom** — no
  extra wiring.
- Reference it from a biome's `structures[]`:
  `{ "modelId": "crystal-pylon", "position": [4, 0, -6], "scale": 1.2 }`.

---

## Add a new animation behavior

**Engine — the `userData` pattern, 3 small edits.** This is how `spinAxis` and
`conveyor` were added. Use it for any new motion (e.g. a rotating radar, a pulsing
beacon, an orbiting drone).

1. **Set a tag in the prefab** (`AssetRegistry.ts`):
   ```ts
   g.userData.orbit = { center: new THREE.Vector3(0, 2, 0), radius: 3, speed: 0.5, items: [m1, m2] };
   ```
2. **Collect it** in `buildBiome()`'s `group.traverse()` (`Biome.ts`) and add the
   array to `BuiltBiome`:
   ```ts
   const orbiters: THREE.Object3D[] = [];
   // inside group.traverse((o) => { ... }):
   if (o.userData.orbit) orbiters.push(o);
   // add `orbiters` to the BuiltBiome interface and the returned object
   ```
3. **Animate it** in `BiomeManager.update()`:
   ```ts
   for (const o of b.orbiters) {
     const O = o.userData.orbit as { center: THREE.Vector3; radius: number; speed: number; items: THREE.Object3D[] };
     O.items.forEach((it, i) => {
       const a = this.elapsed * O.speed + (i / O.items.length) * Math.PI * 2;
       it.position.set(O.center.x + Math.cos(a) * O.radius, O.center.y, O.center.z + Math.sin(a) * O.radius);
     });
   }
   ```

That's it — every biome can now use it, purely by building the prop. For simple
spin, you don't even need this: just set `userData.spinSpeed` (+ optional
`spinAxis`). The `skiLift` and `conveyor` hooks are the reference implementations.

---

## Add or tune music

In `MusicEngine.ts`. All math is **scale-degree relative** (0 = tonic), never MIDI.

**A new preset (data-only-ish — one record entry):**
```ts
// in MUSIC_PRESETS
'glass-lydian': { scale: SCALES.lydian, progression: [0, 1, 4, 3], bpm: 76,
  beatsPerChord: 8, padWave: 'sine', leadWave: 'sine', bassWave: 'sine',
  brightness: 1500, melodyStyle: 'wander', melodyDensity: 0.6, leadOctave: 1, reverbMix: 0.58 },
```
Then a biome's `audio.music: "glass-lydian"`. `progression` entries are
scale-degree chord roots (diatonic triads are built automatically). Unknown preset
names fall back to `warm-major` silently — typos won't crash but won't play either.

**A new scale:** add to `SCALES` (semitone offsets), e.g.
`mixolydian: [0,2,4,5,7,9,10]`.

**A new melody style** (engine — to make a biome rhythmically distinct):
1. Add the name to the `MelodyStyle` union.
2. Add a `case` in `melody()` that calls `lead(degree, durBeats, at?)` with
   **chord tones** (`root`, `root+2`, `root+4`, `+7` for an octave) so it stays
   consonant. The `forge` style (hammer-strike + octave ring) is a good template.

You **can't audition audio in the preview** — verify structurally (diatonic by
construction; capture played notes if needed) and let the user listen.

---

## Add a tour stop

**Data (script) — `TourController.ts`, the `STOPS` array.** Navigation re-routes
itself over the pad graph, so this is just text + the stop's `id`.

```ts
{
  id: 'demo',                          // must match a biome id reachable from the hub
  lead: ['A quick aside…', "Let's head into Demo."],  // optional: narrated in the hub before the morph
  lines: [
    'Demo — the one-liner shown at the board.',       // 1st line → text board
    'The longer detail that plays at the panel/screen.',  // rest → one panel (if the biome has one)
  ],
}
```

- **Line-splitting:** line 1 → the board; remaining lines → one panel/screen. A
  biome with only a board gets all lines at the board (fine).
- **`lead`** plays while parked in the *previous* biome on the path, before the
  final morph (used for transitions like "After graduating…").
- Order is just array order; reorder freely. `WELCOME`/`CLOSING` are separate
  constants at the top/bottom.
- This is a pure text change — it does **not** affect car routing.

---

## Tune environment & atmosphere

**Data-only**, per biome in `world.json`. See the
[Environment](MANIFEST.md#environmentconfig-required) and
[Atmosphere](MANIFEST.md#atmosphereconfig-atmosphere) tables.

- **Mood:** `skyTop`/`skyBottom`/`fog*` set the palette; `hemiIntensity` +
  `sunIntensity` set brightness. Dark sky + glowing emissive props = high contrast
  (sidekick, chakra). Keep boards readable (they have their own panel background).
- **Life:** `particles: "fireflies"` with a warm color reads as embers; `pollen`/
  `dust` for daylight. `grass: 0` for indoor/industrial biomes. `grassClear`
  carves circles around pools/decks.
- All of it crossfades on morph automatically.

---

## Adjust the hub layout

**Data-only** — the `hub` biome in `world.json`. The hub is just another biome
(its `structures`, `content` board + contact `link`s, and `pads` to each project).
Keep it balanced: the welcome board is the north centerpiece; project gateways
flank the plaza. When adding a 4th/5th project gateway, place the pad on open
ground clear of the board's footprint and add a small themed landmark structure
near it (mirrors how `university-building` and the `chakra-gear` teaser anchor their
gateways). Verify by screenshotting the hub.

---

## Add a new content type

**Engine — `interactables.ts` + `world/types.ts`.** Only if `board`/`panel`/
`screen`/`link`/`title`/`subtitle`/`fact` genuinely can't express it.

1. Add the name to `ContentKind` in `world/types.ts` (+ any new `ContentConfig`
   fields).
2. Add a `case` to the `makeContent()` switch returning a `THREE.Object3D`.
3. Set the right `userData` tags so existing systems pick it up automatically —
   `focus` + `focusFacing` + `focusOneSided` (+ `focusCenterY`) to be framable by
   the FocusController and narratable by the tour; `billboard` to face the camera;
   `url` to be clickable. No changes needed in `Biome.ts` — its traverse already
   collects by tag.
