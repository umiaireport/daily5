# Daily5 installation

## Requirements

- Node.js 24.x and npm
- A modern browser
- A Nansen API account and server-side key only when live provider data is needed

The local app uses Node 24’s built-in SQLite database. `DATABASE_PATH` controls where the local database is stored.

## Install

From the repository root:

```text
cd app
cp .env.example .env
npm ci
```

Keep `DATA_MODE=synthetic` for local development without a provider key. In live mode, startup uses the current same-day provider snapshot when available and collects a new pack when the UTC day changes.

## Verify and run

```text
npm run quality:check
npm run dev
```

Then open `http://127.0.0.1:8311`. The API health endpoint is `http://127.0.0.1:8411/healthz`. The demo account is `demo` / `demo`.

Useful commands from `app/`:

```text
npm test                 # unit and API tests
npm run typecheck        # TypeScript check
npm run build            # production browser bundle
npm start                # serve the built app
```

## Live Nansen data

Add the key only to the ignored `app/.env` file:

```text
DATA_MODE=live
NANSEN_API=your-server-side-key
```

To run with current Nansen data, configure the server-side key and use live mode:

```text
DATA_MODE=live npm run dev
```

The app writes `app/data/daily-five-provider-demo.json` for the current UTC day. `npm run download:daily-five` can be used from `app/` to refresh that day explicitly. There is no application default credit limit; set `NANSEN_CREDIT_BUDGET` only when an operator wants an explicit request guard.

Never commit `.env`, API keys, cookies, database files, or other secrets.
