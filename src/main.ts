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
import { Minimap } from './engine/Minimap';
import { TourController, type PadLink } from './engine/TourController';
import { Unit } from './engine/Unit';
import { ClickToMove } from './engine/ClickToMove';
import { AssetRegistry } from './engine/AssetRegistry';
import { BiomeManager } from './engine/Biome';
import { TransitionController } from './engine/TransitionController';
import { InteractionManager } from './engine/InteractionManager';
import { loadWorld } from './engine/WorldLoader';
import { AudioManager } from './engine/AudioManager';
import { WORLD_PERIOD, setWorldPeriod, wrapDelta } from './engine/wrap';
import { initQuality, detectMobile } from './engine/quality';
import type { SpawnConfig } from './world/types';

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
  unit.river = start.river;
  engine.postfx.setSelection(start.glows);

  const fx = new MorphFX(
    engine.scene,
    (o) => engine.postfx.addGlow(o),
    (o) => engine.postfx.removeGlow(o),
  );

  const atmosphere = new Atmosphere(engine.scene);
  atmosphere.setBiome(start.config.atmosphere);

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
  minimap.setBiome(start.pads);

  const transition = new TransitionController();
  const interaction = new InteractionManager();
  interaction.setBiome(start.pads, unit.position);

  window.addEventListener('pagehide', () => engine.dispose(), { once: true });

  let locked = false;
  let tourActive = false;

  const audio = new AudioManager();
  audio.setBiome(start.config.audio);
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  const click = new ClickToMove(engine.camera, engine.renderer.domElement, env.ground, engine.scene, {
    onGround: (p) => {
      if (locked) return;
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
    isLocked: () => locked || tourActive,
  });

  function triggerMorph(target: string) {
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
    atmosphere.setBiome(to.config.atmosphere);
    engine.postfx.setSelection([...from.glows, ...to.glows]);
    const spawn = to.config.spawn ?? { position: [0, 0, 11] as const, rotationY: Math.PI };
    transition.morph({
      from,
      to,
      env,
      fromEnv: env.stateFor(from.config.environment),
      toEnv: env.stateFor(to.config.environment),
      unit,
      spawn,
      fx,
      rig,
      onComplete: () => {
        biomes.dispose(from);
        biomes.current = to;
        interaction.setBiome(to.pads, unit.position);
        minimap.setBiome(to.pads);
        focus.setBiome(to.focusables);
        unit.colliders = to.colliders;
        unit.river = to.river;
        dolphins.setRiver(to.river);
        engine.postfx.setSelection(to.glows);
        locked = false;
      },
    });
  }

  // ---- guided tour ----
  const padGraph = new Map<string, PadLink[]>();
  for (const b of world.biomes) {
    padGraph.set(b.id, (b.pads ?? []).map((p) => ({ target: p.target, x: p.position[0], z: p.position[2] })));
  }
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
    },
    onEnd: () => {
      /* tour over → free roam */
    },
  });

  const fadeHint = () => document.getElementById('hint')?.classList.add('faded');
  function showStartScreen() {
    const action = document.getElementById('loader-action');
    const tip = document.getElementById('loader-tip');
    if (tip) tip.textContent = 'an explorable 3D portfolio';
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
        tour.start();
      }),
    );
    row.appendChild(
      mk('Free roam', false, () => {
        audio.unlock();
        hideLoader();
        window.setTimeout(fadeHint, 6500);
      }),
    );
    action.appendChild(row);
  }

  // ---- dev HUD (DEV only; tree-shaken out of production builds) ----
  let stats: Stats | undefined;
  if (import.meta.env.DEV) {
    stats = new Stats();
    stats.showPanel(0);
    stats.dom.style.cssText = 'position:fixed;top:8px;left:8px;z-index:30;';
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
    if (!locked) {
      unit.update(dt);
      if (!tourActive) interaction.update(unit.position, triggerMorph); // tour morphs explicitly
    }
    // Seamless toroidal world: draw content at its nearest image to the unit and
    // recentre the ground/sky/sun on the unit, so every direction loops back.
    biomes.wrap(unit.position);
    env.follow(unit.position.x, unit.position.z);
    click.update(dt, unit.hasTarget && !locked);
    // Engage focus only when parked near content; the moment the unit is driving
    // (hasTarget), release so the player sees the world and can steer freely.
    const focusOverride = focus.update(dt, unit.position, !locked && !unit.hasTarget);
    rig.update(dt, unit.position, focusOverride);
    fx.update(dt);
    tireFX.update(dt, unit);
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
