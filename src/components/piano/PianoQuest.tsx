import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AthenaAvatar } from '../AthenaAvatar';
import { kidSound } from '../../api/kid';
import { LevelUpBanner, XpBar, useGameXp } from '../games/GameXp';
import { comboBonus, levels } from '../games/progress';
import {
  SONGS, SPEED_MS, freq, keyboardRange, labelsByDefault, ledgers, letterOf, levelNotes, mnemonic, noteKey,
  pickRound, songsFor, speedBonusFrom, staffPos, step, type Clef, type Song, type StaffNote,
} from './notes';
import './piano.css';

/**
 * Piano Quest (owner, 11-25): the Guardians' offline game for learning to read
 * piano sheet music. A note sits on the staff; the kid taps its key on the
 * piano below. New notes are introduced one at a time ("This is G — tap it"),
 * a level brings more notes, then the bass clef, then both mixed, and songs
 * unlock as soon as a kid can read every note in them: each right key plays the
 * next note of the tune, and the whole song plays back at the end.
 *
 * Runs on the tablet alone: the piano is synthesized, and XP and levels are the
 * game's own (games/progress.ts), kept per kid on the tablet. No Guardian XP.
 */

type Phase = 'menu' | 'intro' | 'run' | 'songs' | 'song' | 'done';

const ROUND = 10;
const XP_NOTE = 3;
const XP_HINTED = 1;
const XP_ROUND = 10;
const XP_PERFECT = 10;
const XP_SONG = 20;
const XP_NEW_SONG = 15;
const XP_FAST = 2;
const XP_SONG_NOTE = 1;

export const PIANO_LEVELS = levels(
  ['Note Newbie', 'Key Finder', 'Melody Maker', 'Staff Reader', 'Treble Tamer', 'Bass Explorer', 'Low Note Hero', 'Grand Staff Guide',
    'Speed Reader', 'Sight-Read Star', 'Keyboard Knight', 'Chord Captain', 'Maestro in Training', 'Concert Kid', 'Piano Legend'],
  {
    2: 'New notes: F and G · more songs',
    3: 'New notes: A, B and high C · Twinkle Twinkle',
    4: 'Letters leave the keys (double XP without them)',
    5: 'High notes up to G',
    6: 'The bass clef!',
    7: 'Low notes down to G',
    8: 'Both clefs mixed',
    9: 'Speed bonus for quick answers',
  },
);

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } },
};
const seenKey = (who: string) => `piano_seen_v1:${who}`;
const songsKey = (who: string) => `piano_songs_v1:${who}`;
const labelsKey = (who: string) => `piano_labels_v1:${who}`;
const readSet = (k: string) => { try { return new Set<string>(JSON.parse(store.get(k) || '[]')); } catch { return new Set<string>(); } };

/** A small synthesized piano: two partials and a quick decay, so it never needs a sound file. */
function usePiano() {
  const ctx = useRef<AudioContext | null>(null);
  const ensure = () => {
    if (ctx.current) return ctx.current;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx.current = new Ctx();
    } catch { /* no audio: the keys still light up */ }
    return ctx.current;
  };
  const play = useCallback((note: string, at = 0, dur = 1.1, vol = 0.22) => {
    const c = ensure();
    if (!c || !kidSound.on()) return;
    if (c.state === 'suspended') void c.resume();
    const t = c.currentTime + at;
    const f = freq(note);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    out.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.25);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(c.destination);
    for (const [type, mult, g] of [['triangle', 1, 1], ['sine', 2, 0.35], ['sine', 3, 0.12]] as const) {
      const o = c.createOscillator(); const og = c.createGain();
      o.type = type; o.frequency.value = f * mult; og.gain.value = g;
      o.connect(og).connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
  }, []);
  const buzz = useCallback(() => {
    const c = ensure();
    if (!c || !kidSound.on()) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(180, c.currentTime); o.frequency.exponentialRampToValueAtTime(110, c.currentTime + 0.2);
    g.gain.setValueAtTime(0.05, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.24);
  }, []);
  useEffect(() => () => { void ctx.current?.close(); }, []);
  return { play, buzz };
}

