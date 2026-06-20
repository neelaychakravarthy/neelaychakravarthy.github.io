import './style.css';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Engine } from './engine/Engine';
import { CameraRig } from './engine/CameraRig';
import { Unit } from './engine/Unit';
import { ClickToMove } from './engine/ClickToMove';
import { buildTestScene } from './world/TestScene';

function hideLoader() {
  document.getElementById('loader')?.classList.add('hidden');
}

/** Replace the infinite spinner with a readable error panel. */
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

/** Minimal WebGL2 availability probe (matches what three's renderer needs). */
function webgl2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

try {
  if (!webgl2Available()) {
    showFatal(
      'WebGL isn’t available in this browser',
      'This world is rendered with WebGL, which your browser isn’t currently providing.\n\n' +
        '• Chrome → Settings → System → turn on “Use graphics acceleration when available”, then relaunch Chrome.\n' +
        '• Visit chrome://gpu to see if WebGL is blocklisted.\n' +
        '• Disable any extension that might block scripts/canvas for localhost.\n\n' +
        'Then hard-reload (⌘⇧R).',
    );
    throw new Error('WebGL2 unavailable');
  }

  const app = document.getElementById('app');
  if (!app) throw new Error('#app container missing');

  const engine = new Engine(app);
  const { ground } = buildTestScene(engine.scene);

  const unit = new Unit();
  engine.scene.add(unit.object);

  const rig = new CameraRig(engine.camera, engine.renderer.domElement);
  const click = new ClickToMove(
    engine.camera,
    engine.renderer.domElement,
    ground,
    engine.scene,
    (point) => unit.setTarget(point),
  );

  // Free the GL context on navigate-away so repeated reloads don't exhaust Chrome's context pool.
  window.addEventListener('pagehide', () => engine.dispose(), { once: true });

  // ---- dev HUD ----
  const stats = new Stats();
  stats.showPanel(0); // FPS
  stats.dom.style.cssText = 'position:fixed;top:8px;left:8px;z-index:30;';
  document.body.appendChild(stats.dom);

  const gui = new GUI({ title: 'Phase 0 — tuning' });
  const mv = gui.addFolder('Movement');
  mv.add(unit, 'speed', 1, 20, 0.5);
  mv.add(unit, 'turnRate', 1, 12, 0.5);
  mv.add(unit, 'accel', 4, 60, 1);
  const cam = gui.addFolder('Camera');
  cam.add(rig, 'distance', rig.minDistance, rig.maxDistance, 1).listen();
  cam.add(rig, 'elevationDeg', 15, 75, 1);
  cam.add(rig, 'followRate', 1, 16, 0.5);

  // Watchdog: if the first frame never renders, say so instead of spinning forever.
  let rendered = false;
  const watchdog = window.setTimeout(() => {
    if (!rendered) {
      showFatal(
        'The 3D world didn’t start',
        'The first frame hasn’t rendered after 8s. Open the console (⌘⌥J) and share any red errors — that will pinpoint it.',
      );
    }
  }, 8000);

  // ---- run ----
  let firstFrame = true;
  engine.start((dt) => {
    unit.update(dt);
    click.update(dt, unit.hasTarget);
    rig.update(dt, unit.position);

    if (firstFrame) {
      firstFrame = false;
      rendered = true;
      window.clearTimeout(watchdog);
      hideLoader();
      window.setTimeout(() => document.getElementById('hint')?.classList.add('faded'), 6000);
    }

    stats.update();
  });
} catch (err) {
  console.error('[portfolio] startup failed:', err);
  const message = err instanceof Error ? err.message : String(err);
  if (message !== 'WebGL2 unavailable') {
    showFatal(
      'Something went wrong starting the 3D world',
      message + '\n\nOpen the console (⌘⌥J) for the full stack trace.',
    );
  }
}
