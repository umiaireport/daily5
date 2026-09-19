# Daily Five engine tests

## 1. Purpose

`tests/daily-five-engine.test.ts` checks fixed-point settlement, exact liquidation boundaries, intraperiod liquidation before recovery, clue/idempotency rules, restart recovery, isolated cash scoring, and all-liquidation final scoring.

## 2. Helpers and coverage

`candle` (`tests/daily-five-engine.test.ts:18`), `packWithCandles` (`:22`), and `clock` (`:37`) build deterministic private case packs. The four tests begin at lines `41`, `100`, `136`, and `226`.
