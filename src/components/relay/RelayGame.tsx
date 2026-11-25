import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AthenaAvatar } from '../AthenaAvatar';
import { kidSound } from '../../api/kid';
import { relayRuns } from '../../api/relay';
import {
  BOUNCE_MS, START_DOT_MS, adapt, check, choicesFor, classify, decode, encode, letterGapMs, MORSE,
  pickIncoming, pickMessages, settleMs, wordGapMs, wpm, type Sym,
} from './morse';
import { LINES, useRelayVoice, type LineId } from './lines';
import { LevelUpBanner, XpBar, useGameXp } from '../games/GameXp';
import { comboBonus, levels, standing, xpStore } from '../games/progress';
import { MAX_SECRET, relayMessages, type RelayMessage, type RelayPerson } from '../../api/relayMessages';
import './relay.css';

/**
 * Signal Relay (owner, 11-24): the Guardians' mini-game for when the network
 * goes down on a road trip, or when the kids are just bored. Athena's signal
 * is fading; each message a kid taps to her in real Morse code brings back a
 * bar, and her name locks the link. Everything runs on the tablet: the code,
 * the tone, her recorded lines and the score. A finished run is kept here and
 * sent to their Guardian record when Base answers again (api/relay.ts).
 *
 * One key: a short press is a dot, a long one a dash, and the timing follows
 * each kid's own rhythm (morse.ts). Space bar works as the key too.
 *
 * Levels (owner, 11-25 — "they quickly got bored"): every letter, message and
 * run earns relay XP (games/progress.ts, kept on the tablet), with a combo
 * bonus for streaks and double letter XP with the dots hidden. A kid's level
 * decides the run: more and longer words as they climb, and from level 3 an
 * Incoming round where Athena blinks a word on her lamp and the kid decodes it.
 * Guardian XP is separate and unchanged (XP_PER_RUN below, sent to Base).
 *
 * Secret messages (owner, 11-25): ✉️ opens the mailbox. A player taps a message
 * in Morse (like Free key) and sends it to anyone else with Athena access; the
 * other person's game shows it as an Incoming round from them, decoded letter
 * by letter. Sending and the log are in api/relayMessages.ts.
 */

type Phase = 'intro' | 'teach-dot' | 'teach-dash' | 'send' | 'incoming' | 'restored' | 'free' | 'mail' | 'compose' | 'secret-done';
export type RelayReason = 'lost' | 'bored' | 'message';

const BARS = 5;
const TONE_HZ = 620;
// One authored hint (owner chose it, 11-24; see the athena-hint-of-sentience
// rule): once per Guardian per tablet, after the link is back, her lamp blinks
// a word nobody asked for. No caption, no letters, no effect on the game.
const HINT_WORD = 'STARS';
const HINT_UNIT_MS = 210;
const MISS_LINE_GAP_MS = 9000;
const PREFIX_WAIT_MS = 1800;
const XP_PER_RUN = 5;
const XP_RUNS_PER_DAY = 2;

// Relay XP (game levels, not Guardian XP).
const XP_LETTER = 2;
const XP_MESSAGE = 5;
const XP_CLEAN = 5;
const XP_DECODE = 4;
const XP_RUN = 15;
const INCOMING_UNIT_MS = 260;
const XP_SECRET_SENT = 5;
const XP_SECRET_SENT_PER_DAY = 5;
const XP_SECRET_READ = 10;
export const RELAY_LEVELS = levels(
  ['Rookie Ranger', 'Spark Cadet', 'Beacon Keeper', 'Signal Scout', 'Wave Rider', 'Code Breaker', 'Night Operator', 'Storm Caller',
    'Relay Captain', 'Star Signaler', 'Sky Commander', 'Comet Chief', 'Galaxy Guide', 'Legend of the Line', 'Master Operator'],
  {
    2: 'Longer runs',
    3: 'Incoming! Decode messages from Athena',
    4: '4-letter words',
    5: '5-letter words',
    6: 'Longer Incoming messages',
    7: '6-letter words',
    9: 'Expert runs',
  },
);

// v2 (owner, 11-25): a fresh start after the owner's testing, so every kid gets
// the dot/dash lesson and today's points again. Matches api/relay.ts.
const trainedKey = (who: string) => `relay_trained_v2:${who}`;
const hintKey = (who: string) => `relay_hint_v2:${who}`;
const hintsKey = 'relay_show_code';
const today = () => new Date().toISOString().slice(0, 10);
const dayKey = (who: string) => `relay_day_v2:${who}:${today()}`;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* fine for this visit */ } },
};

interface TapeMark { id: number; sym: Sym | ' '; tone: 'ok' | 'bad' | 'free' | 'in' }
interface Ripple { id: number; dash: boolean }

