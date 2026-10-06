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
export function FamilyPeopleList({ facts, children, links, onChange, onConnect }: {
  facts: Fact[]; children: FamilyChild[]; links: FamilyLink[];
  onChange: (next: FamilyPeopleData) => void; onConnect?: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkOf = new Map(links.map(l => [l.factUuid, l]));
  const taken = new Set(links.map(l => l.contactId));

  async function run(factUuid: string, call: () => Promise<FamilyPeopleData>) {
    setBusy(factUuid); setError(null);
    try { onChange(await call()); setOpen(null); }
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
          </div>
          {link
            ? <button type="button" className="community-link" disabled={busy === fact.uuid} onClick={() => void run(fact.uuid, () => dashboardApi.unlinkFamilyContact(fact.uuid))}>Unlink</button>
            : <button type="button" className="community-link" onClick={() => setOpen(open === fact.uuid ? null : fact.uuid)}>{open === fact.uuid ? 'Cancel' : 'Link contact'}</button>}
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
