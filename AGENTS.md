# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Repository layout

- **Repository root** — Current active project ("传讯" ChuanXun). This is the tested source of truth for the integrated mobile-first simulated partner chat SPA, PWA, and Capacitor build.
- **`chatbot/`** — Older independent git worktree kept for history/reference. Do not treat it as the active source unless explicitly asked to migrate changes back into that repo.
- **`字卡 -二测/`** — Older/alternate version of the app. No package.json, no build system, no git. Keep it as a migration/reference snapshot.

## Main project

Active development happens from the repository root. The app is still a vanilla JS SPA with strict script-tag load ordering, so keep changes incremental and verify the runtime after any script-order or global-state change.

### Commands (run from repository root)

```bash
npm install              # Install dependencies
npm run dev              # Dev server (npx serve .)
npm run build            # Build to www/
npm run lint             # ESLint js/
npm run lint:fix         # ESLint with auto-fix
npm run test:web         # Playwright E2E tests (Pixel 5 viewport, port 4176)
npm run android:sync     # Build + Capacitor sync
npm run android:build    # Full Android debug APK
npm run test:android     # ADB smoke test
```

### Tech stack

Vanilla JS SPA (no framework, no bundler, no module system). Single `index.html` loads all scripts via `<script>` tags in a specific order. Data persisted in IndexedDB (Dexie.js + localforage). AI via DeepSeek API (OpenAI-compatible, streaming SSE). Deployed as PWA and Capacitor Android app.

### CI/CD

Push to `main` triggers GitHub Actions: `npm ci` → `lint` → `build` → deploy `www/` to GitHub Pages.
