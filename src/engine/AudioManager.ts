import type { AmbientConfig } from '../world/types';
import { MusicEngine } from './MusicEngine';

/**
 * AudioManager — all sound via the Web Audio API, zero asset files.
 *
 * Ambient: a generative ambient-cinematic score (see MusicEngine) — evolving
 * pads, a soft sub bass, and a sparse melody, per-biome by preset, crossfaded on
 * a morph. SFX (move / link / morph) are short synthesized blips + a whoosh.
 * The context is created lazily on the first user gesture (browsers block audio
 * until then).
 */
export class AudioManager {
  muted = false;
  private ctx?: AudioContext;
  private master?: GainNode;
  private music?: MusicEngine;
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
    this.music = new MusicEngine(this.ctx, this.master);
    if (this.pending) {
      this.setBiome(this.pending);
      this.pending = undefined;
    }
  }

  setBiome(cfg?: AmbientConfig) {
    if (!this.ctx || !this.music) {
      this.pending = cfg;
      return;
    }
    this.music.setTheme(cfg?.music, cfg?.ambientRoot ?? 261.63, cfg?.ambientGain ?? 0.45);
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
    osc.onended = () => g.disconnect();
  }

  move() {
    this.blip(440, 0.11, 'triangle', 0.07, 640);
  }

  link() {
    this.blip(660, 0.16, 'sine', 0.12, 880);
  }

  /** A soft per-character tick for the guided-tour caption typewriter. */
  typeTick() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1500 + Math.random() * 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.06);
    o.onended = () => g.disconnect();
  }

  /** Rising tone + filtered-noise whoosh for the world-morph. */
  morph() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.blip(160, 1.5, 'sawtooth', 0.08, 540);

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
    g.gain.linearRampToValueAtTime(0.09, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 1.3);
    src.onended = () => {
      bp.disconnect();
      g.disconnect();
    };
  }
}
