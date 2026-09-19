/**
 * Notifications in this browser.
 *
 * The phone half of push has a device token in Android Keystore to
 * authenticate with. A browser has nowhere comparable to put one, so it never
 * gets one: the subscription is registered over the session this page already
 * holds, and the server owns the row (core_api services/push.registerBrowser).
 *
 * What is kept locally is `browser_id` — an opaque name for "this browser's
 * row", not a credential. Everything is scoped to the profile the session
 * proved, so the worst a stolen or guessed id can do is overwrite the
 * thief's own subscription.
 *
 * ## Why the subscription is re-sent on every enable
 *
 * A browser silently replaces a PushSubscription when its service worker
 * updates, when site data is cleared, and on its own schedule. A registration
 * stored once and never refreshed is the classic web-push bug: it works for a
 * week and then stops, with nothing anywhere saying why.
 */
import { useCallback, useEffect, useState } from 'react';
import { initiativeApi } from '../api/companion';

const BROWSER_ID_KEY = 'athena.browser-id';
const SW_PATH = '/athena-sw.js';

export type WebPushState =
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'off'
  | 'on'
  | 'working';

export interface WebPush {
  state: WebPushState;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

const supported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

/** Stable per browser profile. Created on first use, never sent anywhere else. */
function browserId(): string {
  try {
    const existing = localStorage.getItem(BROWSER_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_KEY, created);
    return created;
  } catch {
    // Private browsing with storage blocked. A per-session id still works for
    // the length of this page; it just means a new row next time.
    return crypto.randomUUID();
  }
}

/**
 * The VAPID key travels as base64url and `subscribe` wants raw bytes.
 *
 * Returns the ArrayBuffer rather than the view: `applicationServerKey` is
 * typed as BufferSource over a plain ArrayBuffer, and a Uint8Array whose
 * backing buffer could in principle be shared does not satisfy it.
 */
function toKeyBytes(base64url: string): ArrayBuffer {
  const padded = (base64url + '==='.slice((base64url.length + 3) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

/** Something a person would recognise in a list of their own devices. */
function describeBrowser(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const platform = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'Mac'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : '';
  return platform ? `${browser} on ${platform}` : browser;
}

export function useWebPush(): WebPush {
  const [state, setState] = useState<WebPushState>('working');
  const [error, setError] = useState<string | null>(null);

  // What the browser and the server each think, before anyone presses
  // anything. A switch that renders "off" while the browser is actually
  // subscribed is how people end up with notifications they cannot turn off.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported()) {
        if (!cancelled) setState('unsupported');
        return;
      }
      try {
        const { public_key } = await initiativeApi.webPushKey();
        if (cancelled) return;
        if (!public_key) {
          setState('unconfigured');
          return;
        }
        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }
        const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
        const existing = await registration?.pushManager.getSubscription();
        if (!cancelled) setState(existing && Notification.permission === 'granted' ? 'on' : 'off');
      } catch {
        if (!cancelled) setState('off');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setState('working');
    try {
      const { public_key } = await initiativeApi.webPushKey();
      if (!public_key) {
        setState('unconfigured');
        return;
      }

      // Asked before the service worker is registered, so a refusal costs
      // nothing and leaves no worker behind.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const registration = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;

      // An existing subscription minted against a different (rotated) key
      // would be accepted here and rejected on every send afterwards, so it
      // is replaced rather than reused.
      const current = await registration.pushManager.getSubscription();
      if (current) await current.unsubscribe().catch(() => undefined);

      const subscription = await registration.pushManager.subscribe({
        // Required by Chrome and Firefox: every push must result in a visible
        // notification. The service worker honours that.
        userVisibleOnly: true,
        applicationServerKey: toKeyBytes(public_key),
      });

      await initiativeApi.registerWebPush({
        subscription: subscription.toJSON(),
        browser_id: browserId(),
        name: describeBrowser(),
      });
      setState('on');
    } catch (err) {
      setState('off');
      setError(err instanceof Error ? err.message : 'Notifications could not be turned on.');
    }
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    setState('working');
    try {
      const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
      const subscription = await registration?.pushManager.getSubscription();
      // The server first: unsubscribing here first would leave a registration
      // the server still believes in and burn the next nudge on it.
      await initiativeApi.forgetWebPush(browserId()).catch(() => undefined);
      await subscription?.unsubscribe().catch(() => undefined);
      setState('off');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notifications could not be turned off.');
      setState('on');
    }
  }, []);

  return { state, error, enable, disable };
}
