# Whale Hunt engine tests

## 1. Coverage

`tests/hunt-engine-rules.test.ts` verifies target, budget, decoy, capacity, partial-score, escape, and duplicate-final rules. `tests/hunt-engine-evidence.test.ts` verifies event immutability, deterministic scans, simulated activity, and unavailable baselines. `tests/hunt-engine-lifecycle.test.ts` verifies room setup, roles, idempotency, versions, five rounds, scoring, restart recovery, reconstruction, and timeout voiding. `tests/hunt-engine-api.test.ts` verifies route serialization and structured errors. `tests/hunt-v2.test.ts` also verifies varied fallback curves, five whale moves, six scan values, live market metadata, and live assignment behavior.

## 2. Commands

Run the focused suite with `PATH="$(pwd)/.runtime/node-v24.21.0-linux-x64/bin:$PATH" node --import=tsx --test tests/hunt-engine-*.test.ts`. The Hunt files pass in the current workspace. Whole-repository typecheck remains blocked by the unrelated existing spread error at `tests/evidence-compilation.test.ts:129`.
