// A stand-in for core_api's services/projects/execution.js, just enough to
// exercise the Projects UI in dev:mock: ready steps by explicit "needs first",
// blockers with check-back dates, sessions, and completion readiness. The real
// rules (and their tests) live in core_api.

type Any = Record<string, any>;
const CLOSED = new Set(['done', 'dropped']);
const OPEN = new Set(['todo', 'in_progress', 'blocked']);
const SETTLED = new Set(['done', 'skipped']);
const DAY = 86_400_000;

export const criteriaOf = (text: string | null | undefined) =>
  String(text || '').split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?[xX]?\s?\])\s*/, '').trim()).filter(Boolean);

const action = (s: Any) => s.unblockAction || (s.waitingOnActor ? `Check with ${s.waitingOnActor} about ${s.blockedOn || `"${s.title}"`}.` : s.blockedOn ? `Sort out ${s.blockedOn}.` : `Find out what's holding up "${s.title}".`);

export function completion(p: Any) {
  const steps = p.steps.filter((s: Any) => s.status !== 'skipped');
  const open = steps.filter((s: Any) => OPEN.has(s.status)).length;
  const criteria = criteriaOf(p.doneWhen);
  const confirmed = criteria.filter(c => (p.doneWhenConfirmed || []).includes(c)).length;
  const base = { openSteps: open, stepsDone: steps.length - open, stepsTotal: steps.length, criteria: { total: criteria.length, confirmed }, hasCriteria: criteria.length > 0 };
  if (p.status === 'dropped') return { ...base, state: 'dropped', message: 'Dropped.' };
  if (p.status === 'done') return { ...base, state: p.outcomeConfirmedAt ? 'verified_complete' : 'complete', message: p.outcomeConfirmedAt ? 'Finished, and you confirmed the outcome.' : 'Marked done.' };
  if (open || (!steps.length && !criteria.length)) return { ...base, state: 'work_remaining', message: open ? `${open} step${open === 1 ? '' : 's'} to go.` : 'No steps yet.' };
  if (confirmed < criteria.length) return { ...base, state: 'outcome_unverified', message: `Every step is done; ${criteria.length - confirmed} check${criteria.length - confirmed === 1 ? '' : 's'} of the outcome still to confirm.` };
  return { ...base, state: 'ready_for_confirmation', message: 'Everything is done and checked — ready for you to close it out.' };
}

