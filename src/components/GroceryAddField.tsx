import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './HealthPage';

/**
 * Family → Provisions' Add item (owner, 2026-11-20): suggests as you type from
 * the family's own items (Keep regulars, the pantry, what photos showed), then
 * adds the chosen text straight to Keep — the parent runs the direct action.
 * Anything typed can still be added; suggestions only save typing.
 */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function GroceryAddField({ known, onList, busy, onAdd }: {
  /** Candidate names, most likely first (duplicates are fine). */
  known: string[];
  /** What's already waiting to be bought — shown as such, not offered. */
  onList: string[];
  busy: boolean;
  onAdd: (item: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const pool = useMemo(() => {
    const seen = new Map<string, string>();
    for (const k of known) { const t = k.trim(); if (t && t.length <= 120 && !/[,\r\n]/.test(t) && !seen.has(norm(t))) seen.set(norm(t), t); }
    return [...seen.values()];
  }, [known]);
  const already = useMemo(() => new Set(onList.map(norm)), [onList]);

  const q = norm(text);
  const matches = !q ? [] : pool
    .map((name, i) => {
      const n = norm(name);
      const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.split(' ').some(w => w.startsWith(q)) ? 2 : n.includes(q) ? 3 : -1;
      return { name, rank, i };
    })
    .filter(m => m.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, 7);
  const shown = open && matches.length > 0;

  async function submit(value = text) {
    const item = value.trim();
    if (!item || busy) return;
    setOpen(false); setActive(-1);
    if (await onAdd(item)) setText('');
    else input.current?.focus();
  }

  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); setOpen(true); setActive(a => (a + 1) % matches.length); }
    else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); setOpen(true); setActive(a => (a <= 0 ? matches.length - 1 : a - 1)); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
    else if (e.key === 'Tab' && shown && active >= 0) { e.preventDefault(); setText(matches[active].name); setActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = shown && active >= 0 ? matches[active].name : text;
      if (!already.has(norm(pick))) void submit(pick);
    }
  }

  const blocked = !!q && already.has(q);
  return <form className="prv-add" onSubmit={e => { e.preventDefault(); if (!blocked) void submit(); }}>
    <div className="prv-add-combo">
      <label className="prv-add-field"><Icon name="plus" />
        <input ref={input} value={text} maxLength={120} placeholder="Add item" disabled={busy} autoComplete="off"
          role="combobox" aria-label="Add an item to the grocery list" aria-expanded={shown} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
          onChange={e => { setText(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={key} />
      </label>
      {shown && <ul className="prv-suggest" id={`${id}-list`} role="listbox" aria-label="Suggestions">
        {matches.map((m, i) => {
          const on = already.has(norm(m.name));
          return <li key={m.name} id={`${id}-${i}`} role="option" aria-selected={i === active} aria-disabled={on}
            className={`${i === active ? 'prv-suggest-on' : ''}${on ? ' prv-suggest-listed' : ''}`}
            onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)}
            onClick={() => { if (!on) void submit(m.name); }}>
            <span>{m.name}</span>{on && <small>on the list</small>}
          </li>;
        })}
      </ul>}
    </div>
    <button type="submit" className="cp-outline" disabled={!q || busy || blocked}>{busy ? 'Adding…' : 'Add'}</button>
  </form>;
}
