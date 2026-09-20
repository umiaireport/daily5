# Daily5 installation and setup

## Requirements

- Node.js 24.x and npm
- A modern browser
- A Nansen API account and server-side key only when live provider data is needed

The local app uses Node 24’s built-in SQLite fallback. `DATABASE_URL` is documented as a future durable database target; the current local adapter uses `DATABASE_PATH`.

## Install

From the repository root:

```text
cd app
cp .env.example .env
npm ci
```

Keep `DATA_MODE=synthetic` for local development without provider credits. The checked-in provider pack is reused when the configured snapshot exists, so ordinary startup does not spend Nansen credits.

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

Run the one-time collector only when live data is authorized and the account has credits:

```text
DATA_MODE=live DAILY_FIVE_DOWNLOAD=true npm run download:daily-five
```

The collector writes `app/data/daily-five-provider-demo.json`. It is reused by later local runs. `NANSEN_CREDIT_BUDGET` limits normal provider calls and `DAILY_FIVE_DOWNLOAD_BUDGET` limits the one-time collection.

Never commit `.env`, API keys, cookies, database files, or other secrets.
