import { useCallback, useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import {
  consentApi,
  integrationsApi,
  type IntegrationProvider,
} from '../api/companion';
import type { ApiError } from '../api/client';

/**
 * Connect Athena to Google Calendar, Strava and Whoop.
 *
 * The flow leaves this app: `connect` returns an authorize URL and we navigate
 * to it, the provider sends the browser back to the origin with
 * `?integration=<id>&status=connected|error`, and the console reopens this
 * panel with that outcome (see `callback` below).
 *
 * Health providers are gated behind the family's `health_data` consent. The
 * server enforces it — a 412 `consent_required` — and this panel turns that
 * into an explicit opt-in rather than an error the person can't act on.
 */

export interface IntegrationCallback {
  provider: string;
  status: string;
  reason?: string | null;
}

const ICONS: Record<string, string> = {
  gmail: '✉️', jira: '🔷', slack: '💬',
  google_calendar: '📅',
  strava: '🏃',
  whoop: '💤',
};

/** What each provider will be able to read, in plain language. */
const BLURBS: Record<string, string> = {
  gmail: 'Reads unread inbox message headers for your Work card. Choose your work Google account when connecting. Never sends or modifies mail.',
  jira: 'Reads your assigned open issues across authorized Jira Cloud sites. Never changes issues.',
  slack: 'Reads recent mentions visible to your Slack account. Never posts or changes messages.',
  google_calendar: 'Reads your upcoming events and free/busy time. Read-only — Athena never adds or changes anything.',
  strava: 'Reads your recent activities: distance, time, elevation and heart rate.',
  whoop: 'Reads your recovery, sleep and strain scores.',
};

const CONSENT_COPY: Record<string, string> = {
  health_data:
    'This connection shares health data — sleep, recovery and workouts — with Athena so she can talk about it with you. You can disconnect at any time, and disconnecting deletes the stored credentials.',
};

export function IntegrationsPanel({
  onClose,
  callback,
}: {
  onClose: () => void;
  callback?: IntegrationCallback | null;
}) {
  const [providers, setProviders] = useState<IntegrationProvider[] | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Provider awaiting an explicit consent tick before it can be linked. */
  const [consentFor, setConsentFor] = useState<IntegrationProvider | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [list, consent] = await Promise.all([
        integrationsApi.list(),
        // Consent is parent-only; a failure here must not hide the providers.
        consentApi.status().catch(() => null),
      ]);
      setProviders(list);
      setGranted(
        new Set(
          Object.entries(consent?.consents || {})
            .filter(([, v]) => v?.accepted)
            .map(([k]) => k)
        )
      );
    } catch (e) {
      setError((e as Error).message || 'Could not load integrations.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function beginConnect(provider: IntegrationProvider) {
    setBusy(provider.provider);
    setError(null);
    try {
      const { authorize_url } = await integrationsApi.connect(
        provider.provider,
        window.location.origin
      );
      // Leaves the app. Nothing after this runs.
      window.location.assign(authorize_url);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'consent_required') {
        setConsentFor(provider);
      } else {
        setError(err.message || `Could not start ${provider.label} authorization.`);
      }
      setBusy(null);
    }
  }

  async function acceptConsentAndConnect(provider: IntegrationProvider) {
    setBusy(provider.provider);
    setError(null);
    try {
      await consentApi.accept(provider.requires_consent as string);
      setConsentFor(null);
      await beginConnect(provider);
    } catch (e) {
      setError((e as Error).message || 'Could not record consent.');
      setBusy(null);
    }
  }

  async function disconnect(provider: IntegrationProvider) {
    setBusy(provider.provider);
    try {
      await integrationsApi.disconnect(provider.provider);
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Could not disconnect.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer eyebrow="connections" title="Connected apps" onClose={onClose}>
      {callback && <CallbackBanner callback={callback} providers={providers} />}

      {error && (
        <p className="mb-3 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error}
        </p>
      )}

      {consentFor ? (
        <ConsentGate
          provider={consentFor}
          busy={busy === consentFor.provider}
          onCancel={() => setConsentFor(null)}
          onAccept={() => void acceptConsentAndConnect(consentFor)}
        />
      ) : (
        <>
          {!providers && <p className="text-sm opacity-60">Loading…</p>}
          <ul className="space-y-3">
            {providers?.map((p) => (
              <ProviderRow
                key={p.provider}
                provider={p}
                busy={busy === p.provider}
                consentGranted={!p.requires_consent || granted.has(p.requires_consent)}
                onConnect={() => void beginConnect(p)}
                onDisconnect={() => void disconnect(p)}
              />
            ))}
          </ul>
          <p className="mt-6 font-mono text-[10px] leading-relaxed opacity-40">
            Athena only reads from these. Credentials are encrypted at rest and
            never appear in a conversation. Disconnecting deletes them.
          </p>
        </>
      )}
    </Drawer>
  );
}

function ProviderRow({
  provider,
  busy,
  consentGranted,
  onConnect,
  onDisconnect,
}: {
  provider: IntegrationProvider;
  busy: boolean;
  consentGranted: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const link = provider.link;
  // A link whose refresh token was rejected stays visible on purpose: the
  // person needs to know to reconnect, not to silently see nothing.
  const needsReauth = link?.status === 'needs_reauth';

  return (
    <li className="rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm">
            {ICONS[provider.provider] || '🔗'} {provider.label}
          </p>
          <p className="mt-1 text-[11px] leading-snug opacity-50">
            {BLURBS[provider.provider] || provider.scopes.join(', ')}
          </p>
        </div>
        {provider.connected && !needsReauth ? (
          <button
            onClick={onDisconnect}
            disabled={busy}
            className="shrink-0 rounded border border-red-400/40 px-2 py-1 font-mono text-[10px] uppercase text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          >
            {busy ? '…' : 'disconnect'}
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={busy}
            className="shrink-0 rounded-full bg-emerald-500/80 px-3 py-1.5 text-xs font-semibold text-black active:scale-95 disabled:opacity-40"
          >
            {busy ? '…' : needsReauth ? 'Reconnect' : 'Connect'}
          </button>
        )}
      </div>

      {needsReauth && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
          access expired — reconnect to resume
        </p>
      )}

      {provider.connected && !needsReauth && link && (
        <p className="mt-2 font-mono text-[10px] opacity-50">
          {link.display_name ? `${link.display_name} · ` : ''}
          connected {ago(link.created_at) || 'just now'}
          {link.last_used_at ? ` · last read ${ago(link.last_used_at)}` : ''}
        </p>
      )}

      {!provider.connected && provider.requires_consent && !consentGranted && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] opacity-40">
          asks for health-data consent first
        </p>
      )}
    </li>
  );
}

