import { api } from './client';
import { DEADLINE_DAYS, daysUntil, inWords } from './propertyVehicles';
import type { AthenaAction } from './companion';

/**
 * Property taxes and "Scan a bill" (core_api controllers/propertyTaxes.js,
 * propertyBills.js). A tax record is created only by an approved bill scan;
 * from here the person marks a payment paid or unpaid, or removes the record.
 * Every write answers with the whole list.
 */
export interface TaxInstallment { uuid: string; label: string; dueOn: string; amount: number | null; paidOn: string | null }
export interface Tax {
  uuid: string;
  /** 'vehicle' is the tax a state bills with the registration. */
  kind: 'property' | 'vehicle';
  propertyUuid: string | null; vehicleUuid: string | null; vehicleName: string | null;
  jurisdiction: string; parcel: string | null; account: string | null; taxYear: number | null;
  amount: number | null; address: string | null; notes: string | null;
  createdAt: string; updatedAt: string;
  installments: TaxInstallment[];
}

/** The bill as read, and as the person corrects it. Strings only where the person types. */
export interface BillDocument {
  kind: 'vehicle_registration' | 'property_tax' | 'vehicle_notice';
  paid: boolean;
  payee?: string; jurisdiction?: string; plate?: string; vin?: string; vinLast?: string; state?: string; vehicleDescription?: string;
  parcel?: string; account?: string; taxYear?: number | string; address?: string;
  noticeTitle?: string; noticeSummary?: string; coverage?: string;
  dueDate?: string; amountDue?: number | string; taxAmount?: number | string; registrationFee?: number | string; paidOn?: string;
  installments: { label: string; dueOn: string; amount: number | string | null }[];
  /** What the reader was unsure of, or that failed a check; present on a fresh read. */
  uncertain?: { field: string; label: string; value: string; reason: string }[];
}
export interface BillChoice { uuid: string; label: string; why?: string }
export type BillResult =
  | { status: 'proposed'; document: BillDocument; proposal: AthenaAction; target?: { type: 'vehicle' | 'property'; uuid: string; label: string }; repeated?: boolean }
  | { status: 'needs_input'; document: BillDocument; note?: string; missing?: { field: string; label: string }[];
      candidates?: { type: 'vehicle' | 'property'; items: BillChoice[] };
      installmentChoices?: { uuid: string; label: string; dueOn: string; amount: number | null }[] }
  | { status: 'already_recorded'; document: BillDocument; note: string }
  | { status: 'unavailable'; document: BillDocument; note: string };

export interface BillReview { document: BillDocument; vehicleUuid?: string; propertyUuid?: string; installmentUuid?: string; today?: string }

const base = '/api/v1/projects/property';
const id = (uuid: string) => encodeURIComponent(uuid);
const localDay = () => new Date().toLocaleDateString('en-CA');

export const taxesApi = {
  all: () => api.get<{ taxes: Tax[] }>(`${base}/taxes`),
  setPaid: (uuid: string, installmentUuid: string, paidOn: string | null) => api.patch<{ taxes: Tax[] }>(`${base}/taxes/${id(uuid)}/installments/${id(installmentUuid)}`, { paidOn }),
  remove: (uuid: string) => api.del<{ taxes: Tax[] }>(`${base}/taxes/${id(uuid)}`),
};
export const billsApi = {
  scan: (image: { imageBase64: string; mimeType: string }) => api.post<BillResult>(`${base}/bills/scan`, { ...image, today: localDay() }),
  review: (body: BillReview) => api.post<BillResult>(`${base}/bills/review`, { ...body, today: localDay() }),
};

/** An unpaid installment that is overdue or close, for the Home banner. */
export interface TaxDeadline { tax: Tax; installment: TaxInstallment; label: string; day: string; days: number; when: string }

/**
 * Unpaid installments overdue or due within DEADLINE_DAYS, soonest first. A
 * vehicle tax due the same day as that vehicle's registration is left to the
 * registration line (it is billed together), so the banner doesn't say it twice.
 */
export function taxDeadlines(taxes: Tax[], registrationDays: Map<string, string> = new Map()): TaxDeadline[] {
  return taxes.flatMap(tax => tax.installments.flatMap(installment => {
    // Escrowed: the lender pays it, so it never goes on the banner.
    if (installment.paidOn || tax.notes?.startsWith('Escrowed')) return [];
    if (tax.kind === 'vehicle' && tax.vehicleUuid && registrationDays.get(tax.vehicleUuid) === installment.dueOn) return [];
    const days = daysUntil(installment.dueOn);
    if (days > DEADLINE_DAYS) return [];
    const what = tax.kind === 'vehicle' ? `${tax.vehicleName ? `${tax.vehicleName} ` : ''}vehicle tax` : `${tax.jurisdiction} property tax`;
    const part = tax.installments.length > 1 ? ` (${installment.label})` : '';
    return [{ tax, installment, label: `${what}${part}`, day: installment.dueOn, days, when: inWords(days, installment.dueOn) }];
  })).sort((a, b) => a.days - b.days);
}

export const dollars = (n: number | null) => (n === null ? '' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }));
