# Architecture

How the engine fits together, in enough depth to extend it safely.

## 1. The core principle

The engine is a **fixed interpreter of a content manifest**. We built the systems
once; all world content lives in [`public/world.json`](../public/world.json).
`WorldLoader` fetches + validates it, and the engine instantiates everything from
it. **Adding a project never touches `src/engine/`.** You only touch the engine to
add a genuinely new *capability*, and even then you add it in a data-driven way so
the manifest stays the source of truth (see [the recipes](COOKBOOK.md)).

> As-built note: this matches [SPEC.md](SPEC.md) in spirit, but several specifics
> drifted during the build. Trust this doc + [ENGINE.md](ENGINE.md) for current
> reality. Key drifts from the original spec: **assets are 100% procedural**
> (no glTF/Draco/KTX2 loaders in use), **audio is synthesized Web Audio**
> (no Howler, no files), the manifest is at **`public/world.json`** (not
> `content/`), there is **no `src/ui/` folder** (UI is `index.html` + `main.ts` +
> `style.css`), the world **loops toroidally**, and mobile is **fully supported**
> (not a courtesy page). Hosting is **GitHub Pages**.

## 2. Tech stack

| Library | Use |
|---|---|
| `three` (r0.170) | Core engine — `WebGLRenderer`, scene graph, primitives, shaders via `onBeforeCompile`. |
| `typescript` + `vite` | Language + dev/build. `npm run build` type-checks then bundles. |
| `troika-three-text` | Crisp SDF 3D text for boards / labels / link chips. |
| `gsap` | The morph timeline (staggered sink/rise + crossfades) and a few eases. |
| `postprocessing` (pmndrs) | `EffectComposer`: selective bloom, ACES tone-map, contrast/saturation, vignette. |
| `lil-gui` + `stats.js` | Dev-only "Settings" panel + FPS HUD (tree-shaken from prod via `import.meta.env.DEV`). |

No physics engine, no navmesh, no asset loaders, no audio files. Movement is
kinematic steering; props and sound are procedural.

## 3. Source layout

```
public/
  world.json              # THE MANIFEST — the engine interprets this
  assets/{img,video,fonts,docs}   # screenshots, demo video, Inter font, OG image, report PDFs
src/
  main.ts                 # boot + wiring + the per-frame update loop
  style.css               # all CSS (HUD, loader/splash, tour captions, start screen)
  world/types.ts          # the world.json TypeScript contract (no runtime code)
  engine/                 # the fixed interpreter (23 modules) — see ENGINE.md
docs/                     # you are here
```

There is no separate `src/ui/`: the loader/splash, control hint, start-screen
buttons, mute button, minimap, and tour captions are created in `main.ts` /
`Minimap.ts` / `TourController.ts` and styled in `style.css`.

## 4. The update loop (and its two hard rules)

`Engine.start(update)` runs a `requestAnimationFrame` loop. Each frame it computes
a **clamped** delta (`clock.getDelta()`, capped at 0.1s so a tab-out doesn't cause
a movement jump), calls `update(dt)` (the big callback in `main.ts`), then calls
`postfx.render(dt)`. **`update` always runs before the composited render.**

Inside `update(dt)`, the order is a deliberate pipeline. The exact sequence has
**two ordering rules you must not break:**

1. **`tour.update(dt)` runs _before_ `unit.update(dt)`** — the tour issues
   `unit.setTarget(...)` and the unit must consume it the same frame, or auto-drive
   stutters.
2. **`biomes.wrap(unitPos)` runs _before_ `interaction.update(...)` and
   `focus.update(...)`** — `wrap()` repositions every prop to its nearest toroidal
   image; pad-proximity and focus checks must see fresh positions.

The logical pipeline per frame:

```
tour.update(dt)                      // (1) may call unit.setTarget during a guided tour
unit.update(dt)                      // kinematic steering + collision resolution
biomes.wrap(unit.position)           // (2) toroidal: draw each prop at its nearest image
interaction.update(unit.position, …) // pad proximity → fire morph (suppressed during tour/morph)
focus.update(dt, unit.position, …)   // produce a FocusOverride when parked near content
rig.update(dt, unit.position, override)   // follow-cam, blended toward focus override
env.follow(unit.x, unit.z)           // recentre ground/sky/sun on the unit (seamless wrap)
atmosphere.update(dt, unit.x, unit.z)// grass sway + world-anchored parallax life
biomes.update(dt, camera, unit.position)  // ALL idle prop animation (see §6)
tireFX.update(dt, unit); dolphins.update(dt, unit.x); minimap.update(…)
// …then Engine calls postfx.render(dt)
```

Global state gates: `locked` (a morph is animating) blocks movement + clicks;
`tourActive` additionally blocks the interaction-pad auto-morph so the tour drives
morphs explicitly and can't be derailed.

## 5. Coordinate system & world geometry

- **Axes:** `+x` = east, `+z` = **south** (toward the default camera / spawn),
  `−z` = north (into a biome). `+y` = up. The camera sits south of the unit
  looking north-and-down (~42° isometric), so on screen **north is up, south is
  down**. A biome's content lives at negative `z` (north of spawn); the visitor
  spawns around `z = +12..13` and drives in.
- **Units:** world units ≈ meters; the car is ~2 units long. `rotationY` is in
  **radians**.
