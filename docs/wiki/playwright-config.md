# `playwright.config.ts`

Top-level Playwright configuration (`playwright.config.ts:1-51`) targets `tests/browser`, runs one worker, uses `CHROMIUM_PATH` or `/usr/bin/chromium` when present, captures failure traces/screenshots, tests desktop `1440x900` and mobile `390x844`, and starts `npm run dev` with an isolated SQLite path. `E2E_PRODUCTION=1` switches to `npm start` on `http://127.0.0.1:8312` with a production SQLite path and `NODE_ENV=production`.