// ── The staff ──────────────────────────────────────────────────────────────
const LINE_GAP = 20;
const STAFF_TOP = 70;
const BOTTOM_Y = STAFF_TOP + LINE_GAP * 4;
const yOf = (pos: number) => BOTTOM_Y - pos * (LINE_GAP / 2);

function Staff({ clef, notes, current, done, wide }: { clef: Clef; notes: StaffNote[]; current: number; done: number; wide?: boolean }) {
  const width = wide ? 760 : 420;
  const x0 = wide ? 120 : 250;
  const gapX = wide ? (width - x0 - 40) / Math.max(1, notes.length - 1 || 1) : 0;
  return (
    <svg className="pq-staff" viewBox={`0 0 ${width} 240`} role="img" aria-label={notes[current] ? `A note on the ${clef} clef` : 'Staff'}>
      {[0, 1, 2, 3, 4].map(i => <line key={i} x1={14} x2={width - 14} y1={STAFF_TOP + i * LINE_GAP} y2={STAFF_TOP + i * LINE_GAP} className="pq-sline" />)}
      <text className="pq-clef" x={clef === 'treble' ? 22 : 26} y={clef === 'treble' ? BOTTOM_Y + 16 : STAFF_TOP + 50} fontSize={clef === 'treble' ? 112 : 74}>{clef === 'treble' ? '\u{1D11E}' : '\u{1D122}'}</text>
      <text className="pq-clef-name" x={18} y={226}>{clef === 'treble' ? 'treble clef' : 'bass clef'}</text>
      {notes.map((n, i) => {
        const x = wide ? x0 + i * gapX : x0;
        const p = staffPos(n);
        const y = yOf(p);
        const up = p < 4;
        const state = i < done ? 'done' : i === current ? 'now' : 'next';
        return (
          <g key={`${i}-${n.note}`} className={`pq-note ${state}`}>
            {ledgers(n).map(q => <line key={q} x1={x - 22} x2={x + 22} y1={yOf(q)} y2={yOf(q)} className="pq-ledger" />)}
            <ellipse cx={x} cy={y} rx={13} ry={9.5} transform={`rotate(-20 ${x} ${y})`} />
            <line x1={up ? x + 12 : x - 12} x2={up ? x + 12 : x - 12} y1={up ? y - 3 : y + 3} y2={up ? y - 62 : y + 62} className="pq-stem" />
          </g>
        );
      })}
    </svg>
  );
}

// ── The keyboard ───────────────────────────────────────────────────────────
const HAS_BLACK_AFTER = new Set(['C', 'D', 'F', 'G', 'A']);