- **Toroidal loop:** the world repeats every `WORLD_PERIOD` units in x and z
  (set from `world.json` → `period`, currently **140**; code default 150, floor
  40). `wrap.ts` provides `wrapNearest(ref, base)` (nearest periodic image of
  `base` to `ref`), `wrapDelta(a, b)` (shortest signed displacement), and
  `wrapDistXZ(...)` (toroidal ground distance). Every per-object position, pad
  proximity, collider, and ambient parallax goes through these so the seam (at
  `±period/2`) stays beyond the camera horizon. **Anything new that compares
  positions across the world must use these helpers**, or it breaks at the seam.

## 6. How props animate — the `userData` tag convention

This is the seam that keeps the engine generic. Prefabs in `AssetRegistry.ts`
return a `THREE.Group`; to make a prop animate or be interactive, you set a
`userData.<tag>` on it. `buildBiome()` (in `Biome.ts`) does **one
`group.traverse()`** that collects tagged objects into typed arrays on the
`BuiltBiome` (`spinners`, `billboards`, `waters`, `skiLifts`, `conveyors`,
`galleries`, `videos`, `pads`, `clickables`, `focusables`, `glows`), and
`BiomeManager.update()` animates each array every frame.

So **adding a new kind of motion = (1) set a `userData` tag in the prefab,
(2) collect it in the traverse, (3) animate it in `update()`** — no per-project
code. The full tag list is the table in
[ENGINE.md → userData reference](ENGINE.md#userdata-tag-reference). The two newest
(`spinAxis`, `conveyor`) were added exactly this way.

## 7. Biome lifecycle & the morph

- **Build:** `BiomeManager.start(id)` builds the start biome visible and snaps the
  environment to it. `BiomeManager.build(id, hidden=true)` builds a biome with all
  `morphItems` pre-sunk (`baseY − MORPH_SINK`, `MORPH_SINK = 10`) and scaled to
  ~0, ready to rise.
- **Morph:** rolling onto a pad (or `tour`/code calling `triggerMorph(target)`)
  runs `TransitionController.morph()` — a single GSAP timeline (~2.4s) that:
  recentres the unit to the home tile (via `wrapDelta`, so the morph always plays
  near the authored origin, and `CameraRig.shift` hides the jump); staggers the
  **old** biome's items sinking/scaling out; crossfades environment + atmosphere +
  music; pulls the unit to the new `spawn`; staggers the **new** items rising;
  fires `MorphFX` (particle burst + shockwave + camera punch). `onComplete`
  swaps `current`, re-sets colliders/river/focusables/minimap/bloom-selection, and
  unlocks input.
- **Pad re-trigger guard:** a pad fires only on an **outside→inside** transition
  (`InteractionManager` tracks `wasInside`). Biomes spawn the unit just outside or
  on the return pad on purpose; `setBiome(pads, unitPos)` re-arms `wasInside` so
  you don't instantly bounce back.

## 8. Module map (one-liners)

Full detail in [ENGINE.md](ENGINE.md). The fixed interpreter:

| Module | Responsibility |
|---|---|
| `Engine.ts` | `WebGLRenderer` + scene + camera + clock + the `requestAnimationFrame` loop; owns `PostFX`. |
| `WorldLoader.ts` | Fetch + validate `world.json`; fail loud on bad data. |
| `world/types.ts` | The manifest TypeScript contract (see [MANIFEST.md](MANIFEST.md)). |
| `Biome.ts` | `buildBiome()` + `BiomeManager`: build/dispose biomes, collect tagged objects, run all idle animation, toroidal `wrap()`. |
| `AssetRegistry.ts` | `modelId → THREE.Object3D` procedural prefab factories + shared helpers (`std`, `mesh`, `connect`, `makeWater`, `makeGear`, …). |
| `interactables.ts` | `makeContent()` / `makePad()` — build boards, panels, video screens, link chips, pads; set the `focus`/`url`/`pad*` `userData` tags. |
| `TransitionController.ts` | The GSAP morph timeline. |
| `InteractionManager.ts` | Pad proximity → fire morph (outside→inside, toroidal). |
| `EnvironmentController.ts` | Sky / fog / hemi + sun light / shared ground; crossfade between biomes; recentre on the unit. |
| `Atmosphere.ts` | Grass, clouds, birds, particles, stars; crossfade; world-anchored parallax. |
| `CameraRig.ts` | Isometric follow-cam (orbit/zoom/pinch); blends toward a `FocusOverride`. |
| `FocusController.ts` | Auto-frames readable content when the unit parks near it (the "read-me" zoom). |
| `ClickToMove.ts` | Click/tap raycast: clickable links win, else ground → `unit.setTarget`; touch tap vs drag/pinch. |
| `Unit.ts` | The car: kinematic steering, wheel spin, circular `Collider` + `RiverBlock` collision (toroidal). |
| `wrap.ts` | `WORLD_PERIOD` + toroidal math helpers. |
| `AudioManager.ts` | Web-Audio lifecycle (unlock-on-gesture), drives `MusicEngine`, SFX, mute. |
| `MusicEngine.ts` | Generative per-biome score (`MUSIC_PRESETS` + melody styles), crossfaded on morph. |
| `quality.ts` | Mobile/desktop quality tier (pixel ratio, bloom, shadow size, grass scale). |
| `PostFX.ts` | The `EffectComposer` pipeline; selective bloom selection set. |
| `MorphFX.ts` | Transient morph particles + shockwave (registered into bloom). |
| `Minimap.ts` | Corner radar canvas (unit + pads, toroidal). |
| `TourController.ts` | The guided tour: pad-graph navigation + narration. |
| `TireFX.ts` / `DolphinFX.ts` | Tire dust trail; river dolphins (river biomes only). |
