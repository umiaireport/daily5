# Progression database

## 1. Purpose

`progression.ts` stores additive Daily Five, Hunt, badge, and share records. Daily rows accept both `daily-five-v1` and `daily-five-v2` rules versions.

## 2. Migration

`migrateDailyRulesConstraint` (`progression.ts:58`) detects a prior v1 only SQLite check constraint, drops and recreates only the derived indexes, copies every row into the widened table, and restores the indexes. It does not clear attempts or rewrite result payloads. `initializeProgressionDatabase` (`progression.ts:100`) runs this startup repair before recreating indexes.
