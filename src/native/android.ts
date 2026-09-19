/** The object is injected by AndroidX only into the pinned Companion origin. */
type NativeBridge = { postMessage: (message: string) => void; onmessage: ((event: { data: string }) => void) | null };
declare global { interface Window { AthenaAndroid?: NativeBridge } }

export const isAndroidCompanion = () => typeof window.AthenaAndroid?.postMessage === 'function';
let sequence = 0;
const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: number }>();
let connected: NativeBridge | undefined;

export function androidCall<T>(method: string, payload: unknown = {}): Promise<T> {
  const bridge = window.AthenaAndroid;
  if (!bridge) return Promise.reject(new Error('Android connection is unavailable.'));
  if (connected !== bridge) {
    connected = bridge;
    bridge.onmessage = ({ data }) => {
      let reply: { id: string; result?: T; error?: string };
      try { reply = JSON.parse(data); } catch { return; }
      const request = pending.get(reply.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(reply.id);
      if (reply.error) request.reject(new Error(reply.error)); else request.resolve(reply.result);
    };
  }
  return new Promise<T>((resolve, reject) => {
    const id = String(++sequence);
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('The phone did not respond. Please try again.'));
    }, 120_000);
    pending.set(id, { resolve, reject, timer });
    try { bridge.postMessage(JSON.stringify({ id, method, payload })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error('Android connection was interrupted.')); }
  });
}

export interface PhoneRegistration { device_uuid: string; profile_uuid: string }
