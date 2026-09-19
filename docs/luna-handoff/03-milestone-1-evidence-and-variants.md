# Milestone 1 — Historical evidence and variants

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). After milestone 0, build the private case library. Run in parallel with milestones 2 and 3.

Own `server/evidence/*`, `server/nansen/game-schemas.ts`, `server/jobs/collect-game-evidence.ts`, `server/jobs/compile-game-cases.ts`, `tests/evidence-*.test.ts`, and `tests/case-variants.test.ts`. Request existing Nansen-client changes from the coordinator.

## 2. Historical case compiler

Each private case stores chain/token references, evidence start/cutoff, entry/exit times, real pre-decision and outcome candles, timestamped events or captured snapshots, collection time, coverage, derived facts, private matching features, and content/rules versions.

Validate order, duplicates, positive prices, OHLC consistency, closed required candles, complete windows, truncation, and omitted batch tokens. Reject incomplete ranked cases.

Do not attach today's relative-time summary to a past decision. Reconstruct historical facts from bounded event ranges or use snapshots actually collected before cutoff. Preserve absent measurements as missing, not zero.

Core functions: `normalizeCandles`, `normalizeTrades`, `validateCoverage`, `deriveClues`, `assertTemporalIntegrity`, `compileDailyCase`, `compileHuntBoard`, and `matchVariants`.

## 3. Six evidence categories

| Category | Facts and interpretation |
| --- | --- |
| Flow | Observed buy versus sell pressure |
| Crowd | Distinct observed buyers versus sellers |
| Whale footprint | Concentration of large trades within observed activity |
| Volume | Recent volume compared with earlier baseline and visible price movement |
| Volatility | Recent range, pullbacks, instability |
| Absorption | Price progress relative to buying/selling pressure; explicitly a derived interpretation |

All facts derive from pre-cutoff data. Future returns must not determine clue wording, visual emphasis, or availability. The chart can prompt investigation, but never automatically highlight a winning clue.

Ranked candidates support all six categories under published definitions. Insufficient coverage excludes a candidate or confines it to labeled practice. Insufficient/zero baselines do not produce arbitrary extreme signals.

## 4. Variant assignment and fairness

Build families of comparable five-asset sets using different real assets. Match signed terminal return, favorable/adverse excursions, realized volatility, prior trend category, coverage/difficulty, and liquidation signature for both directions at 1×, 5×, 10×, 25×, 50×, and 100×.

Initial matching: same sign and return bucket (under 1%, 1–3%, 3–7%, 7–15%, above 15%), same prior pattern category, same coverage requirements, configured excursion/volatility tolerances, and matching liquidation signatures at presets. Define bucket boundaries unambiguously in compiler configuration.

Keep tolerances versioned and centralized. If enough matches do not exist, publish fewer valid variants; do not silently relax constraints or fabricate outcomes. Empirical playtesting must later assess difficulty because feature matching is not a guarantee of equal skill demand.

Assign all five rounds once at attempt creation and persist privately. Avoid real-asset repetition within the attempt when possible, and reject overlapping future windows. Shuffle alias, order, and color independently of outcome.

Rank exact case-pack variants separately. Friend links default to another comparable variant, with an honest unavailable state if the pool is insufficient. Exact-case replay after answers are revealed is practice. Randomization does not promise perfect spoiler prevention.

## 5. Acceptance

- Future observations are rejected as clue inputs.
- Altering an outcome cannot rewrite earlier clue facts.
- Different variants use different real assets where matching succeeds.
- Assignment survives reload and restart.
- Public payloads contain no mappings or future candles.
- Liquidation paths influence matching.
- Synthetic and historical sources are distinguishable.
- Collection and compilation work with fixtures without spending provider credits.
