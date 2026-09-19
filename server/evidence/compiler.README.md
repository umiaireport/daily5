# Evidence compiler

## 1. Purpose

`server/evidence/compiler.ts` normalizes provider or fixture inputs into immutable daily cases and Hunt boards. Its public projection contains only pre-decision chart data, computed current price, window move, observed trade volume, generic clue descriptors, coverage, and attribution.

## 2. Relevant functions

- `publicEvidence` (`compiler.ts:88`) builds the alias-only public chart and computes display metrics from pre-decision candles and normalized trades.
- `compileDailyCase` (`compiler.ts:329`) validates and derives one complete immutable case.
- `compileHuntBoard` (`compiler.ts:341`) compiles the six-to-ten asset board used by Hunt.

Provider symbol and name fields remain in the compiled case and are released by Hunt only through the resolved reveal identity list. Synthetic boards are labeled synthetic through their attribution.
