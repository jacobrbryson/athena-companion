import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import './actionControls.css';

/** Navigation uses a text link; drawer actions use a bordered button. */
export function NavigationLink({ children, onNavigate, onClick, className = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; onNavigate?: () => void }) {
  return <a {...props} className={`app-navigation-link ${className}`} onClick={e => {
    onClick?.(e);
    if (e.defaultPrevented || !onNavigate || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); onNavigate();
  }}>{children}<span aria-hidden="true">→</span></a>;
}

export function DrawerButton({ children, primary = false, className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button {...props} type={type} className={`app-drawer-button${primary ? ' app-drawer-button-primary' : ''} ${className}`}>{children}</button>;
}
