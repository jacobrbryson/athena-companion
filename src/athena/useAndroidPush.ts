import { useCallback, useEffect, useState } from 'react';
import { androidCall, isAndroidCompanion } from '../native/android';

/**
 * Phone notifications, inside the Android app.
 *
 * The app registers with FCM on every launch — but only if Android lets it
 * show notifications, and on Android 13+ that is OFF until the app asks. The
 * native side has always had an `enableNotifications` bridge method that asks;
 * nothing in the web UI ever called it, so a freshly installed phone could
 * never register and every push to it silently went nowhere. This is the
 * missing caller.
 *
 * `permitted` is the OS answer. The registration with core_api happens in Java
 * right after (PushRegistrar.sync), asynchronously — so "on" here means "the
 * phone may now register", and the test-notification button is the proof.
 */
export type AndroidPushState = 'unavailable' | 'checking' | 'on' | 'off' | 'denied';

export function useAndroidPush() {
  const available = isAndroidCompanion();
  const [state, setState] = useState<AndroidPushState>(available ? 'checking' : 'unavailable');
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(() => {
    if (!available) return;
    androidCall<{ supported: boolean; permitted: boolean }>('notificationStatus')
      .then((r) => setState(r.permitted ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, [available]);

  useEffect(() => {
    check();
    // Back from system settings, where they may have just flipped it.
    window.addEventListener('athena-native-resume', check);
    return () => window.removeEventListener('athena-native-resume', check);
  }, [check]);

  const enable = useCallback(async () => {
    if (!available) return false;
    setError(null);
    try {
      const r = await androidCall<{ permitted: boolean }>('enableNotifications');
      // Asked and refused: Android will not show the prompt again, so the only
      // way back is system settings — say exactly that.
      setState(r.permitted ? 'on' : 'denied');
      return r.permitted;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The phone did not answer.');
      return false;
    }
  }, [available]);

  return { available, state, error, enable, check };
}

/**
 * Reading PulsePoint Respond's notifications on this phone.
 *
 * PulsePoint blocked automated readers from their feed, so their own app is
 * how emergencies still reach Athena. Notification access is granted on
 * Android's settings screen — there is no in-app prompt for it, by design —
 * so this reports the state and opens that screen.
 */
export type PulsePointState = 'unavailable' | 'checking' | 'on' | 'off' | 'app-missing';

export function usePulsePointAlerts() {
  const available = isAndroidCompanion();
  const [state, setState] = useState<PulsePointState>(available ? 'checking' : 'unavailable');

  const check = useCallback(() => {
    if (!available) return;
    androidCall<{ installed: boolean; granted: boolean }>('pulsePointStatus')
      .then((r) => setState(!r.installed ? 'app-missing' : r.granted ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, [available]);

  useEffect(() => {
    check();
    // They grant it in Android settings and come back to the app.
    window.addEventListener('athena-native-resume', check);
    return () => window.removeEventListener('athena-native-resume', check);
  }, [check]);

  const open = useCallback(async () => {
    if (!available) return;
    await androidCall('openNotificationAccess').catch(() => undefined);
  }, [available]);

  /**
   * Reading PulsePoint's notification does not stop Android from sounding and
   * showing it first — only PulsePoint's own channel setting can, and only the
   * person can flip that (no app can silence another app's notifications).
   * This opens that exact settings screen. There is no "is it already silent"
   * to read back, so the button just stays offered.
   */
  const openPulsePointSettings = useCallback(async () => {
    if (!available) return;
    await androidCall('openPulsePointSettings').catch(() => undefined);
  }, [available]);

  return { available, state, open, openPulsePointSettings, check };
}
