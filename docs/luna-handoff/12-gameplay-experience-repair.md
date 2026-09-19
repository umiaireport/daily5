# Whale Arena gameplay and experience repair

## 1. Purpose and authority

Planning deliverable from the September 17, 2026 user review. Implementation has not been performed. This plan revises the earlier handoff where it prescribed one all-in Daily Five trade. Use Practice's inspect → understand → allocate → lock → explain loop as the interaction reference.

The goal is a game in which players can describe why they chose an asset or suspect, compare evidence, manage uncertainty, and learn from the result. A player should encounter useful measurements before being asked to spend a clue or make a decision.

Recommended defaults below are concrete implementation decisions for review, not claims that the user specified every rule. Preserve existing saved attempts under their original rules. Ship new rules and datasets with distinct versions and leaderboard cohorts.

## 2. Verified audit

Inspected the running app at `http://127.0.0.1:8311` with local Playwright and Chromium. The browser-extension tool was unavailable; these are fresh isolated browser sessions, not inspection of the user's existing tab. Tested Daily Five, a computer-opponent Hunt, a Hunt scan, and the Practice screen. No existing user attempt was reset. Audit sessions created new game records.

| Finding | Evidence | Implication |
| --- | --- | --- |
| Live Daily clues contain almost no information | Flow unlock displayed “The completed synthetic evidence window was recorded”; its only metric was “Observed window: 6 hours” | A successful unlock request is not proof that useful evidence reached the screen |
| Live Daily charts all rise almost linearly | Each of five SVG polylines had six points and a similar positive slope | Current running publication still contains the poor chart dataset |
| Newer source has better observations | `server/domain/daily-five/observations.ts` creates 72 points with five shapes and numeric trade summaries | Do not rebuild this blindly; inspect what is published and what the running process loaded |
| Existing days are immutable | `server/domain/daily-five/engine.ts` returns an already published day; `synthetic.ts` now emits `synthetic-case-pack-v2` | Stale published data is a likely cause of the source/live mismatch; process and database identity still need verification |
| Daily allocation is absent by contract | `shared/daily-five.ts` accepts one asset, side and leverage, or an entirely cash ticket | This needs versioned backend and settlement work, not just sliders |
| Practice preserves the desired allocation interaction | Three assets, percentage controls, remaining cash, “Lock & reveal” | Reuse its interaction pattern while retaining Daily Five's five candidates and five rounds |
| Hunt scanning does not expose a readable answer | After scanning A, credits dropped 3 → 2 and a “Flow / Pin for the evidence board” item appeared; selected-location details still said no revealed clue | Wire the actual clue metrics and asset association through to the selected inspector |
| Hunt's “Investigate” is a ping | `TracerPanel` calls `onPing('Investigate')`; the separate Scan button buys evidence | Rename the ping and make evidence acquisition unmistakable |
| Hunt has backend deadlines but no visible timer | Current rules specify 35s setup, 25s planning, 35s investigation, 35s final; inspected screen has no countdown | Deadline visibility and server progression both need acceptance tests; do not call this a missing backend timer |
| Hunt charts use shallow formulaic data | `server/domain/hunt/synthetic.ts` uses 12 similarly trending points per asset | Give the six locations distinct histories and useful numeric baselines |
| Hunt scan scope is questionable | `resolveScan` in `server/domain/hunt/evidence.ts` aggregates event records without filtering the selected asset in the inspected code | An “A scan” must actually measure A; explicitly separate board-wide scans |
| Daily observations and outcomes lack a designed relationship | Chart/trade observations and future return formulas are generated separately in the current synthetic pack | Attractive evidence can still produce arbitrary-feeling outcomes; scenario design is foundational |

Screenshots: [Daily clue](../screenshots/ux-audit-daily-20260917.png), [Hunt before scan](../screenshots/ux-audit-hunt-20260917.png), [Hunt after scan](../screenshots/ux-audit-hunt-scan-20260917.png).

## 3. Target player journeys

### Daily Five

1. See five assets with distinct price histories, current price, change, volume and liquidity. Start with $10,000 in cash for this round.
2. Compare baseline measurements for free. Select an asset to inspect its larger chart and activity.
3. Spend up to three research credits on deeper evidence; keep every opened clue available for comparison.
4. Allocate across any of the five assets and leave any remainder in cash. Example: A 20%, C 30%, cash 50%.
5. Lock once. Reveal the next hour, each position's contribution, costs, and how the evidence related to the observed outcome.
6. Continue through five rounds. Keep the current five isolated $10,000 round budgets; round profits do not increase later stakes. Label this clearly.

