import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useChat, type Message } from '../athena/useChat';
import { useVoiceInput } from '../athena/useVoiceInput';
import { useSpeech, type PreparedSpeech } from '../athena/useSpeech';
import { UnityAthena, type AthenaBridge } from '../athena/UnityAthena';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { MemoryPanel } from '../components/MemoryPanel';
import { PhotoMemory } from '../components/PhotoMemory';
import { BrainPanel, BrainPill, useBrainStatus } from '../components/BrainStatus';
import { DevicesPanel } from '../components/DevicesPanel';
import { ActionsPanel } from '../components/ActionsPanel';
import { InitiativePanel } from '../components/InitiativePanel';
import { useNudges } from '../athena/useNudges';
import { ActionProposal } from '../components/ActionProposal';
import { useActions } from '../athena/useActions';
import { LocalServerPanel } from '../components/LocalServerPanel';
import {
  IntegrationsPanel,
  readIntegrationCallback,
  type IntegrationCallback,
} from '../components/IntegrationsPanel';
import { ARRIVAL_MESSAGES, buildGreeting } from '../athena/sequences';
import type { MemoryEvent } from '../api/companion';
import { Dashboard, DashboardIcon, dashboardSections, type DashboardSection } from '../components/Dashboard';
import { AthenaAvatar } from '../components/AthenaAvatar';
import { Drawer } from '../components/Drawer';
import '../dashboard.css';

/**
 * The Companion console — the Guardians console's layout and feel (Athena
 * large and cinematic on top, conversation beneath, big touch targets, voice
 * synced to the text reveal) for one adult and their long-term companion.
 * Missions and decoders give way to memory, photos, the model "brain", and
 * paired devices.
 */

const ARRIVAL_MIN_MS = 2600;
const ARRIVAL_MAX_MS = 14000;
// Same product call as Guardians: a longer "thinking" beat beats a desynced reveal.
const MAX_VOICE_HOLD_MS = 20000;
const MAX_MESSAGE = 2000;

type Panel = 'memory' | 'photo' | 'brain' | 'devices' | 'local' | 'integrations' | 'actions' | 'initiative' | null;

