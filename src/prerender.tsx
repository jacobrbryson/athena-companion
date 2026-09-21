import { renderToStaticMarkup } from 'react-dom/server';
import { LegalPage } from './pages/LegalPage';
import { SmsConsentPage } from './pages/SmsConsentPage';

/**
 * Public pages rendered to static HTML at build time. Carrier and Twilio
 * reviewers fetch these without running JavaScript, so the SPA shell alone
 * reads to them as an empty page.
 */
export const PAGES = {
  privacy: { title: 'Privacy Policy · Athena', render: () => renderToStaticMarkup(<LegalPage kind="privacy" />) },
  terms: { title: 'Terms of Service · Athena', render: () => renderToStaticMarkup(<LegalPage kind="terms" />) },
  'sms-consent': { title: 'SMS Consent · Athena', render: () => renderToStaticMarkup(<SmsConsentPage />) },
};
