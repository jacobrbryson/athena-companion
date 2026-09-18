import { useState } from 'react';

/**
 * Athena's face, wherever the app used to show a letter A.
 *
 * The artwork is a static asset rather than anything generated, and it is
 * allowed to be missing: a build without it falls back to the original lettered
 * orb rather than an empty circle with a broken-image glyph in it. That matters
 * because this sits in the sidebar wordmark and the mobile nav — the two places
 * a gap would be impossible to miss.
 */
const AVATAR_SRC = '/assets/athena-avatar.png';

export function AthenaAvatar({ className = '', size }: { className?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className={`athena-orb ${failed ? 'athena-orb-letter' : 'athena-orb-avatar'} ${className}`.trim()} style={style}>
      {failed ? 'A' : <img src={AVATAR_SRC} alt="" aria-hidden="true" onError={() => setFailed(true)} draggable={false} />}
    </span>
  );
}
