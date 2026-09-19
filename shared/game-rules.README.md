# Shared game rules

## 1. Purpose

`shared/game-rules.ts` contains fixed-point parsing, rounding, and public rule contracts.

## 2. Relevant contract

`DailyFiveV2Rules` (`game-rules.ts:102`) permits optional leverage bounds for backward-compatible saved rule objects. `DAILY_FIVE_V2_RULES` (`game-rules.ts:137`) publishes the 1×–100× v2 range.
