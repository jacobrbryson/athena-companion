import { useEffect, useRef, useState } from 'react';
import { UNITY_ASSET_BASE } from '../config';
import { CHAT_ACTIVITY_EVENT } from './useChat';

/**
 * Unity WebGL Athena player — the Guardians app's embed (itself a port of
 * the marketing app's UnityPlayerComponent). It loads the same Unity build and speaks the same
 * bridge protocol:
 *
 *   - window event 'athena-unity-ready-for-websocket'  -> we hand Unity a WS
 *     config and tell its AthenaSocketBridge to connect. Auth rides on the
 *     httpOnly cookie, so the WS URL carries no token.
 *   - SendMessage('AthenaBridge', 'SetThinking', bool) -> idle/think animation.
 *
 * The large Unity assets are NOT bundled with this app; they are loaded from
 * UNITY_ASSET_BASE (the shared GCS bucket by default).
 */

const ACTIVITY_MIN_SHOW_MS = 1800;
const ACTIVITY_MAX_SHOW_MS = 90_000;

const u = (p: string) => `${UNITY_ASSET_BASE}/${p}`;

/**
 * Imperative bridge to the Athena avatar, mirroring the marketing app's
 * UnityBridgeService (same GameObject + method names). Handed to the parent via
 * `onReady` once the Unity instance exists.
 */
export interface AthenaBridge {
  playGesture: (gesture: 'Wave' | 'Happy' | 'Yes' | 'No') => void;
  setThinking: (thinking: boolean) => void;
  /** What she is really doing right now; '' for nothing. See CHAT_ACTIVITY_EVENT. */
  setActivity: (activity: string) => void;
  sendToGameObject: (gameObject: string, method: string, param?: string) => void;
}

interface Props {
  sessionId: string | null;
  isThinking: boolean;
  /** Called once when the Unity avatar is live and the bridge is usable. */
  onReady?: (bridge: AthenaBridge) => void;
}

