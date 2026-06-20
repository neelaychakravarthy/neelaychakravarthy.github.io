# Interactive Portfolio — Locked Build Spec (v1)

*Prepared 2026-06-20. This is the agreed plan from the requirements interview. It supersedes open questions in `RESEARCH.md`. Nothing here is built yet — this is the review artifact before scaffolding.*

---

## 0. The concept in one paragraph

A desktop, game-like personal portfolio built in **Three.js**. The visitor lands in a **clean, minimal low-poly hub world** that represents *you* (about-me, contact). They steer a controllable unit by **clicking where they want it to go** (the unit drives there). The hub contains **project pads**. Driving onto a pad triggers the signature mechanic: the world **morphs in place** — the current structures sink/fall away, new project-specific structures rise from the ground, and the whole atmosphere (sky, fog, light, color, music) crossfades into that project's biome. Inside a biome, the project's info lives **fully in the 3D world** (3D text, image panels, video screens, clickable links). Driving back onto the pad morphs the world back to the hub. Adding a new project later = authoring one new "biome" as data + assets, with **zero changes to the engine**.

---

## 1. Decision log (locked)

| Area | Decision | Notes |
|---|---|---|
| **Engine** | Vanilla **Three.js** + TypeScript + Vite | Not R3F. Matches Bruno Simon reference; max control. |
| **Renderer** | **WebGLRenderer** for MVP | WebGPU deferred — wrapped behind a thin init so the later swap is small and contained. |
| **Aesthetic** | Stylized **low-poly 3D** | Hub = clean & minimal (light, airy, gradient sky). Biomes contrast against it. |
| **Movement** | **Click-to-move** | Raycast click → ground point → unit steers there. No WASD. |
| **Controllable unit** | **Swappable module**: low-poly vehicle now → character/mascot later | Built against an abstract `Unit`; swapping model+anim later needs no engine change. |
| **Camera** | **Angled isometric follow-cam** | Follows the unit with damping; rotate/zoom allowed. Best readability for click-to-move + low-poly. |
| **World structure** | **Single hub + in-place biome-morph per project** | Hub = about-you. Each pad → one project biome. Reset pad → hub. |
| **Signature transition** | **Solid morph for MVP**, escalate later | Staggered sink-away/rise-from-ground + environment crossfade. Debris/particles/camera-punch are post-MVP. |
| **Project info** | **Fully in-world 3D** | 3D text (troika), image panels, video screens, clickable link objects. No HTML overlay/modal. |
| **Long-form text** | Keep in-world copy punchy; "read more" opens external link in a new tab | Avoids tiring 3D text walls. |
| **Audio** | **Ambient music (per biome, crossfades on morph) + SFX**, mute toggle | Unlocks on first click (autoplay is blocked). Howler.js. |
| **Interactivity** | **Focused core loop for MVP** | drive → morph → read, made to feel great. Easter eggs later. |
| **Devices** | **Desktop-only** + tiny courtesy page on mobile | Mobile page = name + links + "best on desktop". Not real mobile support. |
| **SEO** | **Out of scope** | Link is shared directly in resumes/applications. Reachability (not crawlability) is why the mobile courtesy page exists. |
| **Assets** | **CC0 low-poly kits** (Kenney, Quaternius, Poly Pizza) for MVP → **AI text-to-3D + Blender cleanup** later | Blender skills built up together when we go custom. |
| **Projects at launch** | **2–3**; build **1 hero biome** for the MVP | |
| **Existing media** | Screenshots → panels · demo videos → in-world screens · live links/repos → clickable objects | |
| **Ownership** | **Claude owns all implementation + testing**; you manage, supervise, advise | No no-code authoring UI for now (data edited in-repo); can add later if you want to self-serve. |
| **Hosting** | **Static**: Cloudflare Pages + R2 for heavy assets | No backend needed (no WebSocket streaming). |
| **Scope strategy** | **MVP-first**, iterate | Phase 0 spike → Phase 1 hub + 1 biome + morph → Phase 2 remaining biomes → Phase 3 polish + deploy. |

