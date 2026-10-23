import { useRef } from 'react';
import { DashboardIcon } from './icons';

/** Shared accessible tab strip used by Property, System, and Family pages. */
export function SectionTabs<T extends string>({ tabs, active, onChange, label, panelId }: {
  tabs: readonly { id: T; label: string; icon: string }[];
  active: T;
  onChange: (tab: T) => void;
  label: string;
  panelId: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <nav className="property-nav" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-controls={panelId}
      aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
      ref={el => { buttons.current[index] = el; }} onClick={() => onChange(tab.id)} onKeyDown={e => {
        const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        e.preventDefault();
        onChange(tabs[next].id);
        buttons.current[next]?.focus();
      }}>
      <DashboardIcon name={tab.icon} bare /><span>{tab.label}</span>
    </button>)}
  </nav>;
}
