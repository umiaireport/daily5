# Daily challenge domain foundation

## Purpose and sections

`server/domain/daily.ts` defines the trusted internal model for versioned daily challenges, canonical evidence, one locked anonymous entry, delayed settlement, fixed-time voiding, and immutable result storage. Fastify exposes the public daily routes, while the private settlement-source table and one-shot worker supply post-window prices.

## Functions and methods

- `canonical` — `server/domain/daily.ts:62`: serializes finite JSON evidence and rules with stable object-key ordering.
- `DailyGame` constructor — `server/domain/daily.ts:77`: accepts SQLite and an injectable clock.
- `DailyGame.now` — `server/domain/daily.ts:83`: validates the server clock.
- `DailyGame.row` — `server/domain/daily.ts:89`: reads a persisted challenge row.
- `DailyGame.assertSupportedRules` — `server/domain/daily.ts:97`: rejects daily scoring rules that differ from the supported cost version.
- `DailyGame.publish` — `server/domain/daily.ts:113`: validates and immutably publishes a challenge payload before its lock window.
- `DailyGame.challenge` — `server/domain/daily.ts:161`: returns only the public challenge payload.
- `DailyGame.status` — `server/domain/daily.ts:165`: returns lifecycle state without exposing settlement data.
- `DailyGame.enter` — `server/domain/daily.ts:170`: validates and locks one official allocation inside the open window.
- `DailyGame.result` — `server/domain/daily.ts:196`: returns pending, settled, or void entry state.
- `DailyGame.settle` — `server/domain/daily.ts:208`: freezes a complete settlement or voids it after the fixed deadline.
