import './style.css';
import { Capacitor } from '@capacitor/core';
import { t, setLang, getLang, detectLang, LANG_NAMES } from './i18n.js';
import { getState, update, addLog, todayLog, streakDays } from './store.js';
import { EXERCISES, buildSession, TRIFLO_BALLS } from './exercises.js';
import { Session } from './session.js';
import { detectHaptics, playPhase, hapticsMode } from './haptics/index.js';
import { unlockAudio, playBreathSound } from './audio.js';
import { ICONS } from './icons.js';
import { lungsSvg, trifloSvg, setLungs, setTriflo } from './visuals.js';
import {
  computeSlots, nextSlot, isNative, notificationPermission, requestNotificationPermission,
  syncNativeReminders, startWebReminderLoop, onNotificationTap, buildIcs,
} from './reminders.js';

const VERSION = '1.0.0';
const app = document.getElementById('app');
let session = null;
let toastTimer = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- boot ----------
setLang(getState().lang || detectLang());
detectHaptics();
onNotificationTap((route) => go(route));
startWebReminderLoop(getState, t, (slot, title, body) => showDueBanner(slot, title, body));
if (!isNative() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.route) go(e.data.route);
  });
}
if (isNative()) {
  // Keep native schedule in sync on every launch (e.g. after language change).
  notificationPermission().then((p) => { if (p === 'granted') syncNativeReminders(getState(), t); });
}
window.addEventListener('hashchange', render);
render();
window.__appStarted = true;

function go(route) {
  location.hash = `#/${route}`;
}

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [view, arg] = h.split('/');
  return { view: view || 'home', arg };
}

// ---------- layout ----------
function render() {
  if (session && !location.hash.includes('session')) {
    session.stop();
    session = null;
  }
  const { view, arg } = route();
  const st = getState();
  let body = '';
  if (view === 'breathe' && arg) return renderSession(arg);
  if (view === 'spirometer') return renderSession('spirometer');
  if (view === 'breathe') body = viewBreathe();
  else if (view === 'plan') body = viewPlan(st);
  else if (view === 'settings') body = viewSettings(st);
  else body = viewHome(st);

  app.innerHTML = `
    <main class="page view-${view}">${body}</main>
    ${tabbar(view)}
    ${!st.onboarded ? onboarding() : ''}
    <div class="toast" id="toast" role="status"></div>`;
  bindCommon();
  if (view === 'plan') bindPlan();
  if (view === 'settings') bindSettings();
  if (view === 'home') hydrateHome();
}

function tabbar(active) {
  const tabs = [
    ['home', t('nav.home'), '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>'],
    ['breathe', t('nav.breathe'), '<path d="M12 4v7M12 11c-2 2-6 3-7 9h6c1-2 1-6 1-9zm0 0c2 2 6 3 7 9h-6c-1-2-1-6-1-9z"/>'],
    ['plan', t('nav.plan'), '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>'],
    ['settings', t('nav.settings'), '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'],
  ];
  return `<nav class="tabbar">${tabs.map(([id, label, icon]) => `
    <a href="#/${id}" class="tab ${active === id ? 'active' : ''}" aria-label="${esc(label)}">
      <svg viewBox="0 0 24 24">${icon}</svg><span>${esc(label)}</span>
    </a>`).join('')}</nav>`;
}

function onboarding() {
  return `
  <div class="overlay onboarding">
    <div class="sheet">
      <div class="onb-lungs">${lungsSvg()}</div>
      <h2>${esc(t('onb.title'))}</h2>
      <p>${esc(t('onb.body'))}</p>
      <div class="lang-pick">${Object.entries(LANG_NAMES).map(([k, n]) =>
        `<button class="chip ${getLang() === k ? 'on' : ''}" data-lang="${k}">${n}</button>`).join('')}</div>
      <p class="fine">${esc(t('set.disclaimer'))}</p>
      <button class="btn primary big" data-action="onboard">${esc(t('onb.start'))}</button>
    </div>
  </div>`;
}

