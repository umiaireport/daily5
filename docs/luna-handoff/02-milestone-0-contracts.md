# Milestone 0 — Contracts and ownership

## 1. Prompt and dependencies

Read [workflow](00-main-workflow.md) and [shared rules](01-shared-rules.md). Establish contracts before parallel implementation. This milestone is coordinator-owned and precedes all other milestones.

## 2. Files and contracts

Create `shared/evidence.ts`, `shared/daily-five.ts`, `shared/hunt.ts`, `shared/progression.ts`, and `shared/game-rules.ts`.

Keep full outcomes, provider references, whale targets, and internal bot state in server-only types. Public types must not contain optional secret fields that could accidentally be serialized.

Define fixed-point money/price serialization and centrally specified rounding. Source kinds are `synthetic`, `historical-reconstructed`, and `historical-snapshot`.

Public asset fields:

- Opaque ID and attempt-specific alias.
- Outcome-independent color index.
- Pre-decision chart points.
- Available clue descriptors and unlocked clues.
- Coverage and attribution.

Unopened clue descriptors contain category, title, and a generic question, never the answer or sentiment. Revealed clues contain a factual headline, up to two metrics, interpretation, limitation/conflict where present, evidence cutoff, and source kind.

Daily commands: start/resume, unlock clue, submit trade/cash, continue. A trade contains round index, asset ID, side, leverage, expected state version, and idempotency key. Stake and execution prices are server-owned.

Hunt commands: select targets, submit whale plan, purchase scan, pin evidence, submit suspicion, finish investigation, final accusation. Define role-filtered views, computer labels, captain state, deadlines, and reconnect/substitution state.

## 3. Lifecycle and transport

Daily: available → round open → saved result → acknowledged/next round → final result. Reload restores the saved result until acknowledged.

Hunt: lobby → setup → whale planning → tracer investigation → round complete; repeat for five rounds → final accusation → reveal → finished. Include voided state for technical failures.

Freeze controlled error codes, phase checks, idempotency semantics, public route contracts, and transport interfaces before agents begin UI work. Existing routes remain compatible.

Suggested new routes:

| Boundary | Routes |
| --- | --- |
| Daily | `GET /api/daily-five/today`, `POST /api/daily-five/:id/attempts`, `GET /api/daily-five/attempts/:id` |
| Decisions | `POST /api/daily-five/attempts/:id/clues`, `/tickets`, `/continue` |
| Comparison | `GET /api/daily-five/:id/leaderboard` with explicit exact-variant scope |
| Hunt | `POST /api/hunt/rooms`, `POST /api/hunt/rooms/:code/join`, `GET /api/hunt/matches/:id`, `POST /api/hunt/matches/:id/commands`, `GET /api/hunt/matches/:id/replay` |
| Queue | Define enqueue, status, and cancel endpoints under `/api/hunt/queue` |
| Shares | `GET /api/shares/:id` returning only permitted result fields |

## 4. Fixtures and acceptance

Create explicitly synthetic contract fixtures for five daily rounds, complete hunts, unavailable data, invalid commands, timeout, and refresh recovery. Assign fixture ownership so later agents do not collide.

Acceptance:

- Public contracts cannot contain hidden state.
- Old contracts and persisted results remain supported.
- Fixtures cover a complete daily and hunt journey.
- Every later milestone has exclusive file ownership and an agreed interface.
- Daily defaults are five rounds, five candidates, $50,000 total, $10,000 stake, three clue unlocks, leverage 1–100, six-hour prior window, one-hour outcome, five-minute candles.
