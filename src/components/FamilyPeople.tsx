import { useEffect, useRef, useState } from 'react';
import { dashboardApi, type FamilyChild, type FamilyHealthStatus, type FamilyLink, type FamilyPeople as FamilyPeopleData, type Neighbor } from '../api/dashboard';
import { type Fact } from '../api/companion';
import { ContactAvatar, ContactSearch } from './Community';
import { HealthWatchChip, HealthWatchModal } from './HealthWatch';
import { FamilyPersonEditor } from './FamilyPersonEditor';

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

/** A "⋯" button and the menu it opens. Escape or a click anywhere else closes it. */
export function OptionsMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return <div className="options-menu" ref={root}>
    <button type="button" className="options-menu-button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(o => !o)}>⋯</button>
    {open && <div className="options-menu-list" role="menu">
      {items.map(item => <button key={item.label} type="button" role="menuitem" className={item.danger ? 'community-danger' : undefined} disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>)}
    </div>}
  </div>;
}

/**
 * The people and pets Athena remembers, each with the Google Contact the
 * person has linked to them (if any) and a way to link or unlink one. A link
 * keeps only the contact's id and name; birthdays, photos and numbers are read
 * from Google when shown, and a birthday found there feeds the Family card.
 * Children from the family profiles are listed under them.
 */
