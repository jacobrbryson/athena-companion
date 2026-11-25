import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AthenaAvatar } from '../AthenaAvatar';
import { kidSound } from '../../api/kid';
import { relayRuns } from '../../api/relay';
import {
  BOUNCE_MS, START_DOT_MS, adapt, check, classify, decode, encode, letterGapMs, MORSE,
  pickMessages, settleMs, wordGapMs, wpm, type Sym,
} from './morse';
import { LINES, useRelayVoice, type LineId } from './lines';
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
 */

type Phase = 'intro' | 'teach-dot' | 'teach-dash' | 'send' | 'restored' | 'free';
export type RelayReason = 'lost' | 'bored';

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

const trainedKey = (who: string) => `relay_trained:${who}`;
const hintKey = (who: string) => `relay_hint:${who}`;
const hintsKey = 'relay_show_code';
const today = () => new Date().toISOString().slice(0, 10);
const dayKey = (who: string) => `relay_day:${who}:${today()}`;
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

export function RelayGame({ who, reason, online, onClose }: {
  /** The signed-in profile, for this kid's own progress on a shared tablet. */
  who: string;
  reason: RelayReason;
  /** Whether Base answers right now; a 'lost' game greets the signal coming back. */
  online: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [signal, setSignal] = useState(BARS);
  const [caption, setCaption] = useState<LineId | null>(null);
  const [aside, setAside] = useState<string | null>(null);
  const [messages, setMessages] = useState(() => pickMessages());
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
  }, [messages.length, tone, voice, who, later]);

  const letterDone = useCallback(() => {
    misses.current = 0;
    setPopped(p => p + 1);
    setSent('');
    vibrate(20);
    tone.chord([880, 1174.7], 0.06);
    if (letter + 1 < patterns.length) { setLetter(letter + 1); return; }
    // The whole message went through: one more bar.
    const nextMsg = msg + 1;
    setWave(w => w + 1);
    if (nextMsg >= messages.length) { finishRun(); return; }
    setSignal(s => Math.min(BARS - 1, Math.max(s, 1) + 1));
    tone.chord([587.33, 739.99, 880], 0.08);
    later(() => { setMsg(nextMsg); setLetter(0); }, 650);
    if (nextMsg === messages.length - 1) voice.say('almost');
    else voice.say((['good-1', 'good-2', 'good-3', 'good-4'] as const)[msg % 4]);
  }, [letter, patterns.length, msg, messages.length, finishRun, tone, voice, later, setSent]);

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
    if (phase === 'free') {
      mark(sym, 'free');
      const next = sentRef.current + sym;
      setSent(next);
      gapTimer.current = window.setTimeout(() => {
        const ch = decode(next);
        setFreeText(t => (t + (ch || '?')).slice(-36));
        setSent('');
        if (ch) setPopped(p => p + 1);
        wordTimer.current = window.setTimeout(() => {
          setFreeText(t => (t.endsWith(' ') || !t ? t : `${t} `));
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
  }, [phase, target, setSent, mark, miss, letterDone, tone, voice, who]);

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
    setMessages(pickMessages()); setMsg(0); setLetter(0); setSent(''); setSaved(null);
    setSignal(2); setPhase('send'); setTape([]); setFreeText(''); voice.say('first-msg');
  };
  const free = () => { setPhase('free'); setSent(''); setFreeText(''); setTape([]); voice.say('free'); };
  const toggleSound = () => { const on = !sound; kidSound.set(on); setSound(on); };
  const toggleCode = () => { const on = !showCode; store.set(hintsKey, on ? 'on' : 'off'); setShowCode(on); };

  const heldUnits = held / dot.current;
  const liveDash = heldUnits >= 2;
  const weak = 1 - signal / BARS;
  const stage = phase === 'send' ? `Message ${msg + 1} of ${messages.length}` : phase === 'free' ? 'Free key' : phase === 'restored' ? 'Link restored' : phase === 'intro' ? 'Signal fading' : 'Learn the key';

  return (
    <div className={`relay relay-${phase}${signal >= BARS ? ' relay-full' : ''}`} style={{ ['--weak' as string]: weak.toFixed(2) }} role="dialog" aria-label="Signal Relay">
      <div className="relay-sky" aria-hidden><i /><i /><i /></div>
      <div className="relay-road" aria-hidden />
      <div className="relay-noise" aria-hidden />

      <header className="relay-top">
        <div className="relay-bars" aria-label={`Signal ${signal} of ${BARS}`}>
          {Array.from({ length: BARS }, (_, i) => <i key={i} className={i < signal ? 'on' : ''} style={{ ['--b' as string]: i }} />)}
        </div>
        <div className="relay-title"><b>SIGNAL RELAY</b><small>{stage}</small></div>
        <div className="relay-tools">
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
              <p>You sent {messages.length} messages in real Morse code{wpm(dot.current) > 2 ? `, about ${wpm(dot.current)} words a minute` : ''}.</p>
              {saved && <p className="relay-xp">{saved === 'xp' ? `⭐ +${XP_PER_RUN} XP` : '⭐ Relay logged'} <small>{online ? 'sent to Base' : 'saved here until Base is back'}</small></p>}
              <div className="relay-win-actions">
                <button type="button" className="relay-btn primary" onClick={again}>Send more</button>
                <button type="button" className="relay-btn" onClick={free}>Free key</button>
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
          disabled={phase === 'intro' || phase === 'restored'}
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
        <p className="relay-key-help">{phase === 'free' ? 'Pause between letters' : 'Tap = dot · Hold = dash'}</p>
      </footer>

      {book && (
        <div className="relay-book" role="dialog" aria-label="Morse code book" onClick={() => setBook(false)}>
          <div className="relay-book-page" onClick={e => e.stopPropagation()}>
            <header><b>📖 Code book</b><button type="button" onClick={() => setBook(false)} aria-label="Close code book">✕</button></header>
            <ul>
              {Object.entries(MORSE).filter(([c]) => /[A-Z]/.test(c)).map(([c, p]) => (
                <li key={c} className={phase === 'send' && word[letter] === c ? 'now' : ''}><b>{c}</b><span>{p.split('').map((s, i) => <i key={i} className={s === '.' ? 'dot' : 'dash'} />)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
