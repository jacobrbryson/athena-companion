import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { api } from '../api/client';
import type { ProjectsSnapshot } from '../api/projects';
import { Drawer } from './Drawer';
import { DrawerButton } from './ActionControls';
import { SectionTabs } from './PageTabs';
import './property.css';

type Point = { x: number; y: number };
import { areaHealth, type IssueSignal, type PropertyArea, type PropertyDetails } from './propertyHealth';
export { propertyHealth } from './propertyHealth';
const PROPERTY_TABS = [
  { label: 'Overview', id: 'property-overview', icon: 'Home' },
  { label: 'Issues', id: 'property-issues', icon: 'Issues' },
  { label: 'Vehicles', id: 'property-vehicles', icon: 'Vehicles' },
  { label: 'Utilities', id: 'property-utilities', icon: 'Utilities' },
  { label: 'Security', id: 'property-security', icon: 'Home' },
  { label: 'Projects', id: 'property-projects', icon: 'PropertyProjects' },
  { label: 'Concerns', id: 'property-concerns', icon: 'Concerns' },
  { label: 'Property Map', id: 'property-map', icon: 'PropertyMap' },
  { label: 'Seasonal focus', id: 'property-season', icon: 'Seasonal' },
 ] as const;
export type PropertyTab = typeof PROPERTY_TABS[number]['id'];
export const PROPERTY_TAB_IDS = PROPERTY_TABS.map(t => t.id);
export function propertyTabFromPath(pathname: string): PropertyTab {
  const parts = pathname.split('/');
  const slug = parts[3] || parts[2];
  const id = `property-${slug}`;
  return (PROPERTY_TAB_IDS as string[]).includes(id) ? id as PropertyTab : 'property-overview';
}
export function propertyTabPath(propertyId: string | undefined, tab: PropertyTab): string {
  const base = propertyId ? `/properties/${encodeURIComponent(propertyId)}` : '/properties';
  return tab === 'property-overview' ? base : `${base}/${tab.slice('property-'.length)}`;
}
export function PropertyNavigation({ active, onChange }: { active: PropertyTab; onChange: (tab: PropertyTab) => void }) {
  return <SectionTabs tabs={PROPERTY_TABS} active={active} onChange={onChange} label="Property sections" panelId="property-tab-panel" />;
}
type WeatherRead = { status: 'ready' | 'unavailable' | 'no_address'; weather: { temperatureF: number | null; description: string | null; highF: number | null; lowF: number | null; checkedAt: string; periodStart: string } | null };
export function PropertyWeather({ address }: { address: string }) {
  const [result, setResult] = useState<{ address: string; data: WeatherRead } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!address.trim()) return;
    let alive = true;
    const load = () => api.get<WeatherRead>('/api/v1/projects/property/weather')
      .then(data => { if (alive) setResult({ address, data }); })
      .catch(() => { if (alive) setResult({ address, data: { status: 'unavailable', weather: null } }); });
    void load();
    const timer = window.setInterval(load, 15 * 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [address, attempt]);
  const data = result?.address === address ? result.data : null;
  const sky = data?.weather;
  const degrees = (n: number | null) => n === null ? '—' : `${Math.round(n)}°`;
  return <div className="property-weather" aria-live="polite">
    {!address.trim() ? <span>Add a property address for weather.</span> : !data ? <span>Loading property weather…</span> : !sky ? <span>Weather unavailable <button onClick={() => { setResult(null); setAttempt(a => a + 1); }}>Retry</button></span> : <>
      <div><strong>{degrees(sky.temperatureF)}<small>F</small></strong><span>{sky.description || 'No forecast description'}</span></div>
      <span title="High and low forecast temperatures over the next 24 hours">Next 24h · H {degrees(sky.highF)} L {degrees(sky.lowF)}</span>
      <small title={`Retrieved ${new Date(sky.checkedAt).toLocaleString()}`}>NWS · hourly forecast</small>
    </>}
  </div>;
}
const empty: PropertyDetails = { name: '', address: '', description: '', acreage: '', headerImage: '', mapImage: '', areas: [], boundary: [] };
export function useProperty() {
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ properties: PropertyDetails[] }>('/api/v1/projects/property').then(r => { if (alive) { setProperty(r.properties[0] || null); setError(''); } })
      .catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  return { property, loading, error, retry: () => setAttempt(a => a + 1), save: async (draft: PropertyDetails) => {
    const r = await api.put<{ properties: PropertyDetails[] }>('/api/v1/projects/property', draft);
    setProperty(r.properties[0]); setError('');
  } };
}
export async function readImage(file: File) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('Choose an image under 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', .75);
    if (image.length > 1500000) throw new Error('Image is too detailed; choose a smaller image.');
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function PropertyMap({ property, onPoint, onArea }: { property: PropertyDetails; onPoint?: (p: Point) => void; onArea?: (index: number) => void }) {
  function click(e: MouseEvent<HTMLDivElement>) {
    if (!onPoint) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPoint({ x: Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y: Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)) });
  }
  return <div className={`property-map ${onPoint ? 'property-map-edit' : ''}`} onClick={click}>
    {property.mapImage ? <img src={property.mapImage} alt={`${property.name} overview`} /> : <p>Upload an aerial image to map your property.</p>}
    {property.mapImage && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={property.boundary.map(p => `${p.x},${p.y}`).join(' ')} /><polygon points={property.boundary.length >= 3 ? property.boundary.map(p => `${p.x},${p.y}`).join(' ') : ''} /></svg>}
    {property.mapImage && property.areas.map((a, i) => <button key={i} type="button" style={{ left: `${a.x}%`, top: `${a.y}%` }} onClick={e => { e.stopPropagation(); onArea?.(i); }} aria-label={`Select ${a.name}`}>{a.name || 'New area'}</button>)}
  </div>;
}

