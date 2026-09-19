# Live collector tests

## Purpose

`tests/live.test.ts` verifies deterministic normalization around the Nansen live boundary without making network calls.

## Tests

- `live collection filters stablecoins, deduplicates addresses, and enriches three assets` — `tests/live.test.ts:26`.
- `live collection rejects a response with fewer than three usable assets` — `tests/live.test.ts:80`.

Run with `npm test` from `whale-arena/`.
