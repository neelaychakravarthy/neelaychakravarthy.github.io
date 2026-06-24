import './style.css';
import gsap from 'gsap';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Engine } from './engine/Engine';
import { MorphFX } from './engine/MorphFX';
import { Atmosphere } from './engine/Atmosphere';
import { EnvironmentController } from './engine/EnvironmentController';
import { CameraRig } from './engine/CameraRig';
import { FocusController } from './engine/FocusController';
import { TireFX } from './engine/TireFX';
import { DolphinFX } from './engine/DolphinFX';
import { Minimap, type MapMarker } from './engine/Minimap';
import { TourController, type PadLink } from './engine/TourController';
import { Unit } from './engine/Unit';
import { ClickToMove } from './engine/ClickToMove';
import { AssetRegistry } from './engine/AssetRegistry';
import { BiomeManager, type PadInstance, type BuiltBiome } from './engine/Biome';
import { bridgeHeight, ROAD_HALF } from './engine/bridges';
import { TransitionController } from './engine/TransitionController';
import { InteractionManager } from './engine/InteractionManager';
import { LiftController } from './engine/LiftController';
import { RaceController, type RaceUI } from './engine/RaceController';
import { summitHeight, SUMMIT_BASE_Y } from './engine/summit';
import { loadWorld } from './engine/WorldLoader';
import { AudioManager } from './engine/AudioManager';
import { WORLD_PERIOD, setWorldPeriod, wrapDelta, wrapDistXZ } from './engine/wrap';
import { initQuality, detectMobile } from './engine/quality';
import type { SpawnConfig, AtmosphereConfig } from './world/types';

/** Merge prefab-emitted grass-clear shapes (e.g. the racetrack) into a biome's
 *  atmosphere config so blades don't poke through the track. */
function withClear(cfg: AtmosphereConfig | undefined, extra: number[][]): AtmosphereConfig | undefined {
  if (!cfg || !extra.length) return cfg;
  return { ...cfg, grassClear: [...(cfg.grassClear ?? []), ...extra] };
}

/** The drivable surface for a biome: a raised deck over its racetrack bridges,
 *  flat ground (0) elsewhere; null when the biome has no bridges. */
function surfaceFor(b: BuiltBiome): ((x: number, z: number) => number | null) | null {
  return b.bridgeSpans.length ? (x, z) => bridgeHeight(x, z, b.bridgeSpans, ROAD_HALF) : null;
}

/** Non-pad minimap markers a biome exposes (race start, …); extend as POIs grow. */
function mapMarkers(b: BuiltBiome): MapMarker[] {
  const m: MapMarker[] = [];
  if (b.race) m.push({ x: b.race.padX, z: b.race.padZ, color: '#39d98a' });
  return m;
}

function hideLoader() {
  document.getElementById('loader')?.classList.add('hidden');
}

function showFatal(title: string, detail: string) {
  hideLoader();
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;z-index:100;padding:24px;' +
    'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';
  const card = document.createElement('div');
  card.style.cssText =
    'max-width:580px;background:#fff;border:1px solid #e3e8ef;border-radius:14px;' +
    'padding:24px 26px;box-shadow:0 12px 44px rgba(20,40,80,.14);color:#1c2733;';
  const h = document.createElement('div');
  h.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:10px;';
  h.textContent = title;
  const p = document.createElement('div');
  p.style.cssText = 'font-size:13.5px;line-height:1.55;color:#42505f;white-space:pre-wrap;';
  p.textContent = detail;
  card.append(h, p);
  wrap.append(card);
  document.body.append(wrap);
}

function webgl2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function applySpawn(unit: Unit, spawn?: SpawnConfig) {
  if (!spawn) return;
  unit.object.position.set(...spawn.position);
  unit.object.rotation.y = spawn.rotationY ?? Math.PI;
}

