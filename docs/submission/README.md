# Daily5 Meridian Buildathon submission

This is the single working checklist for taking Daily5 from the current local build to a safe public submission. Work from top to bottom. The goal is a short, reliable demonstration of one clear idea:

> Daily5 turns Nansen market evidence into a five-round reading challenge. Players size a virtual wallet, lock one call per round, see the market answer after the cutoff, and compare their read with the board.

Daily5 is a paper game. It does not execute trades, request wallet signatures, or present its score as financial advice.

## 1. Rules that control the submission

The official Meridian Buildathon rules are the source of truth. The local working copy is [`../buildathon-rules.md`](../buildathon-rules.md), with official links at the top. Recheck the official pages immediately before posting because dates and form requirements can change.

The current requirements are:

| Requirement | What we must deliver |
| --- | --- |
| Nansen use | Nansen data must drive important product behavior, not just appear as decoration. In Daily5 it supplies the provider-backed asset/evidence pack used by the challenge. |
| API proof | The submitting account must have logged at least 1,000 Nansen API calls. Confirm this in the Nansen dashboard before the final submission; do not spend calls just to repeat the proof. |
| Public demo post | Publish a public X post tagging `@nansen_ai`, include the public GitHub URL, and attach a 30–60 second screen recording. The recording needs to show the build running with live/provider-backed Nansen data. |
| Public code | The GitHub repository must be public and contain a useful README and setup instructions. Never publish secrets, raw credentials, private user data, or local database files. |
| Entry form | Submit the email address, public X post URL, and public GitHub URL. Submit once, after both public links work. |

