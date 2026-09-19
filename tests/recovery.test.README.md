# Database recovery tests

## Purpose and sections

`tests/recovery.test.ts` verifies that an unreviewed result survives an app/database restart, that continuation is authorized and idempotent without skipping another result, that schema v1 progress migrates to schema v2, and that a newer unsupported schema is rejected without downgrade.

## Test callbacks

- Saved-result continuation and restart test — `tests/recovery.test.ts:11`.
- Schema v1-to-v2 migration test — `tests/recovery.test.ts:91`.
- Newer-schema rejection test — `tests/recovery.test.ts:129`.
