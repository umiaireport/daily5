# Account database

[`server/db/auth.ts`](../../server/db/auth.ts) creates two tables:

- `users` stores account identity and password hashes.
- `auth_sessions` stores revocable, expiring login sessions with a foreign key to `users`.

[`server/db/store.ts`](../../server/db/store.ts) calls `initializeAuthDatabase` as part of schema version 3. SQLite is appropriate for the local game and the free ephemeral demo deployment. A durable public deployment must replace the `/tmp` database with persistent storage before promising that accounts, scores, and leaderboards survive instance replacement.
