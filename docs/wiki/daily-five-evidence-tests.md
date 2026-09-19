# Daily Five evidence tests

## 1. Purpose and behavior

Checks all 25 normalized shapes, determinism, cutoff timestamps, measured activity, unopened privacy, outcome-independent clues and publication immutability.

## 2. Code sections

Run Node 24: node --import tsx --test tests/daily-five-evidence.test.ts.

## 3. Functions and checks

- `all 25 normalized synthetic charts are deterministic, distinct and strictly pre-cutoff` — `tests/daily-five-evidence.test.ts:16`.
- `normalized` — `tests/daily-five-evidence.test.ts:27`.
- `clues reconcile observed activity, preserve privacy, and ignore later outcomes` — `tests/daily-five-evidence.test.ts:46`.
- `buys` — `tests/daily-five-evidence.test.ts:49`.
- `sells` — `tests/daily-five-evidence.test.ts:50`.
- `views` — `tests/daily-five-evidence.test.ts:72`.
- `publishing improved fixtures does not rewrite an existing daily challenge` — `tests/daily-five-evidence.test.ts:103`.
- `clock` — `tests/daily-five-evidence.test.ts:106`.