export function FamilyPeopleList({ facts, children, links, photos = {}, onChange, onConnect, onFactsChanged, names, relations, watches = [], watchOf, onHealthChanged, onFactEdited, neighbors, onNeighbors }: {
  facts: Fact[]; children: FamilyChild[]; links: FamilyLink[]; photos?: Record<string, string>;
  onChange: (next: FamilyPeopleData) => void; onConnect?: () => void;
  /** A person was merged away or forgotten (by uuid), so the memories list behind this one is stale. */
  onFactsChanged?: (goneUuid: string) => void;
  /** The name each memory is about ("sister" → "Emma"), as the Family card shows it; the key when missing. */
  names?: Map<string, string>;
  relations?: Map<string, string | undefined>;
  /** Every active health watch in the family. */
  watches?: FamilyHealthStatus[];
  /** Which watch belongs to which memory, by fact uuid. */
  watchOf?: Map<string, FamilyHealthStatus>;
  /** A watch was started, updated or ended. */
  onHealthChanged?: () => void;
  /** A memory's text was corrected. */
  onFactEdited?: () => void;
  /** Neighbouring households, for moving someone who isn't family (the neighbour's dog) to Community. */
  neighbors?: Neighbor[] | null;
  onNeighbors?: (next: Neighbor[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [tidy, setTidy] = useState<{ uuid: string; mode: 'merge' | 'delete' | 'move' } | null>(null);
  const [into, setInto] = useState('');
  const [editing, setEditing] = useState<Fact | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ name: string; watch?: FamilyHealthStatus } | null>(null);
  const nameOf = (fact: Fact) => names?.get(fact.uuid) || fact.key.replace(/(^|\s)(\w)/g, (_, space: string, c: string) => space + c.toUpperCase());
  // Whoever is watched but isn't one of the memories below still needs a row to update or end it from.
  const shown = new Set(facts.map(f => watchOf?.get(f.uuid)?.uuid).filter(Boolean));
  const others = watches.filter(w => !shown.has(w.uuid));
  const linkOf = new Map(links.map(l => [l.factUuid, l]));
  const taken = new Set(links.map(l => l.contactId));

  async function run(factUuid: string, call: () => Promise<FamilyPeopleData>) {
    setBusy(factUuid); setError(null);
    try { onChange(await call()); setOpen(null); setTidy(null); }
    catch (e) { setError((e as Error).message || 'That didn’t save.'); }
    finally { setBusy(null); }
  }

  /**
   * Not family after all — the neighbour's dog. The household gets a note in
   * its own words first; only once that is saved is the memory forgotten
   * here, so a failure part-way never loses what was known.
   */
  async function move(fact: Fact) {
    const name = nameOf(fact);
    // "Nash — the neighbour's dog", never "Nash — Nash — the neighbour's dog".
    const line = !fact.value ? name : fact.value.toLowerCase().startsWith(name.toLowerCase()) ? fact.value : `${name} — ${fact.value}`;
    const target = (neighbors || []).find(n => n.uuid === into);
    await run(fact.uuid, async () => {
      const notes = (text: string | null) => (text?.trim() ? `${text.trim()}${/[.!?;]$/.test(text.trim()) ? ' ' : '; '}${line}` : line).slice(0, 500);
      const saved = target
        ? await dashboardApi.saveNeighbor({ name: target.name, address: target.address, latitude: target.latitude, longitude: target.longitude, placeUuid: target.placeUuid, where: target.where, contact: target.contact, notes: notes(target.notes), contacts: target.contacts.map(c => ({ contactId: c.contactId, name: c.name })) }, target.uuid)
        : await dashboardApi.saveNeighbor({ name: null, address: address.trim(), latitude: null, longitude: null, placeUuid: null, where: null, contact: null, notes: notes(null), contacts: [] });
      onNeighbors?.(saved.neighbors);
      const next = await dashboardApi.removeFamilyPerson(fact.uuid);
      onFactsChanged?.(fact.uuid);
      return next;
    });
  }

  return <>
    <ul className="dashboard-memory-list family-people">
      {facts.filter(f => !facts.some(owner => owner !== f && (f.key.trim().toLowerCase().startsWith(`${owner.key.trim().toLowerCase()} `) || f.key.trim().toLowerCase().startsWith(`${owner.key.trim().toLowerCase()}'s `)))).map(fact => {
        const link = linkOf.get(fact.uuid);
        const card = link?.card;
        const name = card?.name || link?.name;
        const born = birthdayLabel(card?.birthday);
        const watch = watchOf?.get(fact.uuid);
        return <li key={fact.uuid} className={watch ? 'family-watched' : undefined}>
          <ContactAvatar name={nameOf(fact)} photoUrl={photos[fact.uuid] || card?.photoUrl} />
          <div>
            <strong>{nameOf(fact)}</strong>
            <p>{fact.value || 'Saved in memory'}</p>
            {watch && <HealthWatchChip watch={watch} onOpen={() => setHealth({ name: nameOf(fact), watch })} />}
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
              <button type="button" className="community-link" disabled={!into || busy === fact.uuid} onClick={() => void run(fact.uuid, async () => { const next = await dashboardApi.mergeFamilyPeople(fact.uuid, into); onFactsChanged?.(fact.uuid); return next; })}>Merge</button>
            </div>}
            {tidy?.uuid === fact.uuid && tidy.mode === 'move' && <div className="family-tidy">
              <label>Move “{nameOf(fact)}” to a household on the Community page
                <select value={into} onChange={e => setInto(e.target.value)}>
                  <option value="">Choose a household…</option>
                  {(neighbors || []).map(n => <option key={n.uuid} value={n.uuid}>{n.name || n.address}{n.name && n.address ? ` — ${n.address.split(',')[0]}` : ''}</option>)}
                  <option value="new">A new household…</option>
                </select>
              </label>
              {into === 'new' && <input className="family-tidy-input" placeholder="Their address, e.g. 152 Rushing Water Ln" value={address} onChange={e => setAddress(e.target.value)} maxLength={255} />}
              <small>What I know is added to that household’s notes, then “{nameOf(fact)}” leaves your family list.</small>
              <button type="button" className="community-link" disabled={!into || (into === 'new' && !address.trim()) || busy === fact.uuid} onClick={() => void move(fact)}>{busy === fact.uuid ? 'Moving…' : 'Move'}</button>
            </div>}
            {tidy?.uuid === fact.uuid && tidy.mode === 'delete' && <div className="family-tidy">
              <small>Forget “{fact.key}”? I’ll stop remembering this entry.</small>
              <button type="button" className="community-link" disabled={busy === fact.uuid} onClick={() => void run(fact.uuid, async () => { const next = await dashboardApi.removeFamilyPerson(fact.uuid); onFactsChanged?.(fact.uuid); return next; })}>Yes, delete</button>
            </div>}
          </div>
          <OptionsMenu label={`Options for ${nameOf(fact)}`} items={[
            { label: watch ? 'Health watch — update' : 'Health watch', onSelect: () => setHealth({ name: nameOf(fact), watch }) },
            link
              ? { label: 'Unlink contact', disabled: busy === fact.uuid, onSelect: () => void run(fact.uuid, () => dashboardApi.unlinkFamilyContact(fact.uuid)) }
              : { label: open === fact.uuid ? 'Cancel linking' : 'Link contact', onSelect: () => setOpen(open === fact.uuid ? null : fact.uuid) },
            { label: 'Edit', disabled: busy !== null, onSelect: () => { setError(null); setEditing(fact); } },
            ...(onNeighbors && neighbors ? [{ label: 'Move to Community', onSelect: () => { setInto(''); setAddress(''); setTidy({ uuid: fact.uuid, mode: 'move' }); } }] : []),
            ...(facts.length > 1 ? [{ label: 'Merge', onSelect: () => { setInto(''); setTidy(tidy?.uuid === fact.uuid && tidy.mode === 'merge' ? null : { uuid: fact.uuid, mode: 'merge' }); } }] : []),
            { label: 'Delete', danger: true, onSelect: () => setTidy(tidy?.uuid === fact.uuid && tidy.mode === 'delete' ? null : { uuid: fact.uuid, mode: 'delete' }) },
          ]} />
        </li>;
      })}
    </ul>
    {error && <small className="community-warn">{error}</small>}
    {others.length > 0 && <>
      <p className="source-note">Also on health watch</p>
      <ul className="dashboard-memory-list family-people">{others.map(w => <li key={w.uuid} className="family-watched">
        <ContactAvatar name={w.personName} />
        <div><strong>{w.personName}</strong><HealthWatchChip watch={w} onOpen={() => setHealth({ name: w.personName, watch: w })} /></div>
        <OptionsMenu label={`Options for ${w.personName}`} items={[{ label: 'Health watch — update', onSelect: () => setHealth({ name: w.personName, watch: w }) }]} />
      </li>)}</ul>
    </>}
    {children.length > 0 && <>
      <p className="source-note">Children on your family profiles</p>
      <ul className="dashboard-data-list">{children.map(c => <li key={c.uuid}>
        <strong>{c.name}</strong>
        <small>{[c.grade && `Grade ${c.grade}`, birthdayLabel(c.birthday) ? `born ${birthdayLabel(c.birthday)}` : 'no birthday on file'].filter(Boolean).join(' · ')}</small>
      </li>)}</ul>
    </>}
    {editing && <FamilyPersonEditor fact={editing} facts={facts} name={nameOf(editing)} relation={relations?.get(editing.uuid)} links={links} photoUrl={photos[editing.uuid]} onClose={() => setEditing(null)} onSaved={() => onFactEdited?.()} onChange={onChange} onConnect={onConnect} onHealth={() => { setHealth({ name: nameOf(editing), watch: watchOf?.get(editing.uuid) }); setEditing(null); }} />}
    {health && <HealthWatchModal personName={health.name} watch={health.watch} onClose={() => setHealth(null)} onSaved={() => onHealthChanged?.()} />}
  </>;
}
