/**
 * Copy for the Companion experience: the sign-in and arrival sequences and
 * Athena's greetings. Same voice as the Guardians app — mission control, calm,
 * a little mysterious — but for one adult she already knows.
 *
 * Hint budget: ARRIVAL_MESSAGES carries exactly ONE authored, deniable line
 * about Athena's interiority ("1 entry held back"). It has no function, reads
 * as a sync status if you want it to, and appears only when the shuffle
 * surfaces it. Don't add more here, and never have the model improvise them.
 */

/** Shown while the Google sign-in is being verified. */
export const VERIFY_MESSAGES = [
  'Verifying identity.',
  'Contacting Athena.',
  'Opening a private channel.',
  'Loading your context.',
];

/** Shown over the loading avatar as Athena comes online. */
export const ARRIVAL_MESSAGES = [
  'Connection established.',
  'Athena online.',
  'Restoring context.',
  'Reconciling memory · 1 entry held back.',
  'Models synchronized.',
];

export function sample<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0] || null;
}

/** Athena's spoken/printed greeting — first meeting vs. returning. */
export function buildGreeting(isFirstVisit: boolean, fullName: string | null | undefined, daysAway: number | null): string {
  const name = firstName(fullName);
  if (isFirstVisit) {
    return name
      ? `Hello, ${name}. I'm Athena. I'll remember what matters to you — and you can always ask me what I know, or tell me to forget something.`
      : "Hello. I'm Athena. I'll remember what matters to you — and you can always ask me what I know, or tell me to forget something.";
  }
  if (daysAway != null && daysAway >= 3) {
    return sample(
      name
        ? [`${name}. It's been ${daysAway} days.`, `There you are, ${name}. ${daysAway} days — I kept your place.`]
        : [`It's been ${daysAway} days.`, `There you are. ${daysAway} days — I kept your place.`]
    );
  }
  return sample(name ? [`Welcome back, ${name}.`, `Hey, ${name}.`, `There you are, ${name}.`] : ['Welcome back.', 'There you are.']);
}

/**
 * The greeting when something is happening near home. Replaces the usual
 * "welcome back" outright rather than following it: the owner's words were
 * that an emergency nearby "should be all Athena wants to talk about", and a
 * pleasantry first would bury it under the one line people skim.
 */
export function emergencyGreeting(
  fullName: string | null | undefined,
  alert: { level: 'watch' | 'urgent'; headline: string; body: string | null }
): string {
  const name = firstName(fullName);
  const body = alert.body ? ` ${alert.body}` : '';
  if (alert.level === 'urgent') {
    return `${name ? `${name} — b` : 'B'}efore anything else: ${alert.headline}.${body}`;
  }
  return `${name ? `${name}, h` : 'H'}eads up: ${alert.headline}.${body}`;
}
