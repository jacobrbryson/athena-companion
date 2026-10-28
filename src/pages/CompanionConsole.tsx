import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { handsFreeRunning } from '../native/handsFree';
import { useAuth } from '../auth/AuthContext';
import { useChat, type Message } from '../athena/useChat';
import { useVoiceInput } from '../athena/useVoiceInput';
import { useConversation } from '../athena/useConversation';
import type { CutOff } from '../athena/useSpeech';
import { useSpeech, type PreparedSpeech } from '../athena/useSpeech';
import { UnityAthena, type AthenaBridge } from '../athena/UnityAthena';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { MemoryPanel } from '../components/MemoryPanel';
import { PhotoMemory } from '../components/PhotoMemory';
import { CameraPanel } from '../components/CameraPanel';
import { useSight, LOOK_BEFORE_SEND_MS } from '../athena/useSight';
import { BrainPanel, BrainPill, useBrainStatus } from '../components/BrainStatus';
import { DevicesPanel } from '../components/DevicesPanel';
import { ActionsPanel } from '../components/ActionsPanel';
import { InitiativePanel } from '../components/InitiativePanel';
import { EmergencyBanner } from '../components/EmergencyBanner';
import { MiniMap } from '../components/MiniMap';
import { useNudges } from '../athena/useNudges';
import { ActionProposal, ActionProposalFolded } from '../components/ActionProposal';
import { useActions } from '../athena/useActions';
import { useDreamQuestions } from '../athena/useDreamQuestions';
import { useInbox } from '../athena/useInbox';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { KnowsPanel } from '../components/KnowsPanel';
import { LocalServerPanel } from '../components/LocalServerPanel';
import {
  IntegrationsPanel,
  readIntegrationCallback,
  isQuietSigninCallback,
  type IntegrationCallback,
} from '../components/IntegrationsPanel';
import { ARRIVAL_MESSAGES, buildGreeting, emergencyGreeting } from '../athena/sequences';
import { dashboardApi, type EmergencyAlert } from '../api/dashboard';
import type { MemoryEvent, Scene } from '../api/companion';
import { Dashboard, DashboardIcon, dashboardSections, navSectionOf, type DashboardSection } from '../components/Dashboard';
import { dashboardPath, sectionFromPath } from '../dashboardRoutes';
import { AthenaAvatar } from '../components/AthenaAvatar';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { Drawer } from '../components/Drawer';
import '../dashboard.css';
import { useStayAwake } from '../athena/idle';

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

type Panel = 'memory' | 'photo' | 'camera' | 'brain' | 'devices' | 'local' | 'integrations' | 'actions' | 'notifications' | 'knows' | 'initiative' | null;

