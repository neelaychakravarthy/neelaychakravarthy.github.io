# Interactive, Game-Like Web Portfolio — Technology Research & Recommendations

*Prepared today. 18 distinct approaches researched, each web-grounded and adversarially fact-checked for 2026 currency. Goal: an explorable, game-like portfolio world (Three.js/WebGL-leaning, but all alternatives evaluated) with a core engine built once and content/assets added over time without changing it.*

---

## 1. Executive Summary

**TL;DR recommendation: Build the core on vanilla Three.js (r184) with the WebGPURenderer + automatic WebGL2 fallback, architected as a small data-driven engine that reads a JSON/glTF "scene manifest" — so every future project, room, or asset ships as content, never engine code. If you would rather work in React, React Three Fiber (R3F) is the equally-strong alternative.**

## The landscape

The web-3D field in mid-2026 is mature and low-risk: Three.js remains dominant (~10M weekly downloads, monthly releases), with R3F, Babylon.js, and PlayCanvas all production-grade, and Gaussian Splatting now viable for photoreal worlds. The two heavily-weighted alternatives — native game-engine web exports (Unity/Godot/Bevy) and an ASCILINE-style server-streamed-ASCII core — score poorly *for this goal*: engine exports carry multi-MB cold loads, opaque-canvas SEO/accessibility, and fragile iOS Safari behavior, while ASCILINE is a one-way video-to-text pipeline with no interactivity, no drop-in content, and an always-on backend. Both are wrong as the foundation; ASCII belongs as a swappable GPU shader filter, not the engine.

## The recommendation: vanilla Three.js, data-driven core

This is the best-matched choice because it is the *exact, open-source-proven stack* behind your stated inspiration — Bruno Simon's drive-around portfolio (folio-2025: Three.js + WebGPU/TSL, MIT-licensed, Blender sources included). The single riskiest part of this project, a navigable explorable world, is therefore a demonstrated pattern you can study and partially fork, not a research bet.

More importantly, it satisfies your hard requirement — *build the core once, add content forever without touching the engine* — better than anything else when paired with the right architecture:

- **The engine becomes a fixed interpreter.** You build a generic loader once: it reads a versioned scene manifest (rooms, spawn points, hotspots, links) and instantiates the world. Adding a project = one manifest entry + one optimized `.glb` file. Zero engine edits.
- **Metadata travels with the art.** Spawn points, hotspot triggers, and link targets are authored as Blender Custom Properties, exported to glTF `extras`, and read at runtime — no hand-maintained coordinate tables.
- **The asset pipeline is locked and reproducible.** A one-command `gltf-transform` script (Draco/meshopt geometry + KTX2 textures + automatic LOD) keeps a growing world at 60fps and runs in CI, so content drops can't silently blow the performance budget.
- **It future-proofs rendering for free.** WebGPURenderer + TSL is a near one-line swap that runs WebGPU where available and auto-falls-back to WebGL2 (~98% device coverage). Adopting WebGPU later is not a rewrite.
- **It deploys as a pure static site.** Cloudflare Pages (unlimited bandwidth) + R2 for heavy assets means near-zero ops and flat, predictable cost as the world grows.

The honest cost: vanilla Three.js is an engine *toolkit*, not a finished game framework. You will build the scene-manager, input, and interactable-registry layer yourself — real upfront work, but well-trodden and de-risked by open exemplars.

## The credible alternative: React Three Fiber

If you prefer React, R3F is just as strong (it scored equally in research). Its declarative component model maps cleanly onto the goal — each project becomes a reusable component you `.map()` over a JSON/CMS array — and the `drei` + `rapier` + `ecctrl` ecosystem gives drive/walk physics and navigation nearly out of the box, reducing boilerplate. The trade-off: R3F's WebGPU/TSL path is still alpha as of mid-2026, so a stable launch is WebGL, and you cannot match Bruno Simon's exact WebGPU fidelity inside R3F yet. Choose R3F for ergonomics and ecosystem; choose vanilla Three.js for maximum rendering control and WebGPU-first parity with the reference.

## Two non-negotiables, whichever you pick

1. **Content-as-data is the backbone**, not a nice-to-have — it *is* the extensibility requirement, and it's the same work that makes the site accessible and crawlable.
2. **Ship an HTML-first content layer**: every project must exist as a server-rendered, crawlable, keyboard-navigable page (with `prefers-reduced-motion` and a WebGL fallback), so a recruiter on a mid-range phone always sees your name, bio, and work — even if the 3D world never boots.

---

## 2. Recommended Architecture & Roadmap

# Recommended Architecture & Roadmap

## Primary Stack

**Vanilla Three.js (r184+) on the `WebGPURenderer` with automatic WebGL2 fallback, paired with Rapier physics, a custom data-driven scene engine, and a static Cloudflare Pages + R2 deployment.** This is the most de-risked path to the stated goal: it is the exact, MIT-licensed stack behind Bruno Simon's drive-around folio (the cited inspiration), it has the largest ecosystem and asset tooling (GLTFLoader + Draco + KTX2 + meshopt), and `WebGPURenderer` + TSL future-proofs rendering without an engine rewrite because it transparently falls back to WebGL2 for the ~18% of visitors without WebGPU. Crucially, vanilla Three.js gives you a clean scene graph onto which you build a *generic manifest interpreter once* — after that, every new room and project is data plus a `.glb`, never engine code. You accept the cost of building the scene-manager/input/interaction layer yourself, which is the core deliverable of Phase 0–1.

## Named Alternative

**React Three Fiber (R3F) v9 + drei + @react-three/rapier + ecctrl, on Next.js with a `'use client'` canvas.** Choose this if you prefer a declarative, component-per-room mental model and React-first ergonomics for the DOM/UI overlay. Content still maps to data (`.map()` over a manifest), the `gltfjsx --transform` pipeline turns each asset into a typed JSX component, and `ecctrl` gives a ready-made walk/drive controller. The tradeoff: R3F's WebGPU/TSL path is still alpha as of mid-2026, so you launch on WebGL2 and treat WebGPU as a later upgrade, and the React reconciler couples fiber/drei/rapier versions together. Pick the primary (vanilla) for maximum WebGPU fidelity and minimal abstraction; pick R3F for velocity and a richer React UI layer.

## Extensibility Design: Content as Data

The engine is a fixed interpreter. Adding a project = adding one manifest entry + dropping an optimized `.glb` + writing one Markdown file. Spawn points, hotspots, and triggers are authored in Blender as **Custom Properties** (exported to glTF `extras` → read at runtime as `userData`), so geometry and metadata travel together. Validate every manifest against a Zod/JSON-Schema in CI to catch broken `modelId`/`target` references before deploy.

```json
{
  "$schema": "./schema/world.schema.json",
  "version": 3,
  "defaultRoom": "atrium",
  "rooms": [
    {
      "id": "atrium",
      "title": "Atrium",
      "model": "rooms/atrium.glb",
      "environment": "hdri/studio_small_2k.ktx2",
      "spawn": { "position": [0, 0, 6], "rotationY": 3.14 },
      "portals": [
        { "id": "to-aurora", "target": "project-aurora", "position": [4, 0, -3], "label": "Aurora →" }
      ],
      "hotspots": [
        {
          "id": "bio-board",
          "type": "info",
          "position": [-2, 1.4, -1],
          "title": "About Me",
          "body": "content/about.md",
          "links": [{ "label": "Resume", "href": "/resume.pdf" }]
        }
      ],
      "props": [
        { "modelId": "kiosk", "position": [2, 0, 0], "rotationY": 0, "instanced": true }
      ]
    },
    {
      "id": "project-aurora",
      "title": "Aurora — Realtime Weather Viz",
      "model": "rooms/project-room-a.glb",
      "spawn": { "position": [0, 0, 4], "rotationY": 0 },
      "portals": [{ "id": "back", "target": "atrium", "position": [0, 0, 8], "label": "← Back" }],
      "hotspots": [
        {
          "id": "aurora-detail",
          "type": "project",
          "position": [0, 1.6, -3],
          "title": "Aurora",
          "body": "content/projects/aurora.md",
          "media": [
            { "kind": "image", "src": "media/aurora/cover.ktx2" },
            { "kind": "video", "src": "media/aurora/demo.mp4", "poster": "media/aurora/poster.webp" }
          ],
          "links": [
            { "label": "Live", "href": "https://aurora.example.com" },
            { "label": "Code", "href": "https://github.com/owner/aurora" }
          ]
        }
      ]
    }
  ]
}
```

Repo layout — note the hard wall between `src/engine/` (touched rarely) and `content/` + `public/assets/` (touched constantly):

```
portfolio/
├── public/
│   └── assets/
│       ├── rooms/            # optimized .glb worlds
│       ├── props/            # registry-addressable .glb props
│       ├── media/            # .ktx2 / .webp / .mp4
│       ├── hdri/             # .ktx2 environment maps
│       └── decoders/         # draco/, basis/ wasm transcoders
├── content/
│   ├── world.json            # the manifest (the thing you edit)
│   ├── about.md
│   └── projects/*.md         # one file per project (also SSR'd for SEO)
├── src/
│   ├── engine/               # BUILD ONCE — rarely touched
│   │   ├── Engine.ts         # render loop, renderer init + fallback
│   │   ├── ManifestLoader.ts # fetch + Zod-validate world.json
│   │   ├── RoomManager.ts    # load/dispose rooms, portal transitions
│   │   ├── AssetRegistry.ts  # modelId -> cached GLTF, KTX2/Draco loaders
│   │   ├── Interactables.ts  # hotspot/portal proximity + raycast triggers
│   │   ├── Controller.ts     # walk/drive (Rapier), keyboard + nipplejs
│   │   └── overlay/          # CSS2D hotspot cards, reduced-motion gate
│   ├── fallback/             # SSR HTML list view (no-WebGL path)
│   └── main.ts
├── scripts/
│   ├── optimize-assets.mjs   # gltf-transform pipeline
│   └── validate-manifest.mjs # CI gate
├── schema/world.schema.json
└── package.json
```

## Asset Pipeline

One locked, reproducible command per asset; the engine only ever loads optimized GLB, so nothing in `src/engine/` changes.

1. **Author.** Model in Blender (or start from CC0 Kenney/Quaternius kits, or AI text-to-3D via Meshy/Tripo). For AI output, do a mandatory Blender cleanup pass (retopo, UVs, strip baked lighting). Add spawn/hotspot metadata as **Custom Properties** on empties/objects.
2. **Export.** Blender → glTF 2.0 (`.glb`), with "Custom Properties" enabled so `extras` survive.
3. **Optimize** with a single scriptable command (`scripts/optimize-assets.mjs` wraps these):

```bash
npx @gltf-transform/cli optimize input.glb public/assets/rooms/atrium.glb \
  --compress draco \
  --texture-compress ktx2 \
  --texture-size 2048 \
  --simplify true        # meshopt-based LOD candidate generation

# textures to GPU-resident KTX2 (ETC1S for color, UASTC for normals):
npx @gltf-transform/cli etc1s public/assets/rooms/atrium.glb public/assets/rooms/atrium.glb
```

4. **Register.** Reference the file in `world.json` by `model`/`modelId`. The `AssetRegistry` resolves `modelId` → cached GLTF; instanced props collapse into one draw call. Run `npm run validate` (Zod) in CI — a typo'd `modelId` fails the build, never ships.

Bundle the Draco + Basis transcoders once under `public/assets/decoders/` and wire `DRACOLoader`/`KTX2Loader` paths in `AssetRegistry.ts` — the single most common integration failure.

## Phased Roadmap

**Phase 0 — Core-tech spike (1 week).** Prove the riskiest pieces in a throwaway scene. Deliverables: `WebGPURenderer` booting with verified WebGL2 fallback (`forceWebGL` test); `WebGL.isWebGLAvailable()` gate; one Rapier-driven walk controller (WASD + nipplejs mobile joystick) moving a capsule around a flat plane at 60fps; a `.glb` loaded through Draco + KTX2 with decoders correctly pathed; a stats-gl perf HUD. Exit criterion: you can walk around a compressed model on desktop and a mid-range phone.

**Phase 1 — First explorable room + one real project (2–3 weeks).** Build the *actual engine* as the manifest interpreter. Deliverables: `ManifestLoader` (fetch + Zod-validate `world.json`), `RoomManager` (load/dispose, portal fade transitions), `AssetRegistry`, `Interactables` (proximity + raycast triggers), and CSS2D hotspot cards. Author one `atrium` room and one `project-aurora` room with a real project's content driven entirely from `world.json` + Markdown. Diegetic onboarding (ground text, auto-camera nudge toward a portal). Exit criterion: a visitor spawns, walks to a portal, enters the project room, and reads a real project — and you added that project by editing data only.

**Phase 2 — Content & authoring tooling (1–2 weeks).** Make adding content a 10-minute data task. Deliverables: the locked `optimize-assets.mjs` script + `npm run add-asset` helper; `world.schema.json` with editor autocomplete; a CI GitHub Action running manifest validation + a draw-call/triangle budget gate; documented Blender Custom-Property conventions (`spawn`, `hotspot`, `portal`); optionally wire a headless CMS (Sanity/TinaCMS) feeding `world.json` if a non-coder will edit. Exit criterion: you add a second real project end-to-end without opening `src/engine/`.

**Phase 3 — Polish, accessibility/SEO fallback, deploy (1–2 weeks).** Deliverables: SSR/SSG HTML content layer (Astro or Next) rendering every project from the same Markdown — canonical per-project URLs, OpenGraph, sitemap.xml, JSON-LD (Person + CreativeWork); `prefers-reduced-motion` gate disabling auto-camera/idle motion; a tab-navigable "list view" fallback when WebGL is unavailable; LOD + frustom-tuning + occlusion/zone visibility pass; postprocessing (and optional ASCII shader filter as a swappable post-pass). Deploy: static build to Cloudflare Pages (unlimited bandwidth), large assets on R2 (zero egress), git-push CI running the optimization + validation steps. Exit criterion: site scores well on Lighthouse, works on a recruiter's locked-down phone with the engine never booting, and every project is crawlable HTML.

---

Key files referenced (all under the proposed `portfolio/` root): `content/world.json` (the manifest you edit), `src/engine/` (build-once interpreter), `scripts/optimize-assets.mjs` (asset pipeline), `schema/world.schema.json` (CI validation gate).

---

## 3. Approach Comparison

| Approach | Control | Dev speed | Ecosystem | Extensibility | Asset pipeline | Mobile/perf | SEO/a11y | Bundle/load | Maturity 2026 | Fit (score/10) |
|---|---|---|---|---|---|---|---|---|---|---|
| Three.js vanilla | High | Med | Very High | High (DIY core) | Excellent (glTF/Draco/KTX2) | Good | Manual (CSS2D/3D) | ~155KB core | Very mature (r184) | 9 |
| React Three Fiber | High | High | Very High | High (data-driven) | Excellent (gltfjsx) | Good | Manual + SSR friction | Med (React+coupling) | Mature (v9, WebGPU alpha) | 9 |
| Babylon.js | High | High | High | High (AssetContainer) | Strong (Havok, editors) | Good | Weak (canvas) | Larger | Very mature (v9) | 8 |
| PlayCanvas | Med | Very High | Med | High (ECS+editor) | Managed (cloud) | Good | Weak | Larger | Very mature (2.x) | 7 |
| Native WASM (Unity/Godot/Bevy) | Med | High (editors) | High | Low (rebuild; Unity OK) | Editor pipelines | Fragile (iOS) | Near-zero | 7–30MB | Mature, web 2nd-class | 4 |
| Lightweight WebGL (OGL/regl/twgl) | Very High | Low | Low | Low (DIY pipeline) | OGL only; else none | Good | Manual | <30KB | Maintained, no WebGPU | 6.5 |
| ASCII/text-frame (ASCILINE) | Med | Low | Low | None (re-encode video) | Video, not assets | Good (filter) | Poor | Light (filter) | Young repo; technique mature | 4 |
| 2D Pixi/Phaser | Med–High | High | High | High (Tiled/Aseprite) | Excellent (tilemaps) | Excellent | Opt-in overlay | Light | Healthy (Pixi v8/Phaser 4) | 8 |
| Gaussian splatting (Spark) | Med | Med | Growing | High (assets), Low (gameplay) | Clean (capture→SOG) | Uneven | None (semantic-free) | Heavy (MB-tens) | Maturing (Spark 2.1) | 8 |
| Spline / no-code | Low | Very High | Thin | Low (lock-in vs static) | glTF import, republish | Poor (99% CPU reports) | Weak | Heavy (3.js fork) | Mature editor, risky runtime | 5 |
| WebGPU + TSL (Three.js) | High | Med | Very High | High (scene-graph) | Excellent | Good (needs LOD) | Manual | ~155KB +fallback | Evolving (r184, not frozen) | 8 |

**Reading the table:**

- **Best overall fit (9):** Three.js vanilla and R3F tie — both win on ecosystem, asset pipeline, and data-driven extensibility, which are the load-bearing requirements ("build core once, add content forever"). R3F trades a bit of bundle/version-coupling pain for much faster declarative dev speed; vanilla wins if you want a WebGPU-first build today.
- **Best "batteries-included" path (8, lower friction):** Babylon.js gives the most built-in game features (Havok physics, GUI, editors) with the least third-party glue, at the cost of a heavier bundle and a thinner creative-coding/React ecosystem than Three.js.
- **Extensibility + sustainable cost winner:** 2D Pixi/Phaser (8) has the cleanest content pipeline (Tiled/Aseprite → files, not code) and the best mobile/perf and load profile — it loses only on 3D "wow," not on engineering soundness.
- **Photoreal differentiator:** Gaussian splatting (8) uniquely delivers a real captured space and pairs with Three.js, but it is a visual layer only — all gameplay/interaction is separate engineering, and bandwidth/mobile are real constraints.
- **Avoid as the core:** Native WASM exports (4) and ASCII/ASCILINE-as-engine (4) both fail the goal — opaque canvas, near-zero SEO/a11y, heavy loads or non-interactive video. ASCII is excellent as a swappable shader *filter* (~8), and Spline (5) is a great *prototyping/asset* tool but a poor owned core (lock-in, CPU/perf risk). Treat all three as layers/accelerators, not foundations.

---

## 4. Key Risks, Blockers & Mitigations

## Key Risks, Blockers & Mitigations

The single largest risk is not technical novelty but **recruiter-facing reachability**: a game-like WebGL/canvas world is opaque to screen readers, crawlers, and weak devices by default, so the experience the site exists to deliver can be invisible to the exact people it targets. The risks below are consolidated across all approaches and ordered by severity.

- **Accessibility & SEO opacity (highest risk).** A canvas exposes no headings, links, or focusable elements; screen readers see one blank graphic and Googlebot/AI crawlers see nothing. *Mitigation:* author all content as data (Markdown/JSON/CMS) and server-render a real HTML page per project — canonical URL, OpenGraph, sitemap.xml, JSON-LD (Person + CreativeWork) — then hydrate the 3D world on top. The accessible page is the source of truth; the world is a view over it. Do **not** depend on `react-three-a11y` (unmaintained since 2022) — implement the focus-proxy/overlay pattern yourself.

- **Mobile / low-end / no-WebGL failure.** A 7–30 MB native-engine payload or an un-gated WebGL boot yields a blank canvas, jank, or a crash on a recruiter's mid-range phone. *Mitigation:* gate the engine behind `WebGL.isWebGLAvailable()` plus a perf/device check; when it fails, serve the lightweight HTML/text site instead of a broken canvas. This also rules native game-engine exports (Unity/Bevy) out as the primary stack (score 4) in favor of web-native Three.js/R3F.

- **Motion sickness & hostile onboarding.** Smooth free-roam locomotion and pointer-lock are the top causes of disorientation and the fastest bounce. *Mitigation:* pick one forgiving locomotion model (hub-and-spoke + teleport, or Bruno-style drive/walk); honor `prefers-reduced-motion` via `matchMedia` to disable auto-camera motion/parallax; add diegetic onboarding (ground hints, auto-camera nudge) so visitors know they can move.

- **Extensibility decay (the CORE requirement).** A too-rigid scene schema forces engine edits per project, defeating "build once, add forever." *Mitigation:* a versioned JSON/MDX manifest interpreted by a generic loader; spawn/hotspot metadata authored as glTF `extras` → `userData` with a documented convention (e.g. `kgame_type`); Zod/JSON-Schema validation in CI to catch broken `modelKey` references before deploy.

