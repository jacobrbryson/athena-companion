import { useCallback, useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import { devicesApi, type PairedDevice } from '../api/companion';

/**
 * Pair Athena's phone / car app with this account. The device redeems a
 * 10-minute code for its own revocable token (phones change IPs constantly, so
 * they don't use the web session). Removing a device here cuts it off within
 * a minute.
 */
export function DevicesPanel({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [name, setName] = useState('My phone');
  const [platform, setPlatform] = useState<'android' | 'car'>('android');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    devicesApi.list().then(setDevices).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(refresh, [refresh]);

  // Countdown, and pick up the newly paired device while the code is showing.
  useEffect(() => {
    if (!pairing) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(refresh, 5000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [pairing, refresh]);

  async function createCode() {
    setError(null);
    try {
      const res = await devicesApi.pairingCode(name.trim() || 'New device', platform);
      setPairing({ code: res.code, expiresAt: Date.now() + res.expires_in * 1000 });
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message || 'Could not create a pairing code.');
    }
  }

  async function revoke(uuid: string) {
    await devicesApi.revoke(uuid).catch(() => undefined);
    refresh();
  }

  const remaining = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;

  return (
    <Drawer eyebrow="paired devices" title="Phone & car" onClose={onClose}>
      <section className="mb-8">
        <Label>pair a new device</Label>
        {pairing && remaining > 0 ? (
          <div className="rounded border border-emerald-400/40 bg-emerald-500/5 p-4 text-center animate-missionSignal">
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] opacity-50">enter this code in the athena app</p>
            <p className="my-3 font-mono text-3xl tracking-[0.35em] gd-glitch" data-text={pairing.code}>
              {pairing.code}
            </p>
            <p className="font-mono text-[10px] tabular-nums opacity-50">
              expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Device name"
              maxLength={80}
              className="h-11 w-full rounded-full bg-white/5 px-4 text-sm outline-none placeholder:opacity-40 focus:bg-white/10"
            />
            <div className="flex gap-2 font-mono text-[10px] uppercase tracking-[0.25em]">
              {(['android', 'car'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  aria-pressed={platform === p}
                  className={`flex-1 rounded border py-2 ${platform === p ? 'border-emerald-400/60 bg-emerald-500/15' : 'border-emerald-500/15 opacity-60'}`}
                >
                  {p === 'android' ? '📱 phone' : '🚗 car'}
                </button>
              ))}
            </div>
            <button onClick={createCode} className="h-11 w-full rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95">
              Get pairing code
            </button>
          </div>
        )}
      </section>

      <section>
        <Label>connected</Label>
        {error && <p className="mb-2 text-xs" style={{ color: 'var(--gd-error)' }}>{error}</p>}
        {devices?.length === 0 && <p className="text-sm opacity-60">No devices yet.</p>}
        <ul className="space-y-2">
          {devices?.map((d) => {
            const caps = (d.capabilities || {}) as { runtimes?: string[]; installed?: { id: string }[]; ramGb?: number };
            return (
              <li key={d.uuid} className="rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">
                    {d.platform === 'car' ? '🚗' : '📱'} {d.name}
                  </span>
                  <button onClick={() => void revoke(d.uuid)} className="rounded border border-red-400/40 px-2 py-1 font-mono text-[10px] uppercase text-red-300 hover:bg-red-500/10">
                    remove
                  </button>
                </div>
                <p className="mt-1 font-mono text-[10px] opacity-50">
                  seen {ago(d.last_seen_at) || 'never'}
                  {caps.ramGb ? ` · ${caps.ramGb} GB` : ''}
                  {caps.installed?.length ? ` · models: ${caps.installed.map((m) => m.id).join(', ')}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </Drawer>
  );
}
