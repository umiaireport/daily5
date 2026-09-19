# Daily Five tests

## 1. Engine coverage

`tests/daily-five-engine.test.ts:41` verifies the 1×/10× examples, signed fixed-point boundary, and 100× liquidation boundary. `:100` verifies an adverse intraperiod extreme liquidates before a recovered close. `:136` verifies clue spending, immediate saved results, duplicate commands, future-round guards, and restart recovery. `:226` runs five cash tickets to `50000.00` and five liquidations to `0.00`.

## 2. Route coverage

`tests/daily-five-api.test.ts:8` checks the route registrar’s public/private boundary, resume behavior, and structured `STALE_STATE` and `INVALID_COMMAND` responses.

## 3. Commands

Run focused checks with `node --import=tsx --test tests/daily-five-*.test.ts` using the repository’s Node 24 runtime. The full repository checks remain subject to unrelated existing type errors recorded in the implementation handoff.
