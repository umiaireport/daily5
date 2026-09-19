# SQLite store

## Purpose and sections

`server/db/store.ts` owns Node 24 `node:sqlite` opening, directory creation, SQLite pragmas, schema v2 creation/migration, round-review persistence, and transaction rollback/commit behavior.

## Functions

- `SCHEMA_VERSION` — `server/db/store.ts:5`: declares the supported schema number (`2`).
- `openDatabase` — `server/db/store.ts:7`: creates/opens a database, rejects newer schemas, upgrades schema v1 progress to v2 `round_reviews`, and ensures the game tables exist.
- `transaction` — `server/db/store.ts:44`: runs an action in `BEGIN IMMEDIATE`, committing or rolling back atomically.