Daily Five remains untimed. Its challenge is research and allocation, not reacting before a timer expires.

### Whale Hunt

1. Choose tracer or whale and see a one-screen explanation of the role before entering a timed match.
2. A tracer sees six distinct locations, baseline measurements, round-to-round changes, and a visible phase countdown.
3. Select a location, choose a named scan, immediately read its numeric answer, and pin it into a case notebook.
4. Compare accumulation over several rounds and distinguish persistent activity from a one-round distraction. Save primary and secondary suspicions.
5. All ready players can advance early; otherwise the server advances at the deadline using declared defaults.
6. Reveal the whale's actions and the exact observations they produced, including decoys. Let the player step through rounds and see where their hypothesis changed.

A whale sees its own objective and unit budget, chooses burst/drip/blend/decoy/wait, and understands the tradeoff between objective progress and visible activity. Preview expected signal characteristics without exposing another player's private scans or suspicions.

## 4. Evidence contract and data design

### Free overview and paid research

Free information is the minimum needed to choose what to investigate. Three paid clues cannot be the only useful information across five candidates.

| Surface | Always visible | Paid research |
| --- | --- | --- |
| Daily asset | Current price, 6h change, 6h volume, liquidity snapshot, sparkline | Flow, crowd, whale footprint, volume acceleration, volatility, absorption |
| Hunt location | Historical chart, current-round observed volume and net flow, five-round activity strip | Net buying detail, concentration, repeated accumulation, timing, cross-asset rhythm, growing position |

Show `Unavailable` with a reason for absent measurements. Do not substitute zero, label an empty snapshot complete, or charge a credit for a scan known to have no usable observations.

Every opened clue must display: asset or board scope, category, round/window, at least two meaningful numeric measurements, baseline/comparison, a short interpretation, a plausible alternative explanation, and source/coverage details. Keep provenance behind an expandable “Data details” row; keep numbers visible.

Example UI content (fictional specification, not current observed data):

> A · Flow · last 60 min
> Buy volume $184,000 · Sell volume $116,000
> Net buying +$68,000 · Previous hour +$22,000
> Buying increased while price rose 1.2%. Broader buying could support continuation; a few concentrated buyers could make it fragile.

Metric definitions must be explicit:

- Net flow = executed buy value − executed sell value in the stated observed cohort/window.
- Volume ratio = current window volume / equally sized baseline average; zero baseline yields unavailable.
- Unique buyers/sellers count observed wallets, not independently verified people.
- Top-three holder share requires holdings snapshots and a stated supply denominator. Trade concentration is not ownership concentration. If only trades exist, label “Top-three buyers' share of buy volume.”
- Liquidity requires a pool snapshot with timestamp and units. It cannot be inferred from traded volume.
- Price change uses matching start/end timestamps. Volatility based on closes must say so.

Extend `shared/evidence.ts` with structured metric values, units, windows and baseline fields while retaining compatible rendering for saved v1 string metrics. Add explicit asset scope and optional round scope to clues; never infer asset association by parsing display text. Resolve the requested asset and category against a server-owned scan definition.

### Coherent scenario packs

Use checked-in, versioned, fictional scenario packs first. Label them “Synthetic scenario.” Real historical replay is a separate data source that must use actual captured candles, trades and snapshots with provenance; do not present plausible generated prices as real prices.

Each authored scenario contains pre-cutoff candles, trades, optional holdings/liquidity snapshots, hidden future candles, and a private teaching note. Derive all displayed metrics from those observations. Generate or author the entire chronological scenario before splitting at the decision cutoff; never construct pre-decision clues from the answer or expose the private teaching note early.

Include at least these five archetypes across a round, and vary which alias receives each:

| Pattern | Visible tension | Strategic question |
| --- | --- | --- |
| Rising with pullbacks | Increasing volume and broad buyers; already extended price | Follow momentum or limit exposure? |
| Range-bound | Flat price despite repeated positive flow | Accumulation or offsetting selling? |
| Stepwise rise | Intermittent large orders and concentrated demand | Persistent buyer or fragile jump? |
| Decline with bounces | Negative flow, weakening volume or liquidity | Avoid, wait, or take a small reversal position? |
| Spike then retrace | High activity but sellers absorb demand | Is the apparent breakout failing? |

