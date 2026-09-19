import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeJpeg } from '../components/photoStore';
import { visionApi, type LookRequest, type Scene } from '../api/companion';

/**
 * Athena's eyes, owned by the console rather than by a panel.
 *
 * The first version of this lived inside the camera drawer, so closing the
 * drawer tore the stream down and she went blind — which is not what anyone
 * means by "let her see". Sight is a property of the session: you turn it on,
 * it stays on until you turn it off or leave, and the panel is only controls.
 *
 * ## Two video elements, one stream
 *
 * `lookNow()` has to draw a frame from somewhere, and the drawer's <video> does
 * not exist while the drawer is closed. So the hook keeps its OWN element,
 * rendered permanently (and invisibly) by the console, and the drawer attaches
 * a second element to the same stream purely to show you what she can see.
 *
 * The hidden element is in the DOM rather than detached: browsers are entitled
 * to stall a detached video, and a stalled video yields `videoWidth === 0`,
 * which looks exactly like a camera that silently stopped working.
 *
 * ## Looks she asks for herself
 *
 * With a standing approval for `look_through_camera`, Athena can decide a look
 * would help and propose one without a card. The server cannot reach a camera,
 * so that action writes an `athena_look_request` and this hook answers it —
 * borrowing the camera if it is not already open, and giving it straight back.
 *
 * Three rules make that defensible rather than alarming:
 *
 *   1. **A request is never an instruction.** It carries her reason; this hook
 *      decides whether it can be honoured and declines out loud when not.
 *   2. **A borrowed camera is always visible.** `athenaLooking` drives the same
 *      indicator as ordinary sight, and it is set before `getUserMedia` is
 *      called, not after the frame comes back.
 *   3. **It is given back.** A camera opened for one look closes after it. She
 *      never silently inherits a live camera from a look she asked for.
 *
 * Revoking the standing approval stops requests being written at all, which is
 * the person's real off switch — turning sight off here only ends the loop.
 */

export const CADENCES = [
  { ms: 15_000, label: 'Every 15 seconds', note: 'closest to live, costs the most' },
  { ms: 60_000, label: 'Every minute', note: 'a good default' },
  { ms: 300_000, label: 'Every 5 minutes', note: 'ambient only' },
  { ms: 0, label: 'Only when I ask', note: 'she looks when you send a message' },
] as const;

/** Long edge of the frame we send. The server prompt assumes ~640px keyframes. */
const FRAME_PX = 640;

/** Consecutive failures before we stop rather than hammer a broken endpoint. */
const MAX_FAILURES = 3;

/** How long a send will wait for a fresh look before going without one. */
export const LOOK_BEFORE_SEND_MS = 3000;

/** Safety net for requests; the console also checks as soon as she replies. */
const REQUEST_POLL_MS = 15_000;

/** How long a borrowed camera gets to produce its first decoded frame. */
const WARMUP_MS = 4000;

export type FacingMode = 'user' | 'environment';

export interface Sight {
  enabled: boolean;
  busy: boolean;
  scene: Scene | null;
  lookedAt: number | null;
  error: string | null;
  cameras: MediaDeviceInfo[];
  deviceId: string;
  facingMode: FacingMode;
  intervalMs: number;
  /** Set while Athena is taking a look she asked for. Drives the indicator. */
  athenaLooking: LookRequest | null;
  /** True whenever the camera is actually open, for any reason. */
  cameraLive: boolean;
  hiddenVideoRef: React.RefObject<HTMLVideoElement>;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  setDeviceId: (id: string) => void;
  flip: () => void;
  setIntervalMs: (ms: number) => void;
  lookNow: () => Promise<boolean>;
  /** Check whether she has asked to see something. Cheap; safe to call often. */
  checkRequests: () => void;
  attachPreview: (el: HTMLVideoElement | null) => void;
}

