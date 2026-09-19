# Database migration script

## Purpose and sections

`server/db/migrate.ts` loads local environment configuration, opens the configured SQLite database through the shared store, applies schema v2 and the additive daily-challenge/settlement-source tables, closes it, and prints the schema version. It is the `npm run db:migrate` entrypoint. Daily HTTP routes are active; the one-shot worker performs settlement only when invoked by an external scheduler.

## Functions and control flow

The script has top-level control flow only; it calls `openDatabase` at `server/db/migrate.ts:8`, `initializeDailyDatabase` at `server/db/migrate.ts:9`, closes at `server/db/migrate.ts:10`, and logs at `server/db/migrate.ts:11`.
