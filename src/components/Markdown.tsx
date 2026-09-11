import type { ReactNode } from 'react';

/**
 * Minimal Markdown for Athena's memory journal: headings, bullets, **bold**,
 * _italic_, and paragraphs. Deliberately tiny (no dependency, no raw HTML) —
 * the journal is generated server-side in exactly these shapes.
 */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    out.push(
      token.startsWith('**') ? (
        <strong key={i++} className="font-semibold text-emerald-50">
          {token.slice(2, -2)}
        </strong>
      ) : (
        <em key={i++} className="opacity-60">
          {token.slice(1, -1)}
        </em>
      )
    );
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`} className="mb-3 space-y-1.5">{list}</ul>);
    list = [];
  };

  source.split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^#{1,3}\s/.test(line)) {
      flush();
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s/, '');
      const cls =
        level === 1
          ? 'mb-3 font-mono text-sm uppercase tracking-[0.3em]'
          : level === 2
            ? 'mt-5 mb-2 font-mono text-[11px] uppercase tracking-[0.35em] text-emerald-300/80'
            : 'mt-3 mb-1 font-mono text-[10px] uppercase tracking-[0.3em] opacity-50';
      blocks.push(<p key={idx} className={cls}>{inline(text)}</p>);
    } else if (/^\s*-\s/.test(line)) {
      list.push(
        <li key={idx} className="flex gap-2 text-sm leading-relaxed">
          <span aria-hidden className="opacity-40">›</span>
          <span>{inline(line.replace(/^\s*-\s/, ''))}</span>
        </li>
      );
    } else if (/^\s{2,}\S/.test(raw) && list.length) {
      // Indented continuation of the previous bullet.
      list.push(
        <li key={idx} className="-mt-1 pl-4 text-sm leading-relaxed opacity-70">
          {inline(line.trim())}
        </li>
      );
    } else if (line.trim()) {
      flush();
      blocks.push(<p key={idx} className="mb-2 text-sm leading-relaxed">{inline(line)}</p>);
    } else {
      flush();
    }
  });
  flush();
  return <div>{blocks}</div>;
}
