# Fastify application module

## Purpose and sections

`server/app.ts` builds the API, initializes the daily and account tables, applies security headers, owns the revocable auth-cookie boundary and error mapping, registers game and Daily Five routes, reports health/admin status, and optionally serves the production bundle.

## Functions

- `buildApp` — `server/app.ts:342`: creates/configures Fastify, initializes the database and demo user, optionally collects provider data, and registers all hooks/routes.
- `authenticatedAuthUser` — `server/app.ts:528`: resolves the signed-in user from the revocable `daily5_user` cookie.
- `POST /api/auth/login` — `server/app.ts:548`: verifies credentials and issues an httpOnly session cookie.
- `POST /api/auth/register` — `server/app.ts:555`: creates an account and signs it in.
- `GET /api/auth/me` — `server/app.ts:569`: returns the safe current-user record.
- `POST /api/auth/logout` — `server/app.ts:573`: revokes the server session and clears the cookie.
- `sessionId` — `server/app.ts:576`: resolves and validates the legacy `whale_session` cookie for Whale Arena routes.

See [`docs/wiki/app.md`](../docs/wiki/app.md) and [`docs/api-map.md`](../docs/api-map.md).
