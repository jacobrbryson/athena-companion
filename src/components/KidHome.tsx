import { useEffect, useState, type ReactNode } from 'react';
import { AthenaAvatar } from './AthenaAvatar';
import { IspyGame } from './IspyGame';
import { ProfileAvatar } from './ProfileAvatar';
import { GUARDIANS_HEADER } from './GuardiansOverview';
import { kidApi, kidSound, photoForProof, type KidGuardian, type KidHome as KidHomeData, type KidSafety, type KidStep, type StopState } from '../api/kid';
import './kid.css';

/**
 * A kid's Companion (owner, 11-23): the Guardians theme made playful, for old
 * tablets held sideways. Base, Missions, Team and Me are here; the Athena tab
 * is the console's own chat. No cameras, controls, codes or other families'
 * details beyond first names — the server never sends them.
 */
export type KidTab = 'base' | 'missions' | 'team' | 'me';

const TABS: { key: KidTab | 'athena'; label: string; icon: string }[] = [
  { key: 'base', label: 'Base', icon: '🏠' },
  { key: 'missions', label: 'Missions', icon: '🗺️' },
  { key: 'athena', label: 'Athena', icon: '' },
  { key: 'team', label: 'Team', icon: '👥' },
  { key: 'me', label: 'Me', icon: '🛡️' },
];

const ROLE_ICON: Record<string, string> = { Pathfinder: '🧭', Tracker: '🐾', Builder: '🛠️', Explorer: '🔭', Creator: '🎨', Sage: '📜', Recruit: '⭐' };
const roleIcon = (role: string) => ROLE_ICON[role] || '⭐';

/** Athena's opening line. Written ahead of time, never improvised. */
function greeting(name: string | null, hasStep: boolean, now = new Date()): string {
  const h = now.getHours();
  const hello = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  const who = name || 'Guardian';
  if (hasStep) return `${hello}, ${who}. I could use a Guardian right now.`;
  const calm = [
    `${hello}, ${who}. All quiet. I'm keeping watch.`,
    `${hello}, ${who}. Nothing moving out there. Yet.`,
    `${hello}, ${who}. Base is secure. Good to see you.`,
  ];
  return calm[now.getDate() % calm.length];
}

/** When, in words a seven-year-old uses. */
function ago(at: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 31) return `${Math.round(days / 7)} weeks ago`;
  if (days < 60) return 'last month';
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return 'over a year ago';
}

