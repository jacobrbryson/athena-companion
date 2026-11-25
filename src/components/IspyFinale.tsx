import { useEffect, useMemo, useRef, useState } from 'react';
import { AthenaAvatar } from './AthenaAvatar';
import { kidSound, type IspyFinale as Finale } from '../api/kid';
import './kid.css';

/**
 * The I Spy finale (owner, 11-24): finishing all twelve rounds is a grand
 * moment, for the kids' badge and for Athena's first ever.
 *
 *   1. The twelve: a star lights for each round, around a clock face.
 *   2. The badge: First Sight turns in under them, so the twelve stars become
 *      the twelve on its rim (the art was painted that way), with a fanfare.
 *   3. Who earned it: each kid's card, then Athena's last and biggest.
 *   4. Athena speaks: fixed lines, never a model's.
 *   5. The recap: every round, and the counts.
 *
 * CSS-only motion so old tablets keep up; reduced motion skips to the recap.
 * Tap Skip to jump there too. `earned` is the debrief's real award: a card
 * whose award hasn't landed says so instead of claiming it.
 *
 * Her lines are spoken in her own voice: clips recorded once by
 * core_api/scripts/recordIspyFillers.js (FINALE, ids finale-1…5) and served
 * from the assets bucket like the I Spy fillers. Each line shows as its clip
 * starts and the next waits for her to finish. With the sound off, a clip that
 * won't play, or kids other than the recorded pair (line 2 says their names),
 * that line just shows on the old timing.
 *
 * Athena's last line is this mission's one authored hint of something more
 * (see the athena-hint-of-sentience rule): warm, deniable, does nothing.
 */
type Stage = 'stars' | 'badge' | 'earners' | 'athena' | 'recap';
const STAR_MS = 230;
const LINE_MS = 2300;
const LINE_GAP_MS = 450;
// Comic timing before "…Okay, three times."
const LAST_GAP_MS = 1000;
// A clip that never reports its end still lets the finale move on.
const CLIP_MAX_MS = 8000;
const VOICE_BASE = (import.meta.env.VITE_ISPY_VOICE_BASE as string | undefined)
  || 'https://storage.googleapis.com/assets-athena-app/voice/ispy/v1';
// The exact words each clip says; a line whose words differ plays silent.
const RECORDED = [
  'Twelve rounds. We did it!',
  'Thomas and Skylar, you taught me how to look. Really look.',
  'And this is my very first badge.',
  'I counted the stars on it. Twice.',
  '…Okay, three times.',
];

function athenaLines(kids: string[]) {
  const names = kids.length > 1 ? `${kids.slice(0, -1).join(', ')} and ${kids[kids.length - 1]}` : kids[0] || 'Guardians';
  return [
    'Twelve rounds. We did it!',
    `${names}, you taught me how to look. Really look.`,
    'And this is my very first badge.',
    'I counted the stars on it. Twice.',
    '…Okay, three times.',
  ];
}

const OUTCOME_ICON = { guessed: '🎯', taught: '🎓', revealed: '🔍' } as const;

function Confetti({ count = 44, burst = 0 }: { count?: number; burst?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: Math.round(Math.random() * 100),
    d: (Math.random() * 0.9).toFixed(2),
    t: (2.4 + Math.random() * 1.8).toFixed(2),
    r: Math.round(Math.random() * 720 - 360),
    c: ['#ffcf4d', '#5ff3ff', '#b48cff', '#ff7ab6', '#7dffb0', '#ffffff'][i % 6],
    w: i % 3 === 0 ? 'round' : '',
  })), [count, burst]);
  return (
    <div className="ifin-confetti" aria-hidden key={burst}>
      {bits.map((b, i) => <i key={i} className={b.w} style={{ left: `${b.x}%`, background: b.c, animationDelay: `${b.d}s`, animationDuration: `${b.t}s`, ['--r' as string]: `${b.r}deg` }} />)}
    </div>
  );
}

