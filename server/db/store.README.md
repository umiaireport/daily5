# SQLite store

## Purpose and sections

`server/db/store.ts` owns Node 24 `node:sqlite` opening, directory creation, SQLite pragmas, schema v3 creation/migration, account-schema initialization, round-review persistence, and transaction rollback/commit behavior.

## Functions

- `SCHEMA_VERSION` — `server/db/store.ts:13`: declares the supported schema number (`3`).
- `initializeGameDatabases` — `server/db/store.ts:16`: runs all game and account table initializers.
- `openDatabase` — `server/db/store.ts:26`: creates/opens a database, rejects newer schemas, upgrades older progress, and ensures the game tables exist.
- `transaction` — `server/db/store.ts:64`: runs an action in `BEGIN IMMEDIATE`, committing or rolling back atomically.