/** Minutes left on an opened step, ticking. Null when it has no clock. */
function useTimeLeft(dueAt: string | null): { left: number; total: number } | null {
  const [now, setNow] = useState(Date.now());
  const [openedAt] = useState(Date.now());
  useEffect(() => {
    if (!dueAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [dueAt]);
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  return { left: Math.max(0, due - now), total: Math.max(60_000, due - openedAt) };
}

function TimerRing({ dueAt }: { dueAt: string | null }) {
  const t = useTimeLeft(dueAt);
  if (!t) return null;
  const share = Math.min(1, t.left / t.total);
  const mins = Math.floor(t.left / 60000);
  const secs = Math.floor((t.left % 60000) / 1000);
  const late = t.left === 0;
  return (
    <div className={`kid-timer${late ? ' kid-timer-late' : share < 0.25 ? ' kid-timer-low' : ''}`} role="timer" aria-label={late ? 'Time is up' : `${mins} minutes ${secs} seconds left`}>
      <svg viewBox="0 0 44 44" aria-hidden><circle cx="22" cy="22" r="19" className="kid-timer-track" /><circle cx="22" cy="22" r="19" className="kid-timer-fill" style={{ strokeDasharray: `${share * 119.4} 119.4` }} /></svg>
      <span>{late ? '⏰' : mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}:${String(secs).padStart(2, '0')}`}</span>
    </div>
  );
}

const KIT_ICONS: [RegExp, string, string][] = [
  [/bag/, '🎒', 'Carries everything.'],
  [/letter/, '✉️', 'Keep it safe. It may matter later.'],
  [/card/, '🪪', 'Proves you are a Guardian.'],
  [/paper clip/, '📎', 'Pries open or resets small things.'],
  [/coin/, '🪙', 'Mysterious. Their meaning is still unfolding.'],
  [/notebook/, '📓', 'Write down every clue.'],
  [/blacklight/, '🔦', 'Reveals messages in invisible ink.'],
  [/pen/, '🖊️', 'For your notebook.'],
  [/compass/, '🧭', 'Gives bearings and directions.'],
  [/magnif/, '🔍', 'Shows tiny details too small to read.'],
];
const kitItem = (text: string) => {
  const hit = KIT_ICONS.find(([re]) => re.test(text.toLowerCase()));
  const name = text.replace(/^(a|an|two)\s+/i, '').replace(/ to carry it all$/, '');
  return { icon: hit?.[1] || '🎁', name: name.charAt(0).toUpperCase() + name.slice(1), tip: hit?.[2] || '' };
};

function safetyLines(safety: KidSafety | string | null): string[] {
  if (!safety) return [];
  if (typeof safety === 'string') return [safety];
  return [safety.where, safety.supervision, safety.offLimits].filter((s): s is string => Boolean(s && s.trim()));
}

export function KidRail({ tab, inChat, waiting, onTab, onAthena }: {
  tab: KidTab; inChat: boolean; waiting: number; onTab: (t: KidTab) => void; onAthena: () => void;
}) {
  return (
    <nav className="kid-rail" aria-label="Guardian navigation">
      <div className="kid-rail-brand" aria-hidden><span>GUARDIANS</span></div>
      {TABS.map(t => {
        const active = t.key === 'athena' ? inChat : !inChat && tab === t.key;
        const badge = (t.key === 'base' || t.key === 'missions') && waiting > 0 && !active;
        return (
          <button key={t.key} type="button" className={`kid-rail-btn${t.key === 'athena' ? ' kid-rail-athena' : ''}${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => (t.key === 'athena' ? onAthena() : onTab(t.key as KidTab))}>
            {t.key === 'athena' ? <AthenaAvatar className="kid-rail-face" /> : <span className="kid-rail-icon" aria-hidden>{t.icon}</span>}
            <span>{t.label}</span>
            {badge && <i className="kid-badge">{waiting}</i>}
          </button>
        );
      })}
    </nav>
  );
}

function Card({ className = '', icon, title, aside, children }: { className?: string; icon: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`kid-card ${className}`}>
      <header><span aria-hidden>{icon}</span><h2>{title}</h2>{aside && <div className="kid-card-aside">{aside}</div>}</header>
      {children}
    </section>
  );
}

function LevelBadge({ level }: { level: number }) {
  return <span className="kid-level">⭐ Level {level}</span>;
}

