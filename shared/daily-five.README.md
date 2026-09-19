# Daily Five shared contract

## 1. Purpose

`shared/daily-five.ts` defines the transport types for public rounds, portfolio allocations, saved results, contribution outcome charts, and final scores.

## 2. Relevant contracts

- `DailyPortfolioAllocation` (`daily-five.ts:65`) carries an optional 1×–100× leverage value.
- `DailyPortfolioContribution` (`daily-five.ts:106`) carries the real entry/exit prices, underlying asset return, fee-adjusted leveraged return, outcome chart points, and liquidation status for a saved reveal.
