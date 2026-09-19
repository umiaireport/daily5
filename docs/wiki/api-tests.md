# `tests/api.test.ts`

This module exercises the Fastify API with in-memory SQLite. Test cases cover session creation, public pre-choice redaction, clue budget, sequential rounds, choice idempotency/immutability, result access, reviewed-result continuation, leaderboard, reset, origin/rate-limit/error handling, health/admin status, and database persistence/restart. The `startSession` helper is at `tests/api.test.ts:11`; test callbacks occupy `tests/api.test.ts:17-287`.
