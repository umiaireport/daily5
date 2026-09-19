# Daily5 submission runbook

This ordered workflow takes Daily5 from a clean checkout to a public Meridian Buildathon submission. Daily5 turns Nansen market evidence into a five-round reading challenge: players allocate a virtual wallet, lock one call per round, see the historical reveal, and compare their read with the board.

Daily5 never places real trades, asks for wallet signatures, or presents a score as financial advice.

## 1. Rules and deliverables

Use the local rules cache at [`../buildathon-rules.md`](../buildathon-rules.md), then recheck the official pages immediately before submitting:

- [Meridian Buildathon rules](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27)
- [Meridian campaign page](https://nansen.ai/campaigns/meridian-buildathon)

| Deliverable | Location/status |
| --- | --- |
| Product source, tests, and setup | repository root; implemented |
| Installation instructions | [`../../README.md`](../../README.md) |
| Vercel settings | [`vercel.md`](vercel.md); configured for `umi-ai/daily5` |
| Recording shot list | [`demo-script.md`](demo-script.md) |
| Public repository | [github.com/umiaireport/daily5](https://github.com/umiaireport/daily5); pushed |
| Public test deployment | `daily5-umi-ai.vercel.app`; verify after each push |
| X post and campaign form | user publishes/submits after verification |

## 2. Dependencies and installation

### Required

- Node.js `24.x` (`package.json` requires `>=24.0.0 <25`)
- npm bundled with Node
- Git for cloning/pushing
- A modern browser
- Playwright only for automated browser tests or recording assistance

Node 24 is required because the server uses built-in `node:sqlite`. No global Fastify, Vite, TypeScript, or database installation is required.

### Clean setup

```bash
git clone https://github.com/umiaireport/daily5.git
cd daily5
npm ci
cp .env.example .env
npm run typecheck
npm run build
npm run dev
```

Open `http://127.0.0.1:8311`. The API is proxied at `http://127.0.0.1:8411`. `npm ci` installs the pinned dependencies: Fastify and its cookie/rate-limit/static plugins, React, Vite, Zod, TypeScript, `tsx`, Prettier, and Playwright.

The seeded test login is:

```text
username: demo
password: demo
```

The login screen also supports account creation. New users need a 3–40 character username and an 8–80 character password. The display name is used on the board.

Before each public push:

```bash
npm run format:check
npm run typecheck
npm test
npm run build
npm run submission:check
```

## 3. User database and saved progress

The server initializes these SQLite tables:

- `users`: UUID, unique case-insensitive username, display name, scrypt password hash, creation time, and last login time.
- `auth_sessions`: random session ID, user ID, creation time, and 30-day expiry.

The browser receives an httpOnly same-origin `daily5_user` cookie containing only a revocable session ID. Passwords are never stored in plaintext, returned by the API, logged, or sent back to the browser. Logout deletes the session. Daily Five attempt and leaderboard rows use the authenticated user UUID, so accounts have separate progress and names. The `demo/demo` account is inserted idempotently in every new database.

Auth API:

```text
POST /api/auth/register  { username, password, displayName? }
POST /api/auth/login     { username, password }
GET  /api/auth/me
POST /api/auth/logout
```

Local defaults to `./data/daily5.sqlite`. The free Vercel test uses `/tmp/daily5.sqlite`: it is writable but ephemeral, so a function restart can reset accounts and scores. That is suitable for a demo, not durable production. A real multi-user launch needs a persistent managed database for users, attempts, and leaderboards.

## 4. Nansen data modes

- `DATA_MODE=synthetic` is safe local development and is labelled synthetic.
- `DATA_MODE=live` requires a server-side key. Names are checked in order: `NANSEN_API`, `NANSEN_API2`, `NANSEN_API_KEY`.
- `DAILY_FIVE_DOWNLOAD=true` permits collection when no saved provider pack exists.
- The one-time budget is `DAILY_FIVE_DOWNLOAD_BUDGET` (default `160`); normal local startup reuses the saved pack.
- The browser never receives the key. Never use a `VITE_` prefix.

For local collection only, put the key in a private `.env` and run:

```bash
DATA_MODE=live DAILY_FIVE_DOWNLOAD=true npm run download:daily-five
```

The command reports pack metadata only, not credentials or raw provider payloads.

## 5. Ordered release workflow

### Step 1 — Local QA

Run synthetic mode, create an account, log out and back in, complete a practice round, inspect the official board, account history, and both leaderboard tabs. Run `npm run submission:check`.

### Step 2 — Nansen proof

The authorized workspace account is currently under `NANSEN_API2`. Do not paste it into chat or GitHub. The submitting Nansen dashboard must separately show the required 1,000-call proof; do not spend calls just to repeat that check.

### Step 3 — Vercel

The GitHub repository is connected to the `umi-ai/daily5` Vercel project using the Fastify preset and root `index.ts`. Follow [`vercel.md`](vercel.md). The key is stored as a Vercel Secret under `NANSEN_API`, not in a tracked `.env`.

After each push, wait for a READY deployment and verify `/`, `demo/demo`, registration, `/api/daily-five/today`, one official/practice flow, account history, and both leaderboards.

### Step 4 — Push

```bash
cd /home/hekatlon/hekatlon/hackathlon/daily5
git status --short
npm run submission:check
git add .
git diff --cached --check
git commit -m "Prepare Daily5 submission"
git push origin main
```

Before staging, confirm `.env`, `.env.*` except `.env.example`, `data/`, databases, `node_modules/`, Vercel files, backups, and recordings are ignored. The public repo contains source, tests, fixtures, and documentation, never credentials or raw provider data.

### Step 5 — Record

Follow [`demo-script.md`](demo-script.md), keeping the video between 30 and 60 seconds:

1. Daily5 board and provider status.
2. Evidence/clue inspection.
3. Virtual wallet allocation.
4. Locked call and historical reveal.
5. Scorecard and Today’s / All-time leaderboard.

Do not show a terminal, API key, cookies, private dashboard, or personal information. The user captures the final recording from the logged-in desktop.

### Step 6 — Public post

From the submitting X account, publish a public post tagging `@nansen_ai`, include the GitHub URL, and attach the recording. Suggested copy:

> Daily5 is a five-round market-reading game powered by Nansen data. Read the clues, size a virtual wallet, lock your call, and see who read the board best. Code: `<GitHub URL>` #NansenMeridian @nansen_ai

### Step 7 — Form

After the repo and post work in an incognito window, the user submits:

```text
Email:       <submitting email>
X post URL:  <public post URL>
GitHub URL:  https://github.com/umiaireport/daily5
```

Keep the confirmation private. Finally record the commit hash, public URLs, Nansen proof, form confirmation, and video filename in a private note, then freeze the submitted build.

## 6. Security checklist

Never commit or paste `NANSEN_API`, `NANSEN_API2`, `NANSEN_API_KEY`, Vercel tokens, wallet credentials, cookies, raw provider payloads, SQLite databases, private user records, form confirmations, or personal screenshots. Rotate a secret immediately if it is exposed.

