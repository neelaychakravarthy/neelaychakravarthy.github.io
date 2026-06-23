# CLAUDE.md — portfolio

An explorable, game-like 3D portfolio: drive a low-poly car around a hub world,
roll onto a project "pad", and the world **morphs in place** into that project's
biome. Vanilla **Three.js + TypeScript + Vite** (not R3F).

Full developer docs live in [`docs/`](docs/). **Start with
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).**

## Architecture invariant — do not break this

`src/engine/` is a **fixed interpreter** of the `public/world.json` manifest. The
world (hub, biomes, props, text, pads, music, atmosphere) is **data**.

- **Add a project** → add a biome entry + a hub pad in `world.json`. **No engine
  changes.**
- **Touch `src/engine/` only to add a new _capability_** — a new prop, animation,
  content type, or music style — and add it the data-driven way:
  - a new `modelId` factory in `AssetRegistry.ts`,
  - a new generic `userData` animation tag collected in `Biome.ts`,
  - a new `ContentKind` case in `interactables.ts`,
  - or a new preset/melody style in `MusicEngine.ts`.
- **Never branch on a specific biome id in the engine.** If you're writing
  `if (biome.id === 'goti')` inside `src/engine/`, stop — that's the exact
  anti-pattern this design exists to prevent.

Recipes for all of the above: [`docs/COOKBOOK.md`](docs/COOKBOOK.md). Module +
`userData`-tag reference: [`docs/ENGINE.md`](docs/ENGINE.md). Manifest schema:
[`docs/MANIFEST.md`](docs/MANIFEST.md).

## Workflow

- **Commit locally; push only when the user asks.** Pushing `main` triggers a
  live deploy (GitHub Actions → GitHub Pages).
- `npm run build` must pass (it type-checks via `tsc`).
- **Map first for spatial work.** Before placing or moving anything in the world
  (a biome, pad, structure, the racetrack, beaches, the mountain…), draw a
  colored top-down map of the world + the proposed change for the user to review
  **before** writing code. Orient north up (north = −z), show the toroidal tile
  (period 140, so −70..70), a grid, an N compass, and a legend; pull coordinates
  from `public/world.json`. Use the visualization tool for the SVG.
- **Verify visually in the Vite preview before finishing** — boot a biome
  directly via `startBiome`, drive with synthetic pointer events, screenshot. See
  "Verification" in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).
- All assets are procedural (no glTF/texture pipeline yet); props are built from
  primitives, music is synthesized Web Audio.
