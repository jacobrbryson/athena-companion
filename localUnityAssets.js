import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

export const REQUIRED_UNITY_FILES = ['unity.loader.js', 'unity.data', 'unity.framework.js', 'unity.wasm'];

/** Explicit local mode must never silently fall back to the internet. */
export function localUnityAssets(directory) {
  const root = path.resolve(directory);
  for (const name of REQUIRED_UNITY_FILES) {
    if (!fs.statSync(path.join(root, 'Build', name)).isFile()) throw new Error(`Missing local Unity asset: ${name}`);
  }
  const router = express.Router();
  router.use(express.static(root, {
    fallthrough: true,
    dotfiles: 'deny',
    setHeaders(res, filename) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-cache');
      if (filename.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
    },
  }));
  router.use((_req, res) => res.status(404).json({ error: 'Local Unity asset not found' }));
  return router;
}
