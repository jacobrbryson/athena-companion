import { useEffect, useState } from 'react';
import { workApi, type WorkIssue } from '../api/workItems';
import { DrawerButton } from './ActionControls';
import { Drawer } from './Drawer';
import { JiraDocument } from './WorkItems';
import './addTask.css';

/**
 * A Jira issue or epic from Home's Tasks and Work cards, read in the app (owner, 2026-11-20:
 * "I want to stay inside the app"). Read-only: the same /work-items/issue read
 * the Work page's issue sidebar uses, rendered with its JiraDocument (provider
 * data, never HTML). No link out to Jira.
 */
/** What a card already knows about the issue, shown while the full read loads. */
export type JiraIssueRef = { key: string; title: string; url: string; status?: string | null; project?: string | null; due?: string | null };

export function JiraIssueDrawer({ issue, onClose }: { issue: JiraIssueRef; onClose: () => void }) {
  const [full, setFull] = useState<WorkIssue | null>(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    workApi.issue(issue.url).then(i => { if (live) setFull(i); })
      .catch(e => { if (live) setError((e as Error).message || 'Jira can’t be read right now.'); });
    return () => { live = false; };
  }, [issue.url]);

  async function loadMore() {
    if (!full) return;
    setMore(true);
    try {
      const page = await workApi.comments(full, full.comments.items.length);
      setFull({ ...full, comments: { ...page, start: 0, items: [...full.comments.items, ...page.items] } });
    } catch (e) { setError((e as Error).message); } finally { setMore(false); }
  }

  const due = issue.due ? new Date(`${issue.due.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const facts = [
    { label: 'Status', value: full?.status || issue.status },
    { label: 'Project', value: issue.project },
    { label: 'Priority', value: full?.priority },
    { label: 'Assignee', value: full ? full.assignee || 'Unassigned' : null },
    { label: 'Due', value: due },
    { label: 'Parent', value: full?.parent },
  ].filter(f => f.value);

  return <Drawer wide eyebrow={`JIRA · ${issue.key}`} title={full?.title || issue.title} onClose={onClose}
    footer={<div className="pi-footer"><DrawerButton onClick={onClose}>Close</DrawerButton></div>}>
    <div className="pi-form ji-issue">
      <dl className="ji-facts">{facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
      {error && <p className="at-note at-warn" role="alert">{error}</p>}
      {!full && !error && <p className="pi-muted" role="status">Reading the issue from Jira…</p>}
      {full && <>
        <section><h3 className="pi-legend">Description</h3>
          <div className="ji-doc">{full.descriptionText.trim() ? <JiraDocument node={full.description} /> : <p className="pi-muted">No description.</p>}</div></section>
        {full.acceptanceCriteria && <section><h3 className="pi-legend">Acceptance criteria</h3><pre className="ji-doc">{full.acceptanceCriteria}</pre></section>}
        {full.subtasks.length > 0 && <section><h3 className="pi-legend">Subtasks</h3>
          <ul className="ji-list">{full.subtasks.map(t => <li key={t.key}><b>{t.key}</b>{t.title}</li>)}</ul></section>}
        {full.attachments.length > 0 && <section><h3 className="pi-legend">Attachments</h3>
          <ul className="ji-list">{full.attachments.map((a, i) => <li key={i}>{a.name}<small>{Math.ceil(a.size / 1024)} KB</small></li>)}</ul></section>}
        <section><h3 className="pi-legend">Comments <small>({full.comments.total})</small></h3>
          {!full.comments.items.length ? <p className="pi-muted">No comments yet.</p>
            : <div className="ji-comments">{full.comments.items.map(c => <article key={c.id}>
              <small><b>{c.author}</b> · {new Date(c.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
              <div className="ji-doc"><JiraDocument node={c.body} /></div></article>)}</div>}
          {full.comments.items.length < full.comments.total && <DrawerButton disabled={more} onClick={() => void loadMore()}>{more ? 'Loading…' : 'Load more comments'}</DrawerButton>}
        </section>
      </>}
    </div>
  </Drawer>;
}
