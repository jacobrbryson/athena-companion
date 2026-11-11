import { Label } from './Drawer';
import { useTextReading } from '../athena/useAndroidPush';

/**
 * "Read my texts" on the Android app (core_api docs/capabilities/text-reading.md).
 *
 * Athena reads incoming Google Messages texts; when one mentions an event
 * that isn't on the calendar (or is missing its address or details) she asks
 * — Add/Update or No thanks, right on the notification — and when one is long
 * she sends a summary and a suggested reply that opens in Messages for you to
 * edit and send. She never sends a text.
 *
 * Shown inside Initiative because it IS Athena speaking first: with
 * Initiative off nothing is read. Turned on and off in Android's own
 * Notification access screen, where it is its own line.
 */
export function TextReadingSetup({ initiativeOn }: { initiativeOn: boolean }) {
  const texts = useTextReading();
  if (!texts.available || texts.state === 'checking') return null;

  return (
    <section className="mb-8">
      <Label>read my texts</Label>
      <p className="mb-2 text-sm opacity-70">
        I can read the texts that arrive in <strong>Google Messages</strong>. If one mentions a plan that isn't on your
        calendar, or your calendar is missing its address or details, I'll ask whether to add or update it — tap{' '}
        <strong>Add</strong> or <strong>No thanks</strong> right on the notification. If a text is long, I'll send a short
        summary and a suggested reply: <strong>Reply in Messages</strong> opens the conversation with it typed in, for you
        to edit and send yourself, and <strong>Copy</strong> copies it. I never send a text.
      </p>
      <p className="mb-2 text-[11px] opacity-50">
        I don't keep your texts — only what I suggested, for a week. One-time codes never leave your phone, and neither
        do phone numbers.
      </p>
      <p className="font-mono text-[10px] opacity-45">
        {texts.state === 'on'
          ? initiativeOn
            ? 'on · reading Google Messages on this phone'
            : 'allowed on this phone · but Initiative is off, so I read nothing'
          : texts.state === 'stalled'
            ? "allowed, but Android isn't running my reader"
            : 'off'}
      </p>
      {!texts.installed && (
        <p className="mt-1 text-[11px] opacity-60">I can't see Google Messages on this phone — this only works with it.</p>
      )}
      {!texts.notifications && texts.state === 'on' && (
        <p className="mt-1 text-[11px] opacity-60">Athena's own notifications are off on this phone, so you won't see my questions.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void texts.open()}
          className={
            texts.state === 'on'
              ? 'rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300'
              : 'rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black'
          }
        >
          {texts.state === 'on' ? 'Turn off in notification access' : 'Let me read my texts'}
        </button>
        {texts.state !== 'on' && (
          <button
            type="button"
            onClick={() => void texts.openAppInfo()}
            className="rounded border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300"
          >
            Open Athena's app info
          </button>
        )}
      </div>
      {texts.state !== 'on' && (
        <p className="mt-1.5 text-[11px] opacity-50">
          Android opens its own settings screen — switch on <strong>Athena — read my texts</strong> (the PulsePoint line is
          separate). If it's greyed out as a <strong>Restricted setting</strong>, open Athena's app info, tap{' '}
          <strong>⋮</strong> → <strong>Allow restricted settings</strong>, and try again.
        </p>
      )}
    </section>
  );
}