---

## 2. Architecture

### Core principle: the engine is a fixed interpreter of a content manifest

We build the systems **once**. All world content — the hub, every biome, every pad, every info object — is described in a `world.json` manifest plus `.glb`/image/video/audio assets. The engine reads the manifest and instantiates the world. **Adding a project never touches `src/engine/`.**

### Core systems (`src/engine/`, build once, rarely touched)

| Module | Responsibility |
|---|---|
| `Engine.ts` | Renderer init (thin WebGL wrapper, WebGPU-ready), render loop, clock, resize, postprocessing composer. |
| `CameraRig.ts` | Isometric follow-cam: damped follow of the unit, rotate/zoom, framing during morph. |
| `ClickToMove.ts` | Pointer raycast onto the ground → destination marker → hands target to the unit. |
| `Unit.ts` | The controllable unit (abstract). Kinematic steering: seek/arrive toward target, rotate toward heading. Model is a swappable slot (vehicle → avatar). |
| `BiomeManager.ts` | Holds the registry of biomes + current state; asks `AssetRegistry` to build/teardown biome content. |
| `TransitionController.ts` | **The morph.** A GSAP timeline that staggers old objects sinking/scaling out and new objects rising/scaling in, synchronized with the environment + audio crossfades. |
| `EnvironmentController.ts` | Sky (gradient/HDRI), fog, light color/intensity, ground material — lerps between biome environment configs. |
| `AssetRegistry.ts` | `modelId` → cached GLTF. GLTFLoader + DRACOLoader + KTX2Loader. Instancing for repeated props. |
| `interactables/InfoPanel.ts` | 3D text (troika) + optional image plane. |
| `interactables/VideoScreen.ts` | A plane with a `VideoTexture` (plays on approach, pauses when away). |
| `interactables/LinkObject.ts` | Clickable 3D object → `window.open(url)` in a new tab. |
| `interactables/Pad.ts` | Trigger volume. On unit-enter: fire morph to `targetBiome` (or reset to hub). |
| `AudioManager.ts` | Howler. Per-biome ambient (crossfade on morph) + SFX (move, morph whoosh, hover). Mute + first-gesture unlock. |
| `WorldLoader.ts` | Fetch + **Zod-validate** `world.json` → build hub, register biomes, place pads. Fails loudly in dev on bad data. |

### UI layer (`src/ui/`, minimal)
Loading screen, mute button, first-visit control hint ("click to move • drive onto a glowing pad"), and the mobile courtesy gate. That's it — no responsive HUD, no overlays.

### Content model (`content/world.json`)
One hub + N biomes + pads. Each biome carries its own environment, audio, and in-world content. **This file (plus assets) is the only thing that grows as you add projects.**

