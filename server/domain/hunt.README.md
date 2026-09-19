# Whale Hunt domain

## 1. Purpose

`server/domain/hunt/` contains the server-owned Whale Hunt rules, evidence event compiler, lifecycle scoring, synthetic board, and persisted command engine. The module keeps private targets and the full reconstruction on the server.

## 2. Code sections

`engine.ts` owns room creation, participant membership, role-filtered views, command idempotency, deadlines, persistence, and replay. `evidence.ts` combines immutable historical events with simulated whale purchases and resolves coarse scans. `lifecycle.ts` validates whale plans, suspicion pairs, final accusations, objective completion, and scores. `rules.ts` versions scan definitions and rounding; `synthetic.ts` supplies the credential-free six-asset board; `types.ts` defines internal records.

## 3. Public functions

`HuntEngine` (`server/domain/hunt/engine.ts:307`) exposes `createRoom` (`:446`), `joinRoom` (`:548`), `getRoom` (`:639`), `getMatch` (`:712`), `command` (`:1122`), `reconstruction` (`:1180`), and `replay` (`:1216`). `createEventRecord` (`server/domain/hunt/evidence.ts:49`) and `applyPlan` (`:116`) create deterministic event histories; `resolveScan` (`:177`) derives a clue without reading targets. `validateWhalePlan` (`server/domain/hunt/lifecycle.ts:60`), `scoreMatch` (`:181`), and `resolveFinal` (`:247`) enforce the Hunt rules.

## 4. Integration boundary

The coordinator must mount `registerHuntRoutes` and order `migrateHuntDatabase` during application startup. The shared `HuntRoomView` currently does not carry its match id, and the shared replay transport returns `HuntReveal[]` while the engine’s full `reconstruction` is richer; both contract gaps are reported for coordinator resolution.
