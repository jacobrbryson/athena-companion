import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { memoryApi, type Fact } from '../api/companion';
import { ContactAvatar, ContactSearch } from './Community';
import { dashboardApi, type FamilyLink, type FamilyPeople } from '../api/dashboard';
import { downscale } from './photoStore';

/** Edit the person's own memories without renaming their stable key or contact link. */
export function FamilyPersonEditor({ fact, facts, name, relation, links, photoUrl, isNew = false, onClose, onSaved, onChange, onConnect, onHealth, onRemoved }: {
  fact: Fact; facts: Fact[]; name: string; relation?: string; links: FamilyLink[]; photoUrl?: string | null; isNew?: boolean;
  onClose: () => void; onSaved: () => void; onChange: (next: FamilyPeople) => void;
  onConnect?: () => void; onHealth: () => void; onRemoved?: (uuid: string) => void;
}) {
  const prefix = fact.key.trim().toLowerCase();
  const details = facts.filter(f => f !== fact && (f.key.trim().toLowerCase().startsWith(`${prefix} `) || f.key.trim().toLowerCase().startsWith(`${prefix}'s `)));
  const detail = (suffix: string) => details.find(f => f.key.trim().toLowerCase() === `${prefix} ${suffix}`);
  const [personName, setName] = useState(detail('display name')?.value || name);
  const [relationship, setRelationship] = useState(detail('relationship')?.value || relation || '');
  const [notes, setNotes] = useState(fact.value || '');
  const other = details.filter(f => f !== detail('display name') && f !== detail('relationship'));
  const [values, setValues] = useState(() => Object.fromEntries(other.map(f => [f.uuid, f.value || ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(false);
  const [portraitChange, setPortraitChange] = useState<string | null | undefined>(undefined);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const root = useRef<HTMLElement>(null);
  const link = links.find(l => l.factUuid === fact.uuid);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key !== 'Tab') return;
      const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href]') || [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [busy, onClose]);

  async function save() {
    setBusy(true); setError('');
    try {
      let factUuid = fact.uuid;
      if (isNew) {
        const created = await memoryApi.saveFact({ category: fact.category, key: fact.key, value: notes.trim(), visibility: fact.visibility });
        factUuid = created.memory.uuid;
      }
      const write = async (key: string, value: string, original?: Fact) => {
        if (value.trim() === (original?.value || '').trim()) return;
        if (!value.trim()) { if (original) await memoryApi.deleteFact(original.uuid); return; }
        await memoryApi.saveFact({ category: original?.category || fact.category, key, value: value.trim(), visibility: original?.visibility || fact.visibility });
      };
      await write(`${fact.key} display name`, personName, detail('display name'));
      await write(`${fact.key} relationship`, relationship, detail('relationship'));
      // Keep the main entry even if its notes are emptied: it owns the links and details.
      if (!isNew && notes.trim() !== (fact.value || '').trim()) await memoryApi.saveFact({ category: fact.category, key: fact.key, value: notes.trim(), visibility: fact.visibility });
      for (const f of other) await write(f.key, values[f.uuid], f);
      if (portraitChange !== undefined) onChange(await dashboardApi.setFamilyPortrait(factUuid, portraitChange));
      onSaved(); onClose();
    } catch (e) { onSaved(); setError(`${(e as Error).message || 'Could not save.'} Some fields may have saved; you can retry.`); }
    finally { setBusy(false); }
  }
  async function pickPortrait(file?: File) {
    if (!file) return;
    setError('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
      const { base64 } = await downscale(file, 320, 0.8);
      if (base64.length > 180000) throw new Error('Choose a smaller picture.');
      setPortraitChange(base64);
    } catch (e) { setError((e as Error).message || 'Could not read that picture.'); }
  }
  async function contact(call: () => Promise<FamilyPeople>) {
    setBusy(true); setError('');
    try { onChange(await call()); setSearch(false); }
    catch (e) { setError((e as Error).message || 'Could not update the contact.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try {
      onChange(await dashboardApi.removeFamilyPerson(fact.uuid));
      onRemoved?.(fact.uuid);
      onClose();
    } catch (e) { setError((e as Error).message || 'Could not remove this pet.'); }
    finally { setBusy(false); }
  }

  return createPortal(<div className="health-modal" role="dialog" aria-modal="true" aria-labelledby="family-edit-title">
    <button className="health-modal-backdrop" aria-label="Close editor" disabled={busy} onClick={onClose} />
    <section className="health-modal-card" ref={root}>
      <header><div><small>FAMILY</small><h2 id="family-edit-title">Edit {name}</h2></div><button className="health-modal-close" aria-label="Close editor" disabled={busy} onClick={onClose}>✕</button></header>
      <form className="dashboard-form health-modal-form" onSubmit={e => { e.preventDefault(); if (!busy) void save(); }}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          <label>Name<input value={personName} onChange={e => setName(e.target.value)} maxLength={100} required /></label>
          <label>Relationship to you<input value={relationship} onChange={e => setRelationship(e.target.value)} maxLength={40} placeholder="e.g. Wife, Partner, Sister" /><small>Leave empty to use the relationship from existing memories.</small></label>
          <label>What Athena remembers<textarea className="family-tidy-input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} rows={4} /></label>
          {other.map(f => <label key={f.uuid}>{f.key.slice(fact.key.length).replace(/^'s?\s*/, '')}<textarea className="family-tidy-input" value={values[f.uuid]} onChange={e => setValues(v => ({ ...v, [f.uuid]: e.target.value }))} maxLength={2000} rows={2} /></label>)}
        </fieldset>
        <div className="family-portrait-control"><ContactAvatar name={personName} photoUrl={portraitChange === null ? link?.card?.photoUrl : portraitChange ? `data:image/jpeg;base64,${portraitChange}` : photoUrl || link?.card?.photoUrl} />
          <div><label>Picture<input type="file" accept="image/*" disabled={busy} onChange={e => void pickPortrait(e.target.files?.[0])} /></label>
            {(photoUrl || portraitChange) && <button type="button" className="community-link" disabled={busy} onClick={() => setPortraitChange(null)}>Remove picture</button>}
            <small className="source-note">Your picture is saved privately with this family member and appears on all your devices.</small></div>
        </div>
        <div><p className="source-note">{link ? `Linked contact: ${link.card?.name || link.name}` : 'No linked Google Contact'}</p>
          <button type="button" className="community-link" disabled={busy || isNew} onClick={() => setSearch(s => !s)}>{search ? 'Cancel search' : link ? 'Change contact' : 'Link contact'}</button>
          {link && <button type="button" className="community-link" disabled={busy} onClick={() => void contact(() => dashboardApi.unlinkFamilyContact(fact.uuid))}>Unlink</button>}
          {search && !busy && <ContactSearch exclude={new Set(links.filter(l => l.factUuid !== fact.uuid).map(l => l.contactId))} onConnect={onConnect} onPick={c => void contact(() => dashboardApi.linkFamilyContact(fact.uuid, { contactId: c.contactId, name: c.name }))} />}
          <small className="source-note">{isNew ? 'Save this person before linking a contact.' : 'Contact changes save immediately. Contact phone numbers and birthdays are edited in Google Contacts.'}</small>
        </div>
        <button type="button" className="community-link" disabled={busy} onClick={onHealth}>Manage health watch</button>
        {onRemoved && !isNew && <div className="family-remove-control">
          {confirmRemove ? <><span>Remove “{name}” from your family memories?</span><button type="button" className="community-link community-danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Yes, remove'}</button><button type="button" className="community-link" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep</button></>
            : <button type="button" className="community-link community-danger" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove {fact.category === 'pet' ? 'pet' : 'person'}</button>}
        </div>}
        {error && <p className="dashboard-notice" role="alert">{error}</p>}
        <div className="health-modal-actions"><button type="submit" className="dashboard-chat-cta" disabled={busy || !personName.trim()}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="community-link" disabled={busy} onClick={onClose}>Cancel</button></div>
      </form>
    </section>
  </div>, document.body);
}