function Keyboard({ keys, labels, flash, hint, onPress }: {
  keys: string[]; labels: boolean;
  flash: { note: string; ok: boolean; n: number } | null;
  hint: string | null;
  onPress: (note: string | null) => void;
}) {
  return (
    <div className="pq-keys" style={{ ['--white' as string]: keys.length }}>
      {keys.map((k, i) => {
        const lit = flash?.note === k ? (flash.ok ? ' ok' : ' bad') : '';
        return (
          <button key={k} type="button" className={`pq-white${lit}${hint === k ? ' hint' : ''}`}
            onPointerDown={e => { e.preventDefault(); onPress(k); }} aria-label={`${letterOf(k)} key`}>
            {k === 'C4' && <i className="pq-middle-c" title="Middle C" />}
            {labels && <b>{letterOf(k)}</b>}
            {HAS_BLACK_AFTER.has(letterOf(k)) && i < keys.length - 1 && (
              <span className="pq-black" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onPress(null); }} aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PianoQuest({ who, onClose }: { who: string; onClose: () => void }) {
  const xpGame = useGameXp('piano', who, PIANO_LEVELS);
  const level = xpGame.st.level.level;
  const piano = usePiano();
  const [phase, setPhase] = useState<Phase>('menu');
  const [sound, setSound] = useState(kidSound.on());
  const [labelsPref, setLabelsPref] = useState(() => store.get(labelsKey(who)));
  const labels = labelsPref ? labelsPref === 'on' : labelsByDefault(level);

  const pool = useMemo(() => levelNotes(level), [level]);
  const songs = useMemo(() => songsFor(level), [level]);
  const [round, setRound] = useState<StaffNote[]>([]);
  const [idx, setIdx] = useState(0);
  const [intro, setIntro] = useState<StaffNote[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [flash, setFlash] = useState<{ note: string; ok: boolean; n: number } | null>(null);
  const [misses, setMisses] = useState(0);
  const [roundMisses, setRoundMisses] = useState(0);
  const [tip, setTip] = useState<string | null>(null);
  const [line, setLine] = useState('Read the note, then tap its key!');
  const [combo, setCombo] = useState(0);
  const [doneKind, setDoneKind] = useState<'round' | 'song'>('round');
  const streak = useRef(0);
  const shownAt = useRef(0);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);
  const played = readSet(songsKey(who));

  const current: StaffNote | null = phase === 'intro' ? intro[0] || null
    : phase === 'run' ? round[idx] || null
    : phase === 'song' && song ? { clef: song.clef, note: song.notes[idx]?.[0] } : null;
  // One clef's notes at a time, so the mixed levels don't need four octaves of keys.
  const clef: Clef = current?.clef || (pool[0]?.clef ?? 'treble');
  const keyNotes = phase === 'song' && song
    ? keyboardRange(song.notes.map(([n]) => ({ clef: song.clef, note: n })))
    : keyboardRange(pool.filter(n => n.clef === clef));
  const hint = phase === 'intro' ? current?.note || null : misses >= 2 ? current?.note || null : null;

  useEffect(() => { shownAt.current = performance.now(); }, [current?.note, idx, phase]);

  const startRun = () => {
    const seen = readSet(seenKey(who));
    const fresh = pool.filter(n => !seen.has(noteKey(n)));
    xpGame.resetRun();
    setRoundMisses(0); setMisses(0); setTip(null); setIdx(0);
    setRound(pickRound(pool, ROUND, new Set(fresh.map(noteKey))));
    if (fresh.length) { setIntro(fresh); setPhase('intro'); setLine('A new note! Find it on the piano.'); return; }
    setPhase('run'); setLine('Read the note, then tap its key!');
  };

  const startSong = (s: Song) => {
    xpGame.resetRun();
    setSong(s); setIdx(0); setMisses(0); setRoundMisses(0); setTip(null);
    setPhase('song'); setLine(`Play ${s.title}! Read each note in order.`);
  };

  const playBack = (s: Song) => {
    let t = 0.3;
    for (const [n, beats] of s.notes) { piano.play(n, t, Math.max(0.5, beats * 0.55)); t += beats * 0.45; }
  };

  const good = (note: string) => {
    piano.play(note);
    setFlash({ note, ok: true, n: Date.now() });
    const hinted = misses >= 2;
    streak.current = hinted ? 0 : streak.current + 1;
    setCombo(streak.current);
    // A song's notes are many and repeat, so they earn a little each and no
    // combos; the song itself pays at the end.
    if (phase === 'song') xpGame.add(labels ? XP_SONG_NOTE : XP_SONG_NOTE * 2);
    else if (phase !== 'intro') {
      const base = hinted ? XP_HINTED : labels ? XP_NOTE : XP_NOTE * 2;
      xpGame.add(base, !hinted && !labels ? 'no letters' : undefined);
      if (!hinted && level >= speedBonusFrom && performance.now() - shownAt.current < SPEED_MS) later(() => xpGame.add(XP_FAST, 'fast!'), 250);
      const bonus = comboBonus(streak.current);
      if (bonus) later(() => xpGame.add(bonus, `combo ×${streak.current}`), 450);
    }
    setMisses(0); setTip(null);
  };

  const press = (note: string | null) => {
    if (!current || busy.current) { if (note) piano.play(note, 0, 0.7, 0.12); return; }
    if (note === current.note) {
      good(note);
      busy.current = true;
      if (phase === 'intro') {
        const seen = readSet(seenKey(who)); seen.add(noteKey(current)); store.set(seenKey(who), JSON.stringify([...seen]));
        later(() => {
          busy.current = false;
          const rest = intro.slice(1);
          setIntro(rest);
          if (!rest.length) { setPhase('run'); setLine('Now read them on your own!'); }
        }, 700);
        return;
      }
      if (phase === 'run') {
        const next = idx + 1;
        later(() => {
          busy.current = false;
          if (next < round.length) { setIdx(next); return; }
          const perfect = roundMisses === 0;
          xpGame.add(XP_ROUND, 'round');
          if (perfect) later(() => xpGame.add(XP_PERFECT, 'perfect!'), 400);
          setLine(perfect ? 'A perfect round! Every note right.' : 'Round done! Great reading.');
          setDoneKind('round');
          setPhase('done');
        }, 450);
        return;
      }
      if (phase === 'song' && song) {
        const next = idx + 1;
        later(() => {
          busy.current = false;
          if (next < song.notes.length) { setIdx(next); return; }
          const first = !played.has(song.id);
          played.add(song.id); store.set(songsKey(who), JSON.stringify([...played]));
          xpGame.add(XP_SONG + (first ? XP_NEW_SONG : 0), first ? 'new song!' : 'song');
          setLine(`You played ${song.title}! Listen…`);
          setDoneKind('song');
          setPhase('done');
          later(() => playBack(song), 600);
        }, 260);
      }
      return;
    }
    // A wrong key: you still hear it, the combo ends, and after two misses the right key glows.
    if (note) piano.play(note, 0, 0.6, 0.12);
    piano.buzz();
    streak.current = 0; setCombo(0);
    setFlash({ note: note || '', ok: false, n: Date.now() });
    setMisses(m => m + 1);
    setRoundMisses(m => m + 1);
    if (!note) { setTip('All of today’s notes are on the white keys.'); return; }
    if (phase !== 'intro') setTip(misses + 1 >= 2 ? `It's ${letterOf(current.note)} — tap the glowing key.` : mnemonic(current) || `That was ${letterOf(note)}. Look again!`);
  };

  // Keyboard letters A–G on a real keyboard work too.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || !current) return;
      const l = e.key.toUpperCase();
      if (!/^[A-G]$/.test(l)) return;
      // The nearest key with that letter to the note being asked.
      const options = keyNotes.filter(k => letterOf(k) === l);
      const best = options.sort((a, b) => Math.abs(step(a) - step(current.note)) - Math.abs(step(b) - step(current.note)))[0];
      if (best) press(best);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  const toggleSound = () => { const on = !sound; kidSound.set(on); setSound(on); };
  const toggleLabels = () => { const on = !labels; store.set(labelsKey(who), on ? 'on' : 'off'); setLabelsPref(on ? 'on' : 'off'); };

  const songWindow = useMemo(() => {
    if (!song) return { notes: [] as StaffNote[], start: 0 };
    const start = Math.max(0, Math.min(idx - 2, song.notes.length - 8));
    return { notes: song.notes.slice(start, start + 8).map(([n]) => ({ clef: song.clef, note: n })), start };
  }, [song, idx]);

  return (
    <div className={`pq pq-phase-${phase}`} role="dialog" aria-label="Piano Quest">
      <header className="pq-top">
        <div className="pq-title"><b>🎹 PIANO QUEST</b><small>{phase === 'run' ? `Note ${idx + 1} of ${round.length}` : phase === 'song' && song ? song.title : phase === 'intro' ? 'New note' : phase === 'songs' ? 'Songs' : 'Read music'}</small></div>
        <XpBar xp={xpGame.xp} st={xpGame.st} pops={xpGame.pops} />
        {combo >= 3 && <span className="pq-combo" key={combo}>🔥 ×{combo}</span>}
        <div className="pq-tools">
          {phase !== 'menu' && <button type="button" onClick={() => setPhase('menu')} aria-label="Menu">🏠</button>}
          <button type="button" onClick={toggleLabels} aria-pressed={labels} aria-label={labels ? 'Hide letters on keys' : 'Show letters on keys'}>{labels ? '🔤' : '🙈'}</button>
          <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Sound off' : 'Sound on'}>{sound ? '🔊' : '🔇'}</button>
          <button type="button" onClick={onClose} aria-label="Back to Base">✕</button>
        </div>
      </header>

      <main className="pq-stage">
        {phase === 'menu' && (
          <div className="pq-menu">
            <AthenaAvatar className="pq-face" />
            <h2>Learn to read music!</h2>
            <p>Each note on the lines lives on a key of the piano. Read it, find it, tap it. Level up to unlock new notes, the bass clef, and songs.</p>
            <div className="pq-menu-actions">
              <button type="button" className="pq-btn primary" onClick={startRun}>▶ Read notes</button>
              <button type="button" className="pq-btn" onClick={() => setPhase('songs')}>🎵 Songs <small>{songs.length}</small></button>
            </div>
            <p className="pq-notes-now">Your notes: {pool.map(n => letterOf(n.note) + (n.note === 'C5' ? '↑' : '')).join(' ')} · {pool[0].clef === 'bass' && pool.every(n => n.clef === 'bass') ? 'bass clef' : pool.some(n => n.clef === 'bass') ? 'both clefs' : 'treble clef'}</p>
          </div>
        )}

        {phase === 'songs' && (
          <div className="pq-songs">
            <h2>🎵 Songs you can play</h2>
            <ul>
              {SONGS.map(s => {
                const open = songs.includes(s);
                return (
                  <li key={s.id}>
                    <button type="button" className={`pq-song${open ? '' : ' locked'}`} disabled={!open} onClick={() => startSong(s)}>
                      <b>{open ? (played.has(s.id) ? '⭐' : '🎵') : '🔒'} {s.title}</b>
                      <small>{open ? `${s.notes.length} notes · ${s.clef} clef` : 'Level up to unlock'}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(phase === 'intro' || phase === 'run') && current && (
          <div className="pq-read" key={`${phase}-${idx}-${current.note}`}>
            <Staff clef={current.clef} notes={[current]} current={0} done={0} />
            {phase === 'intro' && <p className="pq-intro">This note is <b>{letterOf(current.note)}</b>{current.note === 'C4' ? ' — middle C' : ''}. Tap the glowing key!</p>}
            {phase === 'run' && <div className="pq-dots" aria-hidden>{round.map((_, i) => <i key={i} className={i < idx ? 'done' : i === idx ? 'now' : ''} />)}</div>}
          </div>
        )}

        {phase === 'song' && song && (
          <div className="pq-read pq-song-read">
            <Staff clef={song.clef} notes={songWindow.notes} current={idx - songWindow.start} done={idx - songWindow.start} wide />
            <div className="pq-song-bar"><i style={{ width: `${Math.round((idx / song.notes.length) * 100)}%` }} /></div>
          </div>
        )}

        {phase === 'done' && (
          <div className="pq-done">
            <div className="pq-confetti" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
            <h2>{doneKind === 'song' ? '🎵 Song complete!' : roundMisses === 0 ? '⭐ Perfect round!' : '🎉 Round done!'}</h2>
            <p className="pq-run-xp">+{xpGame.run} XP{xpGame.st.next ? ` · ${xpGame.st.need - xpGame.st.into} XP to level ${xpGame.st.next.level}` : ''}</p>
            <div className="pq-menu-actions">
              {doneKind === 'song' && song
                ? <><button type="button" className="pq-btn primary" onClick={() => playBack(song)}>🔁 Hear it again</button><button type="button" className="pq-btn" onClick={() => startSong(song)}>Play it again</button><button type="button" className="pq-btn" onClick={() => setPhase('songs')}>More songs</button></>
                : <><button type="button" className="pq-btn primary" onClick={() => { setSong(null); startRun(); }}>▶ Next round</button><button type="button" className="pq-btn" onClick={() => setPhase('songs')}>🎵 Songs</button></>}
            </div>
          </div>
        )}

        <p className="pq-line" aria-live="polite">{tip || line}</p>
      </main>

      <footer className="pq-deck">
        <Keyboard keys={keyNotes} labels={labels || phase === 'intro'} flash={flash} hint={hint} onPress={press} />
      </footer>

      <LevelUpBanner level={xpGame.levelUp} onClose={xpGame.dismissLevelUp} />
    </div>
  );
}
