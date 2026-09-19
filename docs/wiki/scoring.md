# `server/domain/scoring.ts`

`validateWeights` (`server/domain/scoring.ts:6`) enforces four integer 10%-step weights summing to 100. `terminalMultiplier` (`server/domain/scoring.ts:20`) applies 0.30% entry/exit costs to positive prices. `scoreAllocation` (`server/domain/scoring.ts:33`) computes end equity, round return, and equal-weight benchmark; cash remains flat. Constants `START_CASH` and `COSTS` are at `server/domain/scoring.ts:3-4`.
