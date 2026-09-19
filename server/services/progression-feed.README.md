# Progression feed

## 1. Purpose

`progression-feed.ts` projects completed persisted attempts and Hunt matches into the progression service. It derives the Daily Five rules version from the published public payload and keeps scores server owned.

## 2. Main function

`syncProgression` (`progression-feed.ts:12`) selects finalized attempts not yet projected, hashes the private pack for the variant identity, records v1 or v2 results, and then projects eligible human or substituted Hunt participants with role and match kind metadata.