function bindCommon() {
  app.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    update((s) => { s.lang = b.dataset.lang; });
    setLang(b.dataset.lang);
    if (isNative()) syncNativeReminders(getState(), t).catch(() => {});
    render();
  }));
  app.querySelector('[data-action="onboard"]')?.addEventListener('click', async () => {
    unlockAudio();
    update((s) => { s.onboarded = true; });
    await requestNotificationPermission().catch(() => {});
    if (isNative()) await syncNativeReminders(getState(), t).catch(() => {});
    playPhase('inhale', 1500, { intensity: getState().haptics.intensity });
    render();
  });
  app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function showDueBanner(slot, title, body) {
  if (session) return;
  const r = slot.type === 'spirometer' ? 'spirometer' : `breathe/${slot.exercise}`;
  const div = document.createElement('div');
  div.className = 'due-banner';
  div.innerHTML = `<div><strong>${esc(title)}</strong><span>${esc(body)}</span></div><button class="btn primary">${esc(t('session.start'))}</button>`;
  div.querySelector('button').onclick = () => { div.remove(); go(r); };
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 120000);
}

// ---------- home ----------
function greeting() {
  const h = new Date().getHours();
  return h < 11 ? t('home.morning') : h < 18 ? t('home.afternoon') : t('home.evening');
}

function viewHome(st) {
  const spiroToday = todayLog('spirometer').length;
  const spiroPlanned = computeSlots(st).filter((s) => s.type === 'spirometer').length;
  const breathToday = todayLog().filter((e) => e.type !== 'spirometer').length;
  const best = Math.max(0, ...todayLog('spirometer').map((e) => e.maxBall || 0));
  const quick = ['coherence', 'box', 'sigh'];
  return `
  <header class="hero">
    <p class="eyebrow">${esc(t('app.tagline'))}</p>
    <h1>${esc(greeting())}</h1>
  </header>
  <div id="banners"></div>
  <section class="card next" id="next-card"></section>
  <section class="card stats">
    <h3>${esc(t('home.today'))}</h3>
    <div class="stat-row">
      <div class="stat"><b>${spiroToday}${spiroPlanned ? `<small>/${spiroPlanned}</small>` : ''}</b><span>${esc(t('home.spiroSets'))}</span></div>
      <div class="stat"><b>${breathToday}</b><span>${esc(t('home.breathSessions'))}</span></div>
      <div class="stat"><b>${streakDays()}</b><span>${esc(t('home.streak'))}</span></div>
    </div>
    ${spiroPlanned ? `<div class="meter"><i style="width:${Math.min(100, (spiroToday / spiroPlanned) * 100)}%"></i></div>` : ''}
    ${best ? `<p class="fine">${esc(t('spiro.best', { n: best }))}</p>` : ''}
  </section>
  <button class="btn primary big spiro-cta" data-go="spirometer">
    <span class="mini-balls"><i></i><i></i><i></i></span>${esc(t('home.startSpiro'))}
  </button>
  <h3 class="section-title">${esc(t('home.quick'))}</h3>
  <div class="quick">
    ${quick.map((id) => `
      <button class="quick-item q-${id}" data-go="breathe/${id}">
        <span class="q-icon">${ICONS[id]}</span>
        <span class="q-name">${esc(t(`ex.${id}.name`))}</span>
      </button>`).join('')}
  </div>`;
}

async function hydrateHome() {
  const st = getState();
  const card = document.getElementById('next-card');
  const n = nextSlot(st);
  if (card) {
    if (!n) card.innerHTML = `<p class="muted">${esc(t('home.nextNone'))}</p>`;
    else {
      const mins = Math.max(0, Math.round((n.date - new Date()) / 60000));
      const rel = mins < 60 ? t('home.inMin', { n: mins }) : t('home.inHours', { h: Math.floor(mins / 60), m: mins % 60 });
      const name = n.type === 'spirometer' ? t('ex.spirometer.name') : t(`ex.${n.exercise}.name`);
      const r = n.type === 'spirometer' ? 'spirometer' : `breathe/${n.exercise}`;
      card.innerHTML = `
        <div>
          <p class="eyebrow">${esc(t('home.next'))}</p>
          <h2>${String(n.hour).padStart(2, '0')}:${String(n.minute).padStart(2, '0')} <small>${esc(rel)}</small></h2>
          <p>${esc(name)}</p>
        </div>
        <button class="btn round" data-go="${r}" aria-label="${esc(t('session.start'))}">${ICONS.play}</button>`;
      card.querySelector('[data-go]').onclick = () => go(r);
    }
  }
  const banners = document.getElementById('banners');
  const perm = await notificationPermission().catch(() => 'unsupported');
  let html = '';
  if (perm === 'prompt') {
    html += `<div class="banner"><p>${esc(t('home.permBanner'))}</p><button class="btn small" id="perm-btn">${esc(t('home.permBtn'))}</button></div>`;
  }
  if (!isNative() && /Android/i.test(navigator.userAgent)) {
    html += `<div class="banner"><p>${esc(t('home.apkBanner'))}</p><a class="btn small" href="dychaj.apk" download>${ICONS.download} APK</a></div>`;
  }
  if (!isNative()) {
    html += `<div class="banner soft"><p>${esc(t('home.webBanner'))}</p><button class="btn small ghost" data-go="plan">${esc(t('home.webBannerBtn'))}</button></div>`;
  }
  if (banners) {
    banners.innerHTML = html;
    banners.querySelector('#perm-btn')?.addEventListener('click', async () => {
      await requestNotificationPermission();
      if (isNative()) await syncNativeReminders(getState(), t);
      render();
    });
    banners.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  }
}

