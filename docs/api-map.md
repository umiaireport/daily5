# Whale Arena API Map

## 1. Local processes

Development runs Fastify on `http://127.0.0.1:8411` and Vite on `http://127.0.0.1:8311`; Vite proxies `/api` and `/healthz`. Production Fastify serves the built `dist/` web bundle and API from one origin, normally with `API_PORT=8311` (the container uses this port). The `whale_session` cookie is `secure` in production, so remote deployments require HTTPS; local development keeps it usable over HTTP. See `server/app.ts` for the authoritative route definitions.

## 2. Game routes

| Method and path                    | Behavior                                                                                 | Authentication/state                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `POST /api/sessions`               | Create or resume a cookie session                                                        | Sets `whale_session`                                          |
| `POST /api/sessions/reset`         | Start a fresh expedition                                                                 | Replaces cookie                                               |
| `GET /api/session`                 | Return progress/equity                                                                   | Cookie required                                               |
| `GET /api/scenarios/next`          | Return current public round                                                              | Cookie required                                               |
| `POST /api/scenarios/:id/unlock`   | Atomically spend one clue and return updated round                                       | Cookie, strict asset/card body                                |
| `POST /api/scenarios/:id/choice`   | Validate and lock 4 weights; calculate result                                            | Cookie, immutable choice                                      |
| `GET /api/scenarios/:id/result`    | Return stored reveal                                                                     | Cookie and prior lock                                         |
| `POST /api/scenarios/:id/continue` | Mark the saved reveal reviewed and advance to the next round                             | Cookie, empty strict body, prior result required              |
| `GET /api/leaderboard`             | Return completed five-round session entries                                              | Cookie required                                               |
| `GET /api/challenges/today`        | Report live challenge availability, source, and observed timestamp                       | Public; live only when `DATA_MODE=live` collects successfully |
| `GET /api/daily/today`             | Return the pinned daily evidence snapshot and lifecycle window without settlement prices | Public; settlement fields are never included                  |
| `POST /api/daily/today/entry`      | Validate and immutably lock one daily allocation                                         | Cookie, strict weights body                                   |
| `GET /api/daily/today/result`      | Return this session's pending/settled/void daily result, or `status: none` before entry  | Cookie                                                        |
| `GET /healthz`                     | Return synthetic/live provider health                                                    | Public                                                        |
| `GET /api/admin/usage`             | Return redacted provider usage and credit accounting                                     | Bearer `ADMIN_TOKEN`                                          |

All API routes use no-store cache headers. POST requests with an Origin are checked against the request host and local dev origins. Error responses intentionally expose controlled messages only.

`choices` stores the result before the choice response is returned. `GET /api/scenarios/next` therefore returns that locked round after a reload until the client calls `POST /api/scenarios/:id/continue`; the `round_reviews` table records that review transition so a restart cannot skip an unreviewed result. The daily routes use `DailyGame` and separate `daily_challenges`/`daily_entries` tables; the public summary contains evidence and schedule only, while settlement remains server-owned.

## 3. Provider boundary

`server/nansen/client.ts` allowlists the documented live token-screener, token-information, flow, and candle operations under `https://api.nansen.ai`. `createNansenClient` is disabled unless explicitly enabled with a key, validates caller-provided schemas, caches in process memory, reserves estimated credits, limits concurrency/start rate, retries transient failures at most twice, and reports redacted attempt events. `server/domain/live.ts` uses token discovery, token information, Flow Intelligence, and OHLCV candles for the public game, with visible Nansen attribution; restricted raw Smart Money payloads are not rendered.

The daily provider scheduler is `npm run worker`: a one-shot process intended to run after deployment under cron, systemd, or a hosted scheduled job. It claims the `daily-settlement` SQLite lease, reads private source references, fetches one latest OHLCV close per due live asset, and settles or voids through the server-owned daily domain. It does not expose provider references over HTTP and does not run merely because the web app is online.
