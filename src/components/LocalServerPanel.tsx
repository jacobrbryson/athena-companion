import { useState } from 'react';
import { Drawer, Label } from './Drawer';
import { connection, normalizeOrigin, probeLocal, readPreference, savePreference } from '../localConnection';

export function LocalServerPanel({ onClose }: { onClose: () => void }) {
  const saved = readPreference();
  const [origin, setOrigin] = useState(saved?.origin || '');
  const [preferLocal, setPreferLocal] = useState(saved?.preferLocal ?? true);
  const [allowCloud, setAllowCloud] = useState(saved?.allowCloud ?? false);
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const button = 'rounded border border-emerald-500/40 px-3 py-2 hover:bg-emerald-500/10 disabled:opacity-40';
  return <Drawer eyebrow="Owner-controlled installation" title="Local server" onClose={onClose}>
    <div className="space-y-5 text-sm">
      <p>{connection.message || 'Using the configured web server.'}</p>
      <section><Label>Set up Athena at home</Label>
        <p>Run Athena’s proxy, core API, memories, Ollama models and an offline Wikipedia library on a computer you control.</p>
        <a className="mt-2 inline-block underline text-emerald-300" href="/local-server-setup.html" target="_blank" rel="noreferrer">Open installation guide</a>
      </section>
      <label className="block">Local server address
        <input className="mt-2 w-full rounded bg-white/10 p-3" type="url" placeholder="https://athena.example.com" value={origin} onChange={e => { setOrigin(e.target.value); setApproved(false); }} />
      </label>
      <p className="text-xs opacity-70">Use the HTTPS address supplied by the installation owner. A successful check identifies the service; it does not verify who owns it. Your browser may ask for local network permission.</p>
      <label className="flex gap-2"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I trust this address and approve contacting this server and sending my Athena requests there.</label>
      <label className="flex gap-2"><input type="checkbox" checked={preferLocal} onChange={e => setPreferLocal(e.target.checked)} />Check this server first when opening Athena</label>
      <label className="flex gap-2"><input type="checkbox" checked={allowCloud} onChange={e => setAllowCloud(e.target.checked)} />Allow the web cloud server when local is unreachable at startup</label>
      <p className="text-xs opacity-70">When found, Athena opens the local server’s own web client. You sign in there separately; cloud cookies and messages are not transferred. The local core controls model fallback separately and can still send requests to frontier providers. Memories are separate until the owner migrates them. Guardian membership or an owner grant is still required.</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || !approved} onClick={async () => {
          setBusy(true); setMessage('Checking…');
          try { await probeLocal(origin); setMessage('Athena found. Save to use this address.'); }
          catch (e) { setMessage(`${e instanceof Error ? e.message : 'Check failed.'} Check HTTPS, network permission and server availability. If cross-site cookies are blocked, open Athena directly at the local address.`); }
          finally { setBusy(false); }
        }}>Check connection</button>
        <button className={button} disabled={busy || !approved} onClick={() => {
          try { savePreference({ origin: normalizeOrigin(origin), preferLocal, allowCloud }); window.location.reload(); }
          catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save this preference.'); }
        }}>Save & reconnect</button>
        <button className={button} onClick={() => {
          try { savePreference(null); window.location.reload(); }
          catch { setMessage('Browser storage is unavailable.'); }
        }}>Forget local server</button>
      </div>
      <p role="status" className="text-emerald-200">{message}</p>
    </div>
  </Drawer>;
}
