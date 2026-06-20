import type { AmbientConfig } from '../world/types';

/**
 * AudioManager — all sound via the Web Audio API, zero asset files.
 *
 * Ambient: each biome is a synthesized "pad" (a detuned chord through a slowly
 * sweeping low-pass filter) that crossfades on a morph — warm for the market,
 * cool/minor for the comms world, airy for the hub. SFX (move / link / morph)
 * are short synthesized blips and a filtered-noise whoosh.
 *
 * This keeps the experience self-contained and license-free; real licensed
 * tracks can later be played through the same crossfade by swapping Pad for a
 * file-backed source. The context is created lazily on the first user gesture
 * (browsers block audio until then).
 */

interface PadParams {
  root: number;
  chord: number[];
  wave: OscillatorType;
  cutoff: number;
}

class Pad {
  readonly gain: GainNode;
  private readonly nodes: AudioScheduledSourceNode[] = [];
  private readonly cleanup: AudioNode[] = [];

  constructor(ctx: AudioContext, dest: AudioNode, p: PadParams) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(dest);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.cutoff;
    filter.Q.value = 0.7;
    filter.connect(this.gain);
    this.cleanup.push(filter);

    // Slow filter sweep for movement.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = p.cutoff * 0.28;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.nodes.push(lfo);
    this.cleanup.push(lfoGain);

    const voiceGain = 1 / (p.chord.length * 2);
    for (const semi of p.chord) {
      const freq = p.root * Math.pow(2, semi / 12);
      for (const detune of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = p.wave;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = voiceGain;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        this.nodes.push(osc);
        this.cleanup.push(g);
      }
    }
  }

  fade(to: number, seconds: number, ctx: AudioContext) {
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(to, ctx.currentTime, seconds / 3);
  }

  stop() {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    for (const n of this.cleanup) n.disconnect();
    this.gain.disconnect();
  }
}

export class AudioManager {
  muted = false;
  private ctx?: AudioContext;
  private master?: GainNode;
  private pad?: Pad;
  private pending?: AmbientConfig;

  /** Create the context on the first user gesture and start any pending ambient. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    if (this.pending) {
      this.setBiome(this.pending);
      this.pending = undefined;
    }
  }

  setBiome(cfg?: AmbientConfig) {
    if (!this.ctx || !this.master) {
      this.pending = cfg;
      return;
    }
    const params: PadParams = {
      root: cfg?.ambientRoot ?? 220,
      chord: cfg?.ambientChord ?? [0, 7, 12],
      wave: cfg?.ambientWave ?? 'sine',
      cutoff: cfg?.ambientCutoff ?? 800,
    };
    const target = cfg?.ambientGain ?? 0.16;

    const old = this.pad;
    if (old) {
      old.fade(0, 2.2, this.ctx);
      window.setTimeout(() => old.stop(), 2800);
    }
    const pad = new Pad(this.ctx, this.master, params);
    pad.fade(target, 2.2, this.ctx);
    this.pad = pad;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.08);
    }
    return this.muted;
  }

  // ---- SFX ----
  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  move() {
    this.blip(440, 0.11, 'triangle', 0.1, 640);
  }

  link() {
    this.blip(660, 0.16, 'sine', 0.16, 880);
  }

  /** Rising tone + filtered-noise whoosh for the world-morph. */
  morph() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.blip(160, 1.5, 'sawtooth', 0.1, 540);

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.3), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(280, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 1.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 1.3);
  }
}
