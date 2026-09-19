# Daily Five persistence

## 1. Purpose

`server/db/daily-five.ts` adds the Daily Five tables beside the legacy database. It stores immutable public/private case packs, official and practice attempts, per-attempt assignments, clue unlocks, idempotent commands, tickets, and review acknowledgments.

## 2. Code sections

The migration is additive and idempotent. The engine wraps reads and writes in the existing `transaction` helper so a state version, ticket, review, and command response are committed together.

## 3. Functions

`initializeDailyFiveDatabase` (`server/db/daily-five.ts:55`) and `migrateDailyFiveDatabase` (`:125`) create the schema. Publication and attempt reads/writes are `readDailyFiveDay` (`:128`), `publishDailyFiveDay` (`:137`), `readDailyFiveAttempt` (`:159`), `readOfficialDailyFiveAttempt` (`:173`), `readDailyFiveStartCommand` (`:188`), `insertDailyFiveStartCommand` (`:203`), `insertDailyFiveAttempt` (`:223`), and `updateDailyFiveAttempt` (`:244`).

Command and result persistence is handled by `readDailyFiveCommand` (`:260`), `insertDailyFiveCommand` (`:274`), `readDailyFiveTickets` (`:292`), `insertDailyFiveTicket` (`:301`), `acknowledgeDailyFiveRound` (`:309`), `readDailyFiveClues` (`:320`), `insertDailyFiveClue` (`:334`), and `completedDailyFiveResults` (`:351`).
