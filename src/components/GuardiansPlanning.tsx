import { useEffect, useState } from 'react';
import { guardianMissionsApi as gm, type GmDraft, type GmPlanning } from '../api/guardianMissions';
import { Drawer } from './Drawer';

const READY_LABEL: Record<GmDraft['readiness']['label'], string> = {
  ready: 'Ready',
  needs_testing: 'Needs testing',
  needs_building: 'Needs building',
  blocked: 'Blocked',
};

/** What's running right now, so the person sees it where they acted and not just greyed-out buttons. */
type Work = { kind: 'drafting' } | { kind: 'revising' | 'starting' | 'inviting'; uuid: string } | { kind: 'saving' };

const WORK_LABEL: Record<Work['kind'], string> = {
  drafting: 'Athena is drafting plans. This can take a minute.',
  revising: 'Athena is revising this plan. This can take a minute.',
  starting: 'Starting this mission…',
  inviting: 'Sending the invitation…',
  saving: 'Saving…',
};

const Working = ({ label }: { label: string }) => <p className="gm-working" role="status"><i aria-hidden="true" />{label}</p>;

function DraftCard({ draft, busy, work, families, onRevise, onStart, onInvite }: { draft: GmDraft; busy: boolean; work: Work | null; families: { id: number; name: string }[]; onRevise: (note: string) => Promise<boolean>; onStart: () => void; onInvite: (family: number) => void }) {
  const [note, setNote] = useState('');
  const [family, setFamily] = useState('');
  const mine = work && 'uuid' in work && work.uuid === draft.uuid ? work : null;
  return <li className={`gm-mission gm-proposed${mine ? ' gm-mission-working' : ''}`} aria-busy={!!mine}>
    <div className="gm-mission-head">
      <strong>{draft.title}</strong>
      <span className="gm-chip">{READY_LABEL[draft.readiness.label]}</span>
    </div>
    {mine && <Working label={WORK_LABEL[mine.kind]} />}
    {draft.goal && <p className="gm-sub">{draft.goal}</p>}
    {draft.reason && <p>{draft.reason}</p>}
    {draft.readiness.reasons.length > 0 && <ul className="gm-go-problems">{draft.readiness.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    <details>
      <summary>The plan</summary>
      {draft.story && <div className="gm-quest">
        <small>What the kids see</small>
        <strong>{draft.story.title}</strong>
        <p>{draft.story.premise}</p>
      </div>}
      <ol className="gm-plan-steps">{draft.steps.map(s => <li key={s.key}>
        <small>{s.phase === 'prep' ? 'Prep' : 'Live'} · {s.actor} · {s.dueMinutes} min{s.predictMinutes ? `, she expects ${s.predictMinutes}` : ''}</small>
        <p>{s.instruction}</p>
        {s.quest && <div className="gm-quest"><small>{s.actor} reads</small><p>{s.quest}</p></div>}
      </li>)}</ol>
      {draft.story?.reveal && <div className="gm-quest">
        <small>Told to the kids afterwards</small>
        <p>{draft.story.reveal}</p>
      </div>}
      <h4>How it's graded</h4>
      <ul className="gm-plan-list">{draft.passCriteria.map(c => <li key={c.key}>{c.text}</li>)}</ul>
      {draft.safety && <>
        <h4>Safety</h4>
        <ul className="gm-plan-list">
          <li>Where: {draft.safety.where}</li>
          <li>Supervision: {draft.safety.supervision}</li>
          <li>Off limits: {draft.safety.offLimits}</li>
        </ul>
      </>}
    </details>
    {draft.template && <div className="gm-row"><button type="button" className="gm-btn gm-btn-primary" disabled={busy} onClick={onStart}>{mine?.kind === 'starting' ? 'Starting…' : `Start under ${draft.template.name}`}</button></div>}
    {families.length > 0 && <div className="gm-row">
      <label>Invite a family
        <select value={family} onChange={e => setFamily(e.target.value)}><option value="">Choose</option>{families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      </label>
      <button type="button" className="gm-btn" disabled={busy || !family} onClick={() => { onInvite(Number(family)); setFamily(''); }}>{mine?.kind === 'inviting' ? 'Inviting…' : 'Invite'}</button>
    </div>}
    <form className="gm-scout" onSubmit={e => { e.preventDefault(); if (note.trim()) void onRevise(note).then(ok => { if (ok) setNote(''); }); }}>
      <label>What should change?
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Tell Athena what to change" disabled={busy} />
      </label>
      <button type="submit" className="gm-btn" disabled={busy || !note.trim()}>{mine?.kind === 'revising' ? 'Revising…' : 'Revise'}</button>
    </form>
  </li>;
}

/** Working through plans with Athena. Approving stays where it always was, on the Missions tab. */
export function PlanMissionDrawer({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [view, setView] = useState<GmPlanning | null>(null);
  const [note, setNote] = useState('');
  const [work, setWork] = useState<Work | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const busy = !!work;

  useEffect(() => {
    gm.planning().then(setView).catch(() => { setLoadFailed(true); setMessage("Planning isn't available right now."); });
  }, []);

  const run = async (doing: Work, task: () => Promise<GmPlanning>) => {
    setWork(doing);
    setMessage(null);
    try {
      setView(await task());
      onChanged();
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That did not work.');
      return false;
    } finally {
      setWork(null);
    }
  };

  const draft = () => run({ kind: 'drafting' }, async () => {
    const out = await gm.draft(note.trim() || undefined);
    setNote('');
    const dropped = out.dropped.map(d => `${d.title}: ${d.problems[0]}`).join(' ');
    if (out.skipped || dropped) window.setTimeout(() => setMessage(out.skipped || `Athena's plan didn't pass its checks. ${dropped}`), 0);
    return out.workspace;
  });

  const room = view ? view.drafts.length < view.maxDrafts : false;

  return <Drawer eyebrow="Guardians" title="Plan a mission" onClose={onClose}>
    <div className="gm-dr">
      {work && <div className="gm-work-bar"><Working label={WORK_LABEL[work.kind]} /></div>}
      {!view && !loadFailed && <Working label="Loading her plans…" />}
      {message && <p className="gm-sub" role="status">{message}</p>}
      {view && <>
        <section>
          <h3>Where she's weakest</h3>
          <ul className="gm-weakest">{view.evaluation.weakest.map(a => <li key={a.key}>
            <div className="gm-weakest-head"><b>{a.name}</b><span>{a.percent}%</span></div>
            <div className="gm-weakest-bar" aria-hidden="true"><i style={{ width: `${Math.max(a.percent, 1)}%` }} /></div>
            {a.unproven.length > 0 && <small>Not proven yet: {a.unproven.join(', ')}</small>}
          </li>)}</ul>
        </section>
        <section>
          <h3>What's gone wrong</h3>
          {view.evaluation.weaknesses.length
            ? <ul className="gm-plan-list">{view.evaluation.weaknesses.map(w => <li key={w.id}>{w.summary}</li>)}</ul>
            : <p className="gm-sub">Nothing yet. Missions will show her.</p>}
        </section>
        <section>
          <h3>Ask for a plan</h3>
          <label className="gm-plan-ask">Anything she should aim for? (optional)
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={2} />
          </label>
          <button type="button" className="gm-btn gm-btn-primary" disabled={busy || !room} onClick={() => void draft()}>{work?.kind === 'drafting' ? 'Drafting…' : 'Draft plans'}</button>
          {!room && <p className="gm-sub">{view.maxDrafts} plans are waiting. Decide on those first.</p>}
        </section>
        <section>
          <h3>Waiting for your decision</h3>
          {view.drafts.length || work?.kind === 'drafting'
            ? <ul className="gm-missions">
              {work?.kind === 'drafting' && <li className="gm-mission gm-mission-working gm-draft-coming" aria-hidden="true"><b /><b /><b /></li>}
              {view.drafts.map(d => <DraftCard key={d.uuid} draft={d} busy={busy} work={work} onRevise={text => run({ kind: 'revising', uuid: d.uuid }, () => gm.revise(d.uuid, text))} families={view.families || []} onInvite={f => void run({ kind: 'inviting', uuid: d.uuid }, () => gm.invite(d.uuid, f))} onStart={() => void run({ kind: 'starting', uuid: d.uuid }, () => gm.startTemplated(d.uuid))} />)}
            </ul>
            : <p className="gm-sub">No drafts yet.</p>}
          {view.drafts.length > 0 && <p className="gm-sub">Approve or decline these on the Missions tab.</p>}
        </section>
        <section>
          <h3>What she wishes she had</h3>
          {view.wishes.length
            ? <ul className="gm-plan-list">{view.wishes.map(w => <li key={w.uuid}>
              <b>{w.name}</b>{w.cost ? ` (${w.cost})` : ''}: {w.why}
              <div className="gm-row">
                <button type="button" className="gm-btn" disabled={busy} onClick={() => void run({ kind: 'saving' }, () => gm.decideWish(w.uuid, 'built'))}>It's built</button>
                <button type="button" className="gm-btn" disabled={busy} onClick={() => void run({ kind: 'saving' }, () => gm.decideWish(w.uuid, 'declined'))}>Not doing this</button>
              </div>
            </li>)}</ul>
            : <p className="gm-sub">Nothing on the wishlist.</p>}
        </section>
      </>}
    </div>
  </Drawer>;
}
