# Account and session service

`server/auth/users.ts` owns Daily5 account creation, scrypt password hashing, demo-user seeding, credential verification, user lookup, and revocable session lifecycle. It exposes public user records only; password hashes stay in SQLite.

## Functions

- `hashPassword` — `server/auth/users.ts:54`: creates a salted scrypt hash.
- `normalizeUsername` — `server/auth/users.ts:96`: canonicalizes case-insensitive usernames.
- `validateRegistration` — `server/auth/users.ts:100`: enforces registration username, password, and display-name rules.
- `ensureDemoUser` — `server/auth/users.ts:116`: idempotently seeds the documented `demo` / `demo` account.
- `registerUser` — `server/auth/users.ts:124`: validates and inserts a new account.
- `authenticateUser` — `server/auth/users.ts:153`: verifies credentials and updates last-login time.
- `userById` — `server/auth/users.ts:168`: resolves a display-safe user record for leaderboard names.
- `createAuthSession` — `server/auth/users.ts:174`: creates a random 30-day session.
- `userByAuthSession` — `server/auth/users.ts:184`: resolves an unexpired session.
- `deleteAuthSession` — `server/auth/users.ts:200`: revokes a session on logout.
