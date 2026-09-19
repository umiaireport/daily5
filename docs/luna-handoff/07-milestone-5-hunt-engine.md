# Milestone 5 — Whale Hunt engine

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). Own `server/domain/hunt/*`, `server/db/hunt.ts`, `server/routes/hunt.ts`, and `tests/hunt-engine-*.test.ts`. Run alongside milestones 4 and 6 after frozen contracts. Export a command service for matchmaking/bots in milestone 7.

## 2. Mission and actions

Support one whale against one tracer or five tracers. Start with six asset locations and five rounds; contracts/rendering can support ten locations later.

Whale selects two distinct targets during setup: primary needs eight units; secondary needs four. Purchase limits are four units per round, sixteen per match, four decoy units total, and two decoy units per non-target asset.

Burst concentrates purchases into one interval; Drip splits them across available intervals; Blend uses the busiest eligible observed background interval; Decoy buys a non-target asset; Wait buys nothing. These are simulated events, not real transactions.

Reject overspending and plans that leave insufficient remaining slots to complete required purchases. A missed deadline must follow explicit timeout behavior; do not fabricate a successful objective. Core functions: `validateWhalePlan`, `applyPlan`, `resolveScan`, `resolveFinal`, and `scoreMatch`.

## 3. Evidence and investigation

Combine fixed historical background and simulated purchases into one reproducible event record. Prices remain historical and unmodified. Derive scans for net buying, purchase concentration, repeated accumulation, timing, cross-asset rhythm, and growing simulated position. Store thresholds in a versioned rules module.

Examples: net buying adds historical and simulated net buying; concentration compares largest purchase to total purchase activity; repeated accumulation counts rounds with positive simulated position growth. Relative activity uses an earlier baseline; unavailable baselines remain unavailable.

Public board signals are coarse; scans show more precise facts. No target flags or direct whale probability. Every clue must be supported by the same event record.

1v1 gets three scans per round. Crew mode gets five shared scans, initially one per tracer. Shared evidence is visible to the team; private suspicions are not. Avoid duplicate charging for the same team scan. Captain submits the final pair and can transfer on disconnect.

Each round permits a locked suspected pair without correctness feedback. A pair has exactly two distinct IDs. Final accusation follows round five.

## 4. Result and scoring

Correct final pair wins for tracers. Whale wins only with completed objectives and an incorrect final pair. Incomplete objectives lose for the whale. Technical failures may void a match without a competitive loss.

```text
tracerFinal = 300 × number of correct final targets
tracerEarly = 400 × total correct target mentions in five suspicions / 10
tracerScore = tracerFinal + tracerEarly
```

Missing suspicions contribute zero. Team final score uses the captain's final pair; individual early-suspicion scores remain individual records rather than being summed into an inflated team score.

```text
primaryFraction = min(primaryUnits / 8, 1)
secondaryFraction = min(secondaryUnits / 4, 1)
whaleCompletion = 200 × primaryFraction + 200 × secondaryFraction
whaleEscape = 600 only if both objectives are complete and final accusation is wrong
whaleScore = whaleCompletion + whaleEscape
```

Round/display rounding belongs in the rules module. Keep daily money, duel/team scores, and human/computer records separate.

## 5. Persistence, replay, acceptance

Store membership, phase/version/deadline, private targets, plans, budgets, scans, suspicions, and ordered events with visibility scope. All commands validate actor, phase, expected version, and idempotency.

Replay includes historical background, whale moves, scans, suspicions, final pair, and deterministic explanation. Expose the full reconstruction only when the match ends.

Acceptance: reproducible clues and results; budget enforcement; role-view secret exclusion; partial target score without a false full capture; duplicate commands cannot advance twice; restart reproduces the winner; no unrequested market-impact simulation.
