import { useEffect, useState, type ReactNode } from 'react';
import { OptionsMenu } from './FamilyPeople';
import { dashboardApi, type SourceStatus, type Workplace, type WorkplaceConnection, type WorkplaceInput, type WorkplacesOverview } from '../api/dashboard';

/**
 * The Workplaces panel on Work: where the person works and what they do there
 * (core_api services/workplaces.js). Only what they type; at most one is
 * primary, and that is the one Athena means by "work" unless they name another.
 *
 * Each workplace also owns, exclusively, the connections (Jira, Gmail…) and
 * email addresses the person links to it. A connection whose sign-in matches a
 * workplace's domain is offered as a suggestion; it is never linked by itself.
 *
 * Loads its own list so the rest of Work doesn't wait on it, and keeps the
 * add/edit form's half-typed state across the dashboard re-rendering.
 */

const errorText = (e: unknown, fallback: string) => {
  const err = e as Error & { body?: { message?: string } };
  return err?.body?.message || err?.message || fallback;
};

const connectionName = (c: { label: string; account: string | null }) => c.account ? `${c.label} · ${c.account}` : c.label;

/** What the dashboard's last real read of a source said, keyed by connection provider. */
export type SourceHealth = Partial<Record<string, { status: SourceStatus; detail?: string | null; checkedAt?: string } | undefined>>;

const SHORT: Record<string, string> = {
  jira: 'Jira', slack: 'Slack', gmail: 'Gmail', google_calendar: 'Calendar', google_contacts: 'Contacts',
  websites: 'Websites', github: 'GitHub', openai: 'OpenAI', anthropic: 'Claude',
};

/**
 * Can Athena read this connection right now? Bad if the stored link says so
 * (needs reconnecting, removed) or if the dashboard's latest read of it
 * failed — the second catches what nothing records, like a Jira API token
 * that Jira now rejects.
 */
function readable(c: WorkplaceConnection, health: SourceHealth): { ok: boolean; why: string } {
  if (!c.provider || c.status === 'revoked') return { ok: false, why: 'No longer connected — connect it again under Connected apps.' };
  if (c.status === 'needs_reauth') return { ok: false, why: 'Needs reconnecting under Connected apps.' };
  const read = health[c.provider];
  if (read && read.status !== 'ready') {
    const what = read.status === 'error' ? 'The last read failed' : read.status === 'consent_required' ? 'Needs permission' : 'Needs reconnecting';
    return { ok: false, why: `${what}${read.detail ? `: ${read.detail}` : '.'}` };
  }
  return { ok: true, why: read ? 'Athena read it on the last dashboard load.' : 'Connected.' };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="community-field"><span>{label}</span>{children}</label>;
}

function WorkplaceForm({ initial, busy, onSave, onCancel }: {
  initial: WorkplaceInput; busy: boolean; onSave: (input: WorkplaceInput) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<WorkplaceInput>(initial);
  const set = (key: 'role' | 'domain' | 'notes') => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value || null }));

  return <form className="dashboard-form community-form" onSubmit={e => { e.preventDefault(); onSave({ ...form, name: form.name.trim() }); }}>
    <Field label="Company"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={120} placeholder="Company name" required /></Field>
    <Field label="Your role (optional)"><input value={form.role || ''} onChange={set('role')} maxLength={160} placeholder="Your title" /></Field>
    <Field label="Website (optional)"><input value={form.domain || ''} onChange={set('domain')} maxLength={190} placeholder="example.com" /></Field>
    <label className="community-check"><input type="checkbox" checked={!!form.primary} onChange={e => setForm(f => ({ ...f, primary: e.target.checked }))} /> My primary job</label>
    <Field label="Notes for Athena"><textarea value={form.notes || ''} onChange={set('notes')} maxLength={500} rows={2} placeholder="What you do there, who you work with, what matters" /></Field>
    <div className="community-actions">
      <button className="dashboard-chat-cta" type="submit" disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save'} <span>↗</span></button>
      <button type="button" className="community-link" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

