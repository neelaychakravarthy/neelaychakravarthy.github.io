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
import { Unit } from './engine/Unit';
import { ClickToMove } from './engine/ClickToMove';
import { AssetRegistry } from './engine/AssetRegistry';
import { BiomeManager } from './engine/Biome';
import { TransitionController } from './engine/TransitionController';
import { InteractionManager } from './engine/InteractionManager';
import { loadWorld } from './engine/WorldLoader';
import { AudioManager } from './engine/AudioManager';
import { WORLD_PERIOD, setWorldPeriod, wrapDelta } from './engine/wrap';
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

function isHandheld(): boolean {
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    return coarse && small;
  } catch {
    return false;
  }
}

/** Tiny desktop-only courtesy card for phones/tablets (the world is desktop-only). */
function showMobileCard() {
  hideLoader();
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;display:grid;place-items:center;z-index:100;padding:22px;overflow:auto;' +
    'background:radial-gradient(130% 120% at 50% 0%,#1d2d49 0%,#0c1322 72%);' +
    'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';
  const card = document.createElement('div');
  card.style.cssText =
    'max-width:420px;width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);' +
    'border-radius:18px;padding:30px 26px;color:#eaf1fb;box-shadow:0 18px 60px rgba(0,0,0,.42);text-align:center;';
  card.innerHTML =
    '<div style="font-weight:700;font-size:22px;letter-spacing:.2px;">Neelay Chakravarthy</div>' +
    '<div style="font-size:14px;color:#9fb4d4;margin-top:6px;">AI Engineer · Agentic AI &amp; Full-Stack</div>' +
    '<div style="font-size:13.5px;line-height:1.6;color:#c2d0e6;margin:18px 0 22px;">' +
    'This portfolio is an explorable 3D world, best experienced on a desktop browser. ' +
    'Open it on a computer to drive around and explore my projects.</div>';
  const links: Array<[string, string]> = [
    ['GitHub', 'https://github.com/neelaychakravarthy'],
    ['LinkedIn', 'https://linkedin.com/in/neelay-chakravarthy'],
    ['Email', 'mailto:nkchakra2@gmail.com'],
  ];
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  for (const [label, url] of links) {
    const a = document.createElement('a');
    a.href = url;
    if (!url.startsWith('mailto:')) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.textContent = label;
    a.style.cssText =
      'display:block;padding:12px 14px;border-radius:11px;text-decoration:none;font-weight:600;font-size:15px;' +
      'background:rgba(120,160,230,.18);border:1px solid rgba(150,185,240,.3);color:#eaf1fb;';
    row.appendChild(a);
  }
  card.appendChild(row);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
}

function applySpawn(unit: Unit, spawn?: SpawnConfig) {
  if (!spawn) return;
  unit.object.position.set(...spawn.position);
  unit.object.rotation.y = spawn.rotationY ?? Math.PI;
}

async function boot() {
  if (isHandheld()) {
    showMobileCard();
    return;
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

  const transition = new TransitionController();
  const interaction = new InteractionManager();
  interaction.setBiome(start.pads, unit.position);

  window.addEventListener('pagehide', () => engine.dispose(), { once: true });

  let locked = false;

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
    isLocked: () => locked,
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
        focus.setBiome(to.focusables);
        unit.colliders = to.colliders;
        engine.postfx.setSelection(to.glows);
        locked = false;
      },
    });
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
    'position:fixed;right:16px;bottom:16px;z-index:30;width:42px;height:42px;border-radius:50%;' +
    'border:1px solid rgba(255,255,255,.25);background:rgba(20,32,48,.55);backdrop-filter:blur(8px);' +
    '-webkit-backdrop-filter:blur(8px);color:#fff;font-size:18px;cursor:pointer;line-height:1;';
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
    if (!locked) {
      unit.update(dt);
      interaction.update(unit.position, triggerMorph);
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
    atmosphere.update(dt, unit.position.x, unit.position.z);
    biomes.update(dt, engine.camera, unit.position);

    if (firstFrame) {
      firstFrame = false;
      rendered = true;
      window.clearTimeout(watchdog);
      hideLoader();
      window.setTimeout(() => document.getElementById('hint')?.classList.add('faded'), 6500);
    }
    stats?.update();
  });
}

boot().catch((err) => {
  console.error('[portfolio] startup failed:', err);
  const message = err instanceof Error ? err.message : String(err);
  showFatal('Something went wrong starting the 3D world', message + '\n\nOpen the console (⌘⌥J) for the full stack trace.');
});
