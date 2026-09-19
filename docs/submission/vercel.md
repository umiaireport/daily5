# Vercel test deployment

The repository includes a root [`index.ts`](../../index.ts) so Vercel can detect the Fastify server. Vercel serves the browser and API from the same Fastify function; the client bundle is already included in `public/` for this deployment path.

## Safe first deployment

Import `umiaireport/daily5` into the logged-in Vercel account. Use the free/Hobby project for testing. Do not paste the Nansen key into the repository or into a client-side variable.

For the first smoke test, use these server environment variables:

```text
DATA_MODE=synthetic
DATABASE_PATH=/tmp/daily5.sqlite
```

The `/tmp` database is intentional for a smoke test. Vercel function storage is not a durable production database, so an instance restart can reset demo progress. A persistent database is needed for a real public leaderboard.

After deployment, test:

- `/` loads the Daily5 interface;
- login works with `demo` / `demo`;
- `/api/daily-five/today` returns five rounds;
- one practice run can be completed;
- the browser does not show “Daily Five could not connect.”

## Enabling the provider-backed board

Add these in Vercel Project Settings → Environment Variables. Select the environments where each variable should exist, normally **Preview** first and **Production** only after the preview works:

```text
NANSEN_API=<paste the verified key into Vercel only>
DATA_MODE=live
DATABASE_PATH=/tmp/daily5.sqlite
DAILY_FIVE_PROVIDER_SNAPSHOT=/tmp/daily-five-provider-demo.json
DAILY_FIVE_DOWNLOAD=true
NANSEN_CREDIT_BUDGET=10
DAILY_FIVE_DOWNLOAD_BUDGET=160
```

The download flag is deliberately separate from normal startup because it can spend provider credits. Use it only for the first live collection or when the saved `/tmp` pack is missing. After a successful warm deployment, turn `DAILY_FIVE_DOWNLOAD` off if the provider-backed pack is already available in that function instance. A cold instance may need a new collection because `/tmp` is temporary.

Never define `NANSEN_API` with a `VITE_` prefix. Client-exposed Vite variables are not suitable for secrets. The server reads `NANSEN_API` and the browser never receives its value.

## Vercel dashboard workflow

1. Choose **Add New… → Project**.
2. Import `umiaireport/daily5` from GitHub.
3. Keep the repository root as the project root.
4. Select the **Fastify** framework preset and leave the build command and output directory at their zero-configuration defaults.
5. Add the synthetic smoke-test variables and deploy a Preview.
6. Open the Preview URL and complete the checks above.
7. Add `NANSEN_API` only after the synthetic page works, then redeploy Preview with the live variables.
8. Inspect the deployment logs for the safe messages “Nansen data is ready” or “Saved Nansen Daily Five data is loaded locally.” Never log or paste the key.

The official [Fastify on Vercel guide](https://vercel.com/docs/frameworks/backend/fastify) says Vercel detects a root `index.ts`, `app.ts`, or `server.ts` entrypoint and deploys the Fastify app as a function. The [Vercel environment-variable guidance](https://vercel.com/docs/frameworks/frontend/vite#environment-variables) explains why the Nansen key must remain server-side.
