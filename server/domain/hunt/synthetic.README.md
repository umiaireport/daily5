# Hunt synthetic board

## 1. Purpose

`server/domain/hunt/synthetic.ts` creates the credential-free six asset Hunt board used by local play and tests. Its deterministic histories deliberately use different shapes so the board can be read visually.

## 2. Functions

- `iso` (`synthetic.ts:4`) creates the fixed UTC timestamps.
- `candles` (`synthetic.ts:28`) builds one rising, ranging, staircase, declining, spike, or volatile candle path and its outcome continuation.
- `trades` (`synthetic.ts:52`) creates shape-aware synthetic trade activity.
- `createSyntheticHuntBoard` (`synthetic.ts:71`) compiles the six cases into the public Hunt board.
