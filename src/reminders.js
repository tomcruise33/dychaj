// Reminder scheduling.
//   Native (Android/iOS app): daily repeating local notifications, no server.
//   Web/PWA: in-app notifications while the app is open, plus a calendar
//            (.ics) export whose alarms fire reliably on any phone.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// iOS keeps at most 64 pending local notifications per app.
export const IOS_PENDING_LIMIT = 64;

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Returns daily slots: [{ key, type, exercise?, hour, minute }]
export function computeSlots(state) {
  const slots = [];
  const r = state.spiro.reminder;
  if (r.enabled && r.everyMin >= 15) {
    const a = toMin(r.start);
    const b = toMin(r.end);
    for (let m = a; m <= b; m += r.everyMin) {
      slots.push({ key: `spiro-${fmt(m)}`, type: 'spirometer', hour: Math.floor(m / 60), minute: m % 60 });
    }
  }
  for (const br of state.breathReminders) {
    if (!br.enabled) continue;
    const m = toMin(br.time);
    slots.push({ key: `breath-${br.id}`, type: 'breath', exercise: br.exercise, hour: Math.floor(m / 60), minute: m % 60 });
  }
  slots.sort((x, y) => x.hour * 60 + x.minute - (y.hour * 60 + y.minute));
  return slots.slice(0, IOS_PENDING_LIMIT);
}

export function nextSlot(state, now = new Date()) {
  const slots = computeSlots(state);
  if (!slots.length) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = slots.find((s) => s.hour * 60 + s.minute > nowMin);
  const s = today || slots[0];
  const d = new Date(now);
  d.setHours(s.hour, s.minute, 0, 0);
  if (!today) d.setDate(d.getDate() + 1);
  return { ...s, date: d };
}

// Stable numeric id per slot (Android needs a 32-bit int).
export function slotId(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000 + 1;
}

export function isNative() {
  return Capacitor.isNativePlatform();
}

export async function notificationPermission() {
  if (isNative()) {
    const p = await LocalNotifications.checkPermissions();
    return p.display;
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function requestNotificationPermission() {
  if (isNative()) {
    const p = await LocalNotifications.requestPermissions();
    return p.display;
  }
  if (!('Notification' in window)) return 'unsupported';
  const r = await Notification.requestPermission();
  return r === 'default' ? 'prompt' : r;
}

export async function syncNativeReminders(state, t) {
  if (!isNative()) return { scheduled: 0 };
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: 'reminders',
      name: t('notif.channel'),
      importance: 4,
      vibration: true,
      visibility: 1,
    });
  }
  const slots = computeSlots(state);
  const notifications = slots.map((s) => ({
    id: slotId(s.key),
    title: s.type === 'spirometer' ? t('notif.spiroTitle') : t('notif.breathTitle', { name: t(`ex.${s.exercise}.name`) }),
    body: s.type === 'spirometer'
      ? t('notif.spiroBody', { reps: state.spiro.reps })
      : t('notif.breathBody'),
    channelId: 'reminders',
    schedule: { on: { hour: s.hour, minute: s.minute }, allowWhileIdle: true },
    extra: { route: s.type === 'spirometer' ? 'spirometer' : `breathe/${s.exercise}` },
  }));
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  // Report what the OS actually holds, not what we asked for.
  const after = await LocalNotifications.getPending();
  return { scheduled: after.notifications.length };
}

export function onNotificationTap(cb) {
  if (!isNative()) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
    const route = ev?.notification?.extra?.route;
    if (route) cb(route);
  });
}

// ---- Web: fire reminders while the app is open (tab or installed PWA) ----
let webTimer = null;
export function startWebReminderLoop(getState, t, onDue) {
  if (isNative()) return;
  clearInterval(webTimer);
  let lastFired = '';
  webTimer = setInterval(async () => {
    const now = new Date();
    const key = `${now.getHours()}:${now.getMinutes()}`;
    if (key === lastFired) return;
    const slot = computeSlots(getState()).find((s) => s.hour === now.getHours() && s.minute === now.getMinutes());
    if (!slot) return;
    lastFired = key;
    const title = slot.type === 'spirometer' ? t('notif.spiroTitle') : t('notif.breathTitle', { name: t(`ex.${slot.exercise}.name`) });
    const body = slot.type === 'spirometer' ? t('notif.spiroBody', { reps: getState().spiro.reps }) : t('notif.breathBody');
    onDue(slot, title, body);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const data = { route: slot.type === 'spirometer' ? 'spirometer' : `breathe/${slot.exercise}` };
        if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: slot.key, data, vibrate: [200, 100, 200] });
        else new Notification(title, { body });
      } catch { /* ignore */ }
    }
  }, 15000);
}

// ---- Calendar export ----
const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

function foldLine(line) {
  // RFC 5545: lines longer than 75 octets are folded with CRLF + space.
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(state, t, start = new Date()) {
  const slots = computeSlots(state);
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dychaj//Breathing reminders//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(t('app.name'))}`,
  ];
  for (const s of slots) {
    const title = s.type === 'spirometer' ? t('notif.spiroTitle') : t('notif.breathTitle', { name: t(`ex.${s.exercise}.name`) });
    const body = s.type === 'spirometer' ? t('notif.spiroBody', { reps: state.spiro.reps }) : t('notif.breathBody');
    const dur = s.type === 'spirometer' ? 'PT5M' : 'PT10M';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.key}@dychaj.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${day}T${pad(s.hour)}${pad(s.minute)}00`,
      `DURATION:${dur}`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape(body)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
