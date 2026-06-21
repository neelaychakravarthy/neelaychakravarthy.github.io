/**
 * MusicEngine — generative ambient-cinematic score, all synthesized (no files).
 *
 * A look-ahead scheduler clocks out a slow chord progression (sustained, evolving
 * pads), a soft sub bass on each chord, and a sparse, gentle lead melody that
 * walks the scale and leans on chord tones — so it always stays consonant. Every
 * voice is sent through a synthesized reverb for cinematic space. Each biome
 * picks a named preset (mood/scale/tempo/timbre); the key + level come from the
 * manifest. Themes crossfade on a morph.
 */

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentaMajor: [0, 2, 4, 7, 9],
} as const;

interface Preset {
  scale: readonly number[];
  /** chord roots as scale degrees (diatonic triads are built from these) */
  progression: number[];
  bpm: number;
  beatsPerChord: number;
  padWave: OscillatorType;
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  /** pad low-pass cutoff (Hz) */
  brightness: number;
  /** 0..1 chance of a melody note per eligible beat */
  melodyDensity: number;
  /** octave offset for the lead above the key root */
  leadOctave: number;
  /** 0..1 reverb send for the lead/pad */
  reverbMix: number;
}

export const MUSIC_PRESETS: Record<string, Preset> = {
  'warm-major': { scale: SCALES.major, progression: [0, 4, 5, 3], bpm: 64, beatsPerChord: 8, padWave: 'triangle', leadWave: 'triangle', bassWave: 'sine', brightness: 1300, melodyDensity: 0.5, leadOctave: 1, reverbMix: 0.5 },
  'dreamy-lydian': { scale: SCALES.lydian, progression: [0, 1, 4, 3], bpm: 60, beatsPerChord: 8, padWave: 'triangle', leadWave: 'sine', bassWave: 'sine', brightness: 1500, melodyDensity: 0.46, leadOctave: 1, reverbMix: 0.58 },
  'cool-minor': { scale: SCALES.minor, progression: [0, 5, 2, 6], bpm: 56, beatsPerChord: 8, padWave: 'sine', leadWave: 'sine', bassWave: 'sine', brightness: 950, melodyDensity: 0.42, leadOctave: 1, reverbMix: 0.62 },
  'curious-major': { scale: SCALES.major, progression: [0, 3, 4, 0], bpm: 70, beatsPerChord: 8, padWave: 'triangle', leadWave: 'triangle', bassWave: 'sine', brightness: 1400, melodyDensity: 0.5, leadOctave: 1, reverbMix: 0.5 },
  'techy-dorian': { scale: SCALES.dorian, progression: [0, 6, 5, 3], bpm: 72, beatsPerChord: 8, padWave: 'sawtooth', leadWave: 'triangle', bassWave: 'triangle', brightness: 1100, melodyDensity: 0.55, leadOctave: 1, reverbMix: 0.5 },
  'minimal-penta': { scale: SCALES.pentaMajor, progression: [0, 3, 2, 0], bpm: 60, beatsPerChord: 8, padWave: 'sine', leadWave: 'sine', bassWave: 'sine', brightness: 1250, melodyDensity: 0.34, leadOctave: 1, reverbMix: 0.6 },
};

