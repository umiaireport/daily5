# Hunt engine API tests

## 1. Purpose

`tests/hunt-engine-api.test.ts` checks the route registrar’s room and match endpoints, private tracer projections, structured stale and invalid-command responses, scan delivery, and replay phase protection.

## 2. Test

The route boundary test starts at line `9` and uses an in-memory SQLite database with deterministic synthetic evidence.