export function execution(p: Any, now = Date.now()) {
  if (CLOSED.has(p.status)) return null;
  const byId = new Map(p.steps.map((s: Any) => [s.uuid, s]));
  const workable = ['idea', 'planning', 'ready', 'active'].includes(p.effectiveStatus);
  const ready = p.steps.filter((s: Any) => workable && (s.status === 'todo' || s.status === 'in_progress')
    && (s.dependsOn || []).every((u: string) => SETTLED.has((byId.get(u) as Any)?.status ?? 'done')));
  const first = ready.find((s: Any) => s.status === 'in_progress') || ready[0] || null;
  const blocked = p.steps.filter((s: Any) => s.status === 'blocked').map((s: Any) => {
    const due = !!s.reviewAt && Date.parse(s.reviewAt) <= now;
    return { key: `${s.uuid}@${s.reviewAt || 'untriaged'}`, projectUuid: p.uuid, projectTitle: p.title, stepUuid: s.uuid, stepTitle: s.title,
      blockedOn: s.blockedOn, waitingOn: s.waitingOnActor, reviewAt: s.reviewAt, due, triage: !s.reviewAt, overdueDays: due ? Math.floor((now - Date.parse(s.reviewAt)) / DAY) : 0, action: action(s) };
  });
  const sessions = (p.sessions || []).filter((s: Any) => ['planned', 'in_progress'].includes(s.status));
  const end = (s: Any) => Date.parse(s.plannedStart) + s.plannedMinutes * 60_000;
  const upcoming = sessions.filter((s: Any) => end(s) >= now).sort((a: Any, b: Any) => a.plannedStart.localeCompare(b.plannedStart));
  const booked = new Set(upcoming.map((s: Any) => s.stepUuid));
  const done = completion(p);
  const nextAction = first && {
    projectUuid: p.uuid, projectTitle: p.title, stepUuid: first.uuid, title: first.title, detail: first.detail, acceptanceCriteria: first.acceptanceCriteria,
    status: first.status, who: first.who, effortMinutes: first.effortMinutes, indoor: first.indoor ?? p.indoor ?? null, conditions: p.conditions || [], dueOn: first.dueOn,
    fitsWindow: null, needsMultipleSessions: false, startsNew: p.effectiveStatus !== 'active', score: 0,
    reasons: [(first.dependsOn || []).length ? `everything it needs is done (${first.dependsOn.map((u: string) => `"${(byId.get(u) as Any)?.title}"`).join(', ')})` : 'nothing has to happen first'],
  };
  const noAction = nextAction ? null
    : p.effectiveStatus === 'waiting' ? { noActionReason: `On hold${p.waitingOn ? `, waiting on ${p.waitingOn}` : ''}.`, unblock: p.waitingOn ? `Check on ${p.waitingOn}.` : null }
      : p.effectiveStatus === 'blocked' ? { noActionReason: 'Needs another project finished first.', unblock: 'Open "Needs first".' }
        : ['outcome_unverified', 'ready_for_confirmation'].includes(done.state) ? { noActionReason: done.message, unblock: 'Go through the closeout checklist.' }
          : !p.steps.length ? { noActionReason: 'No steps yet.', unblock: 'Add the first step.' }
            : blocked.length ? { noActionReason: `Everything open is waiting — "${blocked[0].stepTitle}".`, unblock: blocked[0].action }
              : { noActionReason: 'Nothing is ready yet.', unblock: null };
  const materials = (p.items || []).filter((i: Any) => i.kind === 'material').map((i: Any) => ({ label: i.label, value: [i.value, i.unit].filter(Boolean).join(' ') || null, status: i.status }));
  // Phases: grouped in order of first appearance, unlabelled last (the real getPhases).
  const groups = new Map<string | null, Any[]>();
  for (const s of p.steps) groups.set(s.phase || null, [...(groups.get(s.phase || null) || []), s]);
  const phases = !p.steps.some((s: Any) => s.phase) ? [] : [...groups.entries()]
    .map(([name, list]) => {
      const days = list.map((s: Any) => s.dueOn).filter(Boolean).sort();
      const counted = list.filter((s: Any) => s.status !== 'skipped');
      return { name, stepUuids: list.map((s: Any) => s.uuid), done: counted.filter((s: Any) => s.status === 'done').length, total: counted.length,
        blocked: list.filter((s: Any) => s.status === 'blocked').length, from: days[0] || null, to: days[days.length - 1] || null };
    })
    .sort((a, b) => (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0));
  return {
    phases,
    completion: done,
    executableSteps: ready.map((s: Any) => ({ uuid: s.uuid, title: s.title })),
    nextAction, blockedSteps: blocked, dueFollowUps: blocked.filter((b: Any) => b.due), needsTriage: blocked.filter((b: Any) => b.triage),
    upcomingSessions: upcoming, sessionsToCheckIn: sessions.filter((s: Any) => end(s) < now),
    unscheduled: ready.filter((s: Any) => !booked.has(s.uuid)).map((s: Any) => ({ uuid: s.uuid, title: s.title, effortMinutes: s.effortMinutes })),
    daysSinceProgress: null, noActionReason: noAction?.noActionReason ?? null, unblock: noAction?.unblock ?? null,
    ...(upcoming[0] ? { preparation: {
      sessionUuid: upcoming[0].uuid, plannedStart: upcoming[0].plannedStart, plannedMinutes: upcoming[0].plannedMinutes,
      work: { stepUuid: upcoming[0].stepUuid, title: (byId.get(upcoming[0].stepUuid) as Any)?.title || p.title, detail: null, acceptanceCriteria: criteriaOf((byId.get(upcoming[0].stepUuid) as Any)?.acceptanceCriteria) },
      materials, toVerify: (p.items || []).filter((i: Any) => i.kind === 'spec' && i.status === 'pending').map((i: Any) => i.label), blockers: [],
      weather: { outdoor: p.indoor === false, needs: p.conditions || [], warning: null },
    } } : {}),
  };
}

export function closeout(p: Any) {
  const c = completion(p);
  if (!['outcome_unverified', 'ready_for_confirmation'].includes(c.state)) return null;
  return {
    criteria: criteriaOf(p.doneWhen).map(text => ({ text, confirmed: (p.doneWhenConfirmed || []).includes(text) })),
    openSteps: [], stepsDone: c.stepsDone, stepsSkipped: p.steps.filter((s: Any) => s.status === 'skipped').length,
    toVerify: (p.items || []).filter((i: Any) => i.status === 'pending').map((i: Any) => i.label),
    sessionsCompleted: (p.sessions || []).filter((s: Any) => s.status === 'completed').length, minutesWorked: 0, canClose: true,
  };
}
