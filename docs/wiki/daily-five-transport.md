# Daily Five transport

## 1. Purpose and behavior

Maps today/start/resume/clues/tickets/continue/leaderboard to /api/daily-five. Same-origin credentials and stable command keys preserve server ownership. withDailyDeadline bounds headers and body streams even when a fetcher ignores AbortSignal; actual fetches are aborted on timeout. Structured API errors and plain message bodies remain readable. No mutation is automatically retried with a new command key.

## 2. Code sections

Timeout helper and typed errors; key/JSON helpers; HTTP adapter.

## 3. Functions and checks

- `withDailyDeadline` — `web/api/daily-five.ts:15`.
- `DailyFiveTransportError.constructor` — `web/api/daily-five.ts:52`.
- `defaultIdempotencyKey` — `web/api/daily-five.ts:78`.
- `encode` — `web/api/daily-five.ts:83`.
- `withIdempotencyKey` — `web/api/daily-five.ts:87`.
- `readJson` — `web/api/daily-five.ts:97`.
- `createDailyFiveApi` — `web/api/daily-five.ts:108`.
- `request` — `web/api/daily-five.ts:115`.
- `post` — `web/api/daily-five.ts:168`.
- `commandKey` — `web/api/daily-five.ts:209`.
