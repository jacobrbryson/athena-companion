import { useState, type ReactNode } from 'react';
import type { Dream } from '../api/dashboard';
import type { Project, ProjectEntry } from '../api/projects';
import { DreamImage, STATUS_LINE, nightLabel } from './Dreams';
import { Picture } from './ProjectJournal';
import { CardHeader } from './YourDay';
import './dayTasks.css';

/**
 * Home's Property and Dreams cards (owner mockup, 2026-11-17), in the same
 * family as the rest of Home. Property answers "is the house secure, is
 * anything wrong, what's next"; concerns stay on Property → Concerns (owner,
 * 2026-11-14). Every count comes from the Guardian sweep, issues or projects.
 */

const svg = (art: ReactNode, className?: string) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{art}</svg>;
const HOUSE = <><path d="M3.6 11.2 12 4.6l8.4 6.6" /><path d="M5.8 9.6v9.6h12.4V9.6" /><path d="M10.2 19.2v-4.6h3.6v4.6" /></>;
const SHIELD = <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />;
const SHIELD_OK = <>{SHIELD}<path d="m8.7 12.2 2.3 2.3 4.4-4.8" /></>;
const SHIELD_ALERT = <>{SHIELD}<path d="M12 8v4.5M12 15.6h.01" /></>;
const CAMERA = <><rect x="3" y="7" width="12.5" height="10" rx="2" /><path d="m15.5 10.5 5.5-3v9l-5.5-3" /></>;
const CHECKS = <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 9 1.5 1.5L12 8M8 15l1.5 1.5L12 14M14 9h3M14 15h3" /></>;
const SIREN = <><path d="M6 18v-6a6 6 0 0 1 12 0v6M4 18h16M12 3v2M4.5 6.5l1.4 1.4M19.5 6.5l-1.4 1.4" /></>;
const WRENCH = <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.6 17.4a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.3-.3-2.4 2.6-2.6Z" />;
const CLOCK = <><circle cx="12" cy="12" r="8.4" /><path d="M12 7.5V12l3 2" /></>;
const BELL = <><path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4c0 4.2-1.5 5.6-1.5 5.6h13.8s-1.5-1.4-1.5-5.6A5.4 5.4 0 0 0 12 3.6Z" /><path d="M10.4 18a1.8 1.8 0 0 0 3.2 0" /></>;
const LEAF = <><path d="M20 4C10 4 4 8 4 14a6 6 0 0 0 6 6c6 0 10-7 10-16Z" /><path d="M4 20 14 10" /></>;
const GEAR = <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>;
const CHECK = <path d="m5 12.5 4.5 4.5L19 7" />;
const CHECK_CIRCLE = <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.6 2.6 4.9-5.3" /></>;
const CHEVRON = <path d="m9.5 6 6 6-6 6" />;
const MOON = <><path className="icon-fill" d="M15.6 4.4a7.6 7.6 0 1 0 4 10.6 6.2 6.2 0 0 1-4-10.6Z" /><path d="M18.4 4.2v2.4M17.2 5.4h2.4" /></>;
const SPARK = <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" />;
const CHAT = <><rect x="3.5" y="5" width="17" height="12" rx="2.5" /><path d="M8 17v3l4-3M8 10h.01M12 10h.01M16 10h.01" /></>;
const DOC = <><path d="M6 3.5h8.5L19 8v12.5H6Z" /><path d="M14 3.5V8h5M9 12h7M9 15.5h7" /></>;

// --- Property ------------------------------------------------------------------

export interface PropertySecurity {
  tone: 'good' | 'warn' | 'alert' | 'idle';
  label: string;
  note: string;
  /** What's open right now, worded for a person ("Garage door appears open"). */
  incidents: string[];
  cameras: { watched: number; quiet: number };
  /** Things the last sweep looked at. */
  checked: number;
}
export interface PropertyTile { key: 'issues' | 'due' | 'outdoor' | 'systems'; label: string; value: string; tone: 'good' | 'warn' | 'alert' | 'plain'; onClick: () => void }
const TILE_ICON: Record<PropertyTile['key'], ReactNode> = { issues: BELL, due: CLOCK, outdoor: LEAF, systems: GEAR };

