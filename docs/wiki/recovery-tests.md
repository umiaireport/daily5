# `tests/recovery.test.ts`

The test callback at `tests/recovery.test.ts:11` locks a choice, restarts the app, confirms `GET /api/scenarios/next` returns the unreviewed saved result, checks authorization and idempotent `POST /api/scenarios/:id/continue`, and confirms another choice cannot skip it. The schema migration callback at `tests/recovery.test.ts:91` downgrades a test database to v1 and verifies progress/result preservation after upgrade to v2. The unsupported-schema callback at `tests/recovery.test.ts:129` confirms a future user version is rejected without being downgraded.
