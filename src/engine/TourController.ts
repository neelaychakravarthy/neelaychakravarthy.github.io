import * as THREE from 'three';
import type { Unit } from './Unit';
import type { AudioManager } from './AudioManager';
import type { FocusController } from './FocusController';
import type { CameraRig } from './CameraRig';

/** One edge of the pad graph: a pad in some biome that morphs to `target`. */
export interface PadLink {
  target: string;
  x: number;
  z: number;
}

export interface TourDeps {
  unit: Unit;
  audio: AudioManager;
  focus: FocusController;
  rig: CameraRig;
  /** Trigger a morph to a biome (same fn the pads use). */
  morphTo: (target: string) => void;
  currentBiomeId: () => string | undefined;
  /** A morph is currently animating. */
  isLocked: () => boolean;
  /** The current biome's focusable boards/panels. */
  getFocusables: () => THREE.Object3D[];
  /** The current biome's spawn point (reachable ground to approach from). */
  getSpawn: () => { x: number; z: number };
  /** biome id → pads leading out of it. */
  padGraph: Map<string, PadLink[]>;
  /** Lock/unlock user driving input. */
  setTourActive: (active: boolean) => void;
  onEnd: () => void;
}

/**
 * The narration, in Neelay's voice — a flat, ordered list of biome stops. Adding
 * a new project = adding a `{ id, lines }` entry here; the controller works out
 * how to drive there from the pad graph and which boards to zoom, so the tour
 * extends itself. (The hub easter eggs are deliberately left for free roam.)
 */
const WELCOME = [
  "Hey — welcome in. I'm Neelay.",
  'Let me grab the wheel and show you around the world I built.',
  "Sit back — it's a quick ride.",
];
// Each stop: `lines` play at the biome's boards (1st line → text board, rest →
// the display panel); optional `lead` plays while parked in the biome just
// before this one (used for a transition aside). Reorder freely; navigation
// re-routes itself over the pad graph.
const STOPS: Array<{ id: string; lines: string[]; lead?: string[] }> = [
  {
    id: 'hub',
    lines: [
      "That's me, up on the board.",
      "I'm an AI engineer — I design and ship agentic systems, MCP servers, and the full-stack products around them.",
    ],
  },
  {
    id: 'classroom',
    lines: [
      'Santa Clara, class of 2024.',
      'Computer science with a data-science focus and a math minor. A few favorite projects are just through here.',
    ],
  },
  {
    id: 'churn-ml',
    lines: [
      'From Applied Machine Learning — a telecom churn predictor.',
      "Logistic regression, naïve Bayes, and decision trees, cross-validated with k-fold. The full report's here to dig into.",
    ],
  },
  {
    id: 'tsp-opt',
    lines: [
      'And from Optimization — a traveling-salesman solver.',
      'A hybrid of clustering, ant-colony, and genetic search. Watch the genetic stage settle into a strong local optimum.',
    ],
  },
  {
    id: 'goti',
    lead: [
      'Outside of work, I build constantly — hackathons, side projects, whatever pulls me in.',
      "Let's start with Goti.",
    ],
    lines: [
      'Goti — a crew of AI agents that negotiate deals for you.',
      'Hand it a plain-English goal; eight reasoners run human-approved negotiations across four marketplaces, using leverage from one deal to win the next. Third place at AgentForge.',
      'Snippets are here — then on to the next build.',
    ],
  },
  {
    id: 'sidekick',
    lines: [
      'Sidekick — a group-chat agent for your Telegram and iMessage threads.',
      "An analyzer-to-executor pipeline with per-group memory and debouncing for realistic messaging patterns. Regional finalist at the Global Eazo hackathon — that's the promo video playing.",
    ],
  },
  {
    id: 'chakra',
    lead: [
      'One more.',
      "Let's head into Chakra.",
    ],
    lines: [
      "Chakra began as a bill-of-materials and inventory system for my family's small manufacturing business.",
      'I grew it into a multi-tenant SaaS that models the entire operation as clean, structured data — tenant isolation, a transactional inventory engine, with a consumption engine for operations.',
      'The foundation a manufacturer needs to go AI-native.',
    ],
  },
];
const CLOSING = [
  "And that's the tour.",
  "The rest is yours — there's a pool, a beach, and a mountain still out there to find.",
  'Thanks for riding along.',
];

