import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dreamsApi, type Dream, type DreamQuestion, type DreamStep } from '../api/dashboard';
import { Panel, SectionPage, Stat, type SectionContext } from './Dashboard';
import { DashboardIcon } from './icons';

/**
 * Athena's dreams: each night she reorganizes what she remembers into tables
 * of her own design (core_api services/dreams). The dashboard shows last
 * night told AS a dream — whimsical, but every image in it is something that
 * really happened in her database — with the plain account one click away.
 * The Dreams page is the 30-day history, down to each statement she ran.
 */

/** `backticks` in her narrative are real table/statement names — show them as code. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2
      ? <code key={i}>{part.slice(1, -1)}</code>
      : <Fragment key={i}>{part}</Fragment>);
}
function Paragraphs({ text, className }: { text: string; className?: string }) {
  return <>{text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map((p, i) => <p key={i} className={className}>{inline(p)}</p>)}</>;
}

/**
 * The dream's picture. Fetched as a blob because the image route is behind
 * the same auth as everything else and an <img src> can't carry the client
 * header. Absent (not broken) when there is no picture or it has aged out.
 * The thumbnail is cropped to fit beside the story; clicking it opens the
 * whole painting over the page.
 */
function DreamImage({ uuid, className }: { uuid: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    dreamsApi.image(uuid)
      .then(blob => { if (!alive) return; url = URL.createObjectURL(blob); setSrc(url); })
      .catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [uuid]);
  if (!src) return null;
  return <>
    <button type="button" className={className || 'dream-image'} onClick={() => setExpanded(true)} aria-label="Expand the painting of the dream">
      <img src={src} alt="A painting of the dream" loading="lazy" />
    </button>
    {expanded && <DreamLightbox src={src} onClose={() => setExpanded(false)} />}
  </>;
}

/** The whole painting, uncropped, over everything. Escape, the backdrop or ✕ closes it. */
function DreamLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return createPortal(<div className="dream-lightbox" role="dialog" aria-modal="true" aria-label="The painting of the dream">
    <button type="button" className="dream-lightbox-backdrop" aria-label="Close" onClick={onClose} />
    <img src={src} alt="A painting of the dream" />
    <button type="button" className="dream-lightbox-close" aria-label="Close the painting" onClick={onClose} autoFocus>✕</button>
  </div>, document.body);
}

const nightLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : date;
};

/** The few numbers that say how busy a night was, as chips. */
function statChips(d: Dream): string[] {
  const s = d.stats || {};
  const chips: string[] = [];
  const steps = (s.steps_ok ?? 0) + (s.steps_failed ?? 0);
  if (steps) chips.push(`${steps} step${steps === 1 ? '' : 's'}${s.steps_failed ? ` · ${s.steps_failed} stumbled` : ''}`);
  if (s.focus) chips.push(`${s.focus} memor${s.focus === 1 ? 'y' : 'ies'} sorted`);
  if (s.purged) chips.push(`${s.purged} forgotten row${s.purged === 1 ? '' : 's'} cleared`);
  if (s.questions_asked) chips.push(`${s.questions_asked} question${s.questions_asked === 1 ? '' : 's'} for you`);
  return chips;
}

const STATUS_LINE: Record<Dream['status'], string> = {
  ok: 'a full night',
  partial: 'a restless night — some steps stumbled',
  failed: 'a night that didn’t hold together',
  skipped: 'no dream — her database isn’t set up',
  running: 'still dreaming',
};

