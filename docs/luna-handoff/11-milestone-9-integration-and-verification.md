# Milestone 9 — Integration and verification

## 1. Prompt and ownership

Read [workflow](00-main-workflow.md) and [shared rules](01-shared-rules.md). Coordinator owns `server/app.ts`, `server/db/migrate.ts`, `server/db/store.ts`, `web/App.tsx`, navigation, shared integration/configuration, and cross-mode tests. Integrate completed modules without leaving mocks in playable routes.

## 2. Application and persistence

Navigation: Daily Five, Whale Hunt, Practice, Profile. Preserve legacy gameplay as practice/legacy functionality. Do not delete or reinterpret existing forward-settlement daily records.

Register additive migrations and test a fresh database plus an isolated copy containing existing records. Mount agents' route registrars and preserve origin/session/rate-limit protections. Public serializers are allowlists rather than spreads of private objects.

Persist evidence/rules versions, assignments, accepted commands, finalized results, role views, deadlines, and achievements. Reconnect/restart must restore authoritative state. HTTP commands with polling are adequate initially; real-time transport is optional and must use the same authorization.

## 3. Jobs and provider operations

Collection/compilation are jobs, not player-click side effects. Add durable redacted provider accounting and a hard configurable budget before enabling scheduling. Use actual documented credit accounting fields, distinguishing quoted cost from deducted credits where the contract does.

Publish complete immutable cases atomically. Collection failure cannot change a published case. Missing historical cases produce an honest unavailable state with synthetic practice offered separately.

Any legacy settlement changes use fixed challenge timestamps rather than worker execution time. Keep production scheduling and live due-window rehearsal explicitly separate from fixture verification. No additional provider spend or deployment is authorized by this handoff.

## 4. Verification

Use the repository's Node 24 runtime. From `whale-arena/`, run:

```text
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:e2e
```

Run focused checks during implementation, then the complete browser suite once stable. Do not run concurrent whole-repository formatting while agents edit. Capture evidence under `docs/screenshots/`.

Required desktop/mobile journeys:

1. Five daily trades and final combined result.
2. Cash-only run.
3. Liquidation followed by later independent trades.
4. Refresh after clue unlock, submission, and before result acknowledgment.
5. Share saved results without hidden answers.
6. Friend challenge with a comparable different variant and insufficient-pool behavior.
7. Lone tracer matched with computers.
8. Lone whale matched with computers.
9. Two humans in separate browser contexts completing a duel.
10. Mixed human/computer crew hunt.
11. Disconnect, captain transfer, reconnect, and server restart.
12. Network-response checks for role secrets, future candles, mappings, and unopened clues.

Also verify rounding/liquidation boundaries, duplicate commands, queue timeout races, repeated awards, fresh/legacy database migration, and provider failure without published-case mutation.

## 5. Final handoff

Report implemented features, tests/results, screenshots, remaining limitations, fixture-tested versus live-verified paths, and exact commands for new jobs/modes. Do not claim a 60–90 second human usability result based on automated clicking alone.

Do not deploy, post, push, or spend credits as part of this milestone. Comprehensive wiki/README documentation remains deferred until the user's final documentation pass. The user will request a subsequent review.