export class TourController {
  active = false;
  private aborted = false;
  /** Skip just the current stop and jump to the next (reset per stop). */
  private skipStop = false;
  private time = 0;
  private readonly waiters: Array<{ done: () => boolean; resolve: () => void; deadline: number }> = [];

  // caption typewriter
  private readonly caption: HTMLDivElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private full = '';
  private shown = 0;
  private typing = false;
  private readonly CPS = 26;

  private readonly tmp = new THREE.Vector3();

  constructor(private d: TourDeps) {
    this.caption = document.createElement('div');
    this.caption.id = 'tour-caption';
    document.body.appendChild(this.caption);

    this.nextBtn = document.createElement('button');
    this.nextBtn.id = 'tour-next';
    this.nextBtn.textContent = 'Skip section ▸';
    this.nextBtn.addEventListener('click', () => this.skipSection());
    document.body.appendChild(this.nextBtn);

    this.skipBtn = document.createElement('button');
    this.skipBtn.id = 'tour-skip';
    this.skipBtn.textContent = 'Skip tour ✕';
    this.skipBtn.addEventListener('click', () => this.skip());
    document.body.appendChild(this.skipBtn);
  }

  // ---- public ----
  start() {
    if (this.active) return;
    this.active = true;
    this.aborted = false;
    this.skipStop = false;
    this.time = 0;
    this.d.unit.stop(); // drop any free-roam drive target so we don't drift
    this.d.setTourActive(true);
    this.d.rig.enabled = false;
    this.skipBtn.style.display = 'block';
    this.nextBtn.style.display = 'block';
    void this.run();
  }

  /** Abandon the whole tour. */
  skip() {
    if (!this.active) return;
    this.aborted = true;
    this.d.unit.stop();
    this.end();
  }

  /** Skip the current stop and jump to the next one. */
  skipSection() {
    if (!this.active || this.aborted) return;
    this.skipStop = true; // interrupts the current stop's narration/driving
    this.typing = false;
    this.caption.classList.remove('show');
    this.d.unit.stop();
  }

