// Session runner: walks through a phase list, drives haptics, sound and
// a "fill" value (0 = empty lungs, 1 = full) for the animation.
import { playPhase, tap, stopHaptics, keepScreenOn } from './haptics/index.js';
import { unlockAudio, playBreathSound, chime, stopAudio } from './audio.js';

const FILL = {
  prep: (x, from) => from * (1 - x),
  inhale: (x, from) => from + (0.82 - from) * (-(Math.cos(Math.PI * x) - 1) / 2),
  inhale2: (x, from) => from + (1 - from) * x,
  holdIn: (x, from) => from,
  exhale: (x, from) => from * (1 - (1 - Math.pow(1 - x, 2.2))),
  holdOut: (x, from) => from,
  rest: (x, from) => from * (1 - x) + 0.25 * Math.sin(Math.PI * x * 2) ** 2,
};

export class Session {
  constructor(phases, { settings, onPhase, onFrame, onDone }) {
    this.phases = phases;
    this.settings = settings;
    this.onPhase = onPhase;
    this.onFrame = onFrame;
    this.onDone = onDone;
    this.i = -1;
    this.paused = false;
    this.fill = 0;
    this.phaseFrom = 0;
    this.raf = null;
    this.timer = null;
    this.elapsedInPhase = 0;
    this.startedAt = 0;
    this.totalMs = phases.reduce((s, p) => s + p.ms, 0);
    this.doneMs = 0;
  }

  async start() {
    unlockAudio();
    keepScreenOn(true);
    this.next();
    this.loop();
  }

  next() {
    if (this.i >= 0) this.doneMs += this.phases[this.i].ms;
    this.i++;
    if (this.i >= this.phases.length) return this.finish();
    const p = this.phases[this.i];
    this.phaseFrom = this.fill;
    this.elapsedInPhase = 0;
    this.startedAt = performance.now();
    this.cue(p);
    this.onPhase?.(p, this.i);
    this.timer = setTimeout(() => this.next(), p.ms);
  }

  cue(p) {
    const { haptics, sound } = this.settings;
    const kind = p.kind;
    if (kind === 'prep') {
      tap('medium');
    } else if (kind !== 'rest') {
      playPhase(kind, p.ms, { intensity: haptics.intensity, heartbeat: haptics.heartbeat });
      playBreathSound(kind, p.ms, sound.volume);
    }
    if (sound.chime && (kind === 'inhale' || kind === 'exhale' || kind === 'holdIn' || kind === 'holdOut')) {
      const f = { inhale: 523, holdIn: 659, exhale: 440, holdOut: 392 }[kind];
      chime(f, sound.volume * 0.6);
    }
  }

  loop() {
    const step = () => {
      if (!this.paused && this.i >= 0 && this.i < this.phases.length) {
        const p = this.phases[this.i];
        const el = this.elapsedInPhase + (performance.now() - this.startedAt);
        const x = Math.min(1, el / p.ms);
        this.fill = Math.max(0, Math.min(1, FILL[p.kind](x, this.phaseFrom)));
        this.onFrame?.({
          fill: this.fill,
          phase: p,
          x,
          secLeftInPhase: Math.ceil((p.ms - el) / 1000),
          totalLeftMs: this.totalMs - this.doneMs - el,
        });
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    clearTimeout(this.timer);
    this.elapsedInPhase += performance.now() - this.startedAt;
    stopHaptics();
    stopAudio();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    // Restart the current phase from where it stopped.
    const p = this.phases[this.i];
    const left = Math.max(50, p.ms - this.elapsedInPhase);
    this.startedAt = performance.now();
    this.timer = setTimeout(() => this.next(), left);
    if (p.kind !== 'rest' && p.kind !== 'prep') {
      playPhase(p.kind, left, { intensity: this.settings.haptics.intensity, heartbeat: this.settings.haptics.heartbeat });
    }
  }

  stop() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    stopHaptics();
    stopAudio();
    keepScreenOn(false);
  }

  finish() {
    this.stop();
    tap('heavy');
    chime(784, this.settings.sound.volume * 0.6);
    this.onDone?.();
  }
}
