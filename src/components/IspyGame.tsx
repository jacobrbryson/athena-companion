import { useCallback, useEffect, useRef, useState } from 'react';
import { AthenaAvatar } from './AthenaAvatar';
import { ispyApi, kidSound, photoForProof, type IspyClue, type IspyGame as Game, type IspyRound } from '../api/kid';
import type { IspyApi } from '../api/ispyDemo';
import { useIspyFiller, type IspyFillerKind } from './ispyFillers';
import { IspyFinale } from './IspyFinale';
import './kid.css';

/**
 * I Spy on a kid's tablet (owner, 11-23). Thomas, Skylar and Athena take
 * turns as the spy; the server decides whose turn it is and whether a guess
 * is right. Both tablets watch the same game, so this refreshes every few
 * seconds while it's open.
 *
 * Clue cards (owner, 11-24): on a kid's round Athena asks the spy for a clue
 * after each miss; on hers, a kid can ask her for one. The cards show three at
 * a time with None as the fourth; "More clues" turns to the next three.
 */
const POLL_MS = 4000;
const finaleSeenKey = (mission: string) => `ispy_finale_seen:${mission}`;
// Athena's guesses per kid round (core_api ispy.js ATHENA_TRIES): a "Nope"
// before the last one sends her back to look again.

function usePhoto(src: IspyApi, uuid: string | null | undefined, has: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setUrl(null); setFailed(false);
    if (!uuid || !has) { setUrl(null); return; }
    let live = true;
    let made: string | null = null;
    src.photo(uuid).then(blob => { if (!live) return; made = URL.createObjectURL(blob); setUrl(made); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [src, uuid, has, attempt]);
  return { url, failed, retry: () => setAttempt(a => a + 1) };
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
          {game.round?.guesser?.name === p.name && !game.round.awaitingJudge && !game.round.clueAsked && <small className="ispy-guessing">guessing</small>}
        </li>
      ))}
    </ul>
  );
}

const CLUES_AT_ONCE = 3;

/** Three clue cards at a time, None always fourth. Cards already given this round aren't offered. */
function CluePicker({ list, given, busy, onPick }: { list: IspyClue[]; given: { key: string }[]; busy: boolean; onPick: (key: string) => void }) {
  const [page, setPage] = useState(0);
  const left = list.filter(c => !given.some(g => g.key === c.key));
  const pages = Math.max(1, Math.ceil(left.length / CLUES_AT_ONCE));
  const at = page % pages;
  const shown = left.slice(at * CLUES_AT_ONCE, at * CLUES_AT_ONCE + CLUES_AT_ONCE);
  return (
    <div className="ispy-clue-pick">
      <div className="ispy-clue-grid">
        {shown.map(c => <button key={c.key} type="button" className="kid-btn ispy-clue-card" disabled={busy} onClick={() => onPick(c.key)}>🃏 {c.label}</button>)}
        <button type="button" className="kid-btn ispy-clue-card ispy-clue-none" disabled={busy} onClick={() => onPick('none')}>🚫 None</button>
      </div>
      {pages > 1 && <button type="button" className="kid-btn ispy-clue-more" disabled={busy} onClick={() => setPage(at + 1)}>More clues › <small>{at + 1} / {pages}</small></button>}
    </div>
  );
}

function ClueTrail({ round }: { round: IspyRound }) {
  if (!round.clues.length) return null;
  return (
    <ul className="ispy-clues" aria-label="Clue cards">
      {round.clues.map((c, i) => <li key={i} className={c.key === 'none' ? 'none' : ''}><b>{c.athena ? 'Athena' : c.by}</b> {c.key === 'none' ? '🚫 None' : `🃏 ${c.label}`}</li>)}
    </ul>
  );
}

function LastRound({ r }: { r: IspyRound }) {
  const text = r.outcome === 'guessed'
    ? `${r.solvedBy || 'Athena'} got it! It was ${r.answer}.`
    : r.outcome === 'taught' ? `${r.spy.me ? 'You' : r.spy.name} taught Athena: it was ${r.answer}.` : `Athena's was ${r.answer}.`;
  return <p className="ispy-last">Round {r.roundNo}: {text}</p>;
}

/**
 * `api` swaps in a parent's practice game (api/ispyDemo.ts) on the same
 * screen; without it this is the kids' real game.
 */
