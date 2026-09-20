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
 * distance, the habit, the forecast. A confident sentence with nothing under
 * it would be worse than the seven cards it sits above.
 *
 * When there is nothing to suggest it says why in one line and gets out of the
 * way. "The park is closed for storm damage" is a useful card; a spinner
 * pretending to think is not.
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
    if (option.rhythm?.usualDay) {
      bits.push(option.rhythm.isUsualDayToday ? `your ${option.rhythm.usualDay} habit` : `usually ${option.rhythm.usualDay}s`);
    }
    if (option.rhythm && option.rhythm.thisWeek === 0) bits.push('none yet this week');
    if (option.weather?.now) {
      bits.push(option.weather.temperatureF != null ? `${option.weather.now}, ${option.weather.temperatureF}°` : option.weather.now);
    }
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

function safeHref(url?: string | null) {
  try {
    const parsed = new URL(url || '');
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : undefined;
  } catch { return undefined; }
}

export function RightNowCard({ data, loading, error, onAsk, onManage }: {
  data: RightNow | null;
  loading: boolean;
  error: string | null;
  onAsk: (prompt: string) => void;
  onManage: () => void;
}) {
  if (loading && !data) {
    return <section className="right-now right-now-quiet"><p className="right-now-eyebrow">RIGHT NOW</p><p className="right-now-quiet-line">Looking at your day…</p></section>;
  }
  // A failure here is never worth a red banner above someone's whole day. The
  // cards below are all still true.
  if (error || !data) return null;

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

  if (!data.lead) {
    return <section className="right-now right-now-quiet">
      <p className="right-now-eyebrow">RIGHT NOW</p>
      <p className="right-now-quiet-line">{data.reason || 'Nothing to suggest just now.'}</p>
      <div className="right-now-actions">
        <button className="right-now-secondary" onClick={onManage}>Places &amp; projects <span>↗</span></button>
      </div>
    </section>;
  }

  const lead = data.lead;
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
      <button className="right-now-primary" onClick={() => onAsk(`Talk me through whether to ${lead.kind === 'place' ? `go to ${lead.title}` : `work on ${lead.title}`} today.`)}>
        Talk it through <span>↗</span>
      </button>
      <button className="right-now-secondary" onClick={onManage}>Places &amp; projects <span>↗</span></button>
    </div>
    {/* Where the order came from. Silent when nobody chose it — see the card
        ranking above, which keeps the same rule. */}
    {data.source === 'default' && <p className="right-now-note">Ranked from your own lists — I couldn’t reach a model to weigh them.</p>}
  </section>;
}
