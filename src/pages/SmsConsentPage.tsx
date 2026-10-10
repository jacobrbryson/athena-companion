import { useState, type FormEvent } from 'react';
import { LegalLinks } from '../components/LegalLinks';
import { SMS_OPERATOR, SMS_SENDER } from '../legal';

/**
 * Public copy of the authenticated SMS opt-in form for carrier reviewers. It
 * mirrors the signed-in form in InitiativePanel field for field (phone number,
 * unchecked consent box, request-code button) but never sends anything: the
 * real verification only runs for a signed-in user.
 */
export function SmsConsentPage() {
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (phone.trim() && consent) setSubmitted(true);
  }

  return (
    <main className="min-h-[100dvh] bg-black px-6 py-12 text-emerald-100">
      <article className="mx-auto max-w-2xl font-mono text-sm leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.5em] opacity-50">athena companion</p>
        <h1 className="mt-4 text-3xl tracking-tight">SMS consent</h1>
        <p className="mt-4 opacity-80">
          Athena is a personal AI companion app operated by {SMS_OPERATOR}, a sole proprietor. Athena users opt
          in to SMS from {SMS_OPERATOR} after signing in by opening the <strong>⋯ menu → Initiative</strong>, entering their
          mobile phone number, and selecting the separate consent checkbox shown below. The checkbox is unchecked by
          default, optional, and not required to create or use an Athena account.
        </p>

        <form
          onSubmit={submit}
          aria-label="SMS opt-in form"
          className="mt-8 space-y-3 rounded border border-emerald-500/20 bg-white/[0.03] p-5"
        >
          <label className="block text-xs opacity-70" htmlFor="sms-consent-phone">
            Mobile phone number
          </label>
          <input
            id="sms-consent-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSubmitted(false);
            }}
            placeholder="(555) 555-0123"
            className="h-9 w-full rounded border border-emerald-500/20 bg-white/5 px-2 text-sm outline-none"
          />
          <label className="flex items-start gap-3 text-sm leading-relaxed opacity-90">
            <input
              type="checkbox"
              name="sms_consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setSubmitted(false);
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
            />
            <span>
              I agree to receive recurring automated SMS from <strong>{SMS_SENDER}</strong>{' '}
              about reminders, calendar notifications, task updates, and replies to messages I initiate. Consent is
              not required to use Athena. Message frequency varies; message and data rates may apply. Reply STOP to
              opt out or HELP for help.
              <span className="mt-1 block text-xs">
                <LegalLinks />
              </span>
            </span>
          </label>
          <button
            type="submit"
            disabled={!phone.trim() || !consent}
            className="rounded border border-emerald-500/30 px-3 py-1.5 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
          >
            Text me a verification code
          </button>
          {submitted && (
            <p role="status" className="text-xs opacity-70">
              This public page is a copy of the in-app form and does not send messages. Sign in to Athena and open
              ⋯ → Initiative to verify your number.
            </p>
          )}
          <p className="text-xs opacity-60">
            In the signed-in app, the user enters a mobile number, selects this checkbox, and requests a one-time
            verification code. Athena only sends ongoing SMS after the number is verified.
          </p>
        </form>

        <p className="mt-8 opacity-80">
          Athena sends non-marketing reminders, calendar notifications, task updates, notification tests, and replies
          to messages initiated by the user. Users can turn SMS off in Athena or reply STOP at any time.
        </p>

        <footer className="mt-12 border-t border-emerald-500/20 pt-5">
          <LegalLinks />
        </footer>
      </article>
    </main>
  );
}
