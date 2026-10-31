import { useEffect, useState } from 'react';
import { guardianMissionsApi as gm, type GmConsentPerson } from '../api/guardianMissions';

const STATUS: Record<string, string> = {
  agreed: 'Agreed',
  needs_agreement: 'Waiting',
  needs_new_agreement: 'New agreement to read',
  withdrawn: 'Left',
  unknown: 'Not known',
};

export const agreementLabel = (status?: string) => STATUS[status || 'unknown'] || STATUS.unknown;

/**
 * Asks at sign-in, one person at a time: the words shown are the words
 * recorded. Anyone who isn't a Guardians parent gets a refusal from the server
 * and sees nothing. "Not now" lasts until the next sign-in.
 */
export function GuardiansConsentPrompt() {
  const [people, setPeople] = useState<GmConsentPerson[]>([]);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gm.consent().then(r => setPeople(r.people)).catch(() => undefined);
  }, []);

  const person = people.find(p => p.needsYou && p.terms && p.status !== 'withdrawn');
  if (!person?.terms || later) return null;
  const terms = person.terms;

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      setPeople((await gm.agree(person.uuid, terms.id, 'app_prompt')).people);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Try again.');
      gm.consent().then(r => setPeople(r.people)).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="gm-consent-title">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-cyan-500/30 bg-slate-900 p-5 text-slate-100">
        <h2 id="gm-consent-title" className="text-lg font-semibold">{terms.title}</h2>
        {person.kind === 'kid' && <p className="mt-1 text-sm text-cyan-200">For {person.name}</p>}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-200">{terms.body}</div>
        {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800" onClick={() => setLater(true)}>Not now</button>
          <button type="button" className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50" disabled={busy} onClick={() => void agree()}>I agree</button>
        </div>
      </div>
    </div>
  );
}

/** Field Kit: each person's standing, and the way out. */
export function GuardiansConsentList() {
  const [people, setPeople] = useState<GmConsentPerson[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    gm.consent().then(r => setPeople(r.people)).catch(() => undefined);
  }, []);

  const change = async (run: () => Promise<{ people: GmConsentPerson[] }>) => {
    setBusy(true);
    try {
      setPeople((await run()).people);
    } finally {
      setBusy(false);
    }
  };

  if (!people.length) return null;
  return (
    <>
      <h3 className="gm-h3">Helping train Athena</h3>
      <ul className="gm-recipients">
        {people.map(p => {
          const terms = p.terms;
          return <li key={p.uuid}>
            <span>{p.name}<small className="gm-recipient-channels">{agreementLabel(p.status)}</small></span>
            {p.status === 'agreed' || (p.kind === 'kid' && !p.needsYou)
              ? <button type="button" className="gm-btn" disabled={busy} onClick={() => { if (window.confirm(`Stop mission contact with ${p.name}? Anything waiting to be sent is cancelled.`)) void change(() => gm.withdraw(p.uuid)); }}>Leave</button>
              : terms && <button type="button" className="gm-btn" disabled={busy} onClick={() => { if (window.confirm(`${terms.title}\n\n${terms.body}`)) void change(() => gm.agree(p.uuid, terms.id, 'settings')); }}>Read and agree</button>}
          </li>;
        })}
      </ul>
    </>
  );
}