// ---------- breathe list ----------
function viewBreathe() {
  const st = getState();
  const items = ['spirometer', 'coherence', 'box', 'sigh'];
  return `
  <header class="hero small"><h1>${esc(t('nav.breathe'))}</h1></header>
  <div class="ex-list">
    ${items.map((id) => {
      const r = id === 'spirometer' ? 'spirometer' : `breathe/${id}`;
      const o = id === 'spirometer' ? st.spiro : st.exercises[id];
      const meta = id === 'spirometer'
        ? `${o.reps}× · ${t('spiro.target', { n: o.targetBall })}`
        : id === 'box' ? `${o.phaseSec}-${o.phaseSec}-${o.phaseSec}-${o.phaseSec} · ${t('session.minutes', { n: o.minutes })}`
          : id === 'coherence' ? `${o.inSec}/${o.outSec} s · ${t('session.minutes', { n: o.minutes })}`
            : `${o.inSec}+${o.topSec}/${o.outSec} s · ${t('session.minutes', { n: o.minutes })}`;
      return `
      <button class="ex-card ex-${id}" data-go="${r}">
        <span class="ex-icon">${ICONS[id]}</span>
        <span class="ex-text">
          <strong>${esc(t(`ex.${id}.name`))}</strong>
          <span>${esc(t(`ex.${id}.desc`))}</span>
          <em>${esc(meta)}</em>
        </span>
      </button>`;
    }).join('')}
  </div>`;
}

