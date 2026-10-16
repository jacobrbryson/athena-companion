import { api } from './client';

/**
 * Vehicles (core_api src/controllers/propertyVehicles.js): the cars kept at a
 * property. Every write answers with the whole list, so the app replaces its
 * copy rather than patching it. The photo is fetched per vehicle with `photo`.
 */
export interface Vehicle {
  uuid: string;
  /** The property it lives at. */
  propertyUuid: string | null;
  name: string; year: number | null; make: string | null; model: string | null; color: string | null;
  plate: string | null; vin: string | null;
  odometer: number | null; odometerOn: string | null;
  registrationDue: string | null; inspectionDue: string | null; insuranceDue: string | null;
  serviceDue: string | null; serviceDueMiles: number | null;
  notes: string | null; hasPhoto: boolean; createdAt: string; updatedAt: string;
  /** Work done, newest first. */
  service: ServiceEntry[];
}
export interface ServiceEntry { uuid: string; doneOn: string; odometer: number | null; what: string; shop: string | null }
export type VehicleInput = Partial<Omit<Vehicle, 'uuid' | 'hasPhoto' | 'createdAt' | 'updatedAt' | 'service'>> & {
  /** A JPEG data URL to set, null to remove; leave out to keep. */
  photo?: string | null;
};
export type ServiceInput = { doneOn: string; odometer: number | null; what: string; shop: string | null };

type List = { vehicles: Vehicle[] };
const base = '/api/v1/projects/property/vehicles';
const id = (uuid: string) => encodeURIComponent(uuid);

export const vehiclesApi = {
  all: () => api.get<List>(base),
  create: (input: VehicleInput) => api.post<List>(base, input),
  update: (uuid: string, patch: VehicleInput) => api.patch<List>(`${base}/${id(uuid)}`, patch),
  remove: (uuid: string) => api.del<List>(`${base}/${id(uuid)}`),
  photo: (uuid: string) => api.get<{ image: string | null }>(`${base}/${id(uuid)}/photo`),
  addService: (uuid: string, entry: ServiceInput) => api.post<List>(`${base}/${id(uuid)}/service`, entry),
  removeService: (uuid: string, entry: string) => api.del<List>(`${base}/${id(uuid)}/service/${id(entry)}`),
};

export type DueTone = 'overdue' | 'soon' | 'later';
export interface DueItem { label: string; tone: DueTone; when: string }

const DAY = 86_400_000;
const localDay = () => new Date().toLocaleDateString('en-CA');
const daysUntil = (day: string) => Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${localDay()}T12:00:00`)) / DAY);
/** Within this many days, or miles, a date or a service counts as coming up. */
export const SOON_DAYS = 30;
export const SOON_MILES = 500;

function inWords(days: number, day: string) {
  if (days < 0) return days === -1 ? 'overdue by a day' : `overdue by ${-days} days`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return days <= 60 ? `in ${days} days` : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** What comes due on a vehicle, soonest first. */
export function dueItems(v: Vehicle): DueItem[] {
  const dated: [string, string | null][] = [['Registration', v.registrationDue], ['Inspection', v.inspectionDue], ['Insurance', v.insuranceDue], ['Service', v.serviceDue]];
  const items = dated.filter((d): d is [string, string] => !!d[1]).map(([label, day]) => {
    const n = daysUntil(day);
    return { label, tone: (n < 0 ? 'overdue' : n <= SOON_DAYS ? 'soon' : 'later') as DueTone, when: inWords(n, day), sort: n };
  });
  if (v.serviceDueMiles !== null) {
    const left = v.odometer === null ? null : v.serviceDueMiles - v.odometer;
    items.push({
      label: 'Service', sort: left === null ? 9999 : left < 0 ? -1 : left <= SOON_MILES ? 0 : 9998,
      tone: left === null ? 'later' : left < 0 ? 'overdue' : left <= SOON_MILES ? 'soon' : 'later',
      when: left === null ? `at ${v.serviceDueMiles.toLocaleString()} mi` : left < 0 ? `${(-left).toLocaleString()} mi overdue` : `in ${left.toLocaleString()} mi`,
    });
  }
  return items.sort((a, b) => a.sort - b.sort).map(({ label, tone, when }) => ({ label, tone, when }));
}

/** "2021 BMW X5", or nothing when only the name is known. */
export const carOf = (v: Pick<Vehicle, 'year' | 'make' | 'model'>) => [v.year, v.make, v.model].filter(Boolean).join(' ');
