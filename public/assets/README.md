# Dashboard assets

- `athena-avatar.png`: Athena's portrait, supplied by the owner. Shown wherever
  the app used to draw a lettered "A" orb — the sidebar wordmark and the central
  button in the mobile bar. Square, transparent or dark background, ideally
  512x512 or larger; it is drawn into a circle, so keep her face away from the
  corners. `components/AthenaAvatar.tsx` falls back to the lettered orb if the
  file is absent, so a missing avatar degrades rather than breaks.
- `athena-sprites.png`: sprite sheet supplied by the owner with the dashboard concept. Used unchanged through CSS background positioning.
- `alpine-dawn.png`: generated with the built-in image generation tool for this interface.

Generation prompt: Create a cinematic landscape background asset for Athena, a dark navy personal dashboard. Wide 1536x1024. Alpine mountain valley, jagged distant peaks, evergreen forest silhouettes, lake, warm peach sunrise near right horizon, deep blue starry sky, subtle enormous blue planet in upper right. Premium realistic digital matte painting, tranquil adventurous atmosphere. Upper left mostly dark sky for white UI text. No text, no UI, no borders, no people.