```jsonc
{
  "$schema": "./world.schema.json",
  "version": 1,
  "unit": { "model": "models/vehicle.glb", "speed": 6, "turnRate": 4 },

  "hub": {
    "id": "hub",
    "title": "About Me",
    "environment": {
      "sky": { "type": "gradient", "top": "#cfe9ff", "bottom": "#ffffff" },
      "fog": { "color": "#eaf4ff", "near": 30, "far": 120 },
      "light": { "color": "#ffffff", "intensity": 1.1, "sunAngle": [45, 130] },
      "ground": { "model": "models/hub-ground.glb", "color": "#e9eef5" }
    },
    "audio": { "ambient": "audio/hub-ambient.mp3" },
    "content": [
      { "type": "info", "id": "intro", "position": [0, 1.6, -4],
        "title": "Hi, I'm <Name>", "body": "One-line who-you-are.", "scale": 1 },
      { "type": "link", "id": "github", "model": "models/sign.glb",
        "position": [3, 0, -2], "label": "GitHub", "url": "https://github.com/..." },
      { "type": "link", "id": "resume", "model": "models/sign.glb",
        "position": [-3, 0, -2], "label": "Resume", "url": "/resume.pdf" }
    ],
    "pads": [
      { "id": "pad-aurora", "position": [0, 0, 6], "target": "aurora", "label": "Project: Aurora" }
    ]
  },

  "biomes": [
    {
      "id": "aurora",
      "title": "Aurora — Realtime Weather Viz",
      "environment": {
        "sky": { "type": "gradient", "top": "#0b1e3a", "bottom": "#1c3b6e" },
        "fog": { "color": "#15294d", "near": 20, "far": 90 },
        "light": { "color": "#9ec5ff", "intensity": 0.8, "sunAngle": [20, 200] },
        "ground": { "model": "models/aurora-ground.glb", "color": "#13243f" }
      },
      "audio": { "ambient": "audio/aurora-ambient.mp3" },
      "structures": [
        { "modelId": "tower",  "position": [-4, 0, -3], "morphGroup": "a" },
        { "modelId": "antenna","position": [ 4, 0, -3], "morphGroup": "b", "instanced": true }
      ],
      "content": [
        { "type": "info",  "id": "aurora-blurb", "position": [0, 2, -5],
          "title": "Aurora", "body": "Realtime weather viz. Built with X, Y." },
        { "type": "panel", "id": "aurora-shot", "position": [-3, 1.5, -2],
          "image": "textures/aurora-cover.ktx2" },
        { "type": "video", "id": "aurora-demo", "position": [3, 1.6, -2],
          "src": "video/aurora-demo.mp4" },
        { "type": "link",  "id": "aurora-live", "model": "models/sign.glb",
          "position": [0, 0, -1], "label": "Live demo", "url": "https://aurora.example.com" }
      ]
    }
  ]
}
```

`morphGroup` tags let the `TransitionController` stagger objects in waves for a more choreographed sink/rise. Everything is validated against a Zod schema in dev so a typo can't ship a broken world.

### Repo layout

```
portfolio/
├── public/
│   └── assets/
│       ├── models/      # optimized .glb (CC0 kits → custom later)
│       ├── textures/    # .ktx2 / .webp panel images
│       ├── video/       # .mp4 demos
│       ├── audio/       # ambient tracks + sfx
│       └── decoders/    # draco/ + basis/ wasm transcoders
├── content/
│   ├── world.json       # ← the manifest you/we edit to add projects
│   └── projects/*.md    # optional long-form, linked out
├── src/
│   ├── engine/          # BUILD ONCE (see table above)
│   ├── ui/              # loading, mute, hint, mobile gate
│   ├── schema/world.schema.ts   # Zod validation
│   └── main.ts
├── scripts/optimize-assets.mjs  # gltf-transform pipeline
├── index.html
├── mobile.html          # desktop-only courtesy page
└── package.json
```

---

## 3. Tech stack (with rationale + license)

| Library | Use | License |
|---|---|---|
| **three** | Core engine | MIT |
| **typescript + vite** | Language + dev/build | MIT |
| **troika-three-text** | Crisp SDF 3D text in-world | MIT |
| **gsap** | Morph choreography timelines (stagger, easing) | Free for all uses since 2025; `@tweenjs/tween.js` (MIT) is a drop-in fallback |
| **howler** | Audio: ambient crossfades + SFX, mute, unlock-on-gesture | MIT |
| **camera-controls** (yomotsu) | Damped isometric rig with smooth rotate/zoom | MIT |
| **zod** | Validate `world.json` so bad content fails loud in dev | MIT |
| **postprocessing** (pmndrs) or three `EffectComposer` | Bloom/vignette/color-grade pass (Phase 3) | MIT |
| **lil-gui** + **stats-gl** | Dev-time tuning + FPS HUD | MIT |
| GLTFLoader / DRACOLoader / KTX2Loader | Asset loading + compression | MIT (three addons) |
| **@gltf-transform/cli** | Asset optimization (Draco/KTX2/meshopt) in `scripts/` | MIT |

