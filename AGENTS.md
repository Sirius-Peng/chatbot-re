# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Repository layout

- **`chatbot/`** — Main project ("传讯" ChuanXun). A mobile-first simulated partner chat SPA. This is where all active development happens. Has its own git repo, package.json, and full toolchain.
- **`字卡 -二测/`** — Older/alternate version of the app. No package.json, no build system, no git. Contains features not yet ported to the main project (pet game, shop, diary, moments, map, accounting, etc.).

## Main project

See [`chatbot/AGENTS.md`](chatbot/AGENTS.md) for full architecture details, script load order, state management, and feature module patterns.

### Commands (run from `chatbot/`)

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
