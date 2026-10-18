import { useEffect, useState } from 'react';
import { dashboardApi, type FrostRisk, type OutlookNight, type WeatherAlertInput, type WeatherAlertKind, type WeatherAlertRule, type WeatherAlertsRead, type WeatherOutlookRead } from '../api/dashboard';
import { Field, Problem, errorText } from './Community';
import { degrees, skyIcon } from './CommunityPage';
import { Icon } from './HealthPage';

/**
 * Community → Weather (2026-10-18, ahead of the first frost): the longer NWS
 * forecast at a watched place — a frost read for every night, seven days of
 * highs and lows, two days by the hour with humidity and wind — and the
 * weather alerts the person sets for themselves. Alerts are read against the
 * forecast by the athena-incidents job and sent once per night or day; see
 * core_api docs/capabilities/weather-alerts.md.
 */

const KIND_LABEL: Record<WeatherAlertKind, string> = {
  cold: 'Cold / frost', heat: 'Heat', rain: 'Rain', snow: 'Snow', ice: 'Ice (sleet, freezing rain)', storm: 'Thunderstorms', wind: 'Wind',
};
const KIND_UNIT: Partial<Record<WeatherAlertKind, { unit: string; fallback: number; hint: string }>> = {
  cold: { unit: '°F', fallback: 34, hint: 'at or below — 34° catches most frost, 32° a freeze, 28° a hard freeze' },
  heat: { unit: '°F', fallback: 95, hint: 'at or above' },
  rain: { unit: '%', fallback: 60, hint: 'chance of rain at or above' },
  wind: { unit: 'mph', fallback: 35, hint: 'wind or gusts at or above' },
};
const RISK: Record<FrostRisk, { label: string; tone: string }> = {
  none: { label: 'No frost', tone: 'wx-ok' },
  unknown: { label: '—', tone: 'wx-ok' },
  possible: { label: 'Frost possible', tone: 'wx-watch' },
  likely: { label: 'Frost likely', tone: 'wx-warn' },
  freeze: { label: 'Freeze', tone: 'wx-alert' },
  hard_freeze: { label: 'Hard freeze', tone: 'wx-alert' },
};
const LEADS = [6, 12, 24, 36, 48, 72];

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A night is named by its evening: "Tonight", "This morning" (last night's tail), "Mon night". */
function nightName(n: OutlookNight) {
  if (n.night === localDate(new Date())) return 'Tonight';
  if (n.night === localDate(new Date(Date.now() - 86_400_000))) return 'This morning';
  return `${new Date(`${n.night}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} night`;
}
/** "Tonight" -> "tonight" mid-sentence; "Mon night" keeps its capital. */
const inSentence = (name: string) => (/^(Tonight|This morning)$/.test(name) ? name.toLowerCase() : name);
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric' });

function FrostLine({ outlook }: { outlook: NonNullable<WeatherOutlookRead['outlook']> }) {
  const next = outlook.nextFrost;
  const last = outlook.nights[outlook.nights.length - 1];
  if (!next) {
    const coldest = outlook.nights.reduce<OutlookNight | null>((a, n) => (!a || n.lowF < a.lowF ? n : a), null);
    return <p className="wx-frost wx-ok"><Icon name="sun" /> <span>No frost in the forecast{last ? ` through ${nightName(last)}` : ''}.{coldest ? ` Coldest: ${degrees(coldest.lowF)} ${inSentence(nightName(coldest))}.` : ''}</span></p>;
  }
  const risk = RISK[next.risk];
  return <p className={`wx-frost ${risk.tone}`}><Icon name="snow" /> <span><strong>{risk.label} {inSentence(nightName(next))}</strong> — low {degrees(next.lowF)} around {clock(next.at)}{next.windMph != null ? `, wind ${next.windMph} mph` : ''}{next.shortForecast ? `, ${next.shortForecast.toLowerCase()}` : ''}.</span></p>;
}

function Outlook({ read, onAsk }: { read: WeatherOutlookRead; onAsk?: (text: string) => void }) {
  const o = read.outlook;
  if (!o) return <p className="dashboard-empty">{read.status === 'no_place' ? 'Add home as a watched place and I’ll show the weather there.' : 'The National Weather Service didn’t answer just now.'}</p>;
  const strip = o.hours.filter((_, i) => i % 3 === 0).slice(0, 16);
  return <>
    <FrostLine outlook={o} />
    <div className="wx-now">
      <Icon name={skyIcon(o.now)} className={`cmp-sky cmp-sky-${skyIcon(o.now)}`} />
      <div>
        <strong>{degrees(o.now.temperatureF)}</strong>
        <span>{o.now.shortForecast}</span>
        <small>{[o.now.humidity != null ? `Humidity ${o.now.humidity}%` : null, o.now.dewpointF != null ? `Dew point ${degrees(o.now.dewpointF)}` : null, o.now.windMph != null ? `Wind ${o.now.windDirection || ''} ${o.now.windMph} mph`.replace('  ', ' ') : null].filter(Boolean).join(' · ')}</small>
      </div>
    </div>

    {o.nights.length > 0 && <>
      <h3 className="wx-sub">Overnight lows</h3>
      <ul className="wx-nights">{o.nights.map(n => <li key={n.night} className={RISK[n.risk].tone}>
        <small>{nightName(n)}</small><strong>{degrees(n.lowF)}</strong><em>{RISK[n.risk].label}</em>
      </li>)}</ul>
    </>}

    {o.days.length > 0 && <>
      <h3 className="wx-sub">Next 7 days</h3>
      <ul className="wx-days">{o.days.map(d => {
        const icon = skyIcon({ shortForecast: d.shortForecast, isDaytime: true });
        return <li key={d.date} title={d.detailedForecast || undefined}>
          <span className="wx-day-name">{d.name || new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}</span>
          <Icon name={icon} className={`cmp-sky-${icon}`} />
          <span className="wx-day-sky">{d.shortForecast}</span>
          <span className="wx-day-rain">{d.precipitationChance ? `${d.precipitationChance}%` : ''}</span>
          <span className="wx-day-temps"><strong>{degrees(d.highF)}</strong> / {degrees(d.lowF)}</span>
        </li>;
      })}</ul>
    </>}

    <h3 className="wx-sub">Next 48 hours</h3>
    <div className="wx-hours-scroll"><ul className="wx-hours">{strip.map(h => {
      const icon = skyIcon(h);
      return <li key={h.start}>
        <small>{new Date(h.start).toLocaleString(undefined, { weekday: 'short', hour: 'numeric' })}</small>
        <Icon name={icon} className={`cmp-sky-${icon}`} />
        <strong>{degrees(h.temperatureF)}</strong>
        <small>{h.precipitationChance ? `${h.precipitationChance}% rain` : 'dry'}</small>
        <small>{h.windMph != null ? `${h.windMph} mph` : ''}</small>
      </li>;
    })}</ul></div>
    <p className="hp-footnote">National Weather Service{o.place ? ` · ${o.place}` : ''} · checked {new Date(o.checkedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
      {onAsk && <> · <button type="button" className="community-link" onClick={() => onAsk('What should I do around the house and garden ahead of the coming weather?')}>Ask Athena what to do</button></>}</p>
  </>;
}

function AlertForm({ places, initial, busy, onSave, onCancel }: {
  places: WeatherAlertsRead['places']; initial?: WeatherAlertRule; busy: boolean;
  onSave: (input: WeatherAlertInput) => void; onCancel?: () => void;
}) {
  const [kind, setKind] = useState<WeatherAlertKind>(initial?.kind || 'cold');
  const [threshold, setThreshold] = useState<string>(initial?.threshold != null ? String(initial.threshold) : '');
  const [placeUuid, setPlaceUuid] = useState<string>(initial?.placeUuid || '');
  const [lead, setLead] = useState<number>(initial?.leadHours || 24);
  const [note, setNote] = useState(initial?.note || '');
  const unit = KIND_UNIT[kind];
  return <form className="dashboard-form community-form wx-form" onSubmit={e => {
    e.preventDefault();
    onSave({ kind, threshold: unit ? (threshold.trim() ? Number(threshold) : unit.fallback) : null, placeUuid: placeUuid || null, leadHours: lead, note: note.trim() || null });
  }}>
    <Field label="Tell me about">
      <select value={kind} onChange={e => { setKind(e.target.value as WeatherAlertKind); setThreshold(''); }}>
        {(Object.keys(KIND_LABEL) as WeatherAlertKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
    </Field>
    {unit && <Field label={`${unit.unit === '%' ? 'Chance' : 'Threshold'} (${unit.unit}) — ${unit.hint}`}>
      <input type="number" inputMode="numeric" value={threshold} placeholder={String(unit.fallback)} onChange={e => setThreshold(e.target.value)} />
    </Field>}
    <Field label="Where">
      <select value={placeUuid} onChange={e => setPlaceUuid(e.target.value)}>
        <option value="">Home</option>
        {places.filter(p => p.kind !== 'home').map(p => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
      </select>
    </Field>
    <Field label="How far ahead">
      <select value={lead} onChange={e => setLead(Number(e.target.value))}>
        {LEADS.map(h => <option key={h} value={h}>{h < 24 ? `${h} hours` : h === 24 ? 'A day' : `${h / 24} days`} before</option>)}
      </select>
    </Field>
    <Field label="Note to include (optional)"><input value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="Cover the tomatoes, bring in the ferns" /></Field>
    <div className="community-actions">
      <button className="dashboard-chat-cta" type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save' : 'Add alert'} <span>↗</span></button>
      {onCancel && <button type="button" className="community-link" onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}

function Alerts() {
  const [read, setRead] = useState<WeatherAlertsRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  useEffect(() => {
    let live = true;
    dashboardApi.weatherAlerts().then(r => live && setRead(r)).catch(err => live && setError(errorText(err, 'Weather alerts couldn’t load.')));
    return () => { live = false; };
  }, []);

  async function run(key: string, work: () => Promise<WeatherAlertsRead>, fallback: string) {
    setError(null); setBusy(key);
    try { setRead(await work()); setEditing(null); } catch (err) { setError(errorText(err, fallback)); } finally { setBusy(null); }
  }
  const save = (input: WeatherAlertInput, uuid?: string) => run(uuid || 'new', () => dashboardApi.saveWeatherAlert(input, uuid), 'Could not save that alert.');
  const toggle = (a: WeatherAlertRule) => save({ kind: a.kind, threshold: a.threshold, placeUuid: a.placeUuid, leadHours: a.leadHours, note: a.note, enabled: !a.enabled }, a.uuid);
  const remove = (a: WeatherAlertRule) => { if (window.confirm(`Stop the ${a.describe} alert at ${a.placeName}?`)) void run(a.uuid, () => dashboardApi.removeWeatherAlert(a.uuid), 'Could not remove that alert.'); };

  if (!read) return error ? <Problem text={error} /> : <p className="dashboard-empty">Loading alerts…</p>;
  const hasFrost = read.alerts.some(a => a.kind === 'cold' && a.enabled);
  return <>
    <Problem text={error} />
    {!read.alerts.length && <p className="dashboard-empty">Set an alert and I’ll send it to your phone ahead of time — once per cold night or stormy day, never on repeat. Found overnight, it waits until 7 AM unless the weather is less than six hours away.</p>}
    {read.alerts.length > 0 && <ul className="community-list">{read.alerts.map(a => <li key={a.uuid} className={a.enabled ? undefined : 'cmp-paused'}>
      <span className="community-icon" aria-hidden>{a.kind === 'cold' ? '❄️' : a.kind === 'heat' ? '🔥' : a.kind === 'wind' ? '💨' : a.kind === 'storm' ? '⛈️' : a.kind === 'snow' ? '🌨️' : a.kind === 'ice' ? '🧊' : '🌧️'}</span>
      <div className="community-body">
        {editing === a.uuid
          ? <AlertForm places={read.places} initial={a} busy={busy === a.uuid} onSave={input => void save({ ...input, enabled: a.enabled }, a.uuid)} onCancel={() => setEditing(null)} />
          : <>
            <strong>{a.describe[0].toUpperCase() + a.describe.slice(1)} at {a.placeName}</strong>
            <small>{[`up to ${a.leadHours < 24 ? `${a.leadHours} h` : a.leadHours === 24 ? 'a day' : `${a.leadHours / 24} days`} ahead`, a.note ? `“${a.note}”` : null, a.enabled ? null : 'paused'].filter(Boolean).join(' · ')}</small>
            <small className="wx-next">{a.lastError ? `Couldn’t check: ${a.lastError}`
              : !a.forecastKnown ? 'Forecast unavailable right now.'
                : a.next ? `Next in the forecast: ${a.next.label ? `${a.next.label} ` : ''}${a.next.when}`
                  : 'Nothing like it in the forecast (about six days).'}</small>
            <div className="community-controls">
              <button type="button" className="community-link" disabled={busy === a.uuid} onClick={() => setEditing(a.uuid)}>Edit</button>
              <button type="button" className="community-link" disabled={busy === a.uuid} onClick={() => void toggle(a)}>{a.enabled ? 'Pause' : 'Resume'}</button>
              <button type="button" className="community-link community-danger" disabled={busy === a.uuid} onClick={() => remove(a)}>Remove</button>
            </div>
          </>}
      </div>
    </li>)}</ul>}
    {editing === 'new'
      ? <AlertForm places={read.places} busy={busy === 'new'} onSave={input => void save(input)} onCancel={() => setEditing(null)} />
      : <div className="community-actions">
        {!hasFrost && <button type="button" className="dashboard-chat-cta" disabled={busy === 'new'} onClick={() => void save({ kind: 'cold', threshold: 34, leadHours: 24, note: 'Cover tender plants.' })}>Add a frost alert (34°F) <span>↗</span></button>}
        <button type="button" className="community-link" onClick={() => setEditing('new')}>+ New weather alert</button>
      </div>}
    {read.recent.length > 0 && <div className="day-group"><h3>Recently sent</h3><ul className="dashboard-data-list community-past">
      {read.recent.slice(0, 6).map(f => <li key={`${f.alertUuid}-${f.firedAt}`}><div className="community-body"><strong>{f.text}</strong><small>{new Date(f.firedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}{f.pushed ? ' · sent to your phone' : ' · in the app (phone not reached)'}</small></div></li>)}
    </ul></div>}
  </>;
}

export function WeatherPanel({ onAsk }: { onAsk?: (text: string) => void }) {
  const [read, setRead] = useState<WeatherOutlookRead | null>(null);
  const [failed, setFailed] = useState(false);
  const [placeUuid, setPlaceUuid] = useState<string | null>(null);
  const [places, setPlaces] = useState<{ uuid: string; name: string }[]>([]);

  useEffect(() => {
    let live = true;
    dashboardApi.watchPlaces().then(r => live && setPlaces(r.places.filter(p => p.enabled))).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    setFailed(false);
    const load = () => dashboardApi.weatherOutlook(placeUuid).then(r => { if (live) { setRead(r); setFailed(false); } }).catch(() => live && setFailed(true));
    void load();
    const timer = window.setInterval(load, 30 * 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [placeUuid]);

  return <div className="wx">
    {places.length > 1 && <div className="hp-tabs wx-places" role="tablist" aria-label="Weather at">
      {places.map(p => {
        const active = (placeUuid || read?.place?.uuid) === p.uuid;
        return <button key={p.uuid} type="button" role="tab" aria-selected={active} className={active ? 'active' : ''} onClick={() => setPlaceUuid(p.uuid)}>{p.name}</button>;
      })}
    </div>}
    {!read ? <p className="dashboard-empty">{failed ? 'Weather is unavailable right now.' : 'Reading the forecast…'}</p> : <Outlook read={read} onAsk={onAsk} />}
    <h3 className="wx-sub wx-alerts-head">Weather alerts</h3>
    <Alerts />
  </div>;
}