Deferred (add only when needed): **three-pathfinding / recast** for navmesh pathfinding (MVP uses simple kinematic steering); **WebGPURenderer + TSL** as a later renderer swap; **Rapier** physics only if we add collisions/terrain.

---

## 4. The extensibility contract

> **To add a new project after the engine exists:**
> 1. Drop its optimized `.glb` assets into `public/assets/models/` (+ any panel image/video/audio).
> 2. Add one biome entry to `content/world.json` (environment + structures + content) and one pad in the hub.
> 3. Run `npm run validate` (Zod) + `npm run optimize` (gltf-transform).
> 4. Done. **No `src/engine/` changes.**

Because Claude owns implementation, in practice this means: you hand over the project (assets/media/blurb), and adding the biome is a fast, self-contained content task. If you later want to do it yourself, this same data-driven design is what a small authoring UI would sit on top of.

---

## 5. Phased roadmap (with exit criteria)

**Phase 0 — Core-tech spike.** Vite + TS + Three.js boot; isometric `CameraRig`; `ClickToMove` raycast; a vehicle that kinematically steers to clicked points on a flat ground with a few CC0 props; stats HUD.
- *Exit:* you can click around a plane and watch the vehicle drive to each point, camera following, at a smooth framerate.

**Phase 1 — Hub + one hero biome + the morph (this is the MVP).** Build the real engine systems (`BiomeManager`, `TransitionController`, `EnvironmentController`, `AssetRegistry`, `AudioManager`, interactables, `WorldLoader`). Author the clean hub (about-you in-world content + 1 pad) and one **hero project biome** with full in-world info (3D text + image panel + video screen + link object). Implement the morph (staggered sink/rise + sky/fog/light crossfade + audio crossfade). Loading screen, mute, first-visit hint, mobile courtesy gate.
- *Exit:* visitor lands in the hub, reads about you, drives onto the pad, the world **morphs** into the hero project, they explore its info, drive back, world morphs to hub. Shareable live link.

**Phase 2 — Remaining projects + content pipeline.** `scripts/optimize-assets.mjs`; add biomes 2–3 **purely as data + assets**; per-biome audio; tune each morph's choreography. Confirm: a new project added without opening `src/engine/`.
- *Exit:* all 2–3 projects live; adding the Nth was a content-only change.

**Phase 3 — Polish + deploy.** Postprocessing pass (bloom/vignette/color grade); escalate morph FX (particles/debris/camera punch); performance budget + loading polish; deploy to Cloudflare Pages + R2; custom domain.
- *Exit:* polished, fast, deployed at your domain; mobile visitors get the courtesy page.

---

## 6. Open items (do NOT block scaffolding)

These are **content/creative inputs**, gathered as we reach the phase that needs them:

1. **Your field/role** (one line) — flavors the hub copy and overall tone.
2. **Your 2–3 projects** — name + one phrase each, and **which is the hero** (built first in Phase 1). Needed at the start of Phase 1, not before.
3. **Per-biome theme** — each project's biome look (e.g. "weather viz → night sky / aurora"). Designed when we build that biome.
4. **Music sourcing** — royalty-free ambient tracks (curated packs or generated). Decided before Phase 1 audio.
5. **Domain** — your custom domain for deploy. Needed at Phase 3.

---

## 7. What's explicitly *out* of scope (so we don't drift)

- HTML overlay/modal info UI · responsive mobile experience · SEO/crawlability · WebGPU (MVP) · physics engine (MVP) · navmesh pathfinding (MVP) · multiplayer · CMS / no-code authoring UI · ASCILINE-style server streaming (the ASCII look, if ever wanted, becomes a swappable post-processing shader — not the architecture).

---

*Next action on approval: scaffold Phase 0 (Vite + TS + Three.js, isometric camera, click-to-move vehicle on a test ground) and show it running.*