export function IspyGame({ onClose, api = ispyApi, practice = false }: { onClose: () => void; api?: IspyApi; practice?: boolean }) {
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
  // Which of her "let me look…" lines covers the wait for the vision model.
  const [waiting, setWaiting] = useState<IspyFillerKind | null>(null);
  const [finaleOn, setFinaleOn] = useState(false);
  // Play again (owner, 11-25): after a full game, the next spy starts round 1 of
  // a new one, just for fun. Set here until that round exists on the server.
  const [again, setAgain] = useState(false);
  const gameNo = game?.gameNo ?? 1;
  useEffect(() => { setAgain(false); }, [gameNo]);
  useIspyFiller(waiting);

  const load = useCallback(async () => {
    try { const { game: g } = await api.state(); setGame(g); } catch { /* next poll */ } finally { setLoaded(true); }
  }, [api]);
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
  // The finale plays by itself once per tablet, the first time it sees the game finished.
  const finaleMission = game?.finale ? game.mission.uuid : null;
  useEffect(() => {
    if (!finaleMission || practice) return;
    try { if (localStorage.getItem(finaleSeenKey(finaleMission))) return; } catch { /* show it */ }
    setFinaleOn(true);
  }, [finaleMission, practice]);
  function closeFinale() {
    if (finaleMission) { try { localStorage.setItem(finaleSeenKey(finaleMission), '1'); } catch { /* shows again next time */ } }
    setFinaleOn(false);
  }

  const round = game?.round || null;
  const lastGuess = round ? round.guesses[round.guesses.length - 1] : undefined;
  const photo = usePhoto(api, round?.uuid, Boolean(round?.photo));

  async function run(fn: () => Promise<{ game: Game | null }>, filler: IspyFillerKind | null = null) {
    setBusy(true); setNote(''); setWaiting(filler);
    try { const out = await fn(); setGame(out.game); return out; }
    catch (err) { setNote((err as Error)?.message || 'That didn’t work. Try again?'); return null; }
    finally { setBusy(false); setWaiting(null); }
  }
  function pick(file: File | undefined) {
    if (!file) return;
    if (shot) URL.revokeObjectURL(shot.url);
    setShot({ file, url: URL.createObjectURL(file) });
  }
  async function sendMine() {
    if (!shot) return;
    const spyAt = game?.players.findIndex(p => p.me) ?? -1;
    const athenaFirst = game && spyAt >= 0 && game.players[(spyAt + 1) % game.players.length]?.athena;
    const out = await run(async () => {
      const { image, contentType } = await photoForProof(shot.file);
      return api.spy(image, contentType, clue.trim(), answer.trim());
    }, athenaFirst ? 'looking' : null);
    if (out) { setShot(null); setClue('something '); setAnswer(''); }
  }
  async function sendForAthena() {
    if (!shot) return;
    const out = await run(async () => {
      const { image, contentType } = await photoForProof(shot.file);
      return api.athena(image, contentType);
    }, 'choosing');
    if (out) setShot(null);
  }

  const finished = game && game.done >= game.goal && !again;
  const replay = gameNo > 1;

  return (
    <div className="ispy" role="dialog" aria-label="I Spy">
      <header className="ispy-head">
        <h2>🔎 {game?.mission.title || 'I Spy'}{replay && !practice && <small className="ispy-replay-tag">Game {gameNo} · just for fun</small>}</h2>
        <button type="button" className="kid-btn" onClick={onClose}>✕ Close</button>
      </header>
      {finaleOn && game?.finale && <IspyFinale finale={game.finale} goal={game.goal} onClose={closeFinale} />}
      {practice && <p className="ispy-practice-note">Practice: this is what Thomas and Skylar see. Athena really looks at your photos, but nothing is saved and it doesn't count toward the mission.</p>}
      {!loaded ? <p className="ispy-wait">Opening the game…</p> : !game ? (
        <div className="ispy-stage"><p className="ispy-wait">There's no I Spy game going right now. When a grown-up starts the mission, it shows up here.</p></div>
      ) : (
        <>
          <Progress game={again && game.done >= game.goal ? { ...game, done: 0 } : game} />
          <Players game={game} />
          {round?.banter && <p className="ispy-banter"><AthenaAvatar className="ispy-face" /><span>{round.banter}</span></p>}
          {game.recent[0] && !round && !again && <LastRound r={game.recent[0]} />}

          <div className="ispy-stage">
            {finished ? (
              <div className="ispy-win"><span aria-hidden>🏆</span><h3>{replay ? `Game ${gameNo} done!` : 'You taught Athena I Spy!'}</h3><p>{practice ? `That was all ${game.goal} practice rounds. The kids play the real game once you press Go.` : replay ? `All ${game.goal} rounds again. That one was just for fun, so there's no new badge.` : `All ${game.goal} rounds done! Open Me to see your mission badges.`}</p>
                <div className="kid-move-actions ispy-win-actions">
                  {!practice && game.gameNo != null && <button type="button" className="kid-btn kid-btn-primary" onClick={() => setAgain(true)}>🔁 Play again</button>}
                  {game.finale && <button type="button" className="kid-btn ispy-finale-again" onClick={() => setFinaleOn(true)}>🎉 Watch the celebration</button>}
                </div>
                {!practice && game.gameNo != null && <small className="ispy-win-note">Another {game.goal} rounds with Athena, just for fun. No new badge.</small>}
              </div>
            ) : round ? (
              <div className="ispy-round">
                <div className="ispy-photo">{photo.url ? <img src={photo.url} alt="The I Spy photo" /> : photo.failed ? <button type="button" className="kid-btn" onClick={photo.retry}>↻ Reload photo</button> : <span aria-label="Loading photo">📷</span>}</div>
                <div className="ispy-side">
                  <p className="ispy-clue"><small>{round.spy.athena ? 'Athena spies' : `${round.spy.me ? 'You spy' : `${round.spy.name} spies`}`} with {round.spy.athena ? 'her' : round.spy.me ? 'your' : 'their'} little eye…</small><b>{round.clue}</b></p>
                  {!round.spy.athena && round.spy.me && round.answer && <p className="ispy-secret">Your secret: <b>{round.answer}</b></p>}
                  <ul className="ispy-guesses">
                    {round.guesses.map((g, i) => <li key={i} className={g.right === true ? 'right' : g.right === false ? 'wrong' : ''}><b>{g.athena ? 'Athena' : g.by}:</b> {g.text} <span aria-hidden>{g.right === true ? '✅' : g.right === false ? '❌' : '🤔'}</span>{g.aside && <small className="ispy-aside">{g.aside}</small>}</li>)}
                  </ul>
                  {round.hints.length > 0 && <ul className="ispy-hints">{round.hints.map((h, i) => <li key={i}>💡 {h}</li>)}</ul>}
                  <ClueTrail round={round} />

                  {/* A kid's round: Athena missed and asks the spy for a clue card. */}
                  {!round.spy.athena && round.clueAsked && round.spy.me && (
                    <div className="ispy-clue-ask">
                      <p><AthenaAvatar className="ispy-face" /> {busy ? 'Sharing the clue…' : 'Can I have a clue?'}</p>
                      <CluePicker key={round.clues.length} list={game.clueList} given={round.clues} busy={busy} onPick={key => void run(() => api.giveClue(round.uuid, key))} />
                    </div>
                  )}
                  {!round.spy.athena && round.clueAsked && !round.spy.me && <p className="ispy-wait">Athena asked {round.spy.name} for a clue…</p>}

                  {/* A kid's round: the spy says if Athena got it. */}
                  {!round.spy.athena && round.awaitingJudge && round.spy.me && (
                    <div className="ispy-judge">
                      <p>Is {lastGuess?.by || 'the guesser'} right?</p>
                      <div className="kid-move-actions">
                        <button type="button" className="kid-btn kid-btn-primary" disabled={busy} onClick={() => void run(() => api.judge(round.uuid, true))}>✅ Yes!</button>
                        <button type="button" className="kid-btn" disabled={busy} onClick={() => void run(() => api.judge(round.uuid, false, hint.trim() || undefined), lastGuess?.athena ? null : 'looking').then(() => setHint(''))}>❌ Nope</button>
                      </div>
                      <input className="ispy-input" value={hint} onChange={e => setHint(e.target.value)} placeholder="Give a hint (optional)" aria-label="Hint for the guessers" />
                    </div>
                  )}
                  {!round.spy.athena && round.awaitingJudge && !round.spy.me && <p className="ispy-wait">Waiting for {round.spy.name} to judge {lastGuess?.by || 'the player'}'s guess…</p>}
                  {!round.spy.athena && !round.awaitingJudge && !round.clueAsked && (
                    round.spy.me && (round.guesser ? round.guesser.athena : round.guesses.length === 0) && api.retry ? (
                      <div className="ispy-retry">
                        <p>{busy ? 'Athena is looking at your photo…' : "Athena hasn't guessed yet. Try the photo again."}</p>
                        <button type="button" className="kid-btn kid-btn-primary" disabled={busy} onClick={() => void run(() => api.retry!(round.uuid), 'looking')}>{busy ? 'Looking…' : '↻ Try again'}</button>
                      </div>
                    ) : !round.guesser?.me && <p className="ispy-wait">{round.guesser && !round.guesser.athena ? `It's ${round.guesser.name}'s turn to guess.` : '🤔 Athena is thinking…'}</p>
                  )}

                  {/* Only the server-selected non-spy may submit the next guess. */}
                  {round.spy.athena && round.guesser && !round.guesser.me && <p className="ispy-wait">It's {round.guesser.name}'s turn to guess.</p>}
                  {(round.guesser ? round.guesser.me : round.spy.athena) && !round.awaitingJudge && !round.clueAsked && (
                    <form className="ispy-guess" onSubmit={e => { e.preventDefault(); if (guess.trim()) void run(() => api.guess(round.uuid, guess.trim()), round.spy.athena ? null : 'looking').then(() => setGuess('')); }}>
                      <p className="ispy-your-guess">Your turn to guess!</p>
                      <input className="ispy-input" value={guess} onChange={e => setGuess(e.target.value)} placeholder="What is it?" aria-label="Your guess" autoComplete="off" />
                      <button type="submit" className="kid-btn kid-btn-primary" disabled={busy || !guess.trim()}>Guess</button>
                      {round.spy.athena && round.cluesLeft > 0 && <button type="button" className="kid-btn" disabled={busy} onClick={() => void run(() => api.askClue(round.uuid))}>🃏 Ask for a clue</button>}
                      {round.spy.athena && <button type="button" className="kid-btn" disabled={busy} onClick={() => void run(() => api.reveal(round.uuid))}>Give up</button>}
                    </form>
                  )}
                </div>
              </div>
            ) : game.turn.me || (game.turn.athena && (game.photoBy ? game.photoBy.me : true)) ? (
              <div className={`ispy-new${shot ? ' ispy-new-ready' : ''}`}>
                <h3>{game.turn.athena ? "Athena's turn to spy!" : 'Your turn to spy!'}</h3>
                <p className="ispy-new-help">{game.turn.athena ? 'Take a photo of the room. Athena will choose something for you both to guess in turn.' : 'Take a photo, pick something in it, and give the group a clue. Keep your answer secret!'}</p>
                <label className="kid-btn kid-btn-primary ispy-snap">
                  📸 {shot ? 'Take a different photo' : 'Take the photo'}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {shot && <img className="ispy-preview" src={shot.url} alt="Your photo" />}
                {shot && !game.turn.athena && (
                  <div className="ispy-form">
                    <label>I spy with my little eye… <input className="ispy-input" value={clue} onChange={e => setClue(e.target.value)} placeholder="something blue" /></label>
                    <label>Secret answer (only you see it) <input className="ispy-input" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="the blue cup" autoComplete="off" /></label>
                    <button type="button" className="kid-btn kid-btn-primary" disabled={busy || clue.trim().length < 3 || answer.trim().length < 2} onClick={() => void sendMine()}>{busy ? 'Sharing with the group…' : 'Send to Group'}</button>
                  </div>
                )}
                {shot && game.turn.athena && <button type="button" className="kid-btn kid-btn-primary ispy-start" disabled={busy} onClick={() => void sendForAthena()}>{busy ? 'Athena is choosing…' : 'Start Athena’s round'}</button>}
              </div>
            ) : (
              <p className="ispy-wait">{game.turn.athena ? `It's Athena's turn to spy. ${game.photoBy?.name || 'The other player'} is choosing the photo.` : `It's ${game.turn.name}'s turn to spy. Ask them to open I Spy while signed in to their own account.`}</p>
            )}
            {note && <p className="kid-note kid-note-warn ispy-error" role="alert">{note}</p>}
          </div>
        </>
      )}
    </div>
  );
}