export function PropertyOverview({ state, snap, issues = [], projectsLoading, mapOnly = false, charter }: { state: ReturnType<typeof useProperty>; snap: ProjectsSnapshot; issues?: IssueSignal[]; projectsLoading: boolean; mapOnly?: boolean; charter?: (close: () => void) => ReactNode }) {
  const [draft, setDraft] = useState<PropertyDetails | null>(null);
  const [editor, setEditor] = useState<'property' | 'areas'>('property');
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const p = state.property;
  const edit = () => { setEditor('property'); setDraft(structuredClone(p || empty)); setError(''); setSelected(null); };
  const editAreas = (index: number | null = null) => { if (!p) return; setEditor('areas'); setDraft(structuredClone(p)); setError(''); setSelected(index); };
  const patchArea = (patch: Partial<PropertyArea>) => setDraft(d => d && selected !== null ? { ...d, areas: d.areas.map((a, i) => i === selected ? { ...a, ...patch } : a) } : d);
  const field = (key: 'name' | 'address' | 'description' | 'acreage', label: string) => <label>{label}<input value={draft?.[key] ?? ''} type={key === 'acreage' ? 'number' : 'text'} min={0} step="any" maxLength={key === 'description' ? 2000 : key === 'address' ? 500 : 190} onChange={e => setDraft(d => d && { ...d, [key]: e.target.value })} required={key === 'name'} /></label>;
  return <>
    <section className={`section-panel property-glance${mapOnly ? ' section-panel-wide' : ''}`}><header><h2>{mapOnly ? 'Property Map' : 'Property at a glance'}</h2><DrawerButton onClick={edit} disabled={state.loading || !!state.error}>{p ? 'Edit property' : 'Add property'}</DrawerButton></header>
      {state.error && <p role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>}
      {state.loading ? <p>Loading property…</p> : p ? <>
        <div className="property-details"><strong>{p.name}</strong><span>{[p.address, p.acreage !== null && p.acreage !== '' ? `${p.acreage} acres` : ''].filter(Boolean).join(' · ')}</span><p>{p.description}</p></div>
        <PropertyMap property={p} onArea={editAreas} />
        {mapOnly && <DrawerButton onClick={() => editAreas()}>Manage key areas</DrawerButton>}
      </> : !state.error && <div className="property-empty"><h3>Your house, land, and everything around it.</h3><p>Add your property details and an aerial image. Mark structures and areas, then link the work and concerns that belong there.</p><button className="property-button" onClick={edit}>+ Add property</button></div>}
    </section>
    {p && !mapOnly && <section className="section-panel" id="property-areas"><header><h2>Key areas</h2><DrawerButton onClick={() => editAreas()}>Manage key areas</DrawerButton></header><p className="property-muted">{p.areas.length} areas · Calculated from linked concerns and projects, and from open issues reported under an area's name. No links means not assessed.</p><div className="section-panel-body"><div className="property-areas">{p.areas.map((a, i) => {
      const h = areaHealth(a, snap, issues);
      return <button key={i} className={`property-area ${h.tone}`} onClick={() => editAreas(i)}><strong>{a.name}</strong><span>{projectsLoading ? 'Loading…' : h.label}</span><div className="property-meter">{h.score !== null && !projectsLoading && <i style={{ width: `${h.score}%` }} />}</div></button>;
    })}</div>{!p.areas.length && <button className="property-button" onClick={() => editAreas()}>+ Add key area</button>}</div></section>}
    {draft && <Drawer eyebrow="YOUR PROPERTY" title={editor === 'areas' ? 'Manage key areas' : p ? 'Edit property' : 'Add property'} onClose={() => { if (!busy) setDraft(null); }}>
      <form className="property-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await state.save(draft); setDraft(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
        <fieldset disabled={busy}>{editor === 'property' && <>{field('name', 'Property name')}{field('address', 'Address')}{field('description', 'Description')}{field('acreage', 'Acreage')}
        {(['mapImage'] as const).map(key => <label key={key}>Aerial / overview image<input type="file" accept="image/*" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError(''); try { const image = await readImage(file); setDraft(d => d && { ...d, [key]: image, ...(key === 'mapImage' ? { areas: [], boundary: [] } : {}) }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }} />{draft[key] && <button type="button" onClick={() => setDraft(d => d && { ...d, [key]: '', ...(key === 'mapImage' ? { areas: [], boundary: [] } : {}) })}>Remove image</button>}</label>)}
        <p className="property-muted">Replacing the overview image clears its pins and boundary.</p>
        {draft.mapImage && <><div className="property-map-tools"><button type="button" onClick={() => setDraft(d => d && { ...d, boundary: d.boundary.slice(0, -1) })}>Undo boundary point</button><button type="button" onClick={() => setDraft(d => d && { ...d, boundary: [] })}>Clear boundary</button></div><p className="property-muted">Click boundary corners in order; three points close the outline. Manage area labels and links in the Key areas drawer.</p>
          <PropertyMap property={draft} onPoint={point => setDraft(d => d && { ...d, boundary: [...d.boundary, point] })} /></>}
        </>}
        {editor === 'areas' && <>
        <p className="property-muted">Define the areas you want to assess and link their projects and concerns. Property details, photos and the boundary are managed in Edit property.</p>
        {draft.mapImage && <><p className="property-muted">Click to place an area. Select an existing area to move it; choose New area to add another.</p>
          <PropertyMap property={draft} onArea={setSelected} onPoint={point => {
            if (selected !== null) patchArea(point);
            else { setSelected(draft.areas.length); setDraft(d => d && { ...d, areas: [...d.areas, { ...point, name: 'New area', projects: [], concerns: [] }] }); }
          }} /></>}
        <button type="button" onClick={() => { setSelected(draft.areas.length); setDraft(d => d && { ...d, areas: [...d.areas, { x: 50, y: 50, name: 'New area', projects: [], concerns: [] }] }); }}>+ New area</button>
        {draft.areas.length > 0 && <label>Select area<select value={selected ?? ''} onChange={e => setSelected(e.target.value === '' ? null : Number(e.target.value))}><option value="">New area</option>{draft.areas.map((a, i) => <option key={i} value={i}>{a.name}</option>)}</select></label>}
        {selected !== null && draft.areas[selected] && <><label>Area / structure name<input maxLength={100} required value={draft.areas[selected].name} onChange={e => patchArea({ name: e.target.value })} /></label><label>Linked projects<select multiple value={draft.areas[selected].projects} onChange={e => patchArea({ projects: Array.from(e.target.selectedOptions, o => o.value) })}>{snap.projects.filter(p => p.primaryArea === 'home' || p.areas.some(a => a.area === 'home')).map(p => <option value={p.uuid} key={p.uuid}>{p.title}</option>)}</select></label><label>Linked concerns<select multiple value={draft.areas[selected].concerns} onChange={e => patchArea({ concerns: Array.from(e.target.selectedOptions, o => o.value) })}>{snap.concerns.filter(c => c.area === 'home').map(c => <option value={c.uuid} key={c.uuid}>{c.title}</option>)}</select></label><p className="property-muted">Use Ctrl / Command to select multiple links.</p><button type="button" onClick={() => { setDraft(d => d && { ...d, areas: d.areas.filter((_, i) => i !== selected) }); setSelected(null); }}>Remove area</button></>}
        {selected !== null && draft.areas[selected] && (['x', 'y'] as const).map(axis => <label key={axis}>{axis === 'x' ? 'Horizontal' : 'Vertical'} position (% from {axis === 'x' ? 'left' : 'top'})<input type="number" min={0} max={100} step="any" value={draft.areas[selected!][axis]} onChange={e => patchArea({ [axis]: Number(e.target.value) })} /></label>)}
        </>}
        {error && <p role="alert">{error}</p>}<button className="property-button" type="submit">{busy ? 'Saving…' : editor === 'areas' ? 'Save key areas' : 'Save property'}</button></fieldset>
      </form>
      {editor === 'property' && charter && <section className="property-charter"><h3>Your charter</h3><p className="property-muted">How you decide what comes first on the property.</p>{charter(() => setDraft(null))}</section>}
    </Drawer>}
  </>;
}
