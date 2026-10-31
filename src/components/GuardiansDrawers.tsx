import type { ReactNode } from 'react';
import type { GmGuardian, GmMission, GmTeamMember, GuardiansOverview } from '../api/guardianMissions';
import { Drawer } from './Drawer';
import { ACTIVITY_GLYPH, Crest, PRACTICE, SKILL_NAME, SKILL_STYLE, ago, type GuardiansDetail } from './GuardiansOverview';

/**
 * The side drawers on the Guardians page: one Guardian, one skill, one
 * mission. Each looks its subject up in the page's data on every render, so a
 * control used inside a drawer shows its result there. Mission and skill-badge
 * controls come in from GuardiansPage.tsx, which owns them.
 */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Stats({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return <ul className="gm-stats">{rows.map(r => <li key={r.label}><strong>{r.value}</strong><small>{r.label}</small></li>)}</ul>;
}

export function GuardianDrawer({ data, name, onAsk, onClose, children }: {
  data: GuardiansOverview; name: string; onAsk: (text: string) => void; onClose: () => void;
  /** Skill badges and the form that adds one; only this family's own kids have them. */
  children: (guardian: GmGuardian) => ReactNode;
}) {
  const g = data.team?.roster.find(m => m.name === name);
  if (!g) return null;
  const own = data.guardians.find(k => k.name === name);
  return <Drawer eyebrow="Guardian" title={g.name} onClose={onClose}>
    <div className="gm-dr">
      <div className="gm-dr-head">
        <Crest name={g.name} />
        <span>
          <b>Level {g.level} · {g.role}</b>
          <small>{g.levelProgress}% of the way to level {g.level + 1}</small>
          <span className="gm-meter"><i style={{ width: `${Math.max(g.levelProgress, 4)}%` }} /></span>
        </span>
      </div>
      <section>
        <h3>On the record</h3>
        <Stats rows={[
          { label: 'Clue cards found', value: g.finds },
          { label: 'Trail keys decoded', value: g.trailKeys },
          { label: 'Map pieces reported', value: g.contributions },
          { label: 'Missions started', value: g.missionsStarted },
          { label: 'Checked in with Athena', value: g.checkedIn ? 'Yes' : 'Not yet' },
          ...(own ? [{ label: 'Skill badges', value: g.badges }] : []),
        ]} />
      </section>
      {own && <section><h3>Skill badges</h3>{children(own)}</section>}
      <section>
        <h3>Recent activity</h3>
        {g.recent.length ? <ul className="gm-activity">{g.recent.map((r, i) => <li key={i}>
          <i aria-hidden="true">{ACTIVITY_GLYPH[r.kind]}</i>
          <span><b>{r.text[0].toUpperCase() + r.text.slice(1)}</b><small>{ago(r.at)}</small></span>
        </li>)}</ul> : <p className="gm-sub">Nothing recorded yet.</p>}
      </section>
      <p className="gm-sub">A level comes from what a Guardian has done, and their role from where most of it is. It shows what happened on missions, not how good they are.</p>
      {own && <button type="button" className="gm-btn gm-dr-ask" onClick={() => { onClose(); onAsk(`How is ${g.name} doing with the Guardians?`); }}>Ask Athena about {g.name}</button>}
    </div>
  </Drawer>;
}

/** Each skill's count, per Guardian: the same numbers the team's percent adds up. */
const CONTRIBUTION: Record<string, (g: GmTeamMember) => { n: number; text: string }> = {
  planning: g => ({ n: g.missionsStarted, text: plural(g.missionsStarted, 'mission') + ' started' }),
  teamwork: g => ({ n: g.contributions, text: plural(g.contributions, 'map piece') }),
  problemSolving: g => ({ n: g.trailKeys, text: plural(g.trailKeys, 'trail key') }),
  observation: g => ({ n: g.finds, text: plural(g.finds, 'clue card') }),
  communication: g => ({ n: g.checkedIn ? 1 : 0, text: 'Checked in' }),
  realWorldTools: g => ({ n: g.badges, text: plural(g.badges, 'badge') }),
};

export function SkillDrawer({ data, skillKey, onAsk, onOpen, onClose }: {
  data: GuardiansOverview; skillKey: string; onAsk: (text: string) => void; onOpen: (d: GuardiansDetail) => void; onClose: () => void;
}) {
  const skill = data.team?.skills.find(s => s.key === skillKey);
  if (!skill) return null;
  const style = SKILL_STYLE[skill.key];
  const count = CONTRIBUTION[skill.key];
  const who = (data.team?.roster || []).map(g => ({ g, ...count(g) })).filter(r => r.n > 0).sort((a, b) => b.n - a.n);
  const practice = PRACTICE.filter(p => p.skills.includes(skill.key));
  return <Drawer eyebrow="Team skill" title={skill.name} onClose={onClose}>
    <div className="gm-dr">
      <Stats rows={[{ label: 'Team progress', value: skill.percent == null ? 'Not started' : `${skill.percent}%` }, { label: 'Counted so far', value: `${skill.done} / ${skill.total}` }]} />
      <section><h3>What this counts</h3><p className="gm-sub">{skill.detail}.</p></section>
      {style && <section><h3>{style.focus}</h3><p className="gm-sub">{style.blurb}</p></section>}
      <section>
        <h3>Who has done this</h3>
        {who.length ? <ul className="gm-dr-people">{who.map(r => <li key={r.g.name}>
          <button type="button" onClick={() => onOpen({ kind: 'guardian', name: r.g.name })}>{r.g.name}<em>{r.text}</em></button>
        </li>)}</ul> : <p className="gm-sub">Nobody's name is on this one yet.</p>}
      </section>
      {!!practice.length && <section>
        <h3>Where missions practice it</h3>
        <ul className="gm-activity">{practice.map(p => <li key={p.title}><i aria-hidden="true">{p.glyph}</i><span><b>{p.title}</b><small>{p.text}</small></span></li>)}</ul>
      </section>}
      <button type="button" className="gm-btn gm-dr-ask" onClick={() => { onClose(); onAsk(`How can the Guardians practice ${(SKILL_NAME[skill.key] || skill.name).toLowerCase()}?`); }}>Ask Athena how to practice</button>
    </div>
  </Drawer>;
}

export function AbilityDrawer({ data, abilityKey, onClose }: { data: GuardiansOverview; abilityKey: string; onClose: () => void }) {
  const ability = data.abilities?.find(a => a.key === abilityKey);
  if (!ability) return null;
  const next = ability.next;
  return <Drawer eyebrow="Athena's ability" title={ability.name} onClose={onClose}>
    <div className="gm-dr">
      <Stats rows={[{ label: 'Strength', value: `${ability.percent}%` }, { label: 'Reach proven', value: ability.reach || 'None yet' }]} />
      <section><h3>What this is</h3><p className="gm-sub">{ability.description}</p></section>
      {next && <section>
        <h3>Next: {next.name}</h3>
        <p className="gm-sub">{plural(next.proven, 'tool')} of {next.total} proven at this reach.{next.peopleOnly ? ' This has to be proven with real people.' : ''}</p>
      </section>}
      <section>
        <h3>The tools behind it</h3>
        {ability.capabilities.length ? <ul className="gm-activity">{ability.capabilities.map(c => <li key={c.key}>
          <i aria-hidden="true">{c.badge || '🧰'}</i>
          <span><b>{c.name}</b><small>{c.proven ? 'Proven' : 'Not proven yet'}</small></span>
        </li>)}</ul> : <p className="gm-sub">No tools feed this yet.</p>}
      </section>
    </div>
  </Drawer>;
}

const EYEBROW: Partial<Record<GmMission['status'], string>> = { proposed: 'Waiting for your approval', running: 'Active mission', paused: 'Paused mission', completed: 'Completed mission' };

export function MissionDrawer({ data, uuid, onClose, children }: {
  data: GuardiansOverview; uuid: string; onClose: () => void;
  /** The mission's card with its own controls (approve, pause, stop). */
  children: (mission: GmMission) => ReactNode;
}) {
  const m = [...data.active, ...data.proposed, ...data.history].find(x => x.uuid === uuid);
  if (!m) return null;
  const clues = data.team?.clues;
  const done = m.steps.filter(s => s.status === 'done').length;
  return <Drawer eyebrow={EYEBROW[m.status] || 'Mission'} title={m.title} wide onClose={onClose}>
    <div className="gm-dr">
      {clues?.mission === m.key && <section>
        <h3>Clue cards</h3>
        <span className="gm-meter-row"><span className="gm-meter"><i style={{ width: `${clues.total ? Math.round((clues.found / clues.total) * 100) : 0}%` }} /></span><em>{clues.found} / {clues.total}</em></span>
      </section>}
      {!!m.steps.length && <p className="gm-sub">{done} of {plural(m.steps.length, 'step')} done.</p>}
      {children(m)}
    </div>
  </Drawer>;
}
