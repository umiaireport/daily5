# Whale Arena Methodology

## 1. Current synthetic mode

Synthetic mode is a deterministic tutorial, not a market backtest. Five rounds are defined in `fixtures/synthetic/scenarios.ts`. Every token, identity, clue, price, observation timestamp, and outcome series is fictional. Explicit live mode instead creates one current-data replay from Nansen token discovery, token-information, Flow Intelligence, and OHLCV endpoints; it labels the source, timestamps observations, and never presents the replay as a prediction.

## 2. Player rules

Each round starts with `$10,000` virtual capital. A player may unlock two distinct token/card clues from `flow`, `buyers`, and `pulse`. Allocations are integer percentages in 10% steps across Token A, Token B, Token C, and cash; the server validates that the four weights sum to 100. Locking is immutable. The scoring function applies 0.30% entry and exit costs to invested portions, leaves cash flat, and reports equal-weight and cash comparisons. Session equity compounds across five rounds.

## 3. Integrity properties

The server owns the scenario sequence, clue budget, allocation validation, lock operation, and stored result. Pre-choice round responses contain aliases and pre-decision series but not identities, entry prices, exit prices, or explanations. The SQLite primary key `(session_id, scenario_id)` makes a repeated lock idempotent for the same weights and rejects a changed second choice.

## 4. Live-data mode boundaries

The live collector verifies endpoint response shapes, positive prices/liquidity, stablecoin exclusion, observed cutoff, actual credit headers, request budget, and visible Nansen attribution. It uses composite discovery metrics rather than restricted raw Smart Money netflow endpoints. The process-local cache and redacted usage counters are not a durable provider ledger; production hosting still needs an explicit operational budget and release review. A provider API key alone does not replace a reviewed, bounded data-collection policy.

## 5. Daily challenge lifecycle

At startup the server publishes one UTC-day challenge into `daily_challenges` with canonical evidence, scoring rules, and open/lock/settle/void timestamps. `POST /api/daily/today/entry` stores one immutable allocation per cookie session; `GET /api/daily/today` never exposes prices or settlement payloads. The current release deliberately leaves the post-window Nansen settlement job disabled until a production scheduler and price-observation policy are reviewed; pending entries therefore remain visibly pending rather than receiving a fabricated result.
