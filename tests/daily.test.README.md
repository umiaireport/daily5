# Daily foundation tests

## Purpose and sections

`tests/daily.test.ts` verifies the daily challenge domain: canonical publication and public evidence redaction, exact entry windows and immutable allocations, delayed settlement and fixed-time voiding, restart behavior, and SQLite lease ownership/expiry. HTTP publication and entry wiring are covered in `tests/api.test.ts`.

## Functions and test callbacks

- `setup` — `tests/daily.test.ts:41`: creates an in-memory or temporary database, initializes daily tables, creates a game session, publishes the fixture challenge, and exposes a controllable clock.
- Nested `at` clock setter — `tests/daily.test.ts:52`: moves the test clock to a supplied timestamp.
- Publication/evidence/rules test — `tests/daily.test.ts:58`.
- Entry-window/idempotency test — `tests/daily.test.ts:101`.
- Settlement immutability test — `tests/daily.test.ts:126`.
- Pending-to-void test — `tests/daily.test.ts:157`.
- Restart persistence test — `tests/daily.test.ts:194`.
- Lease ownership test — `tests/daily.test.ts:218`.
