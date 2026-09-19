# Daily Five reset script

## 1. Purpose

`scripts/reset-daily-five.ts` clears local Daily Five attempts so developers can replay the current immutable case pack. It does not add a restart control to the browser game.

## 2. Control flow

The script loads the local environment, refuses `NODE_ENV=production`, opens `DATABASE_PATH` or `./data/whale-arena.sqlite`, calls `resetDailyFiveState` (`server/db/daily-five.ts:145`), prints row counts, and closes SQLite. Run it with `npm run reset:daily-five` from `whale-arena/`, then refresh the browser.

## 3. Scope

The reset removes Daily Five attempts, dependent clues/tickets/commands/reviews, Daily Five progression results, Daily Five badges, and Daily Five shares. It preserves `daily_five_days`, sessions, the classic arena, and Whale Hunt data.