Do not make these deterministic answer labels. Include credible counterexamples: broad buying can still fail after a later shock; a declining price can recover. Never encode the winning alias into shape, ordering, color, scan ID or cohort ID. Keep reproducible seed and dataset hash privately for review.

Private scenario notes must identify the competing hypotheses, relevant observations, actual outcome and why that outcome is plausible. Audit multiple scenarios for whether evidence can guide a choice without guaranteeing it. A single outcome cannot prove a strategy is good.

For Hunt, all six locations need background activity in every round. Do not assign an asset's entire background to a round based on its index. Blend background events and simulated whale actions into the observed stream. Before reveal, do not identify which individual events are whale events or decoys. Repeated accumulation and timing scans should offer evidence of a pattern without returning hidden target flags.

## 5. Chart specification

Reuse the existing SVG/chart primitives where practical. Do not use generated bitmap charts or ornamental waves as data.

- Daily preview: 72 completed five-minute observations spanning six hours; explicit cutoff boundary. Show local UTC time labels and the chosen interval, with no future candles in the payload.
- Five mini-charts: normalize to percentage from each asset's first point; use one padded percentage extent computed across the round. Show a signed change beside each asset name.
- Selected chart: default actual USD price axis, with a `% change` comparison toggle. Include readable time ticks, latest observed price, volume bars and a dashed cutoff marker. Tooltips work by mouse, keyboard and touch; provide a small accessible data table.
- Draw the observed series directly. No smoothing that invents price extrema; no random jitter added only for appearance. Synthetic histories should contain plausible variability in the data itself.
- Use varied price levels, such as $0.024, $1.82, $14.60 and $236.00, with adaptive decimal precision. These examples are fictional.
- Outcomes continue from a declared executable entry price and form a continuous OHLC series. Document any gap between the final observation and entry. Validate candle ordering, intervals, OHLC bounds and outcome-window duration.
- Hunt separates historical market price from an observed activity timeline. Whale game actions affect the simulated activity stream; do not imply they rewrite historical market prices.
- At reveal, append the outcome in a visually distinct region and mark execution/exit points. Replay is optional animation with pause/skip and reduced-motion support.

## 6. Daily portfolio rules

Introduce `daily-five-v2` and a portfolio submission contract. Default gameplay uses long-only, unleveraged allocations. Keep existing v1 leveraged attempts playable under v1; an advanced leveraged portfolio mode is outside this repair. This is the recommended simplification to restore the user's Practice-style decision.

Contract intent:

```ts
{
  kind: 'portfolio',
  roundIndex: 1,
  allocations: [
    { assetId: 'server-issued-id-a', weightBps: 2000 },
    { assetId: 'server-issued-id-c', weightBps: 3000 }
  ],
  cashWeightBps: 5000,
  expectedStateVersion: 7,
  idempotencyKey: 'unique-command-id'
}
```

- Integer basis points only; 0–10,000 per entry; sum including cash exactly 10,000. Reject duplicates, unknown assets, negative/fractional/overflow weights and stale rounds. Server owns stake and execution prices.
- UI offers −5%, +5%, slider and editable percentage; typed precision is one percentage point for v2. Amounts update simultaneously. Increasing an asset consumes cash; decreasing returns cash. If cash is insufficient, stop at available cash and announce why; do not silently sell another asset.
- Start with 100% cash. Allow all-cash lock. “Reset to cash” restores the draft. Switching inspected assets does not change allocations.
- Persist drafts locally per attempt/round; resume server state first and ignore drafts for locked rounds. Lock remains a single atomic, idempotent mutation for the entire portfolio.
- Reserve the current 5 bps entry + 5 bps exit cost on each noncash allocation for v2, with no leverage. Calculate in integer cents using the existing shared rounding rule. Specify the formula centrally: cost = rounded allocated cents × 10/10,000; gross P&L = rounded allocated cents × (exit − entry)/entry; ending position equity = max(0, allocated cents + gross P&L − cost). Cash earns zero and pays no fee. Do not add undocumented slippage.
- Sum position equity and cash to obtain round equity. Aggregate five isolated rounds relative to $50,000 for the final result. Use a separate v2 cohort and never compare these results directly with 100× v1 scores.
- Result example: A $2,000 at +4%, C $3,000 at −2%, cash $5,000 → gross +$20, costs $5, net +$15; final $10,015. Include this exact regression case.

## 7. Hunt timing and strategic controls