function ProjectCover({ project: p }: { project: Project }) {
  const entry: ProjectEntry | null = p.media?.cover ? { uuid: p.media.cover, type: 'photo', phase: null, body: `${p.title} cover photo`, media: 'server', deviceRef: null, involvesChildren: p.involvesChildren, source: p.source, takenAt: null, createdAt: p.updatedAt } : null;
  return <span className="dt-cover dt-cover-home dt-cover-sm">{entry ? <Picture project={p} entry={entry} /> : svg(HOUSE)}</span>;
}

export function PropertyCard({ name, banner, security, securityLoading, lead, openCount, tiles, notice, onOpen, onSecurity, onProjects, onProject }: {
  name: string | null; banner: string | null;
  /** Null when the Guardian couldn't be read. */
  security: PropertySecurity | null; securityLoading: boolean;
  /** The top open house project. */
  lead: Project | null; openCount: number;
  tiles: PropertyTile[];
  /** A source that couldn't load, with its retry. */
  notice?: ReactNode;
  onOpen: () => void; onSecurity: () => void; onProjects: () => void; onProject: (uuid: string) => void;
}) {
  const steps = lead?.progress.steps;
  const finished = !!steps && steps.total > 0 && steps.done >= steps.total;
  return <section className="dh-section dt-card" id="dashboard-property">
    <CardHeader icon="Home" glyph={HOUSE} title="Property" subtitle="Home · Security · Projects · Upkeep" action="View all" actionArrow="→" onAction={onOpen} />
    <div className="dh-section-body dt-body">
      {banner && <button type="button" className="dt-banner" style={{ backgroundImage: `url("${banner}")` }} onClick={onOpen} aria-label={`Open ${name || 'the property'}`} />}
      {notice}
      <button type="button" className={`dt-secure dt-secure-${security?.tone || 'idle'}`} onClick={onSecurity}>
        {svg(security?.tone === 'good' ? SHIELD_OK : security ? SHIELD_ALERT : SHIELD, 'dt-secure-shield')}
        <span className="dt-secure-text">
          <strong>{securityLoading ? 'Checking…' : security ? security.incidents[0] || security.label : 'Security status unavailable'}</strong>
          <small>{security ? (security.incidents.length > 1 ? `+${security.incidents.length - 1} more · ${security.note}` : security.note) : 'Open Security to check'}</small>
        </span>
        {security && <span className="dt-secure-counts">
          <span title={`${security.cameras.watched} camera${security.cameras.watched === 1 ? '' : 's'} watched${security.cameras.quiet ? ` · ${security.cameras.quiet} not seen in a day` : ''}`}>{svg(CAMERA)}{security.cameras.watched}{security.cameras.quiet ? <i className="dt-warn">!</i> : null}</span>
          <span title="Things the last sweep checked">{svg(CHECKS)}{security.checked}</span>
          <span title="Open security incidents">{svg(SIREN)}{security.incidents.length ? <b className="dt-warn">{security.incidents.length}</b> : svg(CHECK, 'dt-ok')}</span>
        </span>}
      </button>

      <div className="dt-active">
        <button type="button" className="dt-active-head" onClick={onProjects}>{svg(WRENCH)}<strong>Active Projects</strong><span>{openCount} open {svg(CHEVRON)}</span></button>
        {lead ? <button type="button" className="dt-active-lead" onClick={() => onProject(lead.uuid)}>
          <ProjectCover project={lead} />
          <span className="dt-project-main">
            <strong title={lead.title}>{lead.title}</strong>
            <small>{lead.effectiveStatus.charAt(0).toUpperCase() + lead.effectiveStatus.slice(1)}{steps?.total ? ` · ${steps.done} / ${steps.total} steps` : ' · No steps set'}</small>
            {steps?.total ? <span className="dt-track dt-track-lg"><i style={{ width: `${Math.round((steps.done / steps.total) * 100)}%` }} /></span> : null}
          </span>
          {finished ? <span className="dt-done-mark" title="Every step is done">{svg(CHECK_CIRCLE)}</span> : svg(CHEVRON, 'dt-chevron')}
        </button> : <p className="dt-caption">No open house projects.</p>}
      </div>

      <div className="dt-ptiles">
        {tiles.map(t => <button type="button" key={t.key} className={`dt-ptile dt-ptile-${t.key}`} onClick={t.onClick}>
          {svg(TILE_ICON[t.key])}
          <span><small>{t.label}</small><strong className={`dt-tone-${t.tone}`}>{t.value}</strong></span>
        </button>)}
      </div>
    </div>
  </section>;
}

