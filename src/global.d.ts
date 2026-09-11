/// <reference types="vite/client" />

interface UnityInstanceLike {
  SendMessage: (gameObject: string, methodName: string, parameter?: string) => void;
  Quit?: () => Promise<void>;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface Window {
  unityInstance?: UnityInstanceLike;
  createUnityInstance?: (
    canvas: HTMLCanvasElement,
    config: Record<string, unknown>,
    onProgress: (progress: number) => void
  ) => Promise<UnityInstanceLike>;
  google?: {
    accounts: {
      id: {
        initialize: (opts: {
          client_id: string;
          callback: (response: GoogleCredentialResponse) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
        }) => void;
        renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        prompt: () => void;
        disableAutoSelect: () => void;
      };
    };
  };
}

interface ImportMetaEnv {
  readonly VITE_PROXY_BASE?: string;
  readonly VITE_UNITY_ASSET_BASE?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
