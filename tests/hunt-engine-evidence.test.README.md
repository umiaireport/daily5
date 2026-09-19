# Hunt engine evidence tests

## 1. Purpose

`tests/hunt-engine-evidence.test.ts` verifies that historical and simulated events remain reproducible, simulated actions leave the board unchanged, scans use the stored event record, and missing baselines stay unavailable.

## 2. Tests

The event-record test starts at line `24`. Deterministic scan and unavailable-baseline coverage starts at line `45`.
