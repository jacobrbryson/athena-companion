import type { ReactNode } from 'react';
import { Icon } from './HealthPage';
import './pageHeader.css';

/**
 * The head of every section page, taken from the Health page (2026-10-14
 * concept): eyebrow, a large title, one line beneath it, and optionally the
 * page's own controls under that, art glowing behind it, and a side column —
 * a reading of the page's own and/or Athena's Take.
 */
export function PageHeader({ eyebrow, title, blurb, art, controls, aside, take }: {
  eyebrow?: string;
  title: ReactNode;
  blurb?: ReactNode;
  /** Decorative image drawn behind the head (the Health page's heart). */
  art?: string;
  /** Sits under the blurb — the Health page's time range. */
  controls?: ReactNode;
  /** Top of the side column, above Athena's Take. */
  aside?: ReactNode;
  /** Athena's Take: her reading of the page, and what tapping it asks her. */
  take?: { lines: ReactNode[]; ask: string; onAsk: (text: string) => void };
}) {
  const side = aside || take;
  return <section className={`ph${side ? ' ph-with-side' : ''}${art ? ' ph-with-art' : ''}`}>
    {art && <img className="ph-art" src={art} alt="" />}
    <div className="ph-copy">
      {eyebrow && <span className="ph-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {blurb && <p>{blurb}</p>}
      {controls}
    </div>
    {side && <div className="ph-side">
      {aside}
      {take && <button type="button" className="ph-take" onClick={() => take.onAsk(take.ask)}>
        <h2><Icon name="sun" /> Athena’s Take</h2>
        {take.lines.map((t, i) => <p key={i}>{t}</p>)}
        <span className="ph-take-go"><Icon name="chevron" /></span>
      </button>}
    </div>}
  </section>;
}