The local rules snapshot lists the current deadline as **27 September 2026 at 23:59 UTC**. The [official Meridian rules](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27) and [official campaign page](https://nansen.ai/campaigns/meridian-buildathon) must be checked again before submission.

## 2. Ordered work plan

### Step 1 — Finish and review the documentation

This step is the current local deliverable.

- Read the root [`README.md`](../../README.md) first. It explains the product, local run commands, live/synthetic boundary, and the two submission documents.
- Keep [`../buildathon-rules.md`](../buildathon-rules.md) as the local rules cache, but use the official links there for final verification.
- Keep the product explanation short and concrete: evidence → player decision → reveal → score → leaderboard.
- Explain that the saved provider snapshot is reused at normal startup. A normal restart must not spend Nansen credits.
- Keep a clear distinction between `DATA_MODE=live` and explicit synthetic/practice mode. The UI must never call synthetic data live.
- Before public release, replace any “local proof” wording with the current dashboard evidence if the Nansen account status has changed.

### Step 2 — Select the correct Nansen account without exposing its key

Daily5 now checks these names in this order:

1. `NANSEN_API` — the submission key name to use.
2. `NANSEN_API2` — legacy workspace fallback.
3. `NANSEN_API_KEY` — second legacy fallback.

The app only checks whether a non-empty key exists; it never renders or logs the key. We found an older `NANSEN_API2` entry in the workspace, but we did **not** copy a secret automatically. To use the account that already has the 1,000-call proof, set the same key locally under `NANSEN_API` in either `daily5/.env` or the workspace `.env` file. Do not paste the value into chat, a README, GitHub, X, or the submission form.

After setting it, verify only the presence of the variable:

```bash
cd /home/hekatlon/hekatlon/hackathlon/daily5
set -a
. ../.env
set +a
if [ -n "${NANSEN_API:-}" ]; then echo "NANSEN_API is configured"; else echo "NANSEN_API is missing"; fi
```

If the key is currently stored only as `NANSEN_API2`, the user should either rename/copy it locally to `NANSEN_API` or tell Codex where the already-authorized local configuration is. The value itself should not be sent through chat.

### Step 3 — Verify the saved provider-backed pack before making calls

The repository already contains `data/daily-five-provider-demo.json`, which is ignored by Git and is reused by live-mode startup. First run the app with `DATA_MODE=live` and inspect the UI/health status. Do not run a new download merely as a test.

Only if the pack is missing, invalid, or too old for the recording should the user explicitly authorize a fresh collection:

```bash
cd /home/hekatlon/hekatlon/hackathlon/daily5
DATA_MODE=live DAILY_FIVE_DOWNLOAD=true npm run download:daily-five
```

That one-time command can consume provider credits. Keep the normal server command free of `DAILY_FIVE_DOWNLOAD=true`; it should reuse the saved pack.

The final live-mode check should show:

- `DATA_MODE=live` in the server configuration;
- a provider-backed/saved Nansen Daily Five status in the app;
- five real provider assets and their evidence-driven charts/clues;
- the attribution/source treatment in the interface;
- no fallback to synthetic data while the screen says live.

### Step 4 — Run the release quality gate

From `daily5/`:

```bash
npm ci
npm run submission:check
```

`submission:check` runs formatting, TypeScript validation, the test suite, and the production build. Resolve every failure before publishing. Then do one manual browser pass with the current live configuration:

1. Log in with the demo account.
2. Open the Daily5 board and confirm the source/status text.
3. Play one round without submitting a second official attempt.
4. Inspect the reveal, scorecard, and both leaderboard views.
5. Refresh and confirm the saved state still loads.
6. Confirm practice mode is clearly separate from the official board.

### Step 5 — Prepare the recording

Use the shot list in [`demo-script.md`](demo-script.md). Keep the final cut between 30 and 60 seconds. The recording should show a working product quickly, not a terminal or code walkthrough:

1. Daily5 landing/board with Nansen/provider-backed status visible.
2. One evidence/clue inspection.
3. A virtual allocation across the five assets.
4. Locking the call and the reveal after the cutoff.
5. Scorecard plus the daily/all-time leaderboard controls.

Narration is optional. Do not show a terminal containing environment variables, API keys, browser cookies, local paths with private information, or personal account details.

### Step 6 — Create or connect the GitHub repository

The current machine does not have the `git` executable or a configured remote, so this step needs user setup before Codex can push.

The user should provide one of these paths:

- install Git and authenticate with GitHub using `gh auth login` or the normal Git credential flow; or
- create an empty GitHub repository and provide its HTTPS/SSH remote URL, then authenticate locally without sending a password or token through chat.

Once Git is available, the safe sequence is:

```bash
cd /home/hekatlon/hekatlon/hackathlon/daily5
git init
git add .
git status --short --ignored
git diff --cached --check
git commit -m "Prepare Daily5 Meridian submission"
git branch -M main
git remote add origin <PUBLIC_GITHUB_REMOTE>
git push -u origin main
```

Before the first `git add`, confirm that `.env`, `.env.*` except `.env.example`, `data/`, `dist/`, `node_modules/`, databases, backups, and recordings are ignored. The public repository must contain source, tests, fixtures, documentation, and the safe `.env.example`, not the local provider key or raw downloaded payloads.

After pushing, open the public URL in a private/incognito browser window and verify that the README, setup commands, and source tree are readable without GitHub login.

### Step 7 — Publish the X demo post

The user must publish this from the submitting X account because it requires the account identity and public link. Suggested copy:

> Daily5 is a five-round market-reading game powered by Nansen data. Read the clues, size a virtual wallet, lock your call, and see who read the board best. Code: `<GitHub URL>` #NansenMeridian @nansen_ai

Attach the 30–60 second recording. Keep the post public, tag `@nansen_ai`, and copy the final public post URL. Do not include an API key, raw response, or private dashboard screenshot.

### Step 8 — Complete the entry form

Open the official entry form only after the public repository and X post have been tested:

```text
Email:       <submitting email>
X post URL:  <public X post URL>
GitHub URL:  <public repository URL>
```

The user must enter the email and submit the form. Use one submission for the account. Save the confirmation page or confirmation email for the project record, but do not commit it to GitHub.

### Step 9 — Final handoff

Record these final values somewhere private:

- public GitHub URL;
- public X post URL;
- form submission timestamp and confirmation;
- Nansen dashboard proof that the 1,000-call requirement is satisfied;
- the exact commit hash used for submission;
- the video filename and a local/private backup.

Then stop changing the submitted build unless a rules-required fix is needed. Any later code change should be a new commit and should be checked against the same recording flow.

## 3. Current status and ownership

| Item | Status | Owner / next action |
| --- | --- | --- |
| Product README and submission docs | Prepared locally | Codex; review the wording before publish. |
| Nansen key precedence | Prepared locally | Codex changed the app to prefer `NANSEN_API`; user must set/confirm that local variable without sharing its value. |
| Saved provider pack | Present locally | Codex verified the app path; user should approve any new provider download. |
| Tests/build | Previously passing; rerun `npm run submission:check` before release | Codex. |
| Git repository/remote | Not configured; Git executable is unavailable in this machine | User: install/authenticate Git or provide a configured environment. |
| Public GitHub repository | Not created/pushed | User supplies account/repo destination; Codex can prepare and push after local authentication. |
| Screen recording | Not captured | User runs the Debian capture steps in [`demo-script.md`](demo-script.md); Codex can review the resulting file if it is placed in the workspace. |
| X post | Not published | User publishes from the submitting X account. |
| Entry form | Not submitted | User submits after the two public links work. |

## 4. Security boundary

Never commit or paste any of the following: `NANSEN_API`, legacy API aliases, raw provider payloads, wallet credentials, cookies, local SQLite databases, private user records, form confirmation details, or personal account screenshots. If a key is accidentally exposed, revoke it before continuing.
