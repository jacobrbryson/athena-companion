import { useCallback, useEffect, useRef, useState } from 'react';
import { AthenaAvatar } from './AthenaAvatar';
import { ispyApi, kidSound, photoForProof, type IspyGame as Game, type IspyRound } from '../api/kid';

/**
 * I Spy on a kid's tablet (owner, 11-23). Thomas, Skylar and Athena take
 * turns as the spy; the server decides whose turn it is and whether a guess
 * is right. Both tablets watch the same game, so this refreshes every few
 * seconds while it's open.
 */
const POLL_MS = 4000;

function usePhoto(uuid: string | null | undefined, has: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!uuid || !has) { setUrl(null); return; }
    let live = true;
    let made: string | null = null;
    ispyApi.photo(uuid).then(blob => { if (!live) return; made = URL.createObjectURL(blob); setUrl(made); }).catch(() => setUrl(null));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [uuid, has]);
  return url;
}

function Progress({ game }: { game: Game }) {
  return (
    <div className="ispy-progress" aria-label={`${game.done} of ${game.goal} rounds`}>
      {Array.from({ length: game.goal }, (_, i) => <i key={i} className={i < game.done ? 'got' : i === game.done ? 'now' : ''} aria-hidden>{i < game.done ? '⭐' : ''}</i>)}
      <b>{game.done} / {game.goal}</b>
    </div>
  );
}

function Players({ game }: { game: Game }) {
  return (
    <ul className="ispy-players">
      {game.players.map(p => (
        <li key={p.name} className={game.turn.name === p.name ? 'turn' : ''}>
          {p.athena ? <AthenaAvatar className="ispy-face" /> : <span className="ispy-face">{p.name.slice(0, 1)}</span>}
          <b>{p.me ? 'You' : p.name}</b>
          {game.turn.name === p.name && <small>spying</small>}
        </li>
      ))}
    </ul>
  );
}

function LastRound({ r }: { r: IspyRound }) {
  const text = r.outcome === 'guessed'
    ? (r.spy.athena ? `${r.solvedBy} got it! It was ${r.answer}.` : `Athena got it: ${r.answer}!`)
    : r.outcome === 'taught' ? `${r.spy.me ? 'You' : r.spy.name} taught Athena: it was ${r.answer}.` : `Athena's was ${r.answer}.`;
  return <p className="ispy-last">Round {r.roundNo}: {text}</p>;
}