/** Dashboard: "Last night's dream". */
export function DreamCard({ onOpen, onAsk }: { onOpen: () => void; onAsk: (text: string) => void }) {
  const [dream, setDream] = useState<Dream | null | undefined>(undefined);
  const [plain, setPlain] = useState(false);
  useEffect(() => {
    let alive = true;
    dreamsApi.latest().then(r => { if (alive) setDream(r.dream); }).catch(() => { if (alive) setDream(null); });
    return () => { alive = false; };
  }, []);

  // Loading or unreachable: the briefing is complete without it.
  if (dream === undefined) return null;

  // Same anatomy as every other dashboard card — icon and title that open the
  // page, a chevron, and the full-width link along the bottom — in its own
  // night-time colours.
  const head = <div className="dream-card-head">
    <button className="dream-card-heading" onClick={onOpen}>
      <DashboardIcon name="Dreams" />
      <h2>Last night’s dream</h2>
      {dream && <small className="dream-date">{nightLabel(dream.date)} · {STATUS_LINE[dream.status]}</small>}
    </button>
    <button className="dream-card-chevron" onClick={onOpen} aria-label="Open Dreams">›</button>
  </div>;
  const footer = <button className="dream-card-action" onClick={onOpen}>View all dreams<span>↗</span></button>;

  if (!dream) {
    return <section className="dream-card dream-card-quiet" id="dashboard-dreams">
      {head}
      <div className="dream-card-body"><p className="dream-quiet-line">I haven’t dreamed yet. Once I do, I’ll tell you about it here.</p></div>
      {footer}
    </section>;
  }

  const body = plain || !dream.narrative ? dream.summary || 'I looked things over and left them as they were.' : dream.narrative;
  return <section className="dream-card" id="dashboard-dreams">
    {head}
    <div className="dream-card-body">
      {dream.hasImage && !plain && <DreamImage uuid={dream.uuid} />}
      <div className={plain || !dream.narrative ? 'dream-plain' : 'dream-narrative'}><Paragraphs text={body} /></div>
      {statChips(dream).length > 0 && <ul className="dream-chips">{statChips(dream).map(c => <li key={c}>{c}</li>)}</ul>}
      <div className="dream-actions">
        {dream.narrative && <button className="dream-secondary" onClick={() => setPlain(v => !v)}>{plain ? 'Tell it as a dream' : 'What actually happened'}</button>}
        <button className="dream-secondary" onClick={() => onAsk('Tell me about what you dreamed last night.')}>Ask her about it <span>↗</span></button>
      </div>
    </div>
    {footer}
  </section>;
}

function StepLog({ uuid }: { uuid: string }) {
  const [steps, setSteps] = useState<DreamStep[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    dreamsApi.night(uuid)
      .then(r => { if (alive) setSteps(r.dream?.steps || []); })
      .catch(e => { if (alive) setError((e as Error).message || 'Couldn’t load the log.'); });
    return () => { alive = false; };
  }, [uuid]);
  if (error) return <p className="dashboard-empty" role="status">{error}</p>;
  if (!steps) return <p className="source-note">Reading the log…</p>;
  if (!steps.length) return <p className="dashboard-empty">Nothing was recorded for this night.</p>;
  return <ol className="dream-steps">{steps.map(s => <li key={s.seq} className={s.ok ? '' : 'dream-step-failed'}>
    <div className="dream-step-head">
      <span className="dream-step-kind">{s.kind}</span>
      {s.round > 0 && <small>round {s.round}</small>}
      {s.affectedRows != null && <small>{s.affectedRows} row{s.affectedRows === 1 ? '' : 's'}</small>}
      {s.ms != null && <small>{s.ms} ms</small>}
      {!s.ok && <small className="dream-step-flag">failed</small>}
    </div>
    {s.why && <p className="dream-step-why">{s.why}</p>}
    {s.statement && <pre>{s.statement}</pre>}
    {s.error && <p className="dream-step-error">{s.error}</p>}
  </li>)}</ol>;
}