Recommended starting timings: 30s target selection, 30s whale planning, 90s investigation, 30s final accusation. Investigating six assets and reading clues needs more than the current 35s. Allow an explicitly labeled untimed learning mode against computers; keep it outside timed rankings.

The match header shows `Round 2 / 5 · Investigate · 01:12`. Use amber at 20s and red at 10s, always with text; announce milestones to assistive technology without reading every second. Show “Whale is planning · next phase in …” when waiting. Countdown uses server deadline and server clock offset, not a local timer reset on refresh.

| Expiring phase | Defined default |
| --- | --- |
| Target selection | Choose a reproducible legal pair with a saved server event; label the automatic choice privately to the whale |
| Whale planning | Submit a legal wait action; missed progress can cause objective failure under ordinary scoring |
| Investigation | Keep last server-saved suspicion; mark player ready without inventing a suspicion; advance once the deadline arrives |
| Final accusation | Use captain's latest saved valid pair; otherwise record no accusation and apply an explicit miss rule |

Persist deadlines and timeout events. One server scheduler/service progresses active matches even if no client polls. Execute each timeout once with transactional state-version checks; handle timer/command races and restarts. Client countdown reaching zero requests fresh state and displays “Resolving…”; it never calculates an official outcome.

Review `server/services/hunt-service.ts` alongside engine timeout handling, including the existing computer-seat expiration exemption. All-human and mixed matches must obey the same upper bounds. Reconnection does not reset a phase deadline. Disconnected seats follow existing grace/substitution rules with a visible computer label. Ordinary missed turns should not void an entire match as a technical failure.

Tracer controls:

- Replace ambiguous “Scan A” with a category picker and `Reveal A flow · 1 scan` action.
- Display six scan categories with their question and scope. Disabled unavailable scans state why.
- After a scan, place the numeric result under the selected location immediately, focus its heading, and add the same clue to the shared notebook.
- Replace the ping “Investigate” with “Suggest scanning A.” Label this group “Team signals.” A ping never looks like a purchased clue.
- Notebook rows show asset, round, category and strongest measured change. Expand to full evidence. Pins remain accessible across rounds.
- Suspicion controls persist on selection; show saved/pending/error status. Primary and secondary must differ. Do not expose another tracer's private choices.
- Keep three scans per duel round; crew retains five shared scans, one per tracer. Show both personal allowance and team remainder to avoid confusion.

Computer tracers consume only role-filtered public observations, scan results and allowed history. Rank suspicions using documented evidence heuristics with seeded variation; do not read hidden targets. Computer whales use only their private role state and public board. Record decisions for replay; demonstrate that computers neither always win nor act randomly without regard to evidence.

## 8. Exact visual layout

Retain the dark ocean theme and existing whale mark. Prioritize a denser, readable investigation workspace. No image-generation work is needed; implement with existing CSS/SVG components.

### Design tokens and hierarchy

Use page background `#0B1218`, panels `#13202A`, raised controls `#1B2C37`, borders `#304653`, primary text `#F0F5F7`, secondary text `#A7BAC5`, accent `#67DCC3`, negative `#FF929A`, warning `#F4C478`. Verify text contrast rather than assuming it. Use the current font; tabular numerals for all money, percentages and timers.

Spacing scale 4/8/12/16/24/32px; panel radius 12px; 1px borders; 44px minimum interactive targets. Page heading 28px/34px; panel heading 18px/24px; body 14px/20px; metric number 24px/30px. Avoid all-caps explanatory prose. Selected state uses a 2px accent border, a small check and `Selected`, not color alone.

### Daily desktop at 1440 × 900

- Center a maximum 1280px workspace with 24px side padding. Compact global navigation to 64px high.
- Header 80px: left `Daily Five` and `Round 1 of 5`; right `$10,000 this round` and compact completed-round progress. Remove repeated oversized motivational copy from the active game.
- One row of five equal candidate cards, 112px high, 12px gap. Each contains alias, price, signed 6h change and a 48px sparkline. Clicking inspects; allocation stays independent.
- Below: left flexible research area and a 344px portfolio sidebar, 20px gap. Portfolio sticks below navigation without hiding its final action.
- Research area: selected title and four numeric baseline tiles, then a 240px chart including volume; evidence below with compact category tabs and a full-width answer. Keep at least one actual evidence answer visible rather than six large empty cards.
- Portfolio: five rows with alias, percentage input, dollar amount and −/+; explicit cash row; stacked allocation bar with text legend; total/cost summary; primary `Lock portfolio & reveal` button. No dominant leverage box in v2.
- An opened clue has two to four 24px numeric values, comparison arrows/text, one interpretation sentence, and an expandable detail footer. Locked cards preview the question, not the answer.

