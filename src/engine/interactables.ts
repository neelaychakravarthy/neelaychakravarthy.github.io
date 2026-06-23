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
const FONT_REGULAR = '/assets/fonts/inter-500.woff';
const FONT_BOLD = '/assets/fonts/inter-700.woff';

function makeTroika(text: string, size: number, color: THREE.ColorRepresentation, bold = false): Text {
  const t = new Text();
  t.text = text;
  t.fontSize = size;
  t.color = color;
  t.font = bold ? FONT_BOLD : FONT_REGULAR;
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
    case 'board':
      return makeBoard(c);
  }
}

/** A rounded-rectangle plane geometry centred on the origin. */
function roundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s);
}

function panelMat(color: THREE.ColorRepresentation, opacity: number) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/**
 * makeBoard — a consolidated, always-legible info panel: a semi-transparent
 * rounded backing (unlit, so it reads the same in any biome) with a typographic
 * stack (heading / subheading / badge / facts) and an accent bar. Billboards.
 */
function makeBoard(c: ContentConfig): THREE.Object3D {
  const g = new THREE.Group();
  // position.y is the panel's BOTTOM edge and stays FIXED after creation, so the
  // morph (which captures this group's Y at build time) raises/sinks it correctly.
  g.position.set(...c.position);
  if (c.rotationY) g.rotation.y = c.rotationY;

  const W = c.width ?? 7.4;
  const padX = 0.55;
  const padV = 0.5;
  const innerW = W - padX * 2;
  const accent = c.accent ?? '#9fb4ff';
  const lines = c.lines ?? [];

  const headingSize = 0.5;
  const subSize = 0.3;
  const badgeSize = 0.24;
  const lineSize = 0.24;

  interface BoardItem {
    text: string;
    size: number;
    color: THREE.ColorRepresentation;
    bold?: boolean;
    gapAbove: number;
    lineHeight?: number;
  }
  // display order, top -> bottom
  const items: BoardItem[] = [{ text: c.heading ?? '', size: headingSize, color: '#ffffff', bold: true, gapAbove: 0 }];
  if (c.subheading) items.push({ text: c.subheading, size: subSize, color: '#d7e2f0', gapAbove: 0.12 });
  if (c.badge) items.push({ text: c.badge, size: badgeSize, color: accent, gapAbove: 0.12 });
  if (lines.length) items.push({ text: lines.join('\n'), size: lineSize, color: '#ccd7e6', gapAbove: 0.22, lineHeight: 1.55 });

  const finalize = (topY: number) => {
    const H = topY + padV;
    const cy = H / 2;
    const backing = new THREE.Mesh(roundedRect(W, H, 0.42), panelMat('#0b1320', 0.6));
    backing.position.set(0, cy, -0.05);
    backing.renderOrder = -2;
    const border = new THREE.Mesh(roundedRect(W + 0.14, H + 0.14, 0.48), panelMat(accent, 0.3));
    border.position.set(0, cy, -0.07);
    border.renderOrder = -3;
    const bar = new THREE.Mesh(roundedRect(W - 0.6, 0.09, 0.04), panelMat(accent, 0.9));
    bar.position.set(0, H - 0.24, 0.01);
    g.add(backing, border, bar);
  };

  // Lay out bottom-up (body at the bottom, heading at the top), measuring each
  // line so wrapped text never overlaps — the bottom edge stays at the origin.
  const order = items.slice().reverse();
  let y = padV; // local bottom of the next element
  const layoutNext = (i: number) => {
    if (i >= order.length) {
      finalize(y);
      return;
    }
    const it = order[i];
    const t = makeTroika(it.text, it.size, it.color, it.bold);
    t.anchorY = 'bottom';
    t.maxWidth = innerW;
    if (it.lineHeight) t.lineHeight = it.lineHeight;
    t.position.set(0, y, 0.02);
    g.add(t);
    t.sync(() => {
      const bb = (t as unknown as { textRenderInfo?: { blockBounds: number[] } }).textRenderInfo?.blockBounds;
      const h = bb ? bb[3] - bb[1] : it.size * 1.34;
      y += h + it.gapAbove;
      layoutNext(i + 1);
    });
  };
  layoutNext(0);

  g.userData.billboard = true;
  // focusable: the camera frames this when the unit drives up. Boards billboard,
  // so they're two-sided (approach from whichever side the unit is on).
  g.userData.focus = true;
  g.userData.focusFacing = c.rotationY ?? 0;
  g.userData.focusOneSided = false;
  return g;
}

function makeText(c: ContentConfig): THREE.Object3D {
  const defaultColor = c.type === 'title' ? '#16202b' : c.type === 'subtitle' ? '#2f3d4b' : '#3a4654';
  const t = makeTroika(c.text ?? '', c.size ?? 0.4, c.color ?? defaultColor, c.type === 'title');
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
  const url = c.url ?? '';
  const clickable = !!url && url !== '#';

  const stem = shadowMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), std('#2c3a4a'), false);
  stem.position.y = 0.55;

  const chip = shadowMesh(new THREE.BoxGeometry(w, 0.64, 0.1), std('#26323f', { emissive: '#1d3a5c', emissiveIntensity: 0.45, roughness: 0.4 }), false);
  chip.position.y = 1.25;
  chip.userData.url = url;

  const t = makeTroika(label, 0.3, '#eaf2fb');
  t.position.set(0, 1.25, 0.07);
  t.sync();

  // hover bubble — "Click me" for real links, the address for an info chip
  const tip = makeTooltip(c.tooltip ?? (clickable ? 'Click me  ↗' : 'Coming soon'));
  tip.position.set(0, 2.45, 0);
  chip.userData.tooltip3d = tip;

  g.add(stem, chip, t, tip);
  g.userData.billboard = true;
  return g;
}

