# API tests

`tests/api.test.ts` covers the Fastify API with in-memory SQLite. `startSession` is at `tests/api.test.ts:11`; test callbacks currently span `tests/api.test.ts:17-287`, including reviewed-result continuation and restart persistence. See [`../docs/wiki/api-tests.md`](../docs/wiki/api-tests.md).
