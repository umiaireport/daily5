# Shared product and implementation rules

## 1. Product direction

Daily Five is a quick historical trading puzzle. Whale Hunt is a detective arena where one whale accumulates positions while one or five tracers investigate. Both use the same evidence pipeline and remain playable without another online human.

Daily playing time targets roughly 60–90 seconds for a returning player, without a countdown, time penalty, or speed bonus. Players may take longer. Historical price intervals are separate from playing time. Results appear immediately from already-completed historical windows; label this historical replay, not live market settlement.

Interpret five trades as five sequential submissions, each followed immediately by its result, then a final combined score.

## 2. Daily rules

| Rule | Initial value |
| --- | --- |
| Rules version | `daily-five-v1` |
| Starting capital | $50,000 virtual |
| Rounds | Five |
| Capital per round | $10,000 isolated; profits do not compound into later stakes |
| Candidates | Five mystery assets per round |
| Evidence | Visible chart, six clue categories, three optional unlocks per round across the board |
| Position | One asset, long or short, integer leverage 1–100× |
| Alternative | Hold the ticket in cash |
| Result | Immediate after each immutable submission |
| Main score | Sum of five ticket equities and return versus $50,000 |
| Daily reset | 00:00 UTC |
| Historical defaults | Six hours before cutoff, one-hour outcome, five-minute candles |

Use real asset variants, not merely renamed copies. Persist each attempt's assignment. Avoid repeating the same real asset within an attempt when the eligible pool permits; never reuse an overlapping future window. Aliases, order, and colors are independent of outcome.

Match variants using return, adverse/favorable excursions, volatility, pre-decision pattern, clue coverage, and long/short liquidation signatures. Similar terminal returns alone are inadequate at high leverage.

Rank exact case-pack variants separately initially. Do not present approximate matching as proof of a fair global money leaderboard. Share raw equity; comparison text identifies its cohort. Percentile requires at least 20 completed eligible attempts.

Randomization reduces spoilers but cannot eliminate historical recognition, screenshots, or multi-account attempts. Cookie sessions provide casual continuity, not strong identity. First official attempt counts; replays are practice. Friend links default to comparable different variants; exact-case replay after answers are known is practice-only.

## 3. Evidence integrity

Source kinds: `synthetic`, `historical-reconstructed`, `historical-snapshot`. Keep them visible and distinct.

Separate earlier evidence, decision cutoff, entry, hidden outcome path, and exit. Relative-time data fetched today cannot serve as yesterday's clue. Use timestamped historical events or snapshots collected before the decision. Preserve collection time and event time.

Reject incomplete ranked cases, open required candles, truncated responses, missing batch assets, and unsupported clue measurements. Missing data is not zero. Do not invent chart points or use interpolated extrema for liquidation.

Six clue categories: Flow, Crowd, Whale footprint, Volume, Volatility, Absorption. Facts derive only from pre-cutoff evidence. A clue explains evidence and uncertainty, not guaranteed future direction. No unopened clue may reveal its answer through wording, color, or metadata.

Public Nansen-backed output must use appropriately permitted data and attribution. Verify current endpoint contracts and redistribution terms before enabling production collection/display. Aliasing is not permission to redistribute restricted data. Keep provider keys and private source mappings server-side.

## 4. Hunt rules

Use six assets initially; support up to ten in contracts/rendering. Five rounds per match. One whale versus one tracer or a crew of five tracers.

Whale targets: eight units in a primary asset and four in a different secondary asset. Limits: four purchase units per round, sixteen per match, four total decoy units, at most two decoy units in any one non-target asset. Actions: Burst, Drip, Blend, Decoy, Wait. Validate that accepted plans leave the objective achievable.

Historical market background stays fixed. Player actions are simulated and alter investigation evidence, not the historical price series. No causal claim about how a real whale would have changed market prices.

1v1 gets three scans per round. A five-tracer crew gets five shared scans, initially one per tracer. Team evidence is shared; individual suspicions are private. A captain submits the final pair and can transfer on disconnect.

Tracer wins by identifying both targets. Whale wins only by completing the objective and avoiding a correct final pair. An incomplete whale objective is a whale loss. No correctness feedback on intermediate suspicions.

## 5. Engineering boundaries

Read `AGENTS.md`; create timestamped sibling backups before changing existing files. Preserve unrelated edits and saved data.

Keep Node 24, React, Fastify, SQLite, and the isolated Nansen adapter. Avoid unnecessary dependencies. Preserve legacy allocation types and records; introduce separate versioned contracts and additive migrations.

Server owns assignments, hidden state, prices, budgets, phases, settlement, awards, and deadlines. Use transactions, uniqueness constraints, idempotency keys, expected state versions, and role-filtered serializers.

Use fixed-point arithmetic for official settlement. Define rounding centrally. Browser projections never become authoritative results. Persist evidence/rule versions and final results; do not rescore historical results under new rules.

Collection and compilation are jobs, not per-click provider calls. Published cases are immutable. Synthetic practice remains available without credentials. Provider outages cannot rewrite published outcomes.

Computer agents receive sanitized observations, not database access or hidden match objects, and submit through the same validation as humans. Label computers and substitutions honestly.

## 6. Visual and verification rules

Extend the existing dark ocean design with code-native SVG/CSS. No remote font requirement or decorative video. Support keyboard use, visible focus, 44px targets, reduced motion, and text/icon status in addition to color.

Target 390×844 mobile and 1440×900 desktop; avoid overflow at 320px. Do not force long animations or repeated dialogs. Charts use actual supplied data, with a consistent percentage scale across a daily round's five assets.

Each milestone requires meaningful tests for its integrity boundaries. Final checks include typecheck, formatting verification, Node tests, build, and full browser journeys. Comprehensive wiki and README updates are deferred by explicit user instruction until implementation stabilizes.
