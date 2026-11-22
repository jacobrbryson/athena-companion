import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { provisionsApi, type MealIdea, type MealKind, type Provisions, type StockKind } from '../api/provisions';
import { actionsApi, memoryApi } from '../api/companion';
import { GroceryAddField } from './GroceryAddField';
import { Icon, Ring } from './HealthPage';
import { PageHeader } from './PageHeader';
import { HomeStat } from './DashboardHome';
import { ScanDrawer, SeenPlaces } from './ProvisionsScan';
import type { RosterRow } from './familyRoster';
import './health.css';
import './calendar.css';
import './family.css';
import './home.css';
import './provisions.css';

/**
 * Family → Provisions (reworked 2026-11-18 from the owner's concept):
 * groceries, the usual stock, meals and restocking — all read from the shared
 * Google Keep list and Athena's own history of its ticks (core_api
 * services/provisions). What the family "has" is what they usually buy minus
 * what's on the list; Keep can't see the kitchen, and the page says so.
 *
 * Ticking or adding an item writes straight to Keep (direct actions
 * mark_grocery_bought / add_grocery_item — the click is the approval), shown
 * at once with a Saving… → Saved pill; asking Athena still uses her card. Meal ideas
 * are hers; whether you have their ingredients is worked out in code.
 */

type Ready = Extract<Provisions, { status: 'ready' }>;
type Filter = 'all' | 'quick' | 'favorite' | 'pantry';

const PANTRY_TILES: { kind: StockKind; label: string; icon: string; tone: string }[] = [
  { kind: 'proteins', label: 'Proteins', icon: 'meat', tone: 'prv-rose' },
  { kind: 'grains', label: 'Grains', icon: 'wheat', tone: 'prv-gold' },
  { kind: 'canned', label: 'Canned', icon: 'can', tone: 'prv-sky' },
  { kind: 'produce', label: 'Produce', icon: 'apple', tone: 'prv-green' },
  { kind: 'dairy', label: 'Dairy', icon: 'milk', tone: 'prv-sky' },
  { kind: 'frozen', label: 'Frozen', icon: 'snow', tone: 'prv-ice' },
];
const KIND_ICON: Partial<Record<StockKind, string>> = { proteins: 'meat', grains: 'wheat', canned: 'can', produce: 'apple', dairy: 'milk', frozen: 'snow', snacks: 'cookie', drinks: 'cup' };
const MEAL_ROWS: { meal: MealKind; label: string; icon: string; tone: string }[] = [
  { meal: 'dinner', label: 'Dinners', icon: 'bowl', tone: 'prv-sky' },
  { meal: 'lunch', label: 'Lunches', icon: 'sun', tone: 'prv-gold' },
  { meal: 'breakfast', label: 'Breakfasts', icon: 'cup', tone: 'prv-sky' },
  { meal: 'snack', label: 'Snacks', icon: 'apple', tone: 'prv-rose' },
];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const firstWord = (name: string) => name.trim().split(/\s+/)[0].toLowerCase();

