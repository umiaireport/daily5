# `tests/production.test.ts`

The conditional production test (`tests/production.test.ts:6-33`) builds the Fastify app against the Vite output when `dist/index.html` exists. It verifies the built bundle, CSP, absence of source/provider secrets, 404 handling, API reachability, and the `Secure` production session cookie. It is skipped before `npm run build`.
