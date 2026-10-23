import type { ReactNode } from 'react';
import { DashboardIcon } from './icons';

type MetricTone = 'good' | 'ok' | 'low' | 'alert' | 'idle';

/** Compact section metric tile shared by Property and other section pages. */
export function Stat({ label, value, note, tone, icon, onClick, nowrap = false }: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: MetricTone;
  icon?: string;
  onClick?: () => void;
  nowrap?: boolean;
}) {
  const valueClasses = [icon && typeof value === 'string' && value.length > 8 ? 'stat-small' : '', nowrap ? 'stat-nowrap' : ''].filter(Boolean).join(' ') || undefined;
  const reading = <><span>{label}</span><strong className={valueClasses}>{value}</strong></>;
  const className = `stat-tile${tone ? ` stat-${tone}` : ''}${icon ? ' stat-with-icon' : ''}${onClick ? ' stat-tile-action' : ''}`;
  const content = <>{icon ? <div className="stat-main"><div className="stat-icon"><DashboardIcon name={icon} bare /></div><div className="stat-reading">{reading}</div></div> : reading}{note && <small>{note}</small>}</>;
  return onClick
    ? <button type="button" className={className} data-icon={icon} onClick={onClick}>{content}</button>
    : <div className={className} data-icon={icon}>{content}</div>;
}
