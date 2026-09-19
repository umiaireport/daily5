# Whale Arena Evidence Index

## 1. Viewports and capture semantics

Playwright uses exact browser viewports of `1440×900` (desktop) and `390×844` (mobile). Full-page screenshots are intentionally taller than those viewports; the two `production-viewport-*` files are the exact viewport captures. Scorecard exports are application-generated `1200×630` PNGs in both projects.

## 2. Captures

| Flow | Desktop | Mobile |
| --- | --- | --- |
| Synthetic arena full page | [`arena-desktop.png`](screenshots/arena-desktop.png) | [`arena-mobile.png`](screenshots/arena-mobile.png) |
| Synthetic reveal full page | [`reveal-desktop.png`](screenshots/reveal-desktop.png) | [`reveal-mobile.png`](screenshots/reveal-mobile.png) |
| Synthetic completed expedition | [`complete-desktop.png`](screenshots/complete-desktop.png) | [`complete-mobile.png`](screenshots/complete-mobile.png) |
| Synthetic scorecard | [`scorecard-desktop.png`](screenshots/scorecard-desktop.png) | [`scorecard-mobile.png`](screenshots/scorecard-mobile.png) |
| Production exact viewport | [`production-viewport-desktop.png`](screenshots/production-viewport-desktop.png) | [`production-viewport-mobile.png`](screenshots/production-viewport-mobile.png) |
| Production arena | [`production-arena-desktop.png`](screenshots/production-arena-desktop.png) | [`production-arena-mobile.png`](screenshots/production-arena-mobile.png) |
| Production reveal | [`production-reveal-desktop.png`](screenshots/production-reveal-desktop.png) | [`production-reveal-mobile.png`](screenshots/production-reveal-mobile.png) |
| Production completed expedition | [`production-complete-desktop.png`](screenshots/production-complete-desktop.png) | [`production-complete-mobile.png`](screenshots/production-complete-mobile.png) |
| Production scorecard | [`production-scorecard-desktop.png`](screenshots/production-scorecard-desktop.png) | [`production-scorecard-mobile.png`](screenshots/production-scorecard-mobile.png) |

These are local verification artifacts only. No public URL, GIF, video, or recording is claimed.

## 3. Verification results

The clean-copy install completed in about 7 seconds. The production build and 39 Node tests covering API, provider, live normalization, scoring, recovery, private settlement sources, and daily entry wiring passed. `npm run db:migrate` creates schema version 2, including `round_reviews`, plus the additive daily challenge/entry/lease/source tables; `npm run worker` verifies a leased settlement pass without provider calls when no due live sources exist. The browser suite passes 10 tests per development/production mode across desktop/mobile full-game, private-file denial, cash/keyboard, saved-result recovery, and simulated-503 recovery. A live smoke test with the local Nansen key returned `mode: live`, `provider: nansen`, and three current assets; it is not a public deployment claim. Docker remains unverified because Docker is unavailable in this environment.
