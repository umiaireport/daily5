# Production smoke test

`tests/production.test.ts` conditionally checks the built Fastify/static bundle, security policy, source-file isolation, API availability, and secure production session cookie. It is skipped until `dist/index.html` exists. See [`../docs/wiki/production-tests.md`](../docs/wiki/production-tests.md).
