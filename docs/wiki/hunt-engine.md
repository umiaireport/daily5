# Whale Hunt engine

## 1. Ownership

Hunt v1 remains under `server/domain/hunt/` and keeps its compatible reader, routes, and saved records. The redesigned entry flow uses `HuntV2Engine` in `server/domain/hunt/v2.ts`. It owns the hidden zone, chart board, five whale moves, six evidence lanes, deadlines, round results, scores, match winner, and idempotent command responses.

## 2. Hunt v2 lifecycle

A new match persists `round_intro → whale_hide → tracer_hunt → round_reveal → match_over`. The server creates three public chart windows for every round. A whale selection is private until `hide-trade`; a tracer sees only the changed public chart and scan evidence. A correct catch awards Tracer +1, a miss awards Whale +1, and a timeout is labeled and awards exactly one point.

`HuntV2Engine.getMatch` (`server/domain/hunt/v2.ts:549`) applies overdue phase transitions from persisted deadlines. `command` validates role, phase, state version, and idempotency before updating the row. The first score to three ends the match immediately. `rematch` starts a fresh v2 match with the player role swapped.

`HuntV2Engine.joinMatch` replaces the initial computer seat with a human opponent while the match remains in `round_intro`. Rejoining with the same actor is safe and returns the existing role-filtered view; after the seat is claimed, the service scheduler does not issue computer moves.

## 3. Evidence and computer opponent

The fallback board is deterministic per match and round, with different trend, reversal, breakout, and volatility regimes across the three windows. A live board factory can replace it with validated provider price and volume curves. Burst, Drip, Blend, Decoy, and Late push place different pulse patterns on the hidden footprint; Decoy also adds a larger superficial pulse in a second zone. Flow, Concentration, Rhythm, Timing, Cross-asset, and Position growth scans return plain-language observations, and repeated requests for the same zone and scan reuse the existing result without spending another charge.

`server/domain/hunt/live-board.ts` maps the current live scenario into three public windows, carries symbol, chain, observed time, and bounded Smart Money direction, and rotates the asset order by match and round. The tracer sees the market context and curves, while the provider payload and hidden zone remain server-side.

`HuntV2Service` (`server/services/hunt-v2.ts`) advances the computer seat one public-information action at a time. It uses the same v2 commands and role-filtered view as a human player.

## 4. Compatibility

The v2 tables and versioned HTTP path are additive. Existing `hunt_matches` rows are still read by the v1 engine and their scores are never interpreted as v2 rounds. Provider identities and hidden target data remain outside tracer views until a v2 round reveal.
