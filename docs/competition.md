# Meridian Buildathon Submission Notes

## 1. Official brief

The locally cached rules and competitive pattern library are in [`buildathon-rules.md`](buildathon-rules.md). Use that file during development so the campaign page is not repeatedly fetched; links there remain the source of truth for final submission details.

The [Meridian Buildathon page](https://nansen.ai/campaigns/meridian-buildathon) says to build and ship a working demo using the Nansen API. Judging is evenly split between data integration, creativity, functionality, and documentation/submission. The page says there is no application or team requirement; the deliverables are the working project, a public demo post on X tagging `@nansen_ai`, and the submission form.

The [official help article](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27) lists the 1,000-credit claim, a 30–60 second screen recording, a public GitHub repository, and the submission fields: email, X post URL, and GitHub URL. The listed deadline is 27 September 2026 at 23:59 UTC.

The launch announcement is [Nansen’s official X post](https://x.com/nansen_ai/status/2099438188934897747); the earlier teaser is [here](https://x.com/nansen_ai/status/2098045310048370881). Our eventual demo post should reply to or quote the launch post, tag `@nansen_ai`, and include the recording.

The campaign page's example concepts are SM Shell Terminal (cross-chain token-flow terminal), Nansen Aquarium (wallet activity as bioluminescent creatures), and Thesis Desk (live-data thesis interrogation). Nansen's [past-build catalog](https://release.nansen.ai/help/articles/6399546-nansen-cli-builds) shows the competitive bar: multi-chain risk gates, wallet-coordination graphs, autonomous alerts, thesis/debate tools, games, and auditable API-call reports. We use these as design benchmarks, not as copied product requirements.

## 2. What this build ships

- Synthetic mode is deterministic and works without credentials for a reliable demo and tests.
- `DATA_MODE=live` collects five real assets from `POST /api/v1/token-screener`, then builds Daily Five from provider OHLCV and labeled DEX-trade windows across five completed cutoffs. Smart Money netflow and Flow Intelligence remain available to the live board.
- The game logic, clue unlocks, allocation validation, settlement costs, and persistence are identical in both modes.
- The live screen labels the source as Nansen API, links to Nansen, timestamps observations, and describes the result as a replay rather than a prediction. The daily screen pins that evidence, accepts one official allocation per session, and keeps settlement pending until the server-owned window completes.
- Invalid, partial, rate-limited, or insufficient provider data leaves Daily Five explicitly unavailable in live mode; it never publishes synthetic cards as a real challenge. Synthetic data is available only when `DATA_MODE=synthetic` is explicitly selected.

Nansen’s [redistribution guidance](https://docs.nansen.ai/mcp/redistribution-guidelines) requires attribution near displayed data. The public collector therefore avoids restricted raw Smart Money netflow endpoints and displays composite, attributable discovery signals instead.

## 3. Release checklist

1. **Done:** Activate Nansen Points in the logged-in Points hub. The API dashboard confirmed 1,000 campaign credits were added; 28 purchased credits remain after the call-proof run, and auto top-up is off.
2. **Done:** Make and verify 1,000 successful API responses. The run used the token-screener endpoint at a paced rate; 1,011 total attempts included bounded retries for transient failures.
3. Run `DATA_MODE=live npm run dev` and verify `/healthz` reports `mode: live`; capture a 30–60 second flow: open the daily live challenge, inspect evidence, allocate, lock the official entry, then open the replay and download its scorecard.
4. Publish the repository on GitHub with this README and the buildathon notes.
5. Post the recording and demo URL on X, tag `@nansen_ai`, and keep the post public.
6. Submit the email, public X URL, and GitHub URL at `https://nansen-ai.typeform.com/meridian-submit` before the deadline.

Do not commit `.env`, API keys, raw provider responses, wallet credentials, or private user data. The live key is loaded from the workspace environment and is never rendered or logged.
