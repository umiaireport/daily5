# Daily5

Daily5 is a five-round market-reading game built for the Nansen Meridian Buildathon. Nansen-backed market evidence becomes research clues; players allocate a virtual wallet, lock a decision, and inspect the historical result. It never places real trades.

## Quick start

Requirements: Node.js 24.x, npm, and a modern browser. A Nansen key is not required for the local synthetic experience.

```text
cd app
cp .env.example .env
npm ci
npm run dev
```

Open `http://127.0.0.1:8311`. The API runs at `http://127.0.0.1:8411`. Use the demo account `demo` / `demo`, or create a local account.

For complete setup, live-data configuration, and verification commands, read [`INSTALLATION.md`](INSTALLATION.md). The AI-assisted setup prompt is in [`AI_INSTALL_PROMPT.md`](AI_INSTALL_PROMPT.md).

## How the app works

- Daily Five presents five mystery assets, charts, clues, allocation controls, and an immediate result after each round.
- Practice uses the saved provider asset pack when available and labels synthetic data clearly when live data is not configured.
- The virtual wallet compounds through five rounds; clues are factual observations, not trading advice.
- Account history and official leaderboards are stored by the local app. Practice results do not enter official leaderboards.

## Nansen data

Synthetic mode is the safe default. To collect provider-backed historical assets, put the server-side key in `app/.env`, set `DATA_MODE=live`, and run the one-time download from `app/`:

```text
DATA_MODE=live DAILY_FIVE_DOWNLOAD=true npm run download:daily-five
```

The saved provider pack is reused on restart. Provider calls are bounded by `NANSEN_CREDIT_BUDGET`; never put a key in source code or a browser environment variable. See [`app/docs/NANSEN_API.md`](app/docs/NANSEN_API.md) for the data settings.

## Repository layout

```text
app/
  server/       Fastify API and game logic
  web/          React interface
  shared/       Shared game contracts
  fixtures/     Deterministic synthetic data
  data/         Saved provider pack and ignored local database files
  docs/         App usage and Nansen data notes
  screenshots/  Current production app captures
  tests/        Unit, API, and browser tests
```
