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

/** Scheduler resolution: eighth notes (2 steps per beat). */
const STEPS_PER_BEAT = 2;

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentaMajor: [0, 2, 4, 7, 9],
} as const;

/** Distinct melodic character per biome (rhythm + shape), so they don't blur together. */
type MelodyStyle = 'wander' | 'motif' | 'arp' | 'pairs' | 'run' | 'pulse' | 'forge';

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
  /** the melody's character */
  melodyStyle: MelodyStyle;
  /** 0..1 how busy the melody is */
  melodyDensity: number;
  /** octave offset for the lead above the key root */
  leadOctave: number;
  /** 0..1 reverb send for the lead/pad */
  reverbMix: number;
}

export const MUSIC_PRESETS: Record<string, Preset> = {
  // hub — smooth, flowing major melody
  'warm-major': { scale: SCALES.major, progression: [0, 4, 5, 3], bpm: 74, beatsPerChord: 8, padWave: 'triangle', leadWave: 'triangle', bassWave: 'sine', brightness: 1300, melodyStyle: 'wander', melodyDensity: 0.62, leadOctave: 1, reverbMix: 0.5 },
  'dreamy-lydian': { scale: SCALES.lydian, progression: [0, 1, 4, 3], bpm: 70, beatsPerChord: 8, padWave: 'triangle', leadWave: 'sine', bassWave: 'sine', brightness: 1500, melodyStyle: 'wander', melodyDensity: 0.58, leadOctave: 1, reverbMix: 0.58 },
  // goti — a catchy repeating arpeggio motif
  'curious-major': { scale: SCALES.major, progression: [0, 3, 4, 0], bpm: 80, beatsPerChord: 8, padWave: 'triangle', leadWave: 'triangle', bassWave: 'sine', brightness: 1400, melodyStyle: 'motif', melodyDensity: 0.9, leadOctave: 1, reverbMix: 0.48 },
  // sidekick — dreamy descending arpeggios
  'cool-minor': { scale: SCALES.minor, progression: [0, 5, 2, 6], bpm: 66, beatsPerChord: 8, padWave: 'sine', leadWave: 'sine', bassWave: 'sine', brightness: 950, melodyStyle: 'arp', melodyDensity: 0.78, leadOctave: 1, reverbMix: 0.62 },
  // churn-ml — fast techy scale runs
  'techy-dorian': { scale: SCALES.dorian, progression: [0, 6, 5, 3], bpm: 84, beatsPerChord: 8, padWave: 'sawtooth', leadWave: 'triangle', bassWave: 'triangle', brightness: 1100, melodyStyle: 'run', melodyDensity: 0.5, leadOctave: 1, reverbMix: 0.5 },
  // tsp — minimalist repeated pulses
  'minimal-penta': { scale: SCALES.pentaMajor, progression: [0, 3, 2, 0], bpm: 72, beatsPerChord: 8, padWave: 'sine', leadWave: 'sine', bassWave: 'sine', brightness: 1250, melodyStyle: 'pulse', melodyDensity: 0.7, leadOctave: 1, reverbMix: 0.6 },
  // classroom — gentle call-and-response pairs
  'bell-pairs': { scale: SCALES.major, progression: [0, 5, 3, 4], bpm: 78, beatsPerChord: 8, padWave: 'triangle', leadWave: 'sine', bassWave: 'sine', brightness: 1350, melodyStyle: 'pairs', melodyDensity: 0.8, leadOctave: 1, reverbMix: 0.52 },
  // chakra — a sturdy mixolydian "forge" groove: warm, industrious, building (the flat-7 sets it well apart from goti's major)
  'forge-mixo': { scale: SCALES.mixolydian, progression: [0, 6, 3, 0], bpm: 88, beatsPerChord: 8, padWave: 'triangle', leadWave: 'triangle', bassWave: 'sine', brightness: 1150, melodyStyle: 'forge', melodyDensity: 0.85, leadOctave: 1, reverbMix: 0.5 },
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
    const secPerStep = 60 / p.bpm / STEPS_PER_BEAT; // eighth-note grid
    const ahead = this.ctx.currentTime + 0.3;
    while (this.nextStepTime < ahead) {
      this.scheduleStep(this.nextStepTime, this.step);
      this.nextStepTime += secPerStep;
      this.step++;
    }
  }

  private scheduleStep(time: number, step: number) {
    const p = this.preset!;
    const secPerBeat = 60 / p.bpm;
    const stepsPerChord = p.beatsPerChord * STEPS_PER_BEAT;
    const chordIndex = Math.floor(step / stepsPerChord) % p.progression.length;
    const localStep = step % stepsPerChord; // eighth-step within the chord
    const root = p.progression[chordIndex];
    const chordTones = [root, root + 2, root + 4]; // diatonic triad

    if (localStep === 0) {
      const chordDur = p.beatsPerChord * secPerBeat;
      this.playPad(time, chordTones.map((d) => this.degFreq(d, 0)), chordDur);
      this.playBass(time, this.degFreq(root, -1), chordDur);
    }
    this.melody(time, step, localStep, root, chordTones, secPerBeat);
  }

  // ---- melody styles (each biome sounds clearly different) ----
  private melody(time: number, step: number, localStep: number, root: number, chordTones: number[], spb: number) {
    const p = this.preset!;
    const bar = localStep % 8; // eighth position within a 4/4 bar
    const oct = p.leadOctave;
    const lead = (deg: number, durBeats: number, at = time) => this.playLead(at, this.degFreq(deg, oct), spb * durBeats);

    switch (p.melodyStyle) {
      case 'wander': {
        // smooth stepwise walk, leaning on chord tones; resets each 2 bars
        if (step % 16 === 0) this.lastDeg = root;
        const onBeat = localStep % 2 === 0;
        const prob = onBeat ? p.melodyDensity : p.melodyDensity * 0.4;
        if (Math.random() < prob) {
          const deg = this.pickMelodyDeg(chordTones);
          this.lastDeg = deg;
          lead(deg, 1.2 + Math.random() * 1.1);
        }
        break;
      }
      case 'motif': {
        // a fixed arpeggio figure per bar, transposed to the chord
        const fig = [
          { at: 0, off: 0 },
          { at: 2, off: 2 },
          { at: 3, off: 4 },
          { at: 5, off: 2 },
          { at: 6, off: 0 },
        ];
        for (const f of fig) if (f.at === bar && Math.random() < p.melodyDensity) lead(root + f.off, 0.9);
        break;
      }
      case 'arp': {
        // dreamy descending arpeggio on quarter beats: 5 - 3 - 1 - 3
        const pos = [0, 2, 4, 6];
        const degs = [4, 2, 0, 2];
        const i = pos.indexOf(bar);
        if (i >= 0 && Math.random() < p.melodyDensity) lead(root + degs[i], 1.7);
        break;
      }
      case 'pairs': {
        // gentle two-note call figures (a note + a neighbour an eighth later)
        if (bar === 0 && Math.random() < p.melodyDensity) {
          const base = root + (Math.random() < 0.5 ? 0 : 2);
          lead(base, 0.6);
          lead(base + 1, 0.8, time + spb * 0.5);
        } else if (bar === 4 && Math.random() < p.melodyDensity * 0.85) {
          const base = root + 4;
          lead(base, 0.6);
          lead(base - 1, 0.8, time + spb * 0.5);
        }
        break;
      }
      case 'run': {
        // occasional fast scale runs up or down
        if ((bar === 0 || bar === 4) && Math.random() < p.melodyDensity) {
          const len = 4 + Math.floor(Math.random() * 3);
          const dir = Math.random() < 0.55 ? 1 : -1;
          for (let k = 0; k < len; k++) lead(root + dir * k, 0.5, time + k * spb * 0.5);
        }
        break;
      }
      case 'pulse': {
        // minimalist repeated notes cycling chord tones, on quarter beats
        const cyc = [0, 2, 0, 4];
        if (localStep % 2 === 0 && Math.random() < p.melodyDensity) {
          lead(root + cyc[(localStep / 2) % cyc.length], 0.85);
        }
        break;
      }
      case 'forge': {
        // a smith's rhythm: a firm low strike on the beat, answered by a bright
        // chord-tone "ring" an octave up — sturdy and purposeful, like shaping metal
        if (bar === 0) {
          if (Math.random() < p.melodyDensity) lead(root, 0.9); // strike (root)
          if (Math.random() < p.melodyDensity) lead(root + 4 + 7, 1.2, time + spb * 1.5); // ring (fifth, octave up)
        } else if (bar === 4) {
          if (Math.random() < p.melodyDensity) lead(root + 2, 0.9); // strike (third)
          if (Math.random() < p.melodyDensity * 0.9) lead(root + 7, 1.2, time + spb * 1.5); // ring (octave)
        } else if (bar === 2 || bar === 6) {
          if (Math.random() < p.melodyDensity * 0.45) lead(root + 4, 0.5); // light off-beat tap (fifth)
        }
        break;
      }
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
