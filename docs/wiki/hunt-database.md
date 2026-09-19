# Whale Hunt database

## 1. Tables

`server/db/hunt.ts` keeps the additive v1 Hunt tables. `server/db/hunt-v2.ts` adds `hunt_v2_matches` and `hunt_v2_commands`. The v2 match row stores the player role, phase, round index, state version, deadline, serialized round boards, scores, and completion timestamp. The command table stores the exact actor payload and response for idempotent retries.

## 2. Migration

`initializeHuntV2Database` is called by `initializeGameDatabases` in `server/db/store.ts`. It uses `CREATE TABLE IF NOT EXISTS` and does not alter or reinterpret v1 rows. A restart can therefore recover v2 deadlines and score state from SQLite before the next browser poll.

## 3. Persistence helpers

`readHuntV2Match`, `readActiveHuntV2Matches`, `insertHuntV2Match`, and `updateHuntV2Match` manage match state. `readHuntV2Command` and `insertHuntV2Command` preserve exact command responses. The domain engine wraps mutations in the shared immediate transaction helper.