/** A short synthesized reverb impulse (decaying noise) — cinematic space. */
function makeReverbIR(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

export class MusicEngine {
  private readonly musicGain: GainNode; // fade envelope (theme crossfade)
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private timer?: number;
  private active = false;
  private preset?: Preset;
  private rootHz = 261.63;
  private level = 0.5;
  private step = 0;
  private nextStepTime = 0;
  private lastDeg = 0;

  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(dest);
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.musicGain);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    const conv = ctx.createConvolver();
    conv.buffer = makeReverbIR(ctx, 3.4, 3.0);
    this.wet.connect(conv);
    conv.connect(this.musicGain);
  }

  /** Switch to a biome's theme, crossfading from any current one. */
  setTheme(presetName: string | undefined, rootHz: number, level: number, fade = 2.2) {
    const p = MUSIC_PRESETS[presetName ?? ''] ?? MUSIC_PRESETS['warm-major'];
    const begin = () => {
      this.preset = p;
      this.rootHz = rootHz;
      this.level = level;
      this.wet.gain.setTargetAtTime(p.reverbMix, this.ctx.currentTime, 0.3);
      this.step = 0;
      this.lastDeg = 0;
      this.nextStepTime = this.ctx.currentTime + 0.12;
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(1, this.ctx.currentTime, fade / 3);
      if (!this.active) {
        this.active = true;
        this.timer = window.setInterval(() => this.scheduler(), 25);
      }
    };
    if (this.preset) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 4);
      window.setTimeout(begin, fade * 1000);
    } else {
      begin();
    }
  }

  private scheduler() {
    const p = this.preset;
    if (!p) return;
    const secPerBeat = 60 / p.bpm;
    const ahead = this.ctx.currentTime + 0.3;
    while (this.nextStepTime < ahead) {
      this.scheduleStep(this.nextStepTime, this.step);
      this.nextStepTime += secPerBeat;
      this.step++;
    }
  }

  private scheduleStep(time: number, step: number) {
    const p = this.preset!;
    const secPerBeat = 60 / p.bpm;
    const chordIndex = Math.floor(step / p.beatsPerChord) % p.progression.length;
    const beatInChord = step % p.beatsPerChord;
    const root = p.progression[chordIndex];
    const chordTones = [root, root + 2, root + 4]; // diatonic triad

    if (beatInChord === 0) {
      const chordDur = p.beatsPerChord * secPerBeat;
      this.playPad(time, chordTones.map((d) => this.degFreq(d, 0)), chordDur);
      this.playBass(time, this.degFreq(root, -1), chordDur);
    }

    // sparse lead on even beats (and reset the contour each phrase so it sings)
    if (step % 16 === 0) this.lastDeg = root;
    if (step % 2 === 0 && Math.random() < p.melodyDensity) {
      const deg = this.pickMelodyDeg(chordTones);
      this.lastDeg = deg;
      const dur = secPerBeat * (1.4 + Math.random() * 1.6);
      this.playLead(time, this.degFreq(deg, p.leadOctave), dur);
    }
  }

  /** Walk the scale from the last note, biased toward the current chord tones. */
  private pickMelodyDeg(chordTones: number[]): number {
    const opts: Array<{ d: number; w: number }> = [];
    for (const o of [this.lastDeg - 2, this.lastDeg - 1, this.lastDeg, this.lastDeg + 1, this.lastDeg + 2]) {
      const isChord = chordTones.some((c) => (((o - c) % 7) + 7) % 7 === 0);
      opts.push({ d: o, w: isChord ? 3 : 1 });
    }
    if (Math.random() < 0.18) opts.push({ d: chordTones[Math.floor(Math.random() * 3)] + 7, w: 2 }); // occasional leap up
    const total = opts.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of opts) {
      r -= x.w;
      if (r <= 0) return Math.max(-3, Math.min(10, x.d));
    }
    return this.lastDeg;
  }

  /** Scale-degree (with octave wrapping) → frequency. */
  private degFreq(deg: number, octaveOffset: number): number {
    const scale = this.preset!.scale;
    const n = scale.length;
    const oct = Math.floor(deg / n) + octaveOffset;
    const idx = ((deg % n) + n) % n;
    return this.rootHz * Math.pow(2, (scale[idx] + oct * 12) / 12);
  }

  // ---- voices ----
  private playPad(time: number, freqs: number[], dur: number) {
    const ctx = this.ctx;
    const p = this.preset!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(p.brightness * 0.7, time);
    filter.frequency.linearRampToValueAtTime(p.brightness, time + dur * 0.6); // slow open
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    const peak = this.level * 0.42;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + dur * 0.4);
    g.gain.setValueAtTime(peak, time + dur * 0.55);
    g.gain.linearRampToValueAtTime(0.0001, time + dur + 0.4);
    filter.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    const voiceG = 0.5 / freqs.length;
    const ogs: GainNode[] = [];
    let last: OscillatorNode | undefined;
    for (const f of freqs) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = p.padWave;
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = voiceG;
        o.connect(og);
        og.connect(filter);
        o.start(time);
        o.stop(time + dur + 0.5);
        ogs.push(og);
        last = o;
      }
    }
    if (last) {
      last.onended = () => {
        for (const og of ogs) og.disconnect();
        filter.disconnect();
        g.disconnect();
      };
    }
  }

  private playBass(time: number, freq: number, dur: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = this.preset!.bassWave;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const peak = this.level * 0.5;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.5);
    g.gain.setValueAtTime(peak, time + dur - 0.6);
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(this.dry);
    o.start(time);
    o.stop(time + dur + 0.1);
    o.onended = () => g.disconnect();
  }

  private playLead(time: number, freq: number, dur: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = this.preset!.leadWave;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const peak = this.level * 0.5;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    o.start(time);
    o.stop(time + dur + 0.05);
    o.onended = () => g.disconnect();
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
    this.active = false;
    this.preset = undefined;
  }
}
