# Daily Five portfolio

## 1. Purpose

The v2 Daily Five path starts with one `$10,000.00` wallet and carries the settled balance through five long-only portfolio rounds. It exposes free baselines, visible card chart snapshots, structured clues, local per attempt and round drafts, and one atomic portfolio lock. Each noncash allocation now carries integer leverage from 1× through 100×.

## 2. Server

`server/domain/daily-five/portfolio.ts` contains `validatePortfolioDecision` (`:40`), `settlePortfolio` (`:119`), `lockPortfolio` (`:180`), and `examplePortfolioResult` (`:211`). Validation accepts optional leverage for compatibility with older unleveraged drafts. Settlement returns entry/exit prices, the outcome candle path, per position leverage, and liquidation status for the reveal. The engine selects this path for `daily-five-v2` while accepting the legacy cash command as an all cash compatibility alias.

`server/db/progression.ts:migrateDailyRulesConstraint` (`:58`) rebuilds an existing v1 only progression check constraint while copying rows before v2 results are inserted.

## 3. Browser

`web/daily-five/DailyFive.tsx:1280` contains `DailyFivePortfolioExperience`. The draft is keyed by attempt id and round index, so opening evidence or switching inspection targets does not change allocation. Candidate cards reuse the full `PriceChart` renderer in a compact, colored snapshot. The allocation panel uses a segmented bar, matched amount/leverage slider rows, and per-position leverage. `web/daily-five/DailyFive.tsx:350` contains `DailyFivePortfolioReveal`, which renders a two-thirds saved outcome chart beside a one-third explanation and metric card for each allocated asset. `web/daily-five/DailyFive.tsx:1680` contains `ClueAnswer`, which renders measured values and optional baselines.
