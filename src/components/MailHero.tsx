/**
 * The Mail page's head: what Athena found, nothing-is-deleted reassurance, and
 * when the inbox was last read. Replaces the title and stat tiles for this page.
 */
function Envelope({ x, y, s, r, o = 1 }: { x: number; y: number; s: number; r: number; o?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} opacity={o}>
    <rect x="-30" y="-20" width="60" height="40" rx="5" fill="rgba(20,70,160,.35)" stroke="#6fc8ff" strokeWidth="2" />
    <path d="M-30 -16 L0 6 L30 -16" fill="none" stroke="#6fc8ff" strokeWidth="2" strokeLinejoin="round" />
  </g>;
}

function Art() {
  return <svg className="mail-hero-art" viewBox="0 0 520 190" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="mail-swoosh" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2a6bff" stopOpacity="0" />
        <stop offset=".55" stopColor="#3fb4ff" stopOpacity=".9" />
        <stop offset="1" stopColor="#9be4ff" stopOpacity="1" />
      </linearGradient>
      <filter id="mail-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7" /></filter>
    </defs>
    <path d="M0 150 C 110 40, 190 190, 300 95 S 400 70, 430 92" fill="none" stroke="url(#mail-swoosh)" strokeWidth="3" strokeLinecap="round" />
    <path d="M10 175 C 130 80, 210 200, 320 118 S 410 96, 432 100" fill="none" stroke="url(#mail-swoosh)" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
    <g filter="url(#mail-glow)" opacity=".85"><rect x="360" y="40" width="130" height="90" rx="10" fill="#2d8cff" /></g>
    <g transform="translate(425 88) rotate(-4)">
      <rect x="-62" y="-42" width="124" height="84" rx="9" fill="rgba(15,60,150,.55)" stroke="#a6e6ff" strokeWidth="3" />
      <path d="M-62 -34 L0 10 L62 -34" fill="none" stroke="#a6e6ff" strokeWidth="3" strokeLinejoin="round" />
    </g>
    <Envelope x={175} y={34} s={0.8} r={-18} />
    <Envelope x={265} y={22} s={0.6} r={12} o={0.9} />
    <Envelope x={500} y={60} s={0.7} r={20} />
    <Envelope x={330} y={150} s={0.4} r={-10} o={0.7} />
  </svg>;
}

export function MailHero({ suggestions, pending, syncedAt, onScan, scanning, note, error }: {
  suggestions: number; pending: number; syncedAt?: string | null;
  /** Sorts the next batch of mail. Absent when Gmail can't be read. */
  onScan?: () => void; scanning?: boolean; note?: string; error?: string;
}) {
  const synced = syncedAt ? new Date(syncedAt) : null;
  const sameDay = synced && synced.toDateString() === new Date().toDateString();
  const when = synced && !Number.isNaN(synced.getTime())
    ? `${sameDay ? 'Today' : synced.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${synced.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : 'Not yet';
  return <header className="mail-hero">
    <Art />
    <span className="mail-hero-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7.5 12 13l8.5-5.5" /></svg>
    </span>
    <div className="mail-hero-text">
      <p className="mail-hero-eyebrow">MAIL</p>
      <h1>Inbox Assistant</h1>
      <p>{suggestions > 0
        ? `I found ${suggestions} ${suggestions === 1 ? 'suggestion' : 'suggestions'} for your inbox that we can organize, save, or turn into action.`
        : pending > 0 ? `${pending} ${pending === 1 ? 'email is' : 'emails are'} waiting to be sorted. Press Scan more below and I'll sort them.` : 'Nothing needs you right now.'}
        <br />Nothing is deleted without your approval.</p>
      {onScan && <div className="mail-hero-scan">
        <button onClick={onScan} disabled={scanning}><span aria-hidden="true">↻</span> {scanning ? 'Scanning…' : 'Scan more'}</button>
        {note && <small>{note}</small>}
        {error && <small className="mail-hero-scan-error" role="status">{error}</small>}
      </div>}
    </div>
    <dl className="mail-hero-tile">
      <div><i className="mail-dot mail-dot-ok" /><dt>Last synced</dt><dd>{when}</dd></div>
      <div><i className="mail-dot mail-dot-info" /><dt>{suggestions} {suggestions === 1 ? 'suggestion' : 'suggestions'}</dt><dd>{pending} waiting to sort</dd></div>
    </dl>
  </header>;
}
