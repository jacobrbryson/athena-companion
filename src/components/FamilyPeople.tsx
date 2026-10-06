import { useState } from 'react';
import { dashboardApi, type FamilyChild, type FamilyLink, type FamilyPeople as FamilyPeopleData } from '../api/dashboard';
import type { Fact } from '../api/companion';
import { ContactAvatar, ContactSearch } from './Community';

/** "2016-10-08" or Google's year-less "--10-08" → "Oct 8". */
function birthdayLabel(iso: string | null | undefined) {
  const m = /^(?:\d{4}|-)-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(2000, Number(m[1]) - 1, Number(m[2])).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
}

const LINK_PROBLEM: Record<FamilyLink['status'], string | null> = {
  ok: null,
  missing: 'no longer in Google Contacts — deleted or merged',
  not_connected: 'Google Contacts isn’t connected',
  unreadable: 'couldn’t read Google Contacts just now',
};

/**
 * The people and pets Athena remembers, each with the Google Contact the
 * person has linked to them (if any) and a way to link or unlink one. A link
 * keeps only the contact's id and name; birthdays, photos and numbers are read
 * from Google when shown, and a birthday found there feeds the Family card.
 * Children from the family profiles are listed under them.
 */
export function FamilyPeopleList({ facts, children, links, onChange, onConnect, onFactsChanged }: {
  facts: Fact[]; children: FamilyChild[]; links: FamilyLink[];
  onChange: (next: FamilyPeopleData) => void; onConnect?: () => void;
  /** A person was merged or forgotten, so the memories list behind this one is stale. */
  onFactsChanged?: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [tidy, setTidy] = useState<{ uuid: string; mode: 'merge' | 'delete' } | null>(null);
  const [into, setInto] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkOf = new Map(links.map(l => [l.factUuid, l]));
  const taken = new Set(links.map(l => l.contactId));

  async function run(factUuid: string, call: () => Promise<FamilyPeopleData>) {
    setBusy(factUuid); setError(null);
    try { onChange(await call()); setOpen(null); setTidy(null); }
    catch (e) { setError((e as Error).message || 'That didn’t save.'); }
    finally { setBusy(null); }
  }

  return <>
    <ul className="dashboard-memory-list family-people">
      {facts.map(fact => {
        const link = linkOf.get(fact.uuid);
        const card = link?.card;
        const name = card?.name || link?.name;
        const born = birthdayLabel(card?.birthday);
        return <li key={fact.uuid}>
          <ContactAvatar name={fact.key} photoUrl={card?.photoUrl} />
          <div>
            <strong>{fact.key}</strong>
            <p>{fact.value || 'Saved in memory'}</p>
            {link && <small className="family-linked">
              {name || 'Linked contact'}{born ? ` · born ${born}` : ''}
              {card?.phone && <> · <a href={`tel:${card.phone.replace(/[^\d+]/g, '')}`}>{card.phone}</a></>}
              {LINK_PROBLEM[link.status] && <span className="community-warn"> · {LINK_PROBLEM[link.status]}</span>}
            </small>}
            {open === fact.uuid && <ContactSearch exclude={taken} onPick={c => void run(fact.uuid, () => dashboardApi.linkFamilyContact(fact.uuid, { contactId: c.contactId, name: c.name }))} onConnect={onConnect} />}
            {tidy?.uuid === fact.uuid && tidy.mode === 'merge' && <div className="family-tidy">
              <label>Merge “{fact.key}” into
                <select value={into} onChange={e => setInto(e.target.value)}>
                  <option value="">Choose a person…</option>
                  {facts.filter(f => f.uuid !== fact.uuid).map(f => <option key={f.uuid} value={f.uuid}>{f.key}{f.value ? ` — ${f.value.slice(0, 40)}` : ''}</option>)}
                </select>
              </label>
              <small>What I know about “{fact.key}” is added to them, then “{fact.key}” is forgotten.</small>
              <button type="button" className="community-link" disabled={!into || busy === fact.uuid} onClick={() => void run(fact.uuid, async () => { const next = await dashboardApi.mergeFamilyPeople(fact.uuid, into); onFactsChanged?.(); return next; })}>Merge</button>
            </div>}
            {tidy?.uuid === fact.uuid && tidy.mode === 'delete' && <div className="family-tidy">
              <small>Forget “{fact.key}”? I’ll stop remembering this entry.</small>
              <button type="button" className="community-link" disabled={busy === fact.uuid} onClick={() => void run(fact.uuid, async () => { const next = await dashboardApi.removeFamilyPerson(fact.uuid); onFactsChanged?.(); return next; })}>Yes, delete</button>
            </div>}
          </div>
          <div className="family-actions">
            {link
              ? <button type="button" className="community-link" disabled={busy === fact.uuid} onClick={() => void run(fact.uuid, () => dashboardApi.unlinkFamilyContact(fact.uuid))}>Unlink</button>
              : <button type="button" className="community-link" onClick={() => setOpen(open === fact.uuid ? null : fact.uuid)}>{open === fact.uuid ? 'Cancel' : 'Link contact'}</button>}
            {facts.length > 1 && <button type="button" className="community-link" onClick={() => { setInto(''); setTidy(tidy?.uuid === fact.uuid && tidy.mode === 'merge' ? null : { uuid: fact.uuid, mode: 'merge' }); }}>Merge</button>}
            <button type="button" className="community-link community-danger" onClick={() => setTidy(tidy?.uuid === fact.uuid && tidy.mode === 'delete' ? null : { uuid: fact.uuid, mode: 'delete' })}>Delete</button>
          </div>
        </li>;
      })}
    </ul>
    {error && <small className="community-warn">{error}</small>}
    {children.length > 0 && <>
      <p className="source-note">Children on your family profiles</p>
      <ul className="dashboard-data-list">{children.map(c => <li key={c.uuid}>
        <strong>{c.name}</strong>
        <small>{[c.grade && `Grade ${c.grade}`, birthdayLabel(c.birthday) ? `born ${birthdayLabel(c.birthday)}` : 'no birthday on file'].filter(Boolean).join(' · ')}</small>
      </li>)}</ul>
    </>}
  </>;
}
