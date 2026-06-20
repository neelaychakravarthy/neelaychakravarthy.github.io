import './style.css';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Engine } from './engine/Engine';
import { CameraRig } from './engine/CameraRig';
import { Unit } from './engine/Unit';
import { ClickToMove } from './engine/ClickToMove';
import { buildTestScene } from './world/TestScene';

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

// ---- run ----
let firstFrame = true;
engine.start((dt) => {
  unit.update(dt);
  click.update(dt, unit.hasTarget);
  rig.update(dt, unit.position);

  if (firstFrame) {
    firstFrame = false;
    document.getElementById('loader')?.classList.add('hidden');
    // Fade the control hint after a few seconds.
    window.setTimeout(() => document.getElementById('hint')?.classList.add('faded'), 6000);
  }

  stats.update();
});
