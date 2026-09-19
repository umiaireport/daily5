# Whale Arena implementation tasks

## 1. Current scope

Deliver a polished, modular, complete five-round game. Daily Five is provider-backed when live mode is enabled; synthetic fixtures are explicit practice/test data only. Never label fixtures as live or historical observations.

## 2. Build sequence

- [x] Node 24 runtime, pinned dependencies, reproducible setup.
- [x] Server-owned scenarios, SQLite sessions, atomic two-clue budget, immutable choices.
- [x] Deterministic cost-adjusted scoring and five-round compounding.
- [x] Responsive arena, keyboard controls, reveal, leaderboard, share export.
- [x] Honest unavailable states for historical and live modes.
- [x] Unit, API, persistence, desktop and mobile browser verification.
- [x] Production build, Docker setup, documentation and per-module wiki (Docker runtime itself remains unverified in this environment).

## 3. Deferred external release gates

An API credential, verified provider responses and coverage, authorized credit budget, real daily challenge and settlement, display permissions, public deployment, recording, and competition submission remain separate release gates from this no-key implementation.

## 4. Daily Five repair and product pass

- [x] Remove the misleading normal-state “round unavailable” / reconnect presentation and make saved-attempt recovery retryable.
- [x] Match the amount and leverage controls: compact equal-height rows, a fixed dollar prefix inside the amount field, and a bounded 1–100× leverage field.
- [x] Start the Daily Five wallet at $10,000 and carry the settled balance into each following round, including zero-balance rounds and cumulative final return.
- [x] Keep market data distinct and attributable: Daily Five uses real Nansen OHLCV, round-scoped TGM DEX trades, and a documented Whale-filter signal; synthetic fixtures remain explicit practice/test data only.
- [x] Keep real provider collection bounded: rank the Whale-filter, smart-money-label, and whale-scale signals, select one strongest target plus four lower-signal controls per round, then collect 25 fresh OHLCV windows and 25 general DEX-trade windows across five rounds.
- [x] Set normal live requests to a ten-credit guard, give the one-time Whale-pool download its separate 160-credit ceiling, and keep extra Hunt discovery calls opt-in via `NANSEN_LIVE_HUNT=true`.
- [x] Add an explicit one-time `npm run download:daily-five` command and persist the derived provider pack so normal startup never retries or spends credits.
- [x] Report both underlying asset return and the user’s leveraged, fee-adjusted position return from the same real entry/exit candles.
- [x] Redesign saved results around per-allocation outcome charts with a two-thirds chart / one-third explanation layout.
- [x] Replace emoji-only final outcomes with signed percentage values, remove cohort/comparison filler, and render the leaderboard.
- [x] Preserve responsive stacking and verify typecheck, tests, build, and focused browser behavior.
