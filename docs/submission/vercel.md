# Vercel test deployment

The public repository is connected to the `umi-ai/daily5` Vercel project. It uses the Fastify preset and the root [`index.ts`](../../index.ts) entrypoint. Fastify serves both the built browser bundle and `/api/*) from the same deployment.

## Current project configuration

- GitHub: `umiaireport/daily5`
- Framework preset: Fastify
- Public test URL: `https://daily5-umi-ai.vercel.app`
- Database: `/tmp/daily5.sqlite` for the free test deployment
- Vercel Authentication: disabled for the public test URL so login/API requests return JSON directly
- Provider mode: live; the Nansen key is server-side only

The free Vercel filesystem is ephemeral. SQLite accounts, sessions, attempts, and leaderboards can reset when a function instance is replaced. Use a persistent managed database before treating this as a durable public service.

## Encrypted Project Environment Variables

Vercel Project Settings → Environment Variables contains these Preview/Production values:

```text
NANSEN_API=<encrypted secret copied internally from workspace NANSEN_API2>
DATA_MODE=live
DAILY_FIVE_DOWNLOAD=true
DAILY_FIVE_PROVIDER_SNAPSHOT=/tmp/daily-five-provider.json
DATABASE_PATH=/tmp/daily5.sqlite
NANSEN_CREDIT_BUDGET=160
DAILY_FIVE_DOWNLOAD_BUDGET=160
DAILY_FIVE_HISTORY_LAG_DAYS=2
```

The `NANSEN_API` value was copied directly from the existing workspace `NANSEN_API2` without printing it or committing it. Do not create a tracked `.env` containing that value. Vercel Secret variables are write-only after saving; the key remains inside the server function and is never exposed through Vite or the browser.

`DAILY_FIVE_DOWNLOAD=true` is intentional for this test deployment: it tells a fresh function instance to collect provider data instead of silently using an old repository snapshot. The provider collector is budgeted at 160 credits, matching the existing one-time download script. This can spend credits on a fresh cold instance; turn it off only when choosing a warm-instance/demo configuration that is allowed to reuse the temporary `/tmp` pack.

## Deployment checklist

1. Push a commit to `main`.
2. Wait for a Vercel deployment marked **Ready**.
3. Open the public URL in a private browser window.
4. Confirm the HTML shell loads.
5. Test `demo/demo` login and account registration.
6. Test `GET /api/daily-five/today`; in live mode it must return provider-backed rounds or a clear provider error, never a synthetic board.
7. Complete one official or practice attempt and inspect the account/leaderboard views.
8. Review Vercel logs for status messages only. Never copy a provider key or raw response into an issue, chat, or submission.

## Provider-credit gate

The latest public smoke test confirmed that the HTML shell, `demo/demo` login, and account registration work. The provider-backed `GET /api/daily-five/today` route can return `503` with a controlled `Nansen rejected the request because the configured account has insufficient API credits` message when the mapped `NANSEN_API2` account has no remaining credits. This is an external provider-account state, not a login or JSON-parsing bug. Replenish or authorize a funded Nansen account before recording the live submission; do not hide the state by switching to an old snapshot.

## Safe synthetic fallback for development

For a no-credit local or temporary Vercel smoke test, use only:

```text
DATA_MODE=synthetic
DATABASE_PATH=/tmp/daily5.sqlite
```

Synthetic mode is clearly labelled and must not be used for the recording that claims provider-backed behavior.

Vercel’s [Fastify deployment guide](https://vercel.com/docs/frameworks/backend/fastify) documents the root entrypoint convention. Vercel’s [environment variable guidance](https://vercel.com/docs/environment-variables/sensitive-environment-variables) explains Config versus Secret values and the REST/CLI workflows used for the encrypted project settings.