### Hunt desktop

- Persistent 64px game header: role, round, phase, countdown, participant readiness and Leave action.
- Main grid: 6 location cards in three columns by two rows in a 60% left area; selected location/evidence inspector in the 40% right area. Each card includes current numeric flow and a five-cell round activity strip. Avoid repeating coverage prose on every card.
- Inspector tabs: `Evidence`, `Timeline`, `My case`. Selected scan answer sits directly below scan controls. A pinned row shows `B · Round 2 · Net buying +$42k`; never just “Flow.”
- Bottom action row: primary suspect, secondary suspect, and `Ready for next round`; final round changes wording to `Lock accusation`. Show readiness count.
- Whale uses the same board shell with its private objective/action panel. Explain “Drip: spread purchases across intervals” beside the action rather than requiring unexplained jargon.

### Mobile at 390 × 844 and 320px width

- Compact header includes round and timer. No horizontal page overflow.
- Daily candidates form a labeled horizontally scrollable strip with an explicit partial next card. Selected chart follows. Tabs switch between Research and Portfolio while preserving state. A bottom 64px bar shows allocated/cash totals and `Review portfolio`; open full controls in a sheet, with final lock inside the sheet.
- Hunt uses a two-column board and an inline selected inspector. Sticky bottom `My case` / `Ready` controls do not cover evidence or focused inputs. Timer remains visible.
- Sheets have accessible names, focus trapping, Escape/close controls and focus restoration. All content remains reachable with a keyboard and at 200% zoom.
- Animate card selection and clue opening for at most 180ms. Reduced motion disables transitions. No ambient movement competing with charts.

## 9. Reveals that teach

Daily reveal shows the selected portfolio, net dollars, percentage return, fees, each asset's contribution and unchanged cash. Show all candidates' next-hour paths only after lock. Compare against all-cash and equal-weight 1× portfolios using identical fees. Label these as benchmarks, not recommended trades.

For each opened clue, show “Observed before lock” and “What happened next.” Use descriptive wording: positive flow preceded a rise, or the apparent buying failed to sustain price. Do not claim that a correlation proved the cause. Private authored explanations must agree with the actual fixture values.

Hunt reveal is a five-step timeline. Each round shows whale action and asset, public observations, scans the team actually saw, saved suspicions, and eventual outcome. Explain which activity was a decoy only here. Make “Replay round 3” open the same board and evidence as seen at that point, alongside the now-revealed action.

## 10. Small implementation packets for Luna

Work sequentially through these packets. Each packet ends with concrete tests and a playable checkpoint; do not build several disconnected mock screens. Paths below are existing ownership anchors; inspect current contracts before editing. Read AGENTS.md and back up every existing file before changes. Never erase the running database to make improved fixtures appear.

| Packet | Scope | Main files | Completion gate |
| --- | --- | --- | --- |
| 0 · Verify delivery | Identify running process, database, day publication and pack version; add development-only fresh preview with a separate database or explicit preview cohort | `server/domain/daily-five/engine.ts`, existing development setup | Browser displays numeric v2 observations in a fresh preview; old saved day/attempt remains unchanged; record exact launch command |
| 1 · Evidence and scenarios | Structured measurements, explicit scope, coherent pack, varied prices/charts, snapshots, asset-scoped Hunt scans | `shared/evidence.ts`, `server/domain/daily-five/{observations,synthetic,types}.ts`, `server/domain/hunt/{synthetic,evidence,types}.ts`, `server/evidence/` | Every shown number reconciles to fixture data; cutoff and leakage tests pass; two assets' scoped scans cannot accidentally reuse global totals |
| 2 · Daily portfolio backend | Versioned v2 rules, additive storage, validated allocation, atomic settlement, v1 compatibility | `shared/{daily-five,game-rules}.ts`, `server/domain/daily-five/`, `server/db/daily-five.ts`, `server/routes/daily-five.ts` | Exact $10,015 regression, all-cash, invalid allocations, reload, duplicate request, old v1 replay pass |
| 3 · Daily playable UI | Charts, baseline comparison, reusable evidence answer, portfolio editor, saved draft, reveal | `web/daily-five/DailyFive.tsx`, `web/daily-five.css`, `web/api/daily-five.ts`, existing `web/game-ui/` primitives | Complete five rounds with two assets plus cash; keyboard/touch clues and portfolio work; refresh preserves draft or saved result correctly |
| 4 · Hunt lifecycle and bots | Server-driven timeout defaults, persisted suspicion, category/scope scan contracts, fair bots | `shared/hunt.ts`, `server/domain/hunt/{engine,rules,lifecycle}.ts`, `server/services/hunt-service.ts`, `server/routes/hunt.ts` | All-human and mixed matches progress without requests; restart/race tests pass; bots cannot access hidden opposing state |
| 5 · Hunt playable UI | Countdown, explicit scans, complete answers, notebook, readiness, action previews and reveal | `web/hunt/HuntScreen.tsx`, `web/hunt.css`, `web/api/hunt.ts`, reusable game components | Scan immediately reveals metrics under correct asset; finish a duel and crew match; timeout visibly progresses; replay matches stored evidence |
| 6 · Integration and documentation | Actual running release/preview verification, accessibility, screenshots, wiki/README and acceptance updates | `tests/`, `docs/`, affected sibling READMEs | Browser on documented URL serves intended dataset; full relevant checks pass; documentation reflects current functions and lines |

