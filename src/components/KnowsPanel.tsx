import { useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import { integrationsApi, memoryApi, type Fact, type IntegrationProvider } from '../api/companion';

/**
 * What each linked account lets her read, and whether she can change anything
 * in it. Written out here, beside the panel, because the provider list says
 * only that a link exists. Athena reads these per message when a question
 * needs them, not all at once — the line says so rather than implying she
 * holds a copy.
 */
const READS: Record<string, { reads: string; writes: string }> = {
  google_calendar: { reads: 'Events on your calendars and when you’re free.', writes: 'Adds an event only when you approve a card.' },
  gmail: { reads: 'Sender, subject and date of your inbox; a message body only when you open it.', writes: 'Archive, trash, unsubscribe or save a draft only when you approve. She never sends.' },
  google_contacts: { reads: 'Names, numbers, emails, addresses, birthdays and photos, read live.', writes: 'Nothing — read-only.' },
  whoop: { reads: 'Recovery, sleep, strain, resting heart rate, HRV and blood oxygen.', writes: 'Nothing — read-only.' },
  family_chores: { reads: 'Whose chores are due, what is done, coins earned.', writes: 'Nothing — read-only.' },
  jira: { reads: 'Your assigned open issues.', writes: 'Nothing — read-only.' },
  slack: { reads: 'Recent messages that mention you.', writes: 'Nothing — read-only.' },
};

/** What she holds that did not come from a linked account. Fixed text; counts are live where they exist. */
const OWN: { name: string; what: string; where: string }[] = [
  { name: 'Photos and camera', what: 'A photo you show her is kept only if you save it as a moment. A camera look keeps her description of the scene, never the picture.', where: 'Show a photo · Let her see' },
  { name: 'Community', what: 'Your points of interest, neighbors and local events — in every conversation.', where: 'Community page' },
  { name: 'Family health watch', what: 'Who is under the weather, the symptom and how bad.', where: 'Family page' },
  { name: 'News pages you paste', what: 'Headlines she has read on pages you chose.', where: 'News page' },
  { name: 'Phone location & heart rate', what: 'Only when you switch them on in the Android app; short retention, and heart rate she answers about only when asked.', where: 'Phone & car' },
  { name: 'Her dreaming', what: 'Tables she builds overnight from your memories and contacts, in a database of her own.', where: 'Dreams page' },
];

export function KnowsPanel({ onClose, onOpen }: {
  onClose: () => void;
  onOpen: (panel: 'memory' | 'integrations' | 'devices') => void;
}) {
  const [providers, setProviders] = useState<IntegrationProvider[] | null>(null);
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    integrationsApi.list().then(setProviders).catch(e => setError((e as Error).message || 'Could not read your connected apps.'));
    memoryApi.facts().then(setFacts).catch(() => setFacts(null));
  }, []);

  const byCategory = new Map<string, number>();
  for (const f of facts || []) byCategory.set(f.category, (byCategory.get(f.category) || 0) + 1);

  return (
    <Drawer eyebrow="your privacy" title="What Athena knows" onClose={onClose}>
      <p className="mb-6 text-xs opacity-60">
        Everything she can see, and where it comes from. She reads linked accounts when a question needs them and keeps no copy of your inbox or calendar. Anything here can be removed.
      </p>
      {error && <p className="mb-3 text-xs" style={{ color: 'var(--gd-error)' }}>{error}</p>}

      <section className="mb-8">
        <Label>linked accounts</Label>
        {!providers && !error && <p className="text-sm opacity-60">Reading your links…</p>}
        <ul className="space-y-2">
          {(providers || []).map(p => {
            const info = READS[p.provider];
            const state = !p.connected ? 'not linked' : p.link?.status === 'active' && !p.link.expired ? 'linked' : 'needs reconnecting';
            return (
              <li key={p.provider} className="rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{p.label}</span>
                  <span className="font-mono text-[10px] uppercase opacity-50">{state}</span>
                </div>
                {p.connected ? (
                  <>
                    <p className="mt-1 text-xs opacity-75">{info?.reads || 'Whatever you granted when you linked it.'}</p>
                    <p className="mt-1 text-xs opacity-60">{info?.writes || 'Changes only when you approve.'}</p>
                    <p className="mt-1 font-mono text-[10px] opacity-45">
                      {p.link?.last_used_at ? `last read ${ago(p.link.last_used_at)}` : 'not read yet'}
                      {p.link?.display_name ? ` · ${p.link.display_name}` : ''}
                    </p>
                  </>
                ) : <p className="mt-1 text-xs opacity-50">She sees nothing from this.</p>}
              </li>
            );
          })}
        </ul>
        <button onClick={() => onOpen('integrations')} className="mt-3 text-xs underline opacity-70">Connect or disconnect in Connected apps ↗</button>
      </section>

      <section className="mb-8">
        <Label>what she remembers</Label>
        {!facts ? <p className="text-sm opacity-60">Memories aren’t loading right now.</p>
          : !facts.length ? <p className="text-sm opacity-60">Nothing saved yet.</p>
            : <p className="text-sm opacity-80">{facts.length} thing{facts.length === 1 ? '' : 's'} — {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c}`).join(' · ')}</p>}
        <button onClick={() => onOpen('memory')} className="mt-3 text-xs underline opacity-70">Read or delete memories ↗</button>
      </section>

      <section>
        <Label>other things she holds</Label>
        <ul className="space-y-2">
          {OWN.map(o => (
            <li key={o.name} className="rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-2">
              <span className="text-sm">{o.name}</span>
              <p className="mt-1 text-xs opacity-70">{o.what}</p>
              <p className="mt-1 font-mono text-[10px] opacity-45">{o.where}</p>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}
