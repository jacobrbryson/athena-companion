import { defineConfig, mergeConfig, type Plugin } from 'vite';
import path from 'path';
import base from './vite.config';

/**
 * `npm run dev:mock` — the Companion UI with a canned in-browser API
 * (mock/client.ts) instead of the proxy_service. No backend, database, or
 * Google sign-in needed; Unity still loads for real via /unity. Dev only.
 */
const mockClient = path.resolve(__dirname, 'mock/client.ts');
const realClient = path.resolve(__dirname, 'src/api/client');

function mockApi(): Plugin {
  return {
    name: 'athena-mock-api',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const target = path.resolve(path.dirname(importer.split('?')[0]), source).replace(/\.ts$/, '');
      return target === realClient ? mockClient : null;
    },
    transformIndexHtml(html) {
      // Replace Google sign-in with a one-click mock sign-in.
      return html.replace(
        '</body>',
        `<script>window.addEventListener('load',()=>{if(localStorage.getItem('mock_signed_in')!=='true'){const b=document.createElement('button');b.textContent='MOCK SIGN-IN';b.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99;font:12px ui-monospace,monospace;letter-spacing:.3em;padding:12px 20px;border:1px solid #34d399;background:#000;color:#d1fae5';b.onclick=async()=>{await window.__mockSignIn();location.reload()};document.body.appendChild(b)}})</script></body>`
      );
    },
  };
}

export default mergeConfig(base, defineConfig({ plugins: [mockApi()], server: { port: 3101 } }));
