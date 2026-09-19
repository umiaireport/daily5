# Daily Five domain

## 1. Purpose

This directory owns the server-authoritative Daily Five lifecycle. It validates immutable case packs, assigns candidates per attempt, unlocks clues, settles one isolated ticket at a time, persists immediate results, and finishes the five-round score.

## 2. Code sections

- `daily-five/engine.ts` — persistence-backed attempt state machine, identity checks, idempotency, projections, and leaderboard.
- `daily-five/lifecycle.ts` — ticket validation, ticket locking, stage transitions, and final aggregation.
- `daily-five/settlement.ts` — fixed-point fee, equity, candle-extreme liquidation, and percentage calculations.
- `daily-five/synthetic.ts` — deterministic credential-free case-pack factory for local development and tests.
- `daily-five/types.ts` — private case-pack and persisted assignment types.
- `daily-five/index.ts` — public domain export boundary.

## 3. Functions

`DailyFiveEngine` (`server/domain/daily-five/engine.ts:221`) provides `today` (`:274`), `resume` (`:281`), `start`/`startAttempt` (`:289`/`:340`), `unlock`/`unlockClue` (`:349`/`:397`), `submit` (`:406`), `continue` (`:479`), `leaderboard` (`:518`), and the named `lockTicket`, `advanceStage`, and `finishAttempt` wrappers (`:539`, `:545`, `:553`). `validateCasePack` (`engine.ts:684`) protects the publication boundary.

`validateTicket` (`lifecycle.ts:18`), `lockTicket` (`:66`), `advanceStage` (`:109`), and `finishAttempt` (`:122`) are the pure lifecycle operations.

`reservedCostCents` (`settlement.ts:79`), `equityAtPrice` (`:90`), `formatReturnPct` (`:112`), `findLiquidation` (`:122`), `evaluatePosition` (`:151`), and `evaluateCash` (`:192`) are the settlement operations.