- **Performance drift as content grows.** Frustum culling is automatic but occlusion culling is not, and careless assets silently blow the draw-call budget. *Mitigation:* design zone/portal visibility early (retrofitting violates "don't touch the engine"); enforce a locked `gltf-transform` pipeline (weld → simplify/LOD → Draco/Meshopt → KTX2) as a CI gate; instance repeated props.

- **ASCILINE streaming as core (architectural trap).** Its server-side video-to-ASCII WebSocket pipeline is non-interactive, needs an always-on Python/OpenCV backend, and breaks static hosting. *Mitigation:* never use it as the engine — reproduce the look as a client-side GPU shader post-process, or pre-bake ASCII frames at build time; reserve WebSockets only for optional multiplayer presence.

- **Renderer/API churn & vendor lock-in.** WebGPURenderer/TSL APIs are still evolving; Spline's interactive runtime and PlayCanvas's editor backend are proprietary. *Mitigation:* pin the Three.js version and treat WebGPU as progressive enhancement with automatic WebGL2 fallback; keep no-code tools (Spline) as asset/prototyping layers, not the owned core.

**Fallback strategy.** Treat the HTML-first content layer as non-negotiable infrastructure, not polish. Every project lives as a server-rendered, crawlable, keyboard-navigable page that is fully usable with the 3D engine never booting — the recruiter-phone safety net, the screen-reader path, the no-JS/no-WebGL fallback, and the AI-crawler-readable version, all from one shared content source. Because that shared source also feeds the explorable world, doing accessibility and SEO correctly is the *same work* as making the site extensible: one pipeline, four payoffs.

---

## 5. Open Questions & What to Prototype First

# Open Questions & What to Prototype First

## Key decisions the owner must make before building

