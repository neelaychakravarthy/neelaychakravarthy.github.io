# Engine Reference (`src/engine/`)

Per-module reference for the fixed interpreter. For each module: what it does, its
public surface, and where you'd extend it. **You rarely edit these** — see
[the one rule](README.md#the-one-rule). Recipes live in
[COOKBOOK.md](COOKBOOK.md).

Jump to: [userData tag reference](#userdata-tag-reference) ·
[Boot & loop](#boot--loop) · [World & biomes](#world--biomes) ·
[Props & content](#props--content) · [Movement & camera](#movement--camera) ·
[Environment & FX](#environment--fx) · [Audio](#audio) · [Tour & ambient FX](#tour--ambient-fx)

---

## userData tag reference

The generic seam. A prefab/content object sets a `userData.<tag>`; `Biome.ts`
collects it in one `group.traverse()`; `BiomeManager.update()` animates it. **To
add a new behavior, add a row here** (set tag → collect → animate).

| `userData` tag | Set by | Value | Effect (in `BiomeManager.update`) |
|---|---|---|---|
| `spinSpeed` | prefab | number (rad/s) | Rotates the object about `spinAxis` each frame. |
| `spinAxis` | prefab | `'x'\|'y'\|'z'` (default `'y'`) | Axis for `spinSpeed`. Standing cogs use `'z'`. |
| `billboard` | prefab / text | `true` | Yaw-rotates the object to face the camera. |
| `water` | water material | `true` | Ticks `material.userData.shader.uniforms.uTime` (wave shader). |
| `skiLift` | `ski-mountain` prefab | `{ ftBottom,ftTop,bkBottom,bkTop:Vector3, chairs:Group[], speed }` | Lerps chairs up the front cable / down the back. |
| `conveyor` | `conveyor` prefab | `{ items:Object3D[], from,to:Vector3, speed }` | Lerps items along the belt, looping. |
| `gallery` | `panel` (>1 image) | `{ texes, idx, t, phase:'hold'\|'out'\|'in', fadeT }` | Crossfades images (4.2s hold, 0.4s fades). |
| `video` | `screen` | `HTMLVideoElement` | Plays when unit < 14 units away, pauses otherwise. |
| `focus` | board/panel/screen | `true` | Collected as a focusable (FocusController frames it). |
| `focusFacing` | board/panel/screen | yaw (radians) | The intended read-from direction. |
| `focusOneSided` | board/panel/screen | bool | `false` = billboard (boards); `true` = one fixed front (panels/screens). |
| `focusCenterY` | panel/screen | number | Look-at height override (aim at the image, not the legs). |
| `padTarget` | `makePad` | biome id string | Marks a pad; collected into `pads[]`. |
| `padRadius` | `makePad` | number (default 2) | Pad trigger radius (toroidal). |
| `glowMat` | `makePad` | `MeshStandardMaterial` | Pulsed (`emissiveIntensity = 0.45 + 0.35·sin`). |
| `url` | `link` chip | URL string (`""`/`"#"` = inert) | Collected into `clickables`; ClickToMove opens it. |
| `tooltip3d` | `link` chip | `Object3D` | Hover tooltip; shown only on hover. |
| `backdrop` | `buildBiome` (from `structure.backdrop`) | `true` | Holds a fixed camera offset instead of tiling. |
| `troika` | `makeTroika` | `true` | Marks Text for `.dispose()` on teardown (avoids leaks). |
| *(auto)* emissive meshes | — | — | Meshes with `emissive` sum > 0.05 and `emissiveIntensity > 0.25` are auto-collected as bloom `glows`. |

---

## Boot & loop

### `main.ts`
Boot + wiring + the per-frame `update(dt)` callback. `boot()` blocks if WebGL2 is
missing (`showFatal`), loads + validates the manifest, calls `initQuality()`,
instantiates every system, builds the start biome, registers input, and starts the
loop. `triggerMorph(target)` is the one function pads, the tour, and any code call
to change biomes. **Two ordering rules in the loop are load-bearing** — see
[ARCHITECTURE §4](ARCHITECTURE.md#4-the-update-loop-and-its-two-hard-rules).
*Extend here:* to wire a new system, instantiate it after the others and call its
`update(dt)` in the loop in the right place (respect the two rules), and add it to
the dispose path.

### `Engine.ts`
Owns `WebGLRenderer` (WebGL2, soft shadows, `NoToneMapping` — tone-mapping is in
`PostFX`), `Scene`, `PerspectiveCamera` (45° FOV), `Clock` (delta clamped to 0.1s),
and `PostFX`. `start(update)` runs the rAF loop: `update(dt)` then
`postfx.render(dt)`. *Extend here:* the renderer is a thin wrapper — a future
WebGPU swap is localized to the constructor. Pixel ratio comes from
`getQuality().pixelRatio`.

---

## World & biomes

### `world/types.ts`
The manifest TypeScript contract — interfaces only, no runtime. Full field docs in
[MANIFEST.md](MANIFEST.md). *Extend here* (with a matching builder change) to add a
new manifest field or `ContentKind`.

### `WorldLoader.ts`
`loadWorld(url='/world.json'): Promise<WorldConfig>`. Fetches, parses, and
validates: biomes non-empty, unique ids, `startBiome` + every pad `target`
reference a valid id. Throws human-readable errors (never suppress in dev — they're
data bugs). It validates structure/references, **not** content types or `modelId`
existence (those surface at build time).

### `Biome.ts` — `buildBiome()` + `BiomeManager`
The heart of "data → scene". `buildBiome(scene, registry, config, hidden)`:
instantiates each `structure` via `AssetRegistry`, applies position/rotation/scale,
builds colliders (rotated, anchor-relative), adds `content` + `pads`, then does the
**one `group.traverse()`** that fills `BuiltBiome`'s typed arrays from `userData`
tags. `hidden=true` pre-sinks `morphItems` for a rise. `BuiltBiome` exposes:
`morphItems, clickables, pads, billboards, spinners, galleries, videos, glows,
waters, focusables, colliders, river, skiLifts, conveyors`.
`BiomeManager.update(dt, camera, unitPos)` runs **all idle animation**;
`wrap(unitPos)` redraws props at their nearest toroidal image (must run before
interaction/focus). *Extend here:* add a new animation array (collect in the
traverse, animate in `update`) — this is the canonical extension point.

### `TransitionController.ts`
`morph(MorphOptions): gsap.core.Timeline` — the in-place morph (~2.4s): staggered
sink of `from`, environment/atmosphere/music crossfade, unit pulled to `spawn`,
staggered rise of `to`, `MorphFX` bursts + camera punch; `onComplete` finalizes.
*Gotcha:* stagger uses `i % 6` (sink) / `i % 7` (rise); `morphItems` must exist in
both biomes at build time.

### `InteractionManager.ts`
`update(unitPos, onTrigger)` — fires `onTrigger(target)` when the unit crosses
**outside→inside** a pad's radius (toroidal `wrapDistXZ`). `setBiome(pads, unitPos)`
re-arms `wasInside` on every biome change (skip it and pads false-fire).

---

## Props & content

### `AssetRegistry.ts`
`create(modelId, seed=0): THREE.Object3D` resolves a `modelId` to a procedural
prefab; unknown → red placeholder box. Factories are `(seed) => Object3D` keyed by
`modelId` (seed = the structure's index, for per-instance variation). Shared
helpers: `std(color, opts)` (standard material), `mesh(geo, mat, cast=true)`,
`connect(a, b, r, mat)` (cylinder between two points), `makeWater` / `makeRiverWater`
(animated water; sets `userData.water`), `makeGear(radius, teeth, thickness, body,
tooth)` (cog in the XY plane — spin with `spinAxis:'z'`). Prefabs set their own
animation `userData` tags. *Extend here:* add a factory to the `factories` record —
see [COOKBOOK → Add a prop](COOKBOOK.md#add-a-new-prop-modelid). *Gotchas:*
`BRIDGE_HALF = 42` must match `world.json` `river.bridgeHalf`; prefer `seed % N` over
`Math.random()` for deterministic variation.

### `interactables.ts`
`makeContent(c: ContentConfig): Object3D` dispatches on `c.type` to internal
builders (`makeText`, `makeLink`, `makePanel` for panel+screen, `makeBoard`);
`makePad(p: PadConfig): Object3D` builds a pad. These set the `focus*`, `url`,
`tooltip3d`, `billboard`, `troika`, `pad*`, `glowMat` tags. Boards auto-measure +
reflow via troika `sync()` (so long text doesn't clip). *Extend here:* to add a
content kind, add a `ContentKind` to `types.ts`, add a `case` to `makeContent`, and
set the right `focus`/`billboard` tags so `Biome.ts` auto-collects it. *Gotcha:*
board `position.y` = bottom edge; panel `position.y` = center height.

---

## Movement & camera

### `Unit.ts`
The car. Kinematic steering toward `setTarget(p)`; `update(dt)` accelerates,
rotates (shortest-way yaw), spins wheels, and resolves collisions. `currentSpeed`
(getter, read by `TireFX`), `position`, `hasTarget`. `Collider { ax, az, dx, dz,
radius }` = a circular no-go zone (anchor-relative so it tiles); `RiverBlock {
centerZ, halfZ, bridgeHalf }` = the water band with the bridge gap. Collisions
**push out** (slide), they don't hard-stop. Defaults `speed=10`, `turnRate=5.5`
(overridable via `unit` in the manifest). *Extend here:* swap `buildVehicle()` for
a glTF (keep local `+z` = forward, tag wheels).

### `ClickToMove.ts`
Raycasts on click/tap: **clickables (`userData.url`) win over ground**; a ground
hit calls `onGround(point)` → `unit.setTarget`. Mouse fires on down; touch fires on
up only if it was a tap (moved < 16px, < 500ms, single finger) so it doesn't fight
pinch/drag. `isLocked()` (morph/tour) disables input.

### `CameraRig.ts`
Isometric follow-cam: `elevationDeg=42`, `azimuth`, `distance` (10–55).
`update(dt, focus, override?)` damps toward the focus point and **blends toward a
`FocusOverride` by its weight** (also tweens FOV). Right-drag / one-finger orbit;
wheel / pinch zoom. `enabled=false` ignores user input (used during the tour) but
still follows. `shift(dx,dz)` moves cam+target together (used to hide the morph
recenter).

### `FocusController.ts`
The "read-me" zoom. When the unit **parks** (`!hasTarget`) within `outer` (6.5) of a
focusable, it returns a `FocusOverride { pos, look, weight, fov }` that CameraRig
blends; eases in (rate 4) / out (rate 8); `zoomedIn` (weight > 0.75) is what the
tour waits on. A 0.8s `settle` after a morph and a 0.7s `cooldown` after leaving
prevent zoom-on-spawn / instant re-zoom. Reads the `focus*` userData tags.

### `wrap.ts`
`WORLD_PERIOD` (set from `world.json` `period`, floor 40) + `wrapNearest`,
`wrapDelta`, `wrapDistXZ`. **Any cross-world position comparison must use these.**

---

## Environment & FX

### `EnvironmentController.ts`
The persistent sky dome, fog, hemisphere + sun light, and the **shared ground
plane** (also the click-to-move raycast target). `stateFor(cfg)` → interpolatable
`EnvState`; `applyInterpolated(a, b, t)` crossfades; `follow(x, z)` recentres
ground/sky/sun on the unit each frame (sun is a fixed offset, so the lighting angle
holds as the world wraps). *Extend here:* add a light/parameter → add to `EnvState`
+ `EnvironmentConfig`, parse in `stateFor`, lerp in `applyInterpolated`.

### `Atmosphere.ts`
Per-biome ambient life (instanced wind grass, clouds, birds, particles, stars) in a
crossfading `Layer`. `update(dt, unitX, unitZ)` advances animation and **world-
anchored parallax** (`wrapToward`) so life streams past instead of sticking to the
screen. Grass count scales by `getQuality().grassScale`. *Extend here:* add an
element builder in `Layer` + an `AtmosphereConfig` field.

### `quality.ts`
`initQuality(mobile?)` (call once at boot, before Environment/Atmosphere/PostFX) →
`Quality { mobile, pixelRatio, bloom, bloomResolutionScale, shadowMapSize,
grassScale }`. `detectMobile()` uses pointer/touch + viewport (< 860px); `?mobile=1`
/ `?mobile=0` force it. Desktop: pixelRatio 2, shadow 2048, grass 1. Mobile:
pixelRatio ≤1.5, bloom resolutionScale 0.5, shadow 1024, grass 0.4.

### `PostFX.ts`
The `EffectComposer`: `RenderPass` → selective bloom → ACES tone-map + brightness/
contrast + hue/saturation + vignette. `render(dt)` replaces `renderer.render`.
`setSelection(objects)` replaces the bloom set (on biome change, from
`biome.glows`); `addGlow`/`removeGlow` mutate it (MorphFX). On mobile, bloom uses
cheaper Kawase blur (no mipmap).

### `MorphFX.ts`
Transient morph effects: `burst(center, color, count=240)` (sparks) + `shockwave`.
Each registers into bloom via injected `addGlow`/`removeGlow`, animates via a
per-frame `step`, and auto-disposes on TTL. `update(dt)` must run each frame.

### `Minimap.ts`
A 132px corner radar canvas: unit at center (orange triangle by yaw), pads as
colored dots at nearest toroidal distance clamped to the rim, north up.
`setBiome(pads)` on each biome change, `update(unitPos, unitYaw)` each frame.

---

## Audio

### `AudioManager.ts`
Web-Audio lifecycle. `unlock()` (first gesture) creates the `AudioContext`;
`setBiome(cfg)` drives `MusicEngine.setTheme(cfg.music, cfg.ambientRoot ?? 261.63,
cfg.ambientGain ?? 0.45)`; `toggleMute()`; SFX `move`/`link`/`morph`/`typeTick`
(all synthesized; silently no-op before unlock). *Extend here:* add an SFX method
routed to `this.master`.

### `MusicEngine.ts`
Generative score, zero files. A look-ahead scheduler clocks a diatonic chord
progression (pads + bass) + a sparse chord-tone lead, through a synthesized
reverb; themes crossfade on morph. `MUSIC_PRESETS: Record<string, Preset>` (8
presets) defines `scale`, `progression` (scale-degree roots), `bpm`,
`beatsPerChord`, wave shapes, `brightness`, `melodyStyle`, `melodyDensity`,
`leadOctave`, `reverbMix`. `melodyStyle` is a union (`wander`/`motif`/`arp`/`pairs`/
`run`/`pulse`/`forge`) dispatched in `melody()`. *Extend here:* add a preset (data
only), a scale (to `SCALES`), or a melody style (union member + a `case`). All math
is **scale-degree relative**, never MIDI. See
[COOKBOOK → Add music](COOKBOOK.md#add-or-tune-music).

---

## Tour & ambient FX

### `TourController.ts`
The guided tour. `STOPS: { id, lines, lead? }[]` is the script; `start()` runs an
async sequence that **navigates the pad graph by BFS** (`padGraph` built in
`main.ts` from each biome's pads), drives to each focusable, waits for
`focus.zoomedIn`, and types captions. **Line-splitting:** the 1st line plays at the
text board (`focusOneSided:false`), the rest at one panel (`focusOneSided:true`,
clamped to 1); biomes with only a board get all lines there. `lead` narrates while
parked in the *penultimate* biome before the final morph. `setTourActive(true)`
locks input. *Extend here:* add/reorder a `STOPS` entry — navigation re-routes
itself (text-only change; no behavior risk).

### `TireFX.ts`
Rear-wheel dust puffs while driving (`currentSpeed > 1.2`); pooled world-space
Points with a fade+billow shader. Always active (not gated per biome).

### `DolphinFX.ts`
Low-poly dolphins arcing out of the river — **active only when the biome has a
`river`** (`setRiver(to.river)` on morph; null → all hidden). Positioned at the
nearest toroidal river image via `wrapNearest`.
