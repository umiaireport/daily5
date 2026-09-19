# Game domain service

## Purpose and sections

`server/domain/game.ts` is the server-owned game boundary. It creates/resumes sessions, exposes only the current public scenario, atomically spends clue unlocks, locks immutable choices, stores results, keeps an unreviewed result current after reload/restart, and computes the completed-session leaderboard.

## Functions and methods

- `GameError` — `server/domain/game.ts:15`: controlled domain error with an HTTP status.
- `Game.createSession` — `server/domain/game.ts:43`.
- `Game.choices` — `server/domain/game.ts:52`: reads a session’s stored choices.
- `Game.session` — `server/domain/game.ts:60`: returns progress and compounded equity.
- `Game.scenario` — `server/domain/game.ts:77`: resolves a configured scenario or throws 404.
- `Game.assertCurrent` — `server/domain/game.ts:83`: enforces sequential round play and review completion.
- `Game.round` — `server/domain/game.ts:92`: shapes public round state and unlocked clues.
- `Game.next` — `server/domain/game.ts:124`: returns an unreviewed locked round before advancing.
- `Game.advance` — `server/domain/game.ts:141`: records review and advances transactionally.
- `Game.unlock` — `server/domain/game.ts:153`: transactionally enforces the two-clue budget.
- `Game.choose` — `server/domain/game.ts:173`: validates/locks weights and persists a deterministic result.
- `Game.result` — `server/domain/game.ts:231`: reveals a stored result only after choice lock.
- `Game.leaderboard` — `server/domain/game.ts:239`.
