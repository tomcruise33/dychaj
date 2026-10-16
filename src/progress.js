// Progress numbers for the home screen (pure, no DOM).
import { computeSlots } from './reminders.js';

const dayStart = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function plannedPerDay(state) {
  const slots = computeSlots(state);
  return {
    spiro: slots.filter((s) => s.spiro).length,
    breath: slots.reduce((n, s) => n + s.exercises.length, 0),
  };
}

export function dayStats(state, date = new Date()) {
  const a = dayStart(date).getTime();
  const b = a + 86400000;
  const entries = state.log.filter((e) => e.ts >= a && e.ts < b);
  const plan = plannedPerDay(state);
  const spiro = entries.filter((e) => e.type === 'spirometer');
  return {
    spiroDone: spiro.length,
    spiroPlanned: plan.spiro,
    breathDone: entries.length - spiro.length,
    breathPlanned: plan.breath,
    bestBall: spiro.reduce((m, e) => Math.max(m, e.maxBall || 0), 0),
  };
}

// Last 7 days, oldest first. pct is 0..1 of the planned spirometer sets
// (or of 1 set when nothing is planned).
export function week(state, today = new Date()) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayStart(today);
    d.setDate(d.getDate() - i);
    const s = dayStats(state, d);
    const target = s.spiroPlanned || 1;
    out.push({ date: d, done: s.spiroDone, breath: s.breathDone, pct: Math.min(1, s.spiroDone / target), isToday: i === 0 });
  }
  return out;
}

export function totals(state) {
  const spiro = state.log.filter((e) => e.type === 'spirometer');
  return {
    spiroSets: spiro.length,
    breaths: spiro.reduce((s, e) => s + (e.reps || 0), 0),
    sessions: state.log.length - spiro.length,
    minutes: Math.round(state.log.reduce((s, e) => s + (e.seconds || 0), 0) / 60),
  };
}