// ---------- session ----------
function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function renderSession(exId) {
  if (!EXERCISES[exId]) return go('breathe');
  const st = getState();
  const isSpiro = exId === 'spirometer';
  const opts = isSpiro ? st.spiro : st.exercises[exId];
  const phases = buildSession(exId, opts);
  const totalReps = phases[phases.length - 1].rep;
  const target = st.spiro.targetBall;
  const ballsByRep = {};

  app.innerHTML = `
  <main class="page session ${isSpiro ? 'is-spiro' : ''}" data-ex="${exId}">
    <header class="session-head">
      <button class="btn ghost back" data-action="back">‹ ${esc(t('session.back'))}</button>
      <h2>${esc(t(`ex.${exId}.name`))}</h2>
      <span class="counter" id="counter"></span>
    </header>
    <div class="stage">
      <div class="visual" id="visual">
        ${lungsSvg()}
        ${isSpiro ? `<div class="triflo-wrap">${trifloSvg(target)}<p class="target">${esc(t('spiro.target', { n: target }))} ${esc(t('spiro.balls'))}</p></div>` : ''}
      </div>
      <div class="phase-label" id="phase">${esc(t('session.tapToStart'))}</div>
      <div class="phase-count" id="count"></div>
      <p class="hint" id="hint">${esc(isSpiro ? t('ex.spirometer.desc') : t(`ex.${exId}.desc`))}</p>
      <div class="balls-pick" id="balls-pick" hidden>
        <p>${esc(t('spiro.howMany'))}</p>
        <div>${[0, 1, 2, 3].map((n) => `<button class="chip" data-balls="${n}">${n}</button>`).join('')}</div>
      </div>
    </div>
    <div class="progress"><i id="bar"></i></div>
    <footer class="controls">
      <button class="btn primary big" id="main-btn">${esc(t('session.start'))}</button>
      <button class="btn ghost" id="stop-btn" hidden>${esc(t('session.stop'))}</button>
    </footer>
    <p class="fine center">${esc(t('session.dizzy'))}</p>
  </main>
  <div class="toast" id="toast" role="status"></div>`;

  const root = app.querySelector('.session');
  const visual = root.querySelector('#visual');
  const phaseEl = root.querySelector('#phase');
  const countEl = root.querySelector('#count');
  const hintEl = root.querySelector('#hint');
  const counterEl = root.querySelector('#counter');
  const bar = root.querySelector('#bar');
  const mainBtn = root.querySelector('#main-btn');
  const stopBtn = root.querySelector('#stop-btn');
  const pick = root.querySelector('#balls-pick');
  let currentRep = 1;
  const startedAt = Date.now();

  counterEl.textContent = isSpiro ? t('session.rep', { n: 1, total: totalReps }) : t('session.cycle', { n: 1, total: totalReps });

  root.querySelectorAll('[data-balls]').forEach((b) => b.addEventListener('click', () => {
    ballsByRep[currentRep] = Number(b.dataset.balls);
    root.querySelectorAll('[data-balls]').forEach((x) => x.classList.toggle('on', x === b));
  }));

  const finish = (completed) => {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    if (completed || seconds > 30) {
      const vals = Object.values(ballsByRep);
      addLog({
        type: exId,
        seconds,
        reps: completed ? totalReps : currentRep - 1,
        ...(isSpiro ? { maxBall: vals.length ? Math.max(...vals) : null } : {}),
      });
    }
    if (completed) {
      root.insertAdjacentHTML('beforeend', `
        <div class="overlay done"><div class="sheet">
          <div class="done-mark">✓</div>
          <h2>${esc(t('session.doneTitle'))}</h2>
          <p>${esc(t('session.doneBody'))}</p>
          <button class="btn primary big" data-action="home">${esc(t('nav.home'))}</button>
        </div></div>`);
      root.querySelector('[data-action="home"]').onclick = () => go('home');
    }
  };

  session = new Session(phases, {
    settings: st,
    onPhase: (p) => {
      currentRep = p.rep;
      root.dataset.phase = p.kind;
      phaseEl.textContent = t(`phase.${p.kind}`);
      counterEl.textContent = isSpiro ? t('session.rep', { n: p.rep, total: totalReps }) : t('session.cycle', { n: p.rep, total: totalReps });
      if (isSpiro) {
        hintEl.textContent = t(`spiro.hint.${p.kind}`);
        pick.hidden = p.kind !== 'rest';
        if (p.kind === 'rest') root.querySelectorAll('[data-balls]').forEach((x) => x.classList.remove('on'));
      } else {
        hintEl.textContent = '';
      }
    },
    onFrame: ({ fill, secLeftInPhase, totalLeftMs }) => {
      setLungs(visual, fill);
      if (isSpiro) setTriflo(visual, Math.min(1, fill / 0.82), target);
      countEl.textContent = secLeftInPhase > 0 ? String(secLeftInPhase) : '';
      bar.style.width = `${100 - (totalLeftMs / session.totalMs) * 100}%`;
    },
    onDone: () => {
      session = null;
      finish(true);
    },
  });

  mainBtn.onclick = () => {
    if (!session) return;
    if (session.i < 0) {
      session.start();
      mainBtn.textContent = t('session.pause');
      stopBtn.hidden = false;
    } else if (session.paused) {
      session.resume();
      mainBtn.textContent = t('session.pause');
    } else {
      session.pause();
      mainBtn.textContent = t('session.resume');
    }
  };
  stopBtn.onclick = () => {
    if (session) { session.stop(); session = null; }
    finish(false);
    go('home');
  };
  root.querySelector('[data-action="back"]').onclick = () => {
    if (session) { session.stop(); session = null; }
    history.length > 1 ? history.back() : go('home');
  };
}

// ---------- plan ----------
const timeOpts = (sel, stepMin = 30) => {
  let out = '';
  for (let m = 0; m < 24 * 60; m += stepMin) {
    const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    out += `<option ${v === sel ? 'selected' : ''}>${v}</option>`;
  }
  return out;
};

