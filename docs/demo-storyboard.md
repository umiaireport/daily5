# Daily5 Demo Storyboard

## 1. Local setup

From the repository root, run `./dev.sh` (it prefers `.runtime/node-v24.21.0-linux-x64/bin`) or verify installed Node 24 before `npm ci`, then open `http://127.0.0.1:8311`. No key, account, or environment variable is required for the synthetic tutorial. For browser tests, Playwright uses `/usr/bin/chromium` by default; set `CHROMIUM_PATH` or run `npx playwright install chromium` if Chromium is unavailable. This storyboard describes the local app flow and its Nansen-backed data states.

## 2. 45–60 second flow

1. Show the dark arena, `Synthetic tutorial / Practice`, five-round progress, and the visible fictional-data notice.
2. Open `How to play` briefly to show two clues and 10% allocations.
3. Unlock `Follow the Funds` for Token A and `Trading Footprints` for Token B. Show that a third unlock is disabled and the clue count is server-backed.
4. Allocate 60% to Token A, 30% to Token B, and leave 10% cash. Lock and reveal the identities, entry/exit prices, cost-adjusted return, equal-weight benchmark, and cash benchmark.
5. Download the PNG scorecard, continue through five rounds, then show the completed expedition and session leaderboard.
6. Open `Daily challenge` to show the honest unavailable state and return to training waters.

## 3. Evidence checklist

Use the Playwright output under `docs/screenshots/` when available. Review desktop `1440x900` and mobile `390x844`, keyboard dialog escape, no horizontal overflow, no console/network errors, clue-budget enforcement, immutable choices, and scorecard filename. Keep evidence tied to observable app behavior.

## 4. Captured evidence

The full-page captures use the exact Playwright viewports `1440x900` and `390x844`; their PNG pixel heights are larger because they capture the complete page. Production captures are prefixed `production-`.

| Evidence | Desktop | Mobile |
| --- | --- | --- |
| Arena full page | [`arena-desktop.png`](screenshots/arena-desktop.png) | [`arena-mobile.png`](screenshots/arena-mobile.png) |
| Reveal full page | [`reveal-desktop.png`](screenshots/reveal-desktop.png) | [`reveal-mobile.png`](screenshots/reveal-mobile.png) |
| Complete full page | [`complete-desktop.png`](screenshots/complete-desktop.png) | [`complete-mobile.png`](screenshots/complete-mobile.png) |
| Scorecard PNG (1200×630 export) | [`scorecard-desktop.png`](screenshots/scorecard-desktop.png) | [`scorecard-mobile.png`](screenshots/scorecard-mobile.png) |
| Production viewport (exact viewport capture) | [`production-viewport-desktop.png`](screenshots/production-viewport-desktop.png) | [`production-viewport-mobile.png`](screenshots/production-viewport-mobile.png) |
| Production arena full page | [`production-arena-desktop.png`](screenshots/production-arena-desktop.png) | [`production-arena-mobile.png`](screenshots/production-arena-mobile.png) |
| Production reveal full page | [`production-reveal-desktop.png`](screenshots/production-reveal-desktop.png) | [`production-reveal-mobile.png`](screenshots/production-reveal-mobile.png) |
| Production complete full page | [`production-complete-desktop.png`](screenshots/production-complete-desktop.png) | [`production-complete-mobile.png`](screenshots/production-complete-mobile.png) |
| Production scorecard export (1200×630) | [`production-scorecard-desktop.png`](screenshots/production-scorecard-desktop.png) | [`production-scorecard-mobile.png`](screenshots/production-scorecard-mobile.png) |
