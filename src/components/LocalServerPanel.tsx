import { useState } from 'react';
import { Drawer, Label } from './Drawer';
import { connection, normalizeOrigin, probeLocal, readPreference, savePreference } from '../localConnection';

export function LocalServerPanel({ onClose }: { onClose: () => void }) {
  const saved = readPreference();
  const [origin, setOrigin] = useState(saved?.origin || '');
  const [allowCloud, setAllowCloud] = useState(saved?.allowCloud ?? false);
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const button = 'rounded border border-emerald-500/40 px-3 py-2 hover:bg-emerald-500/10 disabled:opacity-40';
  return <Drawer eyebrow="Connect with your permission" title="Local Athena" onClose={onClose}>
    <div className="space-y-5 text-sm">
      <p>{connection.message || 'Using the configured web server.'}</p>
      <p>Approve your local Athena once. I’ll check the connection, remember it and reconnect when you open Athena.</p>
      <label className="block">Local server address
        <input className="mt-2 w-full rounded bg-white/10 p-3" type="url" disabled={busy} placeholder="https://athena.example.com" value={origin} onChange={e => { setOrigin(e.target.value); setApproved(false); }} />
      </label>
      <p className="text-xs opacity-70">Use the HTTPS address supplied by the installation owner. A successful check identifies the service; it does not verify who owns it. Your browser may ask for local network permission.</p>
      <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={approved} onChange={e => setApproved(e.target.checked)} />I trust this address and approve contacting this server and sending my Athena requests there.</label>
      <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={allowCloud} onChange={e => setAllowCloud(e.target.checked)} />Allow the web cloud server when local is unreachable at startup</label>
      <p className="text-xs opacity-70">When found, Athena opens the local server’s own web client. You sign in there separately; cloud cookies and messages are not transferred. The local core controls model fallback separately and can still send requests to frontier providers. Memories are separate until the owner migrates them. Guardian membership or an owner grant is still required.</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || !approved} onClick={async () => {
          setBusy(true); setMessage('Checking your local Athena…');
          try {
            const approvedOrigin = normalizeOrigin(origin);
            await probeLocal(approvedOrigin);
            savePreference({ origin: approvedOrigin, preferLocal: true, allowCloud });
            window.location.reload();
          }
          catch (e) { setMessage(`${e instanceof Error ? e.message : 'Connection failed.'} If your browser asks for local network access, allow it and try again. You can also open the local address directly. Browsers cannot tell me whether a failed connection was caused by the network, certificate or server.`); }
          finally { setBusy(false); }
        }}>{busy ? 'Connecting…' : 'Connect Athena'}</button>
        <button className={button} disabled={busy} onClick={() => {
          try { savePreference(null); window.location.reload(); }
          catch { setMessage('Browser storage is unavailable.'); }
        }}>Forget local server</button>
      </div>
      <p role="status" className="text-emerald-200">{message}</p>
      <details>
        <summary className="cursor-pointer">Installation & diagnostics</summary>
        <section className="mt-3"><Label>Owner-operated preview</Label>
          <p>Automatic host installation is still being built. This preview requires an owner to prepare the server. Once connected, model health and automatic routing decisions are visible in Athena’s Brain panel.</p>
          <a className="mt-2 inline-block underline text-emerald-300" href="/local-server-setup.html" target="_blank" rel="noreferrer">Open installation guide</a>
        </section>
      </details>
    </div>
  </Drawer>;
}