/** The key's tone: one oscillator, gated with a short ramp so it never clicks. */
function useTone() {
  const ctx = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const ensure = () => {
    if (ctx.current) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = new Ctx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = TONE_HZ;
      g.gain.value = 0;
      o.connect(g).connect(c.destination);
      o.start();
      ctx.current = c;
      gain.current = g;
    } catch { /* no audio on this tablet: the lamp and tape still show it */ }
  };
  const set = (on: boolean) => {
    if (on) ensure();
    const c = ctx.current; const g = gain.current;
    if (!c || !g) return;
    if (c.state === 'suspended') void c.resume();
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(on && kidSound.on() ? 0.22 : 0, t + 0.006);
  };
  /** A little arpeggio for a finished message, a bigger one for the link. */
  const chord = (notes: number[], step = 0.09) => {
    ensure();
    const c = ctx.current;
    if (!c || !kidSound.on()) return;
    notes.forEach((f, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t = c.currentTime + i * step;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.45);
    });
  };
  const buzz = () => {
    ensure();
    const c = ctx.current;
    if (!c || !kidSound.on()) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(190, c.currentTime); o.frequency.exponentialRampToValueAtTime(110, c.currentTime + 0.22);
    g.gain.setValueAtTime(0.06, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.25);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.26);
  };
  useEffect(() => () => { void ctx.current?.close(); }, []);
  return { set, chord, buzz };
}

const vibrate = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* no motor */ } };

