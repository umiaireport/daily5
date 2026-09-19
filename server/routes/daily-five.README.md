# Daily Five routes

## 1. Purpose

`server/routes/daily-five.ts` is a route registrar for the frozen Daily Five transport contract. It does not own application startup, the session cookie plugin, or coordinator route mounting.

## 2. Code sections

The registrar exposes the public daily challenge, attempt start/resume, clue unlock, ticket submission, continue acknowledgment, and leaderboard routes. Portfolio ticket schemas accept optional integer leverage from 1× through 100×. A coordinator supplies the `DailyFiveEngine` and may supply the existing session identity resolver.

## 3. Functions

`params` (`server/routes/daily-five.ts:48`) validates route ids. `sendError` (`:52`) serializes typed domain and Zod errors. `identity` (`:67`) resolves the configured player identity or the `whale_session` cookie. `safely` (`:75`) keeps route errors structured. `registerDailyFiveRoutes` (`:84`) registers all seven routes, and `dailyFiveRoutes` (`:124`) is its registrar alias.
