# Milestone 8 — Progression and comparison

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). Own `server/domain/progression/*`, `server/db/progression.ts`, `server/routes/progression.ts`, `web/profile/*`, and `tests/progression-*.test.ts`. Work alongside milestone 7 using finalized-result contracts.

## 2. Records and badges

Implement UTC daily completion streak, daily result history, separate Whale/Tracer records, separate human/computer outcomes, cosmetic badges, rematch, and role-swap links. Keep crew and duel comparisons distinct.

| Badge | Condition |
| --- | --- |
| First Five | Finish one daily run |
| Clear Reading | Five correct trade directions in one run; cash does not count as correct |
| First Contact | Identify both hunt targets |
| Pattern Reader | Correct pair before the final round in three completed matches |
| Quiet Current | Complete whale objectives and evade capture |
| False Wake | Win as whale while the final accusation includes a decoy |
| Both Sides | Win at least once in each role |

Derive awards only from finalized saved results. Use unique award constraints; retries cannot grant duplicates. Cosmetics/titles do not increase scan or concealment power.

Computer matches may earn introductory mastery badges but do not inflate human competitive ratings. Do not add Elo before persistent identity and abuse controls exist. Repeated invite rematches must not be presented as verified competitive skill.

## 3. Daily comparisons and friend links

Rank within exact case-pack variants. Show cohort size and provisional/final state. Percentile requires at least 20 completed eligible attempts; otherwise hide it, never invent a population. Tied equity can share rank; no speed tie-breaker.

Friend links carry opaque identifiers and permitted metadata, not seeds or answer mappings. Default to another comparable variant; exact-case replay after answers are known is practice-only. Handle an insufficient variant pool honestly.

## 4. Acceptance

Refresh cannot re-award badges; duplicate settlement cannot extend a streak twice; UTC boundaries are tested; computer/substituted matches remain distinguishable; shares expose no answers; official and practice results cannot mix in rankings.