  update(dt: number) {
    if (!this.active) return;
    this.time += dt;
    if (this.typing) {
      const before = Math.min(Math.floor(this.shown), this.full.length);
      this.shown += this.CPS * dt;
      const n = Math.min(Math.floor(this.shown), this.full.length);
      if (n > before) {
        this.caption.textContent = this.full.slice(0, n);
        if (this.full[n - 1] && this.full[n - 1] !== ' ') this.d.audio.typeTick();
      }
      if (n >= this.full.length) this.typing = false;
    }
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (this.aborted || this.skipStop || w.done() || this.time >= w.deadline) {
        this.waiters.splice(i, 1);
        w.resolve();
      }
    }
  }

  dispose() {
    this.caption.remove();
    this.skipBtn.remove();
  }

  // ---- sequence ----
  private async run() {
    await this.sayAll(WELCOME);
    for (let i = 0; i < STOPS.length; i++) {
      if (this.aborted) return;
      this.skipStop = false; // each stop starts fresh; "skip section" jumps here
      // Navigate to every stop including the first — a no-op when already at the
      // hub (fresh start), but drives back when the tour is started mid-roam.
      await this.navigateTo(STOPS[i].id, STOPS[i].lead);
      await this.tourBiome(STOPS[i].lines);
    }
    if (this.aborted) return;
    this.skipStop = false; // let the closing play even if the last stop was skipped
    await this.navigateTo('hub');
    await this.sayAll(CLOSING);
    if (!this.aborted) this.end();
  }

  /** Drive to each board/panel in the current biome, zoom it, narrate. */
  private async tourBiome(lines: string[]) {
    if (this.aborted || this.skipStop) return;
    const all = this.d.getFocusables();
    const boards = all.filter((f) => f.userData.focusOneSided === false);
    const panels = all.filter((f) => f.userData.focusOneSided === true).slice(0, 1);
    const stops = [...boards, ...panels];
    const queue = [...lines];

    if (!stops.length) {
      await this.sayAll(queue);
      return;
    }
    for (let i = 0; i < stops.length; i++) {
      if (this.aborted || this.skipStop) return;
      await this.driveToBoard(stops[i]);
      const last = i === stops.length - 1;
      const chunk = last ? queue.splice(0) : queue.length ? [queue.shift() as string] : [];
      await this.sayAll(chunk);
    }
  }

  /** Approach a board from the spawn side and wait for the focus zoom. */
  private async driveToBoard(obj: THREE.Object3D) {
    obj.getWorldPosition(this.tmp);
    const spawn = this.d.getSpawn();
    const dx = spawn.x - this.tmp.x;
    const dz = spawn.z - this.tmp.z;
    const len = Math.hypot(dx, dz) || 1;
    this.d.unit.setTarget(new THREE.Vector3(this.tmp.x + (dx / len) * 5.4, 0, this.tmp.z + (dz / len) * 5.4));
    await this.until(() => !this.d.unit.hasTarget, 6);
    await this.until(() => this.d.focus.zoomedIn, 2.5);
    await this.delay(0.5);
  }

  /** Drive the pad graph (morphing) from the current biome to `target`. If
   *  `lead` is given, narrate it while parked in the biome just before the
   *  final hop (a transition aside before entering `target`). */
  private async navigateTo(target: string, lead?: string[]) {
    let guard = 0;
    let leadSaid = false;
    while (!this.aborted && !this.skipStop && this.d.currentBiomeId() !== target && guard++ < 8) {
      const cur = this.d.currentBiomeId();
      if (!cur) break;
      const path = bfsPath(this.d.padGraph, cur, target);
      if (!path || path.length < 2) break;
      const next = path[1];
      if (next === target && lead && lead.length && !leadSaid) {
        leadSaid = true;
        await this.sayAll(lead); // parked in the penultimate biome, before the final morph
        if (this.aborted || this.skipStop) return;
      }
      const pad = this.d.padGraph.get(cur)?.find((p) => p.target === next);
      if (!pad) break;
      this.d.unit.setTarget(new THREE.Vector3(pad.x, 0, pad.z));
      // drive onto the pad (interaction is suppressed during the tour), then morph
      await this.until(() => this.nearPad(pad) || !this.d.unit.hasTarget, 6);
      if (!this.d.isLocked()) this.d.morphTo(next);
      await this.until(() => this.d.currentBiomeId() === next && !this.d.isLocked(), 6);
      await this.delay(0.5);
    }
  }

  private nearPad(pad: PadLink): boolean {
    const p = this.d.unit.position;
    return Math.hypot(p.x - pad.x, p.z - pad.z) < 2;
  }

  // ---- caption ----
  private async sayAll(lines: string[]) {
    for (const l of lines) {
      if (this.aborted || this.skipStop) return;
      await this.say(l);
    }
  }

  private async say(line: string) {
    this.caption.textContent = '';
    this.caption.classList.add('show');
    this.full = line;
    this.shown = 0;
    this.typing = true;
    await this.until(() => !this.typing, 12);
    await this.delay(1.2 + line.length * 0.032);
  }

  // ---- async-on-frame helpers ----
  private until(cond: () => boolean, timeoutSec = 30): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push({ done: cond, resolve, deadline: this.time + timeoutSec });
    });
  }
  private delay(sec: number): Promise<void> {
    const t = this.time + sec;
    return this.until(() => this.time >= t, sec + 1);
  }

  private end() {
    if (!this.active) return;
    this.active = false;
    this.typing = false;
    this.waiters.length = 0;
    this.caption.classList.remove('show');
    this.skipBtn.style.display = 'none';
    this.nextBtn.style.display = 'none';
    this.d.unit.stop();
    this.d.setTourActive(false);
    this.d.rig.enabled = true;
    this.d.onEnd();
  }
}

/** Shortest path of biome ids from `start` to `goal` over the pad graph. */
function bfsPath(graph: Map<string, PadLink[]>, start: string, goal: string): string[] | null {
  if (start === goal) return [start];
  const prev = new Map<string, string>();
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const link of graph.get(cur) ?? []) {
      if (seen.has(link.target)) continue;
      seen.add(link.target);
      prev.set(link.target, cur);
      if (link.target === goal) {
        const path = [goal];
        let n = goal;
        while (prev.has(n)) {
          n = prev.get(n) as string;
          path.unshift(n);
        }
        return path;
      }
      queue.push(link.target);
    }
  }
  return null;
}