/** A small speech-bubble tooltip (hidden until hovered). */
function makeTooltip(text: string): THREE.Object3D {
  const g = new THREE.Group();
  g.visible = false;

  const tipMat = () => new THREE.MeshBasicMaterial({ color: '#13233f', transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });

  const t = makeTroika(text, 0.26, '#ffffff');
  t.position.set(0, 0, 0.03);
  t.renderOrder = 11;
  t.sync(() => {
    const bb = (t as unknown as { textRenderInfo?: { blockBounds: number[] } }).textRenderInfo?.blockBounds;
    const w = (bb ? bb[2] - bb[0] : text.length * 0.16) + 0.5;
    const h = (bb ? bb[3] - bb[1] : 0.3) + 0.34;
    const panel = new THREE.Mesh(roundedRect(w, h, 0.14), tipMat());
    panel.renderOrder = 10;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.2, 3), tipMat());
    tail.position.set(0, -h / 2 - 0.06, 0);
    tail.rotation.z = Math.PI;
    tail.renderOrder = 10;
    g.add(panel, tail);
  });
  g.add(t);
  return g;
}

function makePanel(c: ContentConfig, isScreen: boolean): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(c.position[0], 0, c.position[2]);
  if (c.rotationY) g.rotation.y = c.rotationY;
  const cy = c.position[1];

  const FW = 4.5;
  const FH = 2.55;
  const IW = 4.2;
  const IH = 2.3;
  const hasVideo = isScreen && !!c.video;
  const hasImages = !isScreen && !!c.images && c.images.length > 0;

  const frame = shadowMesh(new THREE.BoxGeometry(FW, FH, 0.16), std('#222b3a'));
  frame.position.y = cy;

  const legH = Math.max(0.4, cy - FH / 2);
  const legL = shadowMesh(new THREE.BoxGeometry(0.12, legH, 0.12), std('#222b3a'));
  legL.position.set(-FW / 2 + 0.4, legH / 2, 0);
  const legR = legL.clone();
  legR.position.x = FW / 2 - 0.4;
  g.add(frame, legL, legR);

  if (hasVideo) {
    const video = document.createElement('video');
    video.src = c.video as string;
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    // Kept in the DOM (tiny, invisible) so the browser reliably plays it.
    video.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
    document.body.appendChild(video);
    void video.play().catch(() => {});
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(IW, IH), new THREE.MeshBasicMaterial({ map: tex }));
    inner.position.set(0, cy, 0.09);
    inner.userData.video = video;
    g.add(inner);
  } else if (hasImages) {
    const loader = new THREE.TextureLoader();
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(IW, IH), new THREE.MeshBasicMaterial({ map: null, transparent: true }));
    inner.position.set(0, cy, 0.09);
    // Fit the plane to the first image's aspect (letterbox) so plots/screens aren't stretched.
    const fit = (img: { width: number; height: number }) => {
      const ia = img.width / img.height;
      const fa = IW / IH;
      if (ia > fa) inner.scale.set(1, fa / ia, 1);
      else inner.scale.set(ia / fa, 1, 1);
    };
    const texes = (c.images as string[]).map((src, idx) => {
      const t = loader.load(src, (tex) => {
        if (idx === 0 && tex.image) fit(tex.image as { width: number; height: number });
      });
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    (inner.material as THREE.MeshBasicMaterial).map = texes[0];
    if (texes.length > 1) inner.userData.gallery = { texes, idx: 0, t: 0, phase: 'hold', fadeT: 0 };
    g.add(inner);
  } else {
    // placeholder (awaiting media)
    const innerMat = std(isScreen ? '#10151c' : '#b3bdc9', {
      roughness: isScreen ? 0.4 : 0.9,
      emissive: isScreen ? '#0a1f33' : '#000000',
      emissiveIntensity: isScreen ? 0.3 : 0,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(IW, IH), innerMat);
    inner.position.set(0, cy, 0.09);
    g.add(inner);
    if (isScreen) {
      const play = shadowMesh(new THREE.ConeGeometry(0.3, 0.5, 3), std('#eaf2fb', { emissive: '#cfe3ff', emissiveIntensity: 0.6 }), false);
      play.rotation.z = -Math.PI / 2;
      play.position.set(0, cy, 0.12);
      g.add(play);
    }
    if (c.caption) {
      const cap = makeTroika(c.caption, 0.26, isScreen ? '#cfe0f2' : '#33414f');
      cap.anchorY = 'top';
      cap.position.set(0, cy - FH / 2 - 0.1, 0.1);
      cap.sync();
      g.add(cap);
    }
  }

  // focusable: the camera frames this when the unit drives up. Panels/screens
  // have a real front (the image/video faces +z local), so they're one-sided.
  // Aim at the image centre height (cy), not the bounding box — the box includes
  // the support legs down to the ground, which would drag the look-at too low.
  g.userData.focus = true;
  g.userData.focusFacing = c.rotationY ?? 0;
  g.userData.focusOneSided = true;
  g.userData.focusCenterY = cy;
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

  const label = makeTroika(p.label, 0.42, '#16202b', true);
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
  if (p.lift) g.userData.lift = p.lift;
  return g;
}
