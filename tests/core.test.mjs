import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseEnvelope, toAndroidWaveform, toPwmPattern, mergePattern } from '../src/haptics/envelope.js';
import { buildSession, cycleMs, EXERCISES } from '../src/exercises.js';

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { computeSlots, buildIcs, nextSlot, slotId } = await import('../src/reminders.js');
const { DEFAULT_STATE } = await import('../src/store.js');
const { LANGS } = await import('../src/i18n.js');

test('inhale swells, exhale drains', () => {
  const inh = phaseEnvelope('inhale', 4000);
  const exh = phaseEnvelope('exhale', 4000);
  assert.ok(inh.at(-1).a > inh[0].a * 3, 'inhale ends much stronger than it starts');
  assert.ok(exh[0].a > exh.at(-1).a * 5, 'exhale starts much stronger than it ends');
  assert.equal(inh.at(-1).t, 4000);
  for (const p of [...inh, ...exh]) assert.ok(p.a >= 0 && p.a <= 1);
});

test('intensity scales amplitude', () => {
  const full = phaseEnvelope('inhale', 2000, { intensity: 1 });
  const half = phaseEnvelope('inhale', 2000, { intensity: 0.5 });
  assert.ok(Math.abs(half.at(-1).a - full.at(-1).a * 0.5) < 0.02);
});

test('hold has heartbeat pulses unless disabled', () => {
  const beat = phaseEnvelope('holdIn', 3000).map((p) => p.a);
  const flat = phaseEnvelope('holdIn', 3000, { heartbeat: false }).map((p) => p.a);
  assert.ok(Math.max(...beat) - Math.min(...beat) > 0.2);
  assert.equal(Math.max(...flat), Math.min(...flat));
});

test('android waveform covers the whole phase', () => {
  const w = toAndroidWaveform(phaseEnvelope('exhale', 5000));
  assert.equal(w.timings.reduce((a, b) => a + b, 0), 5000);
  assert.equal(w.timings.length, w.amplitudes.length);
  assert.ok(w.amplitudes.every((a) => a >= 0 && a <= 255));
});

test('pwm pattern is valid for navigator.vibrate and has more "on" time during strong parts', () => {
  const p = toPwmPattern(phaseEnvelope('inhale', 4000));
  assert.ok(p.every((x) => Number.isInteger(x) && x >= 0));
  const total = p.reduce((a, b) => a + b, 0);
  assert.ok(total <= 4000 && total > 3500);
  // on-time in first vs last second
  let t = 0; let onFirst = 0; let onLast = 0;
  p.forEach((d, i) => {
    if (i % 2 === 0) {
      const mid = t + d / 2;
      if (mid < 1000) onFirst += d;
      if (mid > 3000) onLast += d;
    }
    t += d;
  });
  assert.ok(onLast > onFirst * 2, `last ${onLast} vs first ${onFirst}`);
});

test('mergePattern collapses zeros', () => {
  assert.deepEqual(mergePattern([10, 0, 20, 30]), [30, 30]);
  assert.deepEqual(mergePattern([0, 50, 0, 30, 10, 0]), [0, 80, 10]);
});

test('coherence is 6 breaths per minute for 5 minutes', () => {
  const cyc = EXERCISES.coherence.cycle(EXERCISES.coherence.defaults);
  assert.equal(60000 / cycleMs(cyc), 6);
  const s = buildSession('coherence', {});
  assert.equal(cycleMs(s), 5 * 60000);
});

test('box 4-4-4-4 phases', () => {
  const s = buildSession('box', { phaseSec: 4, minutes: 4 });
  assert.deepEqual(s.slice(0, 4).map((p) => [p.kind, p.ms]), [['inhale', 4000], ['holdIn', 4000], ['exhale', 4000], ['holdOut', 4000]]);
  assert.equal(s.length % 4, 0);
});

test('spirometer set has N reps with hold', () => {
  const s = buildSession('spirometer', { reps: 10 });
  assert.equal(s.filter((p) => p.kind === 'holdIn').length, 10);
  assert.ok(s.filter((p) => p.kind === 'holdIn').every((p) => p.ms >= 3000));
});

