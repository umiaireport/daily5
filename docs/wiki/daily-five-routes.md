# Daily Five routes

## 1. Registration

`registerDailyFiveRoutes` (`server/routes/daily-five.ts:84`) is mounted by the coordinator with a `DailyFiveEngine` and the existing session identity resolver. The module does not edit `server/app.ts`.

## 2. Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/daily-five/today` | Public rules and pre-decision challenge evidence |
| POST | `/api/daily-five/:id/attempts` | Start an official or practice attempt |
| GET | `/api/daily-five/attempts/:id` | Resume the caller’s attempt |
| POST | `/api/daily-five/attempts/:id/clues` | Unlock one clue |
| POST | `/api/daily-five/attempts/:id/tickets` | Lock one trade or cash ticket |
| POST | `/api/daily-five/attempts/:id/continue` | Acknowledge the saved result and advance |
| GET | `/api/daily-five/:id/leaderboard` | Read completed official raw equity by cohort |

`params` (`server/routes/daily-five.ts:48`), `sendError` (`:52`), `identity` (`:67`), and `safely` (`:75`) keep validation and error serialization at the route boundary.
