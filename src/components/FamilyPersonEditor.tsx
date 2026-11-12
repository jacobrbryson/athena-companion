import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { memoryApi, type Fact } from '../api/companion';
import { ContactAvatar, ContactSearch } from './Community';
import { dashboardApi, type FamilyLink, type FamilyPeople } from '../api/dashboard';
import { downscale } from './photoStore';
import { Icon } from './HealthPage';
import './familyEditor.css';

type Tab = 'details' | 'connections' | 'health' | 'memory';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'details', label: 'Details', icon: 'user' },
  { id: 'connections', label: 'Connections', icon: 'link' },
  { id: 'health', label: 'Health', icon: 'heart' },
  { id: 'memory', label: 'Memory', icon: 'layers' },
];
const RELATIONSHIPS = ['Wife', 'Husband', 'Partner', 'Son', 'Daughter', 'Child', 'Mother', 'Father', 'Sister', 'Brother', 'Grandmother', 'Grandfather', 'Granddaughter', 'Grandson', 'Aunt', 'Uncle', 'Niece', 'Nephew', 'Cousin', 'Friend', 'Pet'];
const OTHER = '__other__';

/**
 * Edit a family member in a side drawer (2026-11-12, owner mockup): photo and
 * relationship up top, then Details / Connections / Health / Memory tabs.
 * Edits the person's own memories without renaming their stable key or contact link.
 */
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
  const [customRelation, setCustomRelation] = useState(() => !!relationship && !RELATIONSHIPS.some(r => r.toLowerCase() === relationship.trim().toLowerCase()));
  const [notes, setNotes] = useState(fact.value || '');
  const other = details.filter(f => f !== detail('display name') && f !== detail('relationship'));
  const [values, setValues] = useState(() => Object.fromEntries(other.map(f => [f.uuid, f.value || ''])));
  const [tab, setTab] = useState<Tab>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(false);
  const [portraitChange, setPortraitChange] = useState<string | null | undefined>(undefined);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const root = useRef<HTMLElement>(null);
  const link = links.find(l => l.factUuid === fact.uuid);
  const isPet = fact.category === 'pet';
  const shownPhoto = portraitChange === null ? link?.card?.photoUrl : portraitChange ? `data:image/jpeg;base64,${portraitChange}` : photoUrl || link?.card?.photoUrl;
  const selectValue = customRelation ? OTHER : RELATIONSHIPS.find(r => r.toLowerCase() === relationship.trim().toLowerCase()) || '';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLInputElement>('.fme-card input')?.focus();
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
    } catch (e) { setError((e as Error).message || `Could not remove this ${isPet ? 'pet' : 'person'}.`); }
    finally { setBusy(false); }
  }
  const changeContact = () => { setTab('connections'); setSearch(true); };

  const contactCard = <section className="fme-contact" aria-label="Linked contact">
    <span className="fme-contact-icon"><Icon name="people" /></span>
    <div>
      <strong>{link ? 'Linked contact' : 'No linked contact'}</strong>
      {link ? <span>{link.card?.name || link.name}</span> : <span className="fme-muted">Link a Google Contact for their phone, email and birthday.</span>}
      <p>{isNew ? 'Save this person before linking a contact.' : 'Contact changes save immediately. Phone numbers and birthdays are edited in Google Contacts.'}</p>
    </div>
    {!isNew && <button type="button" className="fme-outline" disabled={busy} onClick={changeContact}>{link ? 'Change contact' : 'Link contact'} <Icon name="external" /></button>}
  </section>;

  return createPortal(<div className="fme" role="dialog" aria-modal="true" aria-labelledby="family-edit-title">
    <button type="button" className="fme-scrim" aria-label="Close editor" disabled={busy} onClick={onClose} />
    <aside className="fme-panel" ref={root}>
      <form className="fme-form" onSubmit={e => { e.preventDefault(); if (!busy) void save(); }}>
        <header className="fme-head">
          <span className="fme-badge"><Icon name="people" /></span>
          <div><small>FAMILY</small><h2 id="family-edit-title">{isNew ? 'Add' : 'Edit'} {isPet ? 'Pet' : 'Family Member'}</h2></div>
          <button type="button" className="fme-close" aria-label="Close editor" disabled={busy} onClick={onClose}><Icon name="close" /></button>
          <svg className="fme-wave" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 96 C90 92 160 70 230 62 S340 40 400 18" />
            <path d="M40 104 C130 98 200 80 270 72 S360 52 400 36" />
          </svg>
        </header>

        <div className="fme-scroll">
          <section className="fme-profile">
            <label className="fme-avatar" title="Change picture">
              <ContactAvatar name={personName || name} photoUrl={shownPhoto} />
              <span className="fme-camera"><Icon name="camera" /></span>
              <input type="file" accept="image/*" disabled={busy} aria-label="Change picture" onChange={e => void pickPortrait(e.target.files?.[0])} />
            </label>
            <div>
              <h3>{personName.trim() || name}</h3>
              <span className="fme-chip"><Icon name="people" />{relationship.trim() || (isPet ? 'Pet' : 'Family')}</span>
              {(photoUrl || portraitChange) && <button type="button" className="fme-text-button" disabled={busy} onClick={() => setPortraitChange(null)}>Remove picture</button>}
            </div>
          </section>

          <div className="fme-tabs" role="tablist" aria-label="Sections">
            {TABS.map(t => <button key={t.id} type="button" role="tab" id={`fme-tab-${t.id}`} aria-controls="fme-tabpanel" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><Icon name={t.icon} />{t.label}</button>)}
          </div>

          <fieldset className="fme-card" id="fme-tabpanel" role="tabpanel" aria-labelledby={`fme-tab-${tab}`} disabled={busy}>
            {tab === 'details' && <>
              <label>Name<input value={personName} onChange={e => setName(e.target.value)} maxLength={100} required /></label>
              <label>Relationship to you
                <select value={selectValue} onChange={e => {
                  if (e.target.value === OTHER) { setCustomRelation(true); return; }
                  setCustomRelation(false); setRelationship(e.target.value);
                }}>
                  <option value="">From memories</option>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  <option value={OTHER}>Other…</option>
                </select>
              </label>
              {customRelation && <label>Other relationship<input value={relationship} onChange={e => setRelationship(e.target.value)} maxLength={40} placeholder="e.g. Godmother" /></label>}
              <label>What Athena remembers<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} rows={4} /></label>
              <p className="fme-tip"><span><Icon name="bulb" /></span>This helps Athena remember who they are, what they like, and other important context.</p>
            </>}

            {tab === 'connections' && <>
              <p className="fme-lead">{link ? `Linked to ${link.card?.name || link.name} in Google Contacts.` : 'Not linked to a Google Contact yet.'} {isNew ? 'Save this person before linking a contact.' : 'Contact changes save immediately. Phone numbers and birthdays are edited in Google Contacts.'}</p>
              <div className="fme-row">
                <button type="button" className="fme-outline" disabled={busy || isNew} onClick={() => setSearch(s => !s)}>{search ? 'Cancel search' : link ? 'Change contact' : 'Link contact'}</button>
                {link && <button type="button" className="fme-text-button fme-danger" disabled={busy} onClick={() => void contact(() => dashboardApi.unlinkFamilyContact(fact.uuid))}>Unlink</button>}
              </div>
              {search && !busy && <ContactSearch exclude={new Set(links.filter(l => l.factUuid !== fact.uuid).map(l => l.contactId))} onConnect={onConnect} onPick={c => void contact(() => dashboardApi.linkFamilyContact(fact.uuid, { contactId: c.contactId, name: c.name }))} />}
            </>}

            {tab === 'health' && <>
              <p className="fme-lead">A health watch tells Athena when {personName.trim() || name} is unwell, so she can check in and keep it in mind while they recover.</p>
              <div className="fme-row"><button type="button" className="fme-outline" disabled={busy} onClick={onHealth}><Icon name="heart" />Manage health watch</button></div>
            </>}

            {tab === 'memory' && (other.length
              ? other.map(f => <label key={f.uuid}>{f.key.slice(fact.key.length).replace(/^'s?\s*/, '')}<textarea value={values[f.uuid]} onChange={e => setValues(v => ({ ...v, [f.uuid]: e.target.value }))} maxLength={2000} rows={2} /></label>)
              : <p className="fme-lead">Nothing else remembered about {personName.trim() || name} yet. Details Athena learns in conversation show up here to edit.</p>)}
          </fieldset>

          {tab !== 'connections' && contactCard}
          {error && <p className="fme-error" role="alert">{error}</p>}
        </div>

        <footer className="fme-foot">
          {onRemoved && !isNew && (confirmRemove
            ? <div className="fme-confirm"><span>Remove “{name}”?</span><button type="button" className="fme-text-button fme-danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Yes, remove'}</button><button type="button" className="fme-text-button" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep</button></div>
            : <button type="button" className="fme-remove" disabled={busy} onClick={() => setConfirmRemove(true)}><span><Icon name="trash" /></span>Remove {isPet ? 'pet' : 'person'}</button>)}
          <div className="fme-actions">
            <button type="button" className="fme-cancel" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="fme-save" disabled={busy || !personName.trim()}><Icon name="check" />{busy ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </footer>
      </form>
    </aside>
  </div>, document.body);
}