test('default daily plan: spirometer every 15 min 08:00-21:45, exercises merged into those slots', () => {
  const slots = computeSlots(DEFAULT_STATE);
  assert.equal(slots.length, 56);
  assert.ok(slots.every((s) => s.spiro));
  const ex = slots.filter((s) => s.exercises.length);
  assert.equal(ex.length, 9);
  assert.equal(ex.filter((s) => s.exercises.includes('coherence')).length, 3);
  assert.equal(ex.filter((s) => s.exercises.includes('clear')).length, 4);
  assert.equal(slots.find((s) => s.key === 'slot-09:00').route, 'spirometer/coherence');
  assert.equal(DEFAULT_STATE.spiro.reps, 5);
  assert.ok(slots.length <= 64);
  const ids = new Set(slots.map((s) => slotId(s.key)));
  assert.equal(ids.size, slots.length, 'notification ids are unique');
});

test('slots never exceed the iOS 64 pending limit', () => {
  const st = structuredClone(DEFAULT_STATE);
  st.spiro.reminder = { enabled: true, start: '00:00', end: '23:30', everyMin: 15 };
  assert.equal(computeSlots(st).length, 64);
});

test('nextSlot rolls over to tomorrow', () => {
  const late = new Date(2026, 9, 16, 23, 0);
  const n = nextSlot(DEFAULT_STATE, late);
  assert.equal(n.date.getDate(), 17);
  assert.equal(n.hour, 8);
});

test('ics has one daily event with an alarm per slot', () => {
  const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
  const ics = buildIcs(DEFAULT_STATE, t, new Date(2026, 9, 16));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 56);
  assert.equal((ics.match(/RRULE:FREQ=DAILY/g) || []).length, 56);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 56);
  assert.ok(ics.includes('DTSTART:20261016T080000'));
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});

test('every language has every key, and no em dashes', () => {
  const keys = Object.keys(LANGS.en);
  for (const [code, dict] of Object.entries(LANGS)) {
    for (const k of keys) assert.ok(k in dict, `${code} missing ${k}`);
    for (const v of Object.values(dict)) assert.ok(!v.includes('—'), `${code} has em dash: ${v}`);
  }
});

test('progress: today and week stats', async () => {
  const { dayStats, week, totals } = await import('../src/progress.js');
  const st = structuredClone(DEFAULT_STATE);
  const now = new Date(2026, 9, 16, 15, 0);
  const at = (d, h) => new Date(2026, 9, d, h, 0).getTime();
  st.log = [
    { ts: at(16, 8), type: 'spirometer', reps: 10, maxBall: 2, seconds: 200 },
    { ts: at(16, 9), type: 'spirometer', reps: 10, maxBall: 3, seconds: 200 },
    { ts: at(16, 13), type: 'coherence', seconds: 300 },
    { ts: at(15, 10), type: 'spirometer', reps: 8, seconds: 150 },
  ];
  const d = dayStats(st, now);
  assert.deepEqual([d.spiroDone, d.spiroPlanned, d.breathDone, d.breathPlanned, d.bestBall], [2, 56, 1, 9, 3]);
  const w = week(st, now);
  assert.equal(w.length, 7);
  assert.ok(w[6].isToday && w[6].done === 2 && w[5].done === 1 && w[0].done === 0);
  assert.equal(totals(st).breaths, 28);
});

test('clear exercise: breaths, huff and cough each round', () => {
  const s = buildSession('clear', { rounds: 2, breaths: 3 });
  assert.equal(s.filter((p) => p.kind === 'huff').length, 2);
  assert.equal(s.filter((p) => p.kind === 'cough').length, 2);
  assert.equal(s.filter((p) => p.step === 'in').length, 6);
  const huff = phaseEnvelope('huff', 1500);
  assert.ok(huff[0].a > 0.9 && huff.at(-1).a < 0.05);
});

test('older installs get the daily plan once, history kept', async () => {
  const saved = { onboarded: true, spiro: { reps: 10, reminder: { enabled: true, start: '08:00', end: '21:00', everyMin: 60 } }, log: [{ ts: 1, type: 'spirometer' }] };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem() {} };
  const m = await import('../src/store.js?migrate');
  const st = m.getState();
  assert.equal(st.spiro.reps, 5);
  assert.equal(st.spiro.reminder.everyMin, 15);
  assert.equal(st.planVersion, 2);
  assert.equal(st.log.length, 1);
});
