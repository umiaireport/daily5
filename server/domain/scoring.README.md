# Scoring rules

## Purpose and sections

`server/domain/scoring.ts` contains the versioned starting balance and simplified entry/exit cost model, integer weight validation, terminal price multiplier, and allocation scoring.

## Functions

- `validateWeights` — `server/domain/scoring.ts:6`: accepts four 10%-step integer weights summing to 100.
- `terminalMultiplier` — `server/domain/scoring.ts:20`: applies entry and exit costs to a positive entry/exit pair.
- `scoreAllocation` — `server/domain/scoring.ts:33`: computes end equity, round return, and equal-weight benchmark.