export function useSight(active: boolean): Sight {
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const failures = useRef(0);
  // Requests already handled, so a poll landing mid-look cannot start a second
  // camera for the same request.
  const handled = useRef<Set<string>>(new Set());
  const honouring = useRef(false);

  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scene, setScene] = useState<Scene | null>(null);
  const [lookedAt, setLookedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [intervalMs, setIntervalMs] = useState<number>(CADENCES[1].ms);
  const [athenaLooking, setAthenaLooking] = useState<LookRequest | null>(null);
  const [cameraLive, setCameraLive] = useState(false);

  // ------------------------------------------------------------- stream ---

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraLive(false);
    if (hiddenVideoRef.current) hiddenVideoRef.current.srcObject = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  const attachPreview = useCallback((el: HTMLVideoElement | null) => {
    previewRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      void el.play().catch(() => {});
    }
  }, []);

  const openStream = useCallback(
    async (facing: FacingMode, explicitDevice: string) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        // An explicit device wins; otherwise front/back, which is the control
        // that matters on a phone and is meaningless on a desktop.
        video: explicitDevice ? { deviceId: { exact: explicitDevice } } : { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      setCameraLive(true);
      for (const el of [hiddenVideoRef.current, previewRef.current]) {
        if (!el) continue;
        el.srcObject = stream;
        await el.play().catch(() => {});
      }
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      return stream;
    },
    []
  );

  const describeCameraError = (err: unknown) => {
    const name = (err as Error).name;
    return name === 'NotAllowedError'
      ? 'This browser blocked the camera. Allow it for this site and try again.'
      : name === 'NotFoundError'
        ? 'No camera found on this device.'
        : name === 'OverconstrainedError'
          ? 'That camera is not available. Try the other one.'
          : (err as Error).message || 'Could not open the camera.';
  };

  // Open while enabled; reopen when the chosen camera or facing changes. The
  // cleanup MUST release the tracks, or turning sight off leaves the camera
  // light on — the single fastest way to lose someone's trust in this.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void openStream(facingMode, deviceId).catch((err) => {
      if (cancelled) return;
      setError(describeCameraError(err));
      setEnabled(false);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, deviceId, facingMode, openStream, stop]);

  // Belt and braces: the console unmounting (sign-out, navigation) must also
  // put the camera light out.
  useEffect(() => stop, [stop]);

  // ------------------------------------------------------------ looking ---

  /** Resolves once the stream has actually decoded something to draw. */
  const waitForFrame = useCallback(async (timeoutMs: number) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (hiddenVideoRef.current?.videoWidth) return true;
      await new Promise((r) => setTimeout(r, 120));
    }
    return false;
  }, []);

  const captureTo = useCallback(
    async (lookRequestId?: string): Promise<boolean> => {
      const video = hiddenVideoRef.current;
      if (!video || !video.videoWidth) return false;
      const canvas = (canvasRef.current ??= document.createElement('canvas'));

      setBusy(true);
      try {
        const scale = Math.min(1, FRAME_PX / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);

        const { base64 } = await encodeJpeg(canvas, 0.7);
        const { scene: seen } = await visionApi.observe({
          keyframe: { imageBase64: base64, mimeType: 'image/jpeg' },
          source: {
            id: 'companion-web',
            kind: 'webcam',
            position: facingMode === 'environment' ? 'front' : 'room',
          },
          captured_at: new Date().toISOString(),
          ...(lookRequestId ? { look_request_id: lookRequestId } : {}),
        });
        setScene(seen);
        setLookedAt(Date.now());
        setError(null);
        failures.current = 0;
        return true;
      } catch (err) {
        failures.current += 1;
        setError((err as Error).message || 'Athena could not look at that.');
        if (failures.current >= MAX_FAILURES) setEnabled(false);
        return true; // it looked; the round trip is what failed
      } finally {
        setBusy(false);
      }
    },
    [facingMode]
  );

  const lookNow = useCallback(() => captureTo(), [captureTo]);

  // --------------------------------------------------- looks she asks for ---

  /**
   * Answer one of her requests.
   *
   * The indicator goes up BEFORE the camera is asked for, not after a frame
   * comes back: the person has to be able to see the camera opening, including
   * in the case where opening it fails.
   */
  const honour = useCallback(
    async (request: LookRequest) => {
      if (honouring.current || handled.current.has(request.uuid)) return;
      honouring.current = true;
      handled.current.add(request.uuid);
      setAthenaLooking(request);

      const alreadyOpen = !!streamRef.current;
      const facing: FacingMode = request.prefer === 'front' ? 'environment' : facingMode;
      try {
        if (!alreadyOpen) await openStream(facing, deviceId);
        const ready = await waitForFrame(WARMUP_MS);
        if (!ready) {
          await visionApi.declineLook(request.uuid, 'camera produced no frame').catch(() => {});
          return;
        }
        await captureTo(request.uuid);
      } catch (err) {
        setError(describeCameraError(err));
        await visionApi
          .declineLook(request.uuid, describeCameraError(err).slice(0, 200))
          .catch(() => {});
      } finally {
        // Give the camera back. A look she asked for must not leave her with a
        // live camera she was never granted.
        if (!alreadyOpen) stop();
        setAthenaLooking(null);
        honouring.current = false;
      }
    },
    [facingMode, deviceId, openStream, waitForFrame, captureTo, stop]
  );

  const checkRequests = useCallback(() => {
    if (!active || honouring.current) return;
    void visionApi
      .lookRequests()
      .then(({ requests }) => {
        const next = requests.find((r) => !handled.current.has(r.uuid));
        if (next) void honour(next);
      })
      .catch(() => {
        /* she simply does not get a look this time */
      });
  }, [active, honour]);

  useEffect(() => {
    if (!active) return;
    // Once straight away: a request that arrived while the tab was loading
    // should not wait a whole interval, because by then the moment it was
    // about has usually passed.
    checkRequests();
    const id = window.setInterval(checkRequests, REQUEST_POLL_MS);
    return () => window.clearInterval(id);
  }, [active, checkRequests]);

  // ----------------------------------------------------------- cadence ----

  // Self-scheduling rather than setInterval: a slow round trip cannot stack up
  // a queue of frames that are stale before they are sent.
  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let cancelled = false;
    let handle = 0;
    const run = async () => {
      if (cancelled) return;
      // Never race a look she asked for — one camera, one frame at a time.
      const looked = honouring.current ? false : await lookNow();
      if (!cancelled) handle = window.setTimeout(run, looked ? intervalMs : 400);
    };
    handle = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [enabled, intervalMs, lookNow]);

  useEffect(() => {
    if (enabled) failures.current = 0;
    else setBusy(false);
  }, [enabled]);

  return {
    enabled,
    busy,
    scene,
    lookedAt,
    error,
    cameras,
    deviceId,
    facingMode,
    intervalMs,
    athenaLooking,
    cameraLive,
    hiddenVideoRef,
    enable: useCallback(() => setEnabled(true), []),
    disable: useCallback(() => setEnabled(false), []),
    toggle: useCallback(() => setEnabled((v) => !v), []),
    setDeviceId,
    flip: useCallback(() => {
      // Switching facing must clear an explicit device, or the exact-deviceId
      // constraint wins and the flip silently does nothing.
      setDeviceId('');
      setFacingMode((f) => (f === 'user' ? 'environment' : 'user'));
    }, []),
    setIntervalMs,
    lookNow,
    checkRequests,
    attachPreview,
  };
}
