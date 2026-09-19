# Daily5

Daily5 is the standalone daily challenge extracted from Whale Arena. It keeps the Daily Five research surface—five mystery asset cards, charts, clues, allocation controls, immediate reveal, and scorecard—without exposing Whale Hunt.

## Meridian Buildathon submission

Daily5 is a five-round market-reading game: Nansen-backed evidence becomes the clues, the player allocates a virtual wallet, and the board reveals the result after the round closes. It never places real trades. The full ordered submission workflow, live-data safety notes, GitHub checklist, form fields, and recording plan are in [`docs/submission/README.md`](docs/submission/README.md). The 30–60 second silent demo shot list is in [`docs/submission/demo-script.md`](docs/submission/demo-script.md).

## Product behavior

- **Daily challenge:** one immutable five-round UTC challenge per day. The official result is saved to the signed-in account, and the final screen says to try again tomorrow.
- **Practice Arena:** one round with five randomly selected assets from the loaded Nansen provider pool. Practice can be replayed and never enters a leaderboard. When provider data is not available, the board is explicitly labelled synthetic.
- **Account:** the demo login is `demo` / `demo`. Completed official results remain visible after a day rolls over.
- **Records:** the current day’s official board, frozen historical day boards, and an all-time top-100 official leaderboard are server-owned. Practice is excluded.

## Run locally

Node 24 is required.

```text
npm ci
npm run dev              # web http://127.0.0.1:8311, API http://127.0.0.1:8411
npm run typecheck
npm run format:check
npm run build
```

Open `http://127.0.0.1:8311` and log in with `demo` / `demo`.

The app is safe to run without a provider key: official and practice data use the existing synthetic Daily Five fallback and are labelled as synthetic. To load provider-backed historical assets, configure `DATA_MODE=live`, `NANSEN_API` (the legacy `NANSEN_API2` and `NANSEN_API_KEY` aliases remain supported), and run the one-time collection flow:

```text
DATA_MODE=live DAILY_FIVE_DOWNLOAD=true npm run download:daily-five
```

The saved provider pack is reused on restart, so normal app startup does not spend provider credits. Practice draws a fresh five-asset board from that immutable provider pool for each new practice attempt. Provider calls are bounded by `NANSEN_CREDIT_BUDGET`; never enable live mode without a funded, permitted key. Run `npm run submission:check` before publishing.

## Main routes

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/daily-five/today` and the Daily Five attempt/clue/ticket/continue routes
- `GET /api/practice/today` and the same attempt routes under `/api/practice` (no leaderboard route)
- `GET /api/account/history`
- `GET /api/leaderboards/all-time`

Official starts for an old day are rejected after UTC rollover, while the published case pack and its results remain readable. This is the frozen-leaderboard boundary.

## Scope notes

`IMPLEMENTATION_PROMPT.md` is the implementation brief used for this split. The copied legacy server modules remain available for compatibility, but the Daily5 UI does not link to Whale Hunt or the old arena.
