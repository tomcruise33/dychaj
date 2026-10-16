# Dýchaj · Nefes Al

Reminders and guided sessions for people who use a **three-ball incentive spirometer (Triflo)**, plus **box breathing (4-4-4-4)**, **cardiac coherence (6 breaths/min)** and **stress relief (cyclic sighing)**. While you breathe, the phone vibrates like lungs: it swells on the inhale, holds with a soft heartbeat, and drains on the exhale.

Languages: Slovak, Turkish, English (auto-detected, switchable).

## Get it

| Platform | How | Notifications | Lung vibration |
|---|---|---|---|
| Android app | Download `dychaj.apk` from [Releases → latest](https://github.com/tomcruise33/dychaj/releases/latest), open it, allow install | Yes, scheduled on the phone, works when closed | Full (amplitude waveform) |
| Web / PWA | Open the Vercel URL, "Add to Home Screen" | Only while open, plus calendar export (.ics) | Android browsers: simplified (PWM). iPhone: none (Apple blocks it), sound + animation instead |
| iOS app | Open `ios/App/App.xcodeproj` in Xcode on a Mac, pick your team, Run | Yes | Full (Core Haptics) |

The iOS app needs an Apple developer account to install on a phone; CI only compiles it.

## Features

- Spirometer set: prep, slow inhale, hold, slow exhale, rest. Animated Triflo with 600/900/1200 ml/s chambers, target 1 to 3 balls, log how many balls rose.
- Exercises with adjustable timings; every phase is cued by vibration, a breath sound and an optional chime.
- Reminders: spirometer every N minutes between two times, plus any number of exercise reminders per day.
- Today overview, progress toward the planned sets, day streak.
- Works offline, data stays on the device (localStorage).

## Development

```bash
npm install
npm run dev          # web dev server
npm test             # unit tests (envelopes, schedules, ICS, translations)
npm run build        # web build to dist/
npx cap sync         # copy build into android/ and ios/
npm run icons        # regenerate icons from public/icons/icon.svg
```

Browser smoke test (Playwright): `npx vite preview` then `node tests/e2e.mjs http://localhost:4173/ <screenshot-dir>`.

### Layout

```
src/haptics/envelope.js   lung envelope -> iOS curves / Android waveform / web PWM
src/haptics/index.js      backend selection (native plugin, web vibrate, none)
src/session.js            phase runner (haptics, sound, animation)
src/reminders.js          schedule slots, native local notifications, web loop, ICS
src/exercises.js          exercise definitions
src/i18n.js               sk / tr / en strings
plugins/lung-haptics/     Capacitor plugin (Swift Core Haptics, Java VibrationEffect)
.github/workflows/        web tests, Android APK release, iOS compile check
```

Medical background and platform findings: [RESEARCH.md](RESEARCH.md).

## Disclaimer

This app does not replace medical advice. Set the number of repetitions, the spirometer target and the frequency according to your doctor or physiotherapist. Stop if you feel dizzy.
