# Daily Five engine

## 1. Ownership

The Daily Five engine lives under `server/domain/daily-five/`. It is server authoritative and keeps future outcome candles and private assignments out of attempt views.

## 2. Lifecycle

`DailyFiveEngine` (`server/domain/daily-five/engine.ts:221`) publishes an immutable case pack for the UTC day, starts an official attempt once per player identity, labels later starts as practice, and stores a deterministic candidate assignment. `unlock` (`:349`) spends at most three distinct clues for the current round. `submit` (`:406`) validates the current round and stores its immediate result. `continue` (`:479`) acknowledges that result and opens the next round; after round five it stores the final result.

Every mutation checks identity, phase, expected state version, and idempotency. The exact response is stored so a repeated command replays the saved state after refresh or restart.

## 3. Settlement

`reservedCostCents` (`server/domain/daily-five/settlement.ts:79`) reserves 5 bps per side on leveraged notional. `equityAtPrice` (`:90`) uses integer price units and cents. `findLiquidation` (`:122`) checks long lows or short highs in chronological order and clamps debt to zero. `evaluatePosition` (`:151`) uses the first outcome candle open and last closed candle close. `finishAttempt` (`server/domain/daily-five/lifecycle.ts:122`) sums five isolated stakes and formats the combined return.

## 4. Synthetic mode

`createSyntheticDailyFiveCasePack` (`server/domain/daily-five/synthetic.ts:115`) supplies five rounds of five candidates, six pre-decision clue descriptors, and deterministic closed candles without credentials. Live evidence compilation remains outside this milestone.
