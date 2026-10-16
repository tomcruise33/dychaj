// Soft "breath" sound that follows the same envelope as the haptics.
// It is the main non-visual cue on iOS web, where vibration is unavailable.
import { phaseEnvelope } from './haptics/envelope.js';

let ctx = null;
let noiseBuffer = null;
let current = [];

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    // Pink-ish noise (simple 1-pole filtered white noise) sounds more like air.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      d[i] = last * 6;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function stopAudio() {
  for (const n of current) {
    try { n.stop(); } catch { /* already stopped */ }
  }
  current = [];
}

export function playBreathSound(kind, durationMs, volume = 0.6) {
  if (!ctx || volume <= 0 || durationMs < 200) return;
  const now = ctx.currentTime;
  const dur = durationMs / 1000;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  const pts = phaseEnvelope(kind, durationMs, { heartbeat: false });
  const curve = new Float32Array(pts.length);
  const isHold = kind === 'holdIn' || kind === 'holdOut';
  pts.forEach((p, i) => { curve[i] = (isHold ? 0.08 : p.a) * volume * 0.5; });
  curve[curve.length - 1] = 0;
  gain.gain.setValueAtTime(0, now);
  gain.gain.setValueCurveAtTime(curve, now + 0.01, Math.max(0.05, dur - 0.02));

  const f0 = kind.startsWith('inhale') ? 500 : 900;
  const f1 = kind.startsWith('inhale') ? 1400 : 350;
  filter.frequency.setValueAtTime(f0, now);
  filter.frequency.linearRampToValueAtTime(f1, now + dur);

  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + dur + 0.05);
  current.push(src);
  src.onended = () => { current = current.filter((n) => n !== src); };
}

export function chime(freq = 660, volume = 0.4) {
  if (!ctx || volume <= 0) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.25 * volume, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  o.connect(g).connect(ctx.destination);
  o.start(now);
  o.stop(now + 1);
}
