import { useEffect, useState, type ReactNode } from 'react';
import { dashboardApi, type CommunityOverview, type CommunityWeather, type ForecastHour, type NearbyIncident, type PlaceReminderPhone, type WatchPlace, type WeatherAlert } from '../api/dashboard';
import type { CommunityEvent as CalendarMention } from './communityCalendar';
import { CommunityMap, PhoneFenceNotice, PlaceDrawer, isPastEvent, tidyAddress } from './Community';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import './health.css';
import './calendar.css';
import './family.css';
import './community.css';

/**
 * The Community page (redesigned 2026-10-16 from the owner's concept): Lake
 * Norman behind the head, four numbers, the map beside the watched places and
 * the neighbors, then alerts, the weather at home and what's coming up, and
 * the latest local news. The editable lists stay below it (Dashboard.tsx);
 * "View all" scrolls to the one that does it. Watched places are the
 * exception (owner, 2026-10-24): a place opens in the side drawer to edit or
 * add, and "Manage" goes to the full list at /community/points-of-interest.
 * The weather sits beside the map, where nearby people used to.
 *
 * Everything shown is read from something real — the person's own lists,
 * the incident watcher, NWS and their news pages. Athena's line at the top is
 * written here, in code, from those, never by a model.
 */

interface Props {
  community: CommunityOverview | null;
  /** What every panel says while the community list is loading or failed; null once it's here. */
  waiting: ReactNode;
  calls: NearbyIncident[];
  weatherAlerts: WeatherAlert[];
  /** Whether the incident watcher has answered yet. */
  nearbyReady: boolean;
  /** Calendar events in the next seven days that mention the community. */
  calendar: CalendarMention[];
  onAsk: (text: string) => void;
  onNeighbors: (next: CommunityOverview['neighbors']) => void;
  /** Scroll to one of the detail panels below by its id. */
  onSection: (id: string) => void;
  /** The places changed in the drawer: the saved list, as the server returned it. */
  onPlaces: (next: WatchPlace[]) => void;
  /** Open the full points-of-interest page. */
  onManagePlaces: () => void;
  onAddNews: () => void;
}

const DAY = 86400000;
const SATELLITE_KEY = 'athena.community.satellite';
const KIND_BADGE: Partial<Record<WatchPlace['kind'], { icon: string; tone: string }>> = {
  home: { icon: 'home', tone: 'hp-blue' }, neighborhood: { icon: 'home', tone: 'hp-blue' }, family: { icon: 'people', tone: 'hp-violet' },
};
const badgeOf = (kind: WatchPlace['kind']) => KIND_BADGE[kind] || { icon: 'pin', tone: 'hp-green' };

