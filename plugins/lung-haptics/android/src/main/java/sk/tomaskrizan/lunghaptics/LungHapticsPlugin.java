package sk.tomaskrizan.lunghaptics;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Lung-like haptics for Android.
 *
 * JS sends a waveform (segment timings in ms + amplitudes 0..255) built from
 * the breathing envelope. On devices with amplitude control the motor follows
 * the envelope smoothly. Older motors without amplitude control get a
 * pulse-width-modulated on/off approximation of the same envelope.
 */
@CapacitorPlugin(name = "LungHaptics")
public class LungHapticsPlugin extends Plugin {

    private static final int TICK_MS = 28;
    private static final int TICK_GAP_MS = 50;
    private static final int PWM_WINDOW_MS = 80;
    private static final int PWM_MIN_ON_MS = 12;

    private Vibrator vibrator;

    @Override
    public void load() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    private boolean hasAmplitude() {
        return vibrator != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && vibrator.hasAmplitudeControl();
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", vibrator != null && vibrator.hasVibrator());
        ret.put("amplitude", hasAmplitude());
        ret.put("platform", "android");
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void play(PluginCall call) {
        if (vibrator == null || !vibrator.hasVibrator()) {
            call.resolve();
            return;
        }
        try {
            long[] timings = toLongArray(call.getArray("timings", new JSArray()));
            int[] amplitudes = toIntArray(call.getArray("amplitudes", new JSArray()));
            boolean transientTick = Boolean.TRUE.equals(call.getBoolean("transient", true));
            if (timings.length == 0 || timings.length != amplitudes.length) {
                call.reject("timings and amplitudes must be non-empty and the same length");
                return;
            }
            vibrator.cancel();
            if (hasAmplitude()) {
                playAmplitude(timings, amplitudes, transientTick);
            } else {
                playPwm(timings, amplitudes, transientTick);
            }
            call.resolve();
        } catch (JSONException e) {
            call.reject("bad waveform: " + e.getMessage());
        }
    }

    private void playAmplitude(long[] timings, int[] amplitudes, boolean tick) {
        int extra = tick ? 2 : 0;
        long[] t = new long[timings.length + extra];
        int[] a = new int[amplitudes.length + extra];
        int k = 0;
        if (tick) {
            t[k] = TICK_MS; a[k++] = 255;
            t[k] = TICK_GAP_MS; a[k++] = 0;
        }
        for (int i = 0; i < timings.length; i++, k++) {
            t[k] = timings[i];
            a[k] = Math.max(0, Math.min(255, amplitudes[i]));
        }
        vibrator.vibrate(VibrationEffect.createWaveform(t, a, -1));
    }

    private void playPwm(long[] timings, int[] amplitudes, boolean tick) {
        long total = 0;
        for (long d : timings) total += d;
        int windows = (int) Math.ceil(total / (double) PWM_WINDOW_MS);
        long[] pattern = new long[2 + windows * 2 + (tick ? 2 : 0)];
        int k = 0;
        pattern[k++] = 0; // initial delay
        if (tick) {
            pattern[k++] = TICK_MS;
            pattern[k++] = TICK_GAP_MS;
        }
        long pos = 0;
        int seg = 0;
        long segEnd = timings[0];
        for (int w = 0; w < windows; w++) {
            long mid = pos + PWM_WINDOW_MS / 2;
            while (seg < timings.length - 1 && mid >= segEnd) {
                seg++;
                segEnd += timings[seg];
            }
            long win = Math.min(PWM_WINDOW_MS, total - pos);
            long on = Math.round(amplitudes[seg] / 255.0 * win);
            if (on < PWM_MIN_ON_MS) on = 0;
            pattern[k++] = on;
            pattern[k++] = win - on;
            pos += win;
        }
        // Android patterns alternate [off, on, off, on, ...] starting with a delay.
        long[] p = new long[k];
        System.arraycopy(pattern, 0, p, 0, k);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(p, -1));
        } else {
            vibrator.vibrate(p, -1);
        }
    }

    @PluginMethod
    public void tap(PluginCall call) {
        if (vibrator == null) {
            call.resolve();
            return;
        }
        String strength = call.getString("strength", "medium");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int effect = "heavy".equals(strength) ? VibrationEffect.EFFECT_HEAVY_CLICK : VibrationEffect.EFFECT_CLICK;
            vibrator.vibrate(VibrationEffect.createPredefined(effect));
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot("heavy".equals(strength) ? 60 : 30, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate("heavy".equals(strength) ? 60 : 30);
        }
        call.resolve();
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void allowSleep(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (vibrator != null) vibrator.cancel();
        call.resolve();
    }

    private static long[] toLongArray(JSONArray arr) throws JSONException {
        long[] out = new long[arr.length()];
        for (int i = 0; i < arr.length(); i++) out[i] = arr.getLong(i);
        return out;
    }

    private static int[] toIntArray(JSONArray arr) throws JSONException {
        int[] out = new int[arr.length()];
        for (int i = 0; i < arr.length(); i++) out[i] = arr.getInt(i);
        return out;
    }
}
