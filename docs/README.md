# Portfolio Engine — Developer Docs

Orientation for anyone (human or agent) extending this explorable 3D portfolio.
If you're about to change anything, read [ARCHITECTURE.md](ARCHITECTURE.md)
first — especially **the one rule** below.

## The one rule

`src/engine/` is a **fixed interpreter** of `public/world.json`. The whole world
— hub, biomes, props, text, pads, music, atmosphere — is *data*.

- **Adding a project** = add a biome entry + a hub pad to `world.json`.
  **No engine code.**
- **Touch `src/engine/` only for a new _capability_** (a new prop, animation,
  content type, or music style) — and add it the manifest-driven way: a new
  `modelId` factory, a new generic `userData` animation tag, a new `ContentKind`
  case, or a new music preset. **Never hardcode a specific project's content into
  the engine.**

If you find yourself writing `if (biome.id === 'goti')` in the engine, stop —
that's the anti-pattern this architecture exists to avoid.

## Docs map

| Doc | What's in it |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | The big picture: stack, the data-driven engine, the per-frame update loop (with the critical ordering rules), the module map, coordinate system, the toroidal looping world, the morph lifecycle. |
| [MANIFEST.md](MANIFEST.md) | Complete `world.json` reference — every field of every config, what reads it, with examples. |
| [ENGINE.md](ENGINE.md) | Per-module reference: each `src/engine/` file's job, public API, and extension points. Includes the master **`userData` animation-tag table** (how props get wired generically). |
| [COOKBOOK.md](COOKBOOK.md) | Copy-paste recipes: add a biome / prop / animation hook / music preset / tour stop / tune atmosphere & the hub. |
| [CONVENTIONS.md](CONVENTIONS.md) | Coordinate system, low-poly style, mobile/perf tiers, the preview-verification tricks, the commit & deploy workflow. |
| [SPEC.md](SPEC.md) | The original locked build plan (historical — some details have since drifted; ARCHITECTURE/ENGINE describe the as-built reality). |
| [RESEARCH.md](RESEARCH.md) | The pre-build research dossier (historical). |

## Quick facts

- **Stack:** vanilla Three.js (`three` r0.170) + TypeScript + Vite 6. Not R3F.
  Post-processing via `postprocessing` (pmndrs). Text via `troika-three-text`.
  Morph timeline via `gsap`. No physics engine, no asset loaders in use.
- **Live:** https://neelaychakravarthy.github.io/ — auto-deploys on push to
  `main` (GitHub Actions → Pages). See [CONVENTIONS.md](CONVENTIONS.md#deploy).
- **Manifest:** [`public/world.json`](../public/world.json) — currently 7 biomes:
  `hub` + `goti`, `sidekick`, `classroom`, `churn-ml`, `tsp-opt`, `chakra`.
- **Run:** `npm run dev` (port 5173). **Build + type-check:** `npm run build`.
- **Everything is procedural.** Props are built from Three.js primitives in
  [`AssetRegistry.ts`](../src/engine/AssetRegistry.ts); music is synthesized in
  [`MusicEngine.ts`](../src/engine/MusicEngine.ts). The only real media files are
  project screenshots, one demo video, fonts, and report PDFs under
  `public/assets/`.

## The 30-second mental model

```
public/world.json  ──loaded by──>  WorldLoader (Zod-style validation)
        │
        ▼
   src/engine/  (fixed interpreter — you rarely touch this)
        │
        ├─ BiomeManager + AssetRegistry  → builds a biome's THREE.Group from `structures` + `content` + `pads`
        ├─ EnvironmentController         → sky/fog/light/ground from `environment`
        ├─ Atmosphere                    → grass/birds/particles from `atmosphere`
        ├─ AudioManager + MusicEngine    → generative score from `audio`
        ├─ Unit + ClickToMove + CameraRig + FocusController → drive & frame
        └─ TransitionController          → the in-place morph between biomes
```

Each prop is a procedural `THREE.Group`; **animation and interaction are wired
generically by `userData` tags** (`spinSpeed`, `billboard`, `water`, `skiLift`,
`conveyor`, `padTarget`, `url`, `focus`, …) that `Biome.ts` collects with one
`group.traverse()` and animates in `BiomeManager.update()`. That tag convention
is the seam that keeps the engine generic — learn it from the table in
[ENGINE.md](ENGINE.md#userdata-tag-reference).