export function RelayGame({ who, reason, online, onClose, secrets = [], onDecoded }: {
  /** The signed-in profile, for this kid's own progress on a shared tablet. */
  who: string;
  reason: RelayReason;
  /** Whether Base answers right now; a 'lost' game greets the signal coming back. */
  online: boolean;
  onClose: () => void;
  /** Secret messages waiting for this player (api/relayMessages.ts useRelayInbox). */
  secrets?: RelayMessage[];
  onDecoded?: (uuid: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [signal, setSignal] = useState(BARS);
  const [caption, setCaption] = useState<LineId | null>(null);
  const [aside, setAside] = useState<string | null>(null);
  const xpGame = useGameXp('relay', who, RELAY_LEVELS);
  const award = xpGame.add;
  const startLevel = useRef(standing(xpStore.get('relay', who), RELAY_LEVELS).level.level);
  const [messages, setMessages] = useState(() => pickMessages(startLevel.current));
  const [inWord, setInWord] = useState(() => pickIncoming(startLevel.current));
  const [inLetter, setInLetter] = useState(0);
  const [inChoices, setInChoices] = useState<string[]>([]);
  const [inWrong, setInWrong] = useState<string[]>([]);
  const [inPlaying, setInPlaying] = useState(false);
  const inDone = useRef(false);
  // What an Incoming round is decoding: the run's word from Athena, or a secret message.
  const [dWord, setDWord] = useState('');
  const [secret, setSecret] = useState<RelayMessage | null>(null);
  const [people, setPeople] = useState<RelayPerson[] | null>(null);
  const [writeTo, setWriteTo] = useState<RelayPerson | null>(null);
  const [mailNote, setMailNote] = useState<string | null>(null);
  const streak = useRef(0);
  const msgMisses = useRef(0);
  const [comboShow, setComboShow] = useState(0);
  const [msg, setMsg] = useState(0);
  const [letter, setLetter] = useState(0);
  const [sent, setSentState] = useState('');
  // The letter being keyed, read by timers that outlive a render.
  const sentRef = useRef('');
  const setSent = useCallback((v: string) => { sentRef.current = v; setSentState(v); }, []);
  const [missFlash, setMissFlash] = useState<{ n: number; got: string | null } | null>(null);
  const [popped, setPopped] = useState(0);
  const [wave, setWave] = useState(0);
  const [tape, setTape] = useState<TapeMark[]>([]);
  const [pressing, setPressing] = useState(false);
  const [held, setHeld] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [lamp, setLamp] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [showCode, setShowCode] = useState(() => store.get(hintsKey) !== 'off');
  const [book, setBook] = useState(false);
  const [sound, setSound] = useState(kidSound.on());
  const [backOnline, setBackOnline] = useState(false);
  const [saved, setSaved] = useState<'xp' | 'kept' | null>(null);

  const tone = useTone();
  const voice = useRelayVoice(setCaption);
  const dot = useRef(START_DOT_MS);
  const downAt = useRef<number | null>(null);
  const gapTimer = useRef(0);
  const wordTimer = useRef(0);
  const markId = useRef(0);
  const lastMissLine = useRef(0);
  const misses = useRef(0);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); window.clearTimeout(gapTimer.current); window.clearTimeout(wordTimer.current); }, []);

  const word = messages[msg] || '';
  const patterns = useMemo(() => encode(word), [word]);
  const target = patterns[letter] || '';
  const trained = store.get(trainedKey(who)) === 'yes';

  const mark = useCallback((sym: Sym | ' ', t: TapeMark['tone']) => {
    markId.current += 1;
    const id = markId.current;
    setTape(xs => [...xs.slice(-30), { id, sym, tone: t }]);
  }, []);

  // ── The opening: her bars fall away, then she asks for help. ──────────────
  useEffect(() => {
    if (reason === 'message') { setSignal(3); setPhase('mail'); return; }
    const drops = [BARS - 1, BARS - 2, BARS - 3, 1];
    drops.forEach((b, i) => later(() => { setSignal(b); vibrate(12); }, 350 + i * 380));
    later(() => {
      voice.say(reason === 'lost' ? 'lost-1' : 'bored-1');
      voice.say('intro-1', () => {
        if (trained) { setPhase('send'); voice.say('first-msg'); }
        else { setPhase('teach-dot'); voice.say('teach-dot'); }
      });
    }, 350 + drops.length * 380 + 200);
    // Once, on open; `trained` and `reason` are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── The real signal came back during a 'lost' game. ───────────────────────
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && reason === 'lost' && phase !== 'restored') {
      setBackOnline(true);
      voice.say('online');
    }
    wasOnline.current = online;
  }, [online, reason, phase, voice]);

  // A run that was kept while offline goes out as soon as Base answers.
  useEffect(() => { if (online) void relayRuns.send(who); }, [online, who]);

  const miss = useCallback((got: string) => {
    misses.current += 1;
    msgMisses.current += 1;
    streak.current = 0;
    setComboShow(0);
    setMissFlash({ n: Date.now(), got: decode(got) });
    setSent('');
    tone.buzz();
    vibrate([30, 40, 30]);
    const now = Date.now();
    if (now - lastMissLine.current > MISS_LINE_GAP_MS && misses.current >= 2) {
      lastMissLine.current = now;
      voice.say(misses.current % 2 ? 'miss-2' : 'miss-1');
    }
  }, [tone, voice, setSent]);

  const finishRun = useCallback(() => {
    later(() => award(XP_RUN, 'link restored'), 1200);
    setPhase('restored');
    setSignal(BARS);
    setWave(w => w + 1);
    tone.chord([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.1);
    vibrate([40, 60, 40, 60, 120]);
    const earned = Number(store.get(dayKey(who)) || 0);
    store.set(dayKey(who), String(earned + 1));
    relayRuns.keep(who, { messages: messages.length, wpm: wpm(dot.current) });
    setSaved(earned < XP_RUNS_PER_DAY ? 'xp' : 'kept');
    void relayRuns.send(who);
    voice.say('restored');
    voice.say('thanks', () => {
      if (store.get(hintKey(who))) return;
      store.set(hintKey(who), new Date().toISOString());
      later(() => blinkHint(), 2200);
    });
    // blinkHint is stable for the game's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, tone, voice, who, later, award]);

  const letterDone = useCallback(() => {
    misses.current = 0;
    streak.current += 1;
    setComboShow(streak.current);
    award(showCode ? XP_LETTER : XP_LETTER * 2, showCode ? undefined : '🙈');
    const bonus = comboBonus(streak.current);
    if (bonus) later(() => award(bonus, `combo ×${streak.current}`), 350);
    setPopped(p => p + 1);
    setSent('');
    vibrate(20);
    tone.chord([880, 1174.7], 0.06);
    if (letter + 1 < patterns.length) { setLetter(letter + 1); return; }
    // The whole message went through: one more bar.
    const nextMsg = msg + 1;
    setWave(w => w + 1);
    later(() => award(XP_MESSAGE + (msgMisses.current ? 0 : XP_CLEAN), msgMisses.current ? 'message' : 'clean!'), 700);
    msgMisses.current = 0;
    if (nextMsg >= messages.length) { finishRun(); return; }
    setSignal(s => Math.min(BARS - 1, Math.max(s, 1) + 1));
    tone.chord([587.33, 739.99, 880], 0.08);
    // Before her name, a level-3+ run has Athena send one to the kid.
    if (nextMsg === messages.length - 1 && inWord && !inDone.current) {
      later(() => startIncoming(), 900);
      return;
    }
    later(() => { setMsg(nextMsg); setLetter(0); }, 650);
    if (nextMsg === messages.length - 1) voice.say('almost');
    else voice.say((['good-1', 'good-2', 'good-3', 'good-4'] as const)[msg % 4]);
    // startIncoming is stable for the game's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter, patterns.length, msg, messages.length, finishRun, tone, voice, later, setSent, award, showCode, inWord]);

  /** A finished dot or dash, read against whatever the game is asking for. */
  const onSymbol = useCallback((sym: Sym) => {
    window.clearTimeout(gapTimer.current);
    window.clearTimeout(wordTimer.current);
    if (phase === 'teach-dot' || phase === 'teach-dash') {
      const want: Sym = phase === 'teach-dot' ? '.' : '-';
      mark(sym, sym === want ? 'ok' : 'bad');
      if (sym !== want) { setAside(want === '.' ? 'That was a dash. Quicker!' : 'That was a dot. Hold it longer!'); tone.buzz(); return; }
      setAside(null);
      tone.chord([880, 1174.7], 0.06);
      setPopped(p => p + 1);
      if (phase === 'teach-dot') { setPhase('teach-dash'); voice.say('teach-dash'); }
      else { store.set(trainedKey(who), 'yes'); setSignal(2); setWave(w => w + 1); setPhase('send'); voice.say('teach-ready'); }
      return;
    }
    if (phase === 'free' || (phase === 'compose' && writeTo)) {
      mark(sym, 'free');
      const next = sentRef.current + sym;
      setSent(next);
      gapTimer.current = window.setTimeout(() => {
        const ch = decode(next);
        setFreeText(t => (phase === 'compose' ? (ch ? `${t}${ch}`.slice(0, MAX_SECRET) : t) : (t + (ch || '?')).slice(-36)));
        setSent('');
        if (ch) setPopped(p => p + 1);
        wordTimer.current = window.setTimeout(() => {
          setFreeText(t => (t.endsWith(' ') || !t || t.length >= (phase === 'compose' ? MAX_SECRET : 99) ? t : `${t} `));
          mark(' ', 'free');
        }, wordGapMs(dot.current) - letterGapMs(dot.current));
      }, letterGapMs(dot.current));
      return;
    }
    if (phase !== 'send' || !target) return;
    const next = sentRef.current + sym;
    const verdict = check(next, target);
    mark(sym, verdict === 'wrong' ? 'bad' : 'ok');
    if (verdict === 'wrong') { miss(next); return; }
    setSent(next);
    if (verdict === 'match') gapTimer.current = window.setTimeout(letterDone, settleMs(dot.current));
    // Partway through the right letter: a kid checking the code book gets longer
    // than a real letter gap before the pause counts as a finished (wrong) letter.
    else gapTimer.current = window.setTimeout(() => miss(next), Math.max(PREFIX_WAIT_MS, letterGapMs(dot.current) * 2.2));
  }, [phase, target, setSent, mark, miss, letterDone, tone, voice, who, writeTo]);

  const symbolRef = useRef(onSymbol);
  symbolRef.current = onSymbol;

  // ── The key itself ─────────────────────────────────────────────────────────
  const keyDown = useCallback(() => {
    if (downAt.current !== null) return;
    window.clearTimeout(gapTimer.current);
    window.clearTimeout(wordTimer.current);
    downAt.current = performance.now();
    setPressing(true);
    setLamp(true);
    tone.set(true);
    vibrate(10);
  }, [tone]);

  const keyUp = useCallback(() => {
    if (downAt.current === null) return;
    const ms = performance.now() - downAt.current;
    downAt.current = null;
    setPressing(false);
    setLamp(false);
    setHeld(0);
    tone.set(false);
    if (ms < BOUNCE_MS) return;
    const sym = classify(ms, dot.current);
    dot.current = adapt(dot.current, ms, sym);
    markId.current += 1;
    const id = markId.current;
    setRipples(r => [...r.slice(-5), { id, dash: sym === '-' }]);
    later(() => setRipples(r => r.filter(x => x.id !== id)), 700);
    symbolRef.current(sym);
  }, [tone, later]);

  // While held, the live mark on the tape grows and turns into a dash.
  useEffect(() => {
    if (!pressing) return;
    let raf = 0;
    const tick = () => { if (downAt.current !== null) setHeld(performance.now() - downAt.current); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pressing]);

  // Space bar is a key too (and Escape closes the code book).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { setBook(false); return; }
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault(); keyDown();
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); keyUp(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', keyUp);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', keyUp); };
  }, [keyDown, keyUp]);

  // ── Incoming: Athena blinks a word, one letter at a time; the kid decodes it.
  const blinkLetter = (ch: string) => {
    setInPlaying(true);
    const p = MORSE[ch] || '';
    let t = 250;
    p.split('').forEach(s => {
      const len = (s === '.' ? 1 : 3) * INCOMING_UNIT_MS;
      later(() => { setLamp(true); tone.set(true); mark(s as Sym, 'in'); }, t);
      later(() => { setLamp(false); tone.set(false); }, t + len);
      t += len + INCOMING_UNIT_MS;
    });
    later(() => { setInPlaying(false); mark(' ', 'in'); }, t);
  };
  const startIncoming = (w: string | null = inWord, from: RelayMessage | null = null) => {
    if (!w) return;
    setDWord(w);
    setSecret(from);
    setPhase('incoming');
    setTape([]);
    setInLetter(0);
    setInWrong([]);
    setInChoices(choicesFor(w[0]));
    setSignal(s => Math.min(BARS - 1, Math.max(s, 1) + 1));
    later(() => blinkLetter(w[0]), 700);
  };
  const pickLetter = (ch: string) => {
    if (!dWord || inPlaying) return;
    const want = dWord[inLetter];
    if (ch !== want) {
      setInWrong(w => [...w, ch]);
      streak.current = 0;
      setComboShow(0);
      tone.buzz();
      vibrate([30, 40, 30]);
      return;
    }
    const firstTry = inWrong.length === 0;
    streak.current += 1;
    setComboShow(streak.current);
    award(XP_DECODE + (firstTry ? 2 : 0), firstTry ? 'decoded!' : undefined);
    const bonus = comboBonus(streak.current);
    if (bonus) later(() => award(bonus, `combo ×${streak.current}`), 350);
    tone.chord([880, 1174.7], 0.06);
    vibrate(20);
    setPopped(p => p + 1);
    // A space in a secret message is a word gap: skip it.
    let next = inLetter + 1;
    while (dWord[next] === ' ') next += 1;
    if (next < dWord.length) {
      later(() => { setInLetter(next); setInWrong([]); setInChoices(choicesFor(dWord[next])); setTape([]); blinkLetter(dWord[next]); }, 700);
      return;
    }
    setWave(w => w + 1);
    if (secret) {
      // A friend's message: show it whole, and tell the server it was read.
      tone.chord([523.25, 659.25, 783.99, 1046.5], 0.09);
      later(() => award(XP_SECRET_READ, 'secret decoded'), 500);
      onDecoded?.(secret.uuid);
      later(() => { setInLetter(dWord.length); setPhase('secret-done'); }, 900);
      return;
    }
    // The whole word: on to her name.
    inDone.current = true;
    tone.chord([587.33, 739.99, 880], 0.08);
    later(() => award(XP_MESSAGE, 'message read'), 500);
    later(() => { setPhase('send'); setTape([]); setMsg(messages.length - 1); setLetter(0); voice.say('almost'); }, 1900);
  };

  // ── Secret messages ───────────────────────────────────────────────────────
  const openMail = () => { setPhase('mail'); setMailNote(null); setWriteTo(null); setSent(''); setFreeText(''); setTape([]); };
  const compose = (to: RelayPerson | null = null) => {
    setPhase('compose'); setWriteTo(to); setSent(''); setFreeText(''); setTape([]); setMailNote(null);
    if (!people) void relayMessages.people(who).then(setPeople);
  };
  const sendSecret = async () => {
    const body = freeText.replace(/[^A-Z0-9 ]/g, '').replace(/ +/g, ' ').trim();
    if (!writeTo || !body) return;
    relayMessages.queue(who, writeTo, body);
    const dayXp = `relay_secret_xp_v1:${who}:${today()}`;
    const earned = Number(store.get(dayXp) || 0);
    if (earned < XP_SECRET_SENT_PER_DAY) { store.set(dayXp, String(earned + 1)); award(XP_SECRET_SENT, 'sent'); }
    tone.chord([659.25, 880, 1318.5], 0.08);
    vibrate([20, 40, 20]);
    const sentNow = await relayMessages.flush(who);
    setMailNote(sentNow ? `✉️ Sent to ${writeTo.name}! They'll decode it in Signal Relay.` : `✉️ Saved on this tablet. It goes to ${writeTo.name} when the signal's back.`);
    setPhase('mail'); setWriteTo(null); setFreeText(''); setSent(''); setTape([]);
  };
  const backFromMail = () => { if (reason === 'message') onClose(); else again(); };

  // ── Her reply on the lamp: the one hint, blinked in real Morse. ───────────
  const blinkHint = () => {
    setIncoming(true);
    let t = 0;
    encode(HINT_WORD).forEach((p, li) => {
      p.split('').forEach((s, si) => {
        const len = (s === '.' ? 1 : 3) * HINT_UNIT_MS;
        later(() => { setLamp(true); mark(s as Sym, 'in'); }, t);
        later(() => setLamp(false), t + len);
        t += len + (si < p.length - 1 ? HINT_UNIT_MS : 0);
      });
      if (li < HINT_WORD.length - 1) t += HINT_UNIT_MS * 3;
    });
    later(() => setIncoming(false), t + 1200);
  };

  const again = () => {
    const lvl = xpGame.st.level.level;
    setMessages(pickMessages(lvl)); setInWord(pickIncoming(lvl)); inDone.current = false; xpGame.resetRun();
    streak.current = 0; msgMisses.current = 0; setComboShow(0);
    setMsg(0); setLetter(0); setSent(''); setSaved(null);
    setSignal(2); setPhase('send'); setTape([]); setFreeText(''); voice.say('first-msg');
  };
  const free = () => { setPhase('free'); setSent(''); setFreeText(''); setTape([]); voice.say('free'); };
  const toggleSound = () => { const on = !sound; kidSound.set(on); setSound(on); };
  const toggleCode = () => { const on = !showCode; store.set(hintsKey, on ? 'on' : 'off'); setShowCode(on); };

  const heldUnits = held / dot.current;
  const liveDash = heldUnits >= 2;
  const weak = 1 - signal / BARS;
  const total = messages.length + (inWord ? 1 : 0);
  const at = msg + 1 + (inWord && (inDone.current || phase === 'incoming') && msg >= messages.length - 1 ? 1 : 0);
  const stage = phase === 'mail' ? 'Secret messages' : phase === 'compose' ? (writeTo ? `To ${writeTo.name}` : 'Write a secret message') : phase === 'secret-done' ? 'Message decoded' : phase === 'incoming' && secret ? `Secret from ${secret.from}` : phase === 'send' ? `Message ${at} of ${total}` : phase === 'incoming' ? `Incoming! ${messages.length} of ${total}` : phase === 'free' ? 'Free key' : phase === 'restored' ? 'Link restored' : phase === 'intro' ? 'Signal fading' : 'Learn the key';

  // A portal, so the game covers the whole screen even inside the adult
  // workspace, whose layout would otherwise box a fixed element in.
  return createPortal(
    <div className={`relay relay-phase-${phase}${signal >= BARS ? ' relay-full' : ''}`} style={{ ['--weak' as string]: weak.toFixed(2) }} role="dialog" aria-label="Signal Relay">
      <div className="relay-sky" aria-hidden><i /><i /><i /></div>
      <div className="relay-road" aria-hidden />
      <div className="relay-noise" aria-hidden />

      <header className="relay-top">
        <div className="relay-bars" aria-label={`Signal ${signal} of ${BARS}`}>
          {Array.from({ length: BARS }, (_, i) => <i key={i} className={i < signal ? 'on' : ''} style={{ ['--b' as string]: i }} />)}
        </div>
        <div className="relay-title"><b>SIGNAL RELAY</b><small>{stage}</small></div>
        <XpBar xp={xpGame.xp} st={xpGame.st} pops={xpGame.pops} />
        {comboShow >= 3 && <span className="relay-combo" key={comboShow}>🔥 ×{comboShow}</span>}
        <div className="relay-tools">
          <button type="button" className="relay-mail-btn" onClick={openMail} aria-label={secrets.length ? `Secret messages, ${secrets.length} new` : 'Secret messages'}>✉️{secrets.length > 0 && <b>{secrets.length}</b>}</button>
          <button type="button" onClick={() => setBook(true)} aria-label="Code book">📖</button>
          <button type="button" onClick={toggleCode} aria-pressed={showCode} aria-label={showCode ? 'Hide dots and dashes' : 'Show dots and dashes'}>{showCode ? '👀' : '🙈'}</button>
          <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Sound off' : 'Sound on'}>{sound ? '🔊' : '🔇'}</button>
          <button type="button" onClick={onClose} aria-label="Back to Base">✕</button>
        </div>
      </header>

      {backOnline && (
        <div className="relay-online" role="status">
          <span>📶 The real signal's back!</span>
          <button type="button" onClick={() => setBackOnline(false)}>Keep tapping</button>
          <button type="button" onClick={onClose}>Back to Base</button>
        </div>
      )}

      <main className="relay-stage">
        <section className="relay-athena">
          <div className="relay-radar" aria-hidden>
            <i /><i /><i />
            {wave > 0 && <b key={wave} className="relay-wave" />}
          </div>
          <AthenaAvatar className="relay-face" />
          <div className={`relay-lamp${lamp ? ' on' : ''}${incoming ? ' incoming' : ''}`} aria-hidden />
          <p className="relay-caption" aria-live="polite" key={caption || 'none'}>{caption ? LINES[caption] : '…'}</p>
        </section>

        <section className="relay-work">
          {(phase === 'teach-dot' || phase === 'teach-dash') && (
            <div className="relay-teach" key={phase}>
              <div className={`relay-teach-sym ${phase === 'teach-dot' ? 'dot' : 'dash'}`} />
              <h2>{phase === 'teach-dot' ? 'Quick tap = dot' : 'Hold down = dash'}</h2>
              <p>{aside || (phase === 'teach-dot' ? 'Tap the big key once, fast.' : 'Press and hold until the line grows long.')}</p>
            </div>
          )}

          {phase === 'send' && (
            <div className="relay-message" key={msg}>
              <p className="relay-label">Tap this message to Athena</p>
              <ol className="relay-word">
                {word.split('').map((ch, i) => {
                  const state = i < letter ? 'done' : i === letter ? 'now' : 'next';
                  return (
                    <li key={`${i}-${i === letter ? missFlash?.n ?? 0 : 0}`} className={`relay-tile ${state}${i === letter && missFlash ? ' miss' : ''}`}>
                      <b>{ch}</b>
                      {(showCode || i < letter || (i === letter && misses.current >= 2)) && (
                        <span className="relay-pips">
                          {patterns[i].split('').map((s, j) => (
                            <i key={j} className={`${s === '.' ? 'dot' : 'dash'}${i < letter || (i === letter && j < sent.length) ? ' lit' : ''}`} />
                          ))}
                        </span>
                      )}
                      {i === letter && popped > 0 && <em key={popped} className="relay-burst" aria-hidden>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ['--i' as string]: k }} />)}</em>}
                    </li>
                  );
                })}
              </ol>
              {missFlash && <p key={missFlash.n} className="relay-miss">{missFlash.got ? <>That was <b>{missFlash.got}</b>. Try <b>{word[letter]}</b> again!</> : <>Scrambled! Try <b>{word[letter]}</b> again.</>}</p>}
            </div>
          )}

          {phase === 'incoming' && dWord && (
            <div className="relay-message relay-incoming">
              <p className="relay-label">{secret ? `✉️ Secret message from ${secret.from}` : '📡 Incoming! Athena is sending you a message'}</p>
              <ol className={`relay-word${dWord.length > 8 ? ' relay-word-long' : ''}`}>
                {dWord.split('').map((ch, i) => ch === ' ' ? <li key={i} className="relay-gap" aria-hidden /> : (
                  <li key={i} className={`relay-tile ${i < inLetter ? 'done' : i === inLetter ? 'now' : 'next'}`}>
                    <b>{i < inLetter ? ch : '?'}</b>
                    {i === inLetter && popped > 0 && <em key={popped} className="relay-burst" aria-hidden>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ['--i' as string]: k }} />)}</em>}
                  </li>
                ))}
              </ol>
              <p className="relay-in-help">{inPlaying ? 'Watch the lamp…' : 'Which letter did she blink? Read the tape below, or check the 📖 code book.'}</p>
              <div className="relay-choices">
                {inChoices.map(c => (
                  <button key={`${inLetter}-${c}`} type="button" className={`relay-choice${inWrong.includes(c) ? ' wrong' : ''}`} disabled={inPlaying || inWrong.includes(c)} onClick={() => pickLetter(c)}>{c}</button>
                ))}
              </div>
              <button type="button" className="relay-btn" disabled={inPlaying} onClick={() => { setTape([]); blinkLetter(dWord[inLetter]); }}>🔁 Blink it again</button>
            </div>
          )}

          {phase === 'mail' && (
            <div className="relay-mailbox">
              <h2>✉️ Secret messages</h2>
              {mailNote && <p className="relay-mail-note" role="status">{mailNote}</p>}
              {secrets.length ? (
                <ul className="relay-inbox">
                  {secrets.map(m => (
                    <li key={m.uuid}>
                      <button type="button" className="relay-btn primary" onClick={() => startIncoming(m.body, m)}>
                        📡 From {m.from} <small>{m.body.replace(/ /g, '').length} letters · decode it</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="relay-mail-empty">No new secret messages.</p>}
              <div className="relay-win-actions">
                <button type="button" className="relay-btn" onClick={() => compose()}>✍️ Write a secret message</button>
                <button type="button" className="relay-btn" onClick={backFromMail}>{reason === 'message' ? 'Done' : '📡 Back to the relay'}</button>
              </div>
            </div>
          )}

          {phase === 'compose' && !writeTo && (
            <div className="relay-mailbox">
              <h2>Who's it for?</h2>
              {people === null ? <p className="relay-mail-empty">Finding everyone…</p> : people.length ? (
                <ul className="relay-people">
                  {people.map(p => (
                    <li key={p.uuid}>
                      <button type="button" className="relay-person" onClick={() => setWriteTo(p)}>
                        {p.picture ? <img src={p.picture} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden>{p.name[0]}</span>}
                        <b>{p.name}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="relay-mail-empty">No one to write to yet. Connect to the internet once so I can find everyone.</p>}
              <div className="relay-win-actions"><button type="button" className="relay-btn" onClick={openMail}>Back</button></div>
            </div>
          )}

          {phase === 'compose' && writeTo && (
            <div className="relay-free relay-composer">
              <p className="relay-label">Tap your secret message to {writeTo.name}</p>
              <p className="relay-free-text">{freeText || <span>tap the key…</span>}<i className="relay-caret" /></p>
              <p className="relay-free-now">{sent ? <>{sent.split('').map((x, i) => <i key={i} className={x === '.' ? 'dot' : 'dash'} />)} <b>{decode(sent) || '?'}</b></> : `${freeText.length} / ${MAX_SECRET}`}</p>
              <div className="relay-win-actions">
                <button type="button" className="relay-btn" onClick={() => setFreeText(t => t.slice(0, -1).trimEnd())} disabled={!freeText}>⌫ Undo</button>
                <button type="button" className="relay-btn" onClick={() => setFreeText(t => (t && !t.endsWith(' ') && t.length < MAX_SECRET ? `${t} ` : t))} disabled={!freeText}>␣ Space</button>
                <button type="button" className="relay-btn primary" onClick={() => void sendSecret()} disabled={!freeText.trim()}>✉️ Send</button>
                <button type="button" className="relay-btn" onClick={openMail}>Cancel</button>
              </div>
            </div>
          )}

          {phase === 'secret-done' && secret && (
            <div className="relay-win">
              <div className="relay-confetti" aria-hidden>{Array.from({ length: 20 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
              <p className="relay-label">{secret.from} says</p>
              <h2 className="relay-secret-text">{secret.body}</h2>
              <div className="relay-win-actions">
                <button type="button" className="relay-btn primary" onClick={() => { const p = people?.find(x => x.name === secret.from) || null; compose(p); if (!p) void relayMessages.people(who).then(list => { setPeople(list); setWriteTo(list.find(x => x.name === secret.from) || null); }); }}>✍️ Reply</button>
                <button type="button" className="relay-btn" onClick={() => { setSecret(null); openMail(); }}>✉️ Mailbox</button>
              </div>
            </div>
          )}

          {phase === 'free' && (
            <div className="relay-free">
              <p className="relay-label">Athena reads</p>
              <p className="relay-free-text">{freeText || <span>tap anything…</span>}<i className="relay-caret" /></p>
              <p className="relay-free-now">{sent ? <>{sent.split('').map((s, i) => <i key={i} className={s === '.' ? 'dot' : 'dash'} />)} <b>{decode(sent) || '?'}</b></> : ' '}</p>
            </div>
          )}

          {phase === 'restored' && (
            <div className="relay-win">
              <div className="relay-confetti" aria-hidden>{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
              <h2>Link restored!</h2>
              <p>You sent {messages.length} messages in real Morse code{inWord && inDone.current ? ` and decoded ${inWord}` : ''}{wpm(dot.current) > 2 ? `, about ${wpm(dot.current)} words a minute` : ''}.</p>
              <p className="relay-run-xp">⚡ +{xpGame.run} relay XP this run{xpGame.st.next ? ` · ${xpGame.st.need - xpGame.st.into} XP to level ${xpGame.st.next.level}` : ''}</p>
              {saved && <p className="relay-xp">{saved === 'xp' ? `⭐ +${XP_PER_RUN} Guardian XP` : '⭐ Relay logged'} <small>{online ? 'sent to Base' : 'saved here until Base is back'}</small></p>}
              <div className="relay-win-actions">
                <button type="button" className="relay-btn primary" onClick={again}>Send more</button>
                <button type="button" className="relay-btn" onClick={free}>Free key</button>
                <button type="button" className="relay-btn" onClick={openMail}>✉️ Secret message</button>
                <button type="button" className="relay-btn" onClick={onClose}>Back to Base</button>
              </div>
            </div>
          )}

          {phase === 'intro' && <div className="relay-fading"><span>CONNECTION FADING</span></div>}
        </section>
      </main>

      <footer className="relay-deck">
        <div className={`relay-tape${incoming ? ' incoming' : ''}`} aria-hidden>
          <div className="relay-tape-roll">
            {tape.map(m => <i key={m.id} className={`${m.sym === '.' ? 'dot' : m.sym === '-' ? 'dash' : 'gap'} ${m.tone}`} />)}
            {pressing && <i className={`live ${liveDash ? 'dash' : 'dot'}`} style={{ ['--len' as string]: Math.min(4, Math.max(1, heldUnits)).toFixed(2) }} />}
          </div>
        </div>
        <button
          type="button"
          className={`relay-key${pressing ? ' down' : ''}${liveDash && pressing ? ' dash' : ''}`}
          disabled={phase === 'intro' || phase === 'restored' || phase === 'incoming' || phase === 'mail' || phase === 'secret-done' || (phase === 'compose' && !writeTo)}
          onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); keyDown(); }}
          onPointerUp={keyUp}
          onPointerCancel={keyUp}
          onLostPointerCapture={keyUp}
          onContextMenu={e => e.preventDefault()}
          aria-label="Telegraph key: tap for a dot, hold for a dash"
        >
          {ripples.map(r => <span key={r.id} className={`relay-ripple${r.dash ? ' dash' : ''}`} />)}
          <span className="relay-key-cap"><b>{pressing ? (liveDash ? '—' : '•') : 'TAP'}</b></span>
        </button>
        <p className="relay-key-help">{phase === 'free' || phase === 'compose' ? 'Pause between letters' : phase === 'incoming' ? 'Athena is sending — pick the letter above' : `Tap = dot · Hold = dash${showCode ? '' : ' · 🙈 double XP'}`}</p>
      </footer>

      <LevelUpBanner level={xpGame.levelUp} onClose={xpGame.dismissLevelUp} />

      {book && (
        <div className="relay-book" role="dialog" aria-label="Morse code book" onClick={() => setBook(false)}>
          <div className="relay-book-page" onClick={e => e.stopPropagation()}>
            <header><b>📖 Code book</b><button type="button" onClick={() => setBook(false)} aria-label="Close code book">✕</button></header>
            <ul>
              {Object.entries(MORSE).filter(([c]) => /[A-Z]/.test(c)).map(([c, p]) => (
                <li key={c} className={(phase === 'send' && word[letter] === c) ? 'now' : ''}><b>{c}</b><span>{p.split('').map((s, i) => <i key={i} className={s === '.' ? 'dot' : 'dash'} />)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
