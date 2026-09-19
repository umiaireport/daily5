# Fastify application module

## Purpose and sections

`server/app.ts` builds the API, initializes the daily tables, applies security headers, owns the cookie session boundary and error mapping, registers game and daily entry/result routes, reports health/admin status, and optionally serves the production bundle.

## Functions

- `buildApp` — `server/app.ts:40`: creates/configures Fastify, optionally collects a live scenario, passes its board factory to Hunt v2, initializes a pinned daily challenge, and registers all hooks/routes.
- `sessionId` — `server/app.ts:151`: resolves and validates the `whale_session` cookie.
- `dailySummary` — `server/app.ts:260`: returns public daily evidence and lifecycle fields without settlement outcomes.
- `ensureDailyChallenge` — `server/app.ts:284`: publishes or resumes the immutable UTC-day challenge.

See [`docs/wiki/app.md`](../docs/wiki/app.md) and [`docs/api-map.md`](../docs/api-map.md).
