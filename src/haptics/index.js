// Haptics backend selection.
// Priority: native LungHaptics plugin (Core Haptics / VibrationEffect)
//           -> Web Vibration API with PWM (Android browsers)
//           -> none (iOS Safari/PWA: Apple does not expose vibration to the web)
import { Capacitor, registerPlugin } from '@capacitor/core';
import { phaseEnvelope, toAndroidWaveform, toPwmPattern } from './envelope.js';

const LungHaptics = registerPlugin('LungHaptics');

let mode = null; // 'native' | 'web' | 'none'
let nativeCaps = null;

export async function detectHaptics() {
  if (mode) return { mode, caps: nativeCaps };
  if (Capacitor.isNativePlatform()) {
    try {
      nativeCaps = await LungHaptics.capabilities();
      mode = nativeCaps?.supported ? 'native' : 'none';
    } catch (e) {
      console.warn('LungHaptics plugin missing, falling back', e);
      mode = 'web';
    }
  } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && !isIOS()) {
    mode = 'web';
  } else {
    mode = 'none';
  }
  return { mode, caps: nativeCaps };
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function playPhase(kind, durationMs, { intensity = 1, heartbeat = true } = {}) {
  await detectHaptics();
  const points = phaseEnvelope(kind, durationMs, { intensity, heartbeat });
  if (mode === 'native') {
    try {
      await LungHaptics.play({
        durationMs,
        points,
        ...(Capacitor.getPlatform() === 'android' ? toAndroidWaveform(points) : {}),
        transient: true,
      });
    } catch (e) {
      console.warn('native haptics failed', e);
    }
    return;
  }
  if (mode === 'web') {
    const p = toPwmPattern(points);
    // Mark the phase start with a crisp tap.
    p.unshift(28, 60);
    try { navigator.vibrate(p); } catch { /* ignore */ }
  }
}

export async function tap(strength = 'medium') {
  await detectHaptics();
  if (mode === 'native') {
    try { await LungHaptics.tap({ strength }); } catch { /* ignore */ }
  } else if (mode === 'web') {
    try { navigator.vibrate(strength === 'heavy' ? [60, 60, 60] : 30); } catch { /* ignore */ }
  }
}

export async function stopHaptics() {
  if (mode === 'native') {
    try { await LungHaptics.stop(); } catch { /* ignore */ }
  } else if (mode === 'web') {
    try { navigator.vibrate(0); } catch { /* ignore */ }
  }
}

export function hapticsMode() {
  return mode;
}
