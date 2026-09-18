import { useEffect, useState } from 'react';
import type { AthenaAction } from '../api/companion';

/**
 * The approval card: the one place Athena asks to DO something.
 *
 * Three deliberate choices here, all the same choice really — the person
 * must be able to tell what they are agreeing to:
 *
 *   The headline is `summary`, which the SERVER built from the validated
 *   parameters. Athena's own sentence is shown underneath as her reason, in
 *   quieter type. If the two ever disagree, the one the person reads as the
 *   commitment is the one the executor will actually run.
 *
 *   Approve is never the default focus and never fires on Enter. A card that
 *   can be dismissed by a stray keypress is not consent.
 *
 *   The countdown is shown, because a proposal that quietly stopped working
 *   is worse than one that visibly expires.
 */

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function ActionProposal({
  action,
  busy,
  onConfirm,
  onDecline,
  onDismiss,
}: {
  action: AthenaAction;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(() => secondsLeft(action.expires_at));

  useEffect(() => {
    if (action.status !== 'pending') return;
    setRemaining(secondsLeft(action.expires_at));
    const tick = window.setInterval(() => setRemaining(secondsLeft(action.expires_at)), 1000);
    return () => window.clearInterval(tick);
  }, [action.expires_at, action.status]);

  // ----------------------------------------------------------- terminal ---

  if (action.status === 'done') {
    return (
      <Shell tone="done">
        <p className="text-sm">
          <span aria-hidden="true">✓ </span>
          {action.summary}
        </p>
        <Footer>
          <span className="opacity-50">
            done{action.approval === 'standing' ? ' · standing approval' : ''}
          </span>
          <button onClick={onDismiss} className={GHOST}>
            dismiss
          </button>
        </Footer>
      </Shell>
    );
  }

  if (action.status === 'failed') {
    return (
      <Shell tone="failed">
        <p className="text-sm opacity-80">{action.summary}</p>
        {/* The provider's own reason. The person can usually act on it
            (re-link the calendar), which is why it is not swallowed. */}
        <p className="mt-1 text-xs" style={{ color: 'var(--gd-error)' }}>
          {action.error || "That didn't go through."}
        </p>
        <Footer>
          <span className="opacity-50">nothing was changed</span>
          <button onClick={onDismiss} className={GHOST}>
            dismiss
          </button>
        </Footer>
      </Shell>
    );
  }

  if (action.status === 'declined' || action.status === 'expired') {
    return (
      <Shell tone="idle">
        <p className="text-sm opacity-60">
          {action.status === 'declined' ? 'Declined' : 'Expired'} — {action.summary}
        </p>
        <Footer>
          <span />
          <button onClick={onDismiss} className={GHOST}>
            dismiss
          </button>
        </Footer>
      </Shell>
    );
  }

  // ------------------------------------------------------------ pending ---

  const expired = remaining <= 0;

  return (
    <Shell tone="pending">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-50">
        athena wants to
      </p>
      {/* Server-authored, built from the parameters the executor will use. */}
      <p className="mt-1.5 text-sm leading-snug">{action.summary}</p>
      {action.rationale && (
        <p className="mt-1.5 text-xs italic opacity-55">“{action.rationale}”</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onConfirm}
          disabled={busy || expired}
          className="h-10 flex-1 rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95 disabled:opacity-40 disabled:active:scale-100"
        >
          {busy ? 'Working…' : expired ? 'Expired' : 'Approve'}
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="h-10 rounded-full border border-emerald-500/20 px-5 text-sm hover:bg-white/5 disabled:opacity-40"
        >
          No
        </button>
      </div>

      <Footer>
        <span className="opacity-45">
          {expired ? 'no longer valid' : `expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
        </span>
        {/* Said plainly, because "reversible" is the whole difference between
            a shrug and a decision. */}
        <span className="opacity-45">
          {action.reversible ? 'you can undo this' : 'cannot be undone'}
        </span>
      </Footer>
    </Shell>
  );
}

const GHOST =
  'rounded border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] uppercase hover:bg-white/5';

const TONES: Record<string, string> = {
  pending: 'border-emerald-400/40 bg-emerald-500/[0.07]',
  done: 'border-emerald-400/25 bg-emerald-500/[0.04]',
  failed: 'border-red-400/40 bg-red-500/[0.05]',
  idle: 'border-emerald-500/10 bg-white/[0.02]',
};

function Shell({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <div
      // A proposal is a request for input, not a status message, so it is
      // announced rather than read only if the person happens to land on it.
      role="group"
      aria-live="polite"
      className={`rounded-lg border p-3 ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
      {children}
    </div>
  );
}
