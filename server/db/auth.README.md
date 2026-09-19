# Account database schema

`server/db/auth.ts` creates the additive account schema used by Daily5.

- `initializeAuthDatabase` — `server/db/auth.ts:4`: creates `users`, `auth_sessions`, and lookup indexes with `IF NOT EXISTS`, so existing game databases upgrade safely.

`server/db/store.ts` calls this initializer after the existing game stores and reports schema version 3. Official attempt ownership remains in the Daily Five store; the auth tables provide the stable account identity used as its player ID.
