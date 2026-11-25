import { useCallback, useEffect, useRef, useState } from 'react';
import { levelsGained, standing, xpStore, type GameId, type Level } from './progress';
import './games.css';

/**
 * Game XP on screen: the bar with the kid's level and title, "+N" popups where
 * XP lands, and a level-up banner that doesn't stop play. See progress.ts for
 * what game XP is (and isn't).
 */

interface Pop { id: number; n: number; label?: string }

export function useGameXp(game: GameId, who: string, table: Level[]) {
  const [xp, setXp] = useState(() => xpStore.get(game, who));
  const xpRef = useRef(xp);
  const [run, setRun] = useState(0);
  const [pops, setPops] = useState<Pop[]>([]);
  const [levelUp, setLevelUp] = useState<Level | null>(null);
  const popId = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

  const add = useCallback((n: number, label?: string) => {
    if (n <= 0) return;
    const before = xpRef.current;
    const after = before + n;
    xpRef.current = after;
    xpStore.set(game, who, after);
    setXp(after);
    setRun(r => r + n);
    popId.current += 1;
    const id = popId.current;
    setPops(p => [...p.slice(-3), { id, n, label }]);
    timers.current.push(window.setTimeout(() => setPops(p => p.filter(x => x.id !== id)), 1400));
    const gained = levelsGained(before, after, table);
    if (gained.length) {
      setLevelUp(gained[gained.length - 1]);
      timers.current.push(window.setTimeout(() => setLevelUp(l => (l === gained[gained.length - 1] ? null : l)), 4200));
    }
  }, [game, who, table]);

  const resetRun = useCallback(() => setRun(0), []);
  return { xp, st: standing(xp, table), run, pops, levelUp, add, resetRun, dismissLevelUp: () => setLevelUp(null) };
}

export function XpBar({ xp, st, pops }: Pick<ReturnType<typeof useGameXp>, 'xp' | 'st' | 'pops'>) {
  return (
    <div className="gxp" aria-label={`Level ${st.level.level}, ${st.level.title}, ${xp} XP`}>
      <span className="gxp-lvl"><small>LV</small>{st.level.level}</span>
      <span className="gxp-body">
        <b>{st.level.title}</b>
        <span className="gxp-track"><i style={{ width: `${Math.round(st.progress * 100)}%` }} /></span>
        <small>{st.next ? `${st.into} / ${st.need} XP` : `${xp} XP · top level!`}</small>
      </span>
      {pops.map(p => <em key={p.id} className="gxp-pop">+{p.n}{p.label ? ` ${p.label}` : ''}</em>)}
    </div>
  );
}

export function LevelUpBanner({ level, onClose }: { level: Level | null; onClose: () => void }) {
  if (!level) return null;
  return (
    <button type="button" className="gxp-levelup" onClick={onClose} key={level.level}>
      <span className="gxp-levelup-burst" aria-hidden>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</span>
      <small>LEVEL UP!</small>
      <b>Level {level.level} · {level.title}</b>
      {level.unlock && <span>🔓 {level.unlock}</span>}
    </button>
  );
}
