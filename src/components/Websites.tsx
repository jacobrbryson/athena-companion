import { useEffect, useState, type ReactNode } from 'react';
import { dashboardApi, type AnalyticsStats, type SearchStats, type Website, type WebsiteDiscovery, type WebsiteInput } from '../api/dashboard';

/**
 * The Websites panel on Projects: the sites the person manages and how each is
 * doing, read from Google Search Console and Analytics (core_api
 * services/websites.js). Read-only; the person lists a site and says which
 * Search Console property and GA4 property are its, and Athena reads those two.
 *
 * Loads its own list so the rest of Projects doesn't wait on Google, and keeps
 * the add/edit form's half-typed state across the dashboard re-rendering.
 */

const errorText = (e: unknown, fallback: string) => {
  const err = e as Error & { body?: { message?: string } };
  return err?.body?.message || err?.message || fallback;
};

const number = (n: number) => n.toLocaleString();

function ago(value?: string | null) {
  if (!value) return null;
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

/** "▲ 12%" against the week before; nothing at all when there was no week before. */
function Trend({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  if (value === 0) return <span className="website-trend" title="Same as the week before">· flat</span>;
  const up = value > 0;
  return <span className={`website-trend ${up ? 'website-up' : 'website-down'}`} title="Against the week before">{up ? '▲' : '▼'} {Math.abs(value)}%</span>;
}

function Figure({ label, value, trend }: { label: string; value: number; trend?: number | null }) {
  return <div className="website-figure"><small>{label}</small><strong>{number(value)}</strong><Trend value={trend} /></div>;
}

function SearchBlock({ s }: { s: SearchStats }) {
  return <div className="website-source">
    <small className="website-source-title">Google Search · {s.window.start} to {s.window.end}</small>
    <div className="website-figures">
      <Figure label="Clicks" value={s.clicks} trend={s.trend.clicks} />
      <Figure label="Impressions" value={s.impressions} trend={s.trend.impressions} />
      <div className="website-figure"><small>Avg. position</small><strong>{s.position ? s.position.toFixed(1) : '—'}</strong></div>
    </div>
    {s.topQueries.length > 0 && <p className="community-notes">Top searches: {s.topQueries.map(q => `${q.query} (${number(q.clicks)})`).join(' · ')}</p>}
  </div>;
}

function AnalyticsBlock({ a }: { a: AnalyticsStats }) {
  return <div className="website-source">
    <small className="website-source-title">Analytics · last 7 days</small>
    <div className="website-figures">
      <Figure label="Visitors" value={a.users} trend={a.trend.users} />
      <Figure label="Visits" value={a.sessions} trend={a.trend.sessions} />
      <Figure label="New visitors" value={a.newUsers} />
    </div>
    {a.topPages.length > 0 && <p className="community-notes">Top pages: {a.topPages.map(p => `${p.path} (${number(p.views)})`).join(' · ')}</p>}
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="community-field"><span>{label}</span>{children}</label>;
}

function WebsiteForm({ initial, busy, onSave, onCancel, onConnect }: {
  initial: WebsiteInput; busy: boolean; onSave: (input: WebsiteInput) => void; onCancel: () => void; onConnect?: () => void;
}) {
  const [form, setForm] = useState<WebsiteInput>(initial);
  const [found, setFound] = useState<WebsiteDiscovery | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    dashboardApi.websiteDiscovery()
      .then(d => { if (live) setFound(d); })
      .catch(e => { if (live) setLookupError(errorText(e, 'Could not ask Google what you can see.')); });
    return () => { live = false; };
  }, []);

  const set = (key: keyof WebsiteInput) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value || null }));

  /** Choosing a Search Console site fills the domain, and suggests the property whose name matches. */
  function pickSearchSite(site: string) {
    const match = found?.searchSites.find(s => s.site === site);
    setForm(f => ({
      ...f,
      searchSite: site || null,
      domain: f.domain || match?.host || '',
      gaProperty: f.gaProperty || match?.suggestedProperty || null,
    }));
  }

  return <form className="dashboard-form community-form" onSubmit={e => { e.preventDefault(); onSave({ ...form, domain: form.domain.trim() }); }}>
    {found && !found.linked && <p className="dashboard-notice" role="status">
      Google Websites isn’t connected, so I can’t list your properties.{' '}
      {onConnect && <button type="button" className="community-link" onClick={onConnect}>Connect it</button>}
    </p>}
    {lookupError && <p className="dashboard-notice" role="status">{lookupError}</p>}
    {found?.propertiesError && <p className="dashboard-notice" role="status">I could see your Search Console sites but not your Analytics properties: {found.propertiesError}</p>}
    {found?.linked && found.searchSites.length > 0 && <Field label="Search Console site">
      <select value={form.searchSite || ''} onChange={e => pickSearchSite(e.target.value)}>
        <option value="">None / enter below…</option>
        {found.searchSites.map(s => <option key={s.site} value={s.site}>{s.site}</option>)}
      </select>
    </Field>}
    <Field label="Domain"><input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} maxLength={190} placeholder="orcwood.com" required /></Field>
    <Field label="Name (optional)"><input value={form.label || ''} onChange={set('label')} maxLength={120} placeholder="Orcwood Games" /></Field>
    {found?.linked && found.properties.length > 0
      ? <Field label="Analytics property">
        <select value={form.gaProperty || ''} onChange={set('gaProperty')}>
          <option value="">None</option>
          {found.properties.map(p => <option key={p.property} value={p.property}>{p.name}{p.account ? ` · ${p.account}` : ''} ({p.property})</option>)}
        </select>
      </Field>
      : <Field label="Analytics property id (optional)"><input value={form.gaProperty || ''} onChange={set('gaProperty')} maxLength={30} placeholder="From Analytics → Admin → Property details" inputMode="numeric" /></Field>}
    {!(found?.linked && found.searchSites.length > 0) && <Field label="Search Console property (optional)"><input value={form.searchSite || ''} onChange={set('searchSite')} maxLength={255} placeholder="sc-domain:orcwood.com" /></Field>}
    <Field label="Notes for Athena"><textarea value={form.notes || ''} onChange={set('notes')} maxLength={500} rows={2} placeholder="What the site is for, what matters about it" /></Field>
    <div className="community-actions">
      <button className="dashboard-chat-cta" type="submit" disabled={busy || !form.domain.trim()}>{busy ? 'Saving…' : 'Save'} <span>↗</span></button>
      <button type="button" className="community-link" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

