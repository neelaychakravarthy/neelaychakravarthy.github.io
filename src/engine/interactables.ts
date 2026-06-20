import * as THREE from 'three';
import { Text } from 'troika-three-text';
import type { ContentConfig, PadConfig } from '../world/types';

/**
 * Builders for the fully-in-world info layer: 3D text, clickable link chips,
 * image/video panel placeholders, and project pads. Each tags userData so the
 * biome builder can collect clickables / billboards / pads generically.
 *
 * userData flags used downstream:
 *   billboard  → face the camera (yaw only) each frame
 *   troika     → dispose() the troika Text on teardown
 *   url        → clickable link (opens in a new tab)
 *   padTarget  → pad that morphs to a biome on proximity
 *   spinSpeed  → slow idle spin (set on registry prefabs, handled the same way)
 */

function std(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.04, ...opts });
}
function shadowMesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  return m;
}
function makeTroika(text: string, size: number, color: THREE.ColorRepresentation): Text {
  const t = new Text();
  t.text = text;
  t.fontSize = size;
  t.color = color;
  t.anchorX = 'center';
  t.anchorY = 'middle';
  t.textAlign = 'center';
  t.userData.troika = true;
  return t;
}

export function makeContent(c: ContentConfig): THREE.Object3D {
  switch (c.type) {
    case 'title':
    case 'subtitle':
    case 'fact':
      return makeText(c);
    case 'link':
      return makeLink(c);
    case 'panel':
      return makePanel(c, false);
    case 'screen':
      return makePanel(c, true);
  }
}

function makeText(c: ContentConfig): THREE.Object3D {
  const defaultColor = c.type === 'title' ? '#16202b' : c.type === 'subtitle' ? '#2f3d4b' : '#3a4654';
  const t = makeTroika(c.text ?? '', c.size ?? 0.4, c.color ?? defaultColor);
  t.maxWidth = c.type === 'title' ? 18 : 13;
  t.outlineWidth = '5%';
  t.outlineColor = '#ffffff';
  t.outlineOpacity = 0.4;
  t.position.set(...c.position);
  if (c.rotationY) t.rotation.y = c.rotationY;
  t.userData.billboard = true;
  t.sync();
  return t;
}

function makeLink(c: ContentConfig): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(c.position[0], 0, c.position[2]);
  const label = c.label ?? 'link';
  const w = Math.max(1.3, label.length * 0.2 + 0.7);

  const stem = shadowMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), std('#2c3a4a'), false);
  stem.position.y = 0.55;

  const chip = shadowMesh(new THREE.BoxGeometry(w, 0.64, 0.1), std('#26323f', { emissive: '#1d3a5c', emissiveIntensity: 0.45, roughness: 0.4 }), false);
  chip.position.y = 1.25;
  chip.userData.url = c.url ?? '';

  const t = makeTroika(label, 0.3, '#eaf2fb');
  t.position.set(0, 1.25, 0.07);
  t.sync();

  g.add(stem, chip, t);
  g.userData.billboard = true;
  return g;
}

function makePanel(c: ContentConfig, isScreen: boolean): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(c.position[0], 0, c.position[2]);
  if (c.rotationY) g.rotation.y = c.rotationY;
  const cy = c.position[1];

  const frame = shadowMesh(new THREE.BoxGeometry(3.5, 2.3, 0.16), std('#39414f'));
  frame.position.y = cy;

  const innerMat = std(isScreen ? '#10151c' : '#b3bdc9', {
    roughness: isScreen ? 0.4 : 0.9,
    emissive: isScreen ? '#0a1f33' : '#000000',
    emissiveIntensity: isScreen ? 0.3 : 0,
    side: THREE.DoubleSide,
  });
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.9), innerMat);
  inner.position.set(0, cy, 0.09);
  inner.userData[isScreen ? 'screenSlot' : 'panelSlot'] = true;

  const legH = Math.max(0.4, cy - 1.15);
  const legL = shadowMesh(new THREE.BoxGeometry(0.12, legH, 0.12), std('#39414f'));
  legL.position.set(-1.3, legH / 2, 0);
  const legR = legL.clone();
  legR.position.x = 1.3;

  g.add(frame, inner, legL, legR);

  if (isScreen) {
    const play = shadowMesh(new THREE.ConeGeometry(0.3, 0.5, 3), std('#eaf2fb', { emissive: '#cfe3ff', emissiveIntensity: 0.6 }), false);
    play.rotation.z = -Math.PI / 2;
    play.position.set(0, cy, 0.12);
    g.add(play);
  }

  const cap = makeTroika(c.caption ?? '', 0.26, isScreen ? '#cfe0f2' : '#33414f');
  cap.anchorY = 'top';
  cap.position.set(0, cy - 1.25, 0.1);
  cap.sync();
  g.add(cap);

  return g;
}

export function makePad(p: PadConfig): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(p.position[0], 0, p.position[2]);
  const r = p.radius ?? 2.0;
  const color = p.color ?? '#ffcf6b';

  const glowMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    roughness: 0.4,
    transparent: true,
    opacity: 0.85,
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.06, 40), glowMat);
  disc.position.y = 0.05;

  const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.08, 10, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;

  const label = makeTroika(p.label, 0.42, '#16202b');
  label.position.set(0, 1.6, 0);
  label.outlineWidth = '6%';
  label.outlineColor = color;
  label.outlineOpacity = 0.5;
  label.userData.billboard = true;
  label.sync();

  g.add(disc, ring, label);
  g.userData.padTarget = p.target;
  g.userData.padRadius = r;
  g.userData.glowMat = glowMat;
  return g;
}
