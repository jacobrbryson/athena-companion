import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same single-origin dev setup as the Guardians app: /auth, /api and /ws go to
// the proxy_service (:8080) so the httpOnly session cookie stays same-origin,
// and /unity is reverse-proxied to the GCS bucket so the Unity build loads
// without CORS. Companion runs on :3100 so it can sit beside Guardians (:3000).
const PROXY_TARGET = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080';
const UNITY_UPSTREAM =
  process.env.UNITY_UPSTREAM || 'https://storage.googleapis.com/assets-athena-app';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    proxy: {
      '/auth': { target: PROXY_TARGET, changeOrigin: true },
      '/api': { target: PROXY_TARGET, changeOrigin: true },
      '/ws': { target: PROXY_TARGET, changeOrigin: true, ws: true },
      '/unity': { target: UNITY_UPSTREAM, changeOrigin: true },
    },
  },
});