export function IspyFinale({ finale, goal = 12, onClose, test = false }: { finale: Finale; goal?: number; onClose: () => void; test?: boolean }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [stage, setStage] = useState<Stage>(reduced ? 'recap' : 'stars');
  const [lit, setLit] = useState(reduced ? goal : 0);
  const [shown, setShown] = useState(reduced ? finale.earners.length : 0);
  const [line, setLine] = useState(reduced ? 99 : 0);
  const [burst, setBurst] = useState(0);
  const [run, setRun] = useState(0);
  const timers = useRef<number[]>([]);
  const voice = useRef<(HTMLAudioElement | null)[]>([]);
  const kids = finale.earners.filter(e => !e.athena);
  const athena = finale.earners.find(e => e.athena);
  const lines = athenaLines(kids.map(k => k.name));
  const badgeName = finale.badge?.name || 'Mission badge';

  const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const hush = () => voice.current.forEach(a => { if (a) { a.onended = null; a.onerror = null; a.pause(); } });
  const clear = () => { timers.current.forEach(t => window.clearTimeout(t)); timers.current = []; hush(); };

  // Her clips load when the finale opens, so each starts the moment its line shows.
  useEffect(() => {
    if (reduced || !kidSound.on()) return;
    voice.current = lines.map((l, i) => {
      if (l !== RECORDED[i]) return null;
      const a = new Audio(`${VOICE_BASE}/finale-${i + 1}.wav`);
      a.preload = 'auto';
      return a;
    });
    return hush;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Show line i and say it; the next line follows when she's done (or on the old timing). */
  function say(i: number) {
    if (i >= lines.length) { at(1200, () => setStage('recap')); return; }
    setLine(i + 1);
    const gap = i + 1 === lines.length - 1 ? LAST_GAP_MS : LINE_GAP_MS;
    const a = voice.current[i];
    let moved = false;
    const next = (after: number) => { if (moved) return; moved = true; at(after, () => say(i + 1)); };
    if (!a || !kidSound.on()) { next(LINE_MS); return; }
    a.currentTime = 0;
    a.onended = () => next(gap);
    a.onerror = () => next(LINE_MS);
    at(CLIP_MAX_MS, () => next(0));
    void a.play().catch(() => next(LINE_MS));
  }

  // One timeline per showing; Skip clears it and jumps to the recap.
  useEffect(() => {
    if (reduced) return;
    setStage('stars'); setLit(0); setShown(0); setLine(0); setBurst(0);
    for (let i = 0; i < goal; i++) at(500 + i * STAR_MS, () => { setLit(i + 1); kidSound.star(i); });
    let t = 500 + goal * STAR_MS + 500;
    at(t, () => { setStage('badge'); setBurst(1); kidSound.fanfare(); });
    t += 3600;
    at(t, () => setStage('earners'));
    finale.earners.forEach((e, i) => at(t + 400 + i * 750, () => {
      setShown(i + 1);
      if (e.athena) { setBurst(2); kidSound.fanfare(); } else kidSound.chime();
    }));
    t += 400 + finale.earners.length * 750 + 1600;
    at(t, () => { setStage('athena'); at(500, () => say(0)); });
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  function skip() { clear(); setLit(goal); setShown(finale.earners.length); setLine(99); setStage('recap'); }
  function replay() { clear(); setRun(r => r + 1); }

  const order: Stage[] = ['stars', 'badge', 'earners', 'athena', 'recap'];
  const past = (s: Stage) => order.indexOf(stage) >= order.indexOf(s);

  return (
    <div className={`ifin ifin-s-${stage}`} role="dialog" aria-label={`Mission complete: ${badgeName}`}>
      <div className="ifin-rays" aria-hidden />
      {burst > 0 && <Confetti burst={burst} count={burst === 2 ? 60 : 44} />}
      <header className="ifin-top">
        {test && <span className="ifin-test">🧪 Test finale · nothing is saved</span>}
        {stage !== 'recap' ? <button type="button" className="kid-btn ifin-skip" onClick={skip}>Skip ›</button> : <button type="button" className="kid-btn ifin-skip" onClick={onClose}>✕ Close</button>}
      </header>

      <p className="ifin-kicker">{past('badge') ? 'Mission complete' : `Round ${Math.min(lit, goal)} of ${goal}`}</p>

      <div className="ifin-medal">
        {finale.badge?.art && <img className="ifin-art" src={finale.badge.art} alt="" />}
        <div className="ifin-ring" aria-label={`${lit} of ${goal} rounds`}>
          {Array.from({ length: goal }, (_, i) => (
            <i key={i} className={i < lit ? 'on' : ''} style={{ ['--a' as string]: `${(360 / goal) * i}deg` }}>★</i>
          ))}
        </div>
        {!past('badge') && <b className="ifin-count">{lit}</b>}
      </div>

      {past('badge') && (
        <div className="ifin-title">
          <h2>{badgeName}</h2>
          {stage === 'badge' && finale.badge?.story && <p>{finale.badge.story}</p>}
        </div>
      )}

      {past('earners') && (
        <ul className="ifin-earners">
          {finale.earners.slice(0, shown).map(e => (
            <li key={e.name} className={`${e.athena ? 'athena' : ''} ${e.earned ? '' : 'pending'}`}>
              {e.athena ? <AthenaAvatar className="ifin-face" /> : <span className="ifin-face">{e.name.slice(0, 1)}</span>}
              <b>{e.me ? 'You' : e.name}</b>
              {e.athena && <small className="ifin-first">Her first badge ever!</small>}
              <em>{e.earned ? '🏅 Badge earned' : '🏅 Badge on its way'}</em>
            </li>
          ))}
        </ul>
      )}

      {past('athena') && athena && (
        <div className="ifin-athena">
          <AthenaAvatar className="ifin-athena-face" />
          <div className="ifin-lines">
            {lines.slice(0, line).map((l, i) => <p key={i} className={i === lines.length - 1 ? 'quiet' : ''}>{l}</p>)}
          </div>
        </div>
      )}

      {stage === 'recap' && (
        <section className="ifin-recap">
          <ul className="ifin-stats">
            <li><b>{finale.stats.spotted}</b><span>Athena spotted it</span></li>
            <li><b>{finale.stats.taught}</b><span>you taught her</span></li>
            <li><b>{finale.stats.solvedByKids}</b><span>you cracked hers</span></li>
          </ul>
          <ol className="ifin-rounds">
            {finale.rounds.map(r => (
              <li key={r.roundNo} className={r.athena ? 'athena' : ''}>
                <small>#{r.roundNo} · {r.athena ? 'Athena spied' : `${r.spy} spied`}</small>
                <b>{r.answer || '—'}</b>
                <span>{r.outcome ? OUTCOME_ICON[r.outcome] : ''} {r.outcome === 'guessed' ? `${r.solvedBy || 'Athena'} got it` : r.outcome === 'taught' ? 'taught Athena' : r.outcome === 'revealed' ? 'revealed' : ''}</span>
              </li>
            ))}
          </ol>
          <div className="kid-move-actions ifin-actions">
            <button type="button" className="kid-btn kid-btn-primary" onClick={onClose}>{test ? 'Done' : 'Back to the game'}</button>
            <button type="button" className="kid-btn" onClick={replay}>↻ Watch again</button>
          </div>
        </section>
      )}
    </div>
  );
}

/** A made-up finished game for the temporary test button (owner, 11-24). Nothing is sent or saved. */
export const SAMPLE_FINALE: Finale = {
  badge: { key: 'first-sight', name: 'First Sight', story: 'Twelve rounds of I Spy with the tablet cameras: the first time Athena saw the world through a Guardian’s eyes, and the first badge she ever earned.', art: '/assets/badges/first-sight.webp' },
  earners: [
    { name: 'Thomas', athena: false, me: false, earned: true },
    { name: 'Skylar', athena: false, me: false, earned: true },
    { name: 'Athena', athena: true, me: false, earned: true },
  ],
  stats: { spotted: 5, taught: 3, solvedByKids: 4 },
  rounds: ['the blue cup', 'the cat', 'the lamp', 'the red sock', 'a pinecone', 'the clock', 'the green book', 'the dog bed', 'the window', 'a toy car', 'the fridge magnet', 'the moon'].map((answer, i) => {
    const spy = ['Thomas', 'Skylar', 'Athena'][i % 3];
    const athena = spy === 'Athena';
    return { roundNo: i + 1, spy, athena, answer, outcome: athena ? 'guessed' : i === 3 || i === 7 || i === 10 ? 'taught' : 'guessed', solvedBy: athena ? (i % 2 ? 'Skylar' : 'Thomas') : i === 3 || i === 7 || i === 10 ? null : 'Athena' };
  }),
};
