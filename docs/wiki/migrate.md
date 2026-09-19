# `server/db/migrate.ts`

The migration script’s top-level flow (`server/db/migrate.ts:1-11`) loads `.env`, opens the configured database via `openDatabase` (`8`), initializes the additive daily challenge/entry/lease/source tables via `initializeDailyDatabase` (`9`), closes it (`10`), and prints schema v2 (`11`). Schema creation and the v1-to-v2 `round_reviews` backfill are idempotent; daily HTTP routes are active, while the one-shot worker runs only when invoked by cron/systemd/a hosted scheduler.
