import { LegalLinks } from '../components/LegalLinks';
import { SMS_OPERATOR, SMS_SENDER } from '../legal';

type LegalPageProps = { kind: 'privacy' | 'terms' };

export function LegalPage({ kind }: LegalPageProps) {
  const privacy = kind === 'privacy';

  return (
    <main className="min-h-[100dvh] bg-black px-6 py-12 text-emerald-100">
      <article className="mx-auto max-w-3xl font-mono text-sm leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.5em] opacity-50">athena companion</p>
        <h1 className="mt-4 text-3xl tracking-tight">{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="mt-2 text-xs opacity-50">Effective September 20, 2026</p>

        {privacy ? <PrivacyContent /> : <TermsContent />}

        <footer className="mt-12 border-t border-emerald-500/20 pt-5">
          <LegalLinks />
        </footer>
      </article>
    </main>
  );
}

function PrivacyContent() {
  return (
    <div className="mt-10 space-y-8">
      <section>
        <h2 className="text-lg text-emerald-300">What this covers</h2>
        <p className="mt-2 opacity-80">
          This policy describes how Athena Companion, a personal AI companion service operated by {SMS_OPERATOR}, a
          sole proprietor, handles information when you use it.
        </p>
      </section>
      <section>
        <h2 className="text-lg text-emerald-300">Information we handle</h2>
        <p className="mt-2 opacity-80">
          Depending on the features you choose, Athena may handle your account identity, conversations, memories,
          connected-app data, device information, notification preferences, and a phone number that you explicitly
          verify for SMS. Information is used to provide, secure, and improve the service you request.
        </p>
      </section>
      <section>
        <h2 className="text-lg text-emerald-300">SMS information</h2>
        <p className="mt-2 opacity-80">
          Athena sends SMS only after you separately consent and verify the phone number. Message frequency varies;
          message and data rates may apply. You can turn texting off in the Initiative panel or reply STOP to opt out.
          Reply HELP for help.
        </p>
        <p className="mt-2 opacity-80">
          We do not sell or share mobile numbers, SMS opt-in data, or messaging consent with third parties or
          affiliates for their own marketing or promotional purposes.
        </p>
      </section>
      <section>
        <h2 className="text-lg text-emerald-300">Your choices</h2>
        <p className="mt-2 opacity-80">
          You can disconnect connected apps, turn notifications or SMS off, ask Athena to forget memories, and request
          deletion of account data through the service. Questions about privacy should be directed to the product owner.
        </p>
      </section>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="mt-10 space-y-8">
      <section>
        <h2 className="text-lg text-emerald-300">Using Athena</h2>
        <p className="mt-2 opacity-80">
          Athena is a personal software service operated by {SMS_OPERATOR}, a sole proprietor. Use it lawfully and do not attempt to access another person’s account,
          bypass access controls, or interfere with the service.
        </p>
      </section>
      <section>
        <h2 className="text-lg text-emerald-300">SMS messages</h2>
        <p className="mt-2 opacity-80">
          SMS is optional and is not required to use Athena. By selecting the SMS consent checkbox in the Initiative
          panel and verifying your mobile number, you agree to receive recurring automated messages from {SMS_SENDER}{' '}
          such as reminders, calendar notifications, task updates, notification tests, and replies to messages you
          initiate. Messages are not marketing.
        </p>
        <p className="mt-2 opacity-80">
          Message frequency varies. Message and data rates may apply. Reply STOP at any time to cancel; you will
          receive one confirmation message and no further SMS unless you opt in again. Reply HELP for help. Carriers
          are not liable for delayed or undelivered messages. See the Privacy Policy for how your mobile number is
          handled; mobile numbers and SMS consent are never sold or shared with third parties for marketing.
        </p>
      </section>
      <section>
        <h2 className="text-lg text-emerald-300">Changes and termination</h2>
        <p className="mt-2 opacity-80">
          Features and these terms may change as the service develops. You can stop using Athena or turn off individual
          notification channels at any time. The product owner may suspend access when necessary to protect the service
          or its users.
        </p>
      </section>
    </div>
  );
}