// --- Dreams --------------------------------------------------------------------

export function DreamsCard({ loading, failed, count, nights, last, onOpen, onAsk }: {
  loading: boolean; failed: boolean;
  /** Nights dreamt in the last 30 days. */
  count: number;
  /** Last 30 nights, oldest first: how many steps each ran, null when there was no dream. */
  nights: (number | null)[];
  last: Dream | null;
  onOpen: () => void; onAsk: (text: string) => void;
}) {
  const [plain, setPlain] = useState(false);
  const peak = Math.max(1, ...nights.map(n => n ?? 0));
  const text = (s: string) => { const t = s.replace(/`/g, '').replace(/\s+/g, ' ').trim(); return t.length > 180 ? `${t.slice(0, 180).replace(/\s+\S*$/, '')}…` : t; };
  const told = last ? (plain ? last.summary || last.narrative : last.narrative || last.summary) : null;
  return <section className="dh-section dt-card" id="dashboard-dreams">
    <CardHeader icon="Dreams" glyph={MOON} tone="violet" title="Dreams" subtitle="What I organized last night, told as a dream" action="View all" actionArrow="→" onAction={onOpen} />
    <div className="dh-section-body dt-body">
      {loading ? <p className="dashboard-empty">Loading…</p>
        : failed ? <p className="dashboard-empty">Dreams couldn’t load.</p>
          : <>
            <div className="dt-nights">
              <p><strong>{count}</strong> night{count === 1 ? '' : 's'}<small>in the last 30 days</small></p>
              <span className="dt-night-bars" role="img" aria-label={`${count} nights dreamt in the last 30 days`}>
                {nights.map((n, i) => <i key={i} className={n == null ? 'dt-night-none' : undefined} style={{ height: n == null ? '12%' : `${20 + (n / peak) * 80}%` }} />)}
              </span>
            </div>
            {!last ? <p className="dashboard-empty">I haven’t dreamed yet. Once I do, I’ll tell you about it here.</p> : <>
              <div className="dt-dream-head">
                <span><strong>Most recent dream</strong><small>{nightLabel(last.date)}</small></span>
                <em className={`dt-dream-status dt-dream-${last.status}`}>{svg(SPARK)}{STATUS_LINE[last.status]}</em>
              </div>
              {last.hasImage && <DreamImage uuid={last.uuid} className="dt-dream-image" />}
              <blockquote className="dt-dream-quote">{text(told || 'I looked things over and left them as they were.')}</blockquote>
              <div className="dt-dream-actions">
                <button type="button" className="dt-dream-ask" onClick={() => onAsk('Tell me about what you dreamed last night.')}>{svg(CHAT)}Ask her about it <span aria-hidden="true">↗</span></button>
                {last.summary && last.narrative && <button type="button" aria-pressed={plain} onClick={() => setPlain(p => !p)}>{svg(DOC)}{plain ? 'As a dream' : 'Plain version'}</button>}
                <button type="button" onClick={onOpen}>{svg(MOON)}All dreams</button>
              </div>
            </>}
          </>}
    </div>
  </section>;
}
