# Milestone 2 — Daily Five engine

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). Implement against milestone 0 contracts in parallel with evidence and visual work. Own `server/domain/daily-five/*`, `server/db/daily-five.ts`, `server/routes/daily-five.ts`, and `tests/daily-five-*.test.ts`.

## 2. Decisions and lifecycle

Five sequential rounds each have $10,000 isolated capital. Select one of five assets, long/short, integer leverage 1–100, or cash. Up to three distinct clues may be unlocked across the round's board. Reopening is free; unused unlocks do not carry over. Trading without spending all clues is valid.

Locking saves an immediate result. Continue acknowledges it and advances. Refresh restores an unacknowledged result. The official daily attempt is unique per player identity and daily challenge; later attempts are practice. Cookie identity alone cannot enforce a strong person-level limit.

Core functions: `startAttempt`, `unlockClue`, `validateTicket`, `evaluatePosition`, `findLiquidation`, `lockTicket`, `advanceStage`, and `finishAttempt`.

## 3. Versioned settlement

```text
M = $10,000
L = chosen leverage
N = M × L
direction = +1 long, -1 short
feePerSide = 0.0005
reservedCost = 2 × feePerSide × N
equity(P) = M - reservedCost + direction × N × (P / entryPrice - 1)
```

These are arcade rules: round-trip charge reserved on entry notional, no funding, no maintenance margin, no cross-margin, no stop-loss/take-profit controls, automatic fixed exit. Preserve the legacy game's separate fee version.

Use the first outcome candle's open for entry and the last closed outcome candle's close for exit. Evidence ends before the outcome candle. Process actual candles chronologically: longs test lows, shorts test highs. Equity at or below zero permanently liquidates the ticket. Price gaps cannot create debt beyond the stake. Recovery afterward cannot revive it.

Use fixed-point arithmetic and centralized rounding, including comparisons exactly at liquidation boundaries. Browser calculations are previews only.

Examples assuming no earlier liquidation:

| Decision | Ticket result |
| --- | --- |
| 1× long, +2% | $10,190 |
| 10× long, +2% | $11,900 |
| 10× short, −2% | $11,900 |
| Cash | $10,000 |
| 100× long crossing approximately −0.9% | $0 |

Final equity sums five tickets; percentage return is `(finalEquity / 50000 - 1) × 100`. Directional accuracy is separate; cash is neither automatically correct nor wrong. No time score.

## 4. Persistence and API

Persist attempt, private variant assignment, current round, clue unlocks, immutable commands, settlement, and review acknowledgments. Include rule/evidence versions. Use transactions and unique attempt/round and attempt/round/clue constraints. Repeated identical commands return saved state; conflicting resubmissions fail.

Export route registration and migration functions; the coordinator mounts them. All mutations validate identity, phase, expected state version, and idempotency. Never expose future rounds' evidence or private assignments.

## 5. Acceptance

- Five liquidations produce $0; five cash tickets produce $50,000.
- Adverse intraperiod extremes liquidate even when exit recovers.
- Boundary and signed rounding cases are tested.
- Duplicate submission/unlock cannot spend twice.
- Changed resubmissions and premature future-round requests fail.
- Refresh and server restart preserve progress and reveals.
- Existing records and legacy routes remain supported.
