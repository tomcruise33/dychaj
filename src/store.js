// Local persistence (localStorage works in browsers and in the Capacitor WebView).
const KEY = 'dychaj.v1';

// Recommended day: spirometer 5 breaths every 15 minutes, airway clearing
// every few hours, cardiac coherence 3x (the "365" rhythm), stress relief in
// the afternoon and before sleep. Every time sits on a quarter hour, so it
// merges with a spirometer reminder instead of adding another notification.
export const DAILY_PLAN = {
  spiro: { reps: 5, reminder: { enabled: true, start: '08:00', end: '21:45', everyMin: 15 } },
  breathReminders: [
    { id: 'p1', exercise: 'clear', time: '08:00', enabled: true },
    { id: 'p2', exercise: 'coherence', time: '09:00', enabled: true },
    { id: 'p3', exercise: 'clear', time: '11:00', enabled: true },
    { id: 'p4', exercise: 'coherence', time: '13:00', enabled: true },
    { id: 'p5', exercise: 'clear', time: '15:00', enabled: true },
    { id: 'p6', exercise: 'sigh', time: '17:00', enabled: true },
    { id: 'p7', exercise: 'clear', time: '19:00', enabled: true },
    { id: 'p8', exercise: 'coherence', time: '20:30', enabled: true },
    { id: 'p9', exercise: 'sigh', time: '21:30', enabled: true },
  ],
};

export function applyDailyPlan(s) {
  s.spiro.reps = DAILY_PLAN.spiro.reps;
  s.spiro.reminder = { ...DAILY_PLAN.spiro.reminder };
  s.breathReminders = DAILY_PLAN.breathReminders.map((b) => ({ ...b }));
  s.planVersion = 2;
}

export const DEFAULT_STATE = {
  lang: null, // null -> detect from device
  onboarded: false,
  haptics: { intensity: 0.85, heartbeat: true },
  sound: { volume: 0.5, chime: true },
  planVersion: 2,
  spiro: {
    reps: 5, inSec: 4, holdSec: 3, outSec: 4, restSec: 6, targetBall: 2,
    reminder: { enabled: true, start: '08:00', end: '21:45', everyMin: 15 },
  },
  exercises: {
    box: { phaseSec: 4, minutes: 4 },
    coherence: { inSec: 5, outSec: 5, minutes: 5 },
    sigh: { inSec: 2.5, topSec: 1, outSec: 6, minutes: 5 },
    clear: { rounds: 2, breaths: 3, inSec: 3, holdSec: 2, outSec: 4 },
  },
  breathReminders: DAILY_PLAN.breathReminders,
  log: [], // { ts, type, reps?, maxBall?, seconds }
};

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const k of Object.keys(over || {})) out[k] = deepMerge(base[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const st = deepMerge(clone(DEFAULT_STATE), saved);
    // Installs from before the daily plan get it once; history is kept.
    if (raw && !(saved.planVersion >= 2)) applyDailyPlan(st);
    return st;
  } catch {
    return clone(DEFAULT_STATE);
  }
}

export function getState() {
  return state;
}

export function update(fn) {
  fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  for (const l of listeners) l(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addLog(entry) {
  update((s) => {
    s.log.push({ ts: Date.now(), ...entry });
    if (s.log.length > 2000) s.log = s.log.slice(-2000);
  });
}

export function todayLog(type) {
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  return state.log.filter((e) => e.ts >= d0.getTime() && (!type || e.type === type));
}

export function streakDays() {
  const days = new Set(state.log.map((e) => new Date(e.ts).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
