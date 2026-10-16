// Lung-simulating haptic envelopes.
//
// Every breathing phase is turned into a list of control points
// { t: ms from phase start, a: amplitude 0..1, s: sharpness 0..1 }.
// The same points drive all three backends:
//   - iOS native (Core Haptics continuous event + intensity/sharpness curves)
//   - Android native (VibrationEffect waveform with per-step amplitude)
//   - Web Vibration API (pulse-width modulation, since it has no amplitude)
//
// Design idea:
//   inhale  : amplitude swells as the lungs fill, with a soft airflow ripple
//   hold-in : lungs full, low steady pressure plus a gentle heartbeat (lub-dub)
//   exhale  : amplitude drains smoothly, ripple fades out
//   hold-out: lungs empty, near silence with one soft pulse per second

export const STEP_MS = 40;

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// Two short bumps that feel like a heartbeat, period ~ 1 s.
function heartbeat(tMs, base, strength) {
  const p = tMs % 1000;
  const bump = (center, width, h) => {
    const d = Math.abs(p - center);
    return d < width ? h * (1 - d / width) : 0;
  };
  return base + strength * (bump(60, 60, 1) + bump(250, 60, 0.6));
}

export function phaseEnvelope(kind, durationMs, opts = {}) {
  const intensity = clamp(opts.intensity ?? 1, 0.1, 1);
  const pulse = opts.heartbeat !== false;
  const n = Math.max(2, Math.round(durationMs / STEP_MS) + 1);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(durationMs, i * STEP_MS);
    const x = durationMs > 0 ? t / durationMs : 1;
    let a = 0;
    let s = 0.3;
    switch (kind) {
      case 'inhale': {
        const swell = 0.12 + 0.78 * easeInOutSine(x);
        const ripple = 1 + 0.14 * Math.sin((2 * Math.PI * t) / 320) * (1 - x * 0.5);
        a = swell * ripple;
        s = 0.18 + 0.35 * x;
        break;
      }
      case 'inhale2': {
        // Second short "top-up" sniff of the physiological sigh.
        a = 0.7 + 0.28 * Math.sin(Math.PI * x);
        s = 0.55;
        break;
      }
      case 'holdIn': {
        a = pulse ? heartbeat(t, 0.16, 0.32) : 0.18;
        s = 0.25;
        break;
      }
      case 'exhale': {
        const drain = 0.05 + 0.72 * (1 - easeOutCubic(x));
        const ripple = 1 + 0.1 * Math.sin((2 * Math.PI * t) / 420) * (1 - x);
        a = drain * ripple;
        s = 0.42 - 0.32 * x;
        break;
      }
      case 'holdOut': {
        a = pulse ? heartbeat(t, 0.0, 0.14) : 0;
        s = 0.12;
        break;
      }
      default:
        a = 0;
    }
    pts.push({ t, a: clamp(a * intensity), s: clamp(s) });
  }
  return pts;
}

// Convert points into an Android-style waveform: parallel arrays of
// segment durations (ms) and amplitudes (0..255).
export function toAndroidWaveform(points) {
  const timings = [];
  const amplitudes = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dt = points[i + 1].t - points[i].t;
    if (dt <= 0) continue;
    timings.push(dt);
    amplitudes.push(Math.round(points[i].a * 255));
  }
  return { timings, amplitudes };
}

// The Web Vibration API is on/off only. Approximate amplitude with
// pulse-width modulation: in each PWM window the motor is on for a share of
// the window proportional to amplitude. Very short pulses do not spin the
// motor up, so anything under MIN_ON is dropped to silence.
export function toPwmPattern(points, { windowMs = 80, minOn = 12 } = {}) {
  if (!points.length) return [];
  const total = points[points.length - 1].t;
  const pattern = [];
  const ampAt = (t) => {
    let i = 0;
    while (i < points.length - 1 && points[i + 1].t <= t) i++;
    return points[i].a;
  };
  for (let w = 0; w < total; w += windowMs) {
    const win = Math.min(windowMs, total - w);
    let on = Math.round(ampAt(w + win / 2) * win);
    if (on < minOn) on = 0;
    const off = win - on;
    pushPair(pattern, on, off);
  }
  return mergePattern(pattern);
}

function pushPair(pattern, on, off) {
  pattern.push(on, off);
}

// navigator.vibrate expects [on, off, on, off, ...]. Merge zero-length
// entries so the array stays short.
export function mergePattern(p) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const isOn = i % 2 === 0;
    const v = p[i];
    const lastIsOn = (out.length - 1) % 2 === 0;
    if (out.length && v === 0) continue;
    if (out.length && lastIsOn === isOn) {
      out[out.length - 1] += v;
    } else if (!out.length && !isOn) {
      out.push(0, v);
    } else {
      out.push(v);
    }
  }
  while (out.length && out[out.length - 1] === 0) out.pop();
  return out;
}
