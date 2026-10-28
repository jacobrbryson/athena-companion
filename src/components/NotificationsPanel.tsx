import { Drawer, Label, ago } from './Drawer';
import { ActionProposal } from './ActionProposal';
import type { ActionsState } from '../athena/useActions';
import type { DreamQuestion, InboxNotification } from '../api/dashboard';

/**
 * Everything Athena is waiting on you for, in one place.
 *
 * Two kinds, and nothing else: proposals she needs approved before she may act,
 * and the questions her dreaming left her holding. Both used to live somewhere
 * a person had to already know to look — approvals at the foot of a chat,
 * questions on the Dreams page — so the bell is where they meet. Approving
 * still goes through the same card and the same server confirm as in chat;
 * this panel adds a place to see them, not a second way to consent.
 */
export function NotificationsPanel({ actions, questions, inbox, recent, onAck, onAckAll, onOpenLink, onAnswer, onDismiss, onOpenActions, onClose }: {
  actions: ActionsState;
  questions: DreamQuestion[];
  /** Pushes she sent that nobody has acknowledged yet. */
  inbox: InboxNotification[];
  /** The last week of acknowledged ones, so a cleared one can still be found. */
  recent: InboxNotification[];
  onAck: (uuid: string) => void;
  onAckAll: () => void;
  /** Goes to the page a notification is about. */
  onOpenLink: (url: string) => void;
  /** Closes a question the person has already dealt with. */
  onDismiss: (uuid: string) => void;
  /** Opens chat and has her ask — the answer is a conversation, not a form. */
  onAnswer: () => void;
  onOpenActions: () => void;
  onClose: () => void;
}) {
  const proposals = actions.pending;
  const empty = !proposals.length && !questions.length && !inbox.length;
  return (
    <Drawer eyebrow="waiting on you" title="Notifications" onClose={onClose}
      footer={<button onClick={onOpenActions} className="w-full rounded-full border border-emerald-500/30 px-4 py-2 text-xs hover:bg-emerald-500/10">Actions &amp; permissions — what she may do, and what she has done ↗</button>}>
      {empty && <p className="text-sm opacity-60">Nothing is waiting for you. When she wants to add an event, save something, or ask what a dream was about, it shows up here.</p>}

      {inbox.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between"><Label>notifications</Label>
            {inbox.length > 1 && <button onClick={onAckAll} className="text-[11px] underline opacity-60 hover:opacity-100">Acknowledge all</button>}
          </div>
          <ul className="space-y-2">
            {inbox.map(n => (
              <li key={n.uuid} className="rounded border border-emerald-500/20 bg-white/[0.03] px-3 py-2">
                <p className="text-sm">{n.body}</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] opacity-45">{n.title} · {ago(n.createdAt)}</p>
                  <span className="flex gap-3">
                    {n.url && <button onClick={() => { onAck(n.uuid); onOpenLink(n.url!); }} className="text-[11px] underline opacity-80 hover:opacity-100">Open</button>}
                    <button onClick={() => onAck(n.uuid)} className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200">Acknowledge</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposals.length > 0 && (
        <section className="mb-8">
          <Label>to approve</Label>
          <ul className="space-y-3">
            {proposals.map(a => (
              <li key={a.uuid}>
                <ActionProposal action={a} busy={actions.busyUuid === a.uuid}
                  onConfirm={() => void actions.confirm(a.uuid)} onDecline={() => void actions.decline(a.uuid)} onDismiss={() => actions.dismiss(a.uuid)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <section className="mb-8">
          <Label>questions she&rsquo;s holding</Label>
          <ul className="space-y-2">
            {questions.map(q => (
              <li key={q.uuid} className="rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-2">
                <p className="text-sm">{q.question}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="font-mono text-[10px] opacity-45">from her dreaming · {ago(q.askedAt)}</p>
                  <button onClick={() => onDismiss(q.uuid)} className="text-[11px] underline opacity-60 hover:opacity-100">Already answered</button>
                </div>
              </li>
            ))}
          </ul>
          <button onClick={onAnswer} className="mt-3 h-10 w-full rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95">Answer in chat</button>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <Label>acknowledged this week</Label>
          <ul className="space-y-1">
            {recent.map(n => <li key={n.uuid} className="text-xs opacity-50">{n.body} <span className="font-mono text-[10px]">· {ago(n.createdAt)}</span></li>)}
          </ul>
        </section>
      )}
    </Drawer>
  );
}
