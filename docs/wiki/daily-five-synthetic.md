# Daily Five synthetic case pack

## 1. Purpose and behavior

Publishes 25 distinct deterministic charts and six concrete private clue answers per candidate from pre-cutoff observations. Five-minute points cover six hours. New publications use synthetic-case-pack-v2. Earlier published days and saved outcomes are immutable and deliberately not rewritten; improved data requires a new publication or an isolated development database.

## 2. Code sections

Timestamps and prices; private clue projection; public/private assembly; case-pack generation.

## 3. Functions and checks

- `at` — `server/domain/daily-five/synthetic.ts:20`.
- `scaledPrice` — `server/domain/daily-five/synthetic.ts:24`.
- `clue` — `server/domain/daily-five/synthetic.ts:28`.
- `asset` — `server/domain/daily-five/synthetic.ts:52`.
- `descriptors` — `server/domain/daily-five/synthetic.ts:61`.
- `candles` — `server/domain/daily-five/synthetic.ts:84`.
- `privateClues` — `server/domain/daily-five/synthetic.ts:98`.
- `createSyntheticDailyFiveCasePack` — `server/domain/daily-five/synthetic.ts:118`.
- `assets` — `server/domain/daily-five/synthetic.ts:128`.