function useProvisions() {
  const [state, setState] = useState<{ data: Provisions | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const load = useCallback(() => {
    let alive = true;
    provisionsApi.get().then(data => { if (alive) setState({ data, loading: false, error: null }); })
      .catch(e => { if (alive) setState(s => ({ data: s.data, loading: false, error: (e as Error).message || 'Unavailable' })); });
    return () => { alive = false; };
  }, []);
  useEffect(() => load(), [load]);
  return { ...state, reload: load, patch: (fn: (d: Ready) => Ready) => setState(s => (s.data?.status === 'ready' ? { ...s, data: fn(s.data) } : s)) };
}

/** A dish's picture, fetched with the client header (an <img src> can't send it). */
function MealImage({ url, title }: { url: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    setSrc(null); setFailed(false);
    provisionsApi.image(url).then(b => { made = URL.createObjectURL(b); if (alive) setSrc(made); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [url]);
  return <div className={`prv-img${src ? '' : ' prv-img-wait'}`}>
    {src ? <img src={src} alt={title} /> : <span><Icon name="bowl" />{failed ? 'No picture yet' : 'Plating…'}</span>}
  </div>;
}

function Avatar({ row, name }: { row?: RosterRow; name: string }) {
  const [broken, setBroken] = useState(false);
  return <span className="fp-avatar prv-face" title={name} aria-hidden="true">
    {row?.photoUrl && !broken ? <img src={row.photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : name.slice(0, 1).toUpperCase()}
  </span>;
}

function PanelHead({ icon, tone, title, sub, children }: { icon: string; tone: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return <header className="fp-panel-head">
    <span className={`hp-badge hp-badge-lg ${tone}`}><Icon name={icon} /></span>
    <div className="fp-titles"><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
    {children}
  </header>;
}

export function FamilyProvisions({ tabs, roster, note, onAsk }: {
  tabs?: ReactNode;
  roster: RosterRow[];
  /** The dashboard's reason the Keep list can't be read, with its fix; null when it can. */
  note: ReactNode;
  onAsk: (text: string) => void;
}) {
  const { data, loading, error, reload, patch } = useProvisions();
  const [filter, setFilter] = useState<Filter>('all');
  const [meal, setMeal] = useState<MealKind | 'any'>('dinner');
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  // Add item and the checkbox write straight to Keep (owner, 2026-11-20): the click is the
  // approval. An add shows at once and saves behind a per-row "Saving…" → 3 s "Saved" pill
  // (owner: "make it look like it adds right away"); a failure puts the row back.
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved'>>({});
  const [addNote, setAddNote] = useState<{ ok: boolean; text: string; undo?: string } | null>(null);
  // A tick strikes the row through in place over 1.5 s, like Home's Tasks card (owner,
  // 2026-11-21); it leaves once both the strike and Keep's save are done.
  const [striking, setStriking] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, number>>({});
  useEffect(() => () => Object.values(timers.current).forEach(t => window.clearTimeout(t)), []);
  const [kind, setKind] = useState<StockKind | null>(null);
  const [allRestock, setAllRestock] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const ready = data?.status === 'ready' ? data : null;
  const newIdeas = useCallback(async () => {
    setWriting(true); setWriteError(null);
    try { await provisionsApi.refreshIdeas(); reload(); } catch (e) { setWriteError((e as Error).message || 'Couldn’t write new ideas'); } finally { setWriting(false); }
  }, [reload]);
  // First visit (or a week on): ask for ideas once, without a click.
  useEffect(() => {
    if (ready && ready.ideasStatus === 'ready' && ready.ideasStale && !asked.current) { asked.current = true; void newIdeas(); }
  }, [ready, newIdeas]);

  const people = roster;
  const rosterOf = (name: string) => roster.find(r => firstWord(r.name) === firstWord(name));
  const outOf = ready ? ready.grocery.lists.flatMap(l => l.toBuy) : [];
  const usual = ready ? ready.grocery.lists.reduce((n, l) => n + l.usualCount, 0) : 0;
  const ideas = ready?.ideas || [];
  const shown = ideas.filter(i => (meal === 'any' || i.meal === meal)
    && (filter === 'all' || (filter === 'quick' && i.tags.quick) || (filter === 'favorite' && i.tags.favorite) || (filter === 'pantry' && i.tags.usesPantry)));
  const dinners = ready?.coverage.find(c => c.meal === 'dinner');
  const readyMeals = ready ? ready.coverage.reduce((n, c) => n + c.ready, 0) : 0;
  const totalIdeas = ready ? ready.coverage.reduce((n, c) => n + c.ideas, 0) : 0;

  const take = !ready ? [loading ? 'Reading the grocery list…' : 'I can’t read the grocery list right now.']
    : [dinners?.ready ? `${plural(dinners.ready, 'great dinner option')} using what you have.` : outOf.length ? `You’re out of ${plural(outOf.length, 'thing')}.` : 'You’re stocked up.'];

  async function heart(i: MealIdea) {
    const on = !i.saved;
    patch(d => ({ ...d, ideas: d.ideas.map(x => (x.uuid === i.uuid ? { ...x, saved: on, tags: { ...x.tags, favorite: on || x.lovedBy.length > 0 } } : x)) }));
    try { await provisionsApi.save(i.uuid, on); } catch { patch(d => ({ ...d, ideas: d.ideas.map(x => (x.uuid === i.uuid ? i : x)) })); }
  }
  const lc = (s: string) => s.toLowerCase().trim();
  const mark = (item: string, state: 'saving' | 'saved' | null) => {
    const k = lc(item);
    window.clearTimeout(timers.current[k]);
    setSaving(m => { const n = { ...m }; if (state) n[k] = state; else delete n[k]; return n; });
    if (state === 'saved') timers.current[k] = window.setTimeout(() => mark(item, null), 3000);
  };
  const setToBuy = (fn: (toBuy: string[]) => string[]) =>
    patch(d => ({ ...d, grocery: { ...d.grocery, lists: d.grocery.lists.map((l, i) => (i === 0 ? { ...l, toBuy: fn(l.toBuy) } : l)) } }));
  const dropFromList = (item: string) =>
    patch(d => ({ ...d, grocery: { ...d.grocery, lists: d.grocery.lists.map(l => ({ ...l, toBuy: l.toBuy.filter(t => lc(t) !== lc(item)) })) } }));
  const busyWith = (item: string) => saving[lc(item)] === 'saving';

  /** Add item: on the list at once, saved to Keep behind it. */
  async function add(raw: string): Promise<boolean> {
    const item = raw.trim();
    if (!item || busyWith(item) || outOf.some(o => lc(o) === lc(item))) return false;
    setAddNote(null);
    setToBuy(t => [...t, item]);
    mark(item, 'saving');
    void (async () => {
      try {
        const res = await actionsApi.perform('add_grocery_item', { item });
        const added = (res.action?.params as { item?: string } | undefined)?.item || item;
        if (added !== item) setToBuy(t => t.map(x => (x === item ? added : x)));
        mark(item, null); mark(added, 'saved');
      } catch (e) {
        dropFromList(item); mark(item, null);
        setAddNote({ ok: false, text: `Couldn’t add “${item}”: ${(e as Error).message || 'Keep didn’t take it'}` });
      }
    })();
    return true;
  }
  /** The checkbox: strikes through in place, then leaves once Keep has it. */
  async function tick(item: string) {
    const k = lc(item);
    if (striking[k] || busyWith(item)) return;
    setAddNote(null);
    setStriking(m => ({ ...m, [k]: true }));
    const shown = new Promise(r => setTimeout(r, 1500));
    try {
      await Promise.all([actionsApi.perform('mark_grocery_bought', { item }), shown]);
      dropFromList(item);
      setAddNote({ ok: true, text: `Marked “${item}” bought`, undo: item });
    } catch (e) {
      setAddNote({ ok: false, text: `Couldn’t tick off “${item}”: ${(e as Error).message || 'Keep didn’t take it'}` });
    } finally {
      setStriking(m => { const n = { ...m }; delete n[k]; return n; });
    }
  }
  /** Undo a tick: back on the list at once with the Saving… pill (Keep unticks the same item). */
  async function untick(item: string) {
    if (busyWith(item)) return;
    setAddNote(null);
    setToBuy(t => (t.some(x => lc(x) === lc(item)) ? t : [...t, item]));
    mark(item, 'saving');
    try {
      await actionsApi.perform('add_grocery_item', { item });
      mark(item, 'saved');
    } catch (e) {
      dropFromList(item);
      mark(item, null);
      setAddNote({ ok: false, text: `Couldn’t put “${item}” back: ${(e as Error).message || 'Keep didn’t take it'}`, undo: item });
    }
  }
  const pill = (item: string) => {
    const st = saving[lc(item)];
    return st === 'saving' ? <span className="prv-pill prv-pill-saving" role="status"><i aria-hidden="true" />Saving…</span>
      : st === 'saved' ? <span className="prv-pill prv-pill-saved" role="status"><Icon name="check" />Saved</span> : null;
  };
  // Suggestions, most likely first: what's due to run out, the regulars, then the pantry and photos.
  const known = ready ? [
    ...ready.restock.map(r => r.item),
    ...ready.grocery.lists.flatMap(l => [...(l.recentlyBought || []).map(b => b.text), ...(l.usuallyBuys || [])]),
    ...Object.values(ready.stock.items).flat(),
    ...(ready.photos.places || []).flatMap(p => p.items.map(i => i.name)),
  ] : [];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const scroll = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: 'smooth' });

  return <div className="hp cp fp prv">
    <PageHeader eyebrow="WHAT THE HOUSE RUNS ON" title="Provisions" blurb="Groceries, pantry, meals, and planning."
      take={{ lines: take, ask: 'What should we have for dinner tonight with what we have? Keep it easy.', onAsk }} />
    {tabs}

    {!ready ? <section className="hp-panel">
      {note || (loading ? <p className="hp-empty">Reading the grocery list…</p>
        : <div className="fp-empty-hero"><strong>{data?.status === 'not_connected' ? 'No grocery list shared yet' : 'Provisions are unavailable'}</strong>
          <p>{data?.status === 'not_connected' ? 'Share your Google Keep grocery list with Athena and everything here works from it.' : error || (data && 'reason' in data ? data.reason : null) || 'Please retry.'}</p>
          <button type="button" className="cp-outline" onClick={() => (data?.status === 'not_connected' ? onAsk('How do I share our Google Keep grocery list with you?') : reload())}>{data?.status === 'not_connected' ? 'Ask Athena how' : 'Retry'} <Icon name="arrowRight" /></button></div>)}
    </section> : <>

      {/* The Home page's metric tiles (HomeStat), so a number reads the same everywhere. */}
      <section className="dh-stats prv-stats" aria-label="Provisions at a glance">
        <HomeStat icon="Provisions" label="Grocery list" value={plural(outOf.length, 'item')} note={`Out of ${usual} regulars`}
          tone={outOf.length ? 'warn' : 'good'} onClick={() => window.open(ready.grocery.appUrl, '_blank', 'noopener,noreferrer')} />
        <HomeStat icon="Pantry" label="Pantry" value={plural(ready.stock.total, 'item')} tone={ready.runningLow ? 'warn' : 'good'}
          note={ready.runningLow ? `${ready.runningLow} running low` : 'Well stocked'} onClick={() => jump('prv-pantry')} />
        <HomeStat icon="StatNutrition" label="Meal coverage" value={`${readyMeals} of ${totalIdeas}`} note="meals ready to cook" tone={readyMeals ? 'good' : 'idle'}
          aside={<Ring value={readyMeals} max={totalIdeas || 1} color="#33e0c4" size={40} stroke={4} />} onClick={() => jump('prv-coverage')} />
        <HomeStat icon="Chef" label="Dinner options" value={plural(dinners?.ideas || 0, 'idea')} note="From pantry & list" onClick={() => jump('prv-ideas')} />
      </section>

      <div className="prv-row prv-row-1">
        <section className="hp-panel prv-grocery">
          <PanelHead icon="cart" tone="hp-green" title="Grocery List">
            <a className="hp-link" href={ready.grocery.appUrl} target="_blank" rel="noopener noreferrer">Open in Keep <Icon name="external" /></a>
          </PanelHead>
          {note || <>
            <small className="fp-groceries-label">{outOf.length ? `Out of ${plural(outOf.length, 'thing')}` : 'Nothing on the list'}</small>
            {outOf.length ? <ul className="prv-list">{outOf.slice(0, 12).map((item, i) => {
              const struck = !!striking[lc(item)];
              return <li key={`${item}-${i}`} className={struck ? 'prv-striking' : saving[lc(item)] === 'saving' ? 'prv-row-saving' : ''}>
                <button type="button" className={`fp-check fp-check-btn${struck ? ' fp-on' : ''}`} aria-pressed={struck} aria-label={struck ? `“${item}” is bought` : `Mark “${item}” bought`}
                  title="Mark it bought in Keep" disabled={struck || busyWith(item)} onClick={() => void tick(item)}>{struck && <Icon name="check" />}</button>
                <span>{item}</span>{pill(item)}
              </li>;
            })}{outOf.length > 12 && <li className="prv-more">+{outOf.length - 12} more in Keep</li>}</ul>
              : <p className="hp-empty">You’re stocked up — nothing waiting to be bought.</p>}
            <GroceryAddField known={known} onList={outOf} busy={false} onAdd={add} />
            {addNote ? <p className={`prv-fine${addNote.ok ? ' prv-fine-ok' : ' prv-fine-err'}`} role={addNote.ok ? 'status' : 'alert'}>{addNote.text}{addNote.undo && <button type="button" className="prv-undo" onClick={() => void untick(addNote.undo!)}>{addNote.ok ? 'Undo' : 'Retry'}</button>}</p>
              : <p className="prv-fine">Goes straight onto the Keep list.</p>}
          </>}
        </section>

        <section className="hp-panel prv-pantry" id="prv-pantry">
          <PanelHead icon="box" tone="hp-blue" title="Pantry" sub={ready.stock.seen ? `${plural(ready.stock.total, 'item')} · ${ready.stock.seen} seen in photos` : `${plural(ready.stock.total, 'item')} usually in · from your regulars`}>
            {ready.photos.status === 'ready' && <button type="button" className="hp-link" onClick={() => setScanning(true)}><Icon name="camera" /> Scan</button>}
          </PanelHead>
          <div className="prv-tiles">{PANTRY_TILES.map(t => <button type="button" key={t.kind} className={`prv-tile${kind === t.kind ? ' prv-on' : ''}`} aria-pressed={kind === t.kind} onClick={() => setKind(k => (k === t.kind ? null : t.kind))}>
            <Icon name={t.icon} className={t.tone} /><strong>{t.label}</strong><small>{plural(ready.stock.kinds[t.kind] || 0, 'item')}</small>
          </button>)}</div>
          {kind && <ul className="fp-groceries-items prv-kind-items">{ready.stock.items[kind].map(i => <li key={i}>{i}</li>)}
            {ready.stock.kinds[kind] > ready.stock.items[kind].length && <li className="fp-groceries-more">+{ready.stock.kinds[kind] - ready.stock.items[kind].length} more</li>}</ul>}
          {ready.photos.status === 'ready' && <SeenPlaces places={ready.photos.places} onScan={() => setScanning(true)} onChanged={reload} />}
          <button type="button" className="prv-low" onClick={() => document.getElementById('prv-restock')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <Icon name="check" className="prv-low-check" />
            <span>{ready.runningLow ? `${plural(ready.runningLow, 'item')} running low` : 'Nothing running low'}</span>
            <span className="prv-low-items">{ready.restock.filter(r => r.daysLeft <= 3 && !r.seenIn).slice(0, 3).map(r => <i key={r.item} title={r.item}><Icon name={KIND_ICON[r.kind] || 'box'} /></i>)}
              {ready.runningLow > 3 && <b>+{ready.runningLow - 3}</b>}</span>
            <Icon name="chevron" className="hp-chev" />
          </button>
        </section>

        <section className="hp-panel prv-coverage" id="prv-coverage">
          <PanelHead icon="calendar" tone="hp-blue" title={<>Meal Coverage <span className="prv-info" title="Ideas you could cook now: you usually have at least three-quarters of their ingredients. Worked out from your regulars minus what’s on the list.">ⓘ</span></>} />
          <div className="prv-cov-big"><strong>{readyMeals}</strong><span>meals ready</span><small>of {plural(totalIdeas, 'idea')}</small></div>
          <div className="prv-segs" aria-hidden="true">{Array.from({ length: Math.max(totalIdeas, 1) }, (_, i) => <i key={i} className={i < readyMeals ? 'prv-seg-on' : undefined} />)}</div>
          <ul className="prv-meals">{MEAL_ROWS.map(m => {
            const c = ready.coverage.find(x => x.meal === m.meal) || { ideas: 0, ready: 0 };
            return <li key={m.meal}><button type="button" onClick={() => { setMeal(m.meal); setFilter('all'); document.getElementById('prv-ideas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <Icon name={m.icon} className={m.tone} />
              <div><span><strong>{m.label}</strong><small>{c.ready} of {c.ideas} ready</small></span>
                <div className="hp-bar hp-bar-thin prv-bar"><i style={{ width: `${c.ideas ? (c.ready / c.ideas) * 100 : 0}%` }} /></div></div>
            </button></li>;
          })}</ul>
        </section>
      </div>

      <section className="hp-panel prv-ideas" id="prv-ideas">
        <PanelHead icon="chef" tone="hp-green" title={meal === 'any' ? 'Meal Ideas' : `${MEAL_ROWS.find(m => m.meal === meal)?.label.slice(0, -1)} Ideas`} sub="Based on your pantry, grocery list, and family preferences.">
          <div className="prv-filters" role="group" aria-label="Filter ideas">
            {([['all', 'All', null], ['quick', 'Quick (< 30m)', 'bolt'], ['favorite', 'Family Favorites', 'heart'], ['pantry', 'Uses Pantry', 'box']] as const).map(([id, label, icon]) =>
              <button key={id} type="button" className={filter === id ? 'prv-on' : undefined} aria-pressed={filter === id} onClick={() => setFilter(id)}>{icon && <Icon name={icon} />}{label}</button>)}
            <select value={meal} onChange={e => setMeal(e.target.value as MealKind | 'any')} aria-label="Which meal">
              <option value="dinner">Dinners</option><option value="lunch">Lunches</option><option value="breakfast">Breakfasts</option><option value="snack">Snacks</option><option value="any">All meals</option>
            </select>
            <button type="button" onClick={newIdeas} disabled={writing} title="Ask Athena for a fresh set; hearted ideas stay"><Icon name="refresh" />{writing ? 'Thinking…' : 'New ideas'}</button>
          </div>
        </PanelHead>
        {ready.ideasStatus === 'not_migrated' ? <p className="hp-empty">Meal ideas need a database update (migration 0119) before they can be saved.</p>
          : writeError && !ideas.length ? <p className="hp-empty">{writeError}</p>
            : !ideas.length ? <p className="hp-empty">{writing ? 'Athena is looking through your regulars for ideas…' : 'No ideas yet.'}</p>
              : !shown.length ? <p className="hp-empty">No ideas match that filter. <button type="button" className="hp-link" onClick={() => { setFilter('all'); setMeal('any'); }}>Show all</button></p>
                : <div className="prv-strip-wrap">
                  <div className="prv-strip" ref={strip}>{shown.map((i, n) => {
                    const badge = i.tags.favorite ? { icon: 'star', text: i.saved ? 'Saved' : 'Family Favorite', cls: 'prv-badge-gold' } : i.coverage >= 1 ? { icon: 'check', text: 'Uses Pantry', cls: 'prv-badge-green' } : i.tags.quick ? { icon: 'bolt', text: 'Quick & Easy', cls: 'prv-badge-blue' } : null;
                    const fans = i.lovedBy;
                    return <article key={i.uuid} className={`prv-card${n === 0 ? ' prv-card-first' : ''}`}>
                      <button type="button" className="prv-card-open" onClick={() => onAsk(`Let's make ${i.title}. Walk me through it with what we have${i.missing.length ? ` — we'd need ${i.missing.join(', ')}` : ''}.`)} title={i.missing.length ? `Need: ${i.missing.join(', ')}` : 'You usually have everything'}>
                        <MealImage url={i.imageUrl} title={i.title} />
                        {badge && <span className={`prv-badge ${badge.cls}`}><Icon name={badge.icon} />{badge.text}</span>}
                        <strong>{i.title}</strong>
                      </button>
                      {fans.length > 0 && <span className="prv-faces">{fans.slice(0, 3).map(f => <Avatar key={f} name={f} row={rosterOf(f)} />)}{fans.length > 3 && <b>+{fans.length - 3}</b>}</span>}
                      <footer>
                        <span><Icon name="clock" />{i.minutes} min</span>
                        <span title={i.missing.length ? `Need: ${i.missing.join(', ')}` : undefined}><Icon name="box" />{i.coverage >= 1 ? 'From Pantry' : i.coverage >= 0.75 ? 'Have Most' : `Need ${i.missing.length}`}</span>
                        <button type="button" className={`prv-heart${i.saved ? ' prv-on' : ''}`} aria-pressed={i.saved} aria-label={i.saved ? `Unsave ${i.title}` : `Save ${i.title}`} onClick={() => heart(i)}><Icon name="heart" /></button>
                      </footer>
                    </article>;
                  })}</div>
                  {shown.length > 3 && <button type="button" className="prv-scroll" aria-label="More ideas" onClick={() => scroll(1)}><Icon name="chevron" /></button>}
                </div>}
      </section>

      <div className="prv-row prv-row-3">
        <section className="hp-panel prv-prefs">
          <PanelHead icon="people" tone="hp-blue" title="Family Food Preferences" sub="Who loves what (and what to avoid)." />
          <Preferences people={people} prefs={ready.preferences} editing={editing} onEdit={setEditing} onSaved={() => { setEditing(null); reload(); }} />
        </section>

        <section className="hp-panel prv-restock" id="prv-restock">
          <PanelHead icon="layers" tone="hp-green" title="Smart Restock" sub="Suggestions based on when things get bought." />
          {!ready.restock.length ? <p className="hp-empty">{ready.historySince ? 'Nothing due yet — I need to see an item bought twice to know its rhythm.' : 'I start learning your rhythm once I’ve seen the list a few times.'}</p>
            : <ul className="prv-rows">{(allRestock ? ready.restock : ready.restock.slice(0, 3)).map(r => <li key={r.item}>
              <Icon name={KIND_ICON[r.kind] || 'box'} className="prv-row-icon" />
              <span><strong>{r.item}</strong><small>{r.seenIn ? `seen in the ${r.seenIn} — not running low` : r.daysLeft < 0 ? 'probably out now' : r.daysLeft === 0 ? 'runs out about today' : `runs out in ~${plural(r.daysLeft, 'day')}`} · every ~{r.everyDays}d</small></span>
              {outOf.some(o => o.toLowerCase() === r.item.toLowerCase())
                ? <span className="prv-plus prv-plus-done" title="On the list" aria-label={`${r.item} is on the list`}>✓</span>
                : <button type="button" className="prv-plus" aria-label={`Add ${r.item} to the grocery list`} title="Add it to the Keep list" onClick={() => void add(r.item)}><Icon name="plus" /></button>}
            </li>)}</ul>}
          {ready.restock.length > 3 && <button type="button" className="cp-outline fp-wide" onClick={() => setAllRestock(v => !v)}>{allRestock ? 'Show fewer' : `View all suggestions (${ready.restock.length})`} <Icon name="arrowRight" /></button>}
        </section>

        <section className="hp-panel prv-insights">
          <PanelHead icon="chart" tone="hp-green" title="Inventory Insights" sub="Trends & opportunities." />
          {!ready.insights.length ? <p className="hp-empty">Nothing to say yet — insights come from a few weeks of the list.</p>
            : <ul className="prv-insight-list">{ready.insights.map(n => <li key={n.title}><button type="button" onClick={() => onAsk(`About my groceries: "${n.title}" (${n.detail}). What does that tell you?`)}>
              <Icon name={n.tone === 'tip' ? 'bulb' : n.tone === 'good' ? 'up' : 'chart'} className={`prv-tone-${n.tone}`} />
              <span><strong>{n.title}</strong><small>{n.detail}</small></span>
              <Icon name="chevron" className="hp-chev" />
            </button></li>)}</ul>}
        </section>
      </div>
      {scanning && <ScanDrawer onClose={() => setScanning(false)} onDone={reload} />}
    </>}
  </div>;
}

/**
 * Who loves what, saved as an ordinary memory ("food: Maya" = "Loves tacos;
 * avoids mushrooms") so Athena knows it in chat too, and the meal ideas read it.
 */
function Preferences({ people, prefs, editing, onEdit, onSaved }: { people: RosterRow[]; prefs: Ready['preferences']; editing: string | null; onEdit: (name: string | null) => void; onSaved: () => void }) {
  const prefOf = (name: string) => prefs.find(p => firstWord(p.name) === firstWord(name));
  const shown = people.slice(0, 4);
  const current = editing ? prefOf(editing) : undefined;
  const [loves, setLoves] = useState('');
  const [avoids, setAvoids] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { setLoves(current?.loves.join(', ') || ''); setAvoids(current?.avoids.join(', ') || ''); setFailed(null); }, [editing, current]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const clean = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean).join(', ');
    const value = [clean(loves) && `Loves ${clean(loves)}`, clean(avoids) && `avoids ${clean(avoids)}`].filter(Boolean).join('; ');
    setSaving(true); setFailed(null);
    try {
      if (value) await memoryApi.saveFact({ category: 'preference', key: `food: ${editing.trim().split(/\s+/)[0]}`, value });
      else if (current) await memoryApi.deleteFact(current.uuid);
      onSaved();
    } catch (err) { setFailed((err as Error).message || 'Couldn’t save'); } finally { setSaving(false); }
  }

  if (!people.length) return <p className="hp-empty">Tell Athena about your family and their favourites show up here.</p>;
  return <>
    <ul className="prv-people">{shown.map(r => {
      const p = prefOf(r.name);
      return <li key={r.id}><button type="button" className={editing === r.name ? 'prv-on' : undefined} onClick={() => onEdit(editing === r.name ? null : r.name)} aria-expanded={editing === r.name}>
        <Avatar name={r.name} row={r} />
        <strong>{r.name.split(/\s+/)[0]}</strong>
        <small className={p?.loves.length ? 'prv-loves' : 'prv-none'}><Icon name={p?.loves.length ? 'heart' : 'plus'} />{p?.loves[0] || 'Add'}</small>
      </button></li>;
    })}{people.length > 4 && <li><button type="button" onClick={() => onEdit(people[4].name)}><span className="fp-avatar prv-face prv-more">+{people.length - 4}</span></button></li>}</ul>
    {editing && <form className="prv-pref-form" onSubmit={save}>
      <label>{editing.split(/\s+/)[0]} loves<input value={loves} onChange={e => setLoves(e.target.value)} placeholder="tacos, pasta" maxLength={200} /></label>
      <label>Avoids<input value={avoids} onChange={e => setAvoids(e.target.value)} placeholder="mushrooms" maxLength={200} /></label>
      <div><button type="submit" className="cp-outline" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button type="button" className="hp-link" onClick={() => onEdit(null)}>Cancel</button></div>
      {failed && <p className="prv-fine prv-error">{failed}</p>}
    </form>}
  </>;
}