export function CompanionConsole() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, arrival, consumeArrival, signOut } = useAuth();
  const tts = useSpeech();
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  // Voice-sync gate: hold each reply's text until its voice is ready (capped).
  const preparedSpeechRef = useRef(new Map<string, PreparedSpeech>());
  const holdForVoice = useCallback(async (message: Message) => {
    const speech = ttsRef.current;
    if (!speech.enabled || !speech.isSupported || !message.text?.trim()) return;
    // The phone's hands-free listener speaks its own replies.
    if (await handsFreeRunning()) return;
    // With lyrics, the held voice is her spoken lead-in (as quick as any
    // reply); the song keeps generating behind it.
    const prepared = speech.prepare(message.text, { lyrics: message.lyrics });
    preparedSpeechRef.current.set(message.uuid, prepared);
    await Promise.race([prepared.ready, new Promise((r) => window.setTimeout(r, MAX_VOICE_HOLD_MS))]);
  }, []);

  // Her "let me check your calendar, hmm…", spoken while the reply is
  // written — unless the phone's hands-free listener is voicing this turn.
  const sayFiller = useCallback(async (text: string) => {
    if (await handsFreeRunning()) return;
    ttsRef.current.sayFiller(text);
  }, []);

  const chat = useChat(profile!.uuid, {
    onBeforeAthenaMessage: holdForVoice,
    onFiller: (text) => void sayFiller(text),
  });
  // Proposals Athena is waiting on. Gated on `arriving` being over so a card
  // cannot land on top of the arrival sequence.
  const actions = useActions(!!profile);
  const [arriving, setArriving] = useState(!!arrival);
  // Questions from her dreaming: the other thing the bell is for.
  const dreamQuestions = useDreamQuestions(!!profile);
  // Every push she sends, kept until acknowledged (a tap on the phone loses it).
  const inbox = useInbox(!!profile);
  // Things she raised without being asked. Rendered into the transcript
  // rather than as a card: she started a conversation, so it should look like
  // one.
  const nudges = useNudges(!!profile);
  const brain = useBrainStatus();
  // Athena's eyes. Owned here, not by the camera drawer: closing the drawer
  // must not blind her, and the pill in the top bar is what makes a camera
  // that outlives its panel honest rather than creepy.
  const sight = useSight(!!profile);

  // Her reply is where a look gets proposed, so that is the moment to ask
  // whether she wants one. The hook's own poll is only a safety net.
  //
  // Depends on the CALLBACK, not on `sight` — the hook returns a fresh object
  // every render, so depending on it turned "check when she replies" into
  // "check on every render", which was twelve requests in six seconds.
  const checkLooks = sight.checkRequests;
  useEffect(() => {
    if (chat.messages.length) checkLooks();
  }, [chat.messages.length, checkLooks]);

  const [draft, setDraft] = useState('');
  const [threadUuid, setThreadUuid] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const view = location.pathname === '/chat' ? 'chat' : 'dashboard';
  const [chatOpened, setChatOpened] = useState(false);
  useEffect(() => { if (view === 'chat') setChatOpened(true); }, [view]);
  const [briefing, setBriefing] = useState(false);
  const activeSection = sectionFromPath(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  // The phone's stand-in for the left nav: every page the sidebar lists.
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const inputMenuRef = useRef<HTMLDivElement | null>(null);
  const inputToggleRef = useRef<HTMLButtonElement | null>(null);
  const inputMenuId = useId();
  // Returning from a provider's consent screen. Read once, on the first
  // render, because it scrubs the query string as a side effect.
  const [integrationCallback, setIntegrationCallback] = useState<IntegrationCallback | null>(
    () => {
      const callback = readIntegrationCallback();
      // Sign-in's Google approval that went fully through needs no panel.
      return isQuietSigninCallback(callback) ? null : callback;
    }
  );
  // Land straight on the result rather than making the person find the panel.
  const [panel, setPanel] = useState<Panel>(integrationCallback ? 'integrations' : null);
  // Opening the app from a notification (Android or web) cannot say which one
  // was tapped, so on opening or coming back, anything new and unacknowledged
  // is shown in full: the tray text is cut short and the tap has just cleared it.
  const inboxArmed = useRef(true);
  useEffect(() => {
    const arm = () => { if (document.visibilityState === 'visible') inboxArmed.current = true; };
    document.addEventListener('visibilitychange', arm);
    return () => document.removeEventListener('visibilitychange', arm);
  }, []);
  useEffect(() => {
    if (!inboxArmed.current || !inbox.reads || arriving) return;
    inboxArmed.current = false;
    let seen = 0;
    try { seen = Number(localStorage.getItem('athena_inbox_seen')) || 0; } catch { /* private window */ }
    const fresh = inbox.waiting.filter(n => Date.parse(n.createdAt) > seen);
    if (!fresh.length) return;
    try { localStorage.setItem('athena_inbox_seen', String(Math.max(...fresh.map(n => Date.parse(n.createdAt))))); } catch { /* private window */ }
    setPanel('notifications');
  }, [inbox.reads, inbox.waiting, arriving]);
  // A dashboard Connect that hit a health-consent gate: Connected apps opens on that prompt.
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const inputId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sectionsRef = useRef<HTMLDivElement | null>(null);
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
    type Entry =
      | { kind: 'message'; uuid: string; at: number; message: (typeof chat.messages)[number] }
      | { kind: 'nudge'; uuid: string; at: number; nudge: (typeof nudges.nudges)[number] }
      | { kind: 'action'; uuid: string; at: number; action: (typeof actions.pending)[number] };
    const entries: Entry[] = [
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
      ...nudges.nudges.filter((n) => !chat.messages.some((m) => m.uuid === n.uuid)).map((n) => ({
        kind: 'nudge' as const,
        uuid: n.uuid,
        at: new Date(n.created_at).getTime(),
        nudge: n,
      })),
      // An approval card is part of the conversation: it sits right after the
      // reply that proposed it, and scrolls away as the talk moves on.
      ...(arriving ? [] : actions.pending.filter((a) => !chat.messages.some((m) => m.action_uuid === a.uuid))).map((a) => ({
        kind: 'action' as const,
        uuid: a.uuid,
        at: new Date(a.created_at).getTime(),
        action: a,
      })),
    ];
    // Messages keep the order they arrived in; nudges and cards are placed by
    // time. A full sort let a single message with an off timestamp (clock or
    // timezone skew) outrank everything after it and sit at the bottom for good.
    const messageEntries = entries.filter((e) => e.kind === 'message');
    const timedEntries = entries.filter((e) => e.kind !== 'message').sort((a, b) => a.at - b.at);
    const merged: Entry[] = [];
    let n = 0;
    for (const m of messageEntries) {
      while (n < timedEntries.length && timedEntries[n].at <= m.at) merged.push(timedEntries[n++]);
      merged.push(m);
      if (m.kind === 'message' && m.message.action && !arriving) {
        const local = actions.pending.find((a) => a.uuid === m.message.action_uuid);
        merged.push({ kind: 'action', uuid: m.message.action.uuid, at: m.at,
          action: local && local.status !== 'pending' ? local : m.message.action });
      }
    }
    merged.push(...timedEntries.slice(n));
    return merged;
  }, [chat.messages, nudges.nudges, actions.pending, arriving]);

  // Approval cards: open while nothing has been said after them, folded to a
  // one-line summary once the conversation moves on. `openUuid` is a card the
  // person reopened from the counter in the input; it folds again when
  // anything new lands below it.
  const [openUuid, setOpenUuid] = useState<string | null>(null);
  const lastTalkIdx = useMemo(() => {
    for (let i = transcript.length - 1; i >= 0; i--) if (transcript[i].kind !== 'action') return i;
    return -1;
  }, [transcript]);
  /** Unanswered cards that are folded away, newest first. */
  const foldedCards = useMemo(
    () =>
      transcript
        .map((e, i) => ({ e, i }))
        .filter(({ e, i }) => e.kind === 'action' && e.action.status === 'pending' && i < lastTalkIdx)
        .map(({ e }) => e.uuid)
        .reverse(),
    [transcript, lastTalkIdx]
  );
  useEffect(() => setOpenUuid(null), [lastTalkIdx, transcript.length]);
  useEffect(() => {
    if (openUuid) document.getElementById(`action-${openUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [openUuid]);
  const showNextCard = useCallback(() => {
    if (!foldedCards.length) return;
    const at = openUuid ? foldedCards.indexOf(openUuid) : -1;
    setOpenUuid(foldedCards[(at + 1) % foldedCards.length]);
  }, [foldedCards, openUuid]);

  const logRef = useRef<HTMLDivElement | null>(null);
  const historyAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const spokenRef = useRef<string | null>(null);
  const ttsInitRef = useRef(false);

  // --- Arrival (first contact of this sign-in) ---
  const arrivalRef = useRef(arrival);
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

  // Read during the arrival sequence, so that if something is happening near
  // home her first words on sign-in are about it rather than "welcome back".
  const arrivalAlertRef = useRef<EmergencyAlert | null>(null);
  useEffect(() => {
    if (!arrivalRef.current) return;
    dashboardApi.alert().then((a) => { arrivalAlertRef.current = a; }).catch(() => undefined);
  }, []);

  const finishArrival = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setArriving(false);
    const a = arrivalRef.current;
    const emergency = arrivalAlertRef.current;
    if (a && emergency && emergency.level !== 'none' && emergency.headline) {
      sayAthena(emergencyGreeting(user?.full_name, { level: emergency.level, headline: emergency.headline, body: emergency.body }));
      return;
    }
    bridgeRef.current?.playGesture('Wave');
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
      void chat.sendMessage(trimmed, { companion: { device: 'web' }, replyTo: threadUuid || undefined })
        .catch(() => setDraft(trimmed));
    },
    [chat, threadUuid]
  );

  const voice = useVoiceInput(send, () => tts.interrupt());

  // Conversation mode: the mic stays on and she listens for each next turn.
  const talk = useCallback(
    (text: string, cutOff: CutOff | null) => {
      const trimmed = text.trim().slice(0, MAX_MESSAGE);
      if (!trimmed) return;
      const companion = { device: 'web' as const, conversation: true, ...(cutOff ? { cutOff } : {}) };
      void chat.sendMessage(trimmed, { companion, replyTo: threadUuid || undefined }).catch(() => undefined);
    },
    [chat, threadUuid]
  );
  const conversation = useConversation(tts, talk);
  // Talking with her hands-free is being here, though nothing is touched.
  useStayAwake(conversation.active);

  useEffect(() => {
    if (inputOpen) inputMenuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [inputOpen]);

  useEffect(() => { if (view !== 'chat') setInputOpen(false); }, [view]);

  function closeInputMenu() {
    setInputOpen(false);
    inputToggleRef.current?.focus();
  }

  // Layout effect, and keyed on `view`: the chat page stays mounted behind
  // `hidden` while the dashboard is up, and a scrollTop written to a
  // display:none element is silently dropped. Everything that arrives while
  // she's in the background — history on load, replies, nudges — used to land
  // that way, so opening the chat showed the top of the log instead of the
  // newest line. Pin on the way in as well as on every new entry.
  useLayoutEffect(() => {
    if (view !== 'chat') return;
    const el = logRef.current;
    if (el && historyAnchorRef.current) {
      const anchor = historyAnchorRef.current;
      el.scrollTop = anchor.top + el.scrollHeight - anchor.height;
      historyAnchorRef.current = null;
      return;
    }
    if (el) el.scrollTop = el.scrollHeight;
  // actions.pending too: a proposal card arrives after the reply that
  // explains it, and a card scrolled out of view is a card nobody answers.
  }, [view, chat.messages, chat.isThinking, actions.pending, nudges.nudges]);

  useEffect(() => {
    if (!menuOpen && !sectionsOpen) return;
    const onPointer = (e: MouseEvent) => {
      if ((e.target as Element).closest('[data-menu-toggle]')) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (sectionsRef.current && !sectionsRef.current.contains(e.target as Node)) setSectionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); setSectionsOpen(false); } };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, sectionsOpen]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Replying while something she raised is still open IS the engagement.
    // Asking for a thumbs-up on top of an actual answer would be worse data
    // and a worse conversation.
    nudges.engageAll();
    setDraft('');

    // If she can see, get a CURRENT frame in before this message reaches the
    // prompt builder. "What do you think of this?" is the whole reason sight
    // exists, and answering it from a view a minute old is worse than saying
    // nothing. The server structures the frame inline, so this is a real round
    // trip — capped, because a slow vision model must never hold the
    // conversation up. A look that lands late simply counts for the next turn.
    if (sight.enabled) {
      await Promise.race([
        sight.lookNow(),
        new Promise((r) => window.setTimeout(r, LOOK_BEFORE_SEND_MS)),
      ]);
    }

    send(text);
  }

  function openPanel(p: Panel, options?: { consentFor?: string }) {
    setMenuOpen(false);
    setConsentFor(options?.consentFor ?? null);
    setPanel(p);
  }

  function talkAboutScene(scene: Scene) {
    // Her live view is already in the prompt (perception.getPromptBlock), so
    // this only has to open the conversation — repeating the description back
    // to her would have her answering a summary instead of the scene.
    setPanel(null);
    navigate('/chat');
    send(scene.summary ? 'What do you make of what you can see?' : 'Can you see anything right now?');
  }

  function talkAboutPhoto(event: MemoryEvent) {
    setPanel(null);
    navigate('/chat');
    send(`I just showed you a photo — ${event.title || 'take a look'}. What do you think?`);
  }

  const firstName = user?.full_name?.split(/\s+/)[0] || user?.email || 'You';
  // Proposals she cannot act on until someone answers, plus the questions her
  // dreaming left her holding. Drives the bell in the top bar and Alerts on
  // the phone. A card already answered (done/failed) is not waiting on anyone.
  const waitingCount = actions.pending.filter(a => a.status === 'pending').length + dreamQuestions.questions.length + inbox.waiting.length;
  function askAthena(text: string) {
    setBriefing(false);
    navigate('/chat');
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
    setSectionsOpen(false);
    navigate(dashboardPath(section));
    // A new page starts at the top; the workspace is what scrolls, not window.
    window.setTimeout(() => document.querySelector('.companion-workspace')?.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }
  /**
   * Points of interest live on the Community page (they replaced the Watched
   * places drawer), so "add a place" from the banner or a card goes there and
   * lands on the list rather than the top of the page.
   */
  function showPointsOfInterest() {
    navigate(dashboardPath('Community'));
    window.setTimeout(() => document.getElementById('community-places')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  // Workouts is a page under Health, and Calendar, Mail, Projects, News, Dreams
  // and Finance are tabs of System — none is a nav entry of its own.
  const navSection: DashboardSection = navSectionOf(activeSection);
  const menuItems: { icon: string; label: string; onClick: () => void; right?: string }[] = [
    { icon: '🧠', label: 'Memories', onClick: () => openPanel('memory') },
    // The phone has no left nav; this is its way to the Dreams page.
    { icon: '🌙', label: 'Dreams', onClick: () => navigateDashboard('Dreams') },
    { icon: '📷', label: 'Show a photo', onClick: () => openPanel('photo') },
    { icon: '👁️', label: 'Let her see', onClick: () => openPanel('camera') },
    { icon: '⚙️', label: 'Brain', onClick: () => openPanel('brain') },
    { icon: '📱', label: 'Phone & car', onClick: () => openPanel('devices') },
    { icon: '🏠', label: 'Local server', onClick: () => openPanel('local') },
    { icon: '⚡', label: 'Actions', onClick: () => openPanel('actions') },
    { icon: '💡', label: 'Initiative', onClick: () => openPanel('initiative') },
    { icon: '🔗', label: 'Connected apps', onClick: () => openPanel('integrations') },
    { icon: '🔍', label: 'What Athena knows', onClick: () => openPanel('knows') },
    { icon: '🖥️', label: 'System', onClick: () => navigateDashboard('System') },
  ];

  return (
    <div className={`companion-shell ${view === 'chat' ? 'companion-chat-mode' : ''}`}>
      <aside className="dashboard-sidebar">
        <button className="athena-wordmark" onClick={() => navigateDashboard('Dashboard')}><AthenaAvatar /> ATHENA</button>
        <span className="sidebar-caption">YOUR COMPANION</span>
        <nav aria-label="Main navigation">{dashboardSections.map(section => <button key={section} className={view === 'dashboard' && navSection === section ? 'active' : ''} aria-current={view === 'dashboard' && navSection === section ? 'page' : undefined} onClick={() => navigateDashboard(section)}><DashboardIcon name={section} /><span>{section}</span></button>)}</nav>
        <button className={`sidebar-chat ${view === 'chat' ? 'active' : ''}`} onClick={() => navigate('/chat')}><DashboardIcon name="Chat" /><span>Talk to Athena</span><span className="sidebar-chat-arrow">↗</span></button>
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
            <ProfileAvatar picture={user?.picture} name={firstName} />
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
              chat.wsConnected ? 'bg-emerald-400' : chat.transport === 'idle' ? 'bg-slate-500' : chat.connected ? 'bg-amber-400' : 'bg-amber-400 animate-pulse'
            }`}
            title={chat.wsConnected ? 'Live link' : chat.transport === 'idle' ? 'Resting — reconnects when you’re back' : chat.connected ? 'Backup link — reconnecting' : 'Connecting…'}
            aria-hidden
          />
          <span className="truncate opacity-70">{firstName} · Companion</span>
        </div>
        <button className="mobile-wordmark" onClick={() => navigateDashboard('Dashboard')}>ATHENA</button>
        <div className="flex items-center gap-2">
          {view === 'chat' && <button className="briefing-trigger" onClick={() => setBriefing(true)}>▦ <span>Daily briefing</span></button>}
          {/* Up whenever the camera is actually open, including for a look she
              asked for herself. A borrowed camera nobody can see being borrowed
              is the thing that would make this indefensible. */}
          {(sight.enabled || sight.cameraLive || sight.athenaLooking) && (
            <button
              className="topbar-notifications"
              onClick={() => openPanel('camera')}
              aria-label={
                sight.athenaLooking
                  ? `Athena is taking a look — ${sight.athenaLooking.reason ?? 'no reason given'}`
                  : 'Athena can see — open camera controls'
              }
              title={
                sight.athenaLooking
                  ? sight.athenaLooking.reason ?? 'Athena is taking a look'
                  : sight.busy
                    ? 'Looking now'
                    : 'Athena can see'
              }
            >
              <span className={sight.busy || sight.athenaLooking ? 'animate-pulse' : ''} aria-hidden>
                👁️
              </span>
            </button>
          )}
          <BrainPill status={brain} onClick={() => openPanel('brain')} />
          {/* The Notifications card's counterpart. The dot is the whole point:
              a proposal Athena is waiting on should be visible from any screen
              in the app, not only from the dashboard card. */}
          <button
            className="topbar-notifications"
            onClick={() => openPanel('notifications')}
            aria-label={waitingCount ? `Notifications — ${waitingCount} waiting for you` : 'Notifications'}
            title={waitingCount ? `${waitingCount} waiting for you` : 'Nothing waiting for you'}
          >
            <DashboardIcon name="Notifications" bare />
            {waitingCount > 0 && <span className="topbar-badge">{waitingCount > 9 ? '9+' : waitingCount}</span>}
          </button>
        </div>
      </header>

      {/* Above every view: an emergency near home is never on a screen you are
          not looking at. The dashboard home draws it itself, in the slot above
          its cards. */}
      {!(view === 'dashboard' && activeSection === 'Dashboard') && (
        <EmergencyBanner onAsk={askAthena} onPlaces={showPointsOfInterest} pinned={view === 'chat'} />
      )}

      {view === 'dashboard' && <Dashboard section={activeSection} firstName={firstName} onAsk={askAthena} onPanel={openPanel} onPlaces={showPointsOfInterest} onNavigate={navigateDashboard} />}
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
          {!threadUuid && chat.messages.length > 0 && <button type="button" disabled={historyBusy}
            className="w-full py-1 text-xs opacity-60" onClick={() => {
              setHistoryBusy(true); setHistoryError(null);
              if (logRef.current) historyAnchorRef.current = { height: logRef.current.scrollHeight, top: logRef.current.scrollTop };
              void chat.loadHistory().catch(() => { historyAnchorRef.current = null; setHistoryError('Earlier messages could not be loaded. Try again.'); }).finally(() => setHistoryBusy(false));
            }}>{historyBusy ? 'Loading…' : 'Load earlier messages'}</button>}
          {historyError && <p role="status" className="text-xs">{historyError}</p>}
          {chat.messages.length === 0 && chat.ready && !arriving && (
            <p className="py-6 text-center font-mono text-xs opacity-40">
              {voice.isSupported ? 'Tap the mic or type. Ask what she remembers.' : 'Type to talk to Athena. Ask what she remembers.'}
            </p>
          )}
          {threadUuid && (
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-black p-2 text-xs">
              <span>Thread · {chat.messages.find((m) => m.uuid === threadUuid)?.action?.summary || chat.messages.find((m) => m.uuid === threadUuid)?.text.slice(0, 80)}</span>
              <button type="button" onClick={() => setThreadUuid(null)} className="px-2 py-1">Back to chat</button>
            </div>
          )}
          {threadUuid && <button type="button" className="w-full py-1 text-xs opacity-60"
            onClick={() => void chat.loadHistory(threadUuid, true).catch(() => setHistoryError('Earlier replies could not be loaded. Try again.'))}>Load earlier replies</button>}
          {transcript.filter((entry) => {
            if (!threadUuid) return true;
            if (entry.kind === 'message') return entry.uuid === threadUuid || entry.message.reply_to_uuid === threadUuid;
            if (entry.kind === 'action') return chat.messages.some((m) => m.action_uuid === entry.uuid && (m.uuid === threadUuid || m.reply_to_uuid === threadUuid));
            return false;
          }).map((entry, idx) =>
            entry.kind === 'action' ? (
              <div key={entry.uuid} id={`action-${entry.uuid}`} className="flex justify-start">
                <div className="w-full max-w-[85%]">
                  {/* Only an unanswered card folds. It is open at the foot of
                      the conversation, or when reopened from the counter; a
                      folded one cannot be approved without being opened and
                      read first. */}
                  {entry.action.status === 'pending' && idx < lastTalkIdx && openUuid !== entry.uuid ? (
                    <ActionProposalFolded action={entry.action} onOpen={() => setOpenUuid(entry.uuid)} />
                  ) : (
                    <ActionProposal
                      action={entry.action}
                      busy={actions.busyUuid === entry.uuid}
                      onConfirm={() => void actions.confirm(entry.uuid)}
                      onDecline={() => void actions.decline(entry.uuid)}
                      onDismiss={() => actions.dismiss(entry.uuid)}
                      persistent={chat.messages.some((m) => m.action_uuid === entry.uuid)}
                    />
                  )}
                </div>
              </div>
            ) : entry.kind === 'message' ? (
              <div
                key={entry.uuid}
                className={`flex items-start gap-2 ${entry.message.is_human ? 'justify-end' : 'justify-start'}`}
              >
                {!entry.message.is_human && <AthenaAvatar size={32} className="mt-1 shrink-0" />}
                <div className="min-w-0 max-w-[85%]">
                <p
                  className={`whitespace-pre-line break-words rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    entry.message.is_human
                      ? 'bg-emerald-500/20 text-emerald-50'
                      : 'bg-white/5 text-emerald-100'
                  }`}
                >
                  {entry.message.text}
                  <span className="mt-2 block text-[10px] opacity-50">
                    {entry.message.created_at ? new Date(entry.message.created_at).toLocaleString() : ''}
                  </span>
                  {entry.message.lyrics && (
                    <span className="mt-2 block italic text-emerald-200/90">♪ {entry.message.lyrics}</span>
                  )}
                  {!!entry.message.sources?.length && (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {entry.message.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-[12rem] truncate rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200/80 hover:bg-emerald-500/20"
                        >
                          {source.title}
                        </a>
                      ))}
                    </span>
                  )}
                </p>
                <button type="button" className="px-2 py-1 text-xs opacity-60 hover:opacity-100"
                  onClick={() => {
                    setThreadUuid(entry.message.reply_to_uuid || entry.uuid);
                    setHistoryError(null);
                    void chat.loadHistory(entry.message.reply_to_uuid || entry.uuid)
                      .catch(() => setHistoryError('Thread history could not be loaded. Try again.'));
                    window.setTimeout(() => document.getElementById(inputId)?.focus(), 0);
                  }}>
                  {entry.message.reply_to_uuid ? 'View thread' : `Reply in thread${chat.messages.filter((m) => m.reply_to_uuid === entry.uuid).length ? ` · ${chat.messages.filter((m) => m.reply_to_uuid === entry.uuid).length}` : ''}`}
                </button>
                </div>
              </div>
            ) : (
              <div key={entry.uuid} className="flex items-start justify-start gap-2">
                <AthenaAvatar size={32} className="mt-1 shrink-0" />
                {/* Marked as hers-unprompted. Without the marker the person
                    cannot tell what they asked for from what she decided to
                    raise, which is the difference they most want to see. */}
                <div className="min-w-0 max-w-[85%] break-words rounded-2xl border-l-2 border-emerald-400/50 bg-white/5 px-4 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] opacity-40">
                    athena brought this up
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-100">
                    {entry.nudge.text}
                  </p>
                  {entry.nudge.map && (
                    // An emergency alert carries where the calls are: a pin per
                    // call, numbered as they are listed, and the watched rings.
                    <MiniMap
                      className="mt-2"
                      height={160}
                      pins={entry.nudge.map.incidents.map((i, n) => ({
                        latitude: i.latitude,
                        longitude: i.longitude,
                        n: n + 1,
                        serious: i.serious,
                        label: `${i.what} — ${i.where}, ${i.miles} mi`,
                      }))}
                      places={entry.nudge.map.places}
                      zoomable
                    />
                  )}
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
              <p className="max-w-[85%] rounded-2xl bg-white/5 px-4 py-2 text-sm opacity-60">
                {/* Her "let me check your calendar, hmm…" when the server
                    guessed one, so the wait says what she's doing. */}
                {chat.filler ? chat.filler.replace(/[.…\s]+$/, '') : 'Athena is thinking'}
                <span className="animate-caret">…</span>
              </p>
            </div>
          )}
          {voice.listening && voice.interim && (
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm italic opacity-70">{voice.interim}</p>
            </div>
          )}
          {conversation.active && conversation.interim && (
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-emerald-500/10 px-4 py-2 text-sm italic opacity-70">{conversation.interim}</p>
            </div>
          )}

          {/* Approval cards live in the transcript above, after the reply that
              proposed them. Inside the scroller on purpose: a floating card
              over the input is the shape people dismiss by reflex, and this
              is the one thing in the app that must not be dismissed by reflex. */}
        </div>

        <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-emerald-500/10 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="relative shrink-0">
            <button ref={inputToggleRef} type="button"
              onClick={() => setInputOpen((v) => !v)}
              onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setInputOpen(true); } }}
              aria-haspopup="menu" aria-expanded={inputOpen} aria-controls={inputMenuId}
              aria-label="Input options"
              title="Choose how to share with Athena: conversation mode, click to talk, let her see through your camera, or show a photo."
              className="grid h-12 w-12 place-items-center rounded-full border border-emerald-500/40 p-0 text-emerald-200 hover:bg-emerald-500/10 active:scale-95"
            >
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
            {inputOpen && <>
              <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={closeInputMenu} />
              <div ref={inputMenuRef} id={inputMenuId} role="menu" aria-label="Input options"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeInputMenu(); }
                  if (e.key === 'Tab') setInputOpen(false);
                  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                    e.preventDefault();
                    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                    const index = items.indexOf(document.activeElement as HTMLButtonElement);
                    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
                      : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                    items[next]?.focus();
                  }
                }}
                className="absolute bottom-14 left-0 z-50 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-emerald-500/30 bg-[#06131c] shadow-2xl shadow-black"
              >
                <button role="menuitemcheckbox" aria-checked={conversation.active} type="button" disabled={!conversation.isSupported}
                  onClick={() => { closeInputMenu(); voice.stop(); conversation.toggle(); }}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 disabled:opacity-40">
                  <span className="flex justify-between"><span className="flex items-center gap-2"><span aria-hidden className="inline-grid w-5 shrink-0 place-items-center text-lg leading-none">∞</span>Conversation mode</span><span>{conversation.active ? 'On' : 'Off'}</span></span>
                  <span className="mt-1 block text-xs text-emerald-100/50">{conversation.isSupported ? 'Keep the mic on and talk naturally.' : 'Voice input is unavailable in this browser.'}</span>
                </button>
                <button role="menuitemcheckbox" aria-checked={voice.listening} type="button" disabled={!voice.isSupported}
                  onClick={() => { closeInputMenu(); conversation.stop(); voice.toggle(); }}
                  className="w-full border-t border-emerald-500/15 px-4 py-3 text-left text-sm hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 disabled:opacity-40">
                  <span className="flex justify-between"><span className="flex items-center gap-2"><span aria-hidden className="inline-grid w-5 shrink-0 place-items-center">🎤</span>Click to talk</span><span>{voice.listening ? 'Listening' : ''}</span></span>
                  <span className="mt-1 block text-xs text-emerald-100/50">{voice.isSupported ? 'Speak one message, then the mic closes.' : 'Voice input is unavailable in this browser.'}</span>
                </button>
                <button role="menuitem" type="button" onClick={() => { closeInputMenu(); openPanel('camera'); }}
                  className="w-full border-t border-emerald-500/15 px-4 py-3 text-left text-sm hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10">
                  <span className="flex justify-between"><span className="flex items-center gap-2"><span aria-hidden className="inline-grid w-5 shrink-0 place-items-center">👁️</span>Let her see</span><span>{sight.enabled ? 'On' : ''}</span></span>
                  <span className="mt-1 block text-xs text-emerald-100/50">Manage camera access and occasional looks.</span>
                </button>
                <button role="menuitem" type="button" onClick={() => { closeInputMenu(); openPanel('photo'); }}
                  className="w-full border-t border-emerald-500/15 px-4 py-3 text-left text-sm hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10">
                  <span className="flex items-center gap-2"><span aria-hidden className="inline-grid w-5 shrink-0 place-items-center">🖼️</span>Show a photo</span>
                  <span className="mt-1 block text-xs text-emerald-100/50">Choose or take a photo for Athena to look at.</span>
                </button>
              </div>
            </>}
          </div>
          <label htmlFor={inputId} className="sr-only">
            Message Athena
          </label>
          <div className="relative min-w-0 flex-1">
            <input
              id={inputId}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE))}
              placeholder={threadUuid ? 'Reply in this thread…' : conversation.active ? 'conversation on: just talk…' : voice.listening ? 'listening…' : 'Tell Athena…'}
              autoComplete="off"
              className={`h-12 w-full rounded-full bg-white/5 pl-4 text-base outline-none placeholder:opacity-40 focus:bg-white/10 ${
                foldedCards.length ? 'pr-16' : 'pr-4'
              }`}
            />
            {/* Unanswered approvals that scrolled out of the open. Each tap
                opens the next one up and scrolls to it; past the oldest it
                starts again from the newest. */}
            {foldedCards.length > 0 && (
              <button
                type="button"
                onClick={showNextCard}
                aria-label={`${foldedCards.length} approval${foldedCards.length === 1 ? '' : 's'} waiting above. Show the next one`}
                className="absolute right-2 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/20 px-2.5 font-mono text-xs tabular-nums text-emerald-100 active:scale-95"
              >
                {foldedCards.length}
                <span aria-hidden>↑</span>
              </button>
            )}
          </div>
          <button type="submit" disabled={!draft.trim()} className="h-12 shrink-0 rounded-full bg-emerald-500/80 px-5 font-semibold text-black active:scale-95 disabled:opacity-30">
            Send
          </button>
        </form>
        {(conversation.active || voice.listening || sight.enabled || sight.cameraLive || sight.athenaLooking) && (
          <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 text-[11px] text-emerald-200/70">
            {conversation.active && <button type="button" onClick={conversation.stop} title="Stop conversation mode" className="flex items-center gap-1.5 hover:text-emerald-100">
              <span aria-hidden className={conversation.hearing ? 'h-1.5 w-1.5 rounded-full bg-emerald-300 ring-2 ring-emerald-300/30' : 'h-1.5 w-1.5 rounded-full bg-emerald-300'} />
              Conversation on <span aria-hidden>×</span>
            </button>}
            {voice.listening && <button type="button" onClick={voice.stop} title="Stop voice input" className="flex items-center gap-1.5 hover:text-emerald-100">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Listening <span aria-hidden>×</span>
            </button>}
            {(sight.enabled || sight.cameraLive || sight.athenaLooking) && <button type="button" onClick={() => openPanel('camera')} title="Open camera controls" className="flex items-center gap-1.5 hover:text-emerald-100">
              <span aria-hidden>👁</span> {sight.athenaLooking ? 'Athena is taking a look' : sight.enabled ? 'Let her see on' : 'Camera open'}
            </button>}
          </div>
        )}
        {voice.error && <p className="px-4 pb-2 text-center text-xs text-red-300">{voice.error}</p>}
        {conversation.error && <p className="px-4 pb-2 text-center text-xs text-red-300">{conversation.error}</p>}
      </section>

      </div>
      </div>
      {sight.athenaLooking && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-emerald-500/90 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-black"
        >
          <span aria-hidden>👁️</span>
          Athena is taking a look — {sight.athenaLooking.reason ?? 'no reason given'}
          <button onClick={() => openPanel('camera')} className="underline underline-offset-2">
            manage
          </button>
        </div>
      )}
      {/* The element frames are actually taken from. Present whether or not
          the drawer is open, and 1px rather than display:none because a video
          a browser considers invisible is one it may stop decoding. */}
      <video
        ref={sight.hiddenVideoRef}
        muted
        playsInline
        aria-hidden
        tabIndex={-1}
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', bottom: 0, left: 0 }}
      />
      <nav className="mobile-navigation" aria-label="Mobile navigation">
        <button data-menu-toggle className={view === 'dashboard' || sectionsOpen ? 'active' : ''} aria-expanded={sectionsOpen} aria-haspopup="menu" onClick={() => { setMenuOpen(false); setSectionsOpen(v => !v); }}><DashboardIcon name="Dashboard" /><span>Dashboards</span></button>
        <button className={view === 'chat' ? 'active' : ''} onClick={() => navigate('/chat')}><DashboardIcon name="Chat" /><span>Chat</span></button>
        <button className="mobile-athena" aria-label="Talk to Athena" onClick={() => navigate('/chat')}><AthenaAvatar /></button>
        <button className="mobile-notifications" onClick={() => openPanel('notifications')}><DashboardIcon name="Notifications" /><span>Alerts</span>{waitingCount > 0 && <i className="topbar-badge">{waitingCount > 9 ? '9+' : waitingCount}</i>}</button>
        <button data-menu-toggle aria-expanded={menuOpen} onClick={() => { setSectionsOpen(false); setMenuOpen(v => !v); }}><DashboardIcon name="More" /><span>More</span></button>
      </nav>

      {/* "Dashboards" on the phone: the same pages, in the same order, as the
          desktop left nav — which the phone hides. Before this the only way to
          most of them was a card's "View …" button on the Dashboard. */}
      <div className={`athena-menu-backdrop ${sectionsOpen ? 'open' : ''}`} onClick={() => setSectionsOpen(false)} aria-hidden />
      <div ref={sectionsRef} className={`athena-menu athena-sections-menu ${sectionsOpen ? 'open' : ''}`} role="menu" aria-label="Dashboards" aria-hidden={!sectionsOpen} {...(sectionsOpen ? {} : { inert: '' as unknown as boolean })}>
        <div className="athena-menu-items">
          {dashboardSections.map((section, i) => (
            <button
              key={section}
              role="menuitem"
              className={view === 'dashboard' && navSection === section ? 'active' : ''}
              aria-current={view === 'dashboard' && navSection === section ? 'page' : undefined}
              onClick={() => navigateDashboard(section)}
              style={{ transitionDelay: `${sectionsOpen ? 30 + i * 22 : 0}ms` }}
            >
              <DashboardIcon name={section} /><span>{section}</span>
            </button>
          ))}
        </div>
      </div>

      {/* One menu for the whole app, opened from the account row on desktop
          and from "More" on mobile. Kept mounted so it can animate out, and
          inert while closed so nothing inside it is tabbable. */}
      <div className={`athena-menu-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden />
      <div ref={menuRef} className={`athena-menu ${menuOpen ? 'open' : ''}`} role="menu" aria-hidden={!menuOpen} {...(menuOpen ? {} : { inert: '' as unknown as boolean })}>
        <div className="athena-menu-head">
          <ProfileAvatar picture={user?.picture} name={firstName} />
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
      {briefing && <Drawer eyebrow="Athena" title="Your daily briefing" onClose={() => setBriefing(false)}><Dashboard compact firstName={firstName} onAsk={askAthena} onPanel={(p, options) => { setBriefing(false); openPanel(p, options); }} onExpand={() => { setBriefing(false); navigateDashboard('Dashboard'); }} /></Drawer>}

      {panel === 'memory' && <MemoryPanel onClose={() => setPanel(null)} />}
      {panel === 'photo' && <PhotoMemory onClose={() => setPanel(null)} onTalkAbout={talkAboutPhoto} />}
      {panel === 'camera' && <CameraPanel sight={sight} onClose={() => setPanel(null)} onTalkAbout={talkAboutScene} />}
      {panel === 'brain' && <BrainPanel onClose={() => setPanel(null)} />}
      {panel === 'devices' && <DevicesPanel onClose={() => setPanel(null)} />}
      {panel === 'actions' && <ActionsPanel onClose={() => setPanel(null)} />}
      {panel === 'notifications' && (
        <NotificationsPanel
          actions={actions}
          questions={dreamQuestions.questions}
          inbox={inbox.waiting}
          recent={inbox.recent}
          onAck={inbox.ack}
          onAckAll={inbox.ackAll}
          onOpenLink={(url: string) => { setPanel(null); navigate(url); }}
          onAnswer={() => { setPanel(null); askAthena('You had a question for me from your dreaming — go ahead and ask.'); }}
          onDismiss={dreamQuestions.dismiss}
          onOpenActions={() => openPanel('actions')}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'knows' && <KnowsPanel onClose={() => setPanel(null)} onOpen={p => openPanel(p)} />}
      {panel === 'initiative' && <InitiativePanel onClose={() => setPanel(null)} />}
      {panel === 'local' && <LocalServerPanel onClose={() => setPanel(null)} />}
      {panel === 'integrations' && (
        <IntegrationsPanel
          callback={integrationCallback}
          askConsentFor={consentFor}
          onClose={() => {
            setIntegrationCallback(null);
            setConsentFor(null);
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}
