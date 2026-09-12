# Athena Companion

A personal AI companion console — the Guardians app's look and feel (black,
emerald terminal, scanlines, glitch, Athena large and cinematic with the
conversation beneath, voice synced to the text) for one adult and Athena's
long-term memory.

```
companion/  ← this app (React + Vite)          talks to →  proxy_service
proxy_service/  ← Google cookie session + WS    talks to →  core_api
core_api/   ← chat, memory v2, model router, devices, perception
```

## Features

- **Google sign-in** → httpOnly `companion_session` cookie (proxy
  `/auth/companion/*`). Same claims as the marketing app's Google JWT, so
  core_api treats the user as a parent profile (created on first
  `GET /profile`). Requests carry `X-Athena-Client: companion` so a browser
  signed into Guardians too never mixes identities.
- **Conversation** in companion mode with the adult persona, bound to the
  profile (identity-based session, survives network changes). Same WS + ticket
  + polling fallback as Guardians.
- **Memories** panel: Recall ("what do you remember about…" — ranked, with
  time phrases), Moments, Facts, the readable Journal; "remember something";
  forget anything.
- **Show a photo**: downscaled on-device, described by the vision tier; only
  the description is stored server-side — the photo stays in this browser.
- **Brain**: which model tier is answering (on-device / Orcwood / frontier),
  endpoint health, local-vs-frontier mix, on-device model manifest.
- **Phone & car**: pairing codes for the Unity Android app; revoke devices.

See `docs/architecture/` — `model-router.md`, `memory-v2.md`,
`perception-and-android.md`, `nightly-self-review.md`.

## Develop

```bash
npm install
npm run dev        # http://localhost:3100 — needs proxy_service (:8080) + core_api
npm run dev:mock   # http://localhost:3101 — canned API, no backend or Google sign-in
```

`dev:mock` swaps only `src/api/client.ts` for `mock/client.ts` (see
`vite.mock.config.ts`) — the rest of the app, including the real Unity avatar,
runs unchanged. It never ships in the production build.

Before the first real sign-in, add `http://localhost:3100` (and the deployed
URL) to **Authorized JavaScript origins** of the Google OAuth web client.

## Build & deploy

Pushing to `main` on https://github.com/jacobrbryson/athena-companion deploys
automatically (Cloud Build trigger `athena-companion` -> Cloud Run service
`athena-companion`), the same as core_api and the proxy.

```bash
npm run build && npm start        # serves ./dist on $PORT (default 8080)
gcloud builds submit --config cloudbuild.yaml --project athena-476423 --region us-central1   # manual deploy
```

Live: https://athena-companion-mlkumvppsa-uc.a.run.app

In production Unity loads straight from the GCS bucket (`_VITE_UNITY_ASSET_BASE`).
The same-origin `/unity` proxy is dev-only: the ~49 MB `unity.wasm` exceeds Cloud
Run's 32 MiB response limit and returns a 500 when deployed. A new deployed origin
must be in the proxy's `CORS_ALLOWED_ORIGINS` (proxy `cloudbuild.yaml`), the bucket
CORS (`guardians/gcs-cors-athena-assets.json`), and the Google OAuth client's
authorized JavaScript origins.

## Notes

- Voice (neural TTS) is served by core_api `/speech`, now open to any verified
  signed-in profile (it was Guardian-only).
- Cookie JWTs are IP-pinned by the proxy (as in Guardians); on a phone browser
  that hops networks you may be asked to sign in again. The Unity Android app
  uses a paired-device token instead, which isn't IP-pinned.
