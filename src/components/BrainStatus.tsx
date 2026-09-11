import { useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import { brainApi, type DeviceModel, type EndpointStatus, type LlmStatus } from '../api/companion';

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

export function BrainPanel({ onClose }: { onClose: () => void }) {
  const status = useBrainStatus(15_000);
  const [manifest, setManifest] = useState<{ version: string; models: DeviceModel[] } | null>(null);
  useEffect(() => {
    brainApi.manifest().then(setManifest).catch(() => undefined);
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
              Policy <span className="font-mono">{status.policy}</span>: device first, then Orcwood servers, frontier as the
              last resort. Unhealthy servers are rested automatically and retried later.
            </p>
            {served > 0 && (
              <p className="mt-1 text-xs opacity-60">
                Last {served} answers: {Math.round((local / served) * 100)}% served locally.
              </p>
            )}
          </section>

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
                None configured yet — everything is running on the frontier. Add a server with{' '}
                <span className="font-mono text-xs">LLM_ORCWOOD_ENDPOINTS</span>.
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
