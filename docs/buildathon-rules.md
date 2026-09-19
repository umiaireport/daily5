# Meridian Buildathon rules and competitive notes

## 1. Snapshot

This is a local working copy of the official Meridian Buildathon brief, captured 2026-09-17. Recheck the linked official pages before submission in case Nansen changes the deadline or form, but this file is the day-to-day reference for implementation.

Official sources:

- [Campaign page](https://nansen.ai/campaigns/meridian-buildathon)
- [Official help article](https://release.nansen.ai/help/articles/3540155-nansen-meridian-buildathon-sep-14-27)
- [Nansen API documentation](https://docs.nansen.ai/api/overview)
- [Past Nansen CLI builds catalog](https://release.nansen.ai/help/articles/6399546-nansen-cli-builds)

## 2. Non-negotiable entry rules

| Rule        | Requirement                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility | Anyone who can make a Nansen API call; no prior Nansen experience, professional developer status, application, or team is required. AI-assisted building is explicitly allowed.                                                     |
| Build       | Any working tool using Nansen data meaningfully. Nansen must drive important functionality or logic, not decorate a dashboard. Games, agents, alerts, wallet monitors, research tools, dashboards, and novel tools are all allowed. |
| API proof   | Create an API key and log at least 1,000 API calls against that key. Any endpoint is allowed.                                                                                                                                       |
| Demo post   | Publish a public X post tagging `@nansen_ai`, include the GitHub link, and attach a 30–60 second screen recording. The recording must show the build running with live Nansen data; narration is not required.                      |
| Repository  | GitHub repository must be public so judges can review the code and README.                                                                                                                                                          |
| Form        | Submit email, X post URL, and GitHub URL through the [entry form](https://nansen-ai.typeform.com/meridian-submit). One submission per account.                                                                                      |
| Deadline    | 2026-09-27 at 23:59 UTC. Winners are announced 2026-10-01.                                                                                                                                                                          |

## 3. Credits and prizes

- Every account starts with 100 free API credits.
- The campaign offers 1,000 free credits through the Points hub, available September 14–27, 2026.
- API purchases during the campaign receive 100% bonus credits.
- First place: $10,000 USDC.
- Second place: AirPods Max, Ledger Stax, and Keychron Q Pro.
- Third place: Sony WH-1000XM5 and Ledger Stax.
- Honorable mentions: 100,000 API credits each.

Our account has already activated the campaign grant. The local proof run produced 1,000 successful responses; the last verified dashboard state showed 28 purchased credits remaining and auto-top-up disabled.

## 4. Scoring rubric

The four criteria are equally weighted at 25% each:

1. **Data integration** — Nansen data drives decisions and behavior; deeper integration scores better.
2. **Creativity and originality** — a use case judges have not already seen; the official page explicitly warns that dashboards are common.
3. **Functionality and workability** — live data loads end-to-end without crashes. If the recording breaks, the entry does not qualify.
4. **Documentation and submission** — clean README, followable silent recording, and a setup that another builder can run in under ten minutes.

The official guidance favors a simple tool that runs over a complicated tool that fails.

## 5. Nansen's example concepts

The campaign page illustrates three directions, not mandatory requirements:

| Example               | Official description                                      | Lesson for Whale Arena                                                                    |
| --------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **SM Shell Terminal** | Terminal tracking live token flow across chains.          | Make the evidence cross-chain and explain why the signal changes the decision.            |
| **Nansen Aquarium**   | Wallet activity rendered as bioluminescent sea creatures. | Add memorable visual feedback that is tied to actual activity, not decorative animation.  |
| **Thesis Desk**       | A written trade thesis is interrogated against live data. | Let players state a hypothesis, then show which observed evidence supports or weakens it. |

## 6. What existing builders already do well

The prior-build catalog is from Nansen's March 2026 CLI campaign, so it is a competitive pattern library rather than a list of current Meridian entrants. Notable patterns include:

- **Multi-chain risk pipelines:** Hunt Alpha / Alpha Executor chains discovery, token deep dives, wallet coordination graphs, derivatives intelligence, an eight-factor risk gate, AI review, and optional execution in one run. Its public repository is [kamalbuilds/nansen-alpha-agent](https://github.com/kamalbuilds/nansen-alpha-agent).
- **Wallet-network forensics:** several builds use related-wallets, counterparties, and graph traversal to find coordination rather than inspecting one wallet at a time.
- **Autonomous monitoring:** recurring scanners, Telegram/Discord alerts, and daily reports turn one-off queries into a live service.
- **Thesis and debate tools:** natural-language thesis interrogation, bull/bear/ judge workflows, and evidence packs make raw metrics actionable.
- **Game-like interfaces:** Crypto Top Trumps and a physical arcade map Nansen signals into competition and play.
- **Proof and auditability:** some builders save every request as JSON/Markdown, show endpoint counts, or publish call telemetry, making API usage easy to verify.

The full catalog, including each creator's X post and any available repository, is [maintained by Nansen](https://release.nansen.ai/help/articles/6399546-nansen-cli-builds). Nansen notes that those repositories belong to their creators and are not endorsed by Nansen.

## 7. Whale Arena differentiation plan

Whale Arena should win on the combination, not by becoming another terminal:

- **Game mechanics driven by evidence:** Nansen flow, buyer breadth, price context, liquidity, and OHLCV now become the clues and scoring inputs.
- **A daily social loop:** one pinned challenge, one immutable allocation, a settlement clock, scorecard, and leaderboard create a reason to return.
- **Evidence before identity:** players allocate against anonymized signals, then see the token identity and outcome after lock. This makes the data matter to the decision.
- **Attributable visual language:** the sonar/ocean metaphor is functional—the signal cards visualize observed activity and uncertainty rather than copying a Bloomberg terminal.
- **Honest safety boundary:** no real trades, no financial advice, incomplete-coverage warnings, and no restricted raw Smart Money display in the public UI.
- **Verifiable build:** public API usage proof, deterministic synthetic fallback, live-mode health status, tests, README, and a silent recording path.

## 8. Submission checklist

- [ ] Run live mode and capture a stable 30–60 second recording with live Nansen data visible.
- [ ] Publish the repository and README publicly.
- [ ] Post the recording and GitHub link on X, tagging `@nansen_ai`.
- [ ] Submit the email, X URL, and GitHub URL once the public artifacts are ready.
- [ ] Keep the API key, raw payloads, wallet credentials, and local user data out of GitHub.

## 9. Operational note for the daily loop

The provider scheduler is not the web app “getting online.” It is the server-side settlement job that wakes after a daily challenge's 24-hour window, reads the private pinned source references, fetches the official latest OHLCV closes for live assets, and publishes the immutable result. `npm run worker` performs one leased pass and exits; a production deployment must invoke it from cron, a systemd timer, or a hosted scheduled job. The browser never receives token addresses or settlement-source rows.