function NightEntry({ dream }: { dream: Dream }) {
  const [open, setOpen] = useState(false);
  return <article className={`dream-night dream-night-${dream.status}`}>
    <header>
      <h3>{nightLabel(dream.date)}</h3>
      <span>{STATUS_LINE[dream.status]}</span>
    </header>
    {dream.hasImage && <DreamImage uuid={dream.uuid} />}
    {dream.narrative && <div className="dream-narrative"><Paragraphs text={dream.narrative} /></div>}
    {dream.summary && <>
      <p className="source-note">What actually happened</p>
      <div className="dream-plain"><Paragraphs text={dream.summary} /></div>
    </>}
    {statChips(dream).length > 0 && <ul className="dream-chips">{statChips(dream).map(c => <li key={c}>{c}</li>)}</ul>}
    {dream.status !== 'skipped' && <button className="dream-secondary" onClick={() => setOpen(v => !v)} aria-expanded={open}>
      {open ? 'Hide the log' : 'Show every step'}
    </button>}
    {open && <StepLog uuid={dream.uuid} />}
  </article>;
}

/** The Dreams page: the last 30 nights, newest first. */
export function DreamsPage({ ctx }: { ctx: SectionContext }) {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [questions, setQuestions] = useState<DreamQuestion[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    dreamsApi.list()
      .then(r => { if (alive) setDreams(r.dreams); })
      .catch(e => { if (alive) { setDreams([]); setError((e as Error).message || 'The Dreams log couldn’t load.'); } });
    dreamsApi.questions().then(r => { if (alive) setQuestions(r.questions); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const nights = dreams || [];
  const dreamt = nights.filter(d => d.status !== 'skipped');
  const waiting = questions.filter(q => q.status === 'pending');
  const answered = questions.filter(q => q.status === 'answered');
  const steps = dreamt.reduce((n, d) => n + (d.stats?.steps_ok ?? 0) + (d.stats?.steps_failed ?? 0), 0);

  return <SectionPage ctx={ctx}
    eyebrow="WHILE YOU SLEPT" title="Dreams"
    blurb="Each night I go back over what you’ve told me and give it shape — tables, connections, the odd tidy-up. Here’s every night from the last thirty, as I dreamed it and as it actually happened."
    ask="Tell me about what you dreamed last night, and what you organized."
    stats={<>
      <Stat label="Nights" value={dreams ? dreamt.length : '…'} note="dreamed in the last 30 days" tone={dreamt.length ? 'good' : 'idle'} />
      <Stat label="Steps" value={dreams ? steps : '…'} note="statements run in my own database" />
      <Stat label="Questions" value={waiting.length} note={waiting.length ? 'I’m holding for you' : 'nothing waiting'} tone={waiting.length ? 'ok' : 'idle'} />
    </>}
  >
    {(waiting.length > 0 || answered.length > 0) && <Panel title="Questions I’m holding for you" note="I’ll ask when the moment’s right">
      {waiting.length > 0 && <ul className="dashboard-data-list">{waiting.map(q => <li key={q.uuid}><strong>{q.question}</strong><small>since {new Date(q.askedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></li>)}</ul>}
      {waiting.length > 0 && <button className="dashboard-chat-cta" onClick={() => ctx.onAsk('You had a question for me from your dreaming — go ahead and ask.')}>Answer now <span>↗</span></button>}
      {answered.length > 0 && <>
        <p className="source-note">Settled recently</p>
        <ul className="dashboard-data-list">{answered.slice(0, 5).map(q => <li key={q.uuid}><strong>{q.question}</strong>{q.answer && <small>{q.answer}</small>}</li>)}</ul>
      </>}
    </Panel>}
    <Panel title="The last thirty nights" note={dreams ? `${nights.length} night${nights.length === 1 ? '' : 's'}` : undefined} wide>
      {!dreams ? <p className="source-note">Remembering…</p>
        : error ? <p className="dashboard-empty" role="status">{error}</p>
          : !nights.length ? <p className="dashboard-empty">No dreams yet. The first one happens overnight once my database is set up.</p>
            : nights.map(d => <NightEntry key={d.uuid} dream={d} />)}
    </Panel>
  </SectionPage>;
}