export function UnityAthena({ sessionId, isThinking, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<UnityInstanceLike | null>(null);
  const sessionRef = useRef<string | null>(sessionId);
  sessionRef.current = sessionId;

  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // --- Unity -> app: connect Unity's own WebSocket once it signals ready. ---
  useEffect(() => {
    const onUnityWsReady = async () => {
      const instance = instanceRef.current;
      if (!instance) return;
      // Unity used to open a second socket of its own, which meant a second
      // sign-in ticket in a URL. All it did with it was wave on connect and
      // follow thinking — and the page already drives thinking (SetThinking
      // below). So no socket: tell Unity it is "connected" and it waves.
      instance.SendMessage('AthenaSocketBridge', 'OnWebSocketConnected');
    };
    const handler = () => void onUnityWsReady();
    window.addEventListener('athena-unity-ready-for-websocket', handler);
    return () => window.removeEventListener('athena-unity-ready-for-websocket', handler);
  }, []);

  // --- Boot Unity (load loader script, then createUnityInstance). ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const script = document.createElement('script');
    script.src = u('Build/unity.loader.js');
    script.async = true;

    script.onload = () => {
      if (disposed || !window.createUnityInstance) {
        if (!window.createUnityInstance) {
          setError('Unity is unavailable in this browser.');
          setLoading(false);
        }
        return;
      }
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * pixelRatio;
      canvas.height = canvas.clientHeight * pixelRatio;

      window
        .createUnityInstance(
          canvas,
          {
            dataUrl: u('Build/unity.data'),
            frameworkUrl: u('Build/unity.framework.js'),
            codeUrl: u('Build/unity.wasm'),
            streamingAssetsUrl: 'StreamingAssets',
            companyName: 'Athena',
            productName: 'Athena',
            productVersion: '0.1.0',
          },
          (p) => setProgress(Math.round(p * 100))
        )
        .then((instance) => {
          if (disposed) return;
          instanceRef.current = instance;
          window.unityInstance = instance;
          setProgress(100);
          setLoading(false);
          setError(null);

          const bridge: AthenaBridge = {
            playGesture: (gesture) =>
              instance.SendMessage('AthenaBridge', 'PlayGesture', gesture),
            setThinking: (thinking) =>
              instance.SendMessage('AthenaBridge', 'SetThinking', String(thinking)),
            setActivity: (activity) =>
              instance.SendMessage('AthenaBridge', 'SetActivity', activity),
            sendToGameObject: (gameObject, method, param) =>
              param === undefined
                ? instance.SendMessage(gameObject, method)
                : instance.SendMessage(gameObject, method, param),
          };
          onReadyRef.current?.(bridge);
        })
        .catch((message) => {
          console.error('Unity init failed:', message);
          setError('Unable to summon Athena right now.');
          setLoading(false);
        });
    };

    script.onerror = () => {
      setError('Unable to summon Athena right now.');
      setLoading(false);
    };

    document.body.appendChild(script);

    return () => {
      disposed = true;
      if (window.unityInstance === instanceRef.current) delete window.unityInstance;
      instanceRef.current?.Quit?.().catch(() => undefined);
      instanceRef.current = null;
      script.remove();
    };
  }, []);

  // --- app -> Unity: reflect thinking state in the avatar animation. ---
  useEffect(() => {
    instanceRef.current?.SendMessage('AthenaBridge', 'SetThinking', String(isThinking));
  }, [isThinking]);

  // --- server -> Unity: show what she is really doing. ---
  // The server announces an activity while she is reading the data, and ends
  // it when the read does. But she is still working with that data until the
  // reply is composed and she starts to answer, so the avatar keeps scanning
  // until BOTH the read has finished and the pending reply has landed
  // (isThinking drops as the reply is revealed, in step with her voice).
  // A calendar read can also finish in a few hundred ms — too short to see —
  // so each activity shows for at least ACTIVITY_MIN_SHOW_MS. That only ever
  // extends a true moment; it never shows one that did not happen.
  // ACTIVITY_MAX_SHOW_MS covers a lost 'end' or a lost reply (dropped socket)
  // so she can't be left "working" on nothing.
  const thinkingRef = useRef(isThinking);
  const settleActivityRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    thinkingRef.current = isThinking;
    if (!isThinking) settleActivityRef.current();
  }, [isThinking]);

  useEffect(() => {
    let current = '';
    let readOpen = false;
    let shownAt = 0;
    let clearTimer: number | undefined;
    let watchdog: number | undefined;

    const show = (activity: string) => {
      current = activity;
      instanceRef.current?.SendMessage('AthenaBridge', 'SetActivity', activity);
    };
    const stop = () => {
      window.clearTimeout(clearTimer);
      window.clearTimeout(watchdog);
      clearTimer = watchdog = undefined;
      readOpen = false;
      show('');
    };
    // Clear once the read is done AND the reply has arrived, after the minimum.
    const settle = () => {
      if (!current || readOpen || thinkingRef.current) return;
      window.clearTimeout(clearTimer);
      const wait = Math.max(0, ACTIVITY_MIN_SHOW_MS - (Date.now() - shownAt));
      clearTimer = window.setTimeout(stop, wait);
    };
    settleActivityRef.current = settle;

    const onActivity = (event: Event) => {
      const { activity, state } = (event as CustomEvent<{ activity: string; state: string }>).detail;
      if (state === 'start') {
        window.clearTimeout(clearTimer);
        window.clearTimeout(watchdog);
        readOpen = true;
        shownAt = Date.now();
        show(activity);
        watchdog = window.setTimeout(stop, ACTIVITY_MAX_SHOW_MS);
      } else if (state === 'end' && current === activity) {
        readOpen = false;
        settle();
      }
    };

    window.addEventListener(CHAT_ACTIVITY_EVENT, onActivity);
    return () => {
      window.removeEventListener(CHAT_ACTIVITY_EVENT, onActivity);
      settleActivityRef.current = () => undefined;
      window.clearTimeout(clearTimer);
      window.clearTimeout(watchdog);
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black/90">
      <canvas
        ref={canvasRef}
        id="unity-canvas"
        className="w-full h-full block"
        tabIndex={1}
      />

      {loading && !error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 text-emerald-200">
          <div className="text-center font-mono">
            <p className="text-xs uppercase tracking-[0.4em] opacity-60 animate-flicker">
              establishing link
            </p>
            <p className="mt-3 text-2xl tracking-widest gd-glitch" data-text="ATHENA">
              ATHENA
            </p>
            <div className="mt-4 h-px w-48 mx-auto bg-emerald-200/20">
              <div className="h-px bg-emerald-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs opacity-60 tabular-nums">{progress}%</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 text-red-300 p-6">
          <p className="font-mono text-center text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
