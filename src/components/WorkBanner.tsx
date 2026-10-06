import { Fragment, type ReactNode } from 'react';
import type { CalendarEvent, JiraIssue } from '../api/dashboard';
import { jiraGlance, safeHttpsUrl, untilLabel, workStatus } from './workStatus';

/**
 * Across the top of the dashboard while the calendar says they're working:
 * where, what they're in the middle of, and what the day wants next. Absent
 * otherwise; see workStatus for what "working" means.
 *
 * Three blocks, in the order a day actually goes: where → the Jira ticket in
 * progress → the next meeting. In a meeting the meeting is what's happening, so
 * it moves up and the ticket follows it: where → this meeting → the ticket.
 * No ticket in progress, no ticket block.
 *
 * Each block is its own control rather than one big button — the ticket opens
 * in Jira, the rest open Calendar — and Jira's count rides along as a sibling
 * chip that opens Work. A Jira that can't be read leaves out both the ticket
 * and the chip; the Work card says why.
 */
export function WorkBanner({ events, workingLocations, timeZone, now, jira, onOpen, onOpenWork }: {
  events: CalendarEvent[]; workingLocations?: CalendarEvent[]; timeZone?: string; now: number;
  jira?: { issues: JiraIssue[]; partial?: boolean; capped?: boolean } | null; onOpen: () => void; onOpenWork: () => void;
}) {
  const status = workStatus(events, workingLocations, now, timeZone);
  if (!status) return null;
  const clock = (value: string | Date) => new Date(value).toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' });
  const { moment } = status;
  const rest = status.until ? `until ${clock(status.until)}` : 'for the rest of the day';
  const detail = (e: CalendarEvent) => [clock(e.start), e.location].filter(Boolean).join(' · ');
  const glance = jiraGlance(jira, now, timeZone);

  const where = <button type="button" className="work-where" onClick={onOpen} aria-label="Working now — open your calendar">
    <small className="work-label"><i aria-hidden="true" />WORKING</small><strong>{status.where}</strong><span>{status.until ? `until ${clock(status.until)}` : 'all day'}</span>
  </button>;

  const ticket = glance?.inProgress[0];
  const more = (glance?.inProgress.length ?? 0) - 1;
  const ticketBody = ticket && <>
    <small className="work-label">{(ticket.status || 'IN PROGRESS').toUpperCase()}</small>
    <strong>{ticket.title}</strong>
    <span>{[ticket.key, ticket.project].filter(Boolean).join(' · ')}{more > 0 ? ` · +${more} more in progress` : ''}</span>
  </>;
  const href = safeHttpsUrl(ticket?.url);
  const ticketBlock = ticket && (href
    ? <a className="work-ticket" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${ticket.key} in Jira — opens in a new tab`}>{ticketBody}</a>
    : <button type="button" className="work-ticket" onClick={onOpenWork}>{ticketBody}</button>);

  const momentBlock = <button type="button" className="work-moment" onClick={onOpen} aria-label="Your next meeting — open your calendar">
    {moment.kind === 'meeting' && <><small className="work-label">IN A MEETING</small><strong>{moment.event.title}</strong>
      <span><b>ends in {untilLabel(moment.endsInMs)}</b> · {moment.then ? `then ${moment.then.title} at ${clock(moment.then.start)}` : `nothing else ${rest}`}</span></>}
    {moment.kind === 'free' && <><small className="work-label">{moment.next.attendees ? 'NEXT MEETING' : 'NEXT UP'}</small><strong>{moment.next.title}</strong>
      <span><b>in {untilLabel(moment.inMs)}</b> · {detail(moment.next)}</span></>}
    {moment.kind === 'clear' && <><small className="work-label">NO MORE MEETINGS</small><strong>Clear {rest}</strong></>}
  </button>;

  // In a meeting, it comes first and the ticket after it.
  const blocks: ReactNode[] = moment.kind === 'meeting' ? [momentBlock, ticketBlock] : [ticketBlock, momentBlock];
  const shown = blocks.filter(Boolean);

  return <div className="work-strip">
    <div className={`work-banner work-${moment.kind}`} role="group" aria-label="Working now">
      {where}
      {shown.map((block, i) => <Fragment key={i}><span className="work-arrow" aria-hidden="true">→</span>{block}</Fragment>)}
    </div>
    {glance && <button type="button" className={`work-jira${glance.overdue ? ' work-jira-late' : ''}`} onClick={onOpenWork} aria-label="Jira — open your work page">
      <small className="work-label">JIRA</small>
      <strong>{glance.count ? `${glance.count}${glance.atLeast ? '+' : ''} open` : 'Nothing open'}</strong>
      {glance.overdue > 0 ? <span>{glance.overdue} overdue{glance.dueToday ? ` · ${glance.dueToday} due today` : ''}</span>
        : glance.dueToday > 0 ? <span>{glance.dueToday} due today</span>
          : glance.inProgress.length > 0 ? <span>{glance.inProgress.length} in progress</span>
            : glance.latest ? <span>{glance.latest.key} · {glance.latest.status}</span> : null}
    </button>}
  </div>;
}
