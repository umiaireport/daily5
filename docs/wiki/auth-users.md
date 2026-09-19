# Account and session service

Daily5 accounts are implemented in [`server/auth/users.ts`](../../server/auth/users.ts). Passwords use Node’s built-in scrypt implementation with a random salt. Only a public `{ id, username, displayName }` record leaves the service.

Registration normalizes usernames to lowercase, enforces safe characters, requires an 8–80 character password, and rejects duplicate usernames case-insensitively. A demo account is seeded on database initialization for local and review environments.

After login or registration, the server inserts a random UUID into `auth_sessions` and sets it in the httpOnly `daily5_user` cookie. Requests resolve the session against its expiry and join it to `users`; logout deletes the row. Daily Five route identity uses the resolved user UUID, preventing a shared demo identity from mixing attempts between accounts.

The HTTP integration lives in [`server/app.ts`](../../server/app.ts), around `authenticatedAuthUser`, `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/logout`. The browser form is in [`web/App.tsx`](../../web/App.tsx), in `Login`.
