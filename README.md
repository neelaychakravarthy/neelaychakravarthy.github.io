# Portfolio — game-like explorable WebGL world

An interactive, game-like personal portfolio built in Three.js. You explore a
low-poly world; each project transforms the world into its own "biome." See the
full plan in [`portfolio-research/SPEC.md`](portfolio-research/SPEC.md) and the
landscape research in [`portfolio-research/RESEARCH.md`](portfolio-research/RESEARCH.md).

## Status: Phase 0 (core-tech spike)

Proves the core feel before the real engine is built:

- **Click-to-move** — left-click the ground; a low-poly vehicle steers there.
- **Angled isometric follow-camera** — wheel to zoom, right-drag to orbit.
- Clean minimal low-poly test world (gradient sky, soft shadows, scattered props).
- Dev HUD: FPS (stats.js) + live tuning (lil-gui).

The controllable unit and the world are deliberately built as swappable slots,
so Phase 1 (hub + per-project biome morph) layers on without rework.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # type-check + production bundle
npm run preview  # serve the production build
```

## Layout

```
src/
  engine/
    Engine.ts        # renderer + render loop (WebGL now, WebGPU-ready)
    CameraRig.ts     # isometric follow camera (zoom / orbit)
    Unit.ts          # controllable unit + car-like click-to-move steering
    ClickToMove.ts   # ground raycast + destination marker
  world/
    TestScene.ts     # Phase 0 placeholder world (→ data-driven hub/biomes in Phase 1)
  main.ts            # wiring + dev HUD
portfolio-research/  # RESEARCH.md + SPEC.md
```

## Tech

Three.js · TypeScript · Vite · lil-gui · stats.js. Desktop-first (per spec).