function viewPlan(st) {
  const r = st.spiro.reminder;
  const n = computeSlots(st).length;
  return `
  <header class="hero small"><h1>${esc(t('nav.plan'))}</h1><p class="muted">${esc(t('plan.perDay', { n }))}</p></header>
  <section class="card" id="perm-card"></section>
  <section class="card form">
    <h3><span class="mini-balls"><i></i><i></i><i></i></span> ${esc(t('plan.spiro'))}</h3>
    <label class="switch-row"><span>${esc(t('plan.spiroOn'))}</span><input type="checkbox" id="spiro-on" ${r.enabled ? 'checked' : ''}></label>
    <div class="grid3">
      <label>${esc(t('plan.from'))}<select id="spiro-start">${timeOpts(r.start)}</select></label>
      <label>${esc(t('plan.to'))}<select id="spiro-end">${timeOpts(r.end)}</select></label>
      <label>${esc(t('plan.every'))}<select id="spiro-every">${[30, 60, 90, 120, 180, 240].map((m) =>
        `<option value="${m}" ${m === r.everyMin ? 'selected' : ''}>${m} ${esc(t('plan.min'))}</option>`).join('')}</select></label>
    </div>
  </section>
  <section class="card form">
    <h3>${esc(t('plan.breath'))}</h3>
    <div id="breath-list">
      ${st.breathReminders.map((b) => `
      <div class="rem-row" data-id="${b.id}">
        <input type="checkbox" class="rem-on" ${b.enabled ? 'checked' : ''} aria-label="on">
        <select class="rem-ex">${['coherence', 'box', 'sigh'].map((e) =>
          `<option value="${e}" ${e === b.exercise ? 'selected' : ''}>${esc(t(`ex.${e}.short`))}</option>`).join('')}</select>
        <select class="rem-time" aria-label="time">${timeOpts(b.time, 15)}</select>
        <button class="btn ghost icon rem-del" aria-label="${esc(t('plan.remove'))}">${ICONS.close}</button>
      </div>`).join('')}
    </div>
    <button class="btn ghost with-ico" id="rem-add">${ICONS.plus} ${esc(t('plan.add'))}</button>
  </section>
  <button class="btn primary big" id="plan-save">${esc(t('plan.save'))}</button>
  ${!isNative() ? `
  <section class="card soft">
    <p>${esc(t('plan.webNote'))}</p>
    <button class="btn with-ico" id="ics-btn">${ICONS.calendar} ${esc(t('plan.exportIcs'))}</button>
    <p class="fine">${esc(t('plan.exportIcsDesc'))}</p>
  </section>` : ''}`;
}

function readPlanForm() {
  update((s) => {
    s.spiro.reminder.enabled = document.getElementById('spiro-on').checked;
    s.spiro.reminder.start = document.getElementById('spiro-start').value;
    s.spiro.reminder.end = document.getElementById('spiro-end').value;
    s.spiro.reminder.everyMin = Number(document.getElementById('spiro-every').value);
    s.breathReminders = [...document.querySelectorAll('.rem-row')].map((row) => ({
      id: row.dataset.id,
      enabled: row.querySelector('.rem-on').checked,
      exercise: row.querySelector('.rem-ex').value,
      time: row.querySelector('.rem-time').value || '12:00',
    }));
  });
}

async function renderPermCard() {
  const card = document.getElementById('perm-card');
  if (!card) return;
  const p = await notificationPermission().catch(() => 'unsupported');
  const label = { granted: 'plan.permGranted', denied: 'plan.permDenied', prompt: 'plan.permPrompt', 'prompt-with-rationale': 'plan.permPrompt', unsupported: 'plan.permUnsupported' }[p] || 'plan.permPrompt';
  card.innerHTML = `
    <div class="perm ${p}">
      <div><h3>${esc(t('plan.permTitle'))}</h3><p>${esc(t(label))}</p></div>
      ${p === 'prompt' || p === 'prompt-with-rationale' ? `<button class="btn small" id="perm-req">${esc(t('plan.enable'))}</button>` : ''}
    </div>`;
  card.querySelector('#perm-req')?.addEventListener('click', async () => {
    await requestNotificationPermission();
    renderPermCard();
  });
}