async function boot() {
  const mobile = detectMobile();
  initQuality(mobile);
  if (mobile) {
    const hint = document.querySelector('#hint span');
    if (hint) hint.textContent = 'Tap to drive · roll onto a glowing pad to enter a project · pinch to zoom · drag to rotate';
  }

  if (!webgl2Available()) {
    showFatal(
      'WebGL isn’t available in this browser',
      'This world is rendered with WebGL, which your browser isn’t currently providing.\n\n' +
        '• Chrome → Settings → System → turn on “Use graphics acceleration when available”, then relaunch Chrome.\n' +
        '• Visit chrome://gpu to check whether WebGL is blocklisted.\n\n' +
        'Then hard-reload (⌘⇧R).',
    );
    return;
  }

  const app = document.getElementById('app');
  if (!app) throw new Error('#app container missing');

  const world = await loadWorld();
  if (world.period) setWorldPeriod(world.period);

  const engine = new Engine(app);
  const env = new EnvironmentController(engine.scene);
  const registry = new AssetRegistry();
  const biomes = new BiomeManager(engine.scene, registry, env, world);

  const unit = new Unit();
  if (world.unit?.speed) unit.speed = world.unit.speed;
  if (world.unit?.turnRate) unit.turnRate = world.unit.turnRate;
  engine.scene.add(unit.object);

  const start = biomes.start(world.startBiome);
  applySpawn(unit, start.config.spawn);
  unit.colliders = start.colliders;
  unit.boxColliders = start.boxColliders;
  unit.river = start.river;
  unit.bridgeSpans = start.bridgeSpans;
  unit.surface = surfaceFor(start);
  engine.postfx.setSelection(start.glows);

  const fx = new MorphFX(
    engine.scene,
    (o) => engine.postfx.addGlow(o),
    (o) => engine.postfx.removeGlow(o),
  );

  const atmosphere = new Atmosphere(engine.scene);
  atmosphere.setBiome(withClear(start.config.atmosphere, start.grassClear), { river: start.river, pads: start.pads });

  const rig = new CameraRig(engine.camera, engine.renderer.domElement);
  // gentle intro: ease the camera in from slightly further out
  const restDistance = rig.distance;
  rig.distance = restDistance + 9;
  gsap.to(rig, { distance: restDistance, duration: 1.8, ease: 'power2.out', delay: 0.15 });

  const focus = new FocusController(engine.camera);
  focus.setBiome(start.focusables);

  const tireFX = new TireFX(engine.scene);
  const dolphins = new DolphinFX(engine.scene);
  dolphins.setRiver(start.river);

  const minimap = new Minimap();
  minimap.setBiome(start.pads, mapMarkers(start));

  const transition = new TransitionController();
  const interaction = new InteractionManager();
  interaction.setBiome(start.pads, unit.position);

  // ---- race flow + lap-timer HUD (racetrack) ----
  const lapEl = document.createElement('div');
  lapEl.id = 'lap-timer';
  lapEl.innerHTML =
    '<div class="lt-cur">0.00</div><div class="lt-rows"><span>Last <b class="lt-last">—</b></span><span>Best <b class="lt-best">—</b></span></div>';
  document.body.appendChild(lapEl);
  const ltCur = lapEl.querySelector('.lt-cur') as HTMLElement;
  const ltLast = lapEl.querySelector('.lt-last') as HTMLElement;
  const ltBest = lapEl.querySelector('.lt-best') as HTMLElement;
  const cdEl = document.createElement('div');
  cdEl.id = 'race-countdown';
  document.body.appendChild(cdEl);
  let lapFlashT = 0;
  const fmtTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
  };
  const raceUI: RaceUI = {
    countdown: (text) => {
      if (text === null) {
        cdEl.classList.remove('show');
        return;
      }
      cdEl.textContent = text;
      cdEl.classList.toggle('go', text === 'GO');
      cdEl.classList.remove('show');
      void cdEl.offsetWidth; // restart the pop animation each tick
      cdEl.classList.add('show');
    },
    showTimer: (show) => lapEl.classList.toggle('show', show),
    time: (t) => (ltCur.textContent = fmtTime(t)),
    result: (last, best) => {
      ltCur.textContent = fmtTime(last);
      ltLast.textContent = fmtTime(last);
      ltBest.textContent = fmtTime(best);
      lapEl.classList.add('flash');
      window.clearTimeout(lapFlashT);
      lapFlashT = window.setTimeout(() => lapEl.classList.remove('flash'), 1600);
    },
  };
  const race = new RaceController(unit, fx, raceUI);
  race.setBiome(start.race, start.checkpoints);

  window.addEventListener('pagehide', () => engine.dispose(), { once: true });

  let locked = false;
  let tourActive = false;
  let liftActive = false;
  /** True once the visitor has left the start screen (free roam or a finished
   *  tour) — gates the floating "Guided tour" button. */
  let entered = false;

  const audio = new AudioManager();
  audio.setBiome(start.config.audio);
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  const click = new ClickToMove(engine.camera, engine.renderer.domElement, env.ground, engine.scene, {
    onGround: (p) => {
      if (locked || race.inputLocked) return;
      audio.unlock();
      unit.setTarget(p);
      audio.move();
    },
    getClickables: () => biomes.current?.clickables ?? [],
    onInteract: (obj) => {
      audio.unlock();
      const url = obj.userData.url as string;
      if (url && url !== '#') {
        audio.link();
        window.open(url, '_blank', 'noopener');
      }
    },
    isLocked: () => locked || tourActive || liftActive || race.inputLocked,
  });

  // ---- keyboard driving (WASD / arrow keys) ----
  const keys = new Set<string>();
  const DRIVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!DRIVE_KEYS.has(k)) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return; // don't hijack dev-GUI inputs
    keys.add(k);
    e.preventDefault();
    audio.unlock();
    if (!entered) enterFreeRoam(); // pressing a drive key also leaves the start screen
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  const readDrive = () => ({
    throttle: (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0),
    steer: (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0),
  });

  function triggerMorph(target: string, opts?: { spawn?: SpawnConfig; snap?: boolean }) {
    if (locked || !biomes.current || biomes.current.id === target) return;
    locked = true;
    unit.stop();
    focus.reset();
    // Recentre the unit + camera into the home tile (seamlessly, since the world
    // is periodic) so the morph always plays out near the authored origin.
    const ox = wrapDelta(unit.position.x, 0) - unit.position.x;
    const oz = wrapDelta(unit.position.z, 0) - unit.position.z;
    if (ox !== 0 || oz !== 0) {
      unit.object.position.x += ox;
      unit.object.position.z += oz;
      rig.shift(ox, oz);
    }
    audio.morph();
    const from = biomes.current;
    const to = biomes.build(target, true);
    audio.setBiome(to.config.audio);
    atmosphere.setBiome(withClear(to.config.atmosphere, to.grassClear), { river: to.river, pads: to.pads });
    engine.postfx.setSelection([...from.glows, ...to.glows]);
    const spawn = opts?.spawn ?? to.config.spawn ?? { position: [0, 0, 11] as const, rotationY: Math.PI };
    transition.morph({
      from,
      to,
      env,
      fromEnv: env.stateFor(from.config.environment),
      toEnv: env.stateFor(to.config.environment),
      unit,
      spawn,
      snapUnit: opts?.snap ?? false,
      fx,
      rig,
      onComplete: () => {
        biomes.dispose(from);
        biomes.current = to;
        interaction.setBiome(to.pads, unit.position);
        race.setBiome(to.race, to.checkpoints);
        minimap.setBiome(to.pads, mapMarkers(to));
        focus.setBiome(to.focusables);
        unit.colliders = to.colliders;
        unit.boxColliders = to.boxColliders;
        unit.river = to.river;
        unit.bridgeSpans = to.bridgeSpans;
        unit.surface = surfaceFor(to);
        click.setGroundPlane(null);
        dolphins.setRiver(to.river);
        engine.postfx.setSelection(to.glows);
        setLiftMountain();
        locked = false;
      },
    });
  }

  // ---- ski lift (in-world chair-lift to the mountain summit) ----
  const lift = new LiftController({
    unit,
    fx,
    rig,
    audio,
    enterSummit: () => {
      unit.surface = summitHeight; // drive on the raised dome
      unit.colliders = [];
      unit.boxColliders = [];
      unit.river = null;
      unit.bridgeSpans = [];
      click.setGroundPlane(SUMMIT_BASE_Y); // clicks resolve on the summit
    },
    exitSummit: () => {
      unit.colliders = biomes.current?.colliders ?? [];
      unit.boxColliders = biomes.current?.boxColliders ?? [];
      unit.river = biomes.current?.river ?? null;
      unit.bridgeSpans = biomes.current?.bridgeSpans ?? [];
      unit.surface = biomes.current ? surfaceFor(biomes.current) : null; // back to flat ground / bridges
      click.setGroundPlane(null);
    },
    setActive: (a) => {
      liftActive = a;
    },
  });
  /** Hand the lift the current biome's ski-mountain (it owns the chair loop). */
  function setLiftMountain() {
    lift.setLift(biomes.current?.skiLifts[0] ?? null);
  }
  setLiftMountain();

  /** A pad was rolled onto: ride the lift if it's a lift pad, else morph. */
  function onPadEnter(pad: PadInstance) {
    if (pad.lift) lift.ride(pad.lift);
    else triggerMorph(pad.target);
  }

  // ---- guided tour ----
  const padGraph = new Map<string, PadLink[]>();
  for (const b of world.biomes) {
    padGraph.set(b.id, (b.pads ?? []).map((p) => ({ target: p.target, x: p.position[0], z: p.position[2] })));
  }
  const fadeHint = () => document.getElementById('hint')?.classList.add('faded');
  // (Re)show the controls hint, then fade it after a few seconds — used on free
  // roam start and again when the guided tour ends.
  const showHint = () => {
    const el = document.getElementById('hint');
    if (!el) return;
    el.classList.remove('faded');
    window.setTimeout(() => el.classList.add('faded'), 6500);
  };

  const tour = new TourController({
    unit,
    audio,
    focus,
    rig,
    morphTo: triggerMorph,
    currentBiomeId: () => biomes.current?.id,
    isLocked: () => locked,
    getFocusables: () => biomes.current?.focusables ?? [],
    getSpawn: () => {
      const s = biomes.current?.config.spawn?.position ?? [0, 0, 12];
      return { x: s[0], z: s[2] };
    },
    padGraph,
    setTourActive: (a) => {
      tourActive = a;
      unit.ghost = a; // the tour drives on rails — never let a prop block its path
      updateTourButton();
    },
    onEnd: showHint, // tour over → free roam: re-show the controls hint
  });

  // Floating "Guided tour" button: lets a free-roaming visitor (re)start the tour
  // at any time — whether they chose Free roam at the start, or skipped the tour
  // partway to explore and now want to ride along again. Hidden during the tour
  // itself (the Skip button takes over) and on the start screen.
  const tourBtn = document.createElement('button');
  tourBtn.id = 'start-tour';
  tourBtn.textContent = '▶  Guided tour';
  tourBtn.addEventListener('click', () => {
    audio.unlock();
    fadeHint();
    tour.start(); // restarts from the top; drives back to the hub first
  });
  document.body.appendChild(tourBtn);

  // Floating "View portfolio" button: lets anyone exploring the 3D world jump to
  // the document-style portfolio page at any time. Top-left, so it never collides
  // with the top-centre tour button or the top-right skip buttons.
  const portfolioBtn = document.createElement('a');
  portfolioBtn.id = 'view-portfolio';
  portfolioBtn.href = '/portfolio.html';
  portfolioBtn.innerHTML = '▤&nbsp; Portfolio';
  document.body.appendChild(portfolioBtn);

  function updateTourButton() {
    tourBtn.style.display = entered && !tourActive ? 'block' : 'none';
    portfolioBtn.style.display = entered ? 'inline-flex' : 'none';
  }
  updateTourButton();

  /** Enter free-roam (shared by the start button and deep-links). */
  function enterFreeRoam() {
    audio.unlock();
    hideLoader();
    showHint();
    entered = true;
    updateTourButton();
  }

  /** A `?biome=<id>` query (used by the document-style portfolio's "Open in 3D"
   *  links) jumps straight into that room, skipping the start screen. */
  function deepLinkBiome(): string | null {
    const id = new URLSearchParams(window.location.search).get('biome');
    return id && world.biomes.some((b) => b.id === id) ? id : null;
  }

  function showStartScreen() {
    const action = document.getElementById('loader-action');
    const tip = document.getElementById('loader-tip');
    if (tip) tip.textContent = 'an explorable 3D portfolio';

    const deep = deepLinkBiome();
    if (deep) {
      enterFreeRoam();
      if (deep !== biomes.current?.id) triggerMorph(deep, { snap: true });
      return;
    }

    if (!action) {
      hideLoader();
      return;
    }
    action.innerHTML = '';
    const mk = (label: string, primary: boolean, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'start-btn' + (primary ? ' primary' : '');
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    const row = document.createElement('div');
    row.className = 'start-row';
    row.appendChild(
      mk('▶  Guided tour', true, () => {
        audio.unlock();
        hideLoader();
        fadeHint();
        entered = true;
        tour.start(); // setTourActive(true) keeps the floating button hidden
      }),
    );
    row.appendChild(mk('Free roam', false, enterFreeRoam));
    row.appendChild(
      mk('View portfolio', false, () => {
        window.location.href = '/portfolio.html';
      }),
    );
    action.appendChild(row);
  }

  // ---- dev HUD (DEV only; tree-shaken out of production builds) ----
  let stats: Stats | undefined;
  if (import.meta.env.DEV) {
    stats = new Stats();
    stats.showPanel(0);
    // below the floating "View portfolio" button (dev HUD only; not in prod)
    stats.dom.style.cssText = 'position:fixed;top:54px;left:8px;z-index:30;';
    document.body.appendChild(stats.dom);

    const gui = new GUI({ title: 'Settings' });
    const mv = gui.addFolder('Movement');
    mv.add(unit, 'speed', 1, 20, 0.5);
    mv.add(unit, 'turnRate', 1, 12, 0.5);
    const cam = gui.addFolder('Camera');
    cam.add(rig, 'distance', rig.minDistance, rig.maxDistance, 1).listen();
    cam.add(rig, 'elevationDeg', 15, 75, 1);
    cam.add(rig, 'targetHeight', 0, 4, 0.1);
    cam.add(rig, 'followRate', 1, 16, 0.5);
    const fc = gui.addFolder('Focus (read-up)');
    fc.add(focus, 'enabled');
    fc.add(focus, 'outer', 4, 16, 0.5);
    fc.add(focus, 'elevationDeg', 0, 42, 1);
    fc.add(focus, 'focusFov', 20, 50, 1);
    fc.add(focus, 'margin', 1, 1.8, 0.05);
    const wf = gui.addFolder('World (loop)');
    wf.add({ period: WORLD_PERIOD }, 'period', 80, 320, 5).onChange((v: number) => setWorldPeriod(v));
    wf.add(env.fog, 'near', 10, 200, 1);
    wf.add(env.fog, 'far', 30, 320, 1);
    gui.close();
  }

  // mute toggle
  const muteBtn = document.createElement('button');
  muteBtn.textContent = '🔊';
  muteBtn.title = 'Mute / unmute';
  muteBtn.style.cssText =
    'position:fixed;right:calc(16px + env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));' +
    'z-index:30;width:46px;height:46px;border-radius:50%;touch-action:manipulation;' +
    'border:1px solid rgba(255,255,255,.25);background:rgba(20,32,48,.55);backdrop-filter:blur(8px);' +
    '-webkit-backdrop-filter:blur(8px);color:#fff;font-size:19px;cursor:pointer;line-height:1;';
  muteBtn.addEventListener('click', () => {
    muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊';
  });
  document.body.appendChild(muteBtn);

  // ---- run ----
  let firstFrame = true;
  let rendered = false;
  const watchdog = window.setTimeout(() => {
    if (!rendered) {
      showFatal(
        'The 3D world didn’t start',
        'The first frame hasn’t rendered after 8s. Open the console (⌘⌥J) and share any red errors.',
      );
    }
  }, 8000);

  engine.start((dt) => {
    tour.update(dt); // resolve tour steps (may set a new drive target) before the unit moves
    lift.update(dt); // the ski lift owns the car's transform while carrying it
    rig.setChase(null); // free orbit unless keyboard-driving / racing (set below)
    if (!locked && !lift.carrying) {
      // keyboard driving — suppressed while the tour/lift drives, or during a race
      // countdown / drive-off (race.inputLocked)
      const driveAllowed = !tourActive && !liftActive && !race.inputLocked;
      const d = driveAllowed ? readDrive() : { throttle: 0, steer: 0 };
      unit.setDrive(d.throttle, d.steer);
      unit.update(dt);
      // lock the camera behind the car while keyboard-driving or during a race start/finish
      if (d.throttle !== 0 || d.steer !== 0 || race.inputLocked) rig.setChase(unit.object.rotation.y);
      // tour + lift drive morphs explicitly, so suppress the proximity trigger then
      if (!tourActive && !liftActive) {
        if (!race.inputLocked) interaction.update(unit.position, onPadEnter);
        // racetrack boost strips: fling the car along the arrows on entry
        const boosts = biomes.current?.boosts;
        if (boosts && !race.inputLocked) {
          for (const b of boosts) {
            const inside = wrapDistXZ(unit.position.x, unit.position.z, b.position.x, b.position.z) < b.radius;
            if (inside && !b.wasInside) unit.boost(b.strength, b.duration);
            b.wasInside = inside;
          }
        }
        // race flow: staging-pad trigger → countdown → timed lap → confetti + drive-off
        race.update(dt);
      }
    }
    // Seamless toroidal world: draw content at its nearest image to the unit and
    // recentre the ground/sky/sun on the unit, so every direction loops back.
    biomes.wrap(unit.position);
    env.follow(unit.position.x, unit.position.z);
    click.update(dt, unit.hasTarget && !locked);
    // Engage focus only when parked near content; the moment the unit is driving
    // (hasTarget), release so the player sees the world and can steer freely.
    const focusOverride = focus.update(dt, unit.position, !locked && !unit.driving && !liftActive);
    rig.update(dt, unit.position, focusOverride);
    fx.update(dt);
    if (!lift.carrying) tireFX.update(dt, unit); // no tyre dust while airborne on the lift
    dolphins.update(dt, unit.position.x);
    atmosphere.update(dt, unit.position.x, unit.position.z);
    biomes.update(dt, engine.camera, unit.position);
    minimap.update(unit.position, unit.object.rotation.y);

    if (firstFrame) {
      firstFrame = false;
      rendered = true;
      window.clearTimeout(watchdog);
      showStartScreen();
    }
    stats?.update();
  });
}

boot().catch((err) => {
  console.error('[portfolio] startup failed:', err);
  const message = err instanceof Error ? err.message : String(err);
  showFatal('Something went wrong starting the 3D world', message + '\n\nOpen the console (⌘⌥J) for the full stack trace.');
});
