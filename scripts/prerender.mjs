// Writes dist/<page>.html for each public legal page: the built index.html with
// the page's markup inside #root, so crawlers see the content and the SPA still
// takes over in a browser. Run after `vite build` and the SSR build.
import { readFileSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ssrDir = path.join(root, 'dist-ssr');
const { PAGES } = await import(pathToFileURL(path.join(ssrDir, 'prerender.js')).href);
const shell = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');

for (const [name, page] of Object.entries(PAGES)) {
  const html = shell
    .replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`)
    .replace(/\s*<meta name="robots"[^>]*>/, '')
    .replace('<div id="root"></div>', `<div id="root">${page.render()}</div>`);
  if (!html.includes(page.title) || html.includes('<div id="root"></div>')) {
    throw new Error(`prerender: could not inject ${name} into index.html`);
  }
  writeFileSync(path.join(root, 'dist', `${name}.html`), html);
  console.log(`prerendered /${name}`);
}
rmSync(ssrDir, { recursive: true, force: true });