function bindPlan() {
  renderPermCard();
  const list = document.getElementById('breath-list');
  list.addEventListener('click', (e) => {
    const del = e.target.closest('.rem-del');
    if (del) { del.closest('.rem-row').remove(); }
  });
  document.getElementById('rem-add').onclick = () => {
    readPlanForm();
    update((s) => { s.breathReminders.push({ id: `b${Date.now().toString(36)}`, exercise: 'sigh', time: '18:00', enabled: true }); });
    render();
  };
  document.getElementById('plan-save').onclick = async () => {
    readPlanForm();
    if (isNative()) {
      let p = await notificationPermission();
      if (p !== 'granted') p = await requestNotificationPermission();
      if (p === 'granted') {
        const { scheduled } = await syncNativeReminders(getState(), t);
        toast(t('plan.nativeOk', { n: scheduled }));
      } else toast(t('plan.permDenied'));
    } else {
      toast(t('plan.saved'));
    }
    render();
  };
  document.getElementById('ics-btn')?.addEventListener('click', () => {
    readPlanForm();
    const ics = buildIcs(getState(), t);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dychaj-reminders.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
}

// ---------- settings ----------
function num(id, label, val, min, max, step = 1) {
  return `<label class="num"><span>${esc(label)}</span>
    <span class="stepper"><button class="btn icon ghost" data-step="-${step}" data-for="${id}" aria-label="-">${ICONS.minus}</button>
    <input id="${id}" type="number" inputmode="decimal" value="${val}" min="${min}" max="${max}" step="${step}">
    <button class="btn icon ghost" data-step="${step}" data-for="${id}" aria-label="+">${ICONS.plus}</button></span></label>`;
}

function viewSettings(st) {
  const m = hapticsMode() || 'none';
  const e = st.exercises;
  const isIOSWeb = !isNative() && m === 'none';
  return `
  <header class="hero small"><h1>${esc(t('nav.settings'))}</h1></header>
  <section class="card">
    <h3>${esc(t('set.language'))}</h3>
    <div class="lang-pick">${Object.entries(LANG_NAMES).map(([k, n]) =>
      `<button class="chip ${getLang() === k ? 'on' : ''}" data-lang="${k}">${n}</button>`).join('')}</div>
  </section>
  <section class="card form">
    <h3>${esc(t('set.haptics'))}</h3>
    <p class="mode mode-${m}">${esc(t(`set.mode.${m}`))}</p>
    <label class="range"><span>${esc(t('set.intensity'))}</span><input type="range" id="h-int" min="0.2" max="1" step="0.05" value="${st.haptics.intensity}" ${isIOSWeb ? 'disabled' : ''}></label>
    <label class="switch-row"><span>${esc(t('set.heartbeat'))}</span><input type="checkbox" id="h-beat" ${st.haptics.heartbeat ? 'checked' : ''}></label>
    <button class="btn" id="h-test">${esc(t('set.test'))}</button>
  </section>
  <section class="card form">
    <h3>${esc(t('set.sound'))}</h3>
    <label class="range"><span>${esc(t('set.volume'))}</span><input type="range" id="s-vol" min="0" max="1" step="0.05" value="${st.sound.volume}"></label>
    <label class="switch-row"><span>${esc(t('set.chime'))}</span><input type="checkbox" id="s-chime" ${st.sound.chime ? 'checked' : ''}></label>
  </section>
  <section class="card form">
    <h3>${esc(t('set.spiro'))}</h3>
    ${num('sp-reps', t('set.reps'), st.spiro.reps, 1, 30)}
    ${num('sp-in', t('set.inSec'), st.spiro.inSec, 2, 10)}
    ${num('sp-hold', t('set.holdSec'), st.spiro.holdSec, 1, 10)}
    ${num('sp-out', t('set.outSec'), st.spiro.outSec, 2, 10)}
    ${num('sp-rest', t('set.restSec'), st.spiro.restSec, 3, 30)}
    <label class="num"><span>${esc(t('set.targetBall'))}</span>
      <span class="ball-target">${TRIFLO_BALLS.map((b) => `<button class="chip ${st.spiro.targetBall === b.n ? 'on' : ''}" data-target="${b.n}">${b.n}<small>${b.flow}</small></button>`).join('')}</span>
    </label>
  </section>
  <section class="card form">
    <h3>${esc(t('set.box'))}</h3>
    ${num('bx-phase', t('set.phaseSec'), e.box.phaseSec, 2, 10)}
    ${num('bx-min', t('set.minutes'), e.box.minutes, 1, 20)}
    <h3>${esc(t('set.coherence'))}</h3>
    ${num('co-in', t('set.inSec'), e.coherence.inSec, 3, 8, 0.5)}
    ${num('co-out', t('set.outSec'), e.coherence.outSec, 3, 8, 0.5)}
    ${num('co-min', t('set.minutes'), e.coherence.minutes, 1, 20)}
    <h3>${esc(t('set.sigh'))}</h3>
    ${num('si-in', t('set.inSec'), e.sigh.inSec, 1.5, 5, 0.5)}
    ${num('si-top', t('set.topSec'), e.sigh.topSec, 0.5, 2, 0.5)}
    ${num('si-out', t('set.outSec'), e.sigh.outSec, 4, 10, 0.5)}
    ${num('si-min', t('set.minutes'), e.sigh.minutes, 1, 20)}
  </section>
  <section class="card">
    <h3>${esc(t('set.install'))}</h3>
    <p>${esc(t('set.installIos'))}</p>
    <p>${esc(t('set.installAndroid'))}</p>
    ${!isNative() ? `<a class="btn primary" href="dychaj.apk" download>${ICONS.download} Android APK</a>` : ''}
  </section>
  <section class="card soft">
    <p>${esc(t('set.disclaimer'))}</p>
    <button class="btn ghost danger" id="reset">${esc(t('set.reset'))}</button>
    <p class="fine">${esc(t('set.version'))} ${VERSION} · ${esc(Capacitor.getPlatform())}</p>
  </section>`;
}

function bindSettings() {
  const v = (id) => Number(document.getElementById(id).value);
  const clampInput = (el) => {
    const min = Number(el.min);
    const max = Number(el.max);
    let x = Number(el.value);
    if (Number.isNaN(x)) x = min;
    el.value = String(Math.min(max, Math.max(min, x)));
  };
  const save = () => {
    document.querySelectorAll('input[type=number]').forEach(clampInput);
    update((s) => {
      s.haptics.intensity = v('h-int');
      s.haptics.heartbeat = document.getElementById('h-beat').checked;
      s.sound.volume = v('s-vol');
      s.sound.chime = document.getElementById('s-chime').checked;
      Object.assign(s.spiro, { reps: v('sp-reps'), inSec: v('sp-in'), holdSec: v('sp-hold'), outSec: v('sp-out'), restSec: v('sp-rest') });
      Object.assign(s.exercises.box, { phaseSec: v('bx-phase'), minutes: v('bx-min') });
      Object.assign(s.exercises.coherence, { inSec: v('co-in'), outSec: v('co-out'), minutes: v('co-min') });
      Object.assign(s.exercises.sigh, { inSec: v('si-in'), topSec: v('si-top'), outSec: v('si-out'), minutes: v('si-min') });
    });
  };
  app.querySelectorAll('input').forEach((el) => el.addEventListener('change', save));
  app.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.for);
    el.value = String(Math.round((Number(el.value) + Number(b.dataset.step)) * 10) / 10);
    save();
  }));
  app.querySelectorAll('[data-target]').forEach((b) => b.addEventListener('click', () => {
    update((s) => { s.spiro.targetBall = Number(b.dataset.target); });
    app.querySelectorAll('[data-target]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.getElementById('h-test').onclick = async () => {
    unlockAudio();
    save();
    const st = getState();
    const seq = [['inhale', 4000], ['holdIn', 2000], ['exhale', 4000]];
    let delay = 0;
    for (const [k, ms] of seq) {
      setTimeout(() => {
        playPhase(k, ms, { intensity: st.haptics.intensity, heartbeat: st.haptics.heartbeat });
        playBreathSound(k, ms, st.sound.volume);
        toast(t(`phase.${k}`));
      }, delay);
      delay += ms;
    }
  };
  document.getElementById('reset').onclick = () => {
    if (confirm(t('set.resetConfirm'))) {
      update((s) => { s.log = []; });
      render();
    }
  };
}
