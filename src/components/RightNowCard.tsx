import type { RightNow, Suggestion } from '../api/dashboard';

/**
 * The first thing on the dashboard, and the only thing on it that answers a
 * question rather than reporting a source.
 *
 * The cards below are each faithful to one connector. This is the one place
 * they are read against each other — the park's hours against the gap before
 * piano, against the fact that someone who rides most Sundays hasn't this
 * week — and the whole value of it is that the reasoning is visible. So every
 * claim here is shown with the thing it came from: the closing time, the
 * distance, the forecast. A confident sentence with nothing under
 * it would be worse than the seven cards it sits above.
 *
 * It only appears when the moment is actually important (owner, 2026-09-27):
 * you're in something on the calendar, something starts within minutes, or
 * the suggestion is tied to right now — a red recovery, a place open now,
 * something due today. A goal worth thinking
 * about on a quiet afternoon is not that, and the card stays out of the way
 * rather than filling the top of the page with the mundane. It draws nothing
 * while loading for the same reason: a placeholder that then vanishes is noise.
 */

const hours = (minutes?: number | null) => {
  if (minutes == null) return null;
  if (minutes < 90) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m >= 15 ? `${h}h ${m}m` : `${h}h`;
};

/** The evidence line: short facts, in the order they matter, never a sentence. */
function evidence(option: Suggestion): string[] {
  const bits: string[] = [];
  if (option.kind === 'place') {
    if (option.distanceMi != null) bits.push(`${option.distanceMi} mi away`);
    if (option.closesAt) bits.push(`open till ${option.closesAt}`);
    if (option.weather?.now) {
      bits.push(option.weather.temperatureF != null ? `${option.weather.now}, ${option.weather.temperatureF}°` : option.weather.now);
    }
    return bits;
  }
  if (option.kind === 'rest') {
    if (option.recoveryScore != null) bits.push(`recovery ${option.recoveryScore}%`);
    if (option.hoursAsleep != null) bits.push(`${option.hoursAsleep}h asleep`);
    return bits;
  }
  if (option.kind === 'work') {
    if (option.issueKey) bits.push(option.issueKey);
    if (option.status) bits.push(option.status);
    if (option.dueDate) bits.push(`due ${new Date(option.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
    return bits;
  }
  if (option.kind === 'goal') {
    bits.push('a goal you mentioned');
    return bits;
  }
  if (option.area) bits.push(option.area);
  if (option.effortMinutes) bits.push(`about ${hours(option.effortMinutes)}`);
  if (option.status === 'in_progress') bits.push('already started');
  if (option.priority === 'high') bits.push('high priority');
  if (option.indoor === true) bits.push('indoors');
  if (option.dueDate) bits.push(`due ${new Date(option.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  return bits;
}

/** What "talk it through" asks, in the person's own terms for each kind. */
function talkPrompt(option: Suggestion) {
  switch (option.kind) {
    case 'place': return `Talk me through whether to go to ${option.title} today.`;
    case 'rest': return 'My recovery is low today. Help me plan an easy day.';
    case 'work': return `Help me make progress on ${option.issueKey ? `${option.issueKey}: ` : ''}${option.title}.`;
    case 'goal': return `Help me pick a next step on ${option.title.toLowerCase()} I could do today.`;
    default: return `Talk me through whether to work on ${option.title} today.`;
  }
}

function safeHref(url?: string | null) {
  try {
    const parsed = new URL(url || '');
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : undefined;
  } catch { return undefined; }
}

/** Minutes before an event when its approach is worth the top of the page. */
const IMMINENT_MINUTES = 15;

function withinDays(iso: string | null | undefined, days: number) {
  const at = Date.parse(iso || '');
  if (!Number.isFinite(at)) return false;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + days);
  return at <= end.getTime();
}

/** Whether this suggestion is tied to right now, rather than any quiet hour. */
function timely(option: Suggestion): boolean {
  switch (option.kind) {
    case 'rest':
    case 'place': return true;
    case 'work': return withinDays(option.dueDate, 0);
    case 'project': return option.priority === 'high' || withinDays(option.dueDate, 0);
    default: return false;
  }
}

export function RightNowCard({ data, loading, error, onAsk, onManage }: {
  data: RightNow | null;
  loading: boolean;
  error: string | null;
  onAsk: (prompt: string) => void;
  onManage: () => void;
}) {
  // A failure here is never worth a red banner above someone's whole day. The
  // cards below are all still true.
  if (loading || error || !data) return null;

  const imminent = data.window.nextEvent && data.window.nextEvent.inMinutes != null
    && data.window.nextEvent.inMinutes <= IMMINENT_MINUTES ? data.window.nextEvent : null;
  const lead = data.lead && timely(data.lead) ? data.lead : null;
  if (!data.window.busyWith && !imminent && !lead) return null;

  const free = hours(data.window.freeMinutes);
  const until = data.window.nextEvent?.title;
  // The window is the frame for everything else, so it is stated once, at the
  // top, in the person's own terms rather than as a duration in the abstract.
  const windowLine = data.window.busyWith
    ? `You're in ${data.window.busyWith}`
    : free && until
      ? `${free} free before ${until}`
      : free
        ? `${free} free`
        : 'Nothing else on the calendar today';

  if (!lead) {
    return <section className="right-now right-now-quiet">
      <p className="right-now-eyebrow">RIGHT NOW</p>
      <p className="right-now-quiet-line">{data.window.busyWith ? `You're in ${data.window.busyWith}.` : `${imminent!.title} starts in ${Math.max(0, imminent!.inMinutes ?? 0)} min.`}</p>
    </section>;
  }

  const href = safeHref(lead.url);
  const facts = evidence(lead);

  return <section className={`right-now right-now-${lead.kind}`}>
    <header className="right-now-head">
      <p className="right-now-eyebrow">RIGHT NOW</p>
      <p className="right-now-window">{windowLine}</p>
    </header>

    <h2 className="right-now-headline">{data.headline || lead.title}</h2>
    {/* Athena's reason, in her words. Shown as a sentence, never acted on. */}
    {lead.why && <p className="right-now-why">{lead.why}</p>}

    {lead.kind === 'goal' && lead.detail && <p className="right-now-note">{lead.detail}</p>}
    <p className="right-now-subject">
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{lead.title}</a> : lead.title}
    </p>
    {facts.length > 0 && <ul className="right-now-evidence">{facts.map(fact => <li key={fact}>{fact}</li>)}</ul>}

    {/* The honest footnote. A weather-dependent place that is open on paper is
        not the same as a place worth driving to, and the person gets to make
        that call rather than have it made quietly for them. */}
    {lead.kind === 'place' && lead.weatherDependent && lead.weather?.outlook === 'fine' && (
      <p className="right-now-note">Hours here are weather dependent — the forecast looks clear, but trails can still be soft.</p>
    )}

    {data.alternates.length > 0 && <div className="right-now-alternate">
      <span>Or</span>
      <div>
        <strong>{data.alternates[0].title}</strong>
        {data.alternates[0].why && <p>{data.alternates[0].why}</p>}
        <small>{evidence(data.alternates[0]).join(' · ')}</small>
      </div>
    </div>}

    {data.ruledOut.length > 0 && <p className="right-now-ruled-out">
      Not {data.ruledOut[0].title} — {data.ruledOut[0].reason}.
    </p>}

    <div className="right-now-actions">
      <button className="right-now-primary" onClick={() => onAsk(talkPrompt(lead))}>
        Talk it through <span>↗</span>
      </button>
      <button className="right-now-secondary" onClick={onManage}>Places &amp; projects <span>↗</span></button>
    </div>
    {/* Where the order came from. Silent when nobody chose it — see the card
        ranking above, which keeps the same rule. */}
    {data.source === 'default' && <p className="right-now-note">Ranked from your own lists — I couldn’t reach a model to weigh them.</p>}
  </section>;
}
