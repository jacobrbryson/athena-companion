import { api } from './client';

/**
 * Google Nest thermostats (core_api src/controllers/propertyThermostats.js),
 * read-only. `status` says whether there is anything to show: without an
 * active Nest link the server sends no devices at all, even ones it recorded.
 */
export interface Thermostat {
  name: string;
  displayName: string | null;
  room: string | null;
  type: string;
  connectivity: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  offlineSince: string | null;
  /**
   * Google lists it online, but it is sending no readings (a placeholder 0 °C
   * and 0 %, which the server never passes on). Counted as offline since
   * `offlineSince`; said as "not reporting".
   */
  notReporting?: boolean;
  onlineSince: string | null;
  /** The thermostat the bedroom-vs-sleep comparison reads (Use for sleep). */
  sleepDevice?: boolean;
  readings: {
    temperatureC?: number; humidityPercent?: number;
    mode?: string; eco?: string; hvac?: string;
    heatC?: number; coolC?: number;
    scale?: 'CELSIUS' | 'FAHRENHEIT';
  };
}
export type ThermostatStatus = 'not_connected' | 'needs_reauth' | 'ready';
export interface ThermostatList { status: ThermostatStatus; devices: Thermostat[]; /** Google could not be reached; this is the last recorded state. */ stale?: boolean }

export const thermostatsApi = {
  all: () => api.get<ThermostatList>('/api/v1/projects/property/thermostats'),
  setSleepDevice: (device: string | null) => api.put<{ devices: Thermostat[] }>('/api/v1/projects/property/thermostats/sleep-device', { device }),
};

/** "Downstairs thermostat", or the name it was given in Google Home. */
export const thermostatTitle = (t: Pick<Thermostat, 'displayName' | 'room' | 'type'>) =>
  t.displayName || (t.room ? `${t.room} ${t.type}` : `Nest ${t.type}`);

/** In the scale the thermostat itself is set to show. */
export function degrees(celsius: number | undefined, scale: Thermostat['readings']['scale']) {
  if (celsius === undefined || !Number.isFinite(celsius)) return null;
  return scale === 'CELSIUS' ? `${Math.round(celsius * 10) / 10}°C` : `${Math.round((celsius * 9) / 5 + 32)}°F`;
}

/** "heat to 68°F", "eco", "off" — what it is trying to do. */
export function setting(r: Thermostat['readings']) {
  if (r.eco && r.eco !== 'OFF') return 'Eco';
  if (!r.mode) return null;
  if (r.mode === 'OFF') return 'Off';
  const heat = degrees(r.heatC, r.scale), cool = degrees(r.coolC, r.scale);
  if (r.mode === 'HEAT') return heat ? `Heat to ${heat}` : 'Heat';
  if (r.mode === 'COOL') return cool ? `Cool to ${cool}` : 'Cool';
  if (r.mode === 'HEATCOOL') return heat && cool ? `Keep ${heat}–${cool}` : 'Heat · Cool';
  return r.mode.charAt(0) + r.mode.slice(1).toLowerCase();
}
