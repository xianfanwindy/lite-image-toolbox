# Repository Guidelines

A native WeChat Mini Program with four local-only image tools: compression, resizing, nine-grid cropping, and text watermarking. No backend, cloud functions, accounts, payments, or external APIs.

## Project Structure

```
app.js / app.json / app.wxss   # App entry and global config
pages/                          # 5 pages, each with .js/.json/.wxml/.wxss
  index/  image-compress/  image-resize/  nine-grid/  image-watermark/
utils/                          # Shared logic: image-picker, canvas, image-math, ...
components/ad-slot/             # Reusable Banner ad component
config/ads.js                   # Ad unit IDs (default empty)
tests/                          # node:test specs, one per page and per util
scripts/check-no-network.js     # Runtime network gate
docs/                           # Privacy guide, release checklist, design specs
```

## Build, Test, and Development

- `npm test` — runs all `tests/*.test.js` via `node --test`, then the network gate.
- `npm run check:network` — runs only the network capability scanner.
- No build step: import the project root into WeChat DevTools to compile and preview.
- Development happens on branch `feat/lite-image-toolbox-v1`.

## Coding Style

- Native WeChat stack only (WXML/WXSS/JS); no UI framework, no runtime dependencies.
- ESLint config in `.eslintrc.js`.
- Page files follow `pages/<name>/<name>.{js,json,wxml,wxss}`.
- Shared logic lives in `utils/` as CommonJS modules.

## Testing

- Framework: Node.js built-in `node:test`.
- Every tool page has lifecycle tests: canvas release, result invalidation, save mutex, unload guards.
- Pure logic (math, format, ad config) lives in `utils/` with its own unit tests.
- All 135 tests must stay green before any merge.

## Commits

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Stage only specific paths — never `git add .` or `git add -A`.
- Push after every change.

## Security & Configuration

- `project.config.json` `appid` stays `touristappid`; replace locally only, never commit a real AppID.
- `config/ads.js` banner IDs stay empty; fill locally for release only.
- `project.private.config.json` is gitignored.

## Agent-Specific Rules

- Runtime code (`app.js`, `pages/`, `utils/`, `components/`, `config/`) must not call `wx.request`, `wx.uploadFile`, `wx.downloadFile`, `wx.cloud`, or use HTTP(S) URLs. The gate fails `npm test` on violation.
- Canvas limit: 4096px per side, 16MP total; oversized inputs throw with recovery guidance.
- Watermark text counts Unicode code points/graphemes (max 30), not `string.length`.
- Do not copy upstream `.upstream-tools-applet/utils/image-picker.js` — it uploads images remotely.
