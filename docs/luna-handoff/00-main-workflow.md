# Luna implementation workflow

## 1. Start here

Latest review: [Gameplay and experience repair](12-gameplay-experience-repair.md) records the running-app audit and the revised implementation plan. Start there for numeric evidence, varied charts, split Daily Five allocations with cash, and timed Hunt investigation. Its proposed v2 rules supersede conflicting older gameplay requirements when implementing this repair; the older milestones remain architectural context.

This is the saved implementation handoff for Daily Five and Whale Hunt, revised from the user's September 17, 2026 feedback. These files are plans and implementation prompts, not evidence that the features already exist.

Read [shared rules](01-shared-rules.md), then execute the milestones below. Every milestone inherits the shared rules. Read the repository `AGENTS.md` completely before inspecting other files. Consult relevant existing wiki pages, then verify their claims against the implementation because some documentation is stale.

Copyable starting instruction:

> Implement the plan in `whale-arena/docs/luna-handoff/00-main-workflow.md`. Read `01-shared-rules.md` and the milestone files before implementation. Start with milestone 0, freeze the contracts, then use the parallel waves and exclusive file ownership below. Complete and verify each milestone; do not stop at mock screens. The user authorizes sub-agents. Comprehensive wiki and README updates are deferred until the final documentation pass. Preserve existing changes and saved records, and create timestamped sibling backups before modifying existing files.

## 2. Milestone index

| Milestone | Prompt | Main outcome |
| --- | --- | --- |
| 0 | [Contracts and ownership](02-milestone-0-contracts.md) | Frozen public contracts, private boundaries, fixtures |
| 1 | [Evidence and variants](03-milestone-1-evidence-and-variants.md) | Historical cases and comparable randomized asset packs |
| 2 | [Daily engine](04-milestone-2-daily-engine.md) | Five isolated trades, liquidation, saved immediate results |
| 3 | [Visual system](05-milestone-3-visual-system.md) | Accessible reusable charts, cards, controls, graphics |
| 4 | [Daily interface](06-milestone-4-daily-interface.md) | Quick daily journey, reveals, sharing |
| 5 | [Hunt engine](07-milestone-5-hunt-engine.md) | Whale/tracer rules and reproducible evidence |
| 6 | [Hunt interface](08-milestone-6-hunt-interface.md) | Role screens, detective board, final reconstruction |
| 7 | [Matchmaking and bots](09-milestone-7-matchmaking-and-bots.md) | Eight-second queue fallback, fair computer opponents, reconnect |
| 8 | [Progression](10-milestone-8-progression.md) | Streaks, badges, histories, honest comparisons |
| 9 | [Integration and verification](11-milestone-9-integration-and-verification.md) | Connected application, migrations, complete journeys |

## 3. Parallel execution

| Wave | Tasks | Dependency and coordination |
| --- | --- | --- |
| Foundation | Milestone 0, coordinator | Freeze contracts and assign exclusive ownership first |
| Wave 1 | Milestones 1, 2, 3 | Evidence, daily backend, visual primitives can use frozen contracts independently |
| Wave 2 | Milestones 4, 5, 6 | Daily UI, hunt engine, hunt UI; hunt UI initially uses contract fixtures |
| Wave 3 | Milestones 7, 8 | Bots/matchmaking and progression after the hunt command boundary works |
| Integration | Milestone 9, coordinator | Connect everything, test migrations and complete journeys |

With four available agent slots, use one coordinator and at most three implementation agents. Do not spawn another coordinator tree that exceeds the available capacity.

The coordinator owns shared contracts after milestone 0, `server/app.ts`, `server/db/migrate.ts`, `server/db/store.ts`, `web/App.tsx`, global navigation, package/configuration changes, and edits to the existing Nansen client allowlist. Agents propose changes to these files rather than editing them concurrently.

Agents export route registrars and migration functions. The coordinator mounts routes and orders migrations. Agents format only owned files; whole-repository formatting runs only after concurrent editing ends.

Mock transports unblock UI development but do not satisfy a milestone's end-to-end completion gate. Integrate them with real services before claiming the milestone complete.

## 4. Ownership and communication

Every assignment must name its milestone, allowed paths, frozen contracts, dependencies, and required tests. Each agent reports:

- Files changed.
- Implemented behavior and checks run.
- Contract changes requested from the coordinator.
- Remaining integration or external validation.
- Any assumptions that affect gameplay.

Do not silently redefine rules to work around an integration problem. Resolve contract changes centrally, notify dependent agents, and update the relevant prompt with a backup if the user approves a material product change.

Test names and fixture ownership must not overlap. In particular, milestone 5 owns `tests/hunt-engine-*.test.ts`, while milestone 6 owns `tests/hunt-ui.spec.ts`.

## 5. Completion and authority

Complete authorized local implementation and verification. Do not deploy, publish social posts, alter account settings, or spend additional provider credits under this handoff. Provider jobs must be implemented and fixture-tested; report live checks requiring external access separately.

The user explicitly defers repeated wiki/README updates. Do not rewrite those documents every milestone. A final documentation pass will follow implementation review.

Final report: implemented features, tests and results, screenshots, remaining limitations, fixture-tested versus live-verified data paths, and commands to run new modes/jobs. Do not claim implementation is complete if screens still use mocks or required journeys remain broken.
