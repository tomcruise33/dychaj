// Exercise definitions. Timings are documented in RESEARCH.md.

export const EXERCISES = {
  box: {
    id: 'box',
    icon: '◻',
    defaults: { phaseSec: 4, minutes: 4 },
    cycle: (o) => [
      { kind: 'inhale', ms: o.phaseSec * 1000 },
      { kind: 'holdIn', ms: o.phaseSec * 1000 },
      { kind: 'exhale', ms: o.phaseSec * 1000 },
      { kind: 'holdOut', ms: o.phaseSec * 1000 },
    ],
  },
  coherence: {
    id: 'coherence',
    icon: '♡',
    // 6 breaths per minute: 5 s in, 5 s out, 5 minutes ("365" method).
    defaults: { inSec: 5, outSec: 5, minutes: 5 },
    cycle: (o) => [
      { kind: 'inhale', ms: o.inSec * 1000 },
      { kind: 'exhale', ms: o.outSec * 1000 },
    ],
  },
  sigh: {
    id: 'sigh',
    icon: '〰',
    // Cyclic physiological sigh: long inhale, short top-up inhale, long exhale.
    defaults: { inSec: 2.5, topSec: 1, outSec: 6, minutes: 5 },
    cycle: (o) => [
      { kind: 'inhale', ms: o.inSec * 1000 },
      { kind: 'inhale2', ms: o.topSec * 1000 },
      { kind: 'exhale', ms: o.outSec * 1000 },
    ],
  },
  clear: {
    id: 'clear',
    // Deep breaths, a huff and a supported cough (Guy's and St Thomas' NHS).
    defaults: { rounds: 2, breaths: 3, inSec: 3, holdSec: 2, outSec: 4 },
    round: (o) => {
      const out = [];
      for (let i = 0; i < o.breaths; i++) {
        out.push({ kind: 'inhale', ms: o.inSec * 1000, step: 'in' });
        out.push({ kind: 'holdIn', ms: o.holdSec * 1000, step: 'hold' });
        out.push({ kind: 'exhale', ms: o.outSec * 1000, step: 'out' });
      }
      out.push({ kind: 'inhale', ms: 2000, step: 'preHuff' });
      out.push({ kind: 'huff', ms: 1500, step: 'huff' });
      out.push({ kind: 'rest', ms: 3000, step: 'rest' });
      out.push({ kind: 'inhale', ms: 2500, step: 'preCough' });
      out.push({ kind: 'cough', ms: 1500, step: 'cough' });
      out.push({ kind: 'rest', ms: 5000, step: 'rest' });
      return out;
    },
  },
  spirometer: {
    id: 'spirometer',
    icon: '⦿',
    // Slow sustained maximal inspiration with hold, 10 reps per set.
    defaults: { reps: 5, prepSec: 3, inSec: 4, holdSec: 3, outSec: 4, restSec: 6, targetBall: 2 },
    rep: (o) => [
      { kind: 'prep', ms: o.prepSec * 1000 },
      { kind: 'inhale', ms: o.inSec * 1000 },
      { kind: 'holdIn', ms: o.holdSec * 1000 },
      { kind: 'exhale', ms: o.outSec * 1000 },
      { kind: 'rest', ms: o.restSec * 1000 },
    ],
  },
};

export function cycleMs(phases) {
  return phases.reduce((s, p) => s + p.ms, 0);
}

// Build the full phase list for a timed exercise. Always ends on a
// complete cycle so the session never cuts a breath in half.
export function buildSession(exId, opts) {
  const ex = EXERCISES[exId];
  const o = { ...ex.defaults, ...opts };
  if (exId === 'clear') {
    const out = [];
    for (let r = 0; r < o.rounds; r++) for (const p of ex.round(o)) out.push({ ...p, rep: r + 1 });
    return out;
  }
  if (exId === 'spirometer') {
    const out = [];
    for (let r = 0; r < o.reps; r++) {
      for (const p of ex.rep(o)) out.push({ ...p, rep: r + 1 });
    }
    return out;
  }
  const cycle = ex.cycle(o);
  const n = Math.max(1, Math.round((o.minutes * 60000) / cycleMs(cycle)));
  const out = [];
  for (let c = 0; c < n; c++) for (const p of cycle) out.push({ ...p, rep: c + 1 });
  return out;
}

export const TRIFLO_BALLS = [
  { n: 1, flow: 600 },
  { n: 2, flow: 900 },
  { n: 3, flow: 1200 },
];
