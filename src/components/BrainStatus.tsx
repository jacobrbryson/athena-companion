import { useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import { brainApi, type DeviceModel, type EndpointStatus, type LlmStatus, type MonologueTurn } from '../api/companion';

/**
 * Athena's "brain": which model tier is answering, and how each tier is doing.
 * device -> Orcwood -> frontier, managed by the server's router (health checks,
 * circuit breakers, fallback) — this panel just shows what it decided.
 */

const TIER_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  device: { label: 'ON-DEVICE', dot: 'bg-cyan-300', text: 'text-cyan-200' },
  orcwood: { label: 'ORCWOOD', dot: 'bg-emerald-400', text: 'text-emerald-200' },
  frontier: { label: 'FRONTIER', dot: 'bg-amber-300', text: 'text-amber-200' },
  offline: { label: 'OFFLINE', dot: 'bg-red-400', text: 'text-red-300' },
};

/** Polls the router status for the header pill. */
export function useBrainStatus(intervalMs = 60_000) {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      brainApi
        .status()
        .then((s) => !cancelled && setStatus(s))
        .catch(() => undefined);
    void tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return status;
}

export function BrainPill({ status, onClick }: { status: LlmStatus | null; onClick: () => void }) {
  const tier = status ? status.serving.chat?.tier || 'offline' : null;
  const style = tier ? TIER_STYLE[tier] || TIER_STYLE.frontier : null;
  return (
    <button
      onClick={onClick}
      title={status?.serving.chat ? `Answering with ${status.serving.chat.model}` : 'Model status'}
      className="flex items-center gap-1.5 rounded border border-emerald-500/20 px-2 py-1 text-[10px] tracking-[0.2em] hover:bg-emerald-500/10"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${style ? style.dot : 'bg-emerald-500/30 animate-pulse'}`} aria-hidden />
      <span className={style?.text}>{style ? style.label : '· · ·'}</span>
    </button>
  );
}

function EndpointRow({ e, serving }: { e: EndpointStatus; serving: boolean }) {
  const h = e.health;
  const state = !h.available ? 'resting' : h.calls === 0 ? 'standby' : h.errorRate > 0.25 ? 'degraded' : 'healthy';
  const color = state === 'healthy' ? 'text-emerald-300' : state === 'standby' ? 'opacity-60' : state === 'degraded' ? 'text-amber-300' : 'text-red-300';
  const models = Object.entries(e.models).filter(([, m]) => m);
  return (
    <li className={`rounded border px-3 py-2 ${serving ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-emerald-500/10 bg-white/[0.02]'}`}>
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="truncate">
          {e.id}
          {serving && <span className="ml-2 text-[9px] uppercase tracking-[0.3em] text-emerald-300">answering</span>}
        </span>
        <span className={`text-[10px] uppercase tracking-[0.2em] ${color}`}>{state}</span>
      </div>
      <p className="mt-1 font-mono text-[10px] opacity-50">
        {h.latencyMs != null ? `${(h.latencyMs / 1000).toFixed(1)}s avg` : h.calls ? 'no successful calls' : 'no calls yet'}
        {h.calls ? ` · ${h.calls} calls · ${Math.round(h.errorRate * 100)}% err` : ''}
        {h.circuit === 'open' ? ' · circuit open' : ''}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed opacity-60">
        {models.map(([task, m]) => `${task}: ${m}`).join(' · ')}
      </p>
    </li>
  );
}

const VERDICT_LABEL: Record<string, string> = {
  ok: 'checked, sent as written',
  search: 'looked it up and rewrote',
  revise: 'rewrote without the guess',
  unavailable: 'could not check, sent as written',
};

/**
 * "What I almost said": the drafts her inner monologue stopped to check.
 * Replies the screen let straight through are only counted. In memory on the
 * server, so the list starts empty after each deploy.
 */
function Monologue({ turns }: { turns: MonologueTurn[] }) {
  const checked = turns.filter((t) => t.verdict);
  const passed = turns.length - checked.length;
  return (
    <section>
      <Label>what I almost said</Label>
      {!turns.length ? (
        <p className="text-sm opacity-60">
          Nothing yet. Before I send a reply that states facts, I check it — and when it's a guess, I look it up or rewrite it. Those second looks show up here.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs opacity-60">
            Of my last {turns.length} replies, I stopped to check {checked.length}
            {passed ? `; ${passed} had nothing to check` : ''}.
          </p>
          <ul className="space-y-3">
            {checked.map((t) => (
              <li key={t.at} className="rounded border border-emerald-500/15 px-3 py-2 text-xs">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-50">
                  {VERDICT_LABEL[t.verdict!] || t.verdict} · {(t.ms / 1000).toFixed(1)}s · {ago(t.at)}
                </p>
                <p className="mt-1 opacity-60">You: {t.message}</p>
                {t.changed ? (
                  <>
                    <p className="mt-1 text-amber-200/70 line-through decoration-amber-200/40">{t.draft}</p>
                    <p className="mt-1 text-emerald-100">{t.final}</p>
                  </>
                ) : (
                  <p className="mt-1 text-emerald-100">{t.draft}</p>
                )}
                {!!t.problems.length && (
                  <ul className="mt-1 list-disc pl-4 opacity-70">
                    {t.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {t.query && (
                  <p className="mt-1 opacity-60">
                    Searched “{t.query}”{t.sources.length ? ` · ${t.sources.join(', ')}` : ' · nothing useful'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function BrainPanel({ onClose }: { onClose: () => void }) {
  const status = useBrainStatus(15_000);
  const [manifest, setManifest] = useState<{ version: string; models: DeviceModel[] } | null>(null);
  useEffect(() => {
    brainApi.manifest().then(setManifest).catch(() => undefined);
  }, []);
  const [turns, setTurns] = useState<MonologueTurn[] | null>(null);
  useEffect(() => {
    brainApi.monologue().then((r) => setTurns(r.turns)).catch(() => setTurns(null));
  }, []);

  const recent = status?.recentCalls || [];
  const local = recent.filter((c) => c.outcome === 'ok' && c.tier !== 'frontier').length;
  const served = recent.filter((c) => c.outcome === 'ok').length;

  return (
    <Drawer eyebrow="model router" title="Athena's brain" onClose={onClose}>
      {!status ? (
        <p className="py-6 text-center font-mono text-xs opacity-50">
          reading<span className="animate-caret">_</span>
        </p>
      ) : (
        <div className="space-y-6">
          <section>
            <Label>right now</Label>
            <div className="grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.15em]">
              {(['chat', 'vision', 'extract'] as const).map((task) => {
                const s = status.serving[task];
                const style = TIER_STYLE[s?.tier || 'offline'];
                return (
                  <div key={task} className="rounded border border-emerald-500/15 px-2 py-2 text-center">
                    <p className="opacity-50">{task === 'extract' ? 'memory' : task}</p>
                    <p className={`mt-1 ${style.text}`}>{style.label}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs opacity-60">
              Active policy: <span className="font-mono">{status.policy}</span>. Unhealthy servers are rested automatically and retried later.
            </p>
            {served > 0 && (
              <p className="mt-1 text-xs opacity-60">
                Last {served} answers: {Math.round((local / served) * 100)}% served locally.
              </p>
            )}
          </section>

          {turns && <Monologue turns={turns} />}

          {status.automaticManagement && <section>
            <Label>automatic performance management</Label>
            <p className="text-xs opacity-70">I monitor response speed, errors and output validation. After enough observations, I prefer alternatives within the same provider tier. Observations expire after {status.automaticManagement.windowMs / 60_000} minutes so recovering models can be tried again.</p>
            <ul className="mt-2 space-y-1 text-xs">
              {Object.entries(status.automaticManagement.tasks).flatMap(([task, entries]) => entries.map(e => (
                <li key={`${task}:${e.endpointId}`}>
                  {task} · {e.endpointId}: {e.reason === 'learning' ? 'Learning from usage' : e.reason === 'meeting-target' ? 'Meeting response targets' : e.reason === 'slow-responses' ? 'Slow responses; prefer an alternative when available' : 'Repeated errors or invalid output; prefer an alternative when available'} ({e.samples} observations)
                </li>
              )))}
            </ul>
          </section>}

          <section>
            <Label>orcwood servers</Label>
            {status.orcwood.length ? (
              <ul className="space-y-2">
                {status.orcwood.map((e) => (
                  <EndpointRow key={e.id} e={e} serving={status.serving.chat?.endpointId === e.id} />
                ))}
              </ul>
            ) : (
              <p className="text-sm opacity-60">
                No local model server is configured. Local installation is still an owner-operated preview.
              </p>
            )}
          </section>

          <section>
            <Label>frontier</Label>
            <ul className="space-y-2">
              {status.frontier.map((e) => (
                <EndpointRow key={e.id} e={e} serving={status.serving.chat?.endpointId === e.id} />
              ))}
            </ul>
          </section>

          <section>
            <Label>on-device models{manifest ? ` · manifest ${manifest.version}` : ''}</Label>
            <ul className="space-y-1.5">
              {manifest?.models.map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${m.enabled ? 'bg-cyan-300' : 'bg-white/20'}`} />
                  <span>
                    <span className="font-mono text-xs">{m.id}</span>
                    <span className="opacity-50"> · {m.platforms.join('/')} · {m.tasks.join(', ')}</span>
                    {!m.enabled && <span className="opacity-40"> · not published</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {recent.length > 0 && (
            <section>
              <Label>recent calls</Label>
              <ul className="space-y-1 font-mono text-[10px] opacity-70">
                {[...recent].reverse().slice(0, 10).map((c, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {c.task} → {c.endpointId}
                    </span>
                    <span className={c.outcome === 'ok' ? '' : 'text-amber-300'}>
                      {c.outcome} · {(c.latencyMs / 1000).toFixed(1)}s · {ago(c.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
