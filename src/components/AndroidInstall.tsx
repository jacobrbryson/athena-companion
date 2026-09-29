import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Label } from './Drawer';
import { androidApi, type AndroidRelease } from '../api/companion';
import { androidCall, isAndroidCompanion } from '../native/android';

/**
 * Install the Android app on another phone or tablet, or update this one.
 *
 * The APK is private: the server mints a 15-minute signed download link for
 * whoever is signed in here, and the QR code carries that link to the other
 * device, which doesn't need to be signed in to download. Installing grants
 * nothing — the new device still pairs (below) or signs in.
 */
export function AndroidInstall() {
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [installed, setInstalled] = useState<number | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: number; qr: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inApp = isAndroidCompanion();
  const onAndroidBrowser = !inApp && /Android/i.test(navigator.userAgent);

  useEffect(() => {
    androidApi.release().then(setRelease).catch((e) => setError((e as Error).message));
    // APKs from before the update check can't answer; they are older than any release.
    if (inApp) androidCall<{ versionCode: number }>('appVersion').then((v) => setInstalled(v.versionCode)).catch(() => setInstalled(1));
  }, [inApp]);

  useEffect(() => {
    if (!link) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [link]);

  async function fetchLink() {
    setError(null);
    setBusy(true);
    try {
      const res = await androidApi.link();
      const qr = await QRCode.toDataURL(res.url, { margin: 1, width: 240, errorCorrectionLevel: 'L' });
      const next = { url: res.url, expiresAt: Date.parse(res.expiresAt), qr };
      setLink(next);
      setNow(Date.now());
      return next;
    } catch (e) {
      setError((e as Error).message || 'Could not create a download link.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function update() {
    const next = await fetchLink();
    if (next) await androidCall('openExternal', { url: next.url }).catch((e) => setError((e as Error).message));
  }

  const remaining = link ? Math.max(0, Math.round((link.expiresAt - now) / 1000)) : 0;
  const size = release?.available && release.size ? ` · ${Math.round(release.size / 1_000_000)} MB` : '';
  const button = 'h-11 w-full rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95 disabled:opacity-50';

  if (!release) {
    return error ? (
      <section className="mb-8">
        <Label>android app</Label>
        <p className="text-xs" style={{ color: 'var(--gd-error)' }}>{error}</p>
      </section>
    ) : null;
  }

  if (!release.available) {
    return (
      <section className="mb-8">
        <Label>android app</Label>
        <p className="text-sm opacity-60">No Android build has been published yet.</p>
      </section>
    );
  }

  if (inApp) {
    const behind = installed !== null && release.versionCode > installed;
    return (
      <section className="mb-8">
        <Label>this app</Label>
        {behind ? (
          <div className="space-y-2">
            <p className="text-sm">
              Version <span className="font-mono">{release.versionName}</span> is available{size}.
            </p>
            {release.notes && <p className="text-xs opacity-60">{release.notes}</p>}
            <button onClick={() => void update()} disabled={busy} className={button}>
              {busy ? 'Getting the update…' : 'Download update'}
            </button>
            <p className="font-mono text-[10px] opacity-50">It opens in your browser; tap the download to install it over this one.</p>
          </div>
        ) : (
          <p className="text-sm opacity-60">
            Up to date{installed !== null ? '' : '…'} · <span className="font-mono">{release.versionName}</span>
          </p>
        )}
        {error && <p className="mt-2 text-xs" style={{ color: 'var(--gd-error)' }}>{error}</p>}
      </section>
    );
  }

  return (
    <section className="mb-8">
      <Label>install on another device</Label>
      <p className="mb-3 text-sm opacity-70">
        Put Athena on an Android phone or tablet — an old phone for runs, a tablet in the office. Version{' '}
        <span className="font-mono">{release.versionName}</span>
        {size}, for Android 9 or newer.
      </p>
      {link && remaining > 0 ? (
        <div className="rounded border border-emerald-400/40 bg-emerald-500/5 p-4 text-center">
          {!onAndroidBrowser && (
            <>
              <img src={link.qr} alt="QR code for the Athena download" width={200} height={200} className="mx-auto rounded bg-white p-2" />
              <p className="mt-3 text-xs opacity-70">Scan it with the other device's camera.</p>
            </>
          )}
          <a href={link.url} className={`${button} mt-3 inline-flex items-center justify-center`}>
            Download APK
          </a>
          <p className="mt-3 font-mono text-[10px] tabular-nums opacity-50">
            link expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </p>
        </div>
      ) : (
        <button onClick={() => void fetchLink()} disabled={busy} className={button}>
          {busy ? 'Preparing…' : onAndroidBrowser ? 'Get the Android app' : 'Show install code'}
        </button>
      )}
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs opacity-60">
        <li>Open the download. Android asks once to allow installs from your browser — allow it.</li>
        <li>Open Athena on that device and sign in, or pair it with a code below.</li>
      </ol>
      {error && <p className="mt-2 text-xs" style={{ color: 'var(--gd-error)' }}>{error}</p>}
    </section>
  );
}