export function IspyGame({ onClose }: { onClose: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [clue, setClue] = useState('something ');
  const [answer, setAnswer] = useState('');
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [guess, setGuess] = useState('');
  const [hint, setHint] = useState('');
  const doneRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try { const { game: g } = await ispyApi.state(); setGame(g); } catch { /* next poll */ } finally { setLoaded(true); }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);
  // A finished round anywhere chimes on this tablet too.
  useEffect(() => {
    if (!game) return;
    if (doneRef.current != null && game.done > doneRef.current) kidSound.chime();
    doneRef.current = game.done;
  }, [game]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const round = game?.round || null;
  const photo = usePhoto(round?.uuid, Boolean(round?.photo));

  async function run(fn: () => Promise<{ game: Game | null }>) {
    setBusy(true); setNote('');
    try { const out = await fn(); setGame(out.game); return out; }
    catch (err) { setNote((err as Error)?.message || 'That didn’t work. Try again?'); return null; }
    finally { setBusy(false); }
  }
  function pick(file: File | undefined) {
    if (!file) return;
    if (shot) URL.revokeObjectURL(shot.url);
    setShot({ file, url: URL.createObjectURL(file) });
  }
  async function sendMine() {
    if (!shot) return;
    const { image, contentType } = await photoForProof(shot.file);
    const out = await run(() => ispyApi.spy(image, contentType, clue.trim(), answer.trim()));
    if (out) { setShot(null); setClue('something '); setAnswer(''); }
  }
  async function sendForAthena() {
    if (!shot) return;
    const { image, contentType } = await photoForProof(shot.file);
    const out = await run(() => ispyApi.athena(image, contentType));
    if (out) setShot(null);
  }

  const finished = game && game.done >= game.goal;

  return (
    <div className="ispy" role="dialog" aria-label="I Spy">
      <header className="ispy-head">
        <h2>🔎 {game?.mission.title || 'I Spy'}</h2>
        <button type="button" className="kid-btn" onClick={onClose}>✕ Close</button>
      </header>
      {!loaded ? <p className="ispy-wait">Opening the game…</p> : !game ? (
        <div className="ispy-stage"><p className="ispy-wait">There's no I Spy game going right now. When a grown-up starts the mission, it shows up here.</p></div>
      ) : (
        <>
          <Progress game={game} />
          <Players game={game} />
          {game.recent[0] && !round && <LastRound r={game.recent[0]} />}

          <div className="ispy-stage">
            {finished ? (
              <div className="ispy-win"><span aria-hidden>🏆</span><h3>You taught Athena I Spy!</h3><p>All {game.goal} rounds done. Your 🔎 badge is on its way once a grown-up wraps up the mission.</p></div>
            ) : round ? (
              <div className="ispy-round">
                <div className="ispy-photo">{photo ? <img src={photo} alt="The I Spy photo" /> : <span>📷</span>}</div>
                <div className="ispy-side">
                  <p className="ispy-clue"><small>{round.spy.athena ? 'Athena spies' : `${round.spy.me ? 'You spy' : `${round.spy.name} spies`}`} with {round.spy.athena ? 'her' : round.spy.me ? 'your' : 'their'} little eye…</small><b>{round.clue}</b></p>
                  {!round.spy.athena && round.spy.me && round.answer && <p className="ispy-secret">Your secret: <b>{round.answer}</b></p>}
                  <ul className="ispy-guesses">
                    {round.guesses.map((g, i) => <li key={i} className={g.right === true ? 'right' : g.right === false ? 'wrong' : ''}><b>{g.athena ? 'Athena' : g.by}</b> {g.text} <span aria-hidden>{g.right === true ? '✅' : g.right === false ? '❌' : '🤔'}</span></li>)}
                  </ul>
                  {round.hints.length > 0 && <ul className="ispy-hints">{round.hints.map((h, i) => <li key={i}>💡 {h}</li>)}</ul>}

                  {/* A kid's round: the spy says if Athena got it. */}
                  {!round.spy.athena && round.awaitingJudge && round.spy.me && (
                    <div className="ispy-judge">
                      <p>Is Athena right?</p>
                      <div className="kid-move-actions">
                        <button type="button" className="kid-btn kid-btn-primary" disabled={busy} onClick={() => void run(() => ispyApi.judge(round.uuid, true))}>✅ Yes!</button>
                        <button type="button" className="kid-btn" disabled={busy} onClick={() => void run(() => ispyApi.judge(round.uuid, false, hint.trim() || undefined)).then(() => setHint(''))}>❌ Nope</button>
                      </div>
                      <input className="ispy-input" value={hint} onChange={e => setHint(e.target.value)} placeholder="Give her a hint (optional)" aria-label="Hint for Athena" />
                    </div>
                  )}
                  {!round.spy.athena && round.awaitingJudge && !round.spy.me && <p className="ispy-wait">Waiting for {round.spy.name} to tell Athena if she's right…</p>}
                  {!round.spy.athena && !round.awaitingJudge && <p className="ispy-wait">🤔 Athena is thinking…</p>}

                  {/* Athena's round: everyone guesses. */}
                  {round.spy.athena && (
                    <form className="ispy-guess" onSubmit={e => { e.preventDefault(); if (guess.trim()) void run(() => ispyApi.guess(round.uuid, guess.trim())).then(() => setGuess('')); }}>
                      <input className="ispy-input" value={guess} onChange={e => setGuess(e.target.value)} placeholder="What is it?" aria-label="Your guess" autoComplete="off" />
                      <button type="submit" className="kid-btn kid-btn-primary" disabled={busy || !guess.trim()}>Guess</button>
                      <button type="button" className="kid-btn" disabled={busy} onClick={() => void run(() => ispyApi.reveal(round.uuid))}>Give up</button>
                    </form>
                  )}
                </div>
              </div>
            ) : game.turn.me || game.turn.athena ? (
              <div className="ispy-new">
                <h3>{game.turn.athena ? "Athena's turn! Snap a photo of the room for her to spy in." : 'Your turn to spy! Take a photo of something in the room.'}</h3>
                <label className="kid-btn kid-btn-primary ispy-snap">
                  📸 {shot ? 'Take a different photo' : 'Take the photo'}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {shot && <img className="ispy-preview" src={shot.url} alt="Your photo" />}
                {shot && !game.turn.athena && (
                  <div className="ispy-form">
                    <label>I spy with my little eye… <input className="ispy-input" value={clue} onChange={e => setClue(e.target.value)} placeholder="something blue" /></label>
                    <label>Secret answer (only you see it) <input className="ispy-input" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="the blue cup" autoComplete="off" /></label>
                    <button type="button" className="kid-btn kid-btn-primary" disabled={busy || clue.trim().length < 3 || answer.trim().length < 2} onClick={() => void sendMine()}>{busy ? 'Athena is looking…' : 'Send to Athena'}</button>
                  </div>
                )}
                {shot && game.turn.athena && <button type="button" className="kid-btn kid-btn-primary" disabled={busy} onClick={() => void sendForAthena()}>{busy ? 'Athena is choosing…' : 'Give it to Athena'}</button>}
              </div>
            ) : (
              <p className="ispy-wait">It's {game.turn.name}'s turn to spy. Wait for them, or hand them the tablet!</p>
            )}
            {note && <p className="kid-note kid-note-warn">{note}</p>}
          </div>
        </>
      )}
    </div>
  );
}
