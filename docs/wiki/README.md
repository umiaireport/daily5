# Daily5 Wiki Index

Each page documents one source or script module. Paths and function line numbers refer to the current checkout and must be refreshed after code moves.

## Application

- [`../api-map.md`](../api-map.md) — route map and transport boundary.
- [`app.md`](app.md) — Fastify application and routes.
- [`server-index.md`](server-index.md) — API process entrypoint.
- [`vite-config.md`](vite-config.md) — browser development/build configuration.
- [`playwright-config.md`](playwright-config.md) — end-to-end test configuration.
- [`package.md`](package.md) — scripts, pinned runtime, and dependencies.
- [`reset-daily-five.md`](reset-daily-five.md) — development-only Daily Five reset script.
- [`dev-launcher.md`](dev-launcher.md) — Node 24-aware local development launcher.
- [`prettier-config.md`](prettier-config.md) — formatter settings.

## Domain and persistence

- [`game.md`](game.md) — session, clues, choices, results, leaderboard.
- [`live.md`](live.md) — current-data Nansen scenario collection and attribution.
- [`daily-game.md`](daily-game.md) — daily challenge publication, entry, result, and settlement rules.
- [`scoring.md`](scoring.md) — weights and cost-adjusted scoring.
- [`store.md`](store.md) — SQLite opening and transactions.
- [`auth-database.md`](auth-database.md) — account and session tables.
- [`auth-users.md`](auth-users.md) — registration, password hashing, login, and logout.
- [`daily-database.md`](daily-database.md) — daily challenge tables and worker leases.
- [`daily-five-database.md`](daily-five-database.md) — Daily Five attempt tables and reset helper.
- [`hunt-engine.md`](hunt-engine.md) — Whale Hunt lifecycle, role views, rules, and reconstruction.
- [`../server/domain/hunt/synthetic.README.md`](../server/domain/hunt/synthetic.README.md) — deterministic Hunt chart histories.
- [`hunt-database.md`](hunt-database.md) — additive Hunt rooms, matches, commands, participants, and events.
- [`hunt-routes.md`](hunt-routes.md) — Hunt HTTP registrar and endpoint contract.
- [`migrate.md`](migrate.md) — schema migration script.
- [`types.md`](types.md) — shared contracts.
- [`synthetic-scenarios.md`](synthetic-scenarios.md) — five fictional rounds.

## Provider and jobs

- [`nansen-client.md`](nansen-client.md) — isolated disabled-by-default adapter.
- [`nansen-status.md`](nansen-status.md) — live availability status.
- [`worker.md`](worker.md) — one-shot daily settlement worker and production scheduling contract.

## Browser modules and verification

- [`app-ui.md`](app-ui.md) — React composition and state flow.
- [`daily-challenge-ui.md`](daily-challenge-ui.md) — daily evidence and official-entry screen.
- [`hunt-ui.md`](hunt-ui.md) — Whale Hunt entry, lobby, role views, board, and reveal.
- [`../web/hunt/HuntScreen.README.md`](../web/hunt/HuntScreen.README.md) — Hunt turn handoffs and role controls.
- [`../web/hunt.css.README.md`](../web/hunt.css.README.md) — Hunt phase, budget, and responsive styles.
- [`hunt-api.md`](hunt-api.md) — Whale Hunt browser transport and structured errors.
- [`api-client.md`](api-client.md) — browser API helper and non-JSON deployment errors.
- [`arena-ui.md`](arena-ui.md) — clue and allocation controls.
- [`modal-ui.md`](modal-ui.md) — native dialog wrapper.
- [`results-ui.md`](results-ui.md) — reveal and scorecard actions.
- [`visuals-ui.md`](visuals-ui.md) — SVG, formatting, and styles.
- [`main-ui.md`](main-ui.md) — React mount.
- [`share.md`](share.md) — PNG scorecard export.
- [`styles.md`](styles.md) — responsive visual system.
- [`index-html.md`](index-html.md) — browser document shell.
- [`api-tests.md`](api-tests.md), [`provider-tests.md`](provider-tests.md), [`live-tests.md`](live-tests.md), [`scoring-tests.md`](scoring-tests.md), [`production-tests.md`](production-tests.md), [`daily-tests.md`](daily-tests.md), [`recovery-tests.md`](recovery-tests.md), [`browser-tests.md`](browser-tests.md) — test modules.
- [`hunt-ui-tests.md`](hunt-ui-tests.md) — focused Hunt transport and UI contract tests.
- [`hunt-engine-tests.md`](hunt-engine-tests.md) — focused Hunt backend rules, evidence, lifecycle, and API tests.

## Daily Five repair

- [Daily Five screen](daily-five-ui.md) — `web/daily-five/DailyFive.tsx`.
- [Daily Five recovery and progress](daily-five-journey.md) — `web/daily-five/journey.tsx`.
- [Daily Five transport](daily-five-transport.md) — `web/api/daily-five.ts`.
- [Daily Five synthetic case pack](daily-five-synthetic.md) — `server/domain/daily-five/synthetic.ts`.
- [Daily Five synthetic observations](daily-five-observations.md) — `server/domain/daily-five/observations.ts`.
- [Daily Five UI and transport tests](daily-five-ui-tests.md) — `tests/daily-five-ui.spec.ts`.
- [Daily Five evidence tests](daily-five-evidence-tests.md) — `tests/daily-five-evidence.test.ts`.
- [Daily Five browser journeys](daily-five-browser-tests.md) — `tests/browser/daily-five.spec.ts`.
- [Daily Five styles](daily-five-styles.md) — `web/daily-five.css`.
- [`../shared/daily-five.README.md`](../shared/daily-five.README.md) — Daily Five transport and reveal contracts.
- [`../shared/game-rules.README.md`](../shared/game-rules.README.md) — fixed-point and v2 rule values.