/** The big "what do I do now" card. Hidden behind a calm state when nothing is asked. */
function YourMove({ data, onAct, onAthena, onIspy }: { data: KidHomeData; onAct: (fn: () => Promise<unknown>, cheer?: boolean) => Promise<void>; onAthena: () => void; onIspy?: () => void }) {
  const step: KidStep | undefined = data.steps[0];
  const ready = data.ready[0];
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const trail = step ? data.trails.find(t => t.title === step.mission) : undefined;
  const stepNo = trail ? trail.stops.findIndex(s => s === 'current') + 1 : 0;

  async function run(fn: () => Promise<unknown>, cheer = false) {
    setBusy(true); setNote('');
    try { await onAct(fn, cheer); } catch (err) { setNote((err as Error)?.message || 'That didn’t go through. Try again?'); }
    finally { setBusy(false); }
  }

  if (!step && ready) {
    return (
      <Card className="kid-move" icon="🎯" title="Your move" aside={<span className="kid-pill">READY</span>}>
        <h3>{ready.title}</h3>
        <p className="kid-move-text">A new quest is ready. Press Go when your grown-up says it's time.</p>
        <div className="kid-move-actions"><button type="button" className="kid-btn kid-btn-primary" disabled={busy} onClick={() => run(() => kidApi.go(ready.uuid), true)}>▶ Go!</button></div>
        {note && <p className="kid-note">{note}</p>}
      </Card>
    );
  }
  if (!step) {
    const last = data.reveals[0];
    return (
      <Card className="kid-move kid-move-quiet" icon="🎯" title="Your move">
        <div className="kid-quiet"><AthenaAvatar className="kid-quiet-face" /><div><h3>All quiet</h3><p>Athena is keeping watch. When she needs a Guardian, your mission shows up right here.</p></div></div>
        <Stats data={data} />
        {last && <div className="kid-last"><small>LAST QUEST</small><b>{last.title}</b><p>{last.reveal}</p></div>}
        <div className="kid-move-actions"><button type="button" className="kid-btn kid-btn-primary" onClick={onAthena}>💬 Talk to Athena</button></div>
      </Card>
    );
  }
  const opened = Boolean(step.dueAt);
  const rules = safetyLines(step.safety);
  const kidCanFinish = step.proof === 'none' || step.proof === 'kid_confirm';
  const needsPhoto = step.proof === 'photo';
  async function sendPhoto(file: File | undefined) {
    if (!file) return;
    await run(async () => {
      const { image, contentType } = await photoForProof(file);
      const out = await kidApi.photo(step!.uuid, image, contentType);
      setTimeout(() => setNote(out.correct === false ? out.why || 'That photo didn’t show it. Try again!' : out.correct ? 'Got it! 📸' : ''), 0);
      return out;
    });
  }
  return (
    <Card className="kid-move kid-move-live" icon="🎯" title="Your move" aside={<span className="kid-pill">MISSION ACTIVE</span>}>
      <div className="kid-move-head"><h3>{step.mission}</h3><TimerRing dueAt={step.dueAt} /></div>
      {stepNo > 0 && trail && <p className="kid-move-sub">Step {stepNo} of {trail.stops.length}</p>}
      <p className="kid-move-text"><span aria-hidden>🎯</span>{step.instruction}</p>
      {rules.length > 0 && (
        <div className="kid-safe"><strong>🛡️ STAY SAFE</strong><ul>{rules.map(r => <li key={r}>{r}</li>)}</ul></div>
      )}
      {step.proof === 'code' && opened && (
        <form className="kid-code" onSubmit={e => { e.preventDefault(); if (code.trim()) void run(() => kidApi.code(step.uuid, code.trim()), true).then(() => setCode('')); }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Type the secret code" aria-label="Secret code" autoCapitalize="characters" />
          <button type="submit" className="kid-btn kid-btn-primary" disabled={busy || !code.trim()}>Send</button>
        </form>
      )}
      <div className="kid-move-actions">
        {!opened && <button type="button" className="kid-btn kid-btn-primary" disabled={busy} onClick={() => run(() => kidApi.seen(step.uuid))}>▶ I'm on it!</button>}
        {kidCanFinish && <button type="button" className={`kid-btn${opened ? ' kid-btn-primary' : ''}`} disabled={busy} onClick={() => run(() => kidApi.done(step.uuid), true)}>✔ It's done</button>}
        {needsPhoto && opened && (
          <label className={`kid-btn kid-btn-primary kid-photo${busy ? ' is-busy' : ''}`}>
            📸 {busy ? 'Sending…' : 'Take the photo'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={e => { void sendPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
        {step.proof === 'parent_confirm' && opened && <p className="kid-note">When it's done, ask your grown-up to check it.</p>}
        {step.proof === 'camera_check' && opened && <p className="kid-note">Athena checks this one herself on the camera. Do your part and she'll know!</p>}
        {step.proof === 'game' && opened && onIspy && <button type="button" className="kid-btn kid-btn-primary" onClick={onIspy}>🔎 Play I Spy</button>}
      </div>
      {note && <p className="kid-note kid-note-warn">{note}</p>}
    </Card>
  );
}

/** What they've really done, as big friendly counters. */
function Stats({ data }: { data: KidHomeData }) {
  const me = data.me;
  if (!me) return null;
  const tiles: [string, string, number][] = [
    ['🔍', 'Clues found', me.finds],
    ['🔑', 'Trail keys', me.trailKeys || 0],
    ['🗺️', 'Map pieces', me.mapPieces || 0],
    ['🚀', 'Missions', me.missionsStarted || 0],
  ];
  return (
    <ul className="kid-stats">
      {tiles.map(([icon, label, n]) => <li key={label}><span aria-hidden>{icon}</span><b>{n}</b><small>{label}</small></li>)}
    </ul>
  );
}

const STOP_ICON: Record<StopState, string> = { done: '✓', current: '🔭', locked: '🔒' };

function Trail({ stops }: { stops: StopState[] }) {
  return (
    <ol className="kid-trail" aria-label="Mission steps">
      {stops.map((s, i) => <li key={i} className={`kid-stop kid-stop-${s}`} aria-label={`Step ${i + 1}: ${s === 'current' ? 'now' : s}`}><span>{STOP_ICON[s]}</span></li>)}
    </ol>
  );
}

function MissionCard({ data, onOpen }: { data: KidHomeData; onOpen: () => void }) {
  const t = data.trails[0];
  const at = t ? t.stops.findIndex(s => s === 'current') : -1;
  const done = t ? t.stops.filter(s => s === 'done').length : 0;
  const complete = Boolean(t && done === t.stops.length);
  return (
    <Card className="kid-mission" icon="🗺️" title={t ? `Mission: ${t.title}` : 'Mission map'}
      aside={t && <button type="button" className="kid-link" onClick={onOpen}>{complete ? 'Complete ✓' : `Step ${at >= 0 ? at + 1 : done} of ${t.stops.length}`} ›</button>}>
      {t ? <Trail stops={t.stops} /> : <p className="kid-empty">No mission right now. Your next adventure will appear on this map.</p>}
      {complete && <p className="kid-complete">🏁 You finished every step! Athena is checking how it went.</p>}
      {data.clues && data.clues.total > 0 && (
        <p className="kid-clues">Clues collected: {Array.from({ length: Math.min(data.clues.total, 8) }, (_, i) => <i key={i} className={i < data.clues!.found ? 'got' : ''} aria-hidden>{i < data.clues!.found ? '🔍' : ''}</i>)}<b>{data.clues.found}/{data.clues.total}</b></p>
      )}
    </Card>
  );
}

function TaughtAthena({ data }: { data: KidHomeData }) {
  const top = [...data.athena].sort((a, b) => b.percent - a.percent);
  return (
    <Card className="kid-taught" icon="🧠" title="You taught Athena">
      {data.reveals.slice(0, 2).map(r => (
        <div key={r.uuid} className="kid-taught-row kid-taught-reveal"><span aria-hidden>✨</span><p><b>{r.title}</b>{r.reveal}</p></div>
      ))}
      <div className="kid-taught-bars">
        {top.map(a => (
          <div key={a.key} className="kid-taught-row">
            <span className="kid-taught-name">{a.name}</span>
            <span className="kid-bar"><i style={{ width: `${Math.max(3, a.percent)}%` }} /></span>
            <b>{a.percent}%</b>
          </div>
        ))}
      </div>
      {!data.reveals.length && <p className="kid-hint">Every mission you finish helps her grow.</p>}
    </Card>
  );
}

function SquadFeed({ data }: { data: KidHomeData }) {
  const who = data.adventure?.label || 'The Guardians';
  const n = data.weekFinds || 0;
  return (
    <Card className="kid-feed" icon="👥" title="Squad feed">
      <p className="kid-week"><span aria-hidden>🌎</span>{n ? <><b>{who}</b> found <b>{n}</b> clue{n === 1 ? '' : 's'} this week!</> : <><b>{who}</b> haven't found a clue this week. Yet!</>}</p>
      {data.feed.length ? (
        <ul>{data.feed.slice(0, 6).map((f, i) => <li key={i}><span aria-hidden>{/found/.test(f.text) ? '🔍' : /key/.test(f.text) ? '🔑' : '🗺️'}</span><p><b>{f.who}</b> {f.text}</p><small>{ago(f.at)}</small></li>)}</ul>
      ) : <p className="kid-empty">When your squad finds something, it shows up here.</p>}
    </Card>
  );
}

function GuardianCard({ data, picture, big = false }: { data: KidHomeData; picture?: string | null; big?: boolean }) {
  const me = data.me;
  const name = data.name || 'Guardian';
  if (!me) return null;
  return (
    <Card className={`kid-gcard${big ? ' kid-gcard-big' : ''}`} icon="🃏" title="Your Guardian card">
      <div className="kid-gcard-body">
        <span className="kid-gcard-photo"><ProfileAvatar picture={picture} name={name} /></span>
        <div className="kid-gcard-main">
          <h3>{name}</h3>
          <div className="kid-gcard-tags"><LevelBadge level={me.level} /><span className="kid-role">{roleIcon(me.role)} {me.role}</span></div>
        </div>
        <div className="kid-gcard-skill"><small>Top skill</small><b>{me.topSkill ? `${me.topSkill.badge || '🏅'} ${me.topSkill.name}` : '🌱 Still growing'}</b></div>
      </div>
      <div className="kid-xp"><small>XP to Level {me.level + 1}</small><span className="kid-bar"><i style={{ width: `${me.levelProgress}%` }} /></span><b>{me.xpPerLevel ? `${me.xp ?? 0} / ${me.xpPerLevel}` : `${me.levelProgress}%`}</b></div>
      {big && <p className="kid-hint">{me.finds ? `You've found ${me.finds} clue${me.finds === 1 ? '' : 's'}. ` : ''}Levels come from what you really do: check-ins, clues, keys and missions.</p>}
    </Card>
  );
}

function GuardianTile({ g, mine }: { g: KidGuardian; mine?: boolean }) {
  return (
    <li className={`kid-tile${mine ? ' kid-tile-mine' : ''}`}>
      <span className="kid-tile-face" aria-hidden>{g.name.slice(0, 1)}</span>
      <b>{g.name}</b>
      <small>{roleIcon(g.role)} {g.role}</small>
      <span className="kid-level kid-level-sm">⭐ {g.level}</span>
    </li>
  );
}

export function KidHome({ tab, data, error, picture, onTab, onAthena, onSignOut, act }: {
  tab: KidTab; data: KidHomeData | null; error: string; picture?: string | null;
  onTab: (t: KidTab) => void; onAthena: () => void; onSignOut: () => void;
  act: (fn: () => Promise<Partial<KidHomeData>>) => Promise<unknown>;
}) {
  const [cheer, setCheer] = useState(0);
  const onAct = async (fn: () => Promise<unknown>, celebrate = false) => {
    await act(fn as () => Promise<Partial<KidHomeData>>);
    if (celebrate) { setCheer(c => c + 1); kidSound.chime(); }
  };
  const [sound, setSound] = useState(kidSound.on());
  const [openSquad, setOpenSquad] = useState<string | null>(null);
  const [ispyOpen, setIspyOpen] = useState(false);
  const others = [...(data?.others || [])].sort((a, b) => a.name.localeCompare(b.name));
  const squads = data?.squads?.length ? data.squads : others.length ? [{ name: 'Other', members: others }] : [];

  if (!data) {
    return <div className="kid-home kid-loading"><AthenaAvatar className="kid-quiet-face" /><p>{error || 'Opening Base…'}</p></div>;
  }
  const line = greeting(data.name, data.steps.length > 0);

  return (
    <div className="kid-home">
      <header className="kid-hero" style={{ backgroundImage: `url(${GUARDIANS_HEADER})` }}>
        <AthenaAvatar className="kid-hero-face" />
        <button type="button" className="kid-bubble" onClick={onAthena}>{line}</button>
        {data.me && (
          <button type="button" className="kid-me-pill" onClick={() => onTab('me')}>
            <ProfileAvatar picture={picture} name={data.name || 'Guardian'} />
            <span><b>{data.name}</b><LevelBadge level={data.me.level} /></span>
          </button>
        )}
      </header>
      {cheer > 0 && <div key={cheer} className="kid-cheer" aria-live="polite"><span>🎉 Nice work, Guardian!</span>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
      {error && <p className="kid-note kid-note-warn">{error}</p>}
      {ispyOpen && <IspyGame onClose={() => setIspyOpen(false)} />}

      {!data.guardian && (
        <section className="kid-card kid-welcome"><h2>Welcome to Base!</h2><p>You're not on a Guardians team yet. Ask your grown-up to add you, then your missions show up here.</p></section>
      )}

      {tab === 'base' && data.guardian && (
        <div className="kid-grid">
          <YourMove data={data} onAct={onAct} onAthena={onAthena} onIspy={() => setIspyOpen(true)} />
          <div className="kid-col">
            <MissionCard data={data} onOpen={() => onTab('missions')} />
            <TaughtAthena data={data} />
          </div>
          <SquadFeed data={data} />
          <GuardianCard data={data} picture={picture} />
        </div>
      )}

      {tab === 'missions' && data.guardian && (
        <div className="kid-grid">
          <YourMove data={data} onAct={onAct} onAthena={onAthena} onIspy={() => setIspyOpen(true)} />
          <div className="kid-col">
            {data.steps[0]?.premise && <Card className="kid-story" icon="📖" title="The story so far"><p>{data.steps[0].premise}</p></Card>}
            <MissionCard data={data} onOpen={() => onTab('missions')} />
          </div>
          <Card className="kid-span" icon="📚" title="Your quest books" aside={data.history?.length ? <span className="kid-pill">{data.history.length} QUEST{data.history.length === 1 ? '' : 'S'}</span> : undefined}>
            {data.history?.length ? (
              <ul className="kid-books">{data.history.map((h, i) => (
                <li key={h.uuid} className={`kid-book kid-book-${i % 5}`}>
                  <span className="kid-book-spine" aria-hidden />
                  <b>{h.title}</b>
                  <small>{h.finished ? '🏆 Finished' : '⏹ Ended early'}{h.endedAt ? ` · ${ago(h.endedAt)}` : ''}</small>
                  {h.reveal ? <p>{h.reveal}</p> : <p className="kid-book-locked">Athena hasn't told this one's secret yet.</p>}
                </li>
              ))}</ul>
            ) : <p className="kid-empty">Finish a quest and it joins your shelf, with what you really helped Athena learn.</p>}
          </Card>
        </div>
      )}

      {tab === 'team' && data.guardian && (
        <div className="kid-stack">
          <Card icon="🛡️" title={data.squadName ? `${data.squadName} squad` : 'Your squad'}>
            <ul className="kid-tiles kid-tiles-big">
              {data.squad.map(g => <GuardianTile key={g.name} g={g} mine={g.name === data.name} />)}
              <li className="kid-tile kid-tile-athena"><AthenaAvatar className="kid-tile-face" /><b>Athena</b><small>🧠 Learning</small></li>
            </ul>
          </Card>
          <Card icon="⭐" title="Specialists">
            {data.specialists?.length ? (
              <ul className="kid-specialists">{data.specialists.map(s => (
                <li key={s.skill}><span aria-hidden>{s.badge || '🏅'}</span><b>{s.skill}</b><small>{s.who.map(w => `${w.name}${w.level === 'learning' ? ' (learning)' : ''}`).join(', ')}</small></li>
              ))}</ul>
            ) : <p className="kid-empty">No specialists yet. When a grown-up sees you master a skill, like Morse code or a compass, you'll show up here.</p>}
          </Card>
          {squads.length > 0 && (
            <Card icon="🌎" title={data.adventure?.label || 'All Guardians'} aside={<span className="kid-pill">{others.length + data.squad.length} GUARDIANS</span>}>
              <ul className="kid-squads">{squads.map(s => {
                const open = openSquad === s.name;
                return (
                  <li key={s.name} className={open ? 'open' : ''}>
                    <button type="button" aria-expanded={open} onClick={() => setOpenSquad(open ? null : s.name)}>
                      <b>{s.name === 'Other' ? 'Other Guardians' : `${s.name} squad`}</b>
                      <span className="kid-squad-faces" aria-hidden>{s.members.slice(0, 4).map(m => <i key={m.name}>{m.name.slice(0, 1)}</i>)}</span>
                      <small>{s.members.length} Guardian{s.members.length === 1 ? '' : 's'}</small>
                      <span className="kid-squad-caret" aria-hidden>{open ? '▴' : '▾'}</span>
                    </button>
                    {open && <ul className="kid-tiles">{s.members.map(g => <GuardianTile key={g.name} g={g} />)}</ul>}
                  </li>
                );
              })}</ul>
            </Card>
          )}
          <SquadFeed data={data} />
        </div>
      )}

      {tab === 'me' && (
        <div className="kid-stack">
          {data.guardian && <GuardianCard data={data} picture={picture} big />}
          {data.guardian && !!data.skills?.length && (
            <div className="kid-two">
              <Card icon="📊" title="Your skills">
                <ul className="kid-skillbars">{data.skills.map(s => (
                  <li key={s.name}><span aria-hidden>{s.badge || '🏅'}</span><b>{s.name}</b>
                    <span className="kid-bar"><i style={{ width: s.level === 'reliable' ? '100%' : s.level === 'learning' ? '50%' : '0%' }} /></span>
                    <small>{s.level === 'reliable' ? 'Mastered!' : s.level === 'learning' ? 'Learning' : 'Not yet'}</small></li>
                ))}</ul>
              </Card>
              <Card icon="🏅" title="Badges" aside={<span className="kid-pill">{data.skills.filter(s => s.level === 'reliable').length} / {data.skills.length}</span>}>
                <ul className="kid-badges">{data.skills.map(s => (
                  <li key={s.name} className={`kid-badge-${s.level}`} title={s.name}><span aria-hidden>{s.level === 'untested' ? '❔' : s.badge || '🏅'}</span><small>{s.level === 'untested' ? '???' : s.name}</small></li>
                ))}</ul>
              </Card>
            </div>
          )}
          {!!data.kit?.length && (
            <Card icon="🎒" title="Field kit">
              <ul className="kid-kit">{data.kit.map(k => { const it = kitItem(k); return <li key={k}><span aria-hidden>{it.icon}</span><b>{it.name}</b>{it.tip && <small>{it.tip}</small>}</li>; })}</ul>
            </Card>
          )}
          <Card icon="⚙️" title="Settings">
            <div className="kid-settings">
              {data.stopWord && <p className="kid-stopword">🛑 Say <b>“{data.stopWord}”</b> anytime and Athena stops.</p>}
              <button type="button" className={`kid-toggle${sound ? ' on' : ''}`} aria-pressed={sound} onClick={() => { kidSound.set(!sound); setSound(!sound); if (!sound) setTimeout(() => kidSound.chime(), 0); }}>
                <span aria-hidden>{sound ? '🔊' : '🔇'}</span>Sounds {sound ? 'on' : 'off'}<i aria-hidden />
              </button>
              <button type="button" className="kid-btn" onClick={onSignOut}>Sign out</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Above a kid's chat with Athena: the quest they're on, and the stop word in
 * plain sight. The chat itself is the console's own.
 */
export function KidChatBanner({ data, onMission }: { data: KidHomeData | null; onMission: () => void }) {
  if (!data?.guardian) return null;
  const step = data.steps[0];
  const trail = data.trails[0];
  return (
    <div className="kid-chat-banner">
      {step || trail ? (
        <button type="button" onClick={onMission}><span aria-hidden>🗺️</span><b>{step ? step.mission : trail!.title}</b>{step ? <em>Your move is waiting</em> : null}<span aria-hidden>›</span></button>
      ) : <p><span aria-hidden>🛡️</span>All quiet at Base.</p>}
      {data.stopWord && <p className="kid-chat-stop">🛑 Say <b>“{data.stopWord}”</b> anytime to stop.</p>}
    </div>
  );
}
