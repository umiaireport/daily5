# Daily Five route tests

## 1. Purpose

`tests/daily-five-api.test.ts` verifies the standalone Fastify registrar, public/private response boundary, attempt resume, and structured stale/invalid command errors without changing the coordinator application.

## 2. Coverage

The route journey starts at `tests/daily-five-api.test.ts:8` and uses the deterministic engine and injected player identity.
