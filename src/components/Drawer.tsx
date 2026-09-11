import { useEffect, type ReactNode } from 'react';

/**
 * Slide-over panel in the console's terminal style. Covers the full screen on
 * phones, a right-hand column on wider screens. Escape or the backdrop closes it.
 */
export function Drawer({
  eyebrow,
  title,
  onClose,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <section className="relative flex h-full w-full max-w-md flex-col border-l border-emerald-500/20 bg-black/95 text-emerald-50 shadow-2xl shadow-black animate-missionSlide">
        <header className="flex items-start justify-between border-b border-emerald-500/15 px-4 py-3 font-mono">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-40">{eyebrow}</p>
            <h2 className="mt-1 truncate text-sm uppercase tracking-[0.3em] gd-glitch" data-text={title}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="rounded border border-emerald-500/30 px-2 py-1 text-xs leading-none hover:bg-emerald-500/10"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-emerald-500/15 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </section>
    </div>
  );
}

/** Small mono section label used inside drawers. */
export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.35em] opacity-50">{children}</p>;
}

/** Relative time ("3d ago") for memory rows. */
export function ago(when: string | number | null | undefined): string {
  if (!when) return '';
  const t = new Date(when).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 45) return `${Math.round(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
