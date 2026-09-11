import { useEffect, useState } from 'react';
import { fetchAccess, requestAccess } from '../api/auth';
import { useAuth } from '../auth/AuthContext';

export function AccessLocked() {
  const { user, signOut } = useAuth();
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchAccess().then((access) => setRequested(access.requested)).catch(() => setError('Unable to check access. Please retry.'));
  }, []);
  const act = async (request: boolean) => {
    setBusy(true);
    setError('');
    try {
      const access = await (request ? requestAccess() : fetchAccess());
      setRequested(access.requested);
      if (access.allowed) window.location.reload();
      else if (!request) setError('Access has not been granted yet.');
    } catch { setError('Unable to check access. Please retry.'); }
    finally { setBusy(false); }
  };
  return (
    <main className="gd-scanlines gd-sweep min-h-[100dvh] grid place-items-center px-6 py-10">
      <div className="w-full max-w-sm font-mono text-center">
        <p className="text-xs uppercase tracking-widest opacity-50">athena companion</p>
        <h1 className="mt-4 text-xl tracking-widest">// ACCESS LOCKED</h1>
        <p className="mt-6 text-sm">Athena is available to Guardians and people approved by the owner.</p>
        <p className="mt-3 text-xs opacity-60">Signed in as {user?.email}</p>
        <p className="mt-6 text-sm" role="status">{requested ? 'Your access request is pending review.' : 'Request access to open your private channel.'}</p>
        <div className="mt-6 flex flex-col gap-3">
          <button className="border border-current rounded px-4 py-3 disabled:opacity-40" disabled={busy || requested} onClick={() => act(true)}>{requested ? 'Request submitted' : 'Request access'}</button>
          <button className="underline py-2" disabled={busy} onClick={() => act(false)}>Check access</button>
          <button className="opacity-60 py-2" onClick={() => void signOut()}>Sign out</button>
        </div>
        <p className="mt-4 text-xs" role="alert">{error}</p>
      </div>
    </main>
  );
}
