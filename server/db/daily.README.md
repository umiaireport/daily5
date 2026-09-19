# Daily challenge database helpers

## Purpose and sections

`server/db/daily.ts` provides additive SQLite tables for daily challenge payloads, anonymous entries, immutable private settlement sources, and worker leases. The helpers are initialized by the HTTP app, `npm run db:migrate`, and the one-shot settlement worker.

## Functions

- `initializeDailyDatabase` — `server/db/daily.ts:20`: creates daily challenge, entry, lease, and private settlement-source tables idempotently.
- `registerDailySettlementSources` — `server/db/daily.ts:50`: pins three validated provider or synthetic price references for a challenge and rejects revisions.
- `dailySettlementSources` — `server/db/daily.ts:118`: reads private settlement references for the worker; HTTP routes never call it.
- `pendingDailyChallenges` — `server/db/daily.ts:150`: lists lifecycle-pending challenge payloads for a settlement pass.
- `acquireDailyLease` — `server/db/daily.ts:158`: atomically claims or renews an unexpired owner lease, or claims an expired lease.
- `releaseDailyLease` — `server/db/daily.ts:186`: deletes a lease only for its owner.