const blank: WebsiteInput = { domain: '', label: null, searchSite: null, gaProperty: null, notes: null };

export function Websites({ onConnect }: { onConnect?: () => void }) {
  const [sites, setSites] = useState<Website[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    dashboardApi.websites()
      .then(r => { if (live) setSites(r.sites); })
      .catch(e => { if (live) setLoadError(errorText(e, 'Your websites are unavailable right now.')); });
    return () => { live = false; };
  }, []);

  async function save(input: WebsiteInput, uuid?: string) {
    setNotice(null);
    setBusy(uuid || 'new');
    try {
      const { site } = await dashboardApi.saveWebsite(input, uuid);
      setSites(list => (list || []).some(s => s.uuid === site.uuid) ? (list || []).map(s => s.uuid === site.uuid ? site : s) : [...(list || []), site].sort((a, b) => a.domain.localeCompare(b.domain)));
      setEditing(null);
      // A new site has no numbers yet; reading Google now saves a wait for tomorrow.
      if (site.searchSite || site.gaProperty) void refresh(site.uuid, true);
    } catch (e) {
      setNotice(errorText(e, 'Could not save that site.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(site: Website) {
    if (!window.confirm(`Remove ${site.label || site.domain} from your list?`)) return;
    setNotice(null);
    setBusy(site.uuid);
    try {
      setSites((await dashboardApi.removeWebsite(site.uuid)).sites);
    } catch (e) {
      setNotice(errorText(e, 'Could not remove that site.'));
    } finally {
      setBusy(null);
    }
  }

  async function refresh(uuid?: string, quiet = false) {
    if (!quiet) setNotice(null);
    setBusy(uuid || 'all');
    try {
      setSites((await dashboardApi.refreshWebsites(uuid)).sites);
    } catch (e) {
      const err = e as Error & { body?: { sites?: Website[] } };
      if (err.body?.sites) setSites(err.body.sites);
      setNotice(errorText(e, 'Could not read Google just now.'));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <p className="dashboard-notice" role="status">{loadError}</p>;
  if (!sites) return <p className="dashboard-empty">Loading your websites…</p>;

  const readable = sites.some(s => s.searchSite || s.gaProperty);
  return <>
    {notice && <p className="dashboard-notice" role="status">{notice}</p>}
    {!sites.length && editing !== 'new' && <p className="dashboard-empty">Add the websites you manage and I’ll show how each is doing, from your Google Search Console and Analytics.</p>}
    {sites.length > 0 && <ul className="dashboard-data-list calendar-events">
      {sites.map(site => <li key={site.uuid}>
        <span className="event-dot" />
        <div className="community-body">
          <strong><a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer">{site.label || site.domain}</a></strong>
          {site.label && <small>{site.domain}</small>}
          {site.search && <SearchBlock s={site.search} />}
          {site.analytics && <AnalyticsBlock a={site.analytics} />}
          {!site.search && !site.analytics && !site.lastError && <small>{site.searchSite || site.gaProperty ? 'No numbers yet — Check now to read Google.' : 'No Search Console or Analytics property set yet. Edit to add one.'}</small>}
          {!site.searchSite && site.analytics && <small>No Search Console property set.</small>}
          {!site.gaProperty && site.search && <small>No Analytics property set.</small>}
          {site.lastError && <p className="dashboard-notice" role="status">{site.lastError}</p>}
          {site.lastCheckedAt && <small>Checked {ago(site.lastCheckedAt)}</small>}
          {site.notes && <p className="community-notes">{site.notes}</p>}
          <div className="community-controls">
            <button type="button" className="community-link" onClick={() => setEditing(editing === site.uuid ? null : site.uuid)}>{editing === site.uuid ? 'Close' : 'Edit'}</button>
            <button type="button" className="community-link community-danger" disabled={busy === site.uuid} onClick={() => void remove(site)}>Remove</button>
          </div>
          {editing === site.uuid && <WebsiteForm initial={{ domain: site.domain, label: site.label, searchSite: site.searchSite, gaProperty: site.gaProperty, notes: site.notes }}
            busy={busy === site.uuid} onSave={input => void save(input, site.uuid)} onCancel={() => setEditing(null)} onConnect={onConnect} />}
        </div>
      </li>)}
    </ul>}
    {editing === 'new'
      ? <WebsiteForm initial={blank} busy={busy === 'new'} onSave={input => void save(input)} onCancel={() => setEditing(null)} onConnect={onConnect} />
      : <div className="community-actions">
        <button type="button" className="dashboard-chat-cta" onClick={() => setEditing('new')}>Add a website <span>＋</span></button>
        {readable && <button type="button" className="community-link" disabled={busy === 'all'} onClick={() => void refresh()}>{busy === 'all' ? 'Checking…' : 'Check now'}</button>}
        {onConnect && <button type="button" className="community-link" onClick={onConnect}>Connected apps</button>}
      </div>}
  </>;
}
