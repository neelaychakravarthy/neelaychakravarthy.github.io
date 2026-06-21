# Neelay Chakravarthy — explorable 3D portfolio

An interactive, game-like personal portfolio built in Three.js. You drive a
low-poly vehicle around a hub world; rolling onto a project "pad" **morphs the
world in place** — structures sink away and a new set rises as the sky, light,
and ambient audio crossfade into that project's biome.

**Live:** https://neelaychakravarthy.github.io/ (desktop browser recommended)

## Highlights

- **Click-to-move** driving with an angled **isometric follow-camera**
  (scroll to zoom, right-drag to orbit).
- **In-place biome morph** as the signature transition between the hub and each
  project — a staggered sink/rise plus environment + audio crossfade.
- **Fully in-world 3D info**: readable text boards, image galleries, a demo
  video screen, and clickable link signs that open in a new tab.
- **Data-driven engine**: the whole world is described by
  [`public/world.json`](public/world.json); adding a project is a manifest edit
  (a biome entry + a pad), not an engine change.
- Procedural low-poly props, wind-swept grass, ambient creatures, selective
  bloom, and procedural Web-Audio ambience — no heavyweight asset pipeline.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # type-check + production bundle → dist/
npm run preview  # serve the production build
```

## Deploy

Pushing to `main` builds and publishes `dist/` to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (Pages source:
*GitHub Actions*). It's a pure static Vite build.

## Layout

```
public/
  world.json         # the manifest the engine interprets (biomes, pads, content)
  assets/            # images, fonts, demo video, report PDFs, favicon
src/
  engine/
    Engine.ts          # renderer + render loop + postprocessing
    CameraRig.ts       # isometric follow camera (zoom / orbit)
    Unit.ts            # controllable vehicle + click-to-move steering
    ClickToMove.ts     # ground raycast + interaction routing
    AssetRegistry.ts   # procedural low-poly prefabs, keyed by modelId
    Biome.ts           # builds/disposes biomes; per-frame idle animation
    TransitionController.ts  # the GSAP morph timeline
    EnvironmentController.ts # sky / fog / light / ground crossfade
    Atmosphere.ts      # grass, clouds, birds, particles, stars
    PostFX.ts          # selective bloom + tone-mapping + vignette
    AudioManager.ts    # procedural ambient pads + SFX (Web Audio)
    interactables.ts   # 3D text boards, link chips, panels, video, pads
    WorldLoader.ts     # loads + validates world.json
  main.ts              # wiring
portfolio-research/    # RESEARCH.md + SPEC.md (design source of truth)
```

## Tech

Three.js · TypeScript · Vite · GSAP · troika-three-text · postprocessing.
Desktop-first; phones get a lightweight courtesy page.