export function CompanionConsole() {
  const { user, profile, arrival, consumeArrival, signOut } = useAuth();
  const tts = useSpeech();
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  // Voice-sync gate: hold each reply's text until its voice is ready (capped).
  const preparedSpeechRef = useRef(new Map<string, PreparedSpeech>());
  const holdForVoice = useCallback(async (message: Message) => {
    const speech = ttsRef.current;
    if (!speech.enabled || !speech.isSupported || !message.text?.trim()) return;
    const prepared = speech.prepare(message.text);
    preparedSpeechRef.current.set(message.uuid, prepared);
    await Promise.race([prepared.ready, new Promise((r) => window.setTimeout(r, MAX_VOICE_HOLD_MS))]);
  }, []);

  const chat = useChat(profile!.uuid, { onBeforeAthenaMessage: holdForVoice });
  // Proposals Athena is waiting on. Gated on `arriving` being over so a card
  // cannot land on top of the arrival sequence.
  const actions = useActions(!!profile);
  // Things she raised without being asked. Rendered into the transcript
  // rather than as a card: she started a conversation, so it should look like
  // one.
  const nudges = useNudges(!!profile);
  const brain = useBrainStatus();

  const [draft, setDraft] = useState('');
  const [view, setView] = useState<'dashboard' | 'chat'>('dashboard');
  const [chatOpened, setChatOpened] = useState(false);
  useEffect(() => { if (view === 'chat') setChatOpened(true); }, [view]);
  const [briefing, setBriefing] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>('Home');
  const [menuOpen, setMenuOpen] = useState(false);
  // Returning from a provider's consent screen. Read once, on the first
  // render, because it scrubs the query string as a side effect.
  const [integrationCallback, setIntegrationCallback] = useState<IntegrationCallback | null>(
    () => readIntegrationCallback()
  );
  // Land straight on the result rather than making the person find the panel.
  const [panel, setPanel] = useState<Panel>(integrationCallback ? 'integrations' : null);
  const inputId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  /**
   * The conversation as one time-ordered list: her replies, the person's
   * messages, and the things she raised herself.
   *
   * Merged by timestamp rather than appended, because a nudge is a message —
   * appending would park something she said twenty minutes ago underneath a
   * reply to something else, which reads as her losing the thread.
   */
  const transcript = useMemo(() => {
    let lastAt = 0;
    const entries: {
      kind: 'message' | 'nudge';
      uuid: string;
      at: number;
      message?: (typeof chat.messages)[number];
      nudge?: (typeof nudges.nudges)[number];
    }[] = [
      // A locally injected message (the arrival greeting) carries no
      // timestamp. Falling back to 0 would fling it to the top of the
      // transcript, so it inherits the moment just after the last message
      // that did have one — which is where it actually belongs.
      ...chat.messages.map((m, i) => {
        if (m.created_at) lastAt = new Date(m.created_at).getTime();
        return {
          kind: 'message' as const,
          uuid: m.uuid,
          at: m.created_at ? new Date(m.created_at).getTime() : lastAt + i,
          message: m,
        };
      }),
      ...nudges.nudges.map((n) => ({
        kind: 'nudge' as const,
        uuid: n.uuid,
        at: new Date(n.created_at).getTime(),
        nudge: n,
      })),
    ];
    return entries.sort((a, b) => a.at - b.at) as (
      | { kind: 'message'; uuid: string; at: number; message: (typeof chat.messages)[number] }
      | { kind: 'nudge'; uuid: string; at: number; nudge: (typeof nudges.nudges)[number] }
    )[];
  }, [chat.messages, nudges.nudges]);

  const logRef = useRef<HTMLDivElement | null>(null);
  const spokenRef = useRef<string | null>(null);
  const ttsInitRef = useRef(false);

  // --- Arrival (first contact of this sign-in) ---
  const arrivalRef = useRef(arrival);
  const [arriving, setArriving] = useState(!!arrival);
  const [unityReady, setUnityReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(!arrival);
  const bridgeRef = useRef<AthenaBridge | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (arrival) consumeArrival();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Inject + speak a local Athena line (greeting), text revealed with the voice. */
  const sayAthena = useCallback(
    (text: string) => {
      const speech = ttsRef.current;
      if (!speech.enabled || !speech.isSupported) {
        const uuid = chat.injectAthenaMessage(text);
        if (uuid) spokenRef.current = uuid;
        return;
      }
      const prepared = speech.prepare(text);
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        const uuid = chat.injectAthenaMessage(text);
        if (uuid) spokenRef.current = uuid;
      };
      const holdTimer = window.setTimeout(reveal, MAX_VOICE_HOLD_MS);
      void prepared.ready.then((ok) => {
        window.clearTimeout(holdTimer);
        reveal();
        if (ok) prepared.play();
      });
    },
    [chat]
  );

  const finishArrival = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setArriving(false);
    bridgeRef.current?.playGesture('Wave');
    const a = arrivalRef.current;
    if (a) sayAthena(buildGreeting(a.isFirstVisit, user?.full_name, a.daysAway));
  }, [sayAthena, user]);

  // Arrival timers start ONCE at mount. (finishArrival's identity changes on
  // most renders, so keying the timers on it would restart them every render
  // and could postpone the greeting indefinitely on a busy first few seconds.)
  const finishArrivalRef = useRef(finishArrival);
  finishArrivalRef.current = finishArrival;
  useEffect(() => {
    if (!arrivalRef.current) return;
    const minId = window.setTimeout(() => setMinElapsed(true), ARRIVAL_MIN_MS);
    const maxId = window.setTimeout(() => finishArrivalRef.current(), ARRIVAL_MAX_MS);
    return () => {
      window.clearTimeout(minId);
      window.clearTimeout(maxId);
    };
  }, []);

  useEffect(() => {
    if (arriving && unityReady && minElapsed) finishArrival();
  }, [arriving, unityReady, minElapsed, finishArrival]);

  const onUnityReady = useCallback(
    (bridge: AthenaBridge) => {
      bridgeRef.current = bridge;
      tts.attachUnity(bridge);
      setUnityReady(true);
    },
    [tts]
  );

  // Speak Athena's newest reply — never replay history.
  useEffect(() => {
    if (!chat.ready) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!ttsInitRef.current) {
      ttsInitRef.current = true;
      spokenRef.current = last?.uuid ?? null;
      return;
    }
    if (!last || last.is_human || spokenRef.current === last.uuid) return;
    spokenRef.current = last.uuid;
    const prepared = preparedSpeechRef.current.get(last.uuid);
    if (prepared) {
      preparedSpeechRef.current.delete(last.uuid);
      void prepared.ready.then((ok) => ok && prepared.play());
    } else {
      tts.speak(last.text);
    }
  }, [chat.messages, chat.ready, tts]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, MAX_MESSAGE);
      if (!trimmed) return;
      void chat.sendMessage(trimmed, { companion: { device: 'web' } }).catch(() => undefined);
    },
    [chat]
  );

  const voice = useVoiceInput(send);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  // actions.pending too: a proposal card arrives after the reply that
  // explains it, and a card scrolled out of view is a card nobody answers.
  }, [chat.messages, chat.isThinking, actions.pending, nudges.nudges]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if ((e.target as Element).closest('[data-menu-toggle]')) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    // Replying while something she raised is still open IS the engagement.
    // Asking for a thumbs-up on top of an actual answer would be worse data
    // and a worse conversation.
    nudges.engageAll();
    send(draft);
    setDraft('');
  }

  function openPanel(p: Panel) {
    setMenuOpen(false);
    setPanel(p);
  }

  function talkAboutPhoto(event: MemoryEvent) {
    setPanel(null);
    setView('chat');
    send(`I just showed you a photo — ${event.title || 'take a look'}. What do you think?`);
  }

  const firstName = user?.full_name?.split(/\s+/)[0] || user?.email || 'You';
  // Proposals she cannot act on until someone answers. Drives both the
  // Notifications card's count and the bell in the top bar.
  const waitingCount = actions.pending.length;
  function askAthena(text: string) {
    setBriefing(false);
    setView('chat');
    setDraft(text);
    window.setTimeout(() => document.getElementById(inputId)?.focus(), 0);
  }
  /**
   * Every nav entry is a page of its own now. It used to scroll the briefing
   * to a card — and for Projects and News it opened the chat with a canned
   * question, which meant two of the eight entries never showed the person
   * their own data at all.
   */
  function navigateDashboard(section: DashboardSection) {
    setActiveSection(section);
    setView('dashboard');
    // A new page starts at the top; the workspace is what scrolls, not window.
    window.setTimeout(() => document.querySelector('.companion-workspace')?.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }
  const menuItems: { icon: string; label: string; onClick: () => void; right?: string }[] = [
    { icon: '🧠', label: 'Memories', onClick: () => openPanel('memory') },
    { icon: '📷', label: 'Show a photo', onClick: () => openPanel('photo') },
    { icon: '⚙️', label: 'Brain', onClick: () => openPanel('brain') },
    { icon: '📱', label: 'Phone & car', onClick: () => openPanel('devices') },
    { icon: '🏠', label: 'Local server', onClick: () => openPanel('local') },
    { icon: '⚡', label: 'Actions', onClick: () => openPanel('actions') },
    { icon: '💡', label: 'Initiative', onClick: () => openPanel('initiative') },
    { icon: '🔗', label: 'Connected apps', onClick: () => openPanel('integrations') },
  ];

  return (
    <div className={`companion-shell ${view === 'chat' ? 'companion-chat-mode' : ''}`}>
      <aside className="dashboard-sidebar">
        <button className="athena-wordmark" onClick={() => navigateDashboard('Home')}><AthenaAvatar /> ATHENA</button>
        <span className="sidebar-caption">YOUR COMPANION</span>
        <nav aria-label="Main navigation">{dashboardSections.map(section => <button key={section} className={view === 'dashboard' && activeSection === section ? 'active' : ''} aria-current={view === 'dashboard' && activeSection === section ? 'page' : undefined} onClick={() => navigateDashboard(section)}><DashboardIcon name={section} /><span>{section}</span></button>)}</nav>
        <button className={`sidebar-chat ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}><DashboardIcon name="Chat" /><span>Talk to Athena</span><span className="sidebar-chat-arrow">↗</span></button>
        {/* The account row IS the menu. Settings, the panels and sign-out all
            used to be split between a sidebar button and a ⋯ in the far
            corner; one control in the place people already look for their own
            name is fewer things to learn and fewer places to miss. */}
        <div className="sidebar-bottom">
          <button
            type="button"
            className={`sidebar-profile ${menuOpen ? 'open' : ''}`}
            data-menu-toggle
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          >
            <span className="sidebar-profile-avatar">{firstName.slice(0, 1)}</span>
            <div><span className="sidebar-profile-name">{firstName}</span><small>ATHENA COMPANION</small></div>
            <span className="sidebar-profile-caret" aria-hidden>⌃</span>
          </button>
        </div>
      </aside>
      <div className="companion-workspace">
      {/* Top status bar */}
      <header className="companion-topbar flex items-center justify-between gap-2 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em]">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              chat.wsConnected ? 'bg-emerald-400' : chat.connected ? 'bg-amber-400' : 'bg-amber-400 animate-pulse'
            }`}
            title={chat.wsConnected ? 'Live link' : chat.connected ? 'Backup link — reconnecting' : 'Connecting…'}
            aria-hidden
          />
          <span className="truncate opacity-70">{firstName} · Companion</span>
        </div>
        <button className="mobile-wordmark" onClick={() => navigateDashboard('Today')}>ATHENA</button>
        <div className="flex items-center gap-2">
          {view === 'chat' && <button className="briefing-trigger" onClick={() => setBriefing(true)}>▦ <span>Daily briefing</span></button>}
          <BrainPill status={brain} onClick={() => openPanel('brain')} />
          {/* The Notifications card's counterpart. The dot is the whole point:
              a proposal Athena is waiting on should be visible from any screen
              in the app, not only from the dashboard card. */}
          <button
            className="topbar-notifications"
            onClick={() => openPanel('actions')}
            aria-label={waitingCount ? `Notifications — ${waitingCount} waiting for you` : 'Notifications'}
            title={waitingCount ? `${waitingCount} waiting for you` : 'Nothing waiting for you'}
          >
            <DashboardIcon name="Notifications" />
            {waitingCount > 0 && <span className="topbar-badge">{waitingCount > 9 ? '9+' : waitingCount}</span>}
          </button>
        </div>
      </header>

      {view === 'dashboard' && <Dashboard section={activeSection} firstName={firstName} onAsk={askAthena} onPanel={openPanel} onNavigate={navigateDashboard} />}
      <div className="companion-chat" hidden={view !== 'chat'}>

      {/* Athena — large and front-and-center */}
      <section className="relative min-h-0 flex-1">
        {chatOpened && <UnityAthena sessionId={chat.sessionId} isThinking={chat.isThinking} onReady={onUnityReady} />}
        {!arriving && (
          <div className="absolute bottom-3 right-3 z-20 flex gap-2">
            <button
              onClick={() => openPanel('memory')}
              className="flex items-center gap-2 rounded-full border border-emerald-400/40 bg-black/80 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-200 shadow-lg shadow-black/50 backdrop-blur-sm transition hover:bg-emerald-500/10 active:scale-95"
            >
              <span aria-hidden>🧠</span>
              Memories
            </button>
          </div>
        )}
        {arriving && <SequenceOverlay messages={ARRIVAL_MESSAGES} tone="overlay" eyebrow="athena companion" />}
      </section>

      {/* Conversation beneath Athena */}
      <section className="flex shrink-0 flex-col border-t border-emerald-500/15 bg-black/95">
        <div ref={logRef} className="space-y-2 overflow-y-auto px-4 py-3" style={{ maxHeight: '34vh', minHeight: '18vh' }}>
          {chat.messages.length === 0 && chat.ready && !arriving && (
            <p className="py-6 text-center font-mono text-xs opacity-40">
              {voice.isSupported ? 'Tap the mic or type. Ask what she remembers.' : 'Type to talk to Athena. Ask what she remembers.'}
            </p>
          )}
          {transcript.map((entry) =>
            entry.kind === 'message' ? (
              <div
                key={entry.uuid}
                className={`flex ${entry.message.is_human ? 'justify-end' : 'justify-start'}`}
              >
                <p
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    entry.message.is_human
                      ? 'bg-emerald-500/20 text-emerald-50'
                      : 'bg-white/5 text-emerald-100'
                  }`}
                >
                  {entry.message.text}
                </p>
              </div>
            ) : (
              <div key={entry.uuid} className="flex justify-start">
                {/* Marked as hers-unprompted. Without the marker the person
                    cannot tell what they asked for from what she decided to
                    raise, which is the difference they most want to see. */}
                <div className="max-w-[85%] rounded-2xl border-l-2 border-emerald-400/50 bg-white/5 px-4 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] opacity-40">
                    athena brought this up
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-100">
                    {entry.nudge.text}
                  </p>
                  {!entry.nudge.answered && (
                    <button
                      onClick={() => nudges.dismiss(entry.nudge.uuid)}
                      className="mt-1.5 font-mono text-[10px] uppercase opacity-40 hover:opacity-80"
                    >
                      not now
                    </button>
                  )}
                </div>
              </div>
            )
          )}
          {chat.isThinking && (
            <div className="flex justify-start">
              <p className="rounded-2xl bg-white/5 px-4 py-2 text-sm opacity-60">
                Athena is thinking<span className="animate-caret">…</span>
              </p>
            </div>
          )}
          {voice.listening && voice.interim && (
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm italic opacity-70">{voice.interim}</p>
            </div>
          )}

          {/* Approval cards, at the foot of the transcript so a card reads as
              the follow-up to what Athena just said. Inside the scroller on
              purpose: a floating card over the input is the shape people
              dismiss by reflex, and this is the one thing in the app that must
              not be dismissed by reflex. */}
          {!arriving &&
            actions.pending.map((a) => (
              <div key={a.uuid} className="flex justify-start">
                <div className="w-full max-w-[85%]">
                  <ActionProposal
                    action={a}
                    busy={actions.busyUuid === a.uuid}
                    onConfirm={() => void actions.confirm(a.uuid)}
                    onDecline={() => void actions.decline(a.uuid)}
                    onDismiss={() => actions.dismiss(a.uuid)}
                  />
                </div>
              </div>
            ))}
        </div>

        <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-emerald-500/10 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {voice.isSupported && (
            <button
              type="button"
              onClick={voice.toggle}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Stop listening' : 'Start voice input'}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border text-lg transition active:scale-95 ${
                voice.listening ? 'border-red-400 bg-red-500/20 text-red-200 animate-pulse' : 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10'
              }`}
            >
              {voice.listening ? '■' : '🎤'}
            </button>
          )}
          <label htmlFor={inputId} className="sr-only">
            Message Athena
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE))}
            placeholder={voice.listening ? 'listening…' : 'Tell Athena…'}
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-full bg-white/5 px-4 text-base outline-none placeholder:opacity-40 focus:bg-white/10"
          />
          <button
            type="button"
            onClick={() => openPanel('photo')}
            aria-label="Show Athena a photo"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-emerald-500/40 text-lg text-emerald-200 transition hover:bg-emerald-500/10 active:scale-95"
          >
            📷
          </button>
          <button type="submit" disabled={!draft.trim()} className="h-12 shrink-0 rounded-full bg-emerald-500/80 px-5 font-semibold text-black active:scale-95 disabled:opacity-30">
            Send
          </button>
        </form>
        {voice.error && <p className="px-4 pb-2 text-center text-xs text-red-300">{voice.error}</p>}
      </section>

      </div>
      </div>
      <nav className="mobile-navigation" aria-label="Mobile navigation">
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => navigateDashboard('Home')}><DashboardIcon name="Home" /><span>Home</span></button>
        <button className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}><DashboardIcon name="Chat" /><span>Chat</span></button>
        <button className="mobile-athena" aria-label="Talk to Athena" onClick={() => setView('chat')}><AthenaAvatar /></button>
        <button className="mobile-notifications" onClick={() => openPanel('actions')}><DashboardIcon name="Notifications" /><span>Alerts</span>{waitingCount > 0 && <i className="topbar-badge">{waitingCount > 9 ? '9+' : waitingCount}</i>}</button>
        <button data-menu-toggle aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><DashboardIcon name="More" /><span>More</span></button>
      </nav>

      {/* One menu for the whole app, opened from the account row on desktop
          and from "More" on mobile. Kept mounted so it can animate out, and
          inert while closed so nothing inside it is tabbable. */}
      <div className={`athena-menu-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden />
      <div ref={menuRef} className={`athena-menu ${menuOpen ? 'open' : ''}`} role="menu" aria-hidden={!menuOpen} {...(menuOpen ? {} : { inert: '' as unknown as boolean })}>
        <div className="athena-menu-head">
          <span className="sidebar-profile-avatar">{firstName.slice(0, 1)}</span>
          <div><span className="sidebar-profile-name">{firstName}</span><small>{user?.email}</small></div>
        </div>
        <div className="athena-menu-items">
          {menuItems.map((m, i) => (
            <button key={m.label} role="menuitem" onClick={m.onClick} style={{ transitionDelay: `${menuOpen ? 30 + i * 22 : 0}ms` }}>
              <span aria-hidden>{m.icon}</span>{m.label}
            </button>
          ))}
          {tts.isSupported && (
            <button
              role="menuitemcheckbox"
              aria-checked={tts.enabled}
              onClick={tts.toggle}
              style={{ transitionDelay: `${menuOpen ? 30 + menuItems.length * 22 : 0}ms` }}
            >
              <span aria-hidden>{tts.enabled ? '🔊' : '🔇'}</span>Voice
              <small>{tts.enabled ? 'on' : 'off'}</small>
            </button>
          )}
        </div>
        <button
          role="menuitem"
          className="athena-menu-signout"
          onClick={() => { setMenuOpen(false); void signOut(); }}
        >
          <span aria-hidden>🚪</span>Sign out
        </button>
      </div>
      {briefing && <Drawer eyebrow="Athena" title="Your daily briefing" onClose={() => setBriefing(false)}><Dashboard compact firstName={firstName} onAsk={askAthena} onPanel={p => { setBriefing(false); openPanel(p); }} onExpand={() => { setBriefing(false); navigateDashboard('Home'); }} /></Drawer>}

      {panel === 'memory' && <MemoryPanel onClose={() => setPanel(null)} />}
      {panel === 'photo' && <PhotoMemory onClose={() => setPanel(null)} onTalkAbout={talkAboutPhoto} />}
      {panel === 'brain' && <BrainPanel onClose={() => setPanel(null)} />}
      {panel === 'devices' && <DevicesPanel onClose={() => setPanel(null)} />}
      {panel === 'actions' && <ActionsPanel onClose={() => setPanel(null)} />}
      {panel === 'initiative' && <InitiativePanel onClose={() => setPanel(null)} />}
      {panel === 'local' && <LocalServerPanel onClose={() => setPanel(null)} />}
      {panel === 'integrations' && (
        <IntegrationsPanel
          callback={integrationCallback}
          onClose={() => {
            setIntegrationCallback(null);
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}
