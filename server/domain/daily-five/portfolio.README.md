# Daily Five portfolio settlement

## 1. Purpose

`portfolio.ts` validates and settles the `daily-five-v2` long only portfolio contract. It keeps allocation arithmetic server authoritative, supports 1×–100× position leverage, emits contribution outcome paths for the reveal, and leaves the original leveraged v1 lifecycle in `lifecycle.ts`.

## 2. Code sections

- `validatePortfolioDecision` (`portfolio.ts:40`) checks integer basis point weights, candidate identity, duplicates, and the exact cash plus asset total.
- `settlePortfolio` (`portfolio.ts:119`) applies integer cent allocation, leveraged gross P&L, entry and exit fees, cash, liquidation floors, and per asset contributions with outcome charts.
- `lockPortfolio` (`portfolio.ts:180`) builds the immutable saved round result.
- `examplePortfolioResult` (`portfolio.ts:211`) guards the documented `$10,015.00` two asset example.

## 3. Settlement contract

The v2 attempt starts with a `$10,000.00` wallet. Each round settles against the wallet carried from the prior round; a cash remainder is preserved, and a zero wallet ends the attempt after the saved result. A noncash allocation uses the first executable entry and last closed exit candle, with 5 bps entry plus 5 bps exit cost. All rounding uses `roundQuotient` from `shared/game-rules.ts`.
