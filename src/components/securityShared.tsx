import { useEffect, useState, type ReactNode } from 'react';
import { propertySecurityApi } from '../api/propertySecurity';

export type IconName = 'hub' | 'camera' | 'doorbell' | 'motion' | 'storage' | 'refresh' | 'bell' | 'expand' | 'clip' | 'star' | 'trash' | 'close' | 'play' | 'person' | 'paw' | 'car' | 'plus' | 'eye' | 'package';

/** The few line icons this page draws, in the concept's thin cyan stroke. */
export function Icon({ name }: { name: IconName }) {
  const paths: Record<string, ReactNode> = {
    hub: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="m4 7 8 4 8-4M12 11v10" /></>,
    camera: <><rect x="3" y="7" width="18" height="12" rx="3" /><circle cx="12" cy="13" r="3.2" /><path d="M8 7l1.5-2.5h5L16 7" /></>,
    doorbell: <><rect x="7" y="3" width="10" height="18" rx="3" /><circle cx="12" cy="8" r="1.6" /><circle cx="12" cy="15" r="2.6" /></>,
    motion: <><circle cx="14" cy="4.5" r="1.8" /><path d="m9 21 3-6 3 3v3M7 11l3-3 4 1 2 3 3 1M12 15l-1-5" /></>,
    storage: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 21v-5h-5" /></>,
    bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
    expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
    clip: <><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10 5-3v10l-5-3" /></>,
    star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    play: <path d="M8 5v14l11-7z" />,
    person: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    paw: <><circle cx="7" cy="10" r="1.8" /><circle cx="10.5" cy="6.5" r="1.8" /><circle cx="14.5" cy="6.5" r="1.8" /><circle cx="18" cy="10" r="1.8" /><ellipse cx="12.5" cy="16" rx="4.5" ry="3.6" /></>,
    car: <><path d="M4 16v-4l2-5h12l2 5v4z" /><path d="M4 12h16" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    package: <><path d="M3 8l9-4 9 4v8l-9 4-9-4z" /><path d="M3 8l9 4 9-4" /><path d="M12 12v8" /></>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg className="ps-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/**
 * Object URLs for kept media, fetched once per page visit. Every fetch is an
 * audited read on the server, so the page never re-downloads what it has.
 */
export const mediaUrls = new Map<string, Promise<string>>();
export function mediaUrl(id: string) {
  let url = mediaUrls.get(id);
  if (!url) {
    url = propertySecurityApi.mediaBlob(id).then(blob => URL.createObjectURL(blob));
    url.catch(() => mediaUrls.delete(id));
    mediaUrls.set(id, url);
  }
  return url;
}
export function useMediaUrl(id: string | null) {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    mediaUrl(id).then(u => { if (alive) setUrl({ id, url: u }); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return url && url.id === id ? url.url : null;
}

