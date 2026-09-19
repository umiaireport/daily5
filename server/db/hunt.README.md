# Hunt database modules

## 1. Purpose

`server/db/hunt.ts` remains the v1 persistence boundary. `server/db/hunt-v2.ts` is the additive persistence boundary for the redesigned single-zone match.

## 2. Hunt v2 functions

- `initializeHuntV2Database` creates v2 match and command tables.
- `readHuntV2Match`, `insertHuntV2Match`, and `updateHuntV2Match` persist phase, deadline, serialized boards, and scores.
- `readActiveHuntV2Matches` supplies the scheduler with unfinished matches.
- `readHuntV2Command` and `insertHuntV2Command` make retries return the original response.

All helpers use `DatabaseSync` and are initialized by `server/db/store.ts`.