/** "148 Rushing Water Lane, Troutman, NC 28166" → ["148 Rushing Water Lane", "Troutman, NC 28166"]. */
function addressLines(address: string | null) {
  const parts = tidyAddress(address).split(',').map(p => p.trim()).filter(Boolean);
  return parts.length > 1 ? [parts[0], parts.slice(1).join(', ')] : parts;
}
/** "Troutman, NC" from a full address, when it has a town and a state. */
function townOf(address: string | null) {
  // The ZIP may ride with the state ("NC 28166") or stand alone ("NC, 28166"); either way it goes.
  // Census lookups come back in capitals; tidyAddress makes "TROUTMAN" read as "Troutman".
  const parts = tidyAddress(address).split(',').map(p => p.trim().replace(/\s*\d{5}(-\d{4})?$/, '')).filter(Boolean);
  if (parts.length < 3) return null;
  return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
}
function ago(value?: string | null) {
  const at = Date.parse(value || '');
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return minutes < 1 ? 'just now' : `${minutes} min ago`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  const d = Math.floor(minutes / 1440);
  return d < 7 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const monthDay = (d: Date) => ({ mon: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(), day: d.getDate() });
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** An icon for an NWS short forecast ("Partly Sunny", "Chance Showers And Thunderstorms"). */
export function skyIcon(h: Pick<ForecastHour, 'shortForecast' | 'isDaytime'>) {
  const t = (h.shortForecast || '').toLowerCase();
  if (/thunder|storm/.test(t)) return 'storm';
  if (/snow|sleet|ice|flurr|freezing/.test(t)) return 'snow';
  if (/rain|shower|drizzle/.test(t)) return 'rain';
  if (/fog|haze|mist|smoke/.test(t)) return 'fog';
  if (/partly|mostly sunny|mostly clear/.test(t)) return h.isDaytime === false ? 'moon' : 'partly';
  if (/cloud|overcast/.test(t)) return 'cloud';
  return h.isDaytime === false ? 'moon' : 'sun';
}
export const degrees = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}°`);

function useHomeWeather(places: WatchPlace[] | undefined) {
  const [read, setRead] = useState<CommunityWeather | null>(null);
  const [failed, setFailed] = useState(false);
  // Re-read when home moves; the forecast itself is cached server-side for half an hour.
  const key = (places || []).filter(p => p.enabled).map(p => `${p.kind}:${p.latitude},${p.longitude}`).join('|');
  useEffect(() => {
    if (places === undefined) return;
    let alive = true;
    const load = () => dashboardApi.communityWeather().then(r => { if (alive) { setRead(r); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    void load();
    const timer = window.setInterval(load, 30 * 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [key, places === undefined]); // eslint-disable-line react-hooks/exhaustive-deps
  return { read, failed };
}

export function CommunityOverview({ community, waiting, calls, weatherAlerts, nearbyReady, calendar, onAsk, onNeighbors, onSection, onPlaces, onManagePlaces, onAddNews }: Props) {
  const places = community?.places;
  const enabled = (places || []).filter(p => p.enabled);
  const home = enabled.find(p => p.kind === 'home') || enabled[0] || null;
  const neighbors = community?.neighbors || [];
  const { read: sky, failed: skyFailed } = useHomeWeather(places);
  // The place drawer: a uuid to edit, null to add one.
  const [placeDrawer, setPlaceDrawer] = useState<{ uuid: string | null } | null>(null);
  const addPlace = () => setPlaceDrawer({ uuid: null });
  // Whether place reminders can fire on the phone; a warning on Watched Places when they can't.
  const [phone, setPhone] = useState<PlaceReminderPhone | null>(null);
  useEffect(() => {
    let alive = true;
    dashboardApi.placeReminders().then(r => { if (alive) setPhone(r.phone || null); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const [satellite, setSatellite] = useState(() => { try { return window.localStorage.getItem(SATELLITE_KEY) !== 'map'; } catch { return true; } });
  const pickView = (on: boolean) => { setSatellite(on); try { window.localStorage.setItem(SATELLITE_KEY, on ? 'satellite' : 'map'); } catch { /* per-browser nicety only */ } };
  const tall = typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 900px)').matches;

  // Coming up: the person's own events and the calendar's community mentions, soonest first.
  const today = localIso(new Date());
  const weekOut = localIso(new Date(Date.now() + 7 * DAY));
  const saved = (community?.events || []).filter(e => !isPastEvent(e));
  const coming = [
    ...saved.map(e => ({ key: e.uuid, at: new Date(`${e.nextOn}T12:00:00`), title: e.title, sub: [e.time, e.location || (e.placeUuid && places?.find(p => p.uuid === e.placeUuid)?.name)].filter(Boolean).join(' · ') || 'Saved event', ask: `Tell me about ${e.title}.` })),
    ...calendar.map((c, i) => ({ key: `${c.event.id}-${i}`, at: new Date(c.event.allDay ? `${c.event.start.slice(0, 10)}T12:00:00` : c.event.start), title: c.what, sub: [c.when, c.who, c.event.location].filter(Boolean).join(' · '), ask: `What should I know about "${c.event.title}"?` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const thisWeek = saved.filter(e => e.nextOn >= today && e.nextOn <= weekOut).length + calendar.length;

  const alerts = weatherAlerts.length + calls.length;
  const serious = weatherAlerts.filter(w => w.serious).length + calls.filter(c => c.serious).length;
  const news = community?.localNews || [];
  const town = townOf(home?.address || null) || sky?.weather?.town || null;

  const take = !community ? 'Reading your community…'
    : !enabled.length ? 'Add home and the places you care about, and I’ll keep watch around them — safety, weather, local news and events.'
      : alerts ? `${alerts === 1 ? 'There’s one alert' : `There are ${alerts} alerts`} near your places right now${serious ? `, ${serious} serious` : ''}. I’ll keep you posted as it changes.`
        : `I keep an eye on the places you care about and let you know about important updates — safety, weather, local news, events, and more.`;

  const hours = sky?.weather?.hours || [];
  const temps = hours.map(h => h.temperatureF).filter((t): t is number => t != null);
  const strip = [0, 3, 6, 9, 12].map(i => hours[i]).filter(Boolean);

  return <div className="hp cp cmp">
    <PageHeader eyebrow="THE PLACE AROUND YOU" title="Community" blurb="The places, people, and goings-on that make up where you live."
      backdrop="/assets/lkn.jpg"
      aside={<button type="button" className="ph-take cmp-where" onClick={() => onAsk('What’s going on around my community that I should know about?')}>
        <header><span className="hp-badge hp-badge-lg hp-blue"><Icon name="pin" /></span><div><strong>{town || home?.name || 'Your community'}</strong><small>{home ? `Around ${home.name}${enabled.length > 1 ? ` and ${enabled.length - 1} more place${enabled.length === 2 ? '' : 's'}` : ''}` : 'No places watched yet'}</small></div></header>
        <p>“{take}”</p>
        <span className="ph-take-go"><Icon name="chevron" /></span>
      </button>} />

    <section className="cp-stats" aria-label="Your community at a glance">
      <button type="button" className="hp-tile cp-stat" onClick={onManagePlaces}>
        <span className="hp-badge hp-badge-lg hp-green"><Icon name="pin" /></span>
        <div><span>Watched places</span><strong>{community ? enabled.length : '—'}</strong><small>{community && (places?.length || 0) > enabled.length ? `${(places?.length || 0) - enabled.length} paused` : 'Monitored 24/7'}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <button type="button" className="hp-tile cp-stat" onClick={() => onSection('community-neighbors')}>
        <span className="hp-badge hp-badge-lg hp-indigo"><Icon name="people" /></span>
        <div><span>Neighbors</span><strong>{community ? neighbors.length : '—'}</strong><small>You know nearby</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <button type="button" className="hp-tile cp-stat" onClick={() => onSection('community-events')}>
        <span className="hp-badge hp-badge-lg hp-blue"><Icon name="calendar" /></span>
        <div><span>Local events</span><strong>{community ? thisWeek : '—'}</strong><small>In the next 7 days</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <button type="button" className="hp-tile cp-stat" onClick={() => onSection('community-nearby')}>
        <span className={`hp-badge hp-badge-lg ${serious ? 'hp-red' : 'hp-orange'}`}><Icon name="bell" /></span>
        <div><span>Active alerts</span><strong>{nearbyReady ? alerts : '—'}</strong><small>{!nearbyReady ? 'Checking…' : serious ? `${serious} serious` : alerts ? 'Near your places' : 'Nothing right now'}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
    </section>

    <div className="cmp-grid">
      <section className="hp-panel cmp-map">
        <header>
          <h2><Icon name="map" className="cmp-map-icon" /> Your Community Map</h2>
          <div className="hp-tabs" role="tablist" aria-label="Map style">
            <button type="button" role="tab" aria-selected={!satellite} className={satellite ? '' : 'active'} onClick={() => pickView(false)}>Map</button>
            <button type="button" role="tab" aria-selected={satellite} className={satellite ? 'active' : ''} onClick={() => pickView(true)}>Satellite</button>
          </div>
        </header>
        {waiting || (enabled.length || neighbors.some(n => n.latitude != null)
          ? <CommunityMap places={places || []} neighbors={neighbors} onNeighbors={onNeighbors} height={tall ? 470 : 320} satellite={satellite} />
          : <div className="fp-empty-hero"><Icon name="map" className="fp-empty-icon" /><strong>Nothing on the map yet</strong><p>Add home, and the places you care about appear here with the ring I watch around each.</p><button type="button" className="cp-outline" onClick={addPlace}>Add a place to watch <Icon name="arrowRight" /></button></div>)}
        {enabled.length > 0 && <ul className="cmp-legend">
          {enabled.map(p => <li key={p.uuid}><i className={badgeOf(p.kind).tone} />{p.name} ({p.radiusMiles} mi)</li>)}
          {neighbors.length > 0 && <li><i className="cmp-neighbor-dot" />Known neighbor</li>}
        </ul>}
      </section>

      <div className="hp-stack">
        <section className="hp-panel cmp-places">
          <header><h2>Watched Places</h2><button type="button" className="hp-link" onClick={onManagePlaces}>Manage <Icon name="arrowRight" /></button></header>
          <PhoneFenceNotice phone={phone} className="cmp-phone-alert" />
          {waiting || <>
            {!places?.length ? <p className="hp-empty">Nothing watched yet — start with home, then your church, the kids’ school, the town square.</p>
              : <ul className="cmp-rows">{places.slice(0, 3).map(p => {
                const b = badgeOf(p.kind);
                const [line1, line2] = addressLines(p.address);
                return <li key={p.uuid} className={p.enabled ? undefined : 'cmp-paused'}>
                  <button type="button" onClick={() => setPlaceDrawer({ uuid: p.uuid })} aria-label={`Edit ${p.name}`}>
                    {p.photoUrl ? <img className="cmp-place-photo" src={p.photoUrl} alt="" /> : <span className={`hp-badge hp-badge-lg ${b.tone}`}><Icon name={b.icon} /></span>}
                    <div>
                      <strong>{p.name}</strong>
                      {line1 ? <small>{line1}</small> : <small>{p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}</small>}
                      {line2 && <small>{line2}</small>}
                      <span className="cmp-meta"><em className="cmp-chip">{p.radiusMiles} mi</em><em className={p.enabled ? 'cmp-on' : 'cmp-off'}><i />{p.enabled ? 'Monitoring 24/7' : 'Paused'}</em></span>
                    </div>
                  </button>
                </li>;
              })}</ul>}
            {(places?.length || 0) > 3 && <button type="button" className="hp-link cmp-more" onClick={onManagePlaces}>{(places?.length || 0) - 3} more <Icon name="arrowRight" /></button>}
            <button type="button" className="cp-outline fp-wide" onClick={addPlace}><Icon name="plus" /> Add a place to watch</button>
          </>}
        </section>

        <section className="hp-panel cmp-weather">
          <header><h2>Local Weather</h2><button type="button" className="hp-link" onClick={() => onSection('community-weather')}>Forecast &amp; alerts <Icon name="arrowRight" /></button></header>
          {!sky ? <p className="hp-empty">{skyFailed ? 'Weather is unavailable right now.' : places === undefined ? 'Loading…' : 'Checking the forecast…'}</p>
            : !sky.weather ? <p className="hp-empty">{sky.status === 'no_place' ? 'Add home as a watched place and I’ll show the weather there.' : 'The National Weather Service didn’t answer just now.'}</p>
              : <>
                <button type="button" className="cmp-now" onClick={() => onAsk('What’s the weather looking like at home today?')}>
                  <Icon name={skyIcon(sky.weather.now)} className={`cmp-sky cmp-sky-${skyIcon(sky.weather.now)}`} />
                  <div><strong>{degrees(sky.weather.now.temperatureF)}</strong><span>{sky.weather.now.shortForecast || ''}</span>{temps.length > 0 && <small>H {degrees(Math.max(...temps))}  L {degrees(Math.min(...temps))}</small>}</div>
                </button>
                <ul className="cmp-hours">{strip.map((h, i) => {
                  const icon = skyIcon(h);
                  return <li key={h.start}><small>{i === 0 ? 'Now' : new Date(h.start).toLocaleTimeString(undefined, { hour: 'numeric' })}</small><Icon name={icon} className={`cmp-sky-${icon}`} /><span>{degrees(h.temperatureF)}</span></li>;
                })}</ul>
                <p className="hp-footnote">National Weather Service · {ago(sky.weather.checkedAt) || 'just now'}</p>
              </>}
        </section>
      </div>
    </div>

    <div className="cp-bottom">
      <section className="hp-panel cmp-alerts">
        <header><h2>Local Alerts</h2><button type="button" className="hp-link" onClick={() => onSection('community-nearby')}>View all <Icon name="arrowRight" /></button></header>
        {!nearbyReady ? <p className="hp-empty">Checking nearby…</p>
          : !alerts ? <div className="fp-empty-hero"><Icon name="bell" className="fp-empty-icon" /><strong>No active alerts</strong><p>I’ll let you know about 911 calls, severe weather, and important updates near your places.</p></div>
            : <ul className="cmp-rows">
              {weatherAlerts.slice(0, 3).map(w => <li key={w.id} className={w.serious ? 'cmp-serious' : undefined}><button type="button" onClick={() => onAsk(`Tell me about the ${w.event} near ${w.place}.`)}>
                <span className="hp-badge hp-badge-lg hp-amber"><Icon name="storm" /></span>
                <div><strong>{w.event}</strong><small>{[w.place, w.expires ? `until ${new Date(w.expires).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : null].filter(Boolean).join(' · ')}</small></div>
              </button></li>)}
              {calls.slice(0, Math.max(0, 4 - Math.min(3, weatherAlerts.length))).map(c => <li key={c.id} className={c.serious ? 'cmp-serious' : undefined}><button type="button" onClick={() => onAsk(`What do you know about the ${c.what} near ${c.place}?`)}>
                <span className={`hp-badge hp-badge-lg ${c.serious ? 'hp-red' : 'hp-orange'}`}><Icon name="bell" /></span>
                <div><strong>{c.what}</strong><small>{[c.where, `${c.miles} mi from ${c.place}`, ago(c.receivedAt)].filter(Boolean).join(' · ')}</small></div>
              </button></li>)}
            </ul>}
      </section>

      <section className="hp-panel cmp-coming">
        <header><h2>Coming Up Nearby</h2><button type="button" className="hp-link" onClick={() => onSection('community-events')}>View all <Icon name="arrowRight" /></button></header>
        {waiting || (!coming.length
          ? <div className="fp-empty-hero"><Icon name="calendar" className="fp-empty-icon" /><strong>No local events saved</strong><p>I can look for community events, school activities, and local happenings near your places.</p><button type="button" className="cp-outline" onClick={() => onAsk('Find local events coming up near my places — community events, school activities, anything worth knowing about.')}>Find local events</button></div>
          : <ul className="fp-dated">{coming.slice(0, 4).map(c => {
            const d = monthDay(c.at);
            return <li key={c.key}><button type="button" onClick={() => onAsk(c.ask)}>
              <span className="fp-date"><small>{d.mon}</small>{d.day}</span>
              <div><strong>{c.title}</strong><small>{c.sub}</small></div>
              <Icon name="chevron" className="hp-chev" />
            </button></li>;
          })}</ul>)}
      </section>
    </div>

    <section className="hp-panel cmp-updates">
      <header><h2>Recent Local Updates</h2><button type="button" className="hp-link" onClick={() => onSection('community-news')}>View all <Icon name="arrowRight" /></button></header>
      {waiting || (community?.localNews === null ? <p className="hp-empty">News couldn’t load just now.</p>
        : !news.length ? <div className="cmp-updates-empty"><p className="hp-empty">Nothing this week mentions your towns or places. A local paper or your town’s page widens what I can catch.</p><button type="button" className="cp-outline" onClick={onAddNews}>Add a local news page <Icon name="arrowRight" /></button></div>
          : <ul>{news.slice(0, 3).map((n, i) => {
            const body = <>
              <span className="hp-badge hp-badge-lg hp-amber"><Icon name="news" /></span>
              <div><small>{ago(n.published || n.firstSeen)}</small><strong>{n.title}</strong><small>{n.via === 'source' ? n.source : `${n.source} · mentions ${n.matched}`}</small></div>
              <Icon name="chevron" className="hp-chev" />
            </>;
            return <li key={`${n.url}-${i}`}>{n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer">{body}</a> : <button type="button" onClick={() => onAsk(`Tell me about "${n.title}".`)}>{body}</button>}</li>;
          })}</ul>)}
    </section>
    {placeDrawer && <PlaceDrawer places={places || []} uuid={placeDrawer.uuid} onPlaces={onPlaces} onClose={() => setPlaceDrawer(null)} />}
  </div>;
}