/** Explicit opt-in shown before a health provider can be linked. */
function ConsentGate({
  provider,
  busy,
  onAccept,
  onCancel,
}: {
  provider: IntegrationProvider;
  busy: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="rounded border border-amber-400/40 bg-amber-500/5 p-4">
      <Label>before connecting {provider.label}</Label>
      <p className="text-sm leading-relaxed">
        {CONSENT_COPY[provider.requires_consent || ''] ||
          'This connection needs your consent before Athena can read it.'}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-full border border-emerald-500/30 py-2 text-sm hover:bg-emerald-500/10"
        >
          Not now
        </button>
        <button
          onClick={onAccept}
          disabled={busy}
          className="flex-1 rounded-full bg-emerald-500/80 py-2 text-sm font-semibold text-black active:scale-95 disabled:opacity-40"
        >
          {busy ? '…' : 'I agree — connect'}
        </button>
      </div>
    </section>
  );
}

/** Outcome of the round trip we just came back from. */
function CallbackBanner({
  callback,
  providers,
}: {
  callback: IntegrationCallback;
  providers: IntegrationProvider[] | null;
}) {
  const label =
    providers?.find((p) => p.provider === callback.provider)?.label || callback.provider;
  const ok = callback.status === 'connected';
  return (
    <p
      className={`mb-4 rounded border px-3 py-2 text-xs ${
        ok
          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
          : 'border-amber-400/40 bg-amber-500/10 text-amber-100'
      }`}
    >
      {ok
        ? `${label} connected.`
        : `${label} was not connected${callback.reason ? ` (${callback.reason.replace(/_/g, ' ')})` : ''}.`}
    </p>
  );
}

/**
 * Memoized because this has a side effect (it scrubs the query string) and is
 * called from a `useState` initializer, which StrictMode runs twice: without
 * this, the first call would consume the result and the second — the one React
 * keeps — would see a clean URL and return null.
 */
let cachedCallback: IntegrationCallback | null | undefined;

/**
 * Read the OAuth outcome off the URL and scrub it, so a refresh does not
 * re-show the banner. Returns null when this was an ordinary page load.
 */
export function readIntegrationCallback(): IntegrationCallback | null {
  if (cachedCallback !== undefined) return cachedCallback;
  cachedCallback = takeIntegrationCallback();
  return cachedCallback;
}

function takeIntegrationCallback(): IntegrationCallback | null {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get('integration');
  const status = params.get('status');
  if (!provider || !status) return null;

  const reason = params.get('reason');
  params.delete('integration');
  params.delete('status');
  params.delete('reason');
  const query = params.toString();
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}`
  );
  return { provider, status, reason };
}
