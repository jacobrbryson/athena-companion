import { LegalLinks } from '../components/LegalLinks';
import { SMS_OPERATOR, SMS_SENDER } from '../legal';

/** Public copy of the authenticated SMS opt-in step for carrier reviewers. */
export function SmsConsentPage() {
  return (
    <main className="min-h-[100dvh] bg-black px-6 py-12 text-emerald-100">
      <article className="mx-auto max-w-2xl font-mono text-sm leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.5em] opacity-50">athena companion</p>
        <h1 className="mt-4 text-3xl tracking-tight">SMS consent</h1>
        <p className="mt-4 opacity-80">
          Athena is a personal AI companion app operated by {SMS_OPERATOR}, a sole proprietor. Athena users opt
          in to SMS from {SMS_OPERATOR} after signing in by opening the <strong>⋯ menu → Initiative</strong>, entering their
          mobile number, and selecting the separate checkbox below. The checkbox is optional and is not required to
          create or use an Athena account.
        </p>

        <section className="mt-8 rounded border border-emerald-500/20 bg-white/[0.03] p-5">
          <label className="flex items-start gap-3 text-sm leading-relaxed opacity-90">
            <input type="checkbox" aria-label="SMS consent example" className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />
            <span>
              I agree to receive recurring automated SMS from <strong>{SMS_SENDER}</strong>{' '}
              about reminders, calendar notifications, task updates, and replies to messages I initiate. Consent is
              not required to use Athena. Message frequency varies; message and data rates may apply. Reply STOP to
              opt out or HELP for help.
            </span>
          </label>
          <p className="mt-4 text-xs opacity-60">
            After selecting this checkbox in the signed-in app, the user enters a mobile number and requests a
            verification code. Athena only sends ongoing SMS after the number is verified.
          </p>
        </section>

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
