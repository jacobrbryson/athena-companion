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
  /** Two-letter state, the number on the registration card, and where it's inspected. */
  registrationState: string | null; registrationNumber: string | null; inspectionStation: string | null;
  odometer: number | null; odometerOn: string | null;
  registrationDue: string | null; inspectionDue: string | null; insuranceDue: string | null;
  serviceDue: string | null; serviceDueMiles: number | null;
  notes: string | null; hasPhoto: boolean; createdAt: string; updatedAt: string;
  /** Work done, newest first. */
  service: ServiceEntry[];
  /** NHTSA safety recalls for its model year, open first (absent before the recalls migration). */
  recalls?: Recall[];
}
/** 'acknowledged' is seen but not yet repaired; 'done' is repaired. */
export type RecallStatus = 'open' | 'acknowledged' | 'done' | 'not_applicable';
export interface Recall {
  campaign: string; component: string | null; summary: string | null; consequence: string | null; remedy: string | null;
  reportedOn: string | null;
  /** NHTSA: don't drive it until it's fixed. */
  parkIt: boolean;
  /** NHTSA: park it outside, away from buildings. */
  parkOutside: boolean;
  status: RecallStatus; firstSeenAt: string | null;
}
/** A car read through Smartcar (core_api connectors/smartcar.js). Read-only. */
export interface SmartcarCar {
  id: string; vehicleUuid: string | null; vehicleName: string | null;
  make: string | null; model: string | null; year: number | null; vin: string | null;
  odometerMi: number | null;
  fuel: { percent: number | null; rangeMi: number | null } | null;
  battery: { percent: number | null; rangeMi: number | null } | null;
  locked: boolean | null;
  locationEnabled: boolean;
  location: { latitude: number; longitude: number; at: string | null } | null;
  syncedAt: string | null;
}
export interface SmartcarList { status: 'not_connected' | 'needs_reauth' | 'ready'; stale?: boolean; cars: SmartcarCar[] }
export interface ServiceEntry { uuid: string; doneOn: string; odometer: number | null; what: string; shop: string | null }
export type VehicleInput = Partial<Omit<Vehicle, 'uuid' | 'hasPhoto' | 'createdAt' | 'updatedAt' | 'service' | 'recalls'>> & {
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
  setRecall: (uuid: string, campaign: string, status: RecallStatus) => api.patch<List>(`${base}/${id(uuid)}/recalls/${id(campaign)}`, { status }),
  smartcar: () => api.get<SmartcarList>(`${base}/smartcar`),
  setSmartcar: (carId: string, patch: { vehicleUuid?: string | null; locationEnabled?: boolean }) => api.patch<SmartcarList>(`${base}/smartcar/${id(carId)}`, patch),
};

export type DueTone = 'overdue' | 'soon' | 'later';
export interface DueItem { label: string; tone: DueTone; when: string; /** The date field it came from; absent for service by miles. */ kind?: keyof Vehicle }

const DAY = 86_400_000;
const localDay = () => new Date().toLocaleDateString('en-CA');
export const daysUntil = (day: string) => Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${localDay()}T12:00:00`)) / DAY);
/** Within this many days, or miles, a date or a service counts as coming up. */
export const SOON_DAYS = 30;
export const SOON_MILES = 500;

export function inWords(days: number, day: string) {
  if (days < 0) return days === -1 ? 'overdue by a day' : `overdue by ${-days} days`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return days <= 60 ? `in ${days} days` : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** What comes due on a vehicle, soonest first. */
export function dueItems(v: Vehicle): DueItem[] {
  const dated: [string, keyof Vehicle][] = [['Registration', 'registrationDue'], ['Inspection', 'inspectionDue'], ['Insurance', 'insuranceDue'], ['Service', 'serviceDue']];
  const items: (DueItem & { sort: number })[] = dated.filter(([, kind]) => !!v[kind]).map(([label, kind]) => {
    const day = v[kind] as string;
    const n = daysUntil(day);
    return { label, kind, tone: (n < 0 ? 'overdue' : n <= SOON_DAYS ? 'soon' : 'later') as DueTone, when: inWords(n, day), sort: n };
  });
  if (v.serviceDueMiles !== null) {
    const left = v.odometer === null ? null : v.serviceDueMiles - v.odometer;
    items.push({
      label: 'Service', sort: left === null ? 9999 : left < 0 ? -1 : left <= SOON_MILES ? 0 : 9998,
      tone: left === null ? 'later' : left < 0 ? 'overdue' : left <= SOON_MILES ? 'soon' : 'later',
      when: left === null ? `at ${v.serviceDueMiles.toLocaleString()} mi` : left < 0 ? `${(-left).toLocaleString()} mi overdue` : `in ${left.toLocaleString()} mi`,
    });
  }
  return items.sort((a, b) => a.sort - b.sort).map(({ sort: _sort, ...item }) => item);
}

/** Within this many days a registration, inspection or insurance date takes over the top of Home. */
export const DEADLINE_DAYS = 14;
/** Within this many days (or overdue) it goes red. */
export const URGENT_DAYS = 7;
export type DeadlineKind = 'registrationDue' | 'inspectionDue' | 'insuranceDue';
export interface Deadline { vehicle: Vehicle; kind: DeadlineKind; label: string; day: string; days: number; when: string }
const DEADLINES: [DeadlineKind, string][] = [['registrationDue', 'Registration'], ['inspectionDue', 'Inspection'], ['insuranceDue', 'Insurance']];

/**
 * The legal deadlines — registration, inspection, insurance — overdue or due
 * within DEADLINE_DAYS, across every vehicle, soonest first. Service is left
 * out: a late oil change is a nudge, an expired registration is a ticket.
 */
export function deadlines(vehicles: Vehicle[]): Deadline[] {
  return vehicles.flatMap(vehicle => DEADLINES.flatMap(([kind, label]) => {
    const day = vehicle[kind];
    if (!day) return [];
    const days = daysUntil(day);
    return days <= DEADLINE_DAYS ? [{ vehicle, kind, label, day, days, when: inWords(days, day) }] : [];
  })).sort((a, b) => a.days - b.days);
}

/** The same date a year on — the usual next due date once something is renewed. */
export const yearAfter = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  // Feb 29 lands on Mar 1 rather than an invalid date.
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
};

/** "2021 BMW X5", or nothing when only the name is known. */
export const carOf = (v: Pick<Vehicle, 'year' | 'make' | 'model'>) => [v.year, v.make, v.model].filter(Boolean).join(' ');