/** Add an email address, or link one of the connections no workplace owns yet. */
function LinkForm({ place, available, busy, onLink, onCancel }: {
  place: Workplace; available: WorkplacesOverview['available']; busy: boolean;
  onLink: (link: { credential: string } | { email: string }) => void; onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [credential, setCredential] = useState('');
  // This workplace's suggestions first.
  const choices = [...available].sort((a, b) => Number(b.suggestedWorkplace === place.uuid) - Number(a.suggestedWorkplace === place.uuid));
  return <div className="dashboard-form community-form">
    <form className="community-actions" onSubmit={e => { e.preventDefault(); if (email.trim()) { onLink({ email: email.trim() }); setEmail(''); } }}>
      <Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={190} placeholder={place.domain ? `you@${place.domain}` : 'you@example.com'} /></Field>
      <button className="community-link" type="submit" disabled={busy || !email.trim()}>Add address</button>
    </form>
    {choices.length > 0 && <form className="community-actions" onSubmit={e => { e.preventDefault(); if (credential) { onLink({ credential }); setCredential(''); } }}>
      <Field label="Connection">
        <select value={credential} onChange={e => setCredential(e.target.value)}>
          <option value="">Choose a connected app…</option>
          {choices.map(c => <option key={c.credentialUuid} value={c.credentialUuid}>{connectionName(c)}{c.suggestedWorkplace === place.uuid ? ' (suggested)' : ''}</option>)}
        </select>
      </Field>
      <button className="community-link" type="submit" disabled={busy || !credential}>Link</button>
    </form>}
    <div className="community-actions"><button type="button" className="community-link" onClick={onCancel}>Done</button></div>
  </div>;
}

/**
 * `adding` / `onAdding` let the panel header own the Add button; without them
 * the button sits under the list.
 */
export function Workplaces({ health = {}, adding, onAdding }: { health?: SourceHealth; adding?: boolean; onAdding?: (adding: boolean) => void }) {
  const [places, setPlaces] = useState<Workplace[] | null>(null);
  const [available, setAvailable] = useState<WorkplacesOverview['available']>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const creating = onAdding ? !!adding : editing === 'new';
  const setCreating = (on: boolean) => { if (on) setLinking(null); if (onAdding) onAdding(on); else setEditing(on ? 'new' : null); };
  const [linking, setLinking] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (o: WorkplacesOverview) => { setPlaces(o.workplaces); setAvailable(o.available); };

  useEffect(() => {
    let live = true;
    dashboardApi.workplaces()
      .then(o => { if (live) apply(o); })
      .catch(e => { if (live) setLoadError(errorText(e, 'Your workplaces are unavailable right now.')); });
    return () => { live = false; };
  }, []);

  /** Run one write; every write answers with the whole overview. */
  async function run(key: string, write: () => Promise<WorkplacesOverview>, fallback: string) {
    setNotice(null);
    setBusy(key);
    try {
      apply(await write());
      return true;
    } catch (e) {
      setNotice(errorText(e, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function save(input: WorkplaceInput, uuid?: string) {
    if (await run(uuid || 'new', () => dashboardApi.saveWorkplace(input, uuid), 'Could not save that workplace.')) { if (uuid) setEditing(null); else setCreating(false); }
  }

  function remove(place: Workplace) {
    if (!window.confirm(`Remove ${place.name} from your workplaces? Its connections and addresses become unlinked; nothing is disconnected.`)) return;
    void run(place.uuid, () => dashboardApi.removeWorkplace(place.uuid), 'Could not remove that workplace.');
  }

  const link = (place: Workplace, l: { credential: string } | { email: string }) =>
    void run(place.uuid, () => dashboardApi.linkWorkplace(place.uuid, l), 'Could not link that.');
  const unlink = (place: Workplace, linkUuid: string) =>
    void run(place.uuid, () => dashboardApi.unlinkWorkplace(place.uuid, linkUuid), 'Could not unlink that.');

  if (loadError) return <p className="dashboard-notice" role="status">{loadError}</p>;
  if (!places) return <p className="dashboard-empty">Loading your workplaces…</p>;

  return <>
    {notice && <p className="dashboard-notice" role="status">{notice}</p>}
    {!places.length && !creating && <p className="dashboard-empty">Add where you work and your role there, so I know which company you mean when you talk about work.</p>}
    {places.length > 0 && <ul className="dashboard-data-list calendar-events workplace-list">
      {places.map(place => {
        const suggested = available.filter(c => c.suggestedWorkplace === place.uuid);
        return <li key={place.uuid}>
          <span className="event-dot" />
          <div className="community-body">
            <strong>{place.name}{place.primary && <> <span className="card-count">Primary</span></>}</strong>
            {place.role && <small>{place.role}</small>}
            {place.domain && <small><a href={`https://${place.domain}`} target="_blank" rel="noopener noreferrer">{place.domain}</a></small>}
            {place.notes && <p className="community-notes">{place.notes}</p>}
            {(place.connections.length > 0 || place.emails.length > 0 || suggested.length > 0) && <div className="workplace-chips">
              {place.connections.map(c => {
                const r = readable(c, health);
                return <button type="button" key={c.uuid} className={`workplace-chip ${r.ok ? 'workplace-chip-ok' : 'workplace-chip-bad'}`}
                  aria-expanded={open === c.uuid} title={`${connectionName(c)} — ${r.why}`} onClick={() => setOpen(open === c.uuid ? null : c.uuid)}>
                  <span className="workplace-chip-mark" aria-label={r.ok ? 'working' : 'not working'}>{r.ok ? '✓' : '✕'}</span>{c.provider ? SHORT[c.provider] || c.label : 'Removed'}
                </button>;
              })}
              {place.emails.map(e => <button type="button" key={e.uuid} className="workplace-chip" aria-expanded={open === e.uuid} title={`Mail to or from ${e.email} is ${place.name}’s.`} onClick={() => setOpen(open === e.uuid ? null : e.uuid)}>✉ {e.email}</button>)}
              {/* A suggestion is a link one tap away, never made by itself. */}
              {suggested.map(c => <button type="button" key={c.credentialUuid} className="workplace-chip workplace-chip-suggested" disabled={busy === place.uuid}
                title={`${connectionName(c)} looks like ${place.name}’s — tap to link it.`} onClick={() => link(place, { credential: c.credentialUuid })}>＋ {c.provider ? SHORT[c.provider] || c.label : c.label}</button>)}
            </div>}
            {[...place.connections, ...place.emails].filter(l => l.uuid === open).map(l => <small className="workplace-chip-detail" key={l.uuid}>
              {'email' in l ? `${l.email} — mail to or from it is ${place.name}’s.` : `${connectionName(l)} — ${readable(l, health).why}`}
            </small>)}
            {editing === place.uuid && <WorkplaceForm initial={{ name: place.name, role: place.role, domain: place.domain, primary: place.primary, notes: place.notes }}
              busy={busy === place.uuid} onSave={input => void save(input, place.uuid)} onCancel={() => setEditing(null)} />}
            {linking === place.uuid && <LinkForm place={place} available={available} busy={busy === place.uuid}
              onLink={l => link(place, l)} onCancel={() => setLinking(null)} />}
          </div>
          <OptionsMenu label={`Options for ${place.name}`} items={[
            { label: 'Edit', onSelect: () => { setLinking(null); setEditing(place.uuid); } },
            { label: 'Link email or app', onSelect: () => { setEditing(null); setLinking(place.uuid); } },
            ...(place.primary ? [] : [{ label: 'Make primary', disabled: busy === place.uuid, onSelect: () => void save({ name: place.name, primary: true }, place.uuid) }]),
            ...place.connections.map(c => ({ label: `Unlink ${c.provider ? SHORT[c.provider] || c.label : 'removed connection'}`, disabled: busy === place.uuid, onSelect: () => unlink(place, c.uuid) })),
            ...place.emails.map(e => ({ label: `Unlink ${e.email}`, disabled: busy === place.uuid, onSelect: () => unlink(place, e.uuid) })),
            { label: 'Remove workplace', danger: true, disabled: busy === place.uuid, onSelect: () => remove(place) },
          ]} />
        </li>;
      })}
    </ul>}
    {creating
      ? <WorkplaceForm initial={{ name: '', role: null, domain: null, primary: !places.length, notes: null }} busy={busy === 'new'} onSave={input => void save(input)} onCancel={() => setCreating(false)} />
      : !onAdding && <div className="community-actions">
        <button type="button" className="dashboard-chat-cta" onClick={() => setCreating(true)}>Add a workplace <span>＋</span></button>
      </div>}
  </>;
}
