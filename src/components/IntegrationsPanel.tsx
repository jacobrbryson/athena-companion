import { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import {
  consentApi,
  integrationsApi,
  GOOGLE_GROUP,
  type IntegrationProvider,
} from '../api/companion';
import type { ApiError } from '../api/client';
import { androidCall, isAndroidCompanion } from '../native/android';
import { WhoopActivityReviews } from './WhoopActivityReviews';

/**
 * Connect Athena to Google (Gmail, Calendar, Contacts), Strava, Whoop and more.
 *
 * The flow leaves this app: `connect` returns an authorize URL and we navigate
 * to it, the provider sends the browser back to the origin with
 * `?integration=<id>&status=connected|error`, and the console reopens this
 * panel with that outcome (see `callback` below).
 *
 * The Google services share one grant, so they share one card. Sign-in asks
 * for all three on one consent screen; anything unticked there can be
 * connected here on its own row later (Google adds it to the same grant).
 *
 * Health providers are gated behind the family's `health_data` consent. The
 * server enforces it — a 412 `consent_required` — and this panel turns that
 * into an explicit opt-in rather than an error the person can't act on.
 */

export interface IntegrationCallback {
  provider: string;
  status: string;
  reason?: string | null;
  /** Group callbacks: which members were linked, kept on another account, or left unticked. */
  linked?: string[];
  kept?: string[];
  declined?: string[];
  /** 'signin' when the flow was the one sign-in opened. */
  from?: string | null;
}

const ICONS: Record<string, string> = {
  google: '🟢',
  gmail: '✉️', jira: '🔷', slack: '💬',
  google_calendar: '📅',
  google_contacts: '👥',
  strava: '🏃',
  whoop: '💤',
};

/** What each provider will be able to read, in plain language. */
const BLURBS: Record<string, string> = {
  gmail: 'Reads unread inbox message headers for your Work card. Never sends mail. To use a different (e.g. work) account, connect Gmail on its own and pick that account.',
  jira: 'Reads your assigned open issues across authorized Jira Cloud sites. Never changes issues.',
  slack: 'Reads recent mentions visible to your Slack account. Never posts or changes messages.',
  google_calendar: 'Reads your upcoming events and free/busy time.',
  google_contacts: 'Reads names, phone numbers, emails, relationships, birthdays and photos, so Athena can link them to the family and people she knows. Read-only.',
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
  askConsentFor,
}: {
  onClose: () => void;
  callback?: IntegrationCallback | null;
  /** Open on this provider's consent prompt — a dashboard Connect that hit the gate. */
  askConsentFor?: string | null;
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

  // Once the list and consent state are in, open straight on the prompt the
  // dashboard asked for — only if that provider still needs consent, so an
  // already-agreed one just shows the list. Accepting still takes the tick.
  const askedConsent = useRef(false);
  useEffect(() => {
    if (askedConsent.current || !askConsentFor || !providers) return;
    askedConsent.current = true;
    const target = providers.find((p) => p.provider === askConsentFor);
    if (target?.requires_consent && !granted.has(target.requires_consent)) setConsentFor(target);
  }, [askConsentFor, providers, granted]);

  useEffect(() => {
    void refresh();
    const resume = () => void refresh();
    window.addEventListener('athena-native-resume', resume);
    return () => window.removeEventListener('athena-native-resume', resume);
  }, [refresh]);

  async function beginConnect(provider: Pick<IntegrationProvider, 'provider' | 'label'>) {
    setBusy(provider.provider);
    setError(null);
    try {
      const { authorize_url } = await integrationsApi.connect(
        provider.provider,
        window.location.origin
      );
      // Android opens provider consent in the system browser; Google blocks
      // embedded user agents. The server's OAuth state still binds the account.
      if (isAndroidCompanion()) {
        await androidCall('openExternal', { url: authorize_url });
        setBusy(null);
      } else window.location.assign(authorize_url);
    } catch (e) {
      const err = e as ApiError;
      const full = providers?.find((p) => p.provider === provider.provider);
      if (err.code === 'consent_required' && full) {
        setConsentFor(full);
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

  async function disconnect(provider: Pick<IntegrationProvider, 'provider'>) {
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
            {providers && providers.some((p) => p.group === GOOGLE_GROUP) && (
              <GoogleGroupCard
                members={providers.filter((p) => p.group === GOOGLE_GROUP)}
                busy={busy}
                onConnectAll={() => void beginConnect({ provider: GOOGLE_GROUP, label: 'Google' })}
                onDisconnectAll={() => void disconnect({ provider: GOOGLE_GROUP })}
                onConnect={(p) => void beginConnect(p)}
                onDisconnect={(p) => void disconnect(p)}
              />
            )}
            {providers?.filter((p) => p.group !== GOOGLE_GROUP).map((p) => (
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
      {provider.provider === 'whoop' && <WhoopActivityReviews connected={provider.connected && !needsReauth} />}
    </li>
  );
}

/**
 * Gmail, Calendar and Contacts on one card. "Connect all" opens the same
 * consent screen sign-in does; each row's own button elevates just that
 * service (or links it to a different account — Gmail is often a work one).
 */
function GoogleGroupCard({
  members,
  busy,
  onConnectAll,
  onDisconnectAll,
  onConnect,
  onDisconnect,
}: {
  members: IntegrationProvider[];
  busy: string | null;
  onConnectAll: () => void;
  onDisconnectAll: () => void;
  onConnect: (p: IntegrationProvider) => void;
  onDisconnect: (p: IntegrationProvider) => void;
}) {
  const healthy = (p: IntegrationProvider) => p.connected && p.link?.status !== 'needs_reauth';
  const anyLinked = members.some((p) => p.connected);
  const allHealthy = members.every(healthy);
  const accounts = [...new Set(members.filter(healthy).map((p) => p.link?.display_name).filter(Boolean))];
  const groupBusy = busy === GOOGLE_GROUP;

  return (
    <li className="rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm">{ICONS.google} Google</p>
          <p className="mt-1 text-[11px] leading-snug opacity-50">
            Gmail, Calendar and Contacts share one Google approval. Signing in asks for all
            three; connect any you skipped below.
          </p>
          {accounts.length > 0 && (
            <p className="mt-1 truncate font-mono text-[10px] opacity-50">{accounts.join(' · ')}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!allHealthy && (
            <button
              onClick={onConnectAll}
              disabled={!!busy}
              className="rounded-full bg-emerald-500/80 px-3 py-1.5 text-xs font-semibold text-black active:scale-95 disabled:opacity-40"
            >
              {groupBusy ? '…' : anyLinked ? 'Connect all' : 'Connect'}
            </button>
          )}
          {anyLinked && (
            <button
              onClick={onDisconnectAll}
              disabled={!!busy}
              className="rounded border border-red-400/40 px-2 py-1 font-mono text-[10px] uppercase text-red-300 hover:bg-red-500/10 disabled:opacity-40"
            >
              {groupBusy ? '…' : 'disconnect all'}
            </button>
          )}
        </div>
      </div>

      <ul className="mt-3 space-y-2 border-t border-emerald-500/10 pt-3">
        {members.map((p) => {
          const needsReauth = p.link?.status === 'needs_reauth';
          const rowBusy = busy === p.provider;
          return (
            <li key={p.provider} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px]">
                  {ICONS[p.provider] || '🔗'} {p.label.replace(/^Google /, '')}
                  <span
                    className={`ml-2 font-mono text-[9px] uppercase tracking-[0.2em] ${
                      needsReauth ? 'text-amber-300' : p.connected ? 'text-emerald-300' : 'opacity-40'
                    }`}
                  >
                    {needsReauth ? 'reconnect' : p.connected ? 'on' : 'off'}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug opacity-50">{BLURBS[p.provider] || p.scopes.join(', ')}</p>
                {p.connected && p.link && (
                  <p className="mt-0.5 font-mono text-[10px] opacity-40">
                    {p.link.display_name ? `${p.link.display_name} · ` : ''}
                    {p.link.last_used_at ? `last read ${ago(p.link.last_used_at)}` : `connected ${ago(p.link.created_at) || 'just now'}`}
                  </p>
                )}
              </div>
              {p.connected && !needsReauth ? (
                <button
                  onClick={() => onDisconnect(p)}
                  disabled={!!busy}
                  className="shrink-0 rounded border border-red-400/30 px-2 py-0.5 font-mono text-[10px] uppercase text-red-300/80 hover:bg-red-500/10 disabled:opacity-40"
                >
                  {rowBusy ? '…' : 'off'}
                </button>
              ) : (
                <button
                  onClick={() => onConnect(p)}
                  disabled={!!busy}
                  className="shrink-0 rounded-full border border-emerald-500/40 px-2.5 py-0.5 text-[11px] hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {rowBusy ? '…' : needsReauth ? 'Reconnect' : 'Connect'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {members.filter((p) => p.connected).length > 1 && (
        <p className="mt-2 font-mono text-[10px] leading-relaxed opacity-40">
          Turning one off deletes Athena's copy for that service; Google's approval itself is
          withdrawn when the last one is off.
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
  const labelOf = (id: string) =>
    id === GOOGLE_GROUP ? 'Google' : providers?.find((p) => p.provider === id)?.label || id;
  const label = labelOf(callback.provider);
  const ok = callback.status === 'connected';
  if (callback.provider === GOOGLE_GROUP && ok) {
    const names = (ids?: string[]) => (ids || []).map((id) => labelOf(id).replace(/^Google /, '')).join(', ');
    return (
      <div className="mb-4 space-y-1 rounded border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
        <p>Connected: {names(callback.linked)}.</p>
        {!!callback.declined?.length && (
          <p className="opacity-80">Not approved: {names(callback.declined)} — connect it below whenever you like.</p>
        )}
        {!!callback.kept?.length && (
          <p className="opacity-80">Left on its other account: {names(callback.kept)}.</p>
        )}
      </div>
    );
  }
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
  const list = (key: string) => (params.get(key) || '').split(',').filter(Boolean);
  const linked = list('linked');
  const kept = list('kept');
  const declined = list('declined');
  const from = params.get('from');
  for (const key of ['integration', 'status', 'reason', 'linked', 'kept', 'declined', 'from']) params.delete(key);
  const query = params.toString();
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}`
  );
  return { provider, status, reason, linked, kept, declined, from };
}

/**
 * True when a callback needs no attention: the Google approval sign-in opened,
 * everything granted and nothing left behind. The console skips opening the
 * panel for it — a person who just signed in wants their dashboard.
 */
export function isQuietSigninCallback(callback: IntegrationCallback | null): boolean {
  return (
    !!callback &&
    callback.from === 'signin' &&
    callback.status === 'connected' &&
    !callback.declined?.length &&
    !callback.kept?.length
  );
}
