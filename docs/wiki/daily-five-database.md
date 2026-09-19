# Daily Five database

## 1. Schema

`initializeDailyFiveDatabase` (`server/db/daily-five.ts:55`) creates additive `daily_five_days`, `daily_five_attempts`, `daily_five_clues`, `daily_five_tickets`, `daily_five_commands`, `daily_five_start_commands`, and `daily_five_reviews` tables. `migrateDailyFiveDatabase` (`:125`) is the startup migration alias. `resetDailyFiveState` (`server/db/daily-five.ts:152`) is used only by the development reset script; it deletes attempts and Daily Five projections while preserving published case packs and unrelated game data.

The partial unique index on `(daily_id, player_id)` for official attempts enforces one official attempt per cookie/session identity while practice attempts remain available. Primary keys on commands, clues, and tickets make repeated writes idempotent or reject changed duplicates.

## 2. Persistence functions

Case packs use `readDailyFiveDay` (`:128`) and `publishDailyFiveDay` (`:137`). Attempts use `readDailyFiveAttempt` (`:159`), `readOfficialDailyFiveAttempt` (`:173`), `insertDailyFiveAttempt` (`:223`), and `updateDailyFiveAttempt` (`:244`). Command responses use `readDailyFiveCommand` (`:260`) and `insertDailyFiveCommand` (`:274`), while start idempotency uses `readDailyFiveStartCommand` (`:188`) and `insertDailyFiveStartCommand` (`:203`). Ticket, review, clue, and leaderboard reads/writes are documented at `:292`, `:301`, `:309`, `:320`, `:334`, and `:351`.
