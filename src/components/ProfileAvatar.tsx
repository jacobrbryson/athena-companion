import { useState } from 'react';

function safePictureUrl(value: string | null | undefined): string | undefined {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function ProfileAvatar({ picture, name }: { picture?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = safePictureUrl(picture);
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <span className="sidebar-profile-avatar" aria-label={`${name || 'Your'} profile picture`}>
      {src && !failed ? <img src={src} alt="" aria-hidden="true" onError={() => setFailed(true)} draggable={false} /> : initial}
    </span>
  );
}
