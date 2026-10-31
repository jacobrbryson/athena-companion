import { useEffect, useState } from 'react';
import { guardianMissionsApi as gm, type GmDraft, type GmPlanning } from '../api/guardianMissions';
import { Drawer } from './Drawer';

const READY_LABEL: Record<GmDraft['readiness']['label'], string> = {
  ready: 'Ready',
  needs_testing: 'Needs testing',
  needs_building: 'Needs building',
  blocked: 'Blocked',
};

function DraftCard({ draft, busy, onRevise, onStart }: { draft: GmDraft; busy: boolean; onRevise: (note: string) => void; onStart: () => void }) {
  const [note, setNote] = useState('');
  return <li className="gm-mission gm-proposed">
    <div className="gm-mission-head">
      <strong>{draft.title}</strong>
      <span className="gm-chip">{READY_LABEL[draft.readiness.label]}</span>
    </div>
    {draft.goal && <p className="gm-sub">{draft.goal}</p>}
    {draft.reason && <p>{draft.reason}</p>}
    {draft.readiness.reasons.length > 0 && <ul className="gm-go-problems">{draft.readiness.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    <details>
      <summary>The plan</summary>
      <ol className="gm-plan-steps">{draft.steps.map(s => <li key={s.key}>
        <small>{s.phase === 'prep' ? 'Prep' : 'Live'} · {s.actor} · {s.dueMinutes} min{s.predictMinutes ? `, she expects ${s.predictMinutes}` : ''}</small>
        <p>{s.instruction}</p>
      </li>)}</ol>
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
    {draft.template && <div className="gm-row"><button type="button" className="gm-btn gm-btn-primary" disabled={busy} onClick={onStart}>Start under {draft.template.name}</button></div>}
    <form className="gm-scout" onSubmit={e => { e.preventDefault(); if (note.trim()) { onRevise(note); setNote(''); } }}>
      <label>What should change?
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Tell Athena what to change" />
      </label>
      <button type="submit" className="gm-btn" disabled={busy || !note.trim()}>Revise</button>
    </form>
  </li>;
}

/** Working through plans with Athena. Approving stays where it always was, on the Missions tab. */
export function PlanMissionDrawer({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [view, setView] = useState<GmPlanning | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    gm.planning().then(setView).catch(() => setMessage("Planning isn't available right now."));
  }, []);

  const run = async (work: () => Promise<GmPlanning>, then?: string) => {
    setBusy(true);
    setMessage(then ? 'Athena is thinking. This can take a minute.' : null);
    try {
      setView(await work());
      setMessage(null);
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const draft = () => run(async () => {
    const out = await gm.draft(note.trim() || undefined);
    setNote('');
    const dropped = out.dropped.map(d => `${d.title}: ${d.problems[0]}`).join(' ');
    if (out.skipped || dropped) window.setTimeout(() => setMessage(out.skipped || `Athena's plan didn't pass its checks. ${dropped}`), 0);
    return out.workspace;
  }, 'drafting');

  const room = view ? view.drafts.length < view.maxDrafts : false;

  return <Drawer eyebrow="Guardians" title="Plan a mission" onClose={onClose}>
    <div className="gm-dr">
      {message && <p className="gm-sub" role="status">{message}</p>}
      {view && <>
        <section>
          <h3>Where she's weakest</h3>
          <ul className="gm-activity">{view.evaluation.weakest.map(a => <li key={a.key}>
            <span><b>{a.name}: {a.percent}%</b>{a.unproven.length > 0 && <small>Not proven: {a.unproven.join(', ')}</small>}</span>
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
          <button type="button" className="gm-btn gm-btn-primary" disabled={busy || !room} onClick={() => void draft()}>Draft plans</button>
          {!room && <p className="gm-sub">{view.maxDrafts} plans are waiting. Decide on those first.</p>}
        </section>
        <section>
          <h3>Waiting for your decision</h3>
          {view.drafts.length
            ? <ul className="gm-missions">{view.drafts.map(d => <DraftCard key={d.uuid} draft={d} busy={busy} onRevise={text => void run(() => gm.revise(d.uuid, text), 'revising')} onStart={() => void run(() => gm.startTemplated(d.uuid))} />)}</ul>
            : <p className="gm-sub">No drafts yet.</p>}
          {view.drafts.length > 0 && <p className="gm-sub">Approve or decline these on the Missions tab.</p>}
        </section>
        <section>
          <h3>What she wishes she had</h3>
          {view.wishes.length
            ? <ul className="gm-plan-list">{view.wishes.map(w => <li key={w.uuid}>
              <b>{w.name}</b>{w.cost ? ` (${w.cost})` : ''}: {w.why}
              <div className="gm-row">
                <button type="button" className="gm-btn" disabled={busy} onClick={() => void run(() => gm.decideWish(w.uuid, 'built'))}>It's built</button>
                <button type="button" className="gm-btn" disabled={busy} onClick={() => void run(() => gm.decideWish(w.uuid, 'declined'))}>Not doing this</button>
              </div>
            </li>)}</ul>
            : <p className="gm-sub">Nothing on the wishlist.</p>}
        </section>
      </>}
    </div>
  </Drawer>;
}
