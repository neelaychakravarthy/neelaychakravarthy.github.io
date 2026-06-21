# Conventions, Verification & Deploy

Practical norms for working in this repo.

## Coordinate system (recap)

- `+x` east, `+z` **south** (toward camera/spawn), `−z` north (into a biome),
  `+y` up. On screen: **north is up**. Biome content sits at negative `z`; the
  unit spawns ~`z=+12..13` and drives north.
- `rotationY` is in **radians**. Units ≈ meters (car ~2 long).
- The world loops every `WORLD_PERIOD` (manifest `period`, currently 140). Cross-
  world position math **must** use `wrap.ts` (`wrapNearest`/`wrapDelta`/
  `wrapDistXZ`) or it breaks at the seam.

## Low-poly style

Keep new props consistent with the existing set (look at neighbors in
`AssetRegistry.ts` before adding):

- Build from primitives via the `mesh(geo, mat)` + `std(color, opts)` helpers.
  `std` defaults to `roughness 0.72, metalness 0.04`.
- Low segment counts (cylinders 6–16, cones 4–8) — faceted, not smooth.
- Pass `false` as `mesh()`'s 3rd arg (no shadow cast) for flat decorations,
  emissive glows, water, and text planes; solid structures cast shadows.
- Glow = an emissive material with `emissiveIntensity > 0.25` (auto-bloomed).
- Per-instance variety via `seed % N` into a color array (deterministic), not
  `Math.random()`.
- Palette per biome theme; reuse the module-level color constants
  (`AGENT_COLORS`, `WARM_CANOPIES`, the `CHAKRA_*` set) or add a new one.

## Mobile / performance

- One quality tier is chosen at boot by `quality.ts` (`initQuality()` before
  Environment/Atmosphere/PostFX). Mobile: lower pixel ratio (≤1.5), cheaper bloom
  (resolutionScale 0.5, Kawase blur), smaller shadow map (1024), 0.4× grass.
- Force a tier with `?mobile=1` / `?mobile=0` for testing.
- Touch is first-class: one-finger drag orbits, two-finger pinch zooms, tap drives
  (disambiguated from drag/pinch in `ClickToMove`/`CameraRig`).
- Budget: keep a biome's prop/mesh count comparable to existing biomes (~tens of
  prefabs). Watch the dev FPS HUD; target 60, acceptable ≥45 on the preview.

## Dev-only tooling

The FPS HUD (`stats.js`) and the **"Settings"** `lil-gui` panel are gated behind
`import.meta.env.DEV` and tree-shaken from the production bundle. Live tuning knobs
(bloom, camera, focus, world period/fog) live there in dev.

## Verifying in the preview

You **must** verify visually before finishing a change (the preview is the only way
to see it). Tricks used throughout this project:

- **Boot straight into a biome:** set root `"startBiome": "<id>"` in `world.json`,
  reload — skips the drive-there. **Always revert to `"hub"` when done.**
- **Start the world:** the splash shows two buttons; click the non-primary
  (`.start-btn:not(.primary)`) for **Free roam**, or `.start-btn.primary` for the
  **Guided tour**. (Clicking either unlocks audio + hides the loader.)
- **Drive via synthetic pointer events** (the canvas is `#app canvas`):
  ```js
  const c = document.querySelector('#app canvas');
  // left-click to drive to a screen point (mouse fires on pointerdown):
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerType:'mouse', button:0, clientX:x, clientY:y, bubbles:true }));
  c.dispatchEvent(new PointerEvent('pointerup',   { pointerType:'mouse', button:0, clientX:x, clientY:y, bubbles:true }));
  // right-drag to orbit the camera:
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerType:'mouse', button:2, clientX:420, clientY:420, bubbles:true }));
  window.dispatchEvent(new PointerEvent('pointermove', { pointerType:'mouse', clientX:180, clientY:420, bubbles:true }));
  window.dispatchEvent(new PointerEvent('pointerup',   { pointerType:'mouse', button:2, clientX:180, clientY:420, bubbles:true }));
  ```
- **Read content cleanly:** drive *up to a board* and let it park — the
  FocusController zooms it head-on (great for proof screenshots).
- **Check animation:** take two screenshots ~1.5s apart of the same static view and
  diff (embers drift, gears rotate, conveyor items shift).
- **Audio can't be auditioned** — verify music structurally (it's diatonic by
  construction) and let the user listen.
- **Watch for** `[AssetRegistry] unknown modelId` warnings and console errors after
  loading/morphing. The preview rAF-throttles in the background, so driving can be
  slow and a watchdog may false-fire — not a real bug.

## Commit & deploy

- **`npm run build` must pass** — it runs `tsc` then bundles. Type errors block.
- **Commit locally; push only when the user explicitly asks.** Branch off `main`
  if you're on it. End commit messages with the `Co-Authored-By` trailer.
- <a id="deploy"></a>**Deploy:** pushing `main` triggers GitHub Actions
  (`.github/workflows/deploy.yml`) → builds → publishes `dist/` to **GitHub Pages**
  (Pages source: *GitHub Actions*). Live at
  https://neelaychakravarthy.github.io/. After a push, watch the run
  (`gh run watch`) and verify the live bundle hash matches local
  (`ls dist/assets/index-*.js` vs the hash in the served HTML).
- It's a **user-site root**, so Vite `base` stays `/` (absolute `/assets` +
  `/world.json` paths resolve unchanged). `public/.nojekyll` is required.
- *Deploy gotchas (already handled, noted for re-hosting):* a large push can fail
  with `HTTP 400 sideband` → `git config http.postBuffer 524288000` +
  `http.version HTTP/1.1`; a fresh `*.github.io` repo auto-enables legacy Jekyll
  Pages → force `gh api -X PUT /repos/<o>/<r>/pages -f build_type=workflow`.
