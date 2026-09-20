const PRIVACY_URL = '/privacy';
const TERMS_URL = '/terms';

/** Public legal links shown before sign-in and beside SMS consent. */
export function LegalLinks() {
  return (
    <span className="font-mono text-[10px] opacity-50">
      <a className="underline hover:opacity-100" href={PRIVACY_URL}>
        Privacy Policy
      </a>
      <span className="mx-2 opacity-60">·</span>
      <a className="underline hover:opacity-100" href={TERMS_URL}>
        Terms of Service
      </a>
    </span>
  );
}