Do not rewrite working Practice. Extract or reuse its allocation concept without changing its rules. Keep shared contract edits coordinated if work is later delegated. Wiki updates use Luna per repository instructions; this planning task itself does not need wiki source-function updates.

## 11. Verification and acceptance

Use the repository's Node 24 runtime. Run focused domain and UI tests during each packet, then `npm run typecheck`, `npm run format:check`, `npm test`, `npm run test:e2e`, and `npm run build` at integration. Distinguish pre-existing failures from new regressions. Do not run broad format writes without backing up affected files.

Required behavior tests:

1. All five candidate histories differ meaningfully: include declining, range-bound and stepwise shapes, not merely five distinct SVG strings.
2. Readouts and axes agree with candle data. No pre-lock response, DOM, share, error or network payload contains future outcomes or hidden targets.
3. Flow/crowd/volume/holdings metrics match independent fixture calculations; missing snapshots display unavailable.
4. A successful clue unlock renders at least two real measurements in the current visible inspector, with correct asset and round. Reopening is free and navigation preserves it.
5. A/C/cash allocation survives inspection changes and reload; totals remain 100%; invalid or duplicate allocations fail server-side.
6. Double lock, lost responses and restart never create a second settlement. Saved v1 attempts still display and finish correctly.
7. Hunt scans for A and B use their respective events. A board-wide rhythm scan explicitly says “All locations.”
8. Waiting and active players see the same deadline. Background tabs, no polling, disconnected players, clock skew and restart cannot create an endless phase.
9. Team scans/pins synchronize and private suspicions remain private. Ordinary timeout produces the documented gameplay default.
10. Demonstrate complete five-round Daily Five, computer Hunt, two-human duel and six-player crew journeys using separate browser contexts. Capture desktop/mobile evidence in `docs/screenshots/`.
11. Keyboard, touch, 320px layout, zoom, focus movement and reduced motion work through an entire journey.
12. Validate the served app after launch, not only new-fixture unit tests. Record public rules/data version and verify actual chart point counts and visible clue values.

Human playtest gate: a new player can answer “What did I learn?”, “Why did I allocate here or suspect this location?”, and “What changed my mind?” using visible numbers. Record actual confusion and completion time with at least three fresh players; treat this as pending user testing, not something automated tests can certify. Use those results to tune the proposed 90s investigation timer.

## 12. Copyable execution prompt

> Implement `whale-arena/docs/luna-handoff/12-gameplay-experience-repair.md` packet by packet. This is the revised gameplay brief; its Daily Five portfolio, measured evidence and Hunt deadline rules supersede conflicting older handoff instructions. Read AGENTS.md first and make timestamped sibling backups before editing existing files. Start by reproducing the live source/dataset mismatch without resetting saved records. Reuse existing components and preserve Practice. Complete each packet through the real API with its acceptance tests, then continue. Do not claim evidence is fixed because an endpoint returns 200: confirm the player sees meaningful numbers for the correct asset. Finish with full relevant checks, desktop/mobile screenshots and Luna wiki/README updates. Report unresolved human playtesting and real-data verification honestly.
