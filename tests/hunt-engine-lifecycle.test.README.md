# Hunt engine lifecycle tests

## 1. Purpose

`tests/hunt-engine-lifecycle.test.ts` exercises persisted room setup, role-filtered views, idempotent commands, stale versions, all five rounds, final scoring, restart recovery, full reconstruction, and missed-deadline voiding.

## 2. Tests

The complete one-versus-one lifecycle starts at line `31`. Deadline handling starts at line `166`.
