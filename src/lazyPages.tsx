import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react';

/**
 * Pages and panels that are not on Home, split out of the main bundle.
 *
 * The phone (and a cold browser) has to parse every byte of the main bundle
 * before anything shows, so a page that is only ever opened from the nav
 * shouldn't be in it. Each export here has the same name and props as the
 * component it wraps, so callers only change their import line. A few seconds
 * after start-up the chunks are fetched anyway (warmLazyPages), so the first
 * visit to one of these pages doesn't wait either.
 */
const loaders: Array<() => Promise<unknown>> = [];
const RELOADED = 'athena.split-reload';

function split<C extends ComponentType<any>>(load: () => Promise<C>): (props: ComponentProps<C>) => JSX.Element {
  loaders.push(load);
  const Lazy = lazy(() => load().then((component) => {
    try { sessionStorage.removeItem(RELOADED); } catch { /* storage unavailable */ }
    return { default: component };
  }, (error) => {
    // A tab open across a deploy asks for chunk names the new build no longer
    // has. Reload once into the new build rather than unmount the app.
    let first = false;
    try { first = !sessionStorage.getItem(RELOADED); if (first) sessionStorage.setItem(RELOADED, '1'); } catch { /* storage unavailable */ }
    if (first) window.location.reload();
    throw error;
  }));
  return function SplitPage(props: ComponentProps<C>) {
    return <Suspense fallback={null}><Lazy {...(props as any)} /></Suspense>;
  };
}

// Dashboard pages
export const DoorToDoor = split(() => import('./components/DoorToDoor').then((m) => m.DoorToDoor));
export const ModelsPage = split(() => import('./components/ModelsPage').then((m) => m.ModelsPage));
export const EmergencyAlertSetup = split(() => import('./components/EmergencyAlertSetup').then((m) => m.EmergencyAlertSetup));
export const Workplaces = split(() => import('./components/Workplaces').then((m) => m.Workplaces));
export const WorkoutsPanel = split(() => import('./components/Workouts').then((m) => m.WorkoutsPanel));
export const FamilyFinance = split(() => import('./components/FamilyFinance').then((m) => m.FamilyFinance));
export const FamilyProvisions = split(() => import('./components/FamilyProvisions').then((m) => m.FamilyProvisions));
export const FamilyTrading = split(() => import('./components/FamilyTrading').then((m) => m.FamilyTrading));
export const ResearchPage = split(() => import('./components/ResearchPage').then((m) => m.ResearchPage));
export const GuardiansPage = split(() => import('./components/GuardiansPage').then((m) => m.GuardiansPage));
export const WorkspacePage = split(() => import('./components/WorkspacePage').then((m) => m.WorkspacePage));
export const PropertySecurity = split(() => import('./components/PropertySecurity').then((m) => m.PropertySecurity));

// Console panels (drawers opened from the menu)
export const MemoryPanel = split(() => import('./components/MemoryPanel').then((m) => m.MemoryPanel));
export const PhotoMemory = split(() => import('./components/PhotoMemory').then((m) => m.PhotoMemory));
export const CameraPanel = split(() => import('./components/CameraPanel').then((m) => m.CameraPanel));
export const DevicesPanel = split(() => import('./components/DevicesPanel').then((m) => m.DevicesPanel));
export const ActionsPanel = split(() => import('./components/ActionsPanel').then((m) => m.ActionsPanel));
export const InitiativePanel = split(() => import('./components/InitiativePanel').then((m) => m.InitiativePanel));
export const KnowsPanel = split(() => import('./components/KnowsPanel').then((m) => m.KnowsPanel));

let warmed = false;
/** Fetch every split chunk once the first screen is up, so later navigation is instant. */
export function warmLazyPages(delayMs = 4000) {
  if (warmed) return;
  warmed = true;
  setTimeout(() => {
    const run = () => loaders.forEach((load) => { load().catch(() => { /* retried on first use */ }); });
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(run, { timeout: 4000 });
    else run();
  }, delayMs);
}