- **2D or 3D?** A drivable 3D world maximizes "wow" (Bruno-Simon territory) but front-loads asset/perf work; a tilemap 2D world (Phaser 4 / PixiJS) is cheaper per-addition, more mobile-friendly, and accessible. *Recommended default: 3D, since the owner leaned Three.js and spectacle is part of the brief — but only if they can commit to the asset pipeline below.*
- **Aesthetic: photoreal vs stylized vs ASCII?** Stylized low-poly (Blender baked) is the proven, lowest-risk look; Gaussian splats give photoreal but no native interactivity; ASCII is a striking *filter*, not an engine. *Recommended default: stylized low-poly as the base, ASCII as a toggleable GPU post-process for an intro/accent.*
- **Engine ergonomics: vanilla Three.js vs React Three Fiber?** Vanilla leads on WebGPU/TSL fidelity (Bruno's path); R3F leads on declarative, data-driven content composition and React ergonomics. *Recommended default: R3F on the v9/WebGL line — its component model best serves "content as data," with WebGPU as a later upgrade.*
- **How much does mobile matter?** If recruiters open it on phones (they do), mobile is non-negotiable and constrains draw-call/texture budgets and touch controls from day one. *Recommended default: treat mobile as a first-class target; design touch (nipplejs) and a reduced-motion/list fallback up front.*
- **Backend appetite?** A true ASCILINE-style server stream needs an always-on Python container (~$5-10/mo + ops). *Recommended default: zero backend — static on Cloudflare Pages + R2, and pre-bake any ASCII frames at build time or use a client-side shader.*
- **Time budget?** The "build core once" engine (manifest loader → spawner → interactable registry → navigation) is real upfront work before any content pays off. *Recommended default: scope a 2-3 week engine spike before committing to the full world.*

## Still under-explored / uncertain

- **The content-manifest schema itself** — the single highest-leverage, least-specified artifact. No off-the-shelf glTF convention exists for spawn/hotspot/portal semantics; the owner must invent and CI-validate one (Zod/JSON-Schema).
- **Who authors content long-term?** If the owner is non-technical for edits, raw JSON/MDX is poor UX and a CMS becomes its own build.
- **ECS bus-factor** — koota is solid but small; miniplex is dormant. May need to own/fork.
- **AI-to-3D cleanup cost** — output topology/lighting is not engine-ready; the manual Blender pass is unbudgeted.
- **Occlusion culling strategy** — not automatic in Three.js; must be designed early or retrofitting violates "don't touch the engine."

## The single smallest prototype to de-risk everything

Build a **"one-room walking skeleton" driven entirely by a data manifest.** Specifically:

- A static R3F (or vanilla Three.js) page that reads a single `manifest.json` describing **one room, one spawn point, two project hotspots**, and loads two optimized GLBs from the registry — no hardcoded scene.
- A forgiving locomotion model (third-person walk or click-to-teleport), one diegetic onboarding cue, and a drei `<Html>` info panel on hotspot proximity.
- A parallel server-rendered HTML page listing the same two projects (shared data source), plus a `prefers-reduced-motion` / WebGL-unavailable fallback.

**Success looks like:** adding a *third* project requires editing only `manifest.json` and dropping a GLB — **zero engine code changes** — and the new project simultaneously appears in the 3D world AND the crawlable HTML page. It holds 60fps on a mid-range phone and degrades gracefully with reduced-motion on. If that loop works, the entire "build core once, add content forever" thesis is proven; if adding content forces engine edits, the schema is wrong and must be fixed before scaling.

---

## 6. Detailed Findings

### Part A — Rendering Engines & Frameworks

### Three.js (vanilla) + raw WebGL

**What it is, concretely.** [Three.js](https://threejs.org/) is the dominant JavaScript 3D engine: a scene-graph abstraction (`Scene`, `Object3D`, cameras, lights, materials, geometries) over WebGL/WebGPU. You build a portfolio world by loading `.glb` assets into the graph, attaching a camera + controls, optionally a physics step, and rendering each frame. Raw [WebGL2](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext) is the low-level GPU API Three.js sits on; you'd touch it directly only for a bespoke shader/post-process pass (e.g. an ASCII/text effect), not as the primary layer — for the large majority of 3D-web work Three.js is the right abstraction, since raw WebGL2 forces GLSL, matrix math, and draw-call management by hand.

**Maturity (as of June 2026).** Current release is [r184 / v0.184.0, published April 16 2026](https://github.com/mrdoob/three.js/releases/tag/r184), on a roughly monthly cadence. It is by far the most-used 3D-web library — ~112k GitHub stars and several million weekly npm downloads (published trackers in 2026 range from ~2.7M to ~10M depending on source/method) — so maintenance/ecosystem risk is minimal. Rendering is mid-transition: `WebGLRenderer` is still the safe default, while [`WebGPURenderer` has been production-ready since r171 (Sept 2025)](https://www.utsubo.com/blog/threejs-2026-what-changed); importing via `three/webgpu` gives a WebGPU backend with automatic WebGL2 fallback when WebGPU is absent (near-universal in 2026: Chrome/Edge 113+, Firefox 141+ on Windows / 145+ on macOS, Safari 26+). There's an [open issue to rename `WebGPURenderer` → `Renderer`](https://github.com/mrdoob/three.js/issues/31381), signaling the future default. [TSL](https://www.utsubo.com/blog/webgpu-threejs-migration-guide) (Three.js Shading Language) compiles a single node graph to both WGSL and GLSL — recommended, not required.

**The Bruno-Simon pattern is copyable.** His [folio-2019 is open-source under MIT](https://github.com/brunosimon/folio-2019), built with Three.js + Cannon.js for physics + Vite (the repo's `package.json` pins `three ^0.164`, `cannon ^0.6.2`, and `vite ^5`); primitive collision shapes drive the physics while detailed meshes are synced each frame. So a drive/walk-around explorable world is a demonstrated recipe, not a research bet. Modern physics choice: [rapier (Rust/WASM, deterministic variants, actively maintained, with major 2025 broad-phase/BVH performance gains)](https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/), or `cannon-es` as the lighter Bruno-style option (the original cannon.js is unmaintained/archived).

**Extensibility / content pipeline.** This is the strongest fit for "build the engine once, add content forever." Author a generic loader once, then express every new room/prop/project as a [GLTF asset optimized offline with gltf-transform](https://www.utsubo.com/blog/threejs-best-practices-100-tips), compressed via [DracoLoader (geometry), KTX2Loader/Basis (GPU textures), and meshopt](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) — the engine never changes to add content. Text/UI for "discover info about a person and projects" uses [`CSS2DRenderer` for real, selectable, accessible HTML labels tracking 3D points, and `CSS3DRenderer` for in-scene HTML panels](https://threejs.org/docs/#examples/en/renderers/CSS2DRenderer).

**Trade-offs specific to this goal.** Vanilla Three.js is a toolkit, not a game framework: no built-in ECS, scene manager, input system, or asset manifest — you architect that "core" yourself (real upfront work, but well-trodden). [Tree-shaking is structurally imperfect](https://discourse.threejs.org/t/what-is-the-state-of-tree-shaking/33168) (core is on the order of ~150 KB gzip), so curate `examples/jsm` imports. Declarative composition is more boilerplate than React-Three-Fiber/Threlte. No hard blocker exists — the only gate is build time.

**Verdict.** The most de-risked path to the stated vision, with an open-source exemplar and a clean asset pipeline. Keep raw WebGL2 strictly as an escape hatch.

*Confidence: medium — release version, license/stack, WebGPU production-readiness, and browser support are verified, but the npm download figure varies widely across 2026 sources and the exact core gzip size and rapier "2–5×" speedup could not be pinned to a primary 2026 source.*

### React Three Fiber (R3F) + drei ecosystem

**What it is.** [React Three Fiber](https://r3f.docs.pmnd.rs/) is a React *renderer* for [Three.js](https://threejs.org/): you describe a 3D scene as JSX (`<mesh>`, `<pointLight>`, custom components) and R3F reconciles it into real Three.js objects. The official docs claim [no overhead versus raw Three.js](https://r3f.docs.pmnd.rs/getting-started/introduction) — components render outside of React in a unified renderloop — and that scenes can *outperform* hand-written Three.js at scale thanks to React's scheduler. (Treat this as a vendor claim; there are no published independent benchmarks, and real-world performance still hinges on your own LOD/instancing discipline.) Crucially for a portfolio, it lets you build "re-usable, self-contained components that react to state" — every project, room, sign, or portal becomes a component.

**How it serves a game-like explorable world.** Navigation, physics, and game feel come from the [Poimandres](https://github.com/pmndrs) ecosystem: [`@react-three/drei`](https://github.com/pmndrs/drei) (`KeyboardControls`, camera rigs, `useGLTF`, `Html` for in-world DOM, `Environment`/`Sky`), [`@react-three/rapier`](https://github.com/pmndrs/react-three-rapier) for Bruno-Simon-style drive/walk-around physics, [`@react-three/postprocessing`](https://github.com/pmndrs/react-postprocessing) for bloom/DOF, and [zustand](https://github.com/pmndrs/zustand) for player/scene state. This is the same toolkit behind many award-winning R3F sites and is taught directly in [Three.js Journey's R3F portfolio/game lessons](https://threejs-journey.com/lessons/fun-and-simple-portfolio-with-r3f) (Bruno Simon).

**Why it nails the "build once, keep adding content" requirement.** Content becomes *data*: map over a JSON/MDX/CMS array of projects to instantiate world hotspots with zero engine changes. New 3D assets flow through a clean, repeatable pipeline — [`gltfjsx`](https://github.com/pmndrs/gltfjsx) converts a GLB/GLTF into a typed JSX component (`--types`) and, with `--transform`, outputs a draco-compressed, texture-resized, deduped, web-ready asset. That declarative + data-driven combination is the strongest argument for R3F over vanilla Three.js for an extensible portfolio.

**Maturity (June 2026).** Stable and actively maintained: [`@react-three/fiber` v9.6.1](https://github.com/pmndrs/react-three-fiber/releases) (published April 2026) with full [React 19 support](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide) — compatible across React 19.0–19.2, with the reconciler now [bundled into R3F](https://github.com/pmndrs/react-three-fiber/pull/3224) to absorb React's non-backwards-compatible internal reconciler bump between 19.1 and 19.2. [`drei` is v10.7.7](https://github.com/pmndrs/drei/releases) (~Nov 2025), and [`@react-three/rapier` v2](https://github.com/pmndrs/react-three-rapier/releases) targets fiber v9/React 19 (use rapier v1 + fiber v8 on the older React 18 line). A long-running [v10 alpha](https://github.com/pmndrs/react-three-fiber/discussions/3665) (`fiber@10.0.0-alpha.1`, Jan 2026) makes the Three.js **WebGPURenderer and TSL first-class** (`state.gl`→`state.renderer`, a new scheduler, `useUniforms`/`useNodes`/`useLocalNodes`/`usePostProcessing`) — as of June 2026 the maintainer was working toward alpha 3 with a beta to follow. It remains **pre-release**, so ship on the v9/WebGL line and treat WebGPU as a future upgrade.

**Caveats / blockers specific to this goal.** (1) **SSR**: `Canvas` is browser-only, so in Next.js you must use a `'use client'` component and [`dynamic(..., { ssr: false })`](https://nextjs.org/docs/app/guides/lazy-loading) — the world is never server-rendered, so plan a non-3D SEO/content fallback. Astro (island with `client:only`) works the same way. (2) **ASCILINE mismatch**: R3F renders a *live client-side WebGL scene*, not server-streamed colored-text frames over WebSockets — that pipeline is a bespoke add-on, not something R3F provides. (3) [`@react-three/offscreen`](https://github.com/pmndrs/react-three-offscreen) (worker rendering, the closest "render off main thread" option) is **experimental and stale** (v0.0.8, last published ~2 years ago; OffscreenCanvas support is uneven across browsers and falls back to the main thread where unavailable). (4) [theatre.js](https://www.theatrejs.com/) for authored camera cinematics is a maintenance risk (development moved to a private repo ahead of a still-unshipped 1.0). (5) LOD, instancing, and draw-call budgeting remain your responsibility.

**Bottom line:** the strongest available foundation for the *explorable-world* half of the vision, with the ASCILINE-style streaming layer added separately.

*Confidence: high — versions, maintenance status, the React 19.1→19.2 reconciler-bundling fix, and ecosystem repos were verified against npm/GitHub; only the original's fiber release date and a "Feb 2026 drei 11 alpha" date were off.*

### Babylon.js

[Babylon.js](https://www.babylonjs.com/) is a Microsoft-maintained, Apache-2.0, TypeScript-native **web game engine** — not just a renderer. Where Three.js gives you a thin WebGL/WebGPU wrapper, Babylon ships physics, a GUI system, audio, WebXR, PBR, post-processing, and glTF loading in the box. For a navigable game-like portfolio, that means far less third-party glue.

**Maturity (June 2026).** Very healthy. The latest `babylonjs` npm release is **9.13.0** (published ~June 2026; the recommended ES6 `@babylonjs/core` package tracks a similar 9.x line), on a [weekly minor cadence](https://doc.babylonjs.com/setup/frameworkPackages/frameworkVers). [Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/) landed **March 26, 2026** ([8.0 shipped March 27, 2025](https://blogs.windows.com/windowsdeveloper/2025/03/27/announcing-babylon-js-8-0/)); the project has [500+ contributors and Microsoft backing](https://en.wikipedia.org/wiki/Babylon.js). [WebGPU](https://doc.babylonjs.com/setup/support/webGPU) has been in-tree since 5.0 (May 2022), is "maintained side by side with WebGL for the foreseeable future," uses native WGSL core shaders (rewritten in 2024), and the main app-facing difference is async engine init — so it's a safe, future-proof rendering base with automatic WebGL fallback. [Havok physics](https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin) (a free, first-party MIT-licensed WASM plugin shipped via the optional `@babylonjs/havok` package since 6.0, not bundled into core) gained multi-region/floating-origin large-world support in 9.0 — useful if the explorable map grows. (Note: the Havok WASM needs WebAssembly SIMD, unsupported on iOS < 16.4.)

**How it works for this goal.** You instantiate an `Engine` (WebGL or WebGPU) + `Scene`, add a camera rig, and drive movement via Havok bodies — the same primitives a Bruno-Simon-style drive-around world needs (note Bruno Simon's own site is Three.js + Cannon.js, not Babylon). In-world labels, menus, and HUD come from the built-in GUI. Crucially for the **"build core once, keep adding content"** requirement, Babylon's [`AssetContainer`](https://doc.babylonjs.com/features/featuresDeepDive/importers/assetContainers) + `SceneLoader`/`AssetsManager` let you load, instantiate, and dispose glTF assets independently of scene code, and the [glTF loader supports registrable extensions and per-asset LOD](https://blogs.windows.com/windowsdeveloper/2025/04/03/part-3-babylon-js-8-0-gltf-usdz-and-webxr-advancements/). You define a stable engine module once, then add new rooms/props/interactions as **data**, not engine edits.

**Tooling** is a standout. The [9.0 toolchain](https://blogs.windows.com/windowsdeveloper/2026/03/30/part-2-babylon-js-9-0-tooling-updates-and-new-geospatial-features/) includes the React-based, **extensible Inspector v2** (service-oriented, custom panes/property editors), a **Playground** with multi-file editing, ESM, and npm imports via esm.sh, the **Node Material Editor** and the **[Node Particle Editor](https://npe.babylonjs.com/)** (visual graphs exported as runtime assets; the NPE actually shipped in 8.14 and was a 9.0-cycle headline), and a desktop **Babylon.js Editor** (note: community-maintained by Julien Moreau-Mathis, not core Microsoft). This lets a non-engine owner author and tune visual content over time.

**Cons / blockers specific here.** The bundle is heavier than Three.js, so ESM tree-shaking matters for fast loads. The creative-coding/portfolio reference ecosystem — and nearly every "explorable portfolio" template, including Bruno Simon's — lives in **Three.js + react-three-fiber**; Babylon's React story ([react-babylonjs](https://github.com/brianzinn/react-babylonjs)) is weaker and community-run (~880 stars, far less active than R3F). And Babylon does **nothing** for the [ASCILINE](https://github.com/YusufB5/ASCILINE) video-to-ASCII-stream concept: that's a backend (Python/FastAPI + WebSocket) + custom canvas concern entirely outside the engine.

**Proven fit:** an explorable [*Treasure Planet*-style Babylon.js portfolio](https://forum.babylonjs.com/t/showcase-treasure-planet-style-portfolio-babylon-js-angular/61629) exists in production (david-alvarado.com, built on Babylon 8.x **+ Angular**, not React), and Babylon powers production web 3D configurators — e.g. the [Wrapmate Volkswagen ID. Buzz wrap configurator](https://forum.babylonjs.com/t/wrapmate-volkswagen-id-buzz-configurator/53661) (a third-party Wrapmate project, not an official VW one) — evidence the engine handles this class of experience.

*Confidence: high — version, release-date, license, WebGPU, Havok, and tooling claims confirmed against official Microsoft/Babylon sources; only minor attribution and "new in 9.0" framing needed tightening.*

### 2D game-like approaches (PixiJS, Phaser, Canvas2D)

A 2D, tile-based world is the lowest-risk way to deliver a "walk-around-and-discover-me" portfolio, and its content pipeline fits the "build the core once, keep adding assets forever" requirement better than any 3D path.

**How it works.** You author a world as a *tilemap* (a grid of tiles painted in the free [Tiled editor](https://www.mapeditor.org/), exported as JSON/TMX) plus *sprites* (characters, NPCs, project "monuments") drawn in a tool like [Aseprite](https://www.aseprite.org/). A 2D engine paints these on a GPU-accelerated canvas, scrolls a camera as the player moves, runs tile collision, animates sprites, and fires interaction events. Project info surfaces as Pokémon-style dialog boxes or HTML overlays. Chris Simmons' shipped [Endigo Design portfolio](https://dev.to/endigo9740/my-new-portfolio-3ke6) (endigodesign.com) is a textbook implementation: a top-down RPG world where projects are pillars you inspect and NPCs give hints, built with [PixiJS](https://pixijs.com/) + SvelteKit + Tailwind, a `GameObject` base class, and a "move the world container under a fixed camera" trick (it also ships a traditional-site fallback). [Ariel Roffé's Phaser 3 site](https://github.com/ariroffe/personal-website) (live at arielroffe.quest, MIT, ~134 stars) is a second real, open-source example using Tiled maps.

**Two tools, two philosophies.** [PixiJS v8.19.0](https://github.com/pixijs/pixijs) (June 2026, MIT, ~47.4k stars, ~monthly releases, ~96% TypeScript) is a *renderer* — fast sprite batching, WebGPU/WebGL/experimental-Canvas backends with automatic fallback — but you build movement, camera, and scenes yourself. [Phaser v4.1.0](https://phaser.io/download/release/v4.1.0) (stable line shipped April 2026; v4.0.0 "Caladan" on Apr 10, v4.1.0 on Apr 30) is a full *game framework*: cameras, tilemaps, physics, input, and tweens included. Phaser 4 rebuilt its WebGL renderer into a "render node" architecture and added GPU-accelerated [`SpriteGPULayer`/`TilemapGPULayer`](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know), drawing huge maps at a cost fixed per on-screen pixel rather than per tile. For a portfolio, **Phaser gets you to a walkable world faster; PixiJS gives more control** (and is the natural home for an [ASCILINE](https://github.com/YusufB5/ASCILINE)-style streamed-frame canvas).

**Extensibility — the key win.** With a Tiled + texture-atlas pipeline, the engine is written once and every new room, NPC, or project becomes *data*: a map file, a sprite sheet, and a content blob. The community [Pixel Tools](https://phaser.io/news/2026/03/pixel-tools-phaser-asset-pipeline) (Tilepack, Atlaspack, Fontpack; MIT since v0.9) even run as a Vite plugin with hot-reload, so adding assets never means touching engine code. (PixiJS has an analogous official [AssetPack](https://pixijs.com/blog/assetpack-1.0.0).) This is precisely the "core first, content forever" model the owner wants.

**Content & accessibility.** Canvas text is invisible to screen readers and SEO by default. PixiJS mitigates this two ways: a built-in [accessibility overlay](https://pixijs.com/8.x/guides/components/accessibility) (the `AccessibilitySystem` places invisible focusable divs over the canvas, aligned to accessible objects), and a separate `DOMContainer` plus an opt-in `pixi.js/html-source` path (v8.19.0) that renders live, interactive DOM into the scene — but you must wire real HTML/Markdown for project write-ups deliberately; it is not free.

**Trade-offs.** 2D is dramatically cheaper to produce and far better on mobile/low-end devices than 3D, which demands modeling, rigging, texturing, lighting, and substantial optimization effort. The cost is a lower spectacle ceiling than a Bruno-Simon drivable 3D scene, and real (if cheaper) pixel-art labor. WebGPU now ships in all major browsers (Chrome/Edge since 113; Safari 26 and Firefox during 2025–26), but it is still not a reason to choose 2D — **WebGL remains the recommended production target on both engines**, with [PixiJS's own docs](https://pixijs.com/8.x/guides/components/renderers) calling WebGPU "feature complete" yet advising WebGL for production due to browser inconsistencies.

*Confidence: high — version numbers, licenses, the two named portfolios, Pixel Tools, the PixiJS WebGPU-vs-WebGL guidance, and WebGPU browser status were all verified against primary sources; the only material defect found was an unsupported "30%+ optimization budget" stat, now removed.*

### Gaussian Splatting / photogrammetry / NeRF

**What it is, concretely.** 3D Gaussian Splatting (3DGS) reconstructs a real space from a phone video/photos into millions of colored, oriented 3D "splats" that a GPU rasterizes in real time — yielding a photoreal, free-roam scene in the browser. For interactive web use it has largely displaced NeRF because it renders far faster (rasterization vs. per-ray MLP evaluation). For this goal it means: capture your actual studio/room, and visitors literally walk around a lifelike version of it.

**The engine that matters in 2026: Spark.** [Spark](https://github.com/sparkjsdev/spark) (built by [World Labs](https://www.worldlabs.ai/blog/spark-2.0)) is a production-grade, MIT-licensed 3DGS renderer for Three.js — **v2.1.0, May 18 2026**, ~3.3k stars, 521 commits, actively maintained. A `SplatMesh` behaves like a `THREE.Object3D`, so it's placed, rotated and animated like any object and rendered in your normal `render(scene, camera)` call, **fusing splats with ordinary Three.js meshes/GLTF** ([overview](https://sparkjs.dev/docs/overview/)). [Spark 2.0](https://www.worldlabs.ai/blog/spark-2.0) (deep-dive published April 14 2026) adds a continuous Level-of-Detail "splat tree," a streamable, random-access **.RAD** format (column-ordered + Gzip, designed for progressive refinement over the network), GPU virtual memory (fixed 16M-splat pool, 64K-splat pages, LRU eviction) and a device-tuned budget of 500K–2.5M splats for steady FPS. For reference, World Labs quotes 10M splats with SH0..3 at ~2.3 GB as raw PLY versus ~200–250 MB as SPZ; .RAD is the streamable format layered on top (no single size figure is published). Spark targets **WebGL2 (~98% device coverage) and deliberately avoids WebGPU** because WebGL2 is "almost guaranteed to run on every device today." Proof points: James Kane's *Starspeed* streams kilometre-scale, 100M+-splat sci-fi worlds in-browser; Fujiwara Ryo's up-to-40M-splat captures run on smartphones, Quest and Vision Pro.

Note: the older [mkkellogg/GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) (v0.4.7, Jan 25 2025, MIT, ~2.8k stars) is the one most tutorials cite, but its author states it is **"no longer in active development… more of a side project,"** with only progressive loading and "sub-optimal performance on mobile." Prefer Spark.

**Content pipeline (the extensibility win).** Capture with [Luma AI](https://lumalabs.ai/) or [Polycam](https://poly.cam/tools/gaussian-splatting) (full PLY export now requires a paid plan — Polycam's **Basic** tier or above, ~$12.50/mo billed annually / $30/mo monthly as of 2026; the former $17.99/mo "Pro" plan has been discontinued and survives only for legacy subscribers) → clean floaters and crop in [SuperSplat](https://github.com/playcanvas/supersplat) (browser, MIT) → compress with the [SOG format](https://blog.playcanvas.com/playcanvas-open-sources-sog-format-for-gaussian-splatting/) (open-sourced Sept 17 2025; WebP-based, Morton-ordered, **~95% smaller — a 4M-splat capture goes 1GB PLY → 42MB SOG**) via [splat-transform](https://github.com/playcanvas/splat-transform) → point a new `SplatMesh` at the URL. **Adding a new captured space is a pure content operation — the engine never changes.** As a rough order of magnitude, raw PLY captures run tens to hundreds of MB; SPLAT is smaller; SOG/SPZ-compressed scenes are typically several-to-tens of MB depending on splat count.

**Pros for this goal.** Photoreal output no hand-modeling can match; native Three.js integration so your camera, controls, raycasting and HTML project panels all still work; LoD streaming genuinely handles multi-room worlds on mobile; fully open-source MIT core (Spark, SuperSplat, splat-transform).

**Cons / blockers.** A splat is a *frozen* radiance field: **no geometry, no collision, no native interactivity, no dynamic relighting by default.** Every hotspot, trigger, navmesh and "click to open project" must be built as a separate invisible Three.js mesh layer aligned to the splat coordinate space — that interaction system is the real engineering effort, and splatting doesn't help with it. Mobile performance is uneven (flagships fine; XR2-class headsets noticeably lower; memory-limited devices can OOM). Captures need iterative cleanup, and lighting is baked in.

**Recommendation:** Use **Three.js + Spark** as the foundation; treat Gaussian splats as swappable photoreal *environment content* and build the game-like interaction layer as the reusable "core." For an explorable portfolio set in a real space, this is among the most striking and on-theme options available today.

*Confidence: high — repos, versions, dates, licenses, file-format figures and named demos were verified against primary sources; the two corrected errors (RAD vs SPZ size, Polycam pricing) are now aligned with current World Labs and Polycam pages.*

### WebGPU + TSL (forward-looking)

**What it is.** Build the explorable world with [Three.js](https://threejs.org/), but render through `WebGPURenderer`. The `three/webgpu` build entry point was added in [r167 (Aug 2024)](https://github.com/mrdoob/three.js/releases/tag/r167), and as of [r171 (Sept 2025)](https://www.utsubo.com/blog/threejs-2026-what-changed) it became a zero-config import (`import * as THREE from 'three/webgpu'`). At runtime it probes `navigator.gpu`: if [WebGPU](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) is present it uses a WebGPU backend (WGSL, explicit GPU buffers, compute pipelines); if not, it **transparently falls back to WebGL2** with no app-code change (a `forceWebGL` flag lets you test the fallback). Custom shading is written in [TSL (Three.js Shading Language)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) — a JavaScript node graph that compiles to **both WGSL and GLSL ES 3.00 from one source**, so shader work is never locked to a single API. Materials become node materials (`MeshStandardNodeMaterial` with `colorNode`/`positionNode` hooks), and WebGPU additionally unlocks [compute shaders](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/) (`compute()`, atomics, workgroup barriers) for GPU particles and instancing.

**Maturity (mid-2026).** WebGPU now reaches ~82% of browsers ([caniuse](https://caniuse.com/webgpu) reports 82.3%): it ships by default in Chrome/Edge desktop (113+), Chrome on Android (~123+ on supported Qualcomm/ARM/Intel GPUs), [Safari across macOS Tahoe 26 / iOS 26 / iPadOS 26 / visionOS 26](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) (Safari 26), and Firefox on Windows (141+) and Apple-Silicon macOS (145+). Holdouts: **Firefox on Linux and Android** (still disabled by default, planned through 2026) and Chromium-on-Linux (flags + recent drivers). Three.js is on the **r184 (Apr 16, 2026)** stable line with ~monthly releases; r184 added a [3× faster TSL compiler, dynamic lights, compute bounds-checking, and an FSR1 port](https://github.com/mrdoob/three.js/releases/tag/r184). Three.js is very actively maintained, but the WebGPURenderer/TSL APIs are **not yet frozen**.

**Fit for this goal.** Excellent. The WebGPU upgrade is essentially a one-line renderer swap, so you keep the entire mature Three.js ecosystem (glTF/Draco loaders, controls, physics, R3F, post-processing) and write the engine **once** while serving both modern and legacy visitors automatically — precisely the "build core, never touch the engine" requirement. Content stays outside the engine: author in Blender, export glTF, load into the scene graph, attach interaction zones — adding a new project/room is a *data* change. The stated inspiration proves it: [Bruno Simon's portfolio](https://bruno-simon.com/) runs on Three.js + TSL and uses WebGPU automatically when available, and his [folio-2025 source is MIT-licensed](https://github.com/brunosimon/folio-2025/blob/main/license.md) (Blender files included). Other live examples: the Vue+TSL [Dev From 2047](https://www.webgpu.com/showcase/dev-from-2047-webgpu-portfolio/) portfolio and [craftlinks/three-tsl-webgpu](https://github.com/craftlinks/three-tsl-webgpu) (MIT).

**Caveats / blockers.** WebGPU-only features (compute particles, large-scale instancing) have **no WebGL2 fallback**, so design them as progressive enhancement, not core gameplay. TSL is less legible than raw GLSL and has [real gotchas](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/) (explicit samplers, workgroup sizing, undocumented corners), and you cannot hand-write raw WGSL through this path. The performance wins ([2–10× on draw-call-heavy scenes](https://www.utsubo.com/blog/threejs-2026-what-changed)) mostly matter at scale — a small portfolio world may see little FPS difference, so the real payoff is future-proofing. Pin a Three.js version to insulate your "core" from API churn. Note this path is **unrelated to the ASCILINE** streamed-frame concept, which is a separate server-side pipeline.

**Verdict.** Adopt WebGPURenderer now as progressive enhancement on a Three.js core (WebGPU when present, WebGL2 fallback), treat compute-shader flourishes as optional, and version-pin. **Score: 8/10.**

*Confidence: high — version/browser/example claims independently verified; only the exact Chrome-for-Android default-on version and the unverifiable internal "ASCILINE" cross-reference remain soft.*

### PlayCanvas (engine + editor)

**What it is.** PlayCanvas is a production WebGL2/WebGPU game engine plus a Unity-style, browser-based visual editor. The runtime is [open source under MIT](https://github.com/playcanvas/engine) (engine **v2.19.7**, published 2026-06-12 to [npm](https://www.npmjs.com/package/playcanvas), ~16.1k stars, last pushed 2026-06-19 — very actively maintained, 446 releases). You build a scene from an [entity-component system](https://developer.playcanvas.com/user-manual/editor/): entities hold components (render, camera, collision, sound, script), and you write game logic as JS/TS script components. The [Editor](https://playcanvas.com/products/editor) adds [Google-Docs-style real-time collaboration](https://developer.playcanvas.com/user-manual/editor/realtime-collaboration/), 3D-aware version control (branches, checkpoints, merging), and a managed asset pipeline that ingests FBX/OBJ/glTF/GLB, HDR textures and audio and auto-applies glTF/Draco/Basis compression.

**Maturity & rendering.** The engine ships a [dual WebGL2 + WebGPU backend](https://developer.playcanvas.com/user-manual/graphics/): it attempts WebGPU (including a compute-based renderer used for 3D Gaussian splats in 2.19+) and [falls back to WebGL2](https://blog.playcanvas.com/build-webgpu-apps-today-with-playcanvas/), which remains the mature default. **WebGPU is officially labeled "Beta"** with feature gaps, so treat compute-dependent effects as needing validation and a WebGL2 fallback. As of **2025-07-30** the [Editor *frontend* was open-sourced under MIT](https://blog.playcanvas.com/playcanvas-editor-frontend-is-now-open-source/) ([repo](https://github.com/playcanvas/editor)), but it still "connects to our backend" — **the cloud backend (storage, real-time sync, asset processing, hosting) stays proprietary**, so you cannot fully self-host the editor.

**Fit for an explorable portfolio.** Excellent for the "navigate a 3D world to discover projects" core, and unusually good for the "build the engine once, keep adding content" requirement: new rooms, props and interactive triggers are just new entities + assets in the editor — no engine changes. Embedding into a React/custom site is well-trodden via [iframe + postMessage](https://developer.playcanvas.com/user-manual/editor/publishing/web/communicating-webpage/), and there's an official declarative [`@playcanvas/react`](https://github.com/playcanvas/react) renderer (still pre-1.0, v0.11.4) plus the [PCUI](https://github.com/playcanvas/pcui) component library for HUD/overlays. You can [self-host the published build](https://developer.playcanvas.com/user-manual/publishing/web/self-hosting/) (zip export) on any static host, independent of PlayCanvas servers.

**Caveats specific to this goal.** Two mismatches matter. First, the **ASCILINE inspiration is a poor fit**: PlayCanvas is a client-side GPU renderer, not a server frame-streaming pipeline — a Python-backend-pushes-ASCII-frames-over-WebSocket design uses almost none of its value, so keep that as a separate non-PlayCanvas subsystem. Second, the **authoring workflow depends on the proprietary cloud backend**; staying fully self-owned means either accepting a PlayCanvas subscription for the editor or going engine-only/code-first (forfeiting the editor advantage). It's also more opinionated than raw Three.js, so a heavily art-directed, Bruno-Simon-style bespoke look fights the grain a bit more.

**Proof it ships.** PlayCanvas powers [Snap Games](https://eng.snap.com/playcanvas-backend-infrastructure) — Tiny Royale, Bitmoji Paint, Sugar Slam — which Snap reported had been played by [100M+ Snapchatters](https://newsroom.snap.com/bitmoji-paint) (a figure dating to ~2020, so treat it as historical scale rather than current). It is also listed by PlayCanvas as used by Disney, BMW, King, Miniclip and Zynga, with showcase demos like [After the Flood](https://playcanv.as/e/p/44MRmJRU/). Per [a 2026 web-game-engine comparison](https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison.html), PlayCanvas is "the closest thing the web has to a Unity-style workflow."

**Verdict:** a strong, low-risk engine for the explorable-world core and content pipeline; weakest on the ASCII-streaming idea and on full vendor independence for authoring.

*Confidence: high — version, license, star count, release count, dates, editor open-sourcing, WebGPU Beta status, demo, and customer/Snap claims all verified against npm, GitHub API, and primary sources; only soft spot is the dated 100M+ player figure.*

### Lightweight / low-level WebGL (OGL, regl, twgl, raw WebGL2)

This family trades an engine's built-ins for a tiny bundle and total shader-level control. You write GLSL directly and own the architecture; the library only removes the worst WebGL boilerplate (buffer/attribute/uniform/FBO wiring).

**Framing note on ASCILINE.** The lean look that motivates this section is often associated with [ASCILINE](https://github.com/YusufB5/ASCILINE) — but ASCILINE itself is *not* a WebGL/shader project. It is a Python/FastAPI backend that decodes video to ASCII and streams binary-encoded frames over WebSockets to a **vanilla-JS HTML5 Canvas** front end (no GPU, no shaders; effects are applied via CSS filters). So ASCILINE is useful as evidence for the *transport pattern* (stream frames → repaint), not as a lightweight-WebGL exemplar.

**How it works.** The streaming pattern — push frames over WebSocket, repaint a canvas — is a data-transport problem, independent of engine choice. With any of these libs you push each frame's cells into a texture (or an instanced glyph-atlas quad grid) and re-upload per frame; ASCII/dither/CRT looks then run as fragment shaders because each cell is independent. The [textmode.js](https://github.com/humanbydefinition/textmode.js) library ([CreativeApplications writeup](https://www.creativeapplications.net/news/textmode-js-library-for-dynamic-ascii-art-text-graphics-with-real-time-rendering/)) proves this approach in practice: a grid-based WebGL2 pipeline with multiple render targets and aggressive instancing for high-performance textmode graphics. Codrops' [Efecto teardown](https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/) independently confirms that ASCII "runs entirely on the GPU as a WebGL shader" because each cell is independent (note: Efecto itself is built on Three.js + the postprocessing library, so it is cited as proof-of-concept, not as a lightweight-lib example).

**The four options, as of June 2026:**

- **[OGL](https://github.com/oframe/ogl)** — v1.0.11 (npm 2025-01-27; last repo commit 2025-04-13), ~4.5k stars, zero deps, ~29KB minzipped (Core 8KB / Math 6KB / Extras 15KB), Unlicense (public domain). "Aimed at developers who like minimal layers of abstraction… interested in creating their own shaders." Crucially, its [Extras and examples](https://oframe.github.io/ogl/examples/) cover far more than its "minimal" label suggests: **OrbitControls, glTF loader, MSDF text, shadow maps, instancing, GPGPU particles, raycasting, skinning, FXAA/bloom post-processing, and frustum culling** — a genuine scene graph with camera/transform hierarchy. (No tagged GitHub Releases; treat the npm version as authoritative.)
- **[regl](https://github.com/regl-project/regl)** — v2.1.1 (npm 2024-11-12), ~5.5k stars, MIT, ~21KB gzipped. A functional, stateless WebGL wrapper that explicitly "is not a game engine and doesn't have opinions about scene graphs or vector math libraries" — **no scene graph, no math, no loaders** by design; it commits to semver for "long lived applications that must be supported for months or years." Its 2026 commits are docs/typo-only (e.g. a README typo fix on 2026-06-19) — feature-frozen, not abandoned.
- **[twgl.js](https://github.com/greggman/twgl.js)** — v7.0.0 (npm 2025-07-16; last commit 2025-10-13), ~3k stars, zero deps, MIT. The most recently released; thin helpers over raw WebGL/WebGL2, no scene graph/loaders. Its author keeps WebGPU on a *separate* track ([webgpu-utils](https://github.com/greggman/webgpu-utils)), underscoring that twgl is WebGL-only.
- **Raw WebGL2** — stable Khronos standard, ~95%+ global browser support (caniuse cross-browser score ≈92/100; every current major browser ships it), maximum control, maximum effort.

**Maturity / WebGPU.** All three named libs are maintained and zero-dependency, but **none target WebGPU** — they are WebGL2/WebGL1 only. WebGPU has reached production use in [Three.js](https://www.utsubo.com/blog/webgpu-threejs-migration-guide) (its WebGPURenderer line), so a later WebGPU pivot here means a renderer rewrite, not a flag.

**Fit for this goal.** *Split.* For the streaming/effects **core**, this is an outstanding, on-aesthetic fit and the lean bundle is itself the look. For the **explorable-world** half (movement, collision, discoverable objects à la Bruno Simon's drive-around portfolio), fit is weaker: you get **no physics, no character controller, no pointer-lock navigation**, and — with regl/twgl/raw — no asset loaders or scene graph. The "build core once, add content without touching the engine" requirement demands a content/asset pipeline (scene format, glTF loading, manifest) you must **design yourself**. OGL closes most of this gap (controls + glTF + raycasting + post-fx), making it the pragmatic lightweight pick; reserve regl/twgl/raw WebGL2 for the rendering core or an effects-heavy, navigation-light experience.

*Confidence: high — versions, dates, licenses, zero-dep status, stars, commit recency, the OGL Extras list, and all named repos/articles were verified against npm, the GitHub API, and live pages; the only substantive fix was the mischaracterization of ASCILINE as a WebGL/shader project.*

### Spline & no-code/low-code 3D tools

[Spline](https://spline.design/) is a browser-based, no-code 3D editor that lets you build stylized interactive scenes visually and ship them to the web. As of mid-2026 it is mature and actively developed: the [April 2025 "Hana" launch](https://blog.spline.design/introducing-hana) added a real-time interactivity canvas with an events-and-states system (Hana is primarily a 2D/vector interactivity surface, not the 3D engine itself), and in [March 2026 Spline launched **Omma**](https://updates.spline.design/changelog/meet-omma-create-3d-websites-and-apps-with-ai-agents.) — a separate, AI-agent-driven product (hosted at omma.build) that orchestrates code/image/3D-generation agents in parallel and runs on a 2026 WebGPU-based engine advertising real-time physics and reflections. Note Omma is a distinct brand/product with its own pricing (from ~$29/mo), not merely a versioned update to the core editor.

**How it works.** You author a scene in the hosted editor, then either embed it via iframe, drop in `<Spline scene={url} />` from [react-spline](https://github.com/splinetool/react-spline) (npm v4.1.0, last published ~late 2025), or self-host the exported `.splinecode` binary. At runtime, [`@splinetool/runtime`](https://www.npmjs.com/package/@splinetool/runtime) (which ships its own Three.js-derived rendering code) loads that scene and reproduces interactivity. Crucially, per Spline's own [code-export docs](https://docs.spline.design/doc/exporting-as-code/docDdDWmkQri), **"animations and events are only enabled when exporting to Vanilla JS and React"** — exporting to Three.js / react-three-fiber / Next.js code yields *static geometry only*. (Three.js import is handled by [`@splinetool/loader`](https://www.npmjs.com/package/@splinetool/loader); the R3F path uses the community-grade [`r3f-spline`](https://github.com/splinetool/r3f-spline) hook, ~170 stars.)

**Why it's tempting for this goal.** Among no-code tools, Spline ships native *game-like* primitives — built-in keyboard/joystick/button input, physics, collision shapes on a character, and follow cameras — i.e., walk/drive-around mechanics similar to what Bruno Simon hand-codes, with no controller code. Its asset pipeline is genuinely good: glTF/GLB/FBX/OBJ/USDZ import-export, CSV/JSON data binding, and drafts/versioning behind a single Production URL — so the owner can keep adding projects and republish one `.splinecode` without redeploying app code. Production use is real (Nike-branded Webflow landing pages, Apple Watch concept pages, and many Webflow sites — see [15 Best Spline Websites](https://www.jackredley.design/articles/15-best-spline-websites)).

**The blockers, specific to "build core once, extend forever."** This requirement cuts against Spline's grain. Keep the native interactivity and your *engine is Spline's closed runtime* — you can't own, extend, or performance-tune it, and you inherit its bugs. Those bugs are documented: a long-running [react-spline issue](https://github.com/splinetool/react-spline/discussions/126) reports sustained ~99% CPU even on Spline's own demo scene on high-end GPUs (a GTX 1080), with several users abandoning the library for R3F + exported glTF; tutorials also document [multi-MB, main-thread-blocking scenes hurting Core Web Vitals](https://webdesign.tutsplus.com/how-to-optimize-spline-3d-scenes-for-speed-and-core-web-vitals--cms-108749a). Take the *ownable* path (code-export to Three.js/R3F) and you lose interactivity down to static meshes — at which point Spline is a model/look-dev authoring tool, not the engine, and the "no graphics code" promise evaporates. And an ASCIILINE-style WebSocket-streamed-frames (server-rendered) concept has no surface in Spline, which renders client-side only.

**Verdict.** Excellent for *authoring* the world and assets and for rapid prototyping; poor as the durable, owned core engine. The pragmatic sweet spot is a hybrid: hand-write a thin R3F/Three.js shell you control (camera, controls, content loader, routing) and use Spline purely as a glTF/look-dev source — or build the whole world in Spline first to validate the concept, then graduate to owned code. As the literal core for a long-lived, performance-sensitive, extensible portfolio, Spline does not fit. (A precise runtime KB figure could not be confirmed from primary sources; weight is characterized qualitatively.)

*Confidence: medium — primary-source export-docs, the CPU issue, package versions, and the Hana/Omma launches are confirmed, but "Omma" branding/scope, the exact "Nike Air Montreal" example, and the runtime's precise Three.js-fork relationship remain partly unverified.*

### Native game-engine web exports (Unity, Godot, Bevy/WASM)

**How it works.** Each engine compiles your project to WebAssembly plus a JavaScript loader and packed asset data, then renders into a single `<canvas>`. [Godot 4.7](https://80.lv/articles/godot-4-7-has-been-released) (stable, released 18–19 Jun 2026) exports WASM + [WebGL2 via the Compatibility renderer only](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) — Forward+/Mobile and WebGPU are not supported on the web platform. [Unity 6.1 / 6000.1](https://discussions.unity.com/t/public-access-to-webgpu-experimental-in-unity-6-1/1572462) ships WebGL2 as the default with **experimental** WebGPU opt-in (not recommended for production). [Bevy](https://bevy.org/news/bevy-webgpu/) (0.18, released [13 Jan 2026](https://bevy.org/news/bevy-0-18/); [0.17 shipped 30 Sep 2025](https://gamefromscratch.com/bevy-0-17-released/)) runs on [wgpu](https://github.com/bevyengine/bevy/issues/8315), which targets WebGL2 and WebGPU — but you must pick one **at build time**, and WebGL2 is still the default.

**Maturity (mid-2026).** All three are healthy and actively developed, but web is a second-class target. WebGPU finally reached broad cross-browser support by early 2026 — Chrome/Edge (since v113, 2023), [Safari (since Safari 26 / iOS 26, Sept 2025)](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes), and [Firefox (141 on Windows Jul 2025; 145–147 for Apple-Silicon macOS in late 2025/early 2026, Linux still not stable)](https://linuxiac.com/webgpu-lands-in-firefox-141-on-windows-eyes-linux-and-macos-next/) — yet the engines lag: Unity WebGPU is experimental, Godot has [no WebGPU in stable](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) (only [unofficial community forks](https://github.com/godotengine/godot-proposals/issues/6646)), and [Bevy cannot runtime-detect WebGL2 vs WebGPU in one WASM file](https://github.com/bevyengine/bevy/issues/13168). Godot is the most mobile-friendly: [single-threaded export (default since 4.3)](https://godotengine.org/article/progress-report-web-export-in-4-3/) removed the SharedArrayBuffer/COOP-COEP requirement and fixed most iOS/macOS issues — though [Godot's own docs still warn Safari has WebGL2 bugs](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) and recommend Chromium/Firefox.

**Pros for this goal.** Visual editors (Unity, Godot) make building an explorable 3D world far less hand-coding than raw Three.js. Godot is free, open-source (MIT), lightweight, and Safari-tolerant. Unity uniquely offers a real no-rebuild content pipeline via [Addressables + remote catalogs](https://docs.unity3d.com/Packages/com.unity.addressables@2.1/manual/remote-content-assetbundle-cache.html), letting the owner add assets without redeploying the player. Bevy/wgpu is the most future-proof rendering core (one codebase to Vulkan/Metal/DX12 + WebGL2 + WebGPU) and is genuinely WebGPU-capable today.

**Cons / blockers specific to a content portfolio.**
- **Payload.** Empty Unity 6 WebGL builds are [~10–11 MB raw / multi-MB Brotli-compressed (code alone ~6.9 MB raw)](https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365); [Bevy WASM is ~30 MB, ~15 MB after `wasm-opt`](https://bevy-cheatbook.github.io/platforms/wasm/size-opt.html) — many times a [Three.js core (~600 KB)](https://www.utsubo.com/blog/webgl-three-js-site-seo-rankable-guide). This is paid before any of the owner's content loads.
- **SEO + accessibility.** The canvas is a black box: [no DOM text, headings, or anchors for Googlebot](https://www.utsubo.com/blog/webgl-three-js-site-seo-rankable-guide), and [meshes aren't keyboard-focusable for screen readers](https://medium.com/@piplev/three-js-accessibility-c4f45d83f2c6). For a site whose purpose is surfacing a person's information, this is a structural mismatch unless you hand-build a parallel HTML layer.
- **iOS reliability.** Unity reports [WebGL memory ceilings and iOS crashes](https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771); recruiters open portfolio links on phones.
- **Extensibility.** Only Unity avoids full re-exports when adding content; Godot and especially Bevy generally require rebuilding the whole artifact — working against "build the engine once, keep adding content." The [ASCILINE](https://github.com/YusufB5/ASCILINE) WebSocket-repaint pattern (binary frames streamed to an HTML5 canvas) is also far more natural in a web-native stack than inside these engines.

**Recommendation: 4/10.** Excellent world-builders, poor content-portfolio shells. Godot is the only one worth prototyping if an editor-first workflow is desired; otherwise a web-native engine serves this goal better.

*Confidence: high — version numbers, release dates, renderer/WebGPU status, and browser-support facts re-verified against primary sources (Godot docs, Apple/WebKit release notes, Bevy release notes, Unity docs); only minor payload figures and one community fork are softer.*

### ASCII / text-frame rendering (the ASCILINE technique)

**What it is.** [ASCILINE](https://github.com/YusufB5/ASCILINE) is a real-time *video-to-ASCII* engine: a Python/[FastAPI](https://fastapi.tiangolo.com/) backend decodes an `.mp4` with [OpenCV](https://opencv.org/), maps pixels to glyphs (or colored blocks) with NumPy, and streams binary-packed frames over WebSockets to a vanilla-JS [HTML5 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) client that repaints a character grid in `requestAnimationFrame`. Its cleverness is bandwidth: an optional per-frame adaptive codec tags each frame (1-byte header) RAW/ZLIB/DELTA so static scenes compress hard (the README claims ~0.3% of the legacy framebuffer, i.e. ~375×, for a static slideshow, and only ~63% savings on high-motion frames — *self-reported and unverified*) at a target ~30 FPS. As of June 2026 the repo is active but young — created ~May 2026, ~2.1k stars, 249 forks — so treat it as a reference demo, not a dependency. Note its license: GitHub shows `NOASSERTION`, but the actual `LICENSE` is **MIT with a custom anti-advertisement restriction clause** (you may not use the software to serve/deliver/display digital advertisements; violation terminates the license). It is reusable under MIT terms *except* for that ad-serving carve-out — a real, if narrow, restriction to clear before copying code.

**The core mismatch.** ASCILINE plays a *pre-rendered video* as text. There is no camera you can move, no world state, no clickable objects — so it is not, by itself, an *explorable world*. Building a navigable portfolio on it would mean pre-baking every camera path to video and re-encoding server-side for every content change, which defeats both interactivity and the "add assets without touching the engine" goal, and it requires an always-on Python backend (a hosting liability a static site avoids).

**The right way to use the aesthetic.** Decouple *look* from *world*. Build the explorable world with a real interactive engine, then apply ASCII as a configurable **GPU shader post-process** over the rendered frame — luminance (`0.299r+0.587g+0.114b`) downsampled to an N×M cell grid, each cell indexing a glyph by brightness. Current, working references: Codrops' [Creating an ASCII Shader Using OGL](https://tympanus.net/codrops/2024/11/13/creating-an-ascii-shader-using-ogl/) (Andrico Karoulla, Nov 13 2024) and [Efecto](https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/) (Jan 4 2026, Three.js + [postprocessing](https://github.com/pmndrs/postprocessing) + R3F, procedural glyphs generated in GLSL rather than from bitmap fonts). This pattern is engine-agnostic and WebGPU-ready — [three.js](https://threejs.org/) r184 (Apr 16 2026) ships zero-config [WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html) (zero-config import from `three/webgpu` since r171, Sept 2025, with automatic WebGL2 fallback) and TSL compiles to WGSL/GLSL — so the filter never changes as you add glTF rooms, sprites, or JSON-described project zones.

**Avoid the DOM path for a full world.** Three.js' built-in [`AsciiEffect`](https://threejs.org/docs/pages/AsciiEffect.html) renders to an HTML `<table>` — fine for a small hero effect, but per-frame DOM updates won't scale to a fullscreen game-resolution grid. Use a shader pass instead.

**Proof an ASCII world is possible.** [ASCIICKER](https://asciicker.com/) ([msokalski/asciicker](https://github.com/msokalski/asciicker)) is a genuine explorable 3D ASCII game running in-browser via Emscripten/WebAssembly — but it's a hand-built C/C++ engine (~67% C++, ~29% C; `asciiid` is an editor tool *inside* that repo, not the repo name), underscoring that the *world logic is the hard part* and is wholly separate from the ASCII styling.

**Verdict.** A superb, on-brand visual filter and a great cinematic-intro or ambient-panel technique; a poor choice as the core architecture. Build the interactive engine first, bolt ASCII on as a shader. ASCILINE's compression/color-tier numbers are README self-claims that could not be independently benchmarked — treat as vendor claims.

*Confidence: high — repo existence, stats, MIT-with-ad-restriction license, both Codrops articles, three.js r171/r184 WebGPU history, and ASCIICKER were all confirmed against primary sources; only the 375× compression figure remains an unverifiable vendor claim.*

### Part B — World Design, Navigation & Content Architecture

### Exploration UX & navigation design patterns

Navigation is the layer that decides whether the site reads as a *game world* or a gimmicky scroller — and, critically for this project, it sits **above** the renderer, so it is unaffected by a WebGL→WebGPU swap or by how frames are produced (textured GLTF vs. an ASCII-line-style streamed canvas). It is the highest-leverage UX decision and the most extensibility-friendly: pick the model once, then keep adding content.

**World structure.** Three archetypes exist. *Hub-and-spoke* ("a zone/room per project") is the de-facto convention for game-like portfolios: Bruno Simon's classic drive-around site uses Intro → Crossroads → Playground → Projects → Contact ([case study](https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b)), and the June 2026 Codrops corridor portfolio uses themed rooms behind doors ([Sketching the Impossible](https://tympanus.net/codrops/2026/06/11/sketching-the-impossible-a-3d-portfolio-built-without-a-single-3d-model/)). It maps 1:1 to a portfolio and is trivially extensible — *a new project is a new spoke*, no engine change. A *single open world* is far harder to author, wayfind, and keep from feeling empty. A *curated linear/scroll-cinematic path* is the most reliable but trades away the "my own path" feeling that is the entire premise.

**Locomotion.** Commit to ONE primary model:
- *First-person pointer-lock* ([drei PointerLockControls](https://github.com/pmndrs/drei)) is riskiest — hidden cursor confuses non-gamers, weak on mobile, smooth motion is a leading motion-sickness cause.
- *Third-person follow/orbit* (visible avatar + damped chase cam) reads as a game and is forgiving; Bruno's "car" is this pattern with physics.
- *Point-and-click teleport* ([Click&Go](https://www.3dvista.com/en/blog/clickandgo/), [Point & Teleport, Bozgeyikli et al., CHI PLAY 2016](https://dl.acm.org/doi/10.1145/2967934.2968105)) largely eliminates disorientation (no vestibular mismatch) and is the most mobile/accessibility-friendly.
- *Scroll-driven camera-on-rails* via [GSAP ScrollTrigger/ScrollSmoother + R3F](https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/) (GSAP 3.15, fully free for commercial use since April 2025) is the safe fallback if free exploration tests poorly.

**Surfacing info.** Use drei [`<Html>`](https://github.com/pmndrs/drei) for billboarded hotspots/labels, distance checks in the frame loop for *proximity triggers* (areas expand/light up as you approach — Bruno's "tiles like a path"), and raycasting for clickable interactables.

**Onboarding is a hard blocker.** Visitors who don't realize they can move bounce in seconds. Proven diegetic fixes: instructions painted on the ground (Bruno writes the arrow-key prompt directly on the floor), a visible interactable on load, and auto-nudging the camera toward the next door ([Codrops corridor](https://tympanus.net/codrops/2026/06/11/sketching-the-impossible-a-3d-portfolio-built-without-a-single-3d-model/)).

**Mobile & comfort.** Touch is tractable: [nipplejs](https://github.com/yoannmoinet/nipplejs) virtual joystick (actively maintained, v1.0.4 as of June 2026) + on-screen buttons for movement, device-gyroscope parallax for look. For comfort, the VR/WebXR literature applies even to non-VR 3D ([Meta locomotion guidance](https://developers.meta.com/horizon/design/locomotion-user-preferences/)): prefer teleport over forced smooth rotation, add camera easing/damping, optional speed-based vignette, and a stable rest-frame (HUD/horizon). Ship a reduced-motion/keyboard fallback.

**Recommendation:** hub-and-spoke world + point-and-click teleport (or a third-person drive/walk), diegetic onboarding, proximity + `<Html>` hotspots, nipplejs on mobile, scroll-cinematic as the fallback.

**Tooling currency (June 2026):** @react-three/drei 10.7.7, three.js r184, React Three Fiber 9.6.x (React 19; R3F v10 in alpha), GSAP 3.15. All renderer-agnostic — a future WebGL→WebGPU swap does not touch the navigation layer.

*Confidence: high — all named examples, repos, and the CHI PLAY 2016 paper verified to exist and be accurately described; the only issues were stale version numbers (three.js r182→r184, GSAP 3.14→3.15), now corrected.*

### Content architecture & extensibility (CORE requirement)

The owner's hard requirement — *build the engine once, then add projects/assets forever without touching it* — is, precisely, the problem of **decoupling content from rendering**. The recommended architecture treats the explorable world as **data interpreted by a small generic engine**, with three layers that each grow independently.

**1. A versioned scene manifest (the source of truth).** Describe the world as JSON (or MDX with frontmatter) — never in engine code. A pragmatic schema:

```jsonc
// /content/world.json
{
  "rooms": [{
    "id": "atrium",
    "model": "atrium.glb",          // → asset registry key
    "spawn": [0, 0, 5],
    "interactables": [
      { "id": "proj-asciline", "type": "hotspot",
        "at": [3, 1, -2], "media": "video/asciline.mp4",
        "link": "https://github.com/YusufB5/ASCILINE",
        "title": "ASCILINE", "body": "asciline.mdx" },
      { "id": "to-lab", "type": "portal", "at": [-4,0,0], "target": "lab" }
    ]
  }]
}
```

Validate every manifest against a **Zod**/JSON Schema in CI so a typo'd `model` or dangling `target` fails the build, not the visitor.

**2. Authoring 3D metadata where it belongs — in the asset.** Spawn points, hotspot anchors, collision tags, and link targets can be authored directly in Blender as **Custom Properties**, which the glTF exporter writes to the standardized `extras` field and three.js exposes as `object.userData` at load via `GLTFLoader` ([Blender glTF 2.0 docs](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html), [Khronos extensions README](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md)). This `extras` → `userData` mapping is a stable, documented round-trip. Adopt a namespaced convention (`kg_type`, `kg_target`) since `extras` has no schema. This keeps spatial data with the model instead of in hand-maintained coordinate tables.

**3. An asset + interactable registry.** Run each model through **[gltfjsx](https://github.com/pmndrs/gltfjsx)** (`--transform` for Draco/WebP/resize, `--types` for typed props) to produce reusable [React Three Fiber](https://github.com/pmndrs/react-three-fiber) components, registered by key. Map manifest `type` values (`hotspot`, `portal`, `npc`) to behaviors via an **ECS/registry** so new interactable *types* are also additive. Use **[koota](https://github.com/pmndrs/koota)** (pmndrs, v0.6.6, ISC license, traits/entities/world + React hooks) — the actively-maintained successor to **[miniplex](https://github.com/hmans/miniplex)**, whose last release (2.0.0, July 2023) makes it a maintenance risk. Note koota is still small (~700 stars); plan to own or fork if it stalls. Physics/collision for the explorable space comes from **[@react-three/rapier](https://github.com/pmndrs/react-three-rapier)** v2 (current 2.2.0; R3F ^9 / React 19).

**Recommended folder layout:**

```
/content/        world.json, *.mdx        ← edit to add projects (no code)
/assets/         *.glb (raw), /optimized  ← drop new models here
/src/registry/   models.ts, interactables.ts
/src/engine/     Manifest loader, EntitySpawner, systems  ← frozen
/scripts/        transform-assets, validate-manifest
```

**Headless CMS — optional, not default.** For a non-technical editor or a dashboard, a CMS can *generate* `world.json` at build time: [Sanity](https://www.sanity.io/) (content-as-structured-data, best for nested/polymorphic scene types), [Storyblok](https://www.storyblok.com/) (visual block editing), or [Strapi v5](https://strapi.io/) (self-hosted, open-core MIT community tier, flattened JSON). For a single developer-owner, **local MDX/JSON in git is simpler, free, diffable, and avoids vendor lock-in** — start there and graduate to a CMS only if a non-coder needs to edit.

**Net:** the engine reads data and the registry; adding a project means adding a manifest entry and dropping a `.glb` — never editing the engine. The chief risks are *schema design* (enforce with Zod) and *referential integrity across manifest ↔ registry ↔ assets* (enforce in CI).

*Confidence: high — every version, license, repo, and the glTF extras→userData round-trip was verified against npm/GitHub on 2026-06-20; the only material edits were correcting koota's version/date and tightening unstable marketing-page links.*

### Part C — Assets, Performance & Streaming

### Asset creation & optimization pipeline

For a game-like explorable portfolio, the asset pipeline matters as much as the renderer: the engine should only ever consume one optimized format (GLB), so new content can be added forever without touching engine code. The 2026-standard answer is **author in three interchangeable ways → normalize and optimize with [glTF Transform](https://gltf-transform.dev/) → load with Three.js's standard loaders**.

**Optimization core.** [glTF Transform](https://github.com/donmccurdy/glTF-Transform) (MIT, maintained by Three.js contributor Don McCurdy; `@gltf-transform/core` at v4.3.0 and `@gltf-transform/functions` at v4.4.0 as of mid-2026, ~1.2k+ GitHub stars) is a scriptable CLI/SDK that runs the full chain deterministically: `weld`, `dedup`, `prune`, `instance`, geometry compression via **Draco** or **[meshoptimizer](https://meshoptimizer.org/)** (zeux/meshoptimizer), and texture compression to **KTX2/Basis Universal** (UASTC + ETC1S) or WebP. Its [`simplify`](https://gltf-transform.dev/modules/functions/functions/simplify) function (meshopt-backed, `ratio` + `error` params; weld first) gives automatic LOD without manual remeshing. KTX2 is the high-value step for an explorable world: textures stay GPU-compressed in VRAM rather than being decoded to raw RGBA, and Draco/meshopt routinely cut geometry several-fold. Three.js consumes all of this natively through `GLTFLoader` plus `DRACOLoader`, `MeshoptDecoder`, and `KTX2Loader` (wired via `setDRACOLoader`/`setMeshoptDecoder`/`setKTX2Loader`), under both the WebGL and WebGPU renderers — so the loader config is a one-time engine task ([three.js GLTFLoader docs](https://threejs.org/docs/#api/en/loaders/GLTFLoader)). The single setup gotcha: the Basis transcoder WASM and Draco/meshopt decoders must be bundled and their paths set, or assets silently fail to load.

**Authoring on-ramps (all output GLB).**
1. **Free CC0 kits** — [Kenney](https://kenney.nl) (60,000+ assets in the All-in-1 bundle), [Quaternius](https://quaternius.com/), aggregated on [Poly Pizza](https://poly.pizza/) (10,500+ models, GLB/FBX, [v1.1 API](https://poly.pizza/docs/api/v1.1)). CC0 means no attribution and unconditional commercial use — the realistic day-one path for a non-expert to populate a world. (Note: Poly Pizza mixes CC0 and CC-BY models; filter by license if attribution-free is required.)
2. **Blender → glTF** — the export format Khronos and Three.js treat as canonical; the advanced track for bespoke, on-brand assets.
3. **AI text/image-to-3D (2026)** — [Meshy 6](https://www.meshy.ai/), [Tripo](https://www.tripo3d.ai/), [Rodin Gen-2.5](https://hyper3d.ai/) (Deemos/Hyper3D; successor to the 10B-param Gen-2), and open-source [Tencent Hunyuan3D-2.1](https://huggingface.co/tencent/Hunyuan3D-2.1). All export GLB. **Caveat:** AI meshes are not engine-ready — messy topology, baked lighting, oversized textures — so they always need a Blender + glTF-Transform cleanup pass.

**Licensing — verify before shipping a public commercial portfolio.** CC0 kits are unconditional. Meshy grants full ownership on paid plans; its [free tier is CC BY 4.0](https://help.meshy.ai/en/articles/9992001-can-i-use-my-generated-assets-for-commercial-projects), which **does permit commercial use but requires crediting Meshy** ("Model created with Meshy – CC BY 4.0 License"). Tripo's free plan is explicitly non-commercial (CC BY 4.0, public models; Pro/Enterprise grant private models + commercial rights). Hunyuan3D-2.1 ships under the custom **Tencent Hunyuan Community License** (with some Apache-2.0 third-party components) — not a standard permissive OSS license — and its territory **excludes the EU, UK, and South Korea**.

**Extensibility pattern.** Lock a single `gltf-transform` optimization script (`weld → simplify/LOD → draco/meshopt → ktx2 → prune`) and an asset-manifest convention (JSON listing each GLB + spawn metadata). The owner authors however they like, runs one command, and drops the result in — the engine never changes. This separation is exactly the "build core once, keep adding content" requirement, and it is well-trodden, low-risk territory in 2026.

*Confidence: high — version numbers, loader APIs, and licenses verified against npm, threejs.org, and vendor docs in June 2026; the one soft spot is exact GitHub star count and the "5-10x" geometry figure, which I generalized.*

### Performance, loading & streaming strategy

For a navigable 3D world, the single most important number is **draw calls**: aim for **under ~100 per frame** for stable 60fps (above ~500, even strong GPUs struggle), since "triangle count matters less than draw call count" ([utsubo, 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips)). Collapse repeated scenery (trees, kiosks, signage) with **`InstancedMesh`** or **`BatchedMesh`** (multiple geometries, one material, one draw call — in core since r156) — a documented real-world scene (a real-estate demo) fell from 9,000 to 300 draw calls this way. Three.js applies **frustum culling automatically** (`frustumCulled = true`), so off-screen objects cost no draw calls; **`LOD`** (or drei `<Detailed/>`) buys a further ~30–40% FPS in large scenes. Crucially, **occlusion culling is NOT automatic** — a dense world needs a manual zone/portal visibility scheme or [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) raycasts, which must be designed into the engine early.

**Compression is the loading strategy.** Run every asset through [glTF Transform](https://gltf-transform.dev/) to apply: **Draco** (`KHR_draco_mesh_compression`, ~90–95% geometry reduction, decoded off-thread in a Web Worker via `DRACOLoader`) or **Meshopt** (`EXT_meshopt_compression`, a lighter pure-WASM decoder with Web Worker support since meshoptimizer 0.18; the library is now at v1.0), plus **KTX2/Basis Universal** (`KHR_texture_basisu`) for textures that stay GPU-compressed, cutting VRAM ~4–10x ([Khronos/DeepWiki](https://deepwiki.com/KhronosGroup/glTF-Sample-Models/5.1-texture-compression-with-ktx2-and-basis-universal)). This mirrors how [Bruno Simon's portfolio](https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b) ships its entire model set **under ~2MB** (Draco quantization + gzip), with mobile auto-dropping to a lower-quality preset.

**Bundle-and-compress per zone, then lazy-load zones by player position** — this beats both monolithic bundling (slow time-to-interactive) and naive streaming. glTF 2.0 "was not designed to be streamable" and normally must download fully before rendering ([Lemoine & Wijnants, Web3D '23 / ACM](https://dl.acm.org/doi/10.1145/3611314.3615907)); splitting the world into GLB "levels" loaded on demand sidesteps that while keeping each fetch cacheable.

**On the ASCILINE WebSocket model: do not use it for the core render.** ASCILINE streams *server-rendered* frames — a Python/FastAPI backend decodes video (OpenCV), converts pixels to characters, and ships **binary-encoded** frames the browser merely repaints to canvas at ~30 FPS ([ASCILINE repo](https://github.com/YusufB5/ASCILINE)). For a free-roam 3D world the client must render from geometry so movement has zero round-trip latency; streaming pixels would feel like laggy cloud-gaming. Reserve WebSockets for *optional* live/multiplayer state (presence, positions), not assets or frames.

**Delivery:** serve compressed GLBs from a CDN — [Cloudflare R2](https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/) (zero egress) with **Brotli/gzip** and correct `Cache-Control` + `Vary: Accept-Encoding` ([Cloudflare compression docs](https://developers.cloudflare.com/speed/optimization/content/compression/)). Watch per-object cache-size limits; very large GLBs fall to Cache Reserve at extra cost, so keep zones modestly sized.

**Mobile/low-end budget:** `mediump` shaders, ≤512–1024 shadow maps, ≤3 lights, disable DOF/blur — mirroring Bruno Simon's mobile preset. **Profiling:** `renderer.info` (calls/triangles), [stats-gl](https://github.com/RenaudRohlinger/stats-gl) (WebGL **and** WebGPU — classic stats.js stopped working with WebGPU around r181), [Spector.js](https://spector.babylonjs.com/) for per-draw-call capture, three-devtools, and Chrome's Performance panel for long frames/GC. **WebGPU** (`three/webgpu`, production-ready since r171, Sept 2025, with Safari 26 completing browser coverage; current core r184) offers a documented 2–10x headroom with automatic WebGL2 fallback — adopt later without rewriting the engine. (Note: the WebGPURenderer still carries an "experimental" label upstream despite being production-usable.)

*Confidence: high — every version, repo, and performance figure was spot-checked against primary sources; only the stats-gl repo owner was wrong and is now corrected.*

### Part D — Accessibility, Deployment & Inspiration

### Accessibility, SEO & graceful fallbacks

A game-like WebGL world has one structural flaw that no amount of polish removes: **the canvas is a single opaque graphic to assistive technology and to crawlers.** A screen reader sees nothing; Googlebot and AI crawlers (ChatGPT, Perplexity, Claude) see only the raw HTML and none of the in-canvas story ([utsubo](https://www.utsubo.com/blog/webgl-three-js-site-seo-rankable-guide); [Visively](https://visively.com/kb/ai/ai-crawlers-javascript-rendering)). For a portfolio whose job is to be *found and read by recruiters*, that is an existential bug, not a detail.

**The one durable answer is HTML-first progressive enhancement.** Ship the real content as server-rendered HTML, then hydrate the 3D world on top. 14islands — a studio that builds exactly these sites — describes the pattern and is refreshingly blunt about its limits: build "a solid responsive website layout" first, add WebGL "on top in a second iteration," and "if load time and maximum device support is your highest priority, you shouldn't use WebGL at all" ([14islands](https://14islands.com/blog/progressive-enhancement-with-webgl-and-react)). Concretely: every project must exist as crawlable DOM text via SSR/SSG (Astro, Next.js, SvelteKit, Remix), each with a canonical URL, `<meta>`/OpenGraph tags, a `sitemap.xml`, and JSON-LD (`Person` + `CreativeWork`) ([utsubo](https://www.utsubo.com/blog/webgl-three-js-site-seo-rankable-guide)). Verify it with Search Console's URL Inspection "view rendered HTML." This dovetails with the *build-core-once* goal: if projects live as markdown/JSON/CMS records, the **same data** feeds both the crawlable page and the world — add content forever without touching the engine, and never re-solve SEO.

**Accessibility inside the canvas** needs a parallel, keyboard-navigable path. Options, in order of safety: (1) a visible "list/text view" of all projects and a real DOM nav; (2) a focus-proxy/DOM-overlay technique that mirrors scene objects as tabbable, ARIA-labelled elements ([Anneka Goss, *Accessible WebGL*](https://annekagoss.medium.com/accessible-webgl-43d15f9caa21)); (3) `react-three-a11y`, which wraps R3F objects with focus, keyboard and an `A11yAnnouncer` for screen readers — **but its last release was v3.0.0 in May 2022, so treat it as an unmaintained reference, not a dependency** ([pmndrs/react-three-a11y](https://github.com/pmndrs/react-three-a11y)). The promising native fix, the **HTML-in-Canvas API** (`canvas-draw-element`) that renders real keyboard/AT-navigable DOM into the canvas, has advanced to a Chrome **origin trial (Chrome 148–150)** with the flag enabled in Canary 149+ as of mid-2026; no other engine (Firefox, Safari) has committed to it, and it remains **not production-ready** ([Chrome for Developers](https://developer.chrome.com/blog/html-in-canvas-origin-trial); [html-in-canvas.dev](https://html-in-canvas.dev/docs/browser-support/)).

**`prefers-reduced-motion` is mandatory and cheap.** Vestibular disorders affect tens of millions of people; auto-camera motion, parallax and idle animation can trigger nausea ([web.dev](https://web.dev/learn/accessibility/motion); [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Detect via CSS *and* `window.matchMedia('(prefers-reduced-motion: reduce)')`; when set, disable auto-motion and route to the static view (WCAG 2.2.2/2.3.3).

**Fallbacks for weak devices and no-WebGL.** Gate the engine behind `WebGL.isWebGLAvailable()` from `three/addons/capabilities/WebGL.js` (the old `CanvasRenderer` software fallback was removed from core in r69, ~2014 — do not rely on it). On failure or low-power mobile, serve the lightweight 2D/text site rather than a dead canvas. Bruno Simon's drive-around portfolio proves this is achievable: **~2.8MB total, mobile-usable** with on-screen joystick/buttons and clickable links ([case study](https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b)) — yet even he notes non-gamer users struggled with the controls and that he had to add a mobile UI he'd originally wanted to avoid ([Awwwards](https://www.awwwards.com/sites/bruno-simon-portfolio)).

**The stakes are now legal, not just ethical.** The **European Accessibility Act became enforceable 28 June 2025** (EN 301 549 → WCAG 2.1 AA; penalties are set per member state and vary widely — fixed caps in the tens to hundreds of thousands of euros, with a few states adding turnover-based caps of up to ~5% for serious cases; the "4% of turnover" figure is GDPR-style and not an EAA rule) ([Level Access](https://www.levelaccess.com/blog/penalties-for-eaa-non-compliance/)), and US ADA Title III website-accessibility suits exceeded ~4,000 across federal and state courts in 2024 ([Seyfarth ADA Title III](https://www.adatitleiii.com/)). A blank canvas on a recruiter's mid-range phone is the single worst first impression this project can make — build the fallback first.

*Confidence: high — all version, date, legal, and example claims independently verified; only the original's EAA "4% fine" and the HTML-in-Canvas browser-status wording required correction.*

### Deployment, hosting & infrastructure

The architecture splits cleanly into two regimes, and the hosting decision follows that split rather than a single platform choice.

**The explorable world is pure static.** A Bruno-Simon-style Three.js/WebGL portfolio is HTML + JS (+ WASM) + assets with no server logic — Bruno's [folio-2025](https://github.com/brunosimon/folio-2025) (MIT-licensed) builds with Vite to a `dist/` folder and ships as a static site. So the core experience belongs on a static CDN. For an asset-heavy world that may go viral, **[Cloudflare Pages](https://developers.cloudflare.com/pages/) is the standout: no bandwidth metering on any tier** (static-asset requests are free and unlimited), versus a 100 GB/mo free cap on [Vercel and Netlify](https://www.netlify.com/pricing/) (Netlify *suspends* the site until the next billing cycle on overage; Vercel overages are billed). One caveat: Cloudflare's ToS discourages using Pages itself to serve large media/video files (512 MB per-file cache limit), which is the explicit reason to push big `.glb`/`.ktx2` payloads to R2 rather than the Pages origin (see below). [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) is the weakest fit — a hard 1 GB site cap and a 100 GB/mo soft bandwidth limit. All four offer **free custom domains with automatic managed/Let's Encrypt SSL**, [provisioned in minutes](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/), so custom-domain setup is not a blocker.

**Large assets go to object storage, not the repo.** [Cloudflare R2](https://developers.cloudflare.com/r2/pricing) (GA since 2022) charges **$0.015/GB-month with zero egress fees** (10 GB-month free, plus Class A/B operation charges), so multi-MB `.glb`/`.ktx2` payloads cost the same to store whether one visitor or a million download them — decoupling delivery cost from traffic. This is what makes "keep adding assets forever" cheap and predictable. Pair it with a **CI optimization step**: [glTF-Transform](https://gltf-transform.dev/)'s `optimize` plus KTX-Software and Draco (aligned with the [Khronos Asset Creation Guidelines 2.0](https://www.khronos.org/blog/introducing-asset-creation-guidelines-2.0-siggraph-2025), released Aug 7 2025) run in GitHub Actions so every content drop is auto-compressed (Draco geometry, KTX2/Basis textures that stay GPU-compressed) without touching engine code. New content becomes *data*, not a code change — exactly the stated extensibility goal.

**The ASCILINE feature is the one piece that forces a backend.** [ASCILINE](https://github.com/YusufB5/ASCILINE) decodes video with OpenCV/NumPy in a **persistent Python/FastAPI process** and streams binary frames over WebSockets. This cannot run on static hosts, and **[Vercel/Netlify serverless do not host long-lived WebSocket servers](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)** (functions are ephemeral even with Fluid Compute; Vercel points users to managed realtime providers like Ably/Pusher; Netlify functions time out at ~10s). The real blocker for the edge is the runtime model, not just a missing library: [Cloudflare Python Workers](https://developers.cloudflare.com/workers/languages/python/packages/) run on Pyodide/WASM and now support many C-extension packages (NumPy, Pandas, Pillow), but OpenCV is **not** in Cloudflare's supported subset (note: `opencv-python` *is* buildable in upstream Pyodide since v0.21.0, so the limitation is Cloudflare's curated package set, not Pyodide itself) — and even with OpenCV present, a Worker is not a persistent, CPU-bound, per-frame video-decode server. So the edge-compute escape hatch is closed for this use case. A real backend is required: **Fly.io** (good for sockets/FastAPI), **Render** (free tier spins down after 15 min of inactivity, [~30-60s cold start](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026), 750 instance-hours/mo), or **Railway** (usage-based, ~$5-10/mo). Cloudflare's [Durable Objects WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) keeps idle sockets open without duration billing, but it still can't run OpenCV — it would only help a JS-side reimplementation.

**Recommendation:** keep the two concerns decoupled. Host the Three.js world statically on Cloudflare Pages, serve big assets from R2, and treat ASCILINE as an *optional, isolated* micro-service on Fly.io/Render — or, to stay fully static and free, **pre-render the ASCII frames at build time** into a compact binary asset and replay them on a canvas client-side. Either way the decision is contained to one feature and never touches the core engine or asset pipeline.

*Confidence: high — host pricing/limits, R2 zero-egress, the two named repos, the Khronos date, and Vercel/Netlify WebSocket limits were all verified against primary sources; the one nuance (OpenCV is buildable in Pyodide but absent from Cloudflare's Worker package set) is corrected inline.*

### Reference implementations & inspiration to study

The single most valuable reference is **[Bruno Simon's folio-2025](https://github.com/brunosimon/folio-2025)** — the open-source code (MIT, ~1.5k stars) behind his Awwwards Site of the Month (Jan 2026) drive-around world. It is vanilla **Three.js** (the project pins ~r183; latest is [r184, April 2026](https://github.com/mrdoob/three.js/releases/tag/r184)) using **TSL** and the **WebGPURenderer**, which runs on WebGPU when available with automatic WebGL fallback (both production-ready since r171, Sept 2025), built with **Vite** and Rapier3D physics. The README documents a bespoke ~15-stage game loop (input → physics → terrain/weather → render) and a real asset pipeline: Blender → GLB with `etc1s`/KTX texture compression, WebP for UI. Crucially the repo *includes the Blender source files*, so the exact free-roam vehicle world can be dissected — note this is a finished personal artifact, not a framework, so forking means inheriting one architecture. Pair it with **[Three.js Journey](https://threejs-journey.com/)** (Bruno's course) for the underlying subsystems.

For the "discover info/projects *inside* a world" interaction, study **[Henry Heffernan's portfolio-website](https://github.com/henryjeff/portfolio-website)** ([live](https://henryheffernan.com/), MIT, ~2.2k stars, 315 forks) — TypeScript + **React + react-three-fiber** + GLSL, rendering a retro desktop-OS computer inside an interactive 3D room you operate (click objects to open projects, play games, change lighting). It is directly forkable but tightly coupled to its one scene; extending content still means editing scene code.

For a **free-exploration character/vehicle controller** (closer to "walk/drive around" than on-rails), the maintained **Poimandres** stack is the practical path: **[@react-three/fiber v9](https://github.com/pmndrs/react-three-fiber)** (React 19, ~v9.5, 2026), **[@react-three/rapier](https://github.com/pmndrs/react-three-rapier)**, and **[ecctrl](https://github.com/pmndrs/ecctrl)** (MIT) — a ready-made floating-rigidbody physics character controller with camera-follow, multiple modes (fixed-camera, point-to-move) and touch controls. Caveat: R3F's WebGPU/TSL support still trails vanilla Three.js, a real factor if you want Bruno-level WebGPU.

For the **content/asset pipeline** (the "add assets without touching the engine" requirement), the best documented blueprint is Andrew Woan's Codrops tutorial **[Building a Fully-Featured 3D World in the Browser with Blender and Three.js](https://tympanus.net/codrops/2025/04/08/3d-world-in-the-browser-with-blender-and-three-js/)** (April 2025), which builds an immersive 3D museum: Blender bake → GLB with **Draco** + **KTX** compression via `gltf-transform`, **gltfjsx** to generate JSX, **Zustand** for state, **Howler.js** for audio. (Its camera is curve-on-rails via `CatmullRomCurve3` driven by scroll, and the author explicitly flags that the experience breaks on resize — borrow the pipeline, not the navigation.) Codrops' [R3F](https://tympanus.net/codrops/tag/react-three-fiber/) and [Three.js](https://tympanus.net/codrops/tag/three-js/) tags stay current with explorable-world and game-prototype write-ups.

For the **ASCII/[ASCILINE](https://github.com/YusufB5/ASCILINE) aesthetic**, prefer a client-side GPU approach over ASCILINE's own architecture. ASCILINE (~2.1k stars, MIT with a non-standard anti-advertisement restriction) is **Python/FastAPI + OpenCV/NumPy streaming binary text frames over WebSockets to a vanilla-JS canvas** — purpose-built for *video playback*, and it adds a server, latency and bandwidth cost that fit an interactive world poorly. The portable equivalent is Codrops' **[Creating an ASCII Shader Using OGL](https://tympanus.net/codrops/2024/11/13/creating-an-ascii-shader-using-ogl/)** (Nov 2024): render the scene to a render target, then a fragment shader maps per-block luminance to glyphs. The technique is standard WebGL and ports straight to Three.js as a post-process pass — giving the ASCILINE look with zero backend. (For a 2026 update, see Codrops' [Efecto](https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/) ASCII/dithering shader write-up.)

Further award-winning (mostly closed-source) inspiration for UX patterns: the **[Gen-02 immersive world](https://www.webgpu.com/showcase/gen-02-portfolio-an-immersive-world/)** (Awwwards SOTD + Developer Award, Oct 2025; Vue + GSAP + custom WebGPU) and the Minecraft-style scroll-circuit portfolio (Awwwards Honorable Mention). **Verification note:** confirm ASCILINE's non-standard "MIT with anti-advertisement" clause and Bruno's bundled-asset terms before reusing anything beyond code.

*Confidence: high — repo existence, stars/forks, licenses, versions, awards and tutorial details were spot-checked against GitHub and primary sources; only minor version/scene-description details were corrected.*

---

## 7. References

1. [three.js Release r184 (current, April 16 2026)](https://github.com/mrdoob/three.js/releases/tag/r184) — Confirms current version r184; package.json on dev branch reads 0.184.0.
2. [three on npm (downloads, version, dependents)](https://www.npmjs.com/package/three) — ~10M weekly downloads, v0.184.0, 5,000+ dependents — ecosystem scale.
3. [WebGPURenderer — three.js docs](https://threejs.org/docs/pages/WebGPURenderer.html) — Default behavior: prefers WebGPU backend, falls back to WebGL2.
4. [Rename WebGPURenderer to Renderer (issue #31381)](https://github.com/mrdoob/three.js/issues/31381) — Signals WebGPURenderer is the intended future default renderer.
5. [Migrate Three.js to WebGPU (2026) — checklist](https://www.utsubo.com/blog/webgpu-threejs-migration-guide) — WebGPU production-ready in 2026; browser support; TSL compiles to WGSL+GLSL; ~95% coverage with WebGL2 fallback. Third-party write-up — verify specifics against official docs.
6. [Bruno Simon folio-2019 (GitHub, MIT)](https://github.com/brunosimon/folio-2019) — Open-source drive-around portfolio; JS/GLSL, Vite bundler, MIT license.
7. [Bruno Simon — Portfolio case study (Medium)](https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b) — Confirms Three.js + Cannon.js + Blender + Howler.js; primitive-shape physics synced to detailed meshes.
8. [The Rapier physics engine 2025 review / 2026 goals (Dimforge)](https://dimforge.com/blog/2026/01/09/the-year-2025-in-dimforge/) — Rapier actively maintained, 2-5x faster than prior year, WASM/JS bindings.
9. [GLTFLoader — three.js docs](https://threejs.org/docs/pages/GLTFLoader.html) — Draco / KTX2 / meshopt support for the asset pipeline.
10. [100 Three.js performance tips (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips) — gltf-transform, draw-call guidance, Draco vs meshopt. Third-party; treat as guidance.
11. [CSS2DRenderer — three.js docs](https://threejs.org/docs/pages/CSS2DRenderer.html) — DOM-based labels/overlays; CSS3DRenderer for in-scene HTML panels.
12. [State of tree-shaking — three.js forum](https://discourse.threejs.org/t/what-is-the-state-of-tree-shaking/33168) — Documents that three.js does not tree-shake perfectly; bundle ~155 KB gzip core.
13. [WebGL vs Three.js key differences](https://blog.pixelfreestudio.com/webgl-vs-three-js-key-differences-for-3d-graphics/) — Raw WebGL2 steep learning curve; Three.js right for ~95% of 3D-web work. Third-party comparison.
14. [brunosimon/folio-2019 package.json (GitHub)](https://github.com/brunosimon/folio-2019/blob/master/package.json) — Confirms MIT-licensed repo uses Vite ^5, three ^0.164, cannon ^0.6.2 — verifies the 'Vite + Three.js + Cannon.js' stack claim.
15. [What's New in Three.js (2026): WebGPU, New Workflows & Beyond — utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed) — States WebGPURenderer production-ready since r171 (Sept 2025) with automatic WebGL2 fallback via three/webgpu import.
16. [three | npm trends](https://npmtrends.com/three) — One source for weekly downloads (~10.1M cited), conflicting with other 2026 figures of 2.7M-5M.
17. [WebGPU browser support / Safari 26 & Firefox status (web.dev, GitHub gpuweb implementation status)](https://web.dev/blog/webgpu-supported-major-browsers) — Corroborates Chrome 113+, Safari 26+, and Firefox WebGPU rollout (Windows in 141, macOS in 145).
18. [React Three Fiber — Introduction (official docs)](https://r3f.docs.pmnd.rs/getting-started/introduction) — States no overhead vs raw Three.js, declarative reusable components, and lists the ecosystem (rapier, postprocessing, zustand, drei, gltfjsx).
19. [react-three-fiber GitHub Releases](https://github.com/pmndrs/react-three-fiber/releases) — Confirms stable v9.6.1 (Apr 2025), v9.5.0 React 19.2 compat (Dec 2025), and v10.0.0-alpha.1 WebGPU/scheduler.
20. [R3F v9 Migration Guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide) — Documents React 19 compatibility, bundled reconciler, and 19.0–19.2 support range.
21. [drei GitHub Releases](https://github.com/pmndrs/drei/releases) — Confirms stable v10.7.7 (Nov 2025) and v11.0.0-alpha line requiring R3F v9 (alphas into Feb 2026).
22. [pmndrs/gltfjsx](https://github.com/pmndrs/gltfjsx) — Asset-to-component pipeline; --transform (draco, texture resize, dedupe/prune) and --types for typesafe output.
23. [@react-three/rapier (npm/GitHub)](https://github.com/pmndrs/react-three-rapier) — v2 supports R3F v9/React 19; v1 for React 18 — physics for walk/drive-around navigation.
24. [pmndrs/react-three-offscreen](https://github.com/pmndrs/react-three-offscreen) — Worker/OffscreenCanvas rendering; experimental, v0.0.8 last published ~2 years ago, no Safari support.
25. [R3F v10.0.0-alpha.1 discussion #3665](https://github.com/pmndrs/react-three-fiber/discussions/3665) — WebGPURenderer + TSL first-class, state.gl→state.renderer, new scheduler — still alpha as of 2026.
26. [Three.js with Next.js Integration Guide (2026)](https://threejsresources.com/frameworks/three-js-nextjs) — SSR caveat: Canvas must be dynamically imported with ssr:false and a 'use client' boundary.
27. [Theatre.js (docs/blog)](https://www.theatrejs.com/) — @theatre/r3f cinematic tooling; development moved to private repo, 1.0 not yet shipped — maintenance risk.
28. [Best Three.js Portfolio Examples (2025/2026)](https://www.creativedevjobs.com/blog/best-threejs-portfolio-examples-2025) — Real-world game-like/3D portfolios including FWA/Awwwards winners.
29. [Bruno Simon portfolio](https://bruno-simon.com/) — The canonical drive-around 3D portfolio cited as inspiration.
30. [@react-three/fiber — npm (v9.6.1, published April 2026; 10.0.0-alpha line)](https://www.npmjs.com/package/@react-three/fiber) — Confirms stable v9.6.1 (Apr 2026, not 2025) and the v10 alpha pre-release line.
31. [pmndrs/react-three-fiber PR #3224 — upgrade reconciler for React 19](https://github.com/pmndrs/react-three-fiber/pull/3224) — Confirms the bundled-reconciler fix absorbing React's 19.1→19.2 internal reconciler break; compat across React 19.0–19.2.
32. [@react-three/drei — npm (v10.7.7)](https://www.npmjs.com/package/@react-three/drei) — Confirms drei stable v10.7.7 (~Nov 2025).
33. [@react-three/offscreen — npm (v0.0.8)](https://www.npmjs.com/package/@react-three/offscreen) — Confirms v0.0.8, last published ~2 years ago (experimental/stale).
34. [theatre-js/theatre — GitHub README](https://github.com/theatre-js/theatre) — Confirms development moved to a private repo ahead of an unshipped 1.0; license stays open source.
35. [Three.js Journey — Fun and Simple Portfolio with R3F](https://threejs-journey.com/lessons/fun-and-simple-portfolio-with-r3f) — Confirms the named R3F portfolio lesson exists (51 min, Bruno Simon).
36. [pmndrs/react-postprocessing — GitHub](https://github.com/pmndrs/react-postprocessing) — Confirms @react-three/postprocessing repo; React 18 dropped, fiber v9/React 19 required, ESM-only.
37. [Babylon.js 9.0 announcement (official Medium)](https://babylonjs.medium.com/welcome-to-babylon-js-9-0-c3edc9ee6428) — 9.0 released March 26, 2026; clustered/volumetric lighting, Node Particle Editor, Inspector v2, Havok multi-region, geospatial, Gaussian splats, Frame Graph.
38. [Announcing Babylon.js 9.0 (Windows Developer Blog)](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/) — Official Microsoft announcement confirming the 9.0 release and feature set.
39. [Part 2 — Babylon.js 9.0: Tooling updates and geospatial features (Windows Developer Blog)](https://blogs.windows.com/windowsdeveloper/2026/03/30/part-2-babylon-js-9-0-tooling-updates-and-new-geospatial-features/) — Details Inspector v2 (React, extensible), Playground multi-file/ESM/npm, and the community-maintained desktop Babylon.js Editor.
40. [Framework Versions (Babylon.js docs)](https://doc.babylonjs.com/setup/frameworkPackages/frameworkVers) — Confirms weekly Thursday minor-release cadence from master; basis for current 9.13.0 version.
41. [WebGPU Support (Babylon.js docs / GitHub source)](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/setup/support/webGPU.md) — WebGPU in-tree since 5.0; maintained side-by-side with WebGL; main difference is async init; native WGSL core shaders.
42. [Using Havok and the Havok Plugin (Babylon.js docs)](https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin) — Havok WASM physics, bundled free since 6.0; the physics layer for movement/collision in an explorable world.
43. [Asset Containers (Babylon.js docs)](https://doc.babylonjs.com/features/featuresDeepDive/importers/assetContainers) — Core mechanism for the extensibility requirement: load/instantiate/dispose assets independently of scene/engine code.
44. [Part 3 — Babylon.js 8.0: glTF, USDz, and WebXR advancements (Windows Developer Blog)](https://blogs.windows.com/windowsdeveloper/2025/04/03/part-3-babylon-js-8-0-gltf-usdz-and-webxr-advancements/) — glTF loader extensions, programmatic per-asset LOD loading, serializer improvements — supports a data-driven content pipeline.
45. [Babylon.js (Wikipedia)](https://en.wikipedia.org/wiki/Babylon.js) — Apache-2.0 license, Microsoft-maintained, 500+ contributors, history; cross-checks version/maintenance health.
46. [[Showcase] Treasure Planet Style Portfolio (Babylon.js + Angular)](https://forum.babylonjs.com/t/showcase-treasure-planet-style-portfolio-babylon-js-angular/61629) — Real-world explorable game-like portfolio on Babylon.js 8.38 (live at david-alvarado.com), directly matching the goal.
47. [Babylon.js vs Three.js detailed comparison (Slant, 2026)](https://www.slant.co/versus/11077/11348/~babylon-js_vs_three-js) — Community comparison framing Babylon as full game engine vs Three.js as lightweight wrapper; ecosystem/perf trade-offs.
48. [react-babylonjs (GitHub)](https://github.com/brianzinn/react-babylonjs) — Community React renderer for Babylon; cited as weaker/less active than react-three-fiber for React-first composition.
49. [Announcing Babylon.js 8.0 — Windows Developer Blog (Mar 27, 2025)](https://blogs.windows.com/windowsdeveloper/2025/03/27/announcing-babylon-js-8-0/) — Confirms 8.0 release date of March 27, 2025.
50. [babylonjs — npm](https://www.npmjs.com/package/babylonjs) — Latest umbrella package version 9.13.0 (June 2026).
51. [WebGPU Support — Babylon.js Docs](https://doc.babylonjs.com/setup/support/webGPU) — WebGPU available since 5.0 (May 2022), backward compatible with WebGL; native WGSL core shaders.
52. [Wrapmate — Volkswagen ID. Buzz Configurator (Babylon.js forum)](https://forum.babylonjs.com/t/wrapmate-volkswagen-id-buzz-configurator/53661) — The 'Volkswagen ID' example is a third-party Wrapmate wrap configurator, not an official VW project.
53. [Node Particle Editor — Babylon.js](https://npe.babylonjs.com/) — NPE exists; integrated since v8.14, featured in 9.0 cycle.
54. [ASCILINE — GitHub (YusufB5)](https://github.com/YusufB5/ASCILINE) — Real repo: Python/FastAPI + WebSocket video-to-ASCII streaming; outside Babylon's scope as described.
55. [PlayCanvas Engine — GitHub (MIT, v2.19.7, ~16.1k stars, actively maintained)](https://github.com/playcanvas/engine) — Primary: confirms engine version, MIT license, WebGL2/WebGPU/WebXR/glTF support, active maintenance (push 2026-06-19).
56. [playcanvas — npm](https://www.npmjs.com/package/playcanvas) — Confirms latest published version 2.19.7 (2026-06-12) via registry.
57. [PlayCanvas Editor Frontend is now Open Source — PlayCanvas Blog](https://blog.playcanvas.com/playcanvas-editor-frontend-is-now-open-source/) — Primary: editor FRONTEND MIT-open-sourced 2025-07-30; still connects to proprietary backend.
58. [PlayCanvas Editor — GitHub](https://github.com/playcanvas/editor) — Confirms open-source frontend, MIT, README states it connects to PlayCanvas backend; local dev requires loading against playcanvas.com.
59. [Real-time Collaboration — PlayCanvas Developer Site](https://developer.playcanvas.com/user-manual/editor/realtime-collaboration/) — Google-Docs-style multi-user editing in the editor.
60. [Graphics (WebGL2 vs WebGPU) — PlayCanvas Developer Site](https://developer.playcanvas.com/user-manual/graphics/) — WebGPU labeled Beta; WebGL2 mature default; automatic fallback.
61. [Build WebGPU Apps Today with PlayCanvas — PlayCanvas Blog](https://blog.playcanvas.com/build-webgpu-apps-today-with-playcanvas/) — WebGPU backend status and fallback behavior.
62. [Self-hosting — PlayCanvas Developer Site](https://developer.playcanvas.com/user-manual/publishing/web/self-hosting/) — Confirms zip export and serving the published build independently of PlayCanvas servers.
63. [Communicating with web pages (iframe/postMessage) — PlayCanvas Developer Site](https://developer.playcanvas.com/user-manual/editor/publishing/web/communicating-webpage/) — Embedding + React integration pattern.
64. [@playcanvas/react — npm / GitHub](https://github.com/playcanvas/react) — Official declarative React renderer, MIT, v0.11.4 (pre-1.0).
65. [Modernizing the PlayCanvas Backend Infrastructure — Snap Engineering](https://eng.snap.com/playcanvas-backend-infrastructure) — Production proof: Snap Games built on PlayCanvas at massive scale.
66. [Bitmoji Paint — Snap Newsroom](https://newsroom.snap.com/bitmoji-paint) — 100M+ players across Snap Games titles built on PlayCanvas.
67. [Web game engines in 2026: PlayCanvas vs Three.js vs Babylon.js vs Unity WebGL — Cinevva](https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison.html) — Current (2026) comparison; notes MIT engine vs commercial hosted editor, Unity-style workflow.
68. [playcanvas/engine — latest release v2.19.7 (GitHub API)](https://github.com/playcanvas/engine/releases) — Confirmed tag v2.19.7 published 2026-06-12T15:44Z; repo 16,079 stars, pushed 2026-06-19, MIT, 446 releases via GitHub API.
69. [Exporting for the Web — Godot Engine (stable) documentation](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) — Primary source: WebGL2/Compatibility-only, no WebGPU, explicit Safari WebGL2 warnings, COOP/COEP threading headers.
70. [Web Export in 4.3 – Godot Engine](https://godotengine.org/article/progress-report-web-export-in-4-3/) — Official: single-threaded export default since 4.3, removes SharedArrayBuffer requirement, fixes iOS/macOS compatibility.
71. [Godot 4.7 Is Here (80.lv)](https://80.lv/articles/godot-4-7-has-been-released) — Confirms Godot 4.7 stable released 19 June 2026 (current version).
72. [Public access to WebGPU (experimental) in Unity 6.1 — Unity Discussions](https://discussions.unity.com/t/public-access-to-webgpu-experimental-in-unity-6-1/1572462) — Confirms Unity WebGPU is experimental opt-in in 6.1/6000.1 with WebGL2 fallback.
73. [Unity 6 empty web build file sizes (Aras Pranckevičius gist)](https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365) — Measured ~7-10 MB Brotli-compressed minimum Unity WebGL payload, code ~6 MB.
74. [Remote content AssetBundle caching — Unity Addressables docs](https://docs.unity3d.com/Packages/com.unity.addressables@2.1/manual/remote-content-assetbundle-cache.html) — Unity's no-rebuild content-update pipeline (remote catalogs) — key for the extensibility requirement.
75. [WebGL memory increment issue and crash on iOS — Unity Discussions](https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771) — Documented Unity iOS Safari memory ceilings/crashes.
76. [Bevy + WebGPU (official blog)](https://bevy.org/news/bevy-webgpu/) — WebGL2 remains default; WebGPU opt-in; backend chosen at build time.
77. [Support WebGL2 and WebGPU in the same WASM file · Issue #13168 · bevyengine/bevy](https://github.com/bevyengine/bevy/issues/13168) — Confirms Bevy cannot yet runtime-detect backend; build-time choice only.
78. [Optimize for Size — Unofficial Bevy Cheat Book](https://bevy-cheatbook.github.io/platforms/wasm/size-opt.html) — Bevy WASM ~30 MB, ~15 MB after wasm-opt; size-optimization guidance.
79. [Bevy 0.17 Released — GameFromScratch](https://gamefromscratch.com/bevy-0-17-released/) — Bevy 0.16 (Apr 2025) and 0.17 (30 Sep 2025) release timeline.
80. [WebGL & Three.js Site SEO: Make 3D Sites Rankable (2026) — Utsubo](https://www.utsubo.com/blog/webgl-three-js-site-seo-rankable-guide) — Canvas-as-black-box SEO problem; Three.js core ~600 KB baseline for size comparison.
81. [Three.js & Accessibility — Pip Lev (Medium)](https://medium.com/@piplev/three-js-accessibility-c4f45d83f2c6) — Canvas meshes are not keyboard-focusable / opaque to screen readers — applies to all engine canvas exports.
82. [WebGPU and the Return of Browser-Based Indie Games in 2026 — StraySpark](https://www.strayspark.studio/blog/webgpu-browser-indie-games-2026) — WebGPU cross-browser + iOS Safari 18.2 support timeline (early 2026).
83. [Safari 26.0 Release Notes — Apple Developer](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes) — Primary: WebGPU enabled by default starting Safari 26 / iOS 26 (Sept 2025), refuting 'Safari 18 / iOS 18.2'.
84. [WebGPU Lands in Firefox 141 on Windows, Eyes Linux and macOS Next](https://linuxiac.com/webgpu-lands-in-firefox-141-on-windows-eyes-linux-and-macos-next/) — Firefox WebGPU shipped in 141 (Win, Jul 2025); macOS AS in 145/147; Linux not yet stable — refutes 'Firefox 130+'.
85. [Bevy 0.18 release notes (official)](https://bevy.org/news/bevy-0-18/) — Primary: 0.18 posted 13 Jan 2026.
86. [Unity Manual — WebGPU (Experimental) / WebGL2 default](https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html) — Confirms WebGPU experimental, not for production; WebGL2 default.
87. [Godot proposal #6646 — Add WebGPU support](https://github.com/godotengine/godot-proposals/issues/6646) — WebGPU still an open proposal for the engine; not in stable.
88. [OGL — Minimal WebGL Library (GitHub, oframe/ogl)](https://github.com/oframe/ogl) — Primary source. v1.0.11 latest, ~4.5k stars, zero deps, ~29KB minzipped, public domain, last commit 2025-04-13. Positioning: 'developers who like minimal layers of abstraction… interested in creating their own shaders.'
89. [OGL Examples Gallery](https://oframe.github.io/ogl/examples/) — Verifies OGL's built-ins: OrbitControls, glTF loader, MSDF text, shadow maps, instancing, GPGPU particles, raycasting, skinning, FXAA/bloom, render-to-texture, frustum culling.
90. [regl — Functional WebGL (GitHub, regl-project/regl)](https://github.com/regl-project/regl) — Primary source. v2.1.1 (Nov 2024), ~5.5k stars, MIT, ~21KB gzipped, zero deps, no scene graph; semver-stable for long-lived apps. 2026 commits are docs-only (verified via GitHub API).
91. [twgl.js — A Tiny WebGL helper Library (GitHub, greggman/twgl.js)](https://github.com/greggman/twgl.js) — Primary source. v7.0.0 (2025-07-16), last commit 2025-10-13, ~3k stars, MIT, zero deps, WebGL2 helpers, no scene/loaders.
92. [greggman/webgpu-utils](https://github.com/greggman/webgpu-utils) — Confirms WebGPU is a separate library/track from twgl — these lightweight WebGL libs do not bridge to WebGPU.
93. [textmode.js — dynamic ASCII/textmode graphics (CreativeApplications)](https://www.creativeapplications.net/news/textmode-js-library-for-dynamic-ascii-art-text-graphics-with-real-time-rendering/) — Real-world proof that a WebGL2 grid + instanced rendering + MRT pipeline performs for ASCILINE-style streamed-text rendering.
94. [Efecto: Real-Time ASCII and Dithering Effects with WebGL Shaders (Codrops, 2026)](https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/) — Confirms ASCII/dither effects run as independent per-cell fragment shaders — the shader-first core these libs excel at.
95. [OGL — npm registry (version 1.0.11, 2025-01-27, Unlicense, zero deps)](https://registry.npmjs.org/ogl) — Confirmed version, publish date, license, zero dependencies.
96. [regl — npm registry (version 2.1.1, 2024-11-12, MIT, zero deps)](https://registry.npmjs.org/regl) — Confirmed version, date, license.
97. [twgl.js — npm registry (version 7.0.0, 2025-07-16, MIT, zero deps)](https://registry.npmjs.org/twgl.js) — Confirmed version, date, license.
98. [GitHub — humanbydefinition/textmode.js](https://github.com/humanbydefinition/textmode.js) — Confirmed real WebGL2 grid/textmode library with multiple render targets and instancing.
99. [GitHub API — regl-project/regl commits](https://api.github.com/repos/regl-project/regl/commits) — Confirmed 2026 activity is docs/typo-only (README typo fix 2026-06-19); prior substantive commits date to 2024-11-12. ~5,549 stars.
100. [GitHub API — oframe/ogl and greggman/twgl.js](https://api.github.com/repos/oframe/ogl) — OGL ~4,547 stars, last commit 2025-04-13; twgl ~2,987 stars, last commit 2025-10-13.
101. [AsciiEffect — three.js docs](https://threejs.org/docs/pages/AsciiEffect.html) — Confirms AsciiEffect renders the scene to an HTML <table> overlay, default charset ' .:-=+*#%@', and that a new instance is required to change options — the DOM-table scaling limitation.
102. [Creating an ASCII Shader Using OGL — Codrops](https://tympanus.net/codrops/2024/11/13/creating-an-ascii-shader-using-ogl/) — Published 2024-11-13 (Andrico Karoulla). Two-pass shader (RenderTarget -> ASCII pass), 16x16-pixel cell downsample, bitwise glyph encoding, interactive via Tweakpane. Confirms shader-ASCII is real-time and engine-agnostic.
103. [ASCIICKER / asciiid — GitHub](https://github.com/msokalski/asciiid) — Proof an explorable in-browser 3D ASCII world exists: hand-built C++ engine compiled to WebGL via Emscripten; ~353 stars, last release Jan 2024. Demonstrates the world logic is separate from and harder than the ASCII styling.
104. [ASCILINE LICENSE file](https://github.com/YusufB5/ASCILINE/blob/main/LICENSE) — Confirms license is MIT with a custom Anti-Advertisement Restriction clause, not a bare/unknown NOASSERTION license.
105. [three.js r171 release](https://github.com/mrdoob/three.js/releases/tag/r171) — Confirms zero-config WebGPURenderer import from three/webgpu with WebGL2 fallback, Sept 2025.
106. [ASCIICKER repository (msokalski/asciicker)](https://github.com/msokalski/asciicker) — Confirmed: 3D ASCII game, ~67% C++/29% C, Emscripten web build (build-web.sh, game_web.cpp). 'asciiid' is a tool target inside this repo, not the repo name.
107. [ASCIICKER live site](https://asciicker.com/) — Confirmed playable in-browser 3D ASCII game.
108. [PixiJS GitHub repository (v8, stars, license, maintenance)](https://github.com/pixijs/pixijs) — v8.19.0 latest, MIT, ~47.4k stars, ~308 releases, monthly cadence, TypeScript; WebGPU+WebGL+Canvas.
109. [PixiJS Releases](https://github.com/pixijs/pixijs/releases) — v8.19.0 (June 4, 2026); html-source DOM-to-texture, WebGPU MSAA improvements; monthly releases confirm active maintenance.
110. [Phaser 3 vs Phaser 4 (official)](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4) — Phaser 4 launched April 2026; render-node architecture, SpriteGPULayer/TilemapGPULayer, unified filters.
111. [Migrating from Phaser 3 to Phaser 4 (official)](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know) — v4.1.0 stable Apr 30 2026; v3.90 Tsugumi (May 2025) last v3; minimal migration for standard objects; TilemapGPULayer fixed per-pixel cost.
112. [PixiJS v8 renderers / WebGPU production guidance](https://pixijs.com/8.x/guides/components/renderers) — WebGPU feature-complete but WebGL recommended for production; automatic Canvas fallback.
113. [PixiJS Accessibility & DOM integration guide](https://pixijs.com/8.x/guides/components/accessibility) — Opt-in invisible-div overlay for screen readers/Tab; manual, not automatic; DOMContainer for HTML.
114. [Pixel Tools: Phaser asset pipeline (official news)](https://phaser.io/news/2026/03/pixel-tools-phaser-asset-pipeline) — Community Tilepack/Atlaspack/Fontpack; Tiled TMX in, Phaser JSON out; Vite plugin + hot reload; data-driven asset workflow.
115. [Endigo Design portfolio write-up (PixiJS, real shipped example)](https://dev.to/endigo9740/my-new-portfolio-3ke6) — Top-down RPG portfolio: GameObject class, NPC dialog, project monuments, camera-as-container; PixiJS+SvelteKit+Tailwind+Vite.
116. [Ariel Roffé Phaser 3 personal website (source)](https://github.com/ariroffe/personal-website) — Pokémon-style portfolio, Tiled maps, public-domain tilesets; live at arielroffe.quest.
117. [2D vs 3D visualization pros/cons](https://tailoor.com/2d-vs-3d-visualization-pros-and-cons/) — 2D cheaper, more performant, more accessible; 3D needs ~30%+ budget on optimization.
118. [PixiJS vs Phaser comparison](https://fgfactory.com/webgl-libraries-for-2d-games) — Pixi = renderer (build features manually); Phaser = full framework with cameras/tilemaps/physics out of the box.
119. [PixiJS June 2026 update (html-source live-DOM textures, v8.18/8.19)](https://pixijs.com/blog/june-2026) — Confirms v8.19.0 and the pixi.js/html-source path.
120. [Phaser v4.1.0 download page](https://phaser.io/download/release/v4.1.0) — Confirms v4.1.0 release.
121. [Spark — GitHub (sparkjsdev/spark)](https://github.com/sparkjsdev/spark) — v2.1.0 May 18 2026, MIT, ~3.3k stars, actively maintained by World Labs; SplatMesh API, WebGL2, mobile/WebXR, supports PLY/SPZ/SPLAT/KSPLAT/SOG
122. [Streaming 3DGS worlds on the web — World Labs (Spark 2.0)](https://www.worldlabs.ai/blog/spark-2.0) — Published April 14 2026; continuous LoD splat tree, .RAD streamable format (10M splats 200-250MB vs 2.3GB PLY), GPU virtual memory 16M pool, 500K-2.5M budget, WebGL2-by-design (not WebGPU); Starspeed and 40M-splat smartphone demos
123. [Spark Overview docs](https://sparkjs.dev/docs/overview/) — SplatMesh derives from THREE.Object3D; fuses splats with traditional meshes in normal render call; desktop/mobile/WebXR
124. [mkkellogg/GaussianSplats3D — GitHub](https://github.com/mkkellogg/GaussianSplats3D) — v0.4.7 Jan 25 2025, MIT, ~2.8k stars; author states no longer in active development; progressive load only, sub-optimal mobile, planned-but-unfinished streaming/LoD
125. [PlayCanvas open-sources SOG format](https://blog.playcanvas.com/playcanvas-open-sources-sog-format-for-gaussian-splatting/) — Sept 17 2025; WebP-based, Morton-ordered GPU-ready, ~95% reduction (1GB→42MB), 2-3x compressed PLY
126. [SuperSplat — GitHub (playcanvas/supersplat)](https://github.com/playcanvas/supersplat) — Browser-based, MIT, leading open-source 3DGS editor for cleanup/cropping/publishing
127. [Polycam Gaussian Splatting tool](https://poly.cam/tools/gaussian-splatting) — Capture app; PLY/SPLAT export; full PLY export requires Pro ($17.99/mo); file sizes PLY 80-250MB, SPLAT 20-60MB
128. [Luma AI review — THE FUTURE 3D](https://www.thefuture3d.com/software/luma-ai/) — Capture-to-splat workflow, PLY export for SuperSplat/Blender/engines, web gallery and embed options
129. [3D Gaussian Splatting in Three.js — three.js forum showcase](https://discourse.threejs.org/t/3d-gaussian-splatting-in-three-js/57858) — Community examples confirming Three.js integration viability
130. [Mobile-GS / mobile performance context](https://xiaobiaodu.github.io/mobile-gs-project/) — Mobile FPS reality: up to 116fps on Snapdragon 8 Gen 3 optimized, but XR2 ~20fps naive and memory limits on weaker devices
131. [Polycam Pricing](https://poly.cam/pricing) — Confirms Pro plan discontinued (legacy only); current tiers Free/Basic/Business/Enterprise; PLY export on Basic and above; Basic ~$12.50/mo annual / $30/mo monthly.
132. [splat-transform — GitHub (playcanvas/splat-transform)](https://github.com/playcanvas/splat-transform) — MIT CLI/library for splat conversion incl. SOG writer; ~1.1k stars, npm-installable.
133. [Spline — official site](https://spline.design/) — Product overview, 3D web experiences and portfolio solution pages.
134. [Spline Updates (changelog)](https://updates.spline.design/) — Primary source for 2025-2026 releases: Hana events/states (Apr 2025), WebGPU + R3F/Three.js + AI agents in Omma (Mar 2026), perf improvements (Jan 2026).
135. [Spline docs — Exporting as Code](https://docs.spline.design/doc/exporting-as-code/docDdDWmkQri) — Primary source for the key limitation: animations/events only export to Vanilla JS and React; Three.js/R3F exports are static geometry.
136. [splinetool/react-spline (GitHub)](https://github.com/splinetool/react-spline) — Official React component; v4.0.0 (last release Jun 2024); depends on @splinetool/runtime; self-host .splinecode to avoid CORS.
137. [react-spline issue #126 — CPU usage @ 99%](https://github.com/splinetool/react-spline/discussions/126) — Documented sustained ~99% CPU on demo scenes/high-end GPUs; users dropped the library; workaround is glTF + react-three-fiber.
138. [splinetool/r3f-spline (GitHub)](https://github.com/splinetool/r3f-spline) — Community-grade hook (~184 stars, ~23 commits) to load Spline scenes into react-three-fiber via @splinetool/loader.
139. [@splinetool/runtime (npm)](https://www.npmjs.com/package/@splinetool/runtime) — Runtime library on the ~1.12.x line; bundles its own Three.js fork; powers interactive .splinecode playback.
140. [Design+Code — Create a 3D site with game controls in Spline](https://designcode.io/spline2/) — Confirms native keyboard/joystick/button input, physics, collision shapes, custom/follow cameras for game-like navigation, exported to React.
141. [How to optimize Spline 3D scenes for speed and Core Web Vitals (Envato Tuts+)](https://webdesign.tutsplus.com/how-to-optimize-spline-3d-scenes-for-speed-and-core-web-vitals--cms-108749a) — Documents real-world 6s+ load, ~5s TTI, Lighthouse ~30 from main-thread-blocking Spline assets; optimization guidance.
142. [15 Best Spline Websites (Jack Redley)](https://www.jackredley.design/articles/15-best-spline-websites) — Named real-world production examples (Nike Air Montreal, Apple Watch Collection, personal portfolios) demonstrating viability.
143. [Spline Pricing (SaaSworthy, 2026)](https://www.saasworthy.com/product/spline-tool/pricing) — Free tier with watermark; Starter ~$12, Professional ~$20 (full code export/version history), Team ~$36 per month.
144. [Introducing Hana — a canvas for interactive design (Spline blog, Apr 2025)](https://blog.spline.design/introducing-hana) — Confirms Hana launch date and that it is a real-time interactivity canvas (events & states, vector nets/booleans), GPU-accelerated.
145. [Meet Omma: Create 3D, Websites, and Apps with AI agents (Spline updates/changelog)](https://updates.spline.design/changelog/meet-omma-create-3d-websites-and-apps-with-ai-agents.) — Confirms Omma as a distinct March 2026 AI-agent product, not a core-editor patch.
146. [Omma by Spline Unlocks Production-Ready Motion Design in Minutes (Business Wire, Mar 24 2026)](https://www.businesswire.com/news/home/20260324015254/en/Omma-by-Spline-Unlocks-Production-Ready-Motion-Design-in-Minutes) — Launch date (Mar 24 2026), omma.build, ~$29/mo Professional, multi-agent parallel generation.
147. [@splinetool/react-spline — npm](https://www.npmjs.com/package/@splinetool/react-spline) — Confirms latest version 4.1.0 (not 4.0.0).
148. [@splinetool/react-spline — Snyk Advisor](https://snyk.io/advisor/npm-package/@splinetool/react-spline) — Corroborates v4.1.0, last published ~8 months ago.
149. [WebGPU Implementation Status (gpuweb official wiki)](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) — Primary source: per-browser/platform WebGPU shipping status incl. Safari 26, Firefox Windows 141/macOS 145, Chrome Android 121, Linux holdouts.
150. [Three.js Shading Language (official wiki)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language) — Primary source: TSL compiles to WGSL + GLSL, compute()/atomics/barriers, node architecture.
151. [Field Guide to TSL and WebGPU (Maxime Heckel)](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/) — Practitioner detail: node materials, compute shader sizing, forceWebGL, gotchas/limitations, cannot write raw WGSL.
152. [3D web development — a chat with Bruno Simon (Mux)](https://www.mux.com/blog/3d-web-development-and-beyond-a-chat-with-bruno-simon) — Reference portfolio: Three.js, WebGPU interest/usage; note this interview frames WebGPU partly as forward-looking work.
153. [Dev From 2047: A WebGPU Portfolio Experiment in Vue and TSL](https://www.webgpu.com/showcase/dev-from-2047-webgpu-portfolio/) — Real-world WebGPU+TSL portfolio example.
154. [craftlinks/three-tsl-webgpu (GitHub)](https://github.com/craftlinks/three-tsl-webgpu) — Open example repo of Three.js TSL + WebGPU.
155. [three.js r167 release notes (GitHub)](https://github.com/mrdoob/three.js/releases/tag/r167) — Confirms the three.webgpu.js build entry point was added in r167, predating the r171 zero-config import milestone.
156. [caniuse — WebGPU](https://caniuse.com/webgpu) — Confirms ~82.3% global support; Safari 26 partial support; Firefox still default-off.
157. [brunosimon/folio-2025 license (GitHub)](https://github.com/brunosimon/folio-2025/blob/main/license.md) — Confirms Bruno Simon's current portfolio source is MIT-licensed; better citation than the Mux interview for the license claim.
158. [Sketching the Impossible: A 3D Portfolio Built Without a Single 3D Model — Codrops (June 2026)](https://tympanus.net/codrops/2026/06/11/sketching-the-impossible-a-3d-portfolio-built-without-a-single-3d-model/) — Current flagship: scrollable infinite corridor + point-and-click door transitions into 4 themed rooms, parallax (mouse) / gyroscope (mobile) camera, auto-glance toward doors, keyboard-accessible. Confirms versions R19/R3F9/Three 0.182/GSAP 3.14/Vite 7 and chunked-segment culling.
159. [How to Build Cinematic 3D Scroll Experiences with GSAP — Codrops (Nov 2025)](https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/) — Scroll-driven camera-on-rails: cameraAnimRef (position) + targetAnimRef (look-at) scrubbed by ScrollTrigger across a scenePerspectives config; ScrollSmoother for smoothing. Verifies the scroll-cinematic fallback pattern.
160. [@react-three/drei (npm registry, latest)](https://registry.npmjs.org/@react-three/drei/latest) — Confirms drei 10.7.7 as current; provides PointerLockControls, OrbitControls/MapControls, KeyboardControls, Html (hotspots), useGLTF used across the navigation layer.
161. [PointerLockControls — three.js docs](https://threejs.org/docs/pages/PointerLockControls.html) — Primary doc for first-person pointer-lock locomotion; notes cursor capture and selector prop for a 'click to play' activation button (mitigates the abrupt-lock onboarding problem).
162. [nipplejs — virtual joystick (GitHub, yoannmoinet)](https://github.com/yoannmoinet/nipplejs) — Standard mobile touch joystick; events-only (no forced DOM), dynamic/static/semi modes, baseDelta for camera/world panning. Draft PR dated Feb 2025 indicates active maintenance.
163. [Click & Go Mode — 3DVista](https://www.3dvista.com/en/blog/clickandgo/) — Point-and-click teleport navigation pattern: hotspot-free 'free movement' feel, cursor grows a dot to signal clickable floor — directly applicable affordance for teleport locomotion.
164. [Point & Teleport Locomotion Technique for Virtual Reality — CHI PLAY 2016 (ACM)](https://dl.acm.org/doi/10.1145/2967934.2968105) — Foundational HCI evidence that point-and-teleport reduces sickness/disorientation vs. smooth locomotion; underpins the teleport recommendation.
165. [Beating Cybersickness: The Complete VR/AR Comfort Playbook (2025)](https://medium.com/antaeus-ar/beating-cybersickness-the-complete-vr-ar-comfort-playbook-2025-59ea4e083b9f) — Motion-comfort techniques applicable to non-VR 3D: teleport over smooth motion, snap/30-degree turns, speed-proportional vignette, stable rest-frame/HUD anchor.
166. [Locomotion user preferences — Meta Horizon OS Developers](https://developers.meta.com/horizon/design/locomotion-user-preferences/) — Authoritative guidance contrasting comfort (teleport/snap-turn) vs. control (smooth) tradeoffs; informs offering a reduced-motion/comfort option.
167. [My Contemplative Portfolio — Awwwards Honorable Mention](https://www.awwwards.com/sites/my-contemplative-portfolio) — Real-world explorable 3D portfolio example (floating islands), evidence the explorable-world pattern is current and award-recognized in 2025.
168. [three.js Release r184 (current stable)](https://github.com/mrdoob/three.js/releases) — Confirms current three.js is r184 (April 2026), not r182 as the doc stated.
169. [GSAP on npm + Webflow 'GSAP becomes free' announcement](https://webflow.com/blog/gsap-becomes-free) — Confirms GSAP is now fully free (incl. ScrollSmoother) since April 2025; current version 3.15.0.
170. [nipplejs releases (yoannmoinet)](https://github.com/yoannmoinet/nipplejs/releases) — Confirms active maintenance into 2026, v1.0.4.
171. [pmndrs/koota — ECS for real-time React/TS (v0.6.5, Feb 2026)](https://github.com/pmndrs/koota) — Verified: actively maintained, ISC, 29 releases, traits/entities/world + React hooks; the practical successor to miniplex.
172. [hmans/miniplex — ECS for R3F](https://github.com/hmans/miniplex) — Verified maintenance risk: ~1k stars but last release miniplex-react 2.0.1 mid-2023; effectively dormant.
173. [Blender glTF 2.0 exporter — Custom Properties → extras](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) — Custom Properties export to node.extras when the export option is enabled; read as userData in three.js.
174. [KhronosGroup/glTF extensions & extras README](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md) — extras has no defined namespace — confirms you must invent and validate your own spawn/hotspot convention.
175. [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) — Declarative R3F renderer; V10 roadmap adds a data-oriented scheduler enabling ECS-style workflows.
176. [Storyblok vs Sanity vs Contentful — which CMS in 2026 (Monterail)](https://www.monterail.com/blog/which-cms-to-choose) — Current CMS landscape; Sanity = structured content, Storyblok = visual blocks, Contentful = enterprise.
177. [Build a 3D portfolio with Vite/React/Three.js/Strapi (Strapi blog)](https://strapi.io/blog/build-a-simple-3-d-portfolio-website-with-vite-react-three-js-and-strapi) — Concrete CMS-driven manifest example: Strapi v5 serving flattened JSON to R3F.
178. [Simplifying React Three Fiber with ECS (douges.dev)](https://douges.dev/blog/simplifying-r3f-with-ecs) — Entity/registry pattern in R3F — basis for the interactable registry recommendation.
179. [koota — GitHub releases (pmndrs)](https://github.com/pmndrs/koota/releases) — Latest tagged releases; v0.6.0 (Dec 2024) → v0.6.5 (Feb 2025). Confirms the section's 'Feb 2026' date is wrong.
180. [koota — npm registry (latest)](https://registry.npmjs.org/koota/latest) — Latest published version 0.6.6, license ISC. Corrects the claimed v0.6.5.
181. [miniplex — npm registry](https://www.npmjs.com/package/miniplex) — Last version 2.0.0, published 2023-07-16; confirms dormancy.
182. [@react-three/rapier — npm registry (latest)](https://registry.npmjs.org/@react-three/rapier/latest) — Version 2.2.0; peerDeps @react-three/fiber ^9.0.4, react ^19, three >=0.159.0. Confirms v2 / R3F v9 / React 19.
183. [@react-three/fiber — npm registry (latest)](https://registry.npmjs.org/@react-three/fiber/latest) — Version 9.6.1, react peer '>=19 <19.3'. Confirms v9 line / React 19.
184. [three.js GLTFLoader / GLTFExporter docs and issues](https://threejs.org/docs/pages/GLTFExporter.html) — Confirms glTF extras ↔ three.js userData round-trip is the standard mechanism.
185. [glTF Transform — official SDK/CLI docs](https://gltf-transform.dev/) — Confirms Draco, meshopt, KTX2/Basis (UASTC+ETC1S), WebP, weld/dedup/simplify/instance/palette; MIT, Don McCurdy.
186. [glTF Transform GitHub repo](https://github.com/donmccurdy/glTF-Transform) — ~1.9k stars, MIT, active; author is a Three.js contributor.
187. [@gltf-transform/core on npm](https://www.npmjs.com/package/@gltf-transform/core) — Verified latest version 4.3.0, published ~3 months ago (CLI ~5 months).
188. [glTF Transform simplify() function docs](https://gltf-transform.dev/modules/functions/functions/simplify) — meshopt-backed simplify with ratio+error params; weld-before-simplify guidance; LOD generation.
189. [meshoptimizer](https://meshoptimizer.org/gltf/) — De-facto meshopt geometry compression + gltfpack; faster decode than Draco.
190. [Poly Pizza](https://poly.pizza/) — 10,500+ free low-poly models (Kenney/Quaternius), GLB/FBX, v1.1 API.
191. [Kenney](https://kenney.nl/) — 40k+ CC0 game assets, no attribution required.
192. [Quaternius](https://quaternius.com/) — CC0 low-poly asset packs (GLB/FBX).
193. [Meshy — commercial use / ownership help articles](https://help.meshy.ai/en/articles/9992001-can-i-use-my-generated-assets-for-commercial-projects) — Paid plans grant full ownership; free tier CC BY 4.0 with inconsistent wording — treat as non-commercial for safety.
194. [Meshy pricing](https://www.meshy.ai/pricing) — Free $0 / Pro $20 / Studio $60 / Enterprise; API + private ownership on paid.
195. [Tripo AI — IP/commercial rights](https://www.tripo3d.ai/game-development/ip-security-cloud-ai-3d-workspaces-commercial-games) — Commercial rights only on Pro/Enterprise; free plan non-commercial.
196. [Tencent Hunyuan3D-2.1 (Hugging Face)](https://huggingface.co/tencent/Hunyuan3D-2.1) — Open source, PBR, GLB export; Apache + Tencent Community License; OSS license excludes EU/UK/South Korea.
197. [State of AI 3D Generation 2026](https://www.3daistudio.com/state-of-ai-3d-generation-2026) — Landscape of Meshy/Tripo/Rodin Gen-2/Hunyuan3D quality, formats, APIs.
198. [@gltf-transform/functions — npm (v4.4.0)](https://www.npmjs.com/package/@gltf-transform/functions) — Functions package version, ~12 days old as of June 2026.
199. [Three.js GLTFLoader docs (correct URL)](https://threejs.org/docs/#api/en/loaders/GLTFLoader) — Canonical page; confirms setDRACOLoader/setKTX2Loader/setMeshoptDecoder. Original link was broken.
200. [Tripo AI free plan / licensing (2026)](https://costbench.com/software/ai-3d-generation/tripo-ai/free-plan/) — Free Basic plan: public CC BY 4.0 models, non-commercial; Pro grants private + commercial rights.
201. [Hunyuan3D-2.1 LICENSE on Hugging Face](https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE) — Tencent Hunyuan Community License; territory excludes EU, UK, South Korea.
202. [Hyper3D launches Rodin Gen-2.5 (Jan 21, 2026)](https://80.lv/articles/how-hyper3d-rodin-gen-2-5-is-bringing-production-level-control-to-ai-3d-generation) — Gen-2.5 supersedes the 10B-param Gen-2; current as of 2026.
203. [Meshy 6 launch (GA Jan 18, 2026)](https://www.meshy.ai/blog/meshy-6-launch) — Confirms Meshy 6 is current, exports GLB/OBJ/FBX/STL/USDZ.
204. [Kenney Game Assets All-in-1 (itch.io)](https://kenney.itch.io/kenney-game-assets) — 60,000+ CC0 assets, not 40k.
205. [Poly Pizza v1.1 API docs](https://poly.pizza/docs/api/v1.1) — Confirms 10,500+ models and v1.1 API; catalog mixes CC0 and CC-BY.
206. [Texture Compression with KTX2 and Basis Universal (Khronos / DeepWiki)](https://deepwiki.com/KhronosGroup/glTF-Sample-Models/5.1-texture-compression-with-ktx2-and-basis-universal) — KHR_texture_basisu, UASTC vs ETC1S, ~4-10x GPU memory reduction, stays compressed on GPU.
207. [Progressive Network Streaming of Textured Meshes in Binary glTF 2.0 (ACM 3DWeb 2023)](https://dl.acm.org/doi/10.1145/3611314.3615907) — Establishes glTF is not natively streamable and must usually fully download — justifies zone-based lazy loading over true mesh streaming.
208. [Cloudflare Cache Reserve docs](https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/) — R2-backed upper-tier cache; large objects fall through standard cache to Cache Reserve at extra cost — informs keeping zone GLBs modestly sized.
209. [Cloudflare Content Compression docs](https://developers.cloudflare.com/speed/optimization/content/compression/) — Brotli/gzip/zstd support and Vary: Accept-Encoding handling for binary asset delivery.
210. [Implement WebWorker for meshopt_decoder.js (zeux/meshoptimizer #253)](https://github.com/zeux/meshoptimizer/discussions/253) — Confirms Meshopt worker support (v0.18) and the main-thread-blocking risk if decoded inline; Draco decodes in a worker via DRACOLoader.
211. [WebGPU r181: stats-gl no longer compatible (three.js forum)](https://discourse.threejs.org/t/webgpu-r181-fyi-stats-gl-no-longer-compatible-with-webgpu/87944) — Profiler caveat: tooling must track renderer choice; stats-gl is the WebGL+WebGPU profiler, classic stats.js broke with WebGPU.
212. [stats-gl (RenaudRohlinger/stats-gl)](https://github.com/RenaudRohlinger/stats-gl) — Confirms correct repo owner is RenaudRohlinger, not 'RenderMan-dev'. WebGL+WebGPU+worker support.
213. [14islands — Progressive Enhancement with WebGL and React](https://14islands.com/blog/progressive-enhancement-with-webgl-and-react) — Practitioner source: build DOM-first responsive layout, layer WebGL on top; proxy-element sync; candid 'if load time/device support is top priority, don't use WebGL' and notes accessibility hit from virtual scrolling.
214. [pmndrs/react-three-a11y (GitHub)](https://github.com/pmndrs/react-three-a11y) — R3F accessibility: A11y wrapper (content/button/togglebutton/link roles), A11yAnnouncer for screen readers, focus/keyboard. Latest v3.0.0, May 2022 — flag as maintenance risk.
215. [html-in-canvas.dev — Demos (HTML-in-Canvas API)](https://html-in-canvas.dev/demos/) — Confirms experimental status: requires chrome://flags/#canvas-draw-element, Chrome Canary / Brave Chromium 147+; demonstrates accessible charts/forms in canvas but NOT production-ready as of 2026.
216. [MDN — prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) — Authoritative spec/support reference for the reduced-motion media feature; pair with window.matchMedia for JS-driven WebGL animation.
217. [web.dev — Animation and motion (accessibility)](https://web.dev/learn/accessibility/motion) — Google guidance on vestibular triggers and WCAG motion criteria; basis for disabling auto-camera/parallax under reduced-motion.
218. [Three.js docs — WebGL compatibility check](https://threejs.org/docs/#manual/en/introduction/WebGL-compatibility-check) — Current capability-detection pattern: import WebGL from three/addons/capabilities/WebGL.js, isWebGLAvailable()/isWebGL2Available(); note old CanvasRenderer software fallback removed in r69.
219. [Level Access — EU Accessibility requirements and EAA compliance](https://www.levelaccess.com/blog/eu-accessibility-requirements-and-eaa-compliance/) — EAA enforceable 28 June 2025, EN 301 549 → WCAG 2.1 AA, fines up to 4% of turnover; legal backdrop for the career/reputation risk argument.
220. [Level Access — ADA Title III website accessibility lawsuits](https://www.levelaccess.com/blog/title-iii-lawsuits-10-big-companies-sued-over-website-accessibility/) — ~4,000+ US web-accessibility suits in 2024; common failure modes include keyboard-trap widgets and non-responsive/mobile-incompatible design.
221. [Anneka Goss — Accessible WebGL (Medium)](https://annekagoss.medium.com/accessible-webgl-43d15f9caa21) — DOM-overlay / focus-proxy technique: keep native keyboard nav and screen-reader behaviour by overlaying tabbable DOM copies over the canvas.
222. [Introducing the HTML-in-Canvas API origin trial — Chrome for Developers](https://developer.chrome.com/blog/html-in-canvas-origin-trial) — Confirms HTML-in-Canvas is in a Chrome 148-150 origin trial with canvas-draw-element flag in Canary 149+; not yet stable. Corrects the original 'Chromium 147+ flagged' wording.
223. [HTML-in-Canvas — Browser Support](https://html-in-canvas.dev/docs/browser-support/) — No Firefox/Safari commitment; Chrome-only experimental status as of 2026.
224. [Penalties for EAA Non-Compliance (2026) — Level Access](https://www.levelaccess.com/blog/penalties-for-eaa-non-compliance/) — EAA penalties are per-member-state, not a blanket 4% of turnover; refutes the original fine claim.
225. [EAA Fines & Penalties by Country (2026 Update) — Web Accessibility Checker](https://web-accessibility-checker.com/en/blog/eaa-fines-penalties-by-country) — Turnover-based caps where they exist are ~5% (Italy, Hungary, France), with fixed-euro caps elsewhere.
226. [@react-three/a11y — npm](https://www.npmjs.com/package/@react-three/a11y) — Confirms v3.0.0 is the latest, published ~May 2022; effectively unmaintained.
227. [CanvasRenderer removed in r69? — three.js issue #5724](https://github.com/mrdoob/three.js/issues/5724) — Confirms the software CanvasRenderer was removed from three.js core in r69 (~2014) and moved to examples.
228. [Federal Court Website Accessibility Lawsuit Filings — ADA Title III (Seyfarth)](https://www.adatitleiii.com/) — Authoritative annual tracker; federal web-accessibility filings ~2,452 in 2024, federal+state exceeding ~4,000.
229. [brunosimon/folio-2025 (GitHub)](https://github.com/brunosimon/folio-2025) — Confirms Vite build to dist/, static client-side app, glb + KTX2 + Draco assets, npm run compress pipeline using gltf-transform and KTX-Software.
230. [Cloudflare Pages vs Netlify vs Vercel static hosting (DanubeData, 2026)](https://danubedata.ro/blog/cloudflare-pages-vs-netlify-vs-vercel-static-hosting-2026) — Cloudflare Pages unlimited bandwidth on all tiers; Netlify/Vercel 100 GB/mo free; Netlify pauses on overage.
231. [Vercel vs Netlify vs Cloudflare Pages 2025 (ai-infra-link)](https://www.ai-infra-link.com/vercel-vs-netlify-vs-cloudflare-pages-2025-comparison-for-developers/) — Free-tier bandwidth figures and overage behavior across the three hosts.
232. [Cloudflare R2 pricing (official docs)](https://developers.cloudflare.com/r2/pricing) — $0.015/GB-mo storage, zero egress fees, 10 GB + 1M Class A + 10M Class B free tier.
233. [Cloudflare Durable Objects pricing / WebSocket Hibernation (official docs)](https://developers.cloudflare.com/durable-objects/platform/pricing) — Hibernation API keeps idle WebSockets open without duration billing; 100 incoming messages billed as 5 requests.
234. [Cloudflare Python Workers packages (official docs)](https://developers.cloudflare.com/workers/languages/python/packages/) — Python Workers run on Pyodide/WASM; NumPy/pandas included but C-extension packages like OpenCV are not supported.
235. [Do Vercel Serverless Functions support WebSockets? (Vercel KB)](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) — Official statement: serverless functions cannot host long-lived WebSocket connections; recommends third-party realtime providers.
236. [GitHub Pages limits (official docs)](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) — 1 GB published site cap, 100 GB/mo soft bandwidth limit with suspension, 10 builds/hour.
237. [Python hosting options compared: Fly.io/Render/Railway (Nandann, 2025)](https://www.nandann.com/blog/python-hosting-options-comparison) — Render free tier spins down after 15 min (~30-50s cold start); Railway usage-based ~$5-10/mo; Fly.io good for sockets/FastAPI.
238. [Khronos Asset Creation Guidelines 2.0 (Aug 2025)](https://www.khronos.org/blog/introducing-asset-creation-guidelines-2.0-siggraph-2025) — Current best-practice guidance for optimized glTF assets for web/real-time 3D.
239. [HTTPS (SSL) - Netlify Docs](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/) — Free automatic managed certs; corroborates free SSL + custom domain across static hosts.
240. [Cloudflare Pages docs / pricing](https://developers.cloudflare.com/pages/functions/pricing/) — Confirms unmetered static-asset requests / no bandwidth cap on free tier.
241. [Python Workers redux: packages and uv-first workflow (Cloudflare blog, 2025)](https://blog.cloudflare.com/python-workers-advancements/) — Documents that Python Workers now support C-extension packages via Pyodide — basis for correcting the 'no C extensions' claim.
242. [Packages built in Pyodide (official list)](https://pyodide.org/en/stable/usage/packages-in-pyodide.html) — Authoritative Pyodide package list; opencv-python documented as buildable since v0.21.0 (page returned 403 to automated fetch but corroborated via Pyodide discussions).
243. [Render free tier (spin-down after 15 min, ~30-60s cold start, 750 hrs/mo)](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026) — Render's own 2026 article confirming free-tier spin-down and instance hours.
244. [Henry Heffernan portfolio-website (GitHub, MIT)](https://github.com/henryjeff/portfolio-website) — ~2.2k stars, 315 forks; TypeScript 86% + R3F + GLSL; explorable OS/office portfolio. Forkable blueprint.
245. [Three.js (Wikipedia / release tracking)](https://en.wikipedia.org/wiki/Three.js) — Confirms r184 (April 2026), WebGPURenderer + TSL production maturity, r171 stabilization. Verify exact version against npm before pinning.
246. [Codrops: 3D World in the Browser with Blender and Three.js (Andrew Woan, Apr 8 2025)](https://tympanus.net/codrops/2025/04/08/3d-world-in-the-browser-with-blender-and-three-js/) — Documents the Blender->GLB->R3F pipeline (Draco, KTX, gltfjsx, Zustand, Howler); curve-on-rails camera (borrow pipeline, not navigation).
247. [pmndrs/ecctrl (GitHub, MIT)](https://github.com/pmndrs/ecctrl) — Physics character/vehicle/drone controller on R3F + Rapier; ~744 stars, active. Free-roam navigation building block.
248. [Gen-02 Portfolio: An Immersive World (webgpu.com showcase)](https://www.webgpu.com/showcase/gen-02-portfolio-an-immersive-world/) — Awwwards SOTD + Developer Award Oct 2025; closed-source UX reference for immersive navigation.

