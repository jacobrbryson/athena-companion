import { useCallback, useEffect, useState } from 'react';
import { Drawer, Label } from './Drawer';
import { CADENCES, type Sight } from '../athena/useSight';
import { actionsApi, type Scene } from '../api/companion';

const LOOK_ACTION = 'look_through_camera';

/**
 * The controls for Athena's eyes. The eyes themselves live in `useSight`,
 * owned by the console — closing this drawer must not blind her, which is
 * exactly what it did when the stream lived in here.
 *
 * So this component holds no camera state at all. It shows you what she can
 * see, and it is the only place you can turn that on and off.
 */
export function CameraPanel({
  sight,
  onClose,
  onTalkAbout,
}: {
  sight: Sight;
  onClose: () => void;
  onTalkAbout: (scene: Scene) => void;
}) {
  // A callback ref, not an effect: the <video> only exists while the drawer is
  // mounted, and it has to pick the stream up the moment it appears.
  const preview = useCallback(
    (el: HTMLVideoElement | null) => sight.attachPreview(el),
    [sight]
  );

  const live = sight.lookedAt != null && Date.now() - sight.lookedAt < 20_000;
  const cadence = CADENCES.find((c) => c.ms === sight.intervalMs) ?? CADENCES[1];

  // Whether she may open the camera herself. This is the person's real off
  // switch — turning sight off below only ends the background loop, while
  // revoking this stops the server writing look requests at all.
  const [mayLook, setMayLook] = useState<boolean | null>(null);
  const [canGrant, setCanGrant] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void actionsApi
      .status()
      .then((s) => {
        if (cancelled) return;
        setMayLook(s.authorities.some((a) => a.action_id === LOOK_ACTION));
        // Not available means the family has not accepted the consent this
        // needs, so offering a switch that cannot work would be a lie.
        setCanGrant(s.available.includes(LOOK_ACTION));
      })
      .catch(() => !cancelled && setMayLook(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleAuthority() {
    if (mayLook === null || authBusy) return;
    setAuthBusy(true);
    try {
      const next = !mayLook;
      const { authorities } = next
        ? await actionsApi.grantAuthority(LOOK_ACTION)
        : await actionsApi.revokeAuthority(LOOK_ACTION);
      setMayLook(authorities.some((a) => a.action_id === LOOK_ACTION));
    } catch {
      /* the switch simply does not move */
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <Drawer eyebrow="perception" title="Let Athena see" onClose={onClose}>
      <div className="relative overflow-hidden rounded border border-emerald-500/20 bg-black">
        <video ref={preview} muted playsInline className="h-56 w-full bg-black object-contain" aria-label="Camera preview" />

        {!sight.enabled && !sight.cameraLive && (
          <div className="absolute inset-0 grid place-items-center bg-black/70">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-50">camera off</span>
          </div>
        )}
        {sight.athenaLooking && (
          <div className="absolute inset-x-2 bottom-2 rounded bg-emerald-500/90 px-2 py-1 text-[11px] leading-snug text-black">
            <strong>She asked to look.</strong> {sight.athenaLooking.reason ?? 'No reason given.'}
          </div>
        )}
        {(sight.enabled || sight.cameraLive) && (
          <div className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-black/70 px-2 py-1">
            <span className={`h-2 w-2 rounded-full ${sight.busy ? 'bg-emerald-300 animate-pulse' : 'bg-red-500'}`} />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-80">
              {sight.busy ? 'looking' : 'she can see'}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={sight.toggle}
          className={`h-11 flex-1 rounded-full text-sm font-semibold active:scale-95 ${
            sight.enabled ? 'border border-emerald-500/30 hover:bg-emerald-500/10' : 'bg-emerald-500/80 text-black'
          }`}
        >
          {sight.enabled ? 'Turn off her sight' : 'Let her see'}
        </button>
        <button
          onClick={() => void sight.lookNow()}
          disabled={!sight.enabled || sight.busy}
          className="h-11 rounded-full border border-emerald-500/30 px-4 text-sm hover:bg-emerald-500/10 disabled:opacity-30"
        >
          Look now
        </button>
        <button
          onClick={sight.flip}
          disabled={!sight.enabled}
          aria-label="Switch camera"
          title="Switch camera"
          className="h-11 w-11 shrink-0 rounded-full border border-emerald-500/30 text-base hover:bg-emerald-500/10 disabled:opacity-30"
        >
          🔄
        </button>
      </div>

      {sight.enabled && (
        <p className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/5 p-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] opacity-70">
          She keeps seeing after you close this. There is an eye in the top bar while she can.
        </p>
      )}

      <div className="mt-4 rounded border border-emerald-500/20 p-3">
        <Label>can she look on her own?</Label>
        {canGrant ? (
          <>
            <button
              onClick={toggleAuthority}
              disabled={mayLook === null || authBusy}
              aria-pressed={mayLook === true}
              className={`h-11 w-full rounded-full text-sm font-semibold active:scale-95 disabled:opacity-40 ${
                mayLook ? 'bg-emerald-500/80 text-black' : 'border border-emerald-500/30 hover:bg-emerald-500/10'
              }`}
            >
              {mayLook === null
                ? 'Checking…'
                : mayLook
                  ? 'She may take a look when it helps'
                  : 'She must ask every time'}
            </button>
            <p className="mt-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] opacity-40">
              {mayLook
                ? 'She can open the camera herself when seeing would answer what you are discussing. Every look says why, shows on screen while it happens, and the camera closes again afterwards. Turn this off and she goes back to asking.'
                : 'She will put a card on screen and wait for you before any look she asks for.'}
            </p>
          </>
        ) : (
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] opacity-40">
            Needs the actions consent for your family first — Connected apps → consent.
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <Label>how often she looks on her own</Label>
          <select
            value={sight.intervalMs}
            onChange={(e) => sight.setIntervalMs(Number(e.target.value))}
            className="h-11 w-full rounded-full bg-white/5 px-4 text-sm outline-none focus:bg-white/10"
          >
            {CADENCES.map((c) => (
              <option key={c.ms} value={c.ms} className="bg-black">
                {c.label} — {c.note}
              </option>
            ))}
          </select>
          <p className="mt-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] opacity-40">
            {cadence.note}. She also takes a fresh look whenever you send her a message, so asking
            "what do you think of this?" always uses a current view.
          </p>
        </div>

        {sight.cameras.length > 1 && (
          <div>
            <Label>which camera</Label>
            <select
              value={sight.deviceId}
              onChange={(e) => sight.setDeviceId(e.target.value)}
              className="h-11 w-full rounded-full bg-white/5 px-4 text-sm outline-none focus:bg-white/10"
            >
              <option value="" className="bg-black">
                {sight.facingMode === 'environment' ? 'Back camera' : 'Front camera'}
              </option>
              {sight.cameras.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId} className="bg-black">
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sight.scene && (
        <div className="mt-5 rounded border border-emerald-500/20 bg-white/[0.03] p-3">
          <Label>
            {live ? 'she can see this now' : 'last thing she saw'}
            {sight.scene.servedBy ? ` · ${sight.scene.servedBy}` : ''}
          </Label>
          <p className="text-sm leading-relaxed opacity-90">
            {sight.scene.summary || 'Nothing she could describe.'}
          </p>

          {sight.scene.objects.length > 0 && (
            <ul className="mt-3 space-y-1">
              {sight.scene.objects.slice(0, 6).map((o, i) => (
                <li key={`${o.label}-${i}`} className="font-mono text-[11px] opacity-70">
                  {o.description || o.label}
                  {o.distance_m != null ? ` · ~${o.distance_m}m` : ''}
                </li>
              ))}
            </ul>
          )}

          {sight.scene.hazards.length > 0 && (
            <p className="mt-3 text-xs" style={{ color: 'var(--gd-error)' }}>
              {sight.scene.hazards.join(' · ')}
            </p>
          )}

          <button
            onClick={() => onTalkAbout(sight.scene!)}
            className="mt-3 h-10 w-full rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95"
          >
            Ask her about it
          </button>
        </div>
      )}

      {sight.error && (
        <p className="mt-3 text-xs" style={{ color: 'var(--gd-error)' }}>
          {sight.error}
        </p>
      )}

      <p className="mt-6 font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] opacity-40">
        Frames are sent to Athena's vision model and not kept — she stores only what she saw. She sees
        a scene, not who is in it. She can only open the camera herself while you allow it above,
        and every look she takes is recorded in Actions.
      </p>
    </Drawer>
  );
}
